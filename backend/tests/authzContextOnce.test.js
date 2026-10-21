'use strict';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const authzContext = require('../src/middleware/authzContext');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const {
  User,
  Shop,
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

describe('Stage A2: authzContext Per-Request WeakSet Guard & Pool Config Validation', () => {
  let org;
  let shop;
  let plan;
  let ownerUser;
  let managerUser;
  let cashierUser;
  let ownerToken;
  let managerToken;
  let cashierToken;
  let originalAuthzCacheFlag;

  beforeAll(async () => {
    originalAuthzCacheFlag = process.env.AUTHZ_CONTEXT_CACHE_ENABLED;
    process.env.AUTHZ_CONTEXT_CACHE_ENABLED = 'false';
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    [plan] = await Plan.findOrCreate({
      where: { code: 'pro_stage_a2' },
      defaults: {
        name: 'Pro Stage A2',
        code: 'pro_stage_a2',
        priceMonthly: 5000,
        currency: 'KES',
        maxShops: 10,
        maxUsers: 50,
        features: { analytics: true, ai_insights: true, org_insights: true },
        isActive: true
      }
    });

    org = await Organization.create({
      name: `Stage A2 Org ${suffix}`,
      slug: `stage-a2-org-${suffix}`,
      status: 'active',
      currency: 'KES',
      planCode: plan.code
    });

    await Subscription.create({
      organizationId: org.id,
      planId: plan.id,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000)
    });

    shop = await Shop.create({
      name: `Stage A2 Shop ${suffix}`,
      organizationId: org.id,
      active: true
    });

    ownerUser = await User.create({
      name: 'Stage A2 Owner',
      email: `owner_${suffix}@stage-a2.test`,
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
      name: 'Stage A2 Manager',
      email: `manager_${suffix}@stage-a2.test`,
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
      name: 'Stage A2 Cashier',
      email: `cashier_${suffix}@stage-a2.test`,
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

    const product = await Product.create({
      name: `Stage A2 Product ${suffix}`,
      sku: `SKU-A2-${suffix}`,
      price: 250,
      cost: 150,
      shopId: shop.id,
      organizationId: org.id,
      active: true
    });

    await Inventory.create({
      productId: product.id,
      shopId: shop.id,
      organizationId: org.id,
      quantity: 25,
      reorderLevel: 5
    });

    await Customer.create({
      name: 'Stage A2 Customer',
      email: `customer_${suffix}@stage-a2.test`,
      phone: '+254700111222',
      shopId: shop.id,
      organizationId: org.id,
      active: true
    });

    await Coupon.create({
      code: `A2SAVE_${suffix}`.slice(0, 20).toUpperCase(),
      title: 'Stage A2 10% Off',
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
  });

  describe('1. Query-Count Verification via Sequelize afterQuery Hook', () => {
    test('Warm GET /api/sales/statistics runs authzContext SQL queries ONCE (7 total queries instead of 12)', async () => {
      // Warm up Redis caches (user status, org status, authzVersion, subscription status, permissions)
      const warmupRes = await request(app)
        .get('/api/sales/statistics')
        .set('Authorization', ownerToken);
      expect(warmupRes.status).toBe(200);

      const recordedSql = [];
      sequelize.addHook('afterQuery', 'stageA2SalesStatsCount', (options, query) => {
        const sql = (query && query.sql) || (options && options.sql);
        if (sql) {
          recordedSql.push(sql);
        }
      });

      let res;
      try {
        res = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', ownerToken);
      } finally {
        sequelize.removeHook('afterQuery', 'stageA2SalesStatsCount');
      }

      expect(res.status).toBe(200);

      const userHydrationQueries = recordedSql.filter(
        (sql) => sql.includes('FROM `Users`') && sql.includes('`email`') && sql.includes('`authzVersion`')
      );
      const membershipQueries = recordedSql.filter(
        (sql) => sql.includes('FROM `OrganizationMemberships`')
      );
      const orgQueries = recordedSql.filter(
        (sql) => sql.includes('FROM `Organizations`')
      );
      const ownerShopQueries = recordedSql.filter(
        (sql) => sql.includes('FROM `Shops`') && sql.includes('`organizationId`')
      );

      // Each authzContext table lookup must execute strictly ONCE per request
      expect(userHydrationQueries).toHaveLength(1);
      expect(membershipQueries).toHaveLength(1);
      expect(orgQueries).toHaveLength(1);
      expect(ownerShopQueries).toHaveLength(1);

      // Total warm queries = 4 pre-handler (authzContext once) + 3 handler (getSalesStatistics) = 7
      expect(recordedSql).toHaveLength(7);
    });
  });

  describe('2. Parity Across Representative Routes for Owner, Manager, and Cashier', () => {
    test('Sales routes: GET /api/sales/statistics allows owner/manager (200) and denies cashier (403); GET /api/sales/my-sales allows cashier (200)', async () => {
      for (const token of [ownerToken, managerToken]) {
        const res = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', token);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(
          expect.objectContaining({
            totalSales: expect.any(Number),
            totalRevenue: expect.any(Number),
            averageTicket: expect.any(Number)
          })
        );
      }

      const cashierStatsRes = await request(app)
        .get('/api/sales/statistics')
        .set('Authorization', cashierToken);
      expect(cashierStatsRes.status).toBe(403);
      expect(cashierStatsRes.body.code).toBe('PERMISSION_DENIED');

      const cashierMySalesRes = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', cashierToken);
      expect(cashierMySalesRes.status).toBe(200);
      expect(Array.isArray(cashierMySalesRes.body.sales)).toBe(true);
    });

    test('GET /api/products returns 200 with products list for owner, manager, and cashier', async () => {
      for (const token of [ownerToken, managerToken, cashierToken]) {
        const res = await request(app)
          .get('/api/products')
          .set('Authorization', token);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
        expect(res.body.products.length).toBeGreaterThanOrEqual(1);
      }
    });

    test('GET /api/employees allows owner (200) and manager (200) but denies cashier (403)', async () => {
      const ownerRes = await request(app)
        .get('/api/employees')
        .set('Authorization', ownerToken);
      expect(ownerRes.status).toBe(200);
      expect(Array.isArray(ownerRes.body)).toBe(true);

      const managerRes = await request(app)
        .get('/api/employees')
        .set('Authorization', managerToken);
      expect(managerRes.status).toBe(200);
      expect(Array.isArray(managerRes.body)).toBe(true);

      const cashierRes = await request(app)
        .get('/api/employees')
        .set('Authorization', cashierToken);
      expect(cashierRes.status).toBe(403);
      expect(cashierRes.body.code).toBe('PERMISSION_DENIED');
    });

    test('GET /api/coupons allows owner (200) and manager (200) but denies cashier (403)', async () => {
      const ownerRes = await request(app)
        .get('/api/coupons')
        .set('Authorization', ownerToken);
      expect(ownerRes.status).toBe(200);
      expect(Array.isArray(ownerRes.body)).toBe(true);

      const managerRes = await request(app)
        .get('/api/coupons')
        .set('Authorization', managerToken);
      expect(managerRes.status).toBe(200);
      expect(Array.isArray(managerRes.body)).toBe(true);

      const cashierRes = await request(app)
        .get('/api/coupons')
        .set('Authorization', cashierToken);
      expect(cashierRes.status).toBe(403);
      expect(cashierRes.body.code).toBe('PERMISSION_DENIED');
    });

    test('GET /api/customers allows owner (200), manager (200), and cashier (200)', async () => {
      for (const token of [ownerToken, managerToken, cashierToken]) {
        const res = await request(app)
          .get('/api/customers')
          .set('Authorization', token);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.customers)).toBe(true);
      }
    });
  });

  describe('3. Security Regressions on Routes Mounting Both auth and authzContext', () => {
    test('Stale authzVersion token is rejected with 401 AUTHZ_VERSION_STALE', async () => {
      await ownerUser.update({ authzVersion: 2 });
      await tokenRevocationService.setAuthzVersion(ownerUser.id, false, 2);

      try {
        const staleRes = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', ownerToken); // token has authzVersion: 1
        expect(staleRes.status).toBe(401);
        expect(staleRes.body.code).toBe('AUTHZ_VERSION_STALE');
      } finally {
        await ownerUser.update({ authzVersion: 1 });
        await tokenRevocationService.setAuthzVersion(ownerUser.id, false, 1);
      }
    });

    test('Role downgrade (manager -> cashier) loses access on the very next request', async () => {
      const beforeRes = await request(app)
        .get('/api/coupons')
        .set('Authorization', managerToken);
      expect(beforeRes.status).toBe(200);

      await managerUser.update({ role: 'cashier' });
      try {
        // Same JWT still claiming role: 'manager', but DB role is now 'cashier'
        const afterRes = await request(app)
          .get('/api/coupons')
          .set('Authorization', managerToken);
        expect(afterRes.status).toBe(403);
        expect(afterRes.body.code).toBe('PERMISSION_DENIED');
      } finally {
        await managerUser.update({ role: 'manager' });
      }
    });

    test('Deactivated user is blocked with 401 on the very next request', async () => {
      await managerUser.update({ active: false });
      if (redisClient && redisClient.isOpen) {
        await redisClient.del(`user:status:user:${managerUser.id}`);
      }

      try {
        const res = await request(app)
          .get('/api/sales/statistics')
          .set('Authorization', managerToken);
        expect(res.status).toBe(401);
      } finally {
        await managerUser.update({ active: true });
        if (redisClient && redisClient.isOpen) {
          await redisClient.del(`user:status:user:${managerUser.id}`);
        }
      }
    });

    test('Forged headers, query params, and body keys (authz, x-authz, completed, etc.) gain nothing', async () => {
      // Unauthenticated request attempting to forge authz completion
      const unauthForged = await request(app)
        .get('/api/sales/statistics?authz=true&completed=true&completedAuthzRequests=true')
        .set('x-authz', JSON.stringify({ role: { effectiveRole: 'admin' } }))
        .set('authz', 'true')
        .set('x-authz-completed', 'true')
        .send({
          authz: {
            role: { effectiveRole: 'admin' },
            permissions: { granted: ['all'] }
          },
          completed: true,
          completedAuthzRequests: true
        });
      expect(unauthForged.status).toBe(401);

      // Authenticated cashier attempting to forge manager/admin privileges via headers/query/body
      const cashierForged = await request(app)
        .post('/api/coupons?authz=admin&completed=true&role=admin')
        .set('Authorization', cashierToken)
        .set('x-authz', JSON.stringify({ role: { effectiveRole: 'admin' } }))
        .set('authz', 'admin')
        .set('completedAuthzRequests', 'true')
        .send({
          code: 'FORGED10',
          discountType: 'percentage',
          discountValue: 10,
          authz: {
            role: { rawRole: 'admin', effectiveRole: 'admin' },
            permissions: { granted: ['all'] }
          },
          completed: true,
          completedAuthzRequests: true
        });
      expect(cashierForged.status).toBe(403);
      expect(cashierForged.body.code).toBe('PERMISSION_DENIED');
    });
  });

  describe('4. Standalone authzContext & Rejection Path Guarantees', () => {
    test('authzContext mounted alone (without auth before it) still runs fully', async () => {
      const standaloneApp = express();
      standaloneApp.use(express.json());

      // 1) Mounted alone with no req.user -> rejects 401 AUTHENTICATION_REQUIRED
      standaloneApp.get('/alone-unauth', authzContext, (req, res) => {
        res.status(200).json({ reached: true });
      });

      // 2) Mounted alone after lightweight req.user injection -> hydrates req.authz from DB
      standaloneApp.get(
        '/alone-hydrated',
        (req, _res, next) => {
          req.user = {
            id: managerUser.id,
            isEmployee: false,
            role: 'cashier', // Intentionally stale/wrong in req.user; DB has 'manager'
            shopId: shop.id,
            organizationId: org.id,
            authzVersion: 1
          };
          next();
        },
        authzContext,
        (req, res) => {
          res.status(200).json({
            effectiveRole: req.authz.role.effectiveRole,
            orgId: req.authz.tenant.organizationId,
            activeShopId: req.authz.scope.activeShopId
          });
        }
      );

      const unauthRes = await request(standaloneApp).get('/alone-unauth');
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.code).toBe('AUTHENTICATION_REQUIRED');

      const hydratedRes = await request(standaloneApp).get('/alone-hydrated');
      expect(hydratedRes.status).toBe(200);
      expect(hydratedRes.body).toEqual({
        effectiveRole: 'manager',
        orgId: org.id,
        activeShopId: shop.id
      });
    });

    test('Rejected request (suspended membership) does NOT set the WeakSet marker and never reaches the handler', async () => {
      const membership = await OrganizationMembership.findOne({
        where: { userId: cashierUser.id, organizationId: org.id }
      });
      await membership.update({ status: 'suspended' });

      try {
        let handlerReached = false;
        let secondCallNextCalled = false;

        const rejectApp = express();
        rejectApp.get('/suspended-check', async (req, res) => {
          req.user = {
            id: cashierUser.id,
            isEmployee: false,
            role: 'cashier',
            shopId: shop.id,
            organizationId: org.id,
            authzVersion: 1
          };
          // Pre-populate a fake req.authz to prove that if WeakSet were wrongly set on failure,
          // a second call would short-circuit via `completedAuthzRequests.has(req) && req.authz`.
          req.authz = { forged: true };

          await authzContext(req, res, () => {
            handlerReached = true;
          });

          // Attempt a second invocation on the SAME req object after rejection
          const mockRes2 = {
            status: () => ({ json: () => {} })
          };
          await authzContext(req, mockRes2, () => {
            secondCallNextCalled = true;
          });
        });

        const directRes = await request(rejectApp).get('/suspended-check');
        expect(directRes.status).toBe(403);
        expect(directRes.body.code).toBe('MEMBERSHIP_SUSPENDED');
        expect(handlerReached).toBe(false);
        expect(secondCallNextCalled).toBe(false);

        // Also verify against the real app route mounting both auth and authzContext
        const realRouteRes = await request(app)
          .get('/api/customers')
          .set('Authorization', cashierToken);
        expect(realRouteRes.status).toBe(403);
        expect(realRouteRes.body.code).toBe('MEMBERSHIP_SUSPENDED');
      } finally {
        await membership.update({ status: 'active' });
      }
    });
  });

  describe('5. Pool Configuration Validation (DB_POOL_MAX >= 1)', () => {
    const origPoolMax = process.env.DB_POOL_MAX;
    const origPoolMin = process.env.DB_POOL_MIN;

    afterEach(() => {
      if (origPoolMax === undefined) delete process.env.DB_POOL_MAX;
      else process.env.DB_POOL_MAX = origPoolMax;

      if (origPoolMin === undefined) delete process.env.DB_POOL_MIN;
      else process.env.DB_POOL_MIN = origPoolMin;

      jest.resetModules();
    });

    test('DB_POOL_MAX=0 or negative falls back to default (>= 1), while DB_POOL_MIN=0 is allowed', () => {
      process.env.DB_POOL_MAX = '0';
      process.env.DB_POOL_MIN = '0';
      jest.resetModules();

      const seqConfig = require('../src/config/sequelize');
      expect(seqConfig.development.pool.max).toBe(15);
      expect(seqConfig.test.pool.max).toBe(5);
      expect(seqConfig.production.pool.max).toBe(10);
      expect(seqConfig.production.pool.min).toBe(0);

      process.env.DB_POOL_MAX = '-3';
      jest.resetModules();
      const seqConfigNeg = require('../src/config/sequelize');
      expect(seqConfigNeg.production.pool.max).toBe(10);

      process.env.DB_POOL_MAX = '12';
      jest.resetModules();
      const seqConfigValid = require('../src/config/sequelize');
      expect(seqConfigValid.production.pool.max).toBe(12);
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
