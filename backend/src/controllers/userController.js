'use strict';

const { validationResult } = require('express-validator');
const { User, Employee, OrganizationMembership, sequelize } = require('../models');
const staffCreationService = require('../services/staffCreationService');
const { sendUpgradePrompt } = require('../utils/upgradePrompt');
const tokenRevocationService = require('../services/tokenRevocationService');

/**
 * Legacy userController.
 * Wrapped around authoritative staffCreationService to ensure that legacy
 * POST /api/users cannot bypass maxUsers quota, organization context,
 * membership creation, or branch authorization.
 */
exports.list = async (req, res) => {
  try {
    const where = { shopId: req.user.shopId };
    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'active', 'shopId']
    });
    const employees = await Employee.findAll({
      where,
      attributes: ['id', 'firstName', 'lastName', 'email', 'position', 'status', 'shopId']
    });

    const userList = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      shopId: u.shopId
    }));

    const empList = employees.map(e => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      email: e.email,
      role: e.position,
      active: e.status === 'active',
      shopId: e.shopId
    }));

    res.json([...userList, ...empList]);
  } catch (err) {
    console.error('Error in userController.list:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
};

exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { employee } = await staffCreationService.createStaffMember({
      actor: req.user,
      body: {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: req.body.role,
        position: req.body.role,
        shopId: req.body.shopId || req.user.shopId
      },
      reqOrgId: req.organizationId
    });

    // Return backwards-compatible User shape
    return res.status(201).json({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      role: req.body.role || 'cashier',
      active: employee.status === 'active',
      shopId: employee.shopId,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt
    });
  } catch (error) {
    if (error.isUpgradePrompt && error.promptData) {
      return sendUpgradePrompt(res, error.promptData);
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {})
      });
    }
    console.error('Error in userController.create:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already exists', code: 'DUPLICATE_EMAIL' });
    }
    return res.status(500).json({ error: 'Failed to create user' });
  }
};

exports.updateRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { role, active } = req.body;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

    if (isUuid) {
      const emp = await Employee.findOne({
        where: { id, shopId: req.user.shopId },
        transaction
      });
      if (!emp) {
        await transaction.rollback();
        return res.status(404).json({ error: 'User not found' });
      }

      if (role) emp.position = role;
      if (active !== undefined) emp.status = active ? 'active' : 'inactive';
      await emp.save({ transaction });

      // Synchronize OrganizationMembership
      if (active !== undefined) {
        const membershipStatus = active ? 'active' : 'suspended';
        const membership = await OrganizationMembership.findOne({
          where: { employeeId: emp.id },
          transaction
        });
        if (membership) {
          membership.status = membershipStatus;
          await membership.save({ transaction });
        }
      }

      await transaction.commit();

      if (active !== undefined) {
        await tokenRevocationService.setUserStatus(emp.id, true, active ? 'active' : 'inactive');
      }

      return res.json({
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        email: emp.email,
        role: emp.position,
        active: emp.status === 'active',
        shopId: emp.shopId
      });
    }

    const user = await User.findOne({
      where: { id, shopId: req.user.shopId },
      transaction
    });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    if (role) user.role = role;
    if (active !== undefined) user.active = active;
    await user.save({ transaction });

    // Synchronize OrganizationMembership
    if (active !== undefined) {
      const membershipStatus = active ? 'active' : 'suspended';
      const membership = await OrganizationMembership.findOne({
        where: { userId: user.id },
        transaction
      });
      if (membership) {
        membership.status = membershipStatus;
        await membership.save({ transaction });
      }
    }

    await transaction.commit();

    if (active !== undefined) {
      await tokenRevocationService.setUserStatus(user.id, false, active ? 'active' : 'inactive');
    }

    res.json(user);
  } catch (err) {
    await transaction.rollback();
    console.error('Error in userController.updateRole:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};
