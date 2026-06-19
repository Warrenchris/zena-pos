const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Employee = require('../models/Employee');

// Load private key for signing from environment variables
// Note: The old key pair has been compromised. All existing tokens signed with the old key are now invalid. Users will need to log in again.
const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const Shop = require('../models/Shop');
const logger = require('../utils/logger');

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, role, shop } = req.body;

    const userExists = await User.findOne({ where: { email } });
    if (userExists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create the shop if provided; first user is admin by default
    let createdShop = null;
    if (shop?.name) {
      createdShop = await Shop.create({
        name: shop.name,
        address: shop.address || null,
        phone: shop.phone || null,
      });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role || 'admin',
      shopId: createdShop?.id,
    });

    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role,
        shopId: createdShop?.id,
        isEmployee: false
      },
      privateKey,
      { 
        algorithm: 'RS256',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
      }
    );

    res.status(201).json({
      user: {
        ...user.toJSON(),
        shop: createdShop
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // First try to find a user
    let user = await User.findOne({ where: { email }, include: [{ model: Shop, attributes: ['id', 'name'] }] });
    let isEmployee = false;
    
    // If no user found, try to find an employee
    if (!user) {
      const employee = await Employee.findOne({ where: { email }, include: [{ model: Shop, attributes: ['id', 'name'] }] });
      if (employee) {
        const isValidPassword = await employee.validatePassword(password);
        if (isValidPassword && employee.status === 'active') {
          isEmployee = true;
          user = {
            id: employee.id,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            role: 'employee',
            shopId: employee.shopId,
            Shop: employee.Shop,
            isEmployee: true
          };
        }
      }
    }

    // If neither user nor valid employee found
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // For regular users, validate password and status
    if (!isEmployee) {
      const isValidPassword = await user.validatePassword(password);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.active) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }
    }

      try {
        const token = jwt.sign(
          { 
            id: user.id, 
            role: user.role, 
            shopId: user.shopId,
            isEmployee: !!user.isEmployee
          },
          privateKey,
          { 
            algorithm: 'RS256',
            expiresIn: process.env.JWT_EXPIRES_IN || '24h'
          }
        );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        shopId: user.shopId,
        shop: user.Shop ? { id: user.Shop.id, name: user.Shop.name } : null,
      },
      token
    });
      } catch (error) {
        logger.error('JWT signing error:', error);
        return res.status(500).json({ error: 'Authentication service error' });
      }
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
};

// Request password reset - in dev we simply log the token
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Hide user existence
      return res.json({ message: 'If the email exists, a reset link has been sent.' });
    }
    // Create a short-lived token (in real life email it)
    const token = jwt.sign(
      { id: user.id },
      privateKey,
      { 
        algorithm: 'RS256',
        expiresIn: '15m'
      }
    );
    logger.info('Password reset token (dev only):', token);
    return res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// Reset password using token
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const decoded = jwt.verify(token, privateKey, { algorithms: ['RS256'] });
    const user = await User.findByPk(decoded.id);
    if (!user) return res.status(400).json({ error: 'Invalid token' });
    user.password = password;
    await user.save();
    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const { id: userId, isEmployee } = req.user;

    if (isEmployee) {
      // If token belongs to an employee, fetch from Employee model
      const employee = await Employee.findByPk(userId, {
        attributes: { exclude: ['password'] },
        include: [{ model: Shop, attributes: ['id', 'name', 'address', 'phone'] }]
      });

      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      // Normalize response similar to User and match frontend shape { user, shop }
      const userProfile = {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        role: 'employee',
        shopId: employee.shopId,
      };

      const shop = employee.Shop ? { id: employee.Shop.id, name: employee.Shop.name, address: employee.Shop.address, phone: employee.Shop.phone } : null;

      return res.json({ user: userProfile, shop });
    }

    // Regular user
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: Shop, attributes: ['id', 'name', 'address', 'phone'] }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Normalize user response to match frontend expected shape { user, shop }
    const userProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      shopId: user.shopId,
    };

    const shop = user.Shop ? { id: user.Shop.id, name: user.Shop.name, address: user.Shop.address, phone: user.Shop.phone } : null;

    res.json({ user: userProfile, shop });
  } catch (error) {
    logger.error('Error in getProfile:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
