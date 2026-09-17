const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Employee = require('../models/Employee');
const emailService = require('../services/emailService');

// Helper to retrieve private key dynamically
const getPrivateKey = () => (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const Shop = require('../models/Shop');
const { sequelize, Organization, OrganizationMembership, ShopAccess, Subscription, Plan } = require('../models');
const logger = require('../utils/logger');

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, password, shop } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    const userExists = await User.findOne({ where: { email: normalizedEmail } });
    const empExists = await Employee.findOne({ where: { email: normalizedEmail } });
    if (userExists || empExists) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Atomic transaction: Organization, Shop, User, OrganizationMembership, and Subscription
    const { user, createdShop } = await sequelize.transaction(async (t) => {
      let createdOrg = null;
      let newShop = null;

      if (shop?.name) {
        const cleanName = (shop.name || 'org')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'org';
        const slug = `${cleanName}-${Date.now()}`;

        createdOrg = await Organization.create({
          name: shop.name,
          slug,
          status: 'trialing',
          currency: 'KES'
        }, { transaction: t });

        newShop = await Shop.create({
          name: shop.name,
          address: shop.address || null,
          phone: shop.phone || null,
          organizationId: createdOrg.id
        }, { transaction: t });
      }

      // AUT-01: Initial self-registered tenant creator is authoritatively 'admin'
      const createdUser = await User.create({
        name,
        email: normalizedEmail,
        password,
        role: 'admin',
        shopId: newShop?.id,
      }, { transaction: t });

      if (createdOrg) {
        await OrganizationMembership.create({
          organizationId: createdOrg.id,
          userId: createdUser.id,
          orgRole: 'owner',
          status: 'active'
        }, { transaction: t });

        // Phase 6c: Provision 14-day trial on Growth plan
        const growthPlan = await Plan.findOne({
          where: { code: 'growth' },
          transaction: t
        });

        if (growthPlan) {
          const now = new Date();
          const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

          await Subscription.create({
            organizationId: createdOrg.id,
            planId: growthPlan.id,
            status: 'trialing',
            billingCycle: 'monthly',
            currentPeriodStart: now,
            currentPeriodEnd: trialEndsAt,
            trialEndsAt: trialEndsAt,
            cancelAtPeriodEnd: false
          }, { transaction: t });
        }
      }

      return { user: createdUser, createdShop: newShop };
    });

    const token = jwt.sign(
      { 
        id: user.id, 
        role: user.role, 
        shopId: createdShop?.id,
        organizationId: createdShop?.organizationId || null,
        isEmployee: false
      },
      getPrivateKey(),
      { 
        algorithm: 'RS256',
        expiresIn: process.env.JWT_EXPIRES_IN || '2h'
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
    logger.error('Registration error:', error);
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
    let user = await User.findOne({ where: { email }, include: [{ model: Shop, attributes: ['id', 'name', 'organizationId'] }] });
    let isEmployee = false;
    
    // If no user found, try to find an employee
    if (!user) {
      const employee = await Employee.findOne({ where: { email }, include: [{ model: Shop, attributes: ['id', 'name', 'organizationId'] }] });
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
            organizationId: user.Shop?.organizationId || null,
            isEmployee: !!user.isEmployee
          },
          getPrivateKey(),
          { 
            algorithm: 'RS256',
            expiresIn: process.env.JWT_EXPIRES_IN || '2h'
          }
        );

    let orgRole = null;
    let subscriptionStatus = null;
    const orgId = user.Shop?.organizationId;
    const membershipWhere = {
      status: 'active',
      ...(isEmployee ? { employeeId: user.id } : { userId: user.id })
    };
    if (orgId) {
      membershipWhere.organizationId = orgId;
    }
    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    orgRole = membership?.orgRole || (isEmployee ? 'member' : null);

    // Resolve authoritative subscription status if organization exists
    if (orgId) {
      try {
        const entitlementService = require('../services/entitlementService');
        const entitlements = await entitlementService.getOrganizationEntitlements(orgId);
        if (entitlements?.subscription) {
          subscriptionStatus = entitlementService.getEffectiveSubscriptionStatus(entitlements.subscription);
          if (subscriptionStatus === 'suspended' || subscriptionStatus === 'canceled') {
            // Block non-owner/non-admin employees from operational login
            if (orgRole !== 'owner' && user.role !== 'admin') {
              return res.status(403).json({
                error: 'Organization subscription is suspended. Contact the organization owner for renewal.',
                code: 'ORGANIZATION_SUSPENDED',
                isSuspended: true
              });
            }
          }
        }
      } catch (subErr) {
        logger.warn('Failed to evaluate subscription status on login:', subErr.message);
      }
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgRole,
        shopId: user.shopId,
        shop: user.Shop ? { id: user.Shop.id, name: user.Shop.name } : null,
        subscriptionStatus
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
    // Create a short-lived token
    const token = jwt.sign(
      { id: user.id },
      getPrivateKey(),
      { 
        algorithm: 'RS256',
        expiresIn: '15m'
      }
    );

    const resetBaseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${resetBaseUrl}/reset-password?token=${token}`;

    try {
      await emailService.sendPasswordReset({ to: user.email, resetUrl });
    } catch (emailError) {
      // Never leak whether the email actually sent; log server-side only, and never log the token itself.
      logger.error('Failed to send password reset email:', emailError.message);
    }

    return res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// Reset password using token
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    const decoded = jwt.verify(token, getPrivateKey(), { algorithms: ['RS256'] });
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
        include: [{ model: Shop, attributes: ['id', 'name', 'address', 'phone', 'organizationId'] }]
      });

      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const empOrgId = req.organizationId || req.user.organizationId || employee.Shop?.organizationId;
      const empMembershipWhere = { employeeId: employee.id, status: 'active' };
      if (empOrgId) {
        empMembershipWhere.organizationId = empOrgId;
      }
      const empMembership = await OrganizationMembership.findOne({ where: empMembershipWhere });
      const empOrgRole = empMembership?.orgRole || 'member';

      // Normalize response similar to User and match frontend shape { user, shop }
      const userProfile = {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        role: 'employee',
        orgRole: empOrgRole,
        shopId: employee.shopId,
      };

      const shop = employee.Shop ? { id: employee.Shop.id, name: employee.Shop.name, address: employee.Shop.address, phone: employee.Shop.phone } : null;

      return res.json({ user: userProfile, shop });
    }

    // Regular user
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password'] },
      include: [{ model: Shop, attributes: ['id', 'name', 'address', 'phone', 'organizationId'] }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const orgId = req.organizationId || req.user.organizationId || user.Shop?.organizationId;
    const membershipWhere = { userId: user.id, status: 'active' };
    if (orgId) {
      membershipWhere.organizationId = orgId;
    }
    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    const orgRole = membership?.orgRole || null;

    // Normalize user response to match frontend expected shape { user, shop }
    const userProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      orgRole,
      shopId: user.shopId,
    };

    const shop = user.Shop ? { id: user.Shop.id, name: user.Shop.name, address: user.Shop.address, phone: user.Shop.phone } : null;

    res.json({ user: userProfile, shop });
  } catch (error) {
    logger.error('Error in getProfile:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Authenticated user/employee change password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const { id: userId, isEmployee } = req.user;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'Current password, new password, and confirmation are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    let account = null;
    if (isEmployee) {
      account = await Employee.findByPk(userId);
    } else {
      account = await User.findByPk(userId);
    }

    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    // Verify current password
    const isValid = await account.validatePassword(currentPassword);
    if (!isValid) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    // Set new password (beforeUpdate hook will hash it)
    account.password = newPassword;
    await account.save();

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    logger.error('Error in changePassword:', error);
    return res.status(500).json({ error: 'Failed to change password.', details: error.message });
  }
};

exports.switchShop = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: errors.array()[0]?.msg });
    }

    const targetShopId = parseInt(req.body.shopId, 10);
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // 1. Fetch target Shop by shopId, confirm shop.organizationId === req.organizationId
    // Reject 404 if not found or organizationId mismatch (do not confirm existence of shop to unauthorized org)
    const shop = await Shop.findOne({
      where: {
        id: targetShopId,
        active: true
      }
    });

    if (!shop || shop.organizationId !== orgId) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // 2. Fetch caller's OrganizationMembership for req.organizationId
    const membershipWhere = {
      organizationId: orgId,
      status: 'active'
    };
    if (req.user.isEmployee) {
      membershipWhere.employeeId = req.user.id;
    } else {
      membershipWhere.userId = req.user.id;
    }

    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!membership) {
      return res.status(403).json({ error: 'Active organization membership required.' });
    }

    // 3. Authorization:
    // IF membership.orgRole === 'owner': authorized, skip ShopAccess check entirely.
    // ELSE: query ShopAccess for (membershipId, shopId) — must find an active row, else 403.
    if (membership.orgRole === 'owner') {
      // Authorized by design — universal implicit access, zero ShopAccess check, zero DB writes
    } else {
      const access = await ShopAccess.findOne({
        where: {
          membershipId: membership.id,
          shopId: targetShopId
        }
      });
      if (!access) {
        return res.status(403).json({ error: 'Access denied to target shop' });
      }
    }

    // ZERO DATABASE WRITES — hard design invariant (no create, update, delete)

    // 4. Mint new RS256 JWT with the same claim shape as login
    const token = jwt.sign(
      {
        id: req.user.id,
        role: req.user.role,
        shopId: targetShopId,
        organizationId: orgId,
        isEmployee: !!req.user.isEmployee
      },
      getPrivateKey(),
      {
        algorithm: 'RS256',
        expiresIn: process.env.JWT_EXPIRES_IN || '2h'
      }
    );

    // Fetch user/employee info to match login response structure
    let userData = null;
    if (req.user.isEmployee) {
      const emp = await Employee.findByPk(req.user.id);
      if (emp) {
        userData = {
          id: emp.id,
          name: `${emp.firstName} ${emp.lastName}`,
          email: emp.email,
          role: req.user.role || 'employee',
          orgRole: null,
          shopId: targetShopId,
          organizationId: orgId
        };
      }
    } else {
      const u = await User.findByPk(req.user.id);
      if (u) {
        userData = {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          orgRole: membership.orgRole || null,
          shopId: targetShopId,
          organizationId: orgId
        };
      }
    }

    if (!userData) {
      userData = {
        id: req.user.id,
        role: req.user.role,
        orgRole: req.user.isEmployee ? null : (membership?.orgRole || null),
        shopId: targetShopId,
        organizationId: orgId
      };
    }

    return res.status(200).json({
      message: 'Switched active shop successfully',
      token,
      user: userData,
      shop: {
        id: shop.id,
        name: shop.name,
        address: shop.address,
        phone: shop.phone
      }
    });
  } catch (error) {
    logger.error('switchShop error:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};

