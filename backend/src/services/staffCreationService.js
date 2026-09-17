'use strict';

const { sequelize, User, Employee, Shop, Organization, OrganizationMembership, ShopAccess } = require('../models');
const entitlementService = require('./entitlementService');
const { sendUpgradePrompt } = require('../utils/upgradePrompt');
const { logActivity } = require('../middleware/logger');

function isValidEmail(email) {
  return /.+@.+\..+/.test(String(email || '').toLowerCase());
}

/**
 * Authoritative staff creation service.
 * Enforces:
 * 1. Authenticated organization context
 * 2. Actor authorization (owner / admin with branch access)
 * 3. Branch / shop tenant verification (no cross-tenant assignment)
 * 4. Case-insensitive unique email handling across User and Employee
 * 5. Concurrency-safe maxUsers quota enforcement with row lock
 * 6. Transactional integrity: Employee + OrganizationMembership + ShopAccess
 */
async function createStaffMember({ actor, body = {}, reqOrgId = null }) {
  if (!actor) {
    const err = new Error('Authentication required.');
    err.statusCode = 401;
    throw err;
  }

  // 1. Resolve Organization Context
  let orgId = reqOrgId
    ? parseInt(reqOrgId, 10)
    : (actor.organizationId ? parseInt(actor.organizationId, 10) : null);

  if (!orgId && (actor.shopId)) {
    const callerShop = await Shop.findByPk(actor.shopId, { attributes: ['organizationId'] });
    orgId = callerShop?.organizationId || null;
  }

  if (!orgId) {
    const err = new Error('Organization context required.');
    err.statusCode = 403;
    err.code = 'ORGANIZATION_ACCESS_DENIED';
    throw err;
  }

  // 2. Validate and normalize inputs
  const rawEmail = body.email;
  const normalizedEmail = String(rawEmail || '').trim().toLowerCase();
  if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
    const err = new Error('Valid email is required');
    err.statusCode = 400;
    throw err;
  }

  if (!body.password || String(body.password).length < 6) {
    const err = new Error('Password must be at least 6 characters long');
    err.statusCode = 400;
    throw err;
  }

  let firstName = body.firstName ? String(body.firstName).trim() : '';
  let lastName = body.lastName ? String(body.lastName).trim() : '';
  if (!firstName && body.name) {
    const parts = String(body.name).trim().split(/\s+/);
    firstName = parts[0] || 'Staff';
    lastName = parts.slice(1).join(' ') || parts[0] || 'Staff';
  }
  if (!firstName) {
    const err = new Error('First name or name is required');
    err.statusCode = 400;
    throw err;
  }
  if (!lastName) {
    lastName = firstName;
  }

  const position = String(body.position || body.role || 'cashier').trim();
  const status = body.status === 'inactive' ? 'inactive' : 'active';
  const salary = body.salary != null && !isNaN(Number(body.salary)) ? Number(body.salary) : 0;
  const hireDate = body.hireDate ? new Date(body.hireDate) : new Date();

  // 3. Validate Target Branch (shopId)
  const requestedShopId = body.shopId != null && body.shopId !== '' ? parseInt(body.shopId, 10) : null;
  const targetShopId = requestedShopId || actor.shopId;

  if (!targetShopId) {
    const err = new Error('Shop context required.');
    err.statusCode = 400;
    err.code = 'SHOP_REQUIRED';
    throw err;
  }

  const targetShop = await Shop.findOne({
    where: { id: targetShopId, organizationId: orgId, active: true }
  });

  if (!targetShop) {
    const err = new Error('Shop access denied: target branch does not exist or does not belong to your organization.');
    err.statusCode = 403;
    err.code = 'SHOP_ACCESS_DENIED';
    throw err;
  }

  // 4. Verify Actor Administrative Authorization for this Shop
  const callerMembershipWhere = {
    organizationId: orgId,
    status: 'active',
    ...(actor.isEmployee ? { employeeId: actor.id } : { userId: actor.id })
  };
  const callerMembership = await OrganizationMembership.findOne({ where: callerMembershipWhere });

  if (callerMembership) {
    if (callerMembership.orgRole === 'admin') {
      const hasAccess = (targetShopId === actor.shopId) || await ShopAccess.findOne({
        where: { membershipId: callerMembership.id, shopId: targetShopId }
      });
      if (!hasAccess) {
        const err = new Error('Shop access denied: you do not have permission to administer this branch.');
        err.statusCode = 403;
        err.code = 'SHOP_ACCESS_DENIED';
        throw err;
      }
    } else if (callerMembership.orgRole !== 'owner') {
      const err = new Error('Access denied: only organization owners and admins can create staff.');
      err.statusCode = 403;
      err.code = 'ORGANIZATION_ACCESS_DENIED';
      throw err;
    }
  }

  // 5. Case-insensitive duplicate email check across User and Employee
  const existingUser = await User.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), normalizedEmail)
  });
  const existingEmployee = await Employee.findOne({
    where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), normalizedEmail)
  });

  if (existingUser || existingEmployee) {
    const err = new Error('Email already exists');
    err.statusCode = 400;
    err.code = 'DUPLICATE_EMAIL';
    throw err;
  }

  // 6. Concurrency-Safe Atomic Transaction with Organization Row Lock
  return await sequelize.transaction(async (t) => {
    // Acquire exclusive row-level lock on the organization to serialize quota checks for this tenant
    const org = await Organization.findByPk(orgId, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });

    if (!org) {
      const err = new Error('Organization not found.');
      err.statusCode = 404;
      err.code = 'ORGANIZATION_NOT_FOUND';
      throw err;
    }

    if (org.status === 'suspended') {
      const { plan } = await entitlementService.getOrganizationEntitlements(orgId);
      const err = new Error('Subscription is suspended. Expanding resources is locked.');
      err.statusCode = 403;
      err.code = 'SUBSCRIPTION_SUSPENDED';
      err.isUpgradePrompt = true;
      err.promptData = {
        type: 'quota',
        key: 'maxUsers',
        current: 0,
        limit: plan?.maxUsers ?? 0,
        currentPlan: plan,
        requiredPlan: 'growth',
        reason: 'Subscription is suspended. Expanding resources is locked.',
        code: 'SUBSCRIPTION_SUSPENDED'
      };
      throw err;
    }

    if (org.status !== 'active') {
      const err = new Error('Organization is inactive.');
      err.statusCode = 403;
      err.code = 'ORGANIZATION_INACTIVE';
      throw err;
    }

    // Count active seats (active memberships + any unlinked active employees in org's shops)
    const activeMemberships = await OrganizationMembership.findAll({
      where: { organizationId: orgId, status: 'active' },
      attributes: ['userId', 'employeeId'],
      transaction: t
    });

    const memberEmployeeIds = new Set(
      activeMemberships.filter(m => m.employeeId).map(m => m.employeeId)
    );

    const orgShops = await Shop.findAll({
      where: { organizationId: orgId },
      attributes: ['id'],
      transaction: t
    });
    const shopIds = orgShops.map(s => s.id);

    let unlinkedEmployeeCount = 0;
    if (shopIds.length > 0) {
      const activeEmployees = await Employee.findAll({
        where: {
          shopId: shopIds,
          status: 'active'
        },
        attributes: ['id'],
        transaction: t
      });
      unlinkedEmployeeCount = activeEmployees.filter(e => !memberEmployeeIds.has(e.id)).length;
    }

    const currentActiveMemberCount = activeMemberships.length + unlinkedEmployeeCount;

    // Check user quota
    const quotaResult = await entitlementService.checkQuota(orgId, 'maxUsers', currentActiveMemberCount);
    if (!quotaResult.allowed) {
      const { plan } = await entitlementService.getOrganizationEntitlements(orgId);
      const isSuspended = quotaResult.reason && quotaResult.reason.toLowerCase().includes('suspended');
      const err = new Error(quotaResult.reason || `Plan limit of ${quotaResult.limit} reached for maxUsers. Upgrade required.`);
      err.statusCode = 403;
      err.isUpgradePrompt = true;
      err.promptData = {
        type: 'quota',
        key: 'maxUsers',
        current: currentActiveMemberCount,
        limit: quotaResult.limit,
        currentPlan: plan,
        requiredPlan: 'growth',
        reason: quotaResult.reason,
        code: isSuspended ? 'SUBSCRIPTION_SUSPENDED' : 'QUOTA_EXCEEDED'
      };
      throw err;
    }

    // Step A: Insert Employee record
    const employee = await Employee.create({
      firstName,
      lastName,
      email: normalizedEmail,
      password: body.password,
      position,
      phone: body.phone || null,
      salary,
      hireDate,
      status,
      shopId: targetShopId
    }, { transaction: t });

    // Step B: Insert OrganizationMembership record
    const posLower = position.toLowerCase();
    const newOrgRole = (posLower === 'admin' || body.role === 'admin') ? 'admin' : 'member';

    const membership = await OrganizationMembership.create({
      organizationId: orgId,
      employeeId: employee.id,
      orgRole: newOrgRole,
      status: status === 'active' ? 'active' : 'suspended'
    }, { transaction: t });

    // Step C: Insert ShopAccess record
    const access = await ShopAccess.create({
      membershipId: membership.id,
      shopId: targetShopId,
      isDefault: true
    }, { transaction: t });

    // Step D: Log activity if actor row exists
    try {
      let validActorId = null;
      if (actor.isEmployee) {
        const empActor = await Employee.findByPk(actor.id, { attributes: ['id'], transaction: t });
        validActorId = empActor ? actor.id : null;
      } else if (actor.id) {
        const userActor = await User.findByPk(actor.id, { attributes: ['id'], transaction: t });
        validActorId = userActor ? actor.id : null;
      }
      if (validActorId) {
        await logActivity({
          shopId: targetShopId,
          performedBy: validActorId,
          performedByType: actor.isEmployee ? 'employee' : 'user',
          action: 'STAFF_CREATED',
          entity: 'Employee',
          entityId: employee.id,
          details: `Staff member "${firstName} ${lastName}" (${normalizedEmail}) created in shop ${targetShopId}`
        }, t);
      }
    } catch (_) {}

    return { employee, membership, access, targetShop };
  });
}

module.exports = {
  createStaffMember,
  isValidEmail
};
