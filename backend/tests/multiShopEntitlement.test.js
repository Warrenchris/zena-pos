'use strict';

const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const {
  User,
  Shop,
  Organization,
  OrganizationMembership,
  Subscription,
  Plan,
  ActivityLog,
  ShopAccess
} = require('../src/models');
const entitlementService = require('../src/services/entitlementService');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return jwt.sign(
    { ...payload, jti: `jti_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Phase 7D: Multi-Shop Entitlement Gate in shopController', () => {
  let starterPlan;
  let growthPlan;
  let grandfatheredPlan;

  let starterOrg;
  let starterShop1;
  let starterOwner;
  let starterToken;

  let growthOrg;
  let growthShop1;
  let growthOwner;
  let growthToken;

  beforeAll(async () => {
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });
    grandfatheredPlan = await Plan.findOne({ where: { code: 'grandfathered' } });

    const ts = Date.now();

    // 1. Setup Starter Tenant (1 shop limit, multi_shop: false)
    starterOrg = await Organization.create({
      name: `StarterMultiOrg_${ts}`,
      slug: `starter-multi-org-${ts}`,
      status: 'active'
    });
    starterShop1 = await Shop.create({
      organizationId: starterOrg.id,
      name: `Starter Shop Main ${ts}`,
      active: true
    });
    starterOwner = await User.create({
      name: 'Starter Owner',
      email: `starter_owner_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: starterShop1.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    await OrganizationMembership.create({
      organizationId: starterOrg.id,
      userId: starterOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    await Subscription.create({
      organizationId: starterOrg.id,
      planId: starterPlan.id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2035-12-31')
    });
    starterToken = generateToken({
      id: starterOwner.id,
      shopId: starterShop1.id,
      organizationId: starterOrg.id,
      role: 'admin',
      orgRole: 'owner'
    });

    // 2. Setup Growth Tenant (3 shops limit, multi_shop: true)
    growthOrg = await Organization.create({
      name: `GrowthMultiOrg_${ts}`,
      slug: `growth-multi-org-${ts}`,
      status: 'active'
    });
    growthShop1 = await Shop.create({
      organizationId: growthOrg.id,
      name: `Growth Shop Main ${ts}`,
      active: true
    });
    growthOwner = await User.create({
      name: 'Growth Owner',
      email: `growth_owner_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: growthShop1.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    await OrganizationMembership.create({
      organizationId: growthOrg.id,
      userId: growthOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    await Subscription.create({
      organizationId: growthOrg.id,
      planId: growthPlan.id,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2035-12-31')
    });
    growthToken = generateToken({
      id: growthOwner.id,
      shopId: growthShop1.id,
      organizationId: growthOrg.id,
      role: 'admin',
      orgRole: 'owner'
    });
  });

  afterAll(async () => {
    // Cleanup Starter
    if (starterOrg) {
      if (starterOwner) await ActivityLog.destroy({ where: { userId: starterOwner.id } });
      await ShopAccess.destroy({ where: {} });
      await OrganizationMembership.destroy({ where: { organizationId: starterOrg.id } });
      await Subscription.destroy({ where: { organizationId: starterOrg.id } });
      await Shop.destroy({ where: { organizationId: starterOrg.id } });
      await Organization.destroy({ where: { id: starterOrg.id } });
    }
    if (starterOwner) await User.destroy({ where: { id: starterOwner.id } });

    // Cleanup Growth
    if (growthOrg) {
      if (growthOwner) await ActivityLog.destroy({ where: { userId: growthOwner.id } });
      await ShopAccess.destroy({ where: {} });
      await OrganizationMembership.destroy({ where: { organizationId: growthOrg.id } });
      await Subscription.destroy({ where: { organizationId: growthOrg.id } });
      await Shop.destroy({ where: { organizationId: growthOrg.id } });
      await Organization.destroy({ where: { id: growthOrg.id } });
    }
    if (growthOwner) await User.destroy({ where: { id: growthOwner.id } });
  });

  describe('1. Single-Shop (Starter) Tenant Enforcement', () => {
    it('should reject branch creation for Starter plan with 403 and upgrade prompt when 1 shop already exists', async () => {
      const res = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${starterToken}`)
        .send({
          name: 'Starter Second Branch',
          address: 'Second Street',
          phone: '+254700000001'
        });

      expect(res.status).toBe(403);
      // Either FEATURE_LOCKED or QUOTA_EXCEEDED with upgrade required
      expect(res.body.upgradeRequired).toBe(true);
      expect(res.body.requiredPlan).toBe('growth');
      expect(JSON.stringify(res.body)).toMatch(/(multi_shop|maxShops)/i);

      // Verify no second branch was inserted
      const shops = await Shop.findAll({ where: { organizationId: starterOrg.id } });
      expect(shops.length).toBe(1);
    });
  });

  describe('2. Multi-Shop (Growth) Tenant Authorization', () => {
    it('should allow Growth plan tenant to create a second branch', async () => {
      const res = await request(app)
        .post('/api/shops')
        .set('Authorization', `Bearer ${growthToken}`)
        .send({
          name: 'Growth Branch 2',
          address: 'Westlands Mall',
          phone: '+254700000002'
        });

      expect(res.status).toBe(201);
      expect(res.body.shop).toBeDefined();
      expect(res.body.shop.name).toBe('Growth Branch 2');

      const shops = await Shop.findAll({ where: { organizationId: growthOrg.id } });
      expect(shops.length).toBe(2);
    });
  });

  describe('3. Grandfathered Tenant Multi-Shop Access', () => {
    it('should allow Grandfathered plan org to create multiple branches without restriction', async () => {
      const ts = Date.now();
      const gfOrg = await Organization.create({
        name: `GFMultiOrg_${ts}`,
        slug: `gf-multi-org-${ts}`,
        status: 'active'
      });
      const gfShop = await Shop.create({
        organizationId: gfOrg.id,
        name: `GF Main ${ts}`,
        active: true
      });
      const gfOwner = await User.create({
        name: 'GF Owner',
        email: `gf_owner_${ts}@example.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: gfShop.id,
        active: true,
        emailVerifiedAt: new Date()
      });
      await OrganizationMembership.create({
        organizationId: gfOrg.id,
        userId: gfOwner.id,
        orgRole: 'owner',
        status: 'active'
      });
      await Subscription.create({
        organizationId: gfOrg.id,
        planId: grandfatheredPlan.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31')
      });
      const gfToken = generateToken({
        id: gfOwner.id,
        shopId: gfShop.id,
        organizationId: gfOrg.id,
        role: 'admin',
        orgRole: 'owner'
      });

      try {
        const res = await request(app)
          .post('/api/shops')
          .set('Authorization', `Bearer ${gfToken}`)
          .send({
            name: `GF Second Branch ${ts}`,
            address: 'Mombasa Road'
          });

        expect(res.status).toBe(201);
        expect(res.body.shop).toBeDefined();
      } finally {
        await ActivityLog.destroy({ where: { userId: gfOwner.id } });
        await ShopAccess.destroy({ where: {} });
        await OrganizationMembership.destroy({ where: { organizationId: gfOrg.id } });
        await Subscription.destroy({ where: { organizationId: gfOrg.id } });
        await Shop.destroy({ where: { organizationId: gfOrg.id } });
        await Organization.destroy({ where: { id: gfOrg.id } });
        await User.destroy({ where: { id: gfOwner.id } });
      }
    });
  });

  describe('4. Downgraded Org Grandfather Handling', () => {
    it('should reject creating a 3rd branch for an org downgraded from Growth to Starter with 2 active shops', async () => {
      // Temporarily downgrade growthOrg to starterPlan
      await Subscription.update(
        { planId: starterPlan.id },
        { where: { organizationId: growthOrg.id } }
      );
      await entitlementService.invalidateOrgEntitlements(growthOrg.id);

      try {
        const res = await request(app)
          .post('/api/shops')
          .set('Authorization', `Bearer ${growthToken}`)
          .send({
            name: 'Growth Branch 3 (Forbidden After Downgrade)'
          });

        expect(res.status).toBe(403);
        expect(res.body.upgradeRequired).toBe(true);

        // Verify the 2 existing shops remain intact and unaffected
        const shops = await Shop.findAll({ where: { organizationId: growthOrg.id } });
        expect(shops.length).toBe(2);
      } finally {
        // Restore growthPlan
        await Subscription.update(
          { planId: growthPlan.id },
          { where: { organizationId: growthOrg.id } }
        );
        await entitlementService.invalidateOrgEntitlements(growthOrg.id);
      }
    });
  });
});
