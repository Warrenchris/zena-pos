const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
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
      shopId: createdShop?.id || null,
    });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      user,
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

    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET is not configured');
      return res.status(500).json({ error: 'Authentication service not configured properly' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
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
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    logger.info('Password reset token (dev only):', token);
    return res.json({ message: 'Reset instructions sent', token });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// Reset password using token
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
    const userId = req.user.id;
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: Shop, attributes: ['id', 'name', 'address', 'phone'] }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Error in getProfile:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
