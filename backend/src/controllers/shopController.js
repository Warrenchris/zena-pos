'use strict';

const {
  sequelize,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  SystemSettings,
  User,
  Employee,
  Subscription,
  Plan
} = require('../models');
const { logActivity } = require('../middleware/logger');
const { validationResult } = require('express-validator');
const entitlementService = require('../services/entitlementService');
const { sendUpgradePrompt } = require('../utils/upgradePrompt');

exports.getMine = async (req, res) => {
  const shop = await Shop.findByPk(req.user.shopId);
  res.json(shop);
};

exports.updateMine = async (req, res) => {
  const shop = await Shop.findByPk(req.user.shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  const { name, address, phone, active } = req.body;
  if (name !== undefined) shop.name = name;
  if (address !== undefined) shop.address = address;
  if (phone !== undefined) shop.phone = phone;
  if (active !== undefined) shop.active = active;
  await shop.save();
  res.json(shop);
};

/**
 * Concurrency-Safe Atomic Branch Creation (P0-03)
 * Follows the transactional row-lock strategy proven in staffCreationService.js.
 */
exports.createShop = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array(), error: errors.array()[0]?.msg });
    }

    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // 1. Verify caller has orgRole IN ('owner', 'admin') in req.organizationId
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
    if (!membership || !['owner', 'admin'].includes(membership.orgRole)) {
      return res.status(403).json({ error: 'Only organization owners and admins can create shops.' });
    }

    // 2. Concurrency-Safe Atomic Transaction with Organization Row Lock (P0-03)
    const result = await sequelize.transaction(async (t) => {
      // Step A: Acquire exclusive row-level lock on the organization to serialize concurrent creations
      const org = await Organization.findByPk(orgId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (!org) {
        const err = new Error('Organization not found.');
        err.statusCode = 404;
        throw err;
      }

      if (org.status === 'suspended') {
        const err = new Error('Subscription is suspended. Expanding resources is locked.');
        err.statusCode = 403;
        err.code = 'SUBSCRIPTION_SUSPENDED';
        throw err;
      }

      if (!['active', 'trialing'].includes(org.status)) {
        const err = new Error('Organization is inactive.');
        err.statusCode = 403;
        err.code = 'ORGANIZATION_INACTIVE';
        throw err;
      }

      // Step B: Reload authoritative subscription & plan inside transaction
      const subscription = await Subscription.findOne({
        where: { organizationId: orgId },
        include: [{ model: Plan, required: true }],
        transaction: t
      });

      if (!subscription || !subscription.Plan) {
        const err = new Error('Active subscription required to create branches.');
        err.statusCode = 403;
        err.code = 'SUBSCRIPTION_REQUIRED';
        throw err;
      }

      const effectiveStatus = entitlementService.getEffectiveSubscriptionStatus(subscription);
      if (effectiveStatus === 'suspended' || effectiveStatus === 'canceled') {
        const err = new Error('Subscription is suspended or canceled. Expanding resources is locked.');
        err.statusCode = 403;
        err.code = 'SUBSCRIPTION_SUSPENDED';
        throw err;
      }

      const plan = subscription.Plan;
      const maxShops = plan.maxShops ?? 1;

      // Step C: Count active branches under row lock
      const currentActiveShopCount = await Shop.count({
        where: { organizationId: orgId, active: true },
        transaction: t
      });

      if (maxShops !== -1 && currentActiveShopCount >= maxShops) {
        const err = new Error(`Branch limit reached. Your plan allows up to ${maxShops} branches.`);
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        err.isUpgradePrompt = true;
        err.promptData = {
          type: 'quota',
          key: 'maxShops',
          current: currentActiveShopCount,
          limit: maxShops,
          currentPlan: plan.toJSON(),
          requiredPlan: 'growth',
          reason: `Branch limit reached (${currentActiveShopCount}/${maxShops}). Upgrade to add more branches.`,
          code: 'QUOTA_EXCEEDED'
        };
        throw err;
      }

      // Step D: Insert Shop
      const newShop = await Shop.create({
        name: req.body.name.trim(),
        address: req.body.address ? req.body.address.trim() : null,
        phone: req.body.phone ? req.body.phone.trim() : null,
        kraPin: req.body.kraPin ? req.body.kraPin.trim() : null,
        registrationNumber: req.body.registrationNumber ? req.body.registrationNumber.trim() : null,
        organizationId: orgId,
        active: true
      }, { transaction: t });

      // Step E: Conditional ShopAccess insert (admin creator only; owner bypasses by design)
      let access = null;
      if (membership.orgRole === 'admin') {
        access = await ShopAccess.create({
          membershipId: membership.id,
          shopId: newShop.id,
          isDefault: false
        }, { transaction: t });
      }

      // Step F: Bootstrap SystemSettings
      let orgCurrency = 'KES';
      if (org.currency) {
        orgCurrency = org.currency;
      }

      const defaultSettings = SystemSettings.getDefaultSettings ? SystemSettings.getDefaultSettings() : {};
      await SystemSettings.create({
        ...defaultSettings,
        shopId: newShop.id,
        defaultCurrency: orgCurrency || 'KES',
        timezone: defaultSettings.timezone || 'Africa/Nairobi'
      }, { transaction: t });

      // Step G: Activity Logging scoped to newShop.id
      await logActivity({
        shopId: newShop.id,
        performedBy: req.user.id,
        performedByType: req.user.isEmployee ? 'employee' : 'user',
        action: 'SHOP_CREATED',
        entity: 'Shop',
        entityId: newShop.id,
        details: `Shop "${newShop.name}" created under organization ${orgId}`
      }, t);

      return { newShop, access };
    });

    // Invalidate Redis entitlement cache after commit
    await entitlementService.invalidateOrgEntitlements(orgId);

    return res.status(201).json({
      message: 'Shop created successfully',
      shop: result.newShop,
      access: result.access ? {
        id: result.access.id,
        membershipId: result.access.membershipId,
        shopId: result.access.shopId,
        isDefault: result.access.isDefault
      } : null
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
    return res.status(500).json({ error: 'Failed to create shop', details: error.message });
  }
};

exports.getAccessibleShops = async (req, res) => {
  try {
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

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

    let defaultShopId = null;
    if (req.user.isEmployee) {
      const emp = await Employee.findByPk(req.user.id, { attributes: ['shopId'] });
      defaultShopId = emp?.shopId;
    } else {
      const u = await User.findByPk(req.user.id, { attributes: ['shopId'] });
      defaultShopId = u?.shopId;
    }

    let shopsList = [];
    if (membership.orgRole === 'owner') {
      const orgShops = await Shop.findAll({
        where: {
          organizationId: orgId,
          active: true
        },
        order: [['id', 'ASC']]
      });

      shopsList = orgShops.map(s => ({
        id: s.id,
        name: s.name,
        isDefault: s.id === defaultShopId,
        isCurrent: s.id === req.shopId
      }));
    } else {
      const accesses = await ShopAccess.findAll({
        where: {
          membershipId: membership.id
        },
        include: [{
          model: Shop,
          where: {
            organizationId: orgId,
            active: true
          }
        }],
        order: [[Shop, 'id', 'ASC']]
      });

      shopsList = accesses.map(a => ({
        id: a.Shop.id,
        name: a.Shop.name,
        isDefault: !!a.isDefault || a.Shop.id === defaultShopId,
        isCurrent: a.Shop.id === req.shopId
      }));
    }

    return res.json({
      currentShopId: req.shopId,
      organizationId: orgId,
      shops: shopsList
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch accessible shops', details: error.message });
  }
};

/**
 * Reversible Shop Deactivation (P2-04)
 * PATCH /api/shops/:id/deactivate
 */
exports.deactivateShop = async (req, res) => {
  try {
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Owner authorization
    const membershipWhere = {
      organizationId: orgId,
      status: 'active',
      ...(req.user.isEmployee ? { employeeId: req.user.id } : { userId: req.user.id })
    };
    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!membership || membership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Only organization owners can deactivate branches.' });
    }

    const shopId = parseInt(req.params.id, 10);
    const shop = await Shop.findOne({ where: { id: shopId, organizationId: orgId } });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found in this organization.' });
    }

    if (!shop.active) {
      return res.status(400).json({ error: 'Shop is already deactivated.' });
    }

    // Sole active branch protection
    const activeCount = await Shop.count({ where: { organizationId: orgId, active: true } });
    if (activeCount <= 1) {
      return res.status(400).json({ error: 'Cannot deactivate the sole active branch of the organization.' });
    }

    shop.active = false;
    await shop.save();

    await logActivity({
      shopId: shop.id,
      performedBy: req.user.id,
      performedByType: req.user.isEmployee ? 'employee' : 'user',
      action: 'SHOP_DEACTIVATED',
      entity: 'Shop',
      entityId: shop.id,
      details: `Shop "${shop.name}" (ID: ${shop.id}) was deactivated.`
    });

    await entitlementService.invalidateOrgEntitlements(orgId);

    return res.json({
      message: 'Shop deactivated successfully',
      shop
    });
  } catch (error) {
    console.error('Error deactivating shop:', error);
    return res.status(500).json({ error: 'Failed to deactivate shop', details: error.message });
  }
};

/**
 * Reversible Shop Activation (P2-04)
 * PATCH /api/shops/:id/activate
 */
exports.activateShop = async (req, res) => {
  try {
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Owner authorization
    const membershipWhere = {
      organizationId: orgId,
      status: 'active',
      ...(req.user.isEmployee ? { employeeId: req.user.id } : { userId: req.user.id })
    };
    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!membership || membership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Only organization owners can activate branches.' });
    }

    const shopId = parseInt(req.params.id, 10);

    const updatedShop = await sequelize.transaction(async (t) => {
      // Row lock organization to serialize quota validation
      const org = await Organization.findByPk(orgId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!org) {
        const err = new Error('Organization not found.');
        err.statusCode = 404;
        throw err;
      }

      const shop = await Shop.findOne({ where: { id: shopId, organizationId: orgId }, transaction: t });
      if (!shop) {
        const err = new Error('Shop not found in this organization.');
        err.statusCode = 404;
        throw err;
      }

      if (shop.active) {
        const err = new Error('Shop is already active.');
        err.statusCode = 400;
        throw err;
      }

      // Check maxShops quota
      const subscription = await Subscription.findOne({
        where: { organizationId: orgId },
        include: [{ model: Plan, required: true }],
        transaction: t
      });

      const maxShops = subscription?.Plan?.maxShops ?? 1;
      const currentActiveCount = await Shop.count({ where: { organizationId: orgId, active: true }, transaction: t });

      if (maxShops !== -1 && currentActiveCount >= maxShops) {
        const err = new Error(`Branch limit reached. Your plan allows up to ${maxShops} active branches.`);
        err.statusCode = 403;
        err.code = 'QUOTA_EXCEEDED';
        throw err;
      }

      shop.active = true;
      await shop.save({ transaction: t });

      await logActivity({
        shopId: shop.id,
        performedBy: req.user.id,
        performedByType: req.user.isEmployee ? 'employee' : 'user',
        action: 'SHOP_ACTIVATED',
        entity: 'Shop',
        entityId: shop.id,
        details: `Shop "${shop.name}" (ID: ${shop.id}) was activated.`
      }, t);

      return shop;
    });

    await entitlementService.invalidateOrgEntitlements(orgId);

    return res.json({
      message: 'Shop activated successfully',
      shop: updatedShop
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    console.error('Error activating shop:', error);
    return res.status(500).json({ error: 'Failed to activate shop', details: error.message });
  }
};

/**
 * Shop Access Administration (P1-03)
 * GET /api/shops/:id/access
 */
exports.getShopAccess = async (req, res) => {
  try {
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const shopId = parseInt(req.params.id, 10);
    const shop = await Shop.findOne({ where: { id: shopId, organizationId: orgId } });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found in this organization.' });
    }

    const accesses = await ShopAccess.findAll({
      where: { shopId },
      include: [{
        model: OrganizationMembership,
        where: { organizationId: orgId },
        include: [
          { model: User, attributes: ['id', 'name', 'email', 'role'] },
          { model: Employee, attributes: ['id', 'firstName', 'lastName', 'email', 'position'] }
        ]
      }]
    });

    return res.json({
      shopId: shop.id,
      shopName: shop.name,
      accesses: accesses.map(a => ({
        id: a.id,
        membershipId: a.membershipId,
        isDefault: a.isDefault,
        orgRole: a.OrganizationMembership?.orgRole,
        status: a.OrganizationMembership?.status,
        user: a.OrganizationMembership?.User || null,
        employee: a.OrganizationMembership?.Employee || null
      }))
    });
  } catch (error) {
    console.error('Error fetching shop access:', error);
    return res.status(500).json({ error: 'Failed to fetch shop access', details: error.message });
  }
};

/**
 * Grant Shop Access (P1-03)
 * POST /api/shops/:id/access
 */
exports.grantShopAccess = async (req, res) => {
  try {
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Owner authorization
    const callerMembership = await OrganizationMembership.findOne({
      where: {
        organizationId: orgId,
        status: 'active',
        ...(req.user.isEmployee ? { employeeId: req.user.id } : { userId: req.user.id })
      }
    });
    if (!callerMembership || callerMembership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Only organization owners can manage branch access.' });
    }

    const shopId = parseInt(req.params.id, 10);
    const shop = await Shop.findOne({ where: { id: shopId, organizationId: orgId } });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found in this organization.' });
    }

    const { membershipId, isDefault = false } = req.body;
    if (!membershipId) {
      return res.status(400).json({ error: 'membershipId is required' });
    }

    // Target membership must belong to the same organization
    const targetMembership = await OrganizationMembership.findOne({
      where: { id: membershipId, organizationId: orgId }
    });
    if (!targetMembership) {
      return res.status(404).json({ error: 'Membership not found in this organization.' });
    }

    if (targetMembership.orgRole === 'owner') {
      return res.status(400).json({ error: 'Owners retain implicit access to all branches and cannot be explicitly assigned.' });
    }

    // Prevent duplicate access row
    const existing = await ShopAccess.findOne({
      where: { membershipId: targetMembership.id, shopId: shop.id }
    });
    if (existing) {
      return res.status(400).json({ error: 'User already has access to this branch.' });
    }

    const access = await sequelize.transaction(async (t) => {
      if (isDefault) {
        await ShopAccess.update(
          { isDefault: false },
          { where: { membershipId: targetMembership.id }, transaction: t }
        );
      }

      return await ShopAccess.create({
        membershipId: targetMembership.id,
        shopId: shop.id,
        isDefault: Boolean(isDefault)
      }, { transaction: t });
    });

    return res.status(201).json({
      message: 'Branch access granted successfully',
      access
    });
  } catch (error) {
    console.error('Error granting shop access:', error);
    return res.status(500).json({ error: 'Failed to grant shop access', details: error.message });
  }
};

