const {
  Organization,
  Subscription,
  Plan,
  sequelize
} = require('../src/models');
const entitlementService = require('../src/services/entitlementService');
const redisClient = require('../src/config/redis');

describe('Entitlement Service (Sub-Phase 6a)', () => {
  let grandfatheredOrg;
  let starterOrg;
  let zeroSubOrg;
  let suspendedOrg;
  let starterPlan;
  let grandfatheredPlan;

  beforeAll(async () => {
    // Lookup seeded plans
    grandfatheredPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });

    // Create test organizations
    grandfatheredOrg = await Organization.create({
      name: 'Test Grandfathered Org',
      slug: `test-gf-${Date.now()}`,
      status: 'active'
    });

    starterOrg = await Organization.create({
      name: 'Test Starter Org',
      slug: `test-starter-${Date.now()}`,
      status: 'active'
    });

    zeroSubOrg = await Organization.create({
      name: 'Test Zero Sub Org',
      slug: `test-zerosub-${Date.now()}`,
      status: 'active'
    });

    suspendedOrg = await Organization.create({
      name: 'Test Suspended Org',
      slug: `test-suspended-${Date.now()}`,
      status: 'suspended'
    });

    // Subscriptions
    await Subscription.create({
      organizationId: grandfatheredOrg.id,
      planId: grandfatheredPlan.id,
      status: 'active',
      billingCycle: 'yearly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      trialEndsAt: null
    });

    await Subscription.create({
      organizationId: starterOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      trialEndsAt: null
    });

    await Subscription.create({
      organizationId: suspendedOrg.id,
      planId: starterPlan.id,
      status: 'suspended',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      trialEndsAt: null
    });
  });

  afterAll(async () => {
    if (grandfatheredOrg) {
      await Subscription.destroy({ where: { organizationId: grandfatheredOrg.id } });
      await Organization.destroy({ where: { id: grandfatheredOrg.id } });
      await entitlementService.invalidateOrgEntitlements(grandfatheredOrg.id);
    }
    if (starterOrg) {
      await Subscription.destroy({ where: { organizationId: starterOrg.id } });
      await Organization.destroy({ where: { id: starterOrg.id } });
      await entitlementService.invalidateOrgEntitlements(starterOrg.id);
    }
    if (zeroSubOrg) {
      await Organization.destroy({ where: { id: zeroSubOrg.id } });
      await entitlementService.invalidateOrgEntitlements(zeroSubOrg.id);
    }
    if (suspendedOrg) {
      await Subscription.destroy({ where: { organizationId: suspendedOrg.id } });
      await Organization.destroy({ where: { id: suspendedOrg.id } });
      await entitlementService.invalidateOrgEntitlements(suspendedOrg.id);
    }
  });

  describe('canUseFeature', () => {
    it('should grant access to all features for grandfathered organization', async () => {
      const res = await entitlementService.canUseFeature(grandfatheredOrg.id, 'org_insights');
      expect(res.allowed).toBe(true);
      expect(Boolean(res)).toBe(true);

      const multiShopRes = await entitlementService.canUseFeature(grandfatheredOrg.id, 'multi_shop');
      expect(multiShopRes.allowed).toBe(true);

      const apiAccessRes = await entitlementService.canUseFeature(grandfatheredOrg.id, 'api_access');
      expect(apiAccessRes.allowed).toBe(true);
    });

    it('should deny ungranted features for starter plan organization', async () => {
      const res = await entitlementService.canUseFeature(starterOrg.id, 'org_insights');
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/requires a higher plan tier/i);
    });

    it('should DEFAULT-DENY when organization has zero subscription row', async () => {
      const res = await entitlementService.canUseFeature(zeroSubOrg.id, 'org_insights');
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/no active subscription/i);
    });

    it('should deny features when subscription is suspended', async () => {
      const res = await entitlementService.canUseFeature(suspendedOrg.id, 'org_insights');
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/suspended/i);
    });
  });

  describe('checkQuota', () => {
    it('should allow unlimited shops and users for grandfathered organization (limit: -1)', async () => {
      const shopQuota = await entitlementService.checkQuota(grandfatheredOrg.id, 'maxShops', 100);
      expect(shopQuota.allowed).toBe(true);
      expect(shopQuota.limit).toBe(-1);

      const userQuota = await entitlementService.checkQuota(grandfatheredOrg.id, 'maxUsers', 500);
      expect(userQuota.allowed).toBe(true);
      expect(userQuota.limit).toBe(-1);
    });

    it('should correctly enforce quotas on starter plan organization (maxShops: 1, maxUsers: 2)', async () => {
      const shopOk = await entitlementService.checkQuota(starterOrg.id, 'maxShops', 0);
      expect(shopOk.allowed).toBe(true);
      expect(shopOk.limit).toBe(1);

      const shopExceeded = await entitlementService.checkQuota(starterOrg.id, 'maxShops', 1);
      expect(shopExceeded.allowed).toBe(false);
      expect(shopExceeded.limit).toBe(1);
      expect(shopExceeded.reason).toMatch(/limit of 1 reached for maxShops/i);

      const userOk = await entitlementService.checkQuota(starterOrg.id, 'maxUsers', 1);
      expect(userOk.allowed).toBe(true);
      expect(userOk.limit).toBe(2);

      const userExceeded = await entitlementService.checkQuota(starterOrg.id, 'maxUsers', 2);
      expect(userExceeded.allowed).toBe(false);
      expect(userExceeded.limit).toBe(2);
      expect(userExceeded.reason).toMatch(/limit of 2 reached for maxUsers/i);
    });

    it('should DEFAULT-DENY quota checks when organization has zero subscription row', async () => {
      const res = await entitlementService.checkQuota(zeroSubOrg.id, 'maxShops', 1);
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/no active subscription/i);
    });

    it('should deny resource expansion when subscription is suspended', async () => {
      const res = await entitlementService.checkQuota(suspendedOrg.id, 'maxShops', 0);
      expect(res.allowed).toBe(false);
      expect(res.reason).toMatch(/suspended/i);
    });
  });

  describe('caching and invalidation', () => {
    it('should cache entitlements in Redis and invalidate correctly', async () => {
      const cacheKey = `cache:entitlements:org:${starterOrg.id}`;
      await entitlementService.invalidateOrgEntitlements(starterOrg.id);

      const beforeCall = await redisClient.get(cacheKey);
      expect(beforeCall).toBeNull();

      // Call to populate cache
      await entitlementService.canUseFeature(starterOrg.id, 'org_insights');

      const afterCall = await redisClient.get(cacheKey);
      expect(afterCall).not.toBeNull();
      const parsed = JSON.parse(afterCall);
      expect(parsed.plan.code).toBe('starter');

      // Invalidate
      await entitlementService.invalidateOrgEntitlements(starterOrg.id);
      const afterInvalidate = await redisClient.get(cacheKey);
      expect(afterInvalidate).toBeNull();
    });
  });
});
