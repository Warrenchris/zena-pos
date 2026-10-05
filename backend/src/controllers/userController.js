'use strict';

const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const { User, Employee, Shop, OrganizationMembership, sequelize } = require('../models');
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
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const targetShopId = req.query.shopId
      ? parseInt(req.query.shopId, 10)
      : (req.shopId || req.authz?.scope?.activeShopId || req.user?.shopId);

    if (!targetShopId) {
      return res.status(400).json({ error: 'Shop context required.' });
    }

    const targetShop = await Shop.findOne({
      where: { id: targetShopId, organizationId: orgId }
    });
    if (!targetShop) {
      return res.status(404).json({ error: 'Shop not found in this organization.' });
    }

    if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(targetShopId)) {
      return res.status(403).json({ error: 'Access denied to this branch.' });
    }

    const where = { shopId: targetShopId };
    const users = await User.findAll({
      where: {
        ...where,
        role: { [Op.ne]: 'super_admin' }
      },
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

async function getRequesterOrgRole(req, transaction = null) {
  if (req.authz?.tenant?.orgRole) return req.authz.tenant.orgRole;
  if (req.user?.orgRole) return req.user.orgRole;
  const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
  const where = {
    ...(orgId ? { organizationId: orgId } : {}),
    ...(req.user?.isEmployee ? { employeeId: req.user.id } : { userId: req.user?.id })
  };
  const membership = await OrganizationMembership.findOne({
    where,
    ...(transaction ? { transaction } : {})
  });
  const orgRole = membership?.orgRole || null;
  if (req.user) req.user.orgRole = orgRole;
  return orgRole;
}

exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
  if (!orgId) {
    return res.status(403).json({ error: 'Organization context required.' });
  }

  const requestedRole = String(req.body.role || '').trim().toLowerCase();
  const isOwnerCaller = Boolean(req.authz?.tenant?.isOwner || (req.user && req.user.role === 'admin' && !req.user.isEmployee));
  if (requestedRole === 'admin' && !isOwnerCaller) {
    return res.status(403).json({ error: 'Only the organization owner can create admin accounts.' });
  }

  try {
    const { employee } = await staffCreationService.createStaffMember({
      actor: {
        ...req.user,
        organizationId: orgId,
        shopId: req.authz?.scope?.activeShopId || req.user.shopId
      },
      body: {
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: req.body.role,
        position: req.body.role,
        shopId: req.body.shopId || req.authz?.scope?.activeShopId || req.user.shopId
      },
      reqOrgId: orgId
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
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const { id } = req.params;
    const { role, active, orgRole } = req.body;
    const requesterOrgRole = await getRequesterOrgRole(req, transaction);
    const isOwnerCaller = Boolean(req.authz?.tenant?.isOwner || requesterOrgRole === 'owner');
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

    // Self-modification guard
    const callerId = req.authz?.identity?.id || req.user?.id;
    const callerIsEmployee = Boolean(req.authz?.identity?.isEmployee !== undefined ? req.authz.identity.isEmployee : req.user?.isEmployee);
    if (String(callerId) === String(id) && callerIsEmployee === isUuid) {
      if (role || active !== undefined || orgRole) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Access denied: users cannot modify their own privileges or status.' });
      }
    }

    if (isUuid) {
      const emp = await Employee.findByPk(id, { transaction });
      if (!emp) {
        await transaction.rollback();
        return res.status(404).json({ error: 'User not found' });
      }

      const empShop = await Shop.findOne({
        where: { id: emp.shopId, organizationId: orgId },
        transaction
      });
      if (!empShop) {
        await transaction.rollback();
        return res.status(404).json({ error: 'User not found' });
      }

      if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(emp.shopId)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Access denied: you do not have access to this branch.' });
      }

      const membership = await OrganizationMembership.findOne({
        where: { employeeId: emp.id, organizationId: orgId },
        transaction
      });

      if (membership?.orgRole === 'owner' && !isOwnerCaller) {
        await transaction.rollback();
        return res.status(403).json({ error: "Cannot modify the organization owner's account." });
      }

      // Elevating to admin/owner requires owner caller
      const isElevating = (role && String(role).toLowerCase() === 'admin') || (orgRole === 'admin') || (orgRole === 'owner');
      if (isElevating && !isOwnerCaller) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Access denied: only organization owners can grant administrator privileges.' });
      }

      const roleChanged = Boolean(role && role !== emp.position);
      const activeChanged = Boolean(active !== undefined && (emp.status === 'active') !== Boolean(active));
      const orgRoleChanged = Boolean(orgRole && membership && membership.orgRole !== orgRole);

      if (role) emp.position = role;
      if (active !== undefined) emp.status = active ? 'active' : 'inactive';
      await emp.save({ transaction });

      // Synchronize OrganizationMembership
      let membershipUpdated = false;
      if (membership) {
        if (active !== undefined) {
          membership.status = active ? 'active' : 'suspended';
          membershipUpdated = true;
        }
        if (orgRole) {
          membership.orgRole = orgRole;
          membershipUpdated = true;
        } else if (roleChanged) {
          membership.orgRole = staffCreationService.positionToOrgRole(role);
          membershipUpdated = true;
        }
        if (membershipUpdated) {
          await membership.save({ transaction });
        }
      }

      const authzChanged = roleChanged || activeChanged || orgRoleChanged;
      if (authzChanged) {
        await tokenRevocationService.incrementAuthzVersion(emp.id, true, transaction);
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

    const user = await User.findByPk(parseInt(id, 10), { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const userShop = await Shop.findOne({
      where: { id: user.shopId, organizationId: orgId },
      transaction
    });
    if (!userShop) {
      await transaction.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(user.shopId)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: you do not have access to this branch.' });
    }

    const membership = await OrganizationMembership.findOne({
      where: { userId: user.id, organizationId: orgId },
      transaction
    });

    if (membership?.orgRole === 'owner' && !isOwnerCaller) {
      await transaction.rollback();
      return res.status(403).json({ error: "Cannot modify the organization owner's account." });
    }

    const isElevating = (role && String(role).toLowerCase() === 'admin') || (orgRole === 'admin') || (orgRole === 'owner');
    if (isElevating && !isOwnerCaller) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: only organization owners can grant administrator privileges.' });
    }

    const roleChanged = Boolean(role && role !== user.role);
    const activeChanged = Boolean(active !== undefined && user.active !== Boolean(active));
    const orgRoleChanged = Boolean(orgRole && membership && membership.orgRole !== orgRole);

    if (role) user.role = role;
    if (active !== undefined) user.active = active;
    await user.save({ transaction });

    // Synchronize OrganizationMembership
    let membershipUpdated = false;
    if (membership) {
      if (active !== undefined) {
        membership.status = active ? 'active' : 'suspended';
        membershipUpdated = true;
      }
      if (orgRole) {
        membership.orgRole = orgRole;
        membershipUpdated = true;
      } else if (roleChanged) {
        if (role === 'admin' && membership.orgRole !== 'owner') {
          membership.orgRole = 'admin';
          membershipUpdated = true;
        } else if (role !== 'admin' && membership.orgRole !== 'owner') {
          membership.orgRole = 'member';
          membershipUpdated = true;
        }
      }
      if (membershipUpdated) {
        await membership.save({ transaction });
      }
    }

    const authzChanged = roleChanged || activeChanged || orgRoleChanged;
    if (authzChanged) {
      await tokenRevocationService.incrementAuthzVersion(user.id, false, transaction);
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