/**
 * Revoke Shop Access (P1-03)
 * DELETE /api/shops/:id/access/:membershipId
 */
exports.revokeShopAccess = async (req, res) => {
  try {
    const orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Owner authorization
    const callerMembership = await OrganizationMembership.findOne({
      where: {
        organizationId: orgId,
        status: 'active',
        ...(req.user.isEmployee ? { employeeId: req.user.id } : { userId: req.user.id })
      }
    });
    if (!callerMembership || callerMembership.orgRole !== 'owner') {
      return res.status(403).json({ error: 'Only organization owners can revoke branch access.' });
    }

    const shopId = parseInt(req.params.id, 10);
    const membershipId = req.params.membershipId;

    const shop = await Shop.findOne({ where: { id: shopId, organizationId: orgId } });
    if (!shop) {
      return res.status(404).json({ error: 'Shop not found in this organization.' });
    }

    const targetMembership = await OrganizationMembership.findOne({
      where: { id: membershipId, organizationId: orgId }
    });
    if (!targetMembership) {
      return res.status(404).json({ error: 'Membership not found in this organization.' });
    }

    if (targetMembership.orgRole === 'owner') {
      return res.status(400).json({ error: 'Cannot revoke owner access.' });
    }

    const deleted = await ShopAccess.destroy({
      where: { shopId: shop.id, membershipId: targetMembership.id }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Shop access not found.' });
    }

    return res.json({ message: 'Shop access revoked successfully' });
  } catch (error) {
    console.error('Error revoking shop access:', error);
    return res.status(500).json({ error: 'Failed to revoke shop access', details: error.message });
  }
};
