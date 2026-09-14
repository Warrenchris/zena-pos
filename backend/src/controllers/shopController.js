const {
  sequelize,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  SystemSettings,
  User,
  Employee
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

    // 2. Additive Quota Check: verify branch quota (maxShops)
    const currentActiveShopCount = await Shop.count({
      where: { organizationId: orgId, active: true }
    });

    const quotaResult = await entitlementService.checkQuota(orgId, 'maxShops', currentActiveShopCount);
    if (!quotaResult.allowed) {
      const { plan } = await entitlementService.getOrganizationEntitlements(orgId);
      return sendUpgradePrompt(res, {
        type: 'quota',
        key: 'maxShops',
        current: currentActiveShopCount,
        limit: quotaResult.limit,
        currentPlan: plan,
        requiredPlan: 'growth',
        reason: quotaResult.reason
      });
    }

    // 3. Atomic MySQL transaction
    const result = await sequelize.transaction(async (t) => {
      // Step A: Insert Shop
      const newShop = await Shop.create({
        name: req.body.name.trim(),
        address: req.body.address ? req.body.address.trim() : null,
        phone: req.body.phone ? req.body.phone.trim() : null,
        kraPin: req.body.kraPin ? req.body.kraPin.trim() : null,
        registrationNumber: req.body.registrationNumber ? req.body.registrationNumber.trim() : null,
        organizationId: orgId,
        active: true
      }, { transaction: t });

      // Step B: Conditional ShopAccess insert (admin creator only; owner bypasses by design)
      let access = null;
      if (membership.orgRole === 'admin') {
        access = await ShopAccess.create({
          membershipId: membership.id,
          shopId: newShop.id,
          isDefault: false
        }, { transaction: t });
      }

      // Step C: Bootstrap SystemSettings
      let orgCurrency = 'KES';
      try {
        const org = await Organization.findByPk(orgId, { attributes: ['currency'], transaction: t });
        if (org && org.currency) {
          orgCurrency = org.currency;
        }
      } catch (_) {}

      const defaultSettings = SystemSettings.getDefaultSettings ? SystemSettings.getDefaultSettings() : {};
      await SystemSettings.create({
        ...defaultSettings,
        shopId: newShop.id,
        defaultCurrency: orgCurrency || 'KES',
        timezone: defaultSettings.timezone || 'Africa/Nairobi'
      }, { transaction: t });

      // Step D: Activity Logging scoped to newShop.id
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
