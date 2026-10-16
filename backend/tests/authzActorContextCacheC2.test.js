'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const authzContextCacheService = require('../src/services/authzContextCacheService');
const authzContext = require('../src/middleware/authzContext');
const { purgeExpiredOrganizations } = require('../src/services/accountPurgeScheduler');
const { verifiedCache, ownerLookupCache } = require('../src/middleware/requireVerifiedEmail');
const { localFallbackStore } = require('../src/utils/distributedRateLimiter');
const permissionCache = require('../src/services/permissionCache');
const {
  User,
  Employee,
  Shop,
  ShopAccess,
  Organization,
  OrganizationMembership,
  Subscription,
  Plan
} = require('../src/models');

function signToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const jti = payload.jti || crypto.randomUUID();
  const iat = payload.iat || Math.floor(Date.now() / 1000);
  return 'Bearer ' + jwt.sign({ jti, iat, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Stage C2: Actor Context Cache & Epoch Invalidation (perf/actor-context-cache)', () => {
  let org;
  let orgB;
  let shop;
  let secondaryShop;
  let growthPlan;
  let ownerUser;
  let managerUser;
  let cashierUser;
  let superAdminUser;
  let ownerToken;
  let managerToken;
  let cashierToken;
  let superAdminToken;
  let employeeUser;
  let employeeMembership;
  let employeeToken;
  let managerMembership;
  let cashierMembership;

  const originalEnvCacheEnabled = process.env.AUTHZ_CONTEXT_CACHE_ENABLED;
  const originalEnvCacheTtl = process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS;

  async function resetRedisAndState() {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.flushdb();
    }
    for (const u of [ownerUser, managerUser, cashierUser, superAdminUser].filter(Boolean)) {
      await tokenRevocationService.clearAuthzVersion(u.id, false);
      await tokenRevocationService.clearUserStatus(u.id, false);
      await tokenRevocationService.clearUserTokenCutoff(u.id, false);
    }
    if (employeeUser) {
      await tokenRevocationService.clearAuthzVersion(employeeUser.id, true);
      await tokenRevocationService.clearUserStatus(employeeUser.id, true);
      await tokenRevocationService.clearUserTokenCutoff(employeeUser.id, true);
      await Employee.update({ position: 'cashier', authzVersion: 1, shopId: shop.id }, { where: { id: employeeUser.id }, validate: false });
    }
    if (managerUser) {
      await User.update({ role: 'manager', authzVersion: 1, shopId: shop.id }, { where: { id: managerUser.id }, validate: false });
    }
    if (cashierUser) {
      await User.update({ role: 'cashier', authzVersion: 1, shopId: shop.id }, { where: { id: cashierUser.id }, validate: false });
    }
    if (ownerUser) {
      await User.update({ role: 'admin', authzVersion: 1, shopId: shop.id }, { where: { id: ownerUser.id }, validate: false });
    }
    if (org) {
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del(`auth_status:org:${org.id}`);
      }
      if (permissionCache && typeof permissionCache.invalidateOrgPermissions === 'function') {
        await permissionCache.invalidateOrgPermissions(org.id);
      }
    }
    if (verifiedCache && typeof verifiedCache.clear === 'function') verifiedCache.clear();
    if (ownerLookupCache && typeof ownerLookupCache.clear === 'function') ownerLookupCache.clear();
    if (localFallbackStore && typeof localFallbackStore.clear === 'function') localFallbackStore.clear();
  }

  beforeAll(async () => {
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    [growthPlan] = await Plan.findOrCreate({
      where: { code: 'growth' },
      defaults: {
        name: 'Growth Plan',
        code: 'growth',
        priceMonthly: 5000,
        currency: 'KES',
        maxShops: 10,
        maxUsers: 50,
        features: { analytics: true, ai_insights: true, org_insights: true },
        isActive: true
      }
    });

    org = await Organization.create({
      name: `Stage C2 Org ${suffix}`,
      slug: `stage-c2-org-${suffix}`,
      status: 'active',
      currency: 'KES',
      planCode: growthPlan.code
    });

    orgB = await Organization.create({
      name: `Stage C2 Org B ${suffix}`,
      slug: `stage-c2-org-b-${suffix}`,
      status: 'active',
      currency: 'KES',
      planCode: growthPlan.code
    });

    await Subscription.create({
      organizationId: org.id,
      planId: growthPlan.id,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000)
    });

    shop = await Shop.create({
      name: `Stage C2 Shop ${suffix}`,
      organizationId: org.id,
      active: true
    });

    secondaryShop = await Shop.create({
      name: `Stage C2 Secondary Shop ${suffix}`,
      organizationId: org.id,
      active: true
    });

    ownerUser = await User.create({
      name: 'Stage C2 Owner',
      email: `owner_${suffix}@zenapos-c2.co.ke`,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    managerUser = await User.create({
      name: 'Stage C2 Manager',
      email: `manager_${suffix}@zenapos-c2.co.ke`,
      password: 'Password123!',
      role: 'manager',
      shopId: shop.id,
      organizationId: org.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    managerMembership = await OrganizationMembership.create({
      organizationId: org.id,
      userId: managerUser.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: managerMembership.id,
      shopId: shop.id,
      isDefault: true
    });

    cashierUser = await User.create({
      name: 'Stage C2 Cashier',
      email: `cashier_${suffix}@zenapos-c2.co.ke`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shop.id,
      organizationId: org.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    cashierMembership = await OrganizationMembership.create({
      organizationId: org.id,
      userId: cashierUser.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierMembership.id,
      shopId: shop.id,
      isDefault: true
    });

    superAdminUser = await User.create({
      name: 'Stage C2 SuperAdmin',
      email: `superadmin_${suffix}@zenapos-c2.co.ke`,
      password: 'Password123!',
      role: 'super_admin',
      shopId: null,
      organizationId: null,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    ownerToken = signToken({
      id: ownerUser.id,
      role: 'admin',
      orgRole: 'owner',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    managerToken = signToken({
      id: managerUser.id,
      role: 'manager',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    cashierToken = signToken({
      id: cashierUser.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    superAdminToken = signToken({
      id: superAdminUser.id,
      role: 'super_admin',
      isEmployee: false,
      authzVersion: 1
    });

    employeeUser = await Employee.create({
      shopId: shop.id,
      firstName: 'Stage C2',
      lastName: 'Employee',
      email: `employee_${suffix}@zenapos-c2.co.ke`,
      position: 'cashier',
      status: 'active',
      password: 'Password123!',
      salary: 25000,
      authzVersion: 1
    });

    employeeMembership = await OrganizationMembership.create({
      organizationId: org.id,
      employeeId: employeeUser.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: employeeMembership.id,
      shopId: shop.id,
      isDefault: true
    });

    employeeToken = signToken({
      id: employeeUser.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: true,
      authzVersion: 1
    });
  });

  afterAll(async () => {
    if (originalEnvCacheEnabled === undefined) {
      delete process.env.AUTHZ_CONTEXT_CACHE_ENABLED;
    } else {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = originalEnvCacheEnabled;
    }
    if (originalEnvCacheTtl === undefined) {
      delete process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS;
    } else {
      process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS = originalEnvCacheTtl;
    }
    await resetRedisAndState();
  });

  beforeEach(async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';
    process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS = '45';
    await resetRedisAndState();
  });

  test('a. warm request with cache ON: pre-handler SQL = 1 for owner, 0 for non-owner', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';

    // 1. Prime cache for owner
    const primeOwnerRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', ownerToken);
    expect(primeOwnerRes.status).toBe(200);

    // Warm request for owner
    const ownerWarmSql = [];
    sequelize.addHook('afterQuery', 'c2OwnerWarmSql', (options, query) => {
      const sql = (query && query.sql) || (options && options.sql);
      if (sql) ownerWarmSql.push(sql);
    });

    let ownerRes;
    try {
      ownerRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', ownerToken);
    } finally {
      sequelize.removeHook('afterQuery', 'c2OwnerWarmSql');
    }

    expect(ownerRes.status).toBe(200);

    // Pre-handler queries in authzContext for owner: User, Membership, Org are eliminated; only Shop.findAll runs
    const ownerPreHandlerSql = ownerWarmSql.filter(
      (sql) => sql.includes('FROM `Shops`') && !sql.includes('LEFT OUTER JOIN')
    );
    expect(ownerPreHandlerSql).toHaveLength(1);
    expect(ownerPreHandlerSql[0]).toContain('FROM `Shops`');

    // Confirm authzContext executed 0 User and 0 Org queries (they were served from cache)
    const ownerAuthzUserOrOrgSql = ownerWarmSql.filter(
      (sql) => (sql.includes('FROM `Users`') && !sql.includes('LEFT OUTER JOIN')) || sql.includes('FROM `Organizations`')
    );
    expect(ownerAuthzUserOrOrgSql).toHaveLength(0);

    // Total queries on warm owner profile = 3 (1 pre-handler Shop.findAll + 2 getProfile handler)
    expect(ownerWarmSql).toHaveLength(3);

    // 2. Prime cache for non-owner (manager)
    const primeManagerRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);
    expect(primeManagerRes.status).toBe(200);

    // Warm request for non-owner
    const managerWarmSql = [];
    sequelize.addHook('afterQuery', 'c2ManagerWarmSql', (options, query) => {
      const sql = (query && query.sql) || (options && options.sql);
      if (sql) managerWarmSql.push(sql);
    });

    let managerRes;
    try {
      managerRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', managerToken);
    } finally {
      sequelize.removeHook('afterQuery', 'c2ManagerWarmSql');
    }

    expect(managerRes.status).toBe(200);

    // Pre-handler queries in authzContext for non-owner: all 4 are eliminated (0 SQL)
    const managerPreHandlerSql = managerWarmSql.filter(
      (sql) =>
        (sql.includes('FROM `Shops`') && !sql.includes('LEFT OUTER JOIN')) ||
        (sql.includes('FROM `Users`') && !sql.includes('LEFT OUTER JOIN')) ||
        sql.includes('FROM `Organizations`')
    );
    expect(managerPreHandlerSql).toHaveLength(0);

    // Total queries on warm manager profile = 2 (0 pre-handler + 2 getProfile handler)
    expect(managerWarmSql).toHaveLength(2);
  });

  test('b. role change via the real endpoint, next request => 401 AUTHZ_VERSION_STALE immediately; new token resolves downgraded role', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';

    // Warm up manager cache
    const warmup = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);
    expect(warmup.status).toBe(200);

    // Verify cache key exists in Redis
    const cacheKey = `authz_ctx:org:${org.id}:u:${managerUser.id}:v:1`;
    const cachedBefore = await redisClient.get(cacheKey);
    expect(cachedBefore).not.toBeNull();

    // Owner downgrades manager to cashier via real endpoint
    const updateRes = await request(app)
      .put(`/api/users/${managerUser.id}/role`)
      .set('Authorization', ownerToken)
      .send({ role: 'cashier' });
    expect(updateRes.status).toBe(200);

    // Immediate next request using old managerToken (authzVersion: 1) MUST be rejected with 401
    const nextRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);

    expect(nextRes.status).toBe(401);
    expect(nextRes.body.code).toBe('AUTHZ_VERSION_STALE');

    // Mint a token with the NEW authzVersion
    const reloadedManager = await User.findByPk(managerUser.id);
    expect(reloadedManager.role).toBe('cashier');
    expect(reloadedManager.authzVersion).toBeGreaterThan(1);

    const freshCashierToken = signToken({
      id: managerUser.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: reloadedManager.authzVersion
    });

    const freshRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', freshCashierToken);

    expect(freshRes.status).toBe(200);
    expect(freshRes.body.user.role).toBe('cashier');
    expect(freshRes.body.user.role).not.toBe('manager');

    // Confirm that the cached payload in Redis is cashier-level, not manager
    const newKey = authzContextCacheService.getCacheKey({
      tokenRole: 'cashier',
      tokenOrgId: org.id,
      id: managerUser.id,
      isEmployee: false,
      currentVersion: reloadedManager.authzVersion
    });
    const newCached = await redisClient.get(newKey);
    expect(newCached).not.toBeNull();
    const parsedNew = JSON.parse(newCached);
    expect(parsedNew.role.effectiveRole).toBe('cashier');
  });

  test('c. shop access revoke via the real endpoint, next request loses access', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';

    // Grant cashier explicit access to secondaryShop using real membership id
    const grantRes = await request(app)
      .post(`/api/shops/${secondaryShop.id}/access`)
      .set('Authorization', ownerToken)
      .send({ membershipId: cashierMembership.id });
    expect(grantRes.status).toBe(201);

    // Reload cashier's current authzVersion
    const updatedCashier = await User.findByPk(cashierUser.id);
    const cashierTokenWithAccess = signToken({
      id: cashierUser.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: secondaryShop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: updatedCashier.authzVersion
    });

    // POSITIVE CONTROL: Request to a route requiring branch access (/api/sales/cashier-stats)
    // succeeds before revocation (proves cashier has permission and branch access)
    const positiveRes = await request(app)
      .get('/api/sales/cashier-stats')
      .set('Authorization', cashierTokenWithAccess);
    expect(positiveRes.status).toBe(200);

    // Revoke access via the real endpoint
    const revokeRes = await request(app)
      .delete(`/api/shops/${secondaryShop.id}/access/${cashierMembership.id}`)
      .set('Authorization', ownerToken);
    expect(revokeRes.status).toBe(200);

    // Immediate next request with pre-revocation token is rejected with 401 AUTHZ_VERSION_STALE
    const staleRes = await request(app)
      .get('/api/sales/cashier-stats')
      .set('Authorization', cashierTokenWithAccess);
    expect(staleRes.status).toBe(401);
    expect(staleRes.body.code).toBe('AUTHZ_VERSION_STALE');

    // Token minted with the bumped authzVersion has no access to secondaryShop
    const reloadedCashier = await User.findByPk(cashierUser.id);
    expect(reloadedCashier.authzVersion).toBeGreaterThan(updatedCashier.authzVersion);

    const freshTokenRevokedShop = signToken({
      id: cashierUser.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: secondaryShop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: reloadedCashier.authzVersion
    });

    // The exact same route that succeeded with 200 now returns 403 SHOP_ACCESS_DENIED
    const deniedRes = await request(app)
      .get('/api/sales/cashier-stats')
      .set('Authorization', freshTokenRevokedShop);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.code).toBe('SHOP_ACCESS_DENIED');

    // Token targeting home shop succeeds and primes cache
    const validHomeToken = signToken({
      id: cashierUser.id,
      role: 'cashier',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: reloadedCashier.authzVersion
    });
    const homeRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', validHomeToken);
    expect(homeRes.status).toBe(200);

    // Assert on accessible shop scope directly in the cached payload
    const cacheKey = authzContextCacheService.getCacheKey({
      tokenRole: 'cashier',
      tokenOrgId: org.id,
      id: cashierUser.id,
      isEmployee: false,
      currentVersion: reloadedCashier.authzVersion
    });
    const cachedStr = await redisClient.get(cacheKey);
    expect(cachedStr).not.toBeNull();
    const cachedPayload = JSON.parse(cachedStr);
    expect(cachedPayload.scope.memberAccessibleShopIds).toEqual([shop.id]);
    expect(cachedPayload.scope.memberAccessibleShopIds).not.toContain(secondaryShop.id);
  });

  test('d. Redis down / malformed value => 200 via DB path, same result as cache OFF', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';

    // 1. Corrupt/malformed JSON in Redis
    const managerKey = authzContextCacheService.getCacheKey({
      tokenRole: 'manager',
      tokenOrgId: org.id,
      id: managerUser.id,
      isEmployee: false,
      currentVersion: 1
    });
    await redisClient.setex(managerKey, 45, '{invalid_json');

    const malformedRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);
    expect(malformedRes.status).toBe(200);
    expect(malformedRes.body.user.id).toBe(managerUser.id);

    // 2. Redis get failure
    const redisGetSpy = jest.spyOn(redisClient, 'get').mockRejectedValue(new Error('Redis connection timeout'));
    try {
      const redisDownRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', managerToken);
      expect(redisDownRes.status).toBe(200);
      expect(redisDownRes.body.user.id).toBe(managerUser.id);
    } finally {
      redisGetSpy.mockRestore();
    }
  });

  test('malformed payload tests: wrong schemaVersion, wrong actorId, wrong authzVersion => treated as miss, request succeeds via DB', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';
    const managerKey = authzContextCacheService.getCacheKey({
      tokenRole: 'manager',
      tokenOrgId: org.id,
      id: managerUser.id,
      isEmployee: false,
      currentVersion: 1
    });

    // 1. Wrong schemaVersion (schemaVersion: 2)
    await redisClient.setex(managerKey, 45, JSON.stringify({
      schemaVersion: 2,
      actorId: managerUser.id,
      actorKind: 'u',
      authzVersion: 1,
      identity: { id: managerUser.id, userId: managerUser.id, email: managerUser.email, isEmployee: false },
      role: { rawRole: 'manager', effectiveRole: 'manager' },
      tenant: { organizationId: org.id, orgRole: 'member', membershipStatus: 'active' },
      membership: { id: managerMembership.id, organizationId: org.id, userId: managerUser.id, status: 'active' },
      scope: { homeShopId: shop.id, memberAccessibleShopIds: [shop.id] }
    }));

    const resSchema = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);
    expect(resSchema.status).toBe(200);
    expect(resSchema.body.user.id).toBe(managerUser.id);

    // 2. Wrong actorId (e.g. 999999)
    await redisClient.setex(managerKey, 45, JSON.stringify({
      schemaVersion: 1,
      actorId: 999999,
      actorKind: 'u',
      authzVersion: 1,
      identity: { id: 999999, userId: 999999, email: 'spoofed@example.com', isEmployee: false },
      role: { rawRole: 'manager', effectiveRole: 'manager' },
      tenant: { organizationId: org.id, orgRole: 'member', membershipStatus: 'active' },
      membership: { id: managerMembership.id, organizationId: org.id, userId: managerUser.id, status: 'active' },
      scope: { homeShopId: shop.id, memberAccessibleShopIds: [shop.id] }
    }));

    const resActor = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);
    expect(resActor.status).toBe(200);
    expect(resActor.body.user.id).toBe(managerUser.id);

    // 3. Wrong authzVersion in cached payload (e.g. 999)
    await redisClient.setex(managerKey, 45, JSON.stringify({
      schemaVersion: 1,
      actorId: managerUser.id,
      actorKind: 'u',
      authzVersion: 999,
      identity: { id: managerUser.id, userId: managerUser.id, email: managerUser.email, isEmployee: false },
      role: { rawRole: 'manager', effectiveRole: 'manager' },
      tenant: { organizationId: org.id, orgRole: 'member', membershipStatus: 'active' },
      membership: { id: managerMembership.id, organizationId: org.id, userId: managerUser.id, status: 'active' },
      scope: { homeShopId: shop.id, memberAccessibleShopIds: [shop.id] }
    }));

    const resVer = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);
    expect(resVer.status).toBe(200);
    expect(resVer.body.user.id).toBe(managerUser.id);
  });

  // Asserts the end-to-end 403 HTTP rejection and that the validator's tenant rule is directly verified by the unit test.
  test('e. org A actor cannot be served from org B key, poison test rejects with 403', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';

    // Prime cache for manager in org A
    await request(app)
      .get('/api/auth/profile')
      .set('Authorization', managerToken);

    const orgAKey = authzContextCacheService.getCacheKey({
      tokenRole: 'manager',
      tokenOrgId: org.id,
      id: managerUser.id,
      isEmployee: false,
      currentVersion: 1
    });
    const validOrgAPayload = await redisClient.get(orgAKey);
    expect(validOrgAPayload).not.toBeNull();

    // Poison test: write org A's valid payload under org B's key via redisClient.setex
    const orgBPoisonKey = authzContextCacheService.getCacheKey({
      tokenRole: 'manager',
      tokenOrgId: orgB.id,
      id: managerUser.id,
      isEmployee: false,
      currentVersion: 1
    });
    await redisClient.setex(orgBPoisonKey, 45, validOrgAPayload);

    // Construct a spoofed token claiming manager is in org B
    const spoofedToken = signToken({
      id: managerUser.id,
      role: 'manager',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: orgB.id,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', spoofedToken);

    // Must be rejected with 403 TENANT_MISMATCH (never served from poisoned org A cache)
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  test('f. cache OFF => behavior and query counts identical to master today', async () => {
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'false';

    // Warm up
    await request(app)
      .get('/api/auth/profile')
      .set('Authorization', ownerToken);

    const warmSql = [];
    sequelize.addHook('afterQuery', 'c2CacheOffSql', (options, query) => {
      const sql = (query && query.sql) || (options && options.sql);
      if (sql) warmSql.push(sql);
    });

    let res;
    try {
      res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', ownerToken);
    } finally {
      sequelize.removeHook('afterQuery', 'c2CacheOffSql');
    }

    expect(res.status).toBe(200);
    // With cache OFF, exactly 6 total SQL (4 pre-handler + 2 handler)
    expect(warmSql).toHaveLength(6);
  });

  test('parity test: cache ON vs OFF for owner, manager, super_admin, employee', async () => {
    const fixedPermissions = [
      'create_sales',
      'view_reports',
      'manage_inventory',
      'process_refunds',
      'manage_settings',
      'view_invoices',
      'manage_billing',
      'apply_discounts'
    ];

    const personas = [
      {
        name: 'owner',
        user: ownerUser,
        tokenPayload: {
          id: ownerUser.id,
          role: 'admin',
          orgRole: 'owner',
          shopId: shop.id,
          organizationId: org.id,
          isEmployee: false,
          authzVersion: 1
        }
      },
      {
        name: 'manager',
        user: managerUser,
        tokenPayload: {
          id: managerUser.id,
          role: 'manager',
          orgRole: 'member',
          shopId: shop.id,
          organizationId: org.id,
          isEmployee: false,
          authzVersion: 1
        }
      },
      {
        name: 'super_admin',
        user: superAdminUser,
        tokenPayload: {
          id: superAdminUser.id,
          role: 'super_admin',
          isEmployee: false,
          authzVersion: 1
        }
      },
      {
        name: 'employee',
        user: employeeUser,
        tokenPayload: {
          id: employeeUser.id,
          role: 'cashier',
          orgRole: 'member',
          shopId: shop.id,
          organizationId: org.id,
          isEmployee: true,
          authzVersion: 1
        }
      }
    ];

    for (const persona of personas) {
      // 1. Resolve with Cache OFF
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'false';
      const offReq = { user: { ...persona.tokenPayload } };
      let offNextCalled = false;
      const offRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      await authzContext(offReq, offRes, () => { offNextCalled = true; });
      expect(offNextCalled).toBe(true);

      const offContext = {
        identity: {
          isEmployee: offReq.authz.identity.isEmployee,
          employeeId: offReq.authz.identity.employeeId
        },
        userFields: {
          id: offReq.user.id,
          role: offReq.user.role,
          orgRole: offReq.user.orgRole,
          shopId: offReq.user.shopId,
          organizationId: offReq.user.organizationId,
          isEmployee: offReq.user.isEmployee
        },
        role: offReq.authz.role.effectiveRole,
        rawRole: offReq.authz.role.rawRole,
        orgRole: offReq.authz.tenant ? offReq.authz.tenant.orgRole : null,
        accessibleShopIds: [...(offReq.authz.scope.accessibleShopIds || [])].sort((a, b) => a - b),
        permissions: {}
      };
      for (const p of fixedPermissions) {
        offContext.permissions[p] = offReq.authz.permissions.has(p);
      }

      // 2. Resolve with Cache ON
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'true';
      await resetRedisAndState();

      // Cold run (primes cache)
      const primeReq = { user: { ...persona.tokenPayload } };
      await authzContext(primeReq, offRes, () => {});

      // Warm run (reads from cache)
      const warmReq = { user: { ...persona.tokenPayload } };
      let warmNextCalled = false;
      const warmRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      await authzContext(warmReq, warmRes, () => { warmNextCalled = true; });
      expect(warmNextCalled).toBe(true);

      const warmContext = {
        identity: {
          isEmployee: warmReq.authz.identity.isEmployee,
          employeeId: warmReq.authz.identity.employeeId
        },
        userFields: {
          id: warmReq.user.id,
          role: warmReq.user.role,
          orgRole: warmReq.user.orgRole,
          shopId: warmReq.user.shopId,
          organizationId: warmReq.user.organizationId,
          isEmployee: warmReq.user.isEmployee
        },
        role: warmReq.authz.role.effectiveRole,
        rawRole: warmReq.authz.role.rawRole,
        orgRole: warmReq.authz.tenant ? warmReq.authz.tenant.orgRole : null,
        accessibleShopIds: [...(warmReq.authz.scope.accessibleShopIds || [])].sort((a, b) => a - b),
        permissions: {}
      };
      for (const p of fixedPermissions) {
        warmContext.permissions[p] = warmReq.authz.permissions.has(p);
      }

      // Assert complete parity
      expect(warmContext.identity).toEqual(offContext.identity);
      expect(warmContext.role).toBe(offContext.role);
      expect(warmContext.rawRole).toBe(offContext.rawRole);
      expect(warmContext.orgRole).toBe(offContext.orgRole);
      expect(warmContext.accessibleShopIds).toEqual(offContext.accessibleShopIds);
      expect(warmContext.userFields).toEqual(offContext.userFields);
      expect(warmContext.permissions).toEqual(offContext.permissions);
    }
  });

  describe('authzContextCacheService.validateCachedPayload unit tests', () => {
    const baseValidUserPayload = {
      schemaVersion: 1,
      actorKind: 'u',
      actorId: 101,
      authzVersion: 1,
      identity: { id: 101, userId: 101, employeeId: null, isEmployee: false, email: 'u101@test.local' },
      role: { rawRole: 'manager', effectiveRole: 'manager' },
      tenant: { organizationId: 50, orgRole: 'member', membershipStatus: 'active' },
      membership: { id: 'mem-101', organizationId: 50, userId: 101, status: 'active' },
      scope: { homeShopId: 10, memberAccessibleShopIds: [10] }
    };

    const baseValidParams = {
      id: 101,
      isEmployee: false,
      currentVersion: 1,
      tokenOrgId: 50,
      tokenRole: 'manager'
    };

    test('returns true for a valid payload', () => {
      // Valid user payload
      expect(authzContextCacheService.validateCachedPayload(baseValidUserPayload, baseValidParams)).toBe(true);

      // Valid employee payload
      const validEmpPayload = {
        schemaVersion: 1,
        actorKind: 'e',
        actorId: 'emp-uuid-55',
        authzVersion: 2,
        identity: { id: 'emp-uuid-55', userId: null, employeeId: 'emp-uuid-55', isEmployee: true },
        role: { rawRole: 'cashier', effectiveRole: 'cashier' },
        tenant: { organizationId: 50, orgRole: 'member', membershipStatus: 'active' },
        membership: { id: 'mem-emp-55', organizationId: 50, employeeId: 'emp-uuid-55', status: 'active' },
        scope: { homeShopId: 10, memberAccessibleShopIds: [10] }
      };
      const empParams = {
        id: 'emp-uuid-55',
        isEmployee: true,
        currentVersion: 2,
        tokenOrgId: 50,
        tokenRole: 'cashier'
      };
      expect(authzContextCacheService.validateCachedPayload(validEmpPayload, empParams)).toBe(true);
    });

    test('returns false for tenant-org mismatch', () => {
      // Token orgId differs from cached tenant.organizationId
      expect(authzContextCacheService.validateCachedPayload(baseValidUserPayload, {
        ...baseValidParams,
        tokenOrgId: 99
      })).toBe(false);

      // Cached tenant.organizationId differs
      const mismatchedPayload = {
        ...baseValidUserPayload,
        tenant: { ...baseValidUserPayload.tenant, organizationId: 99 }
      };
      expect(authzContextCacheService.validateCachedPayload(mismatchedPayload, baseValidParams)).toBe(false);
    });

    test('returns false for wrong schemaVersion', () => {
      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        schemaVersion: 2
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        schemaVersion: 0
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        schemaVersion: undefined
      }, baseValidParams)).toBe(false);
    });

    test('returns false for wrong actorId', () => {
      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        actorId: 999
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload(baseValidUserPayload, {
        ...baseValidParams,
        id: 999
      })).toBe(false);
    });

    test('returns false for wrong actorKind', () => {
      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        actorKind: 'e'
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload(baseValidUserPayload, {
        ...baseValidParams,
        isEmployee: true
      })).toBe(false);
    });

    test('returns false for wrong authzVersion', () => {
      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        authzVersion: 2
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload(baseValidUserPayload, {
        ...baseValidParams,
        currentVersion: 2
      })).toBe(false);
    });

    test('returns false for missing tenant', () => {
      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        tenant: null
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        tenant: undefined
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        tenant: { ...baseValidUserPayload.tenant, organizationId: null }
      }, baseValidParams)).toBe(false);

      expect(authzContextCacheService.validateCachedPayload({
        ...baseValidUserPayload,
        tenant: { ...baseValidUserPayload.tenant, organizationId: undefined }
      }, baseValidParams)).toBe(false);
    });
  });

  test('g. purge scheduler bump test: purging expired org bumps authzVersion for employees and members', async () => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const purgeOrg = await Organization.create({
      name: `Purge Org ${suffix}`,
      slug: `purge-org-${suffix}`,
      status: 'active',
      currency: 'KES',
      planCode: growthPlan.code
    });

    const purgeShop = await Shop.create({
      name: `Purge Shop ${suffix}`,
      organizationId: purgeOrg.id,
      active: true
    });

    const purgeUser = await User.create({
      name: 'Purge User',
      email: `purge_user_${suffix}@purge.local`,
      password: 'Password123!',
      role: 'admin',
      shopId: purgeShop.id,
      organizationId: purgeOrg.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: purgeOrg.id,
      userId: purgeUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    const purgeEmployee = await Employee.create({
      shopId: purgeShop.id,
      firstName: 'Purge',
      lastName: 'Staff',
      email: `purge_emp_${suffix}@purge.local`,
      position: 'cashier',
      status: 'active',
      password: 'Password123!',
      salary: 30000,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: purgeOrg.id,
      employeeId: purgeEmployee.id,
      orgRole: 'member',
      status: 'active'
    });

    // Mark org as deleted and scheduled for purge to trigger purgeExpiredOrganizations
    await purgeOrg.update({
      status: 'canceled',
      deletedAt: new Date(Date.now() - 31 * 86400000),
      scheduledPurgeAt: new Date(Date.now() - 86400000)
    });

    // Run purge scheduler
    await purgeExpiredOrganizations();

    // Verify authzVersion was bumped
    const reloadedUser = await User.findByPk(purgeUser.id);
    const reloadedEmp = await Employee.findByPk(purgeEmployee.id);
    expect(reloadedUser.authzVersion).toBeGreaterThan(1);
    expect(reloadedEmp.authzVersion).toBeGreaterThan(1);
  });
});
