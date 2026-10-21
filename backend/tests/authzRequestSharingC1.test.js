'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const tokenRevocationService = require('../src/services/tokenRevocationService');
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
  Plan,
  Product,
  Inventory,
  Customer,
  Coupon
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

describe('Stage C1: Per-Request Auth State Sharing (WeakMap on req)', () => {
  let org;
  let shop;
  let secondaryShop;
  let growthPlan;
  let ownerUser;
  let managerUser;
  let cashierUser;
  let superAdminUser;
  let staffEmployee;
  let ownerToken;
  let managerToken;
  let cashierToken;
  let superAdminToken;
  let employeeToken;
  let originalAuthzCacheFlag;

  async function resetCachesForUsers() {
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.flushdb();
    }
    for (const u of [ownerUser, managerUser, cashierUser, superAdminUser].filter(Boolean)) {
      await tokenRevocationService.clearAuthzVersion(u.id, false);
      await tokenRevocationService.clearUserStatus(u.id, false);
      await tokenRevocationService.clearUserTokenCutoff(u.id, false);
    }
    if (staffEmployee) {
      await tokenRevocationService.clearAuthzVersion(staffEmployee.id, true);
      await tokenRevocationService.clearUserStatus(staffEmployee.id, true);
      await tokenRevocationService.clearUserTokenCutoff(staffEmployee.id, true);
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
    originalAuthzCacheFlag = process.env.AUTHZ_CONTEXT_CACHE_ENABLED;
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'false';
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Ensure 'growth' plan exists for both test org and POST /api/auth/register
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
      name: `Stage C1 Org ${suffix}`,
      slug: `stage-c1-org-${suffix}`,
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
      name: `Stage C1 Primary Shop ${suffix}`,
      organizationId: org.id,
      active: true
    });

    secondaryShop = await Shop.create({
      name: `Stage C1 Secondary Shop ${suffix}`,
      organizationId: org.id,
      active: true
    });

    ownerUser = await User.create({
      name: 'Stage C1 Owner',
      email: `owner_${suffix}@zenapos-c1.co.ke`,
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
      name: 'Stage C1 Manager',
      email: `manager_${suffix}@zenapos-c1.co.ke`,
      password: 'Password123!',
      role: 'manager',
      shopId: shop.id,
      organizationId: org.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: managerUser.id,
      orgRole: 'member',
      status: 'active'
    });

    cashierUser = await User.create({
      name: 'Stage C1 Cashier',
      email: `cashier_${suffix}@zenapos-c1.co.ke`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shop.id,
      organizationId: org.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: cashierUser.id,
      orgRole: 'member',
      status: 'active'
    });

    superAdminUser = await User.create({
      name: 'Stage C1 Super Admin',
      email: `superadmin_${suffix}@zenapos-c1.co.ke`,
      password: 'Password123!',
      role: 'super_admin',
      shopId: null,
      active: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    staffEmployee = await Employee.create({
      firstName: 'StageC1',
      lastName: 'StaffManager',
      email: `emp_mgr_${suffix}@zenapos-c1.co.ke`,
      phone: '+254711222333',
      position: 'Manager',
      status: 'active',
      hireDate: new Date(),
      salary: 40000,
      password: 'Password123!',
      shopId: shop.id,
      authzVersion: 1
    });

    const staffMembership = await OrganizationMembership.create({
      organizationId: org.id,
      employeeId: staffEmployee.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: staffMembership.id,
      employeeId: staffEmployee.id,
      shopId: shop.id,
      role: 'manager',
      status: 'active'
    });

    const product = await Product.create({
      name: `Stage C1 Product ${suffix}`,
      sku: `SKU-C1-${suffix}`,
      price: 300,
      cost: 180,
      shopId: shop.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: product.id,
      shopId: shop.id,
      organizationId: org.id,
      quantity: 30,
      reorderLevel: 5
    });

    await Customer.create({
      name: 'Stage C1 Customer',
      email: `customer_${suffix}@zenapos-c1.co.ke`,
      phone: '+254700999888',
      shopId: shop.id,
      organizationId: org.id,
      active: true
    });

    await Coupon.create({
      code: `C1SAVE_${suffix}`.slice(0, 20).toUpperCase(),
      title: 'Stage C1 10% Off',
      discountType: 'percentage',
      discountValue: 10,
      shopId: shop.id,
      isActive: true
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
      orgRole: null,
      shopId: null,
      organizationId: null,
      isEmployee: false,
      authzVersion: 1
    });

    employeeToken = signToken({
      id: staffEmployee.id,
      role: 'manager',
      orgRole: 'member',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: true,
      authzVersion: 1
    });
  });

  describe('1. SQL Query & Redis Command Counts (Cold, Warm, and 11-Request Burst)', () => {
    const origSmtpHost = process.env.SMTP_HOST;
    const origSmtpPort = process.env.SMTP_PORT;
    const origNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
      // Enable SMTP env flags and development mode so emailVerification7DayGate and generalLimiter
      // execute in the real middleware chain identically to docs/perf/BASELINE.md
      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = '2525';
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      if (origSmtpHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = origSmtpHost;

      if (origSmtpPort === undefined) delete process.env.SMTP_PORT;
      else process.env.SMTP_PORT = origSmtpPort;

      if (origNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = origNodeEnv;

      jest.restoreAllMocks();
    });

    test('GET /api/auth/profile: cold Users reads = 1 (down from 3), warm SQL = 6 (4 pre + 2 handler), warm Redis = 6 (down from 7)', async () => {
      await resetCachesForUsers();

      // --- COLD REQUEST ---
      const coldSql = [];
      const coldRedis = [];
      sequelize.addHook('afterQuery', 'c1ProfileColdSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) coldSql.push(sql);
      });
      const sendCmdSpyCold = jest.spyOn(redisClient, 'sendCommand').mockImplementation(function (command, ...rest) {
        if (command && command.name) {
          coldRedis.push({
            name: String(command.name).toUpperCase(),
            key: Array.isArray(command.args) ? String(command.args[0] || '') : ''
          });
        }
        return Object.getPrototypeOf(redisClient).sendCommand.call(this, command, ...rest);
      });

      let coldRes;
      try {
        coldRes = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', ownerToken);
      } finally {
        sequelize.removeHook('afterQuery', 'c1ProfileColdSql');
        sendCmdSpyCold.mockRestore();
      }

      expect(coldRes.status).toBe(200);

      // Handler queries Users once with a LEFT OUTER JOIN to Shops; pre-handler must query Users strictly ONCE
      const preHandlerColdUserReads = coldSql.filter(
        (sql) => sql.includes('FROM `Users`') && !sql.includes('LEFT OUTER JOIN `Shops`')
      );
      expect(preHandlerColdUserReads).toHaveLength(1);

      // Pre-handler User read must never select secret columns
      expect(preHandlerColdUserReads[0]).not.toMatch(/password|emailVerificationTokenHash/i);

      // Total cold SQL on /api/auth/profile = 5 pre-handler (1 User + 1 Subscription + 1 Membership + 1 Org + 1 Shop) + 2 handler = 7
      expect(coldSql).toHaveLength(7);

      // --- WARM REQUEST ---
      const warmSql = [];
      const warmRedis = [];
      sequelize.addHook('afterQuery', 'c1ProfileWarmSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) warmSql.push(sql);
      });
      const sendCmdSpyWarm = jest.spyOn(redisClient, 'sendCommand').mockImplementation(function (command, ...rest) {
        if (command && command.name) {
          warmRedis.push({
            name: String(command.name).toUpperCase(),
            key: Array.isArray(command.args) ? String(command.args[0] || '') : ''
          });
        }
        return Object.getPrototypeOf(redisClient).sendCommand.call(this, command, ...rest);
      });

      let warmRes;
      try {
        warmRes = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', ownerToken);
      } finally {
        sequelize.removeHook('afterQuery', 'c1ProfileWarmSql');
        sendCmdSpyWarm.mockRestore();
      }

      expect(warmRes.status).toBe(200);
      // Warm SQL unchanged at 6 (4 pre-handler + 2 handler)
      expect(warmSql).toHaveLength(6);

      // Duplicate getOrgStatus is eliminated: auth_status:org:<id> is read strictly ONCE per request
      const orgStatusRedisGets = warmRedis.filter(
        (cmd) => cmd.name === 'GET' && cmd.key === `auth_status:org:${org.id}`
      );
      expect(orgStatusRedisGets).toHaveLength(1);

      // Warm Redis commands on /api/auth/profile = 6 (down from 7)
      expect(warmRedis).toHaveLength(6);
    });

    test('GET /api/sales/statistics: cold Users reads = 1 (down from 3-4), jwt.verify = 1 (down from 2), warm SQL = 7, warm Redis = 7 (down from 8)', async () => {
      await resetCachesForUsers();

      // --- COLD REQUEST ---
      const coldSql = [];
      sequelize.addHook('afterQuery', 'c1StatsColdSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) coldSql.push(sql);
      });
      const jwtVerifySpy = jest.spyOn(jwt, 'verify');

      let coldRes;
      try {
        coldRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', ownerToken);
      } finally {
        sequelize.removeHook('afterQuery', 'c1StatsColdSql');
      }

      expect(coldRes.status).toBe(200);

      // JWT verified ONCE across emailVerification7DayGate and auth.js
      expect(jwtVerifySpy).toHaveBeenCalledTimes(1);
      jwtVerifySpy.mockRestore();

      // Cold Users reads = 1 (shared across emailVerification7DayGate, getUserStatus, getAuthzVersion, and authzContext)
      const coldUserReads = coldSql.filter((sql) => sql.includes('FROM `Users`'));
      expect(coldUserReads).toHaveLength(1);
      expect(coldUserReads[0]).not.toMatch(/password|emailVerificationTokenHash/i);

      // Total cold SQL on /api/sales/statistics = 5 pre-handler + 3 handler = 8 (down from 12)
      expect(coldSql).toHaveLength(8);

      // --- WARM REQUEST ---
      const warmSql = [];
      const warmRedis = [];
      sequelize.addHook('afterQuery', 'c1StatsWarmSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) warmSql.push(sql);
      });
      const sendCmdSpyWarm = jest.spyOn(redisClient, 'sendCommand').mockImplementation(function (command, ...rest) {
        if (command && command.name) {
          warmRedis.push({
            name: String(command.name).toUpperCase(),
            key: Array.isArray(command.args) ? String(command.args[0] || '') : ''
          });
        }
        return Object.getPrototypeOf(redisClient).sendCommand.call(this, command, ...rest);
      });

      let warmRes;
      try {
        warmRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', ownerToken)
          .set('x-forwarded-for', '127.0.0.1');
      } finally {
        sequelize.removeHook('afterQuery', 'c1StatsWarmSql');
        sendCmdSpyWarm.mockRestore();
      }

      expect(warmRes.status).toBe(200);
      // Warm SQL at 7 (4 pre-handler + 3 handler)
      expect(warmSql).toHaveLength(7);
      // Warm Redis commands = 7 (down from 8: 1 rate-limit EVAL + 5 auth/authz GETs + 1 entitlement GET)
      expect(warmRedis).toHaveLength(7);
      const orgStatusGets = warmRedis.filter(
        (cmd) => cmd.name === 'GET' && cmd.key === `auth_status:org:${org.id}`
      );
      expect(orgStatusGets).toHaveLength(1);
    });

    test('Warm 11-request dashboard burst executes 64 SQL queries', async () => {
      const dashboardEndpoints = [
        '/api/analytics/orders?period=week',
        '/api/analytics/visitors?period=week',
        '/api/analytics/orders?period=week',
        '/api/analytics/sales-channels?period=week',
        '/api/analytics/customer-locations?period=week',
        '/api/analytics/top-products?period=week&limit=5',
        '/api/billing/subscription',
        '/api/employees',
        '/api/customers?limit=5',
        '/api/products?limit=5',
        '/api/sales/statistics'
      ];

      // Warm up caches first
      await Promise.all(
        dashboardEndpoints.map((ep) =>
          request(app).get(ep).set('Authorization', ownerToken)
        )
      );

      const burstSql = [];
      sequelize.addHook('afterQuery', 'c1BurstWarmSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) burstSql.push(sql);
      });

      let responses;
      try {
        responses = await Promise.all(
          dashboardEndpoints.map((ep) =>
            request(app).get(ep).set('Authorization', ownerToken)
          )
        );
      } finally {
        sequelize.removeHook('afterQuery', 'c1BurstWarmSql');
      }

      for (const res of responses) {
        expect(res.status).toBe(200);
      }
      expect(burstSql).toHaveLength(64);
    });
  });

  describe('2. Employee & Super Admin Request-Scoped Sharing', () => {
    test('Employee token: cold Employees reads = 1 (down from 3), warm Redis = 7 on /api/sales/statistics', async () => {
      await resetCachesForUsers();

      const coldSql = [];
      sequelize.addHook('afterQuery', 'c1EmpColdSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) coldSql.push(sql);
      });

      let coldRes;
      try {
        coldRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', employeeToken);
      } finally {
        sequelize.removeHook('afterQuery', 'c1EmpColdSql');
      }

      expect(coldRes.status).toBe(200);
      const coldEmployeeReads = coldSql.filter((sql) => sql.includes('FROM `Employees`'));
      expect(coldEmployeeReads).toHaveLength(1);
      expect(coldEmployeeReads[0]).not.toMatch(/password/i);

      // Warm request with rate limiter active -> 7 Redis commands
      const warmRedis = [];
      const sendCmdSpy = jest.spyOn(redisClient, 'sendCommand').mockImplementation(function (command, ...rest) {
        if (command && command.name) {
          warmRedis.push(String(command.name).toUpperCase());
        }
        return Object.getPrototypeOf(redisClient).sendCommand.call(this, command, ...rest);
      });

      try {
        const warmRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', employeeToken)
          .set('x-forwarded-for', '127.0.0.1');
        expect(warmRes.status).toBe(200);
      } finally {
        sendCmdSpy.mockRestore();
      }
      expect(warmRedis).toHaveLength(7);
    });

    test('Super admin token: cold Users reads = 1 (down from 3) and bypasses tenant scoping cleanly', async () => {
      await resetCachesForUsers();

      const coldSql = [];
      sequelize.addHook('afterQuery', 'c1SuperAdminColdSql', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) coldSql.push(sql);
      });

      let res;
      try {
        res = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', superAdminToken);
      } finally {
        sequelize.removeHook('afterQuery', 'c1SuperAdminColdSql');
      }

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('super_admin');

      const preHandlerUserReads = coldSql.filter(
        (sql) => sql.includes('FROM `Users`') && !sql.includes('LEFT OUTER JOIN `Shops`')
      );
      expect(preHandlerUserReads).toHaveLength(1);
    });
  });

  describe('3. Parity & Fail-Closed Security Guarantees (Cold and Warm)', () => {
    test('Stale authzVersion is rejected with 401 AUTHZ_VERSION_STALE on both cold and warm paths', async () => {
      await ownerUser.update({ authzVersion: 2 });
      await tokenRevocationService.setAuthzVersion(ownerUser.id, false, 2);

      try {
        // Warm path (Redis has authzVersion = 2)
        const warmRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', ownerToken);
        expect(warmRes.status).toBe(401);
        expect(warmRes.body.code).toBe('AUTHZ_VERSION_STALE');

        // Cold path (flush Redis so getAuthzVersion falls back to shared DB read)
        await resetCachesForUsers();
        const coldRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', ownerToken);
        expect(coldRes.status).toBe(401);
        expect(coldRes.body.code).toBe('AUTHZ_VERSION_STALE');
      } finally {
        await ownerUser.update({ authzVersion: 1 });
        await tokenRevocationService.setAuthzVersion(ownerUser.id, false, 1);
      }
    });

    test('Deactivated user is rejected with 401 on both cold and warm paths', async () => {
      await managerUser.update({ active: false });
      await tokenRevocationService.setUserStatus(managerUser.id, false, 'inactive');

      try {
        // Warm path
        const warmRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', managerToken);
        expect(warmRes.status).toBe(401);

        // Cold path (DB fallback via shared actor lookup)
        await resetCachesForUsers();
        const coldRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', managerToken);
        expect(coldRes.status).toBe(401);
      } finally {
        await managerUser.update({ active: true });
        await tokenRevocationService.setUserStatus(managerUser.id, false, 'active');
      }
    });

    test('Suspended organization blocks non-owner with 403 ORGANIZATION_SUSPENDED on both cold and warm paths', async () => {
      await org.update({ status: 'suspended' });
      await Subscription.update({ status: 'suspended' }, { where: { organizationId: org.id } });
      await tokenRevocationService.setOrgStatus(org.id, 'suspended');
      if (permissionCache && typeof permissionCache.invalidateOrgPermissions === 'function') {
        await permissionCache.invalidateOrgPermissions(org.id);
      }

      try {
        // Warm path
        const warmRes = await request(app)
          .get('/api/customers')
          .set('Authorization', managerToken);
        expect(warmRes.status).toBe(403);
        expect(warmRes.body.code).toBe('ORGANIZATION_SUSPENDED');

        // Cold path
        await resetCachesForUsers();
        const coldRes = await request(app)
          .get('/api/customers')
          .set('Authorization', managerToken);
        expect(coldRes.status).toBe(403);
        expect(coldRes.body.code).toBe('ORGANIZATION_SUSPENDED');
      } finally {
        await org.update({ status: 'active' });
        await Subscription.update({ status: 'active' }, { where: { organizationId: org.id } });
        await tokenRevocationService.setOrgStatus(org.id, 'active');
        await resetCachesForUsers();
      }
    });

    test('Revoked token (by jti) is rejected with 401', async () => {
      const customJti = `revoked-jti-${Date.now()}`;
      const revocableToken = signToken({
        id: managerUser.id,
        role: 'manager',
        orgRole: 'member',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false,
        authzVersion: 1,
        jti: customJti
      });

      const okRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', revocableToken);
      expect(okRes.status).toBe(200);

      await tokenRevocationService.revokeToken(customJti, 3600);

      const revokedRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', revocableToken);
      expect(revokedRes.status).toBe(401);
    });

    test('Logout-all cutoff (revokeAllUserTokens) rejects tokens issued at or before cutoff with 401', async () => {
      const pastIat = Math.floor(Date.now() / 1000) - 10;
      const preCutoffToken = signToken({
        id: cashierUser.id,
        role: 'cashier',
        orgRole: 'member',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false,
        authzVersion: 1,
        iat: pastIat
      });

      await tokenRevocationService.revokeAllUserTokens(cashierUser.id, false);
      try {
        const res = await request(app)
          .get('/api/auth/profile')
          .set('Authorization', preCutoffToken);
        expect(res.status).toBe(401);
      } finally {
        await tokenRevocationService.clearUserTokenCutoff(cashierUser.id, false);
      }
    });

    test('Redis down (redisClient.get throws): falls back to in-memory cutoffs/versions and shared DB reads (fail-closed)', async () => {
      // 1) Set an in-memory authzVersion bump for managerUser while Redis fails
      await managerUser.update({ authzVersion: 3 });
      await tokenRevocationService.setAuthzVersion(managerUser.id, false, 3);

      const redisGetSpy = jest.spyOn(redisClient, 'get').mockRejectedValue(new Error('ECONNREFUSED Redis Down'));

      try {
        // Stale token for managerUser must STILL be rejected (401 AUTHZ_VERSION_STALE) when Redis is down
        const staleRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', managerToken);
        expect(staleRes.status).toBe(401);
        expect(staleRes.body.code).toBe('AUTHZ_VERSION_STALE');

        // Valid token for ownerUser falls back to DB (with 1 shared User read) and succeeds
        const coldSql = [];
        sequelize.addHook('afterQuery', 'c1RedisDownSql', (options, query) => {
          const sql = (query && query.sql) || (options && options.sql);
          if (sql) coldSql.push(sql);
        });
        let ownerRes;
        try {
          ownerRes = await request(app)
            .get('/api/sales/statistics')
            .set('Authorization', ownerToken);
        } finally {
          sequelize.removeHook('afterQuery', 'c1RedisDownSql');
        }
        expect(ownerRes.status).toBe(200);
        const userReads = coldSql.filter((sql) => sql.includes('FROM `Users`'));
        expect(userReads).toHaveLength(1);
      } finally {
        redisGetSpy.mockRestore();
        await managerUser.update({ authzVersion: 1 });
        await tokenRevocationService.setAuthzVersion(managerUser.id, false, 1);
      }
    });
  });

  describe('4. Task 1c Regressions: Register-Then-Use-Token & Staff-Creation-Then-First-Login', () => {
    test('POST /api/auth/register -> immediately use returned token on GET /api/auth/profile (200) and GET /api/sales/statistics (200)', async () => {
      const regSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Newly Registered Owner',
          email: `newowner_${regSuffix}@zenapos-c1.co.ke`,
          password: 'Password123!',
          shop: {
            name: `New Reg Shop ${regSuffix}`,
            address: '100 Kenyatta Ave',
            phone: '+254722000111'
          }
        });

      expect(regRes.status).toBe(201);
      expect(regRes.body.token).toBeTruthy();

      const bearerToken = `Bearer ${regRes.body.token}`;

      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', bearerToken);
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.user.email).toBe(`newowner_${regSuffix}@zenapos-c1.co.ke`);

      const statsRes = await request(app)
        .get('/api/sales/statistics')
        .set('Authorization', bearerToken);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body).toEqual(
        expect.objectContaining({
          totalSales: expect.any(Number),
          totalRevenue: expect.any(Number)
        })
      );
    });

    test('POST /api/employees -> POST /api/auth/login -> immediately use token on GET /api/auth/profile (200) and GET /api/sales/statistics (200)', async () => {
      const staffSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const staffEmail = `newstaff_${staffSuffix}@zenapos-c1.co.ke`;
      const staffPassword = 'Password123!';

      const createRes = await request(app)
        .post('/api/employees')
        .set('Authorization', ownerToken)
        .send({
          firstName: 'FirstLogin',
          lastName: 'Manager',
          email: staffEmail,
          phone: '+254733444555',
          position: 'Manager',
          status: 'active',
          salary: 42000,
          hireDate: new Date().toISOString(),
          password: staffPassword
        });

      expect(createRes.status).toBe(201);

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: staffEmail,
          password: staffPassword
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.token).toBeTruthy();

      const staffBearer = `Bearer ${loginRes.body.token}`;

      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', staffBearer);
      expect(profileRes.status).toBe(200);
      expect(profileRes.body.user.email).toBe(staffEmail);

      const statsRes = await request(app)
        .get('/api/sales/statistics')
        .set('Authorization', staffBearer);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body).toEqual(
        expect.objectContaining({
          totalSales: expect.any(Number),
          totalRevenue: expect.any(Number)
        })
      );
    });
  });

  describe('5. Anti-Spoofing: Forged Headers, Query Params, and Body Properties Gain Nothing', () => {
    test('Forged x-shop-id, organizationId, authz, effectiveRole, and _authState cannot escalate role or cross-shop scope', async () => {
      // 1) Cashier attempting to spoof organizationId via query/header/body -> 403 TENANT_MISMATCH
      const tenantSpoofRes = await request(app)
        .post('/api/coupons?organizationId=999999')
        .set('Authorization', cashierToken)
        .set('x-organization-id', '999999')
        .send({
          code: 'SPOOFEDORG',
          discountType: 'percentage',
          discountValue: 50,
          organizationId: 999999
        });
      expect(tenantSpoofRes.status).toBe(403);
      expect(tenantSpoofRes.body.code).toBe('TENANT_MISMATCH');

      // 2) Cashier attempting to escalate role via forged authz, effectiveRole, and _authState -> 403 PERMISSION_DENIED
      const roleSpoofRes = await request(app)
        .post('/api/coupons?effectiveRole=admin')
        .set('Authorization', cashierToken)
        .set('x-authz', JSON.stringify({ role: { effectiveRole: 'admin' } }))
        .set('x-request-auth-state', JSON.stringify({ actor: { role: 'admin', active: true } }))
        .send({
          code: 'SPOOFED99',
          discountType: 'percentage',
          discountValue: 50,
          effectiveRole: 'admin',
          authz: {
            role: { rawRole: 'admin', effectiveRole: 'admin' },
            permissions: { granted: ['all'] }
          },
          _authState: {
            actor: { id: ownerUser.id, role: 'admin', active: true }
          }
        });
      expect(roleSpoofRes.status).toBe(403);
      expect(roleSpoofRes.body.code).toBe('PERMISSION_DENIED');

      // 3) Manager scoped only to primary `shop` attempting to access `secondaryShop` via x-shop-id header (ignored) or query param (403 SHOP_ACCESS_DENIED)
      const managerHeaderSpoofRes = await request(app)
        .get('/api/employees')
        .set('Authorization', managerToken)
        .set('x-shop-id', String(secondaryShop.id));
      expect(managerHeaderSpoofRes.status).toBe(200);
      expect(managerHeaderSpoofRes.body.every((e) => e.shopId === shop.id)).toBe(true);

      const managerQuerySpoofRes = await request(app)
        .get(`/api/employees?shopId=${secondaryShop.id}`)
        .set('Authorization', managerToken);
      expect(managerQuerySpoofRes.status).toBe(403);
      expect(managerQuerySpoofRes.body.code).toBe('SHOP_ACCESS_DENIED');
    });
  });

  afterAll(async () => {
    if (originalAuthzCacheFlag === undefined) {
      delete process.env.AUTHZ_CONTEXT_CACHE_ENABLED;
    } else {
      process.env.AUTHZ_CONTEXT_CACHE_ENABLED = originalAuthzCacheFlag;
    }
  });
});
