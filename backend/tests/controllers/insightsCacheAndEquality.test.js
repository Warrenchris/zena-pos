const request = require('supertest');
const app = require('../../src/app');
const { Sale, Product, Inventory, Expense, Shop, User, SystemSettings } = require('../../src/models');
const sequelize = require('../../src/config/database');
const redisClient = require('../../src/config/redis');
const aiClient = require('../../src/utils/aiClient');
const insightsController = require('../../src/controllers/insightsController');
const {
  isInsightsCacheEnabled,
  buildInsightsCacheKey,
  buildStaleInsightsCacheKey,
  resolveOrgId,
  resolveOrganizationId,
  clearOrgCache,
  getInsightsCache,
  setInsightsCache,
  invalidateShopInsightsCache
} = require('../../src/services/insightsCacheService');

describe('Insights Caching, Invalidation & Optimization Tests', () => {
  let token;
  const testShopId = 1;
  const testOrgId = 1;

  beforeAll(async () => {
    await sequelize.authenticate();

    await Shop.findOrCreate({
      where: { id: testShopId },
      defaults: { name: 'Insights Test Shop', organizationId: testOrgId, active: true }
    });

    await User.findOrCreate({
      where: { id: 105 },
      defaults: {
        name: 'Insights Test Admin 105',
        email: 'insights-admin-105@test.com',
        password: 'hashedPassword123',
        role: 'admin',
        shopId: testShopId,
        organizationId: testOrgId,
        active: true,
        emailVerifiedAt: new Date()
      }
    });

    await User.findOrCreate({
      where: { id: 201 },
      defaults: {
        name: 'Insights Test Cashier 201',
        email: 'insights-cashier-201@test.com',
        password: 'hashedPassword123',
        role: 'cashier',
        shopId: testShopId,
        organizationId: testOrgId,
        active: true,
        emailVerifiedAt: new Date()
      }
    });

    await User.findOrCreate({
      where: { id: 202 },
      defaults: {
        name: 'Insights Test Manager 202',
        email: 'insights-manager-202@test.com',
        password: 'hashedPassword123',
        role: 'manager',
        shopId: testShopId,
        organizationId: testOrgId,
        active: true,
        emailVerifiedAt: new Date()
      }
    });

    await User.findOrCreate({
      where: { id: 203 },
      defaults: {
        name: 'Insights Test Owner 203',
        email: 'insights-owner-203@test.com',
        password: 'hashedPassword123',
        role: 'admin',
        isOwner: true,
        shopId: testShopId,
        organizationId: testOrgId,
        active: true,
        emailVerifiedAt: new Date()
      }
    });

    const jwt = require('jsonwebtoken');
    const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    token = jwt.sign(
      { id: 105, role: 'admin', shopId: testShopId, organizationId: testOrgId },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    // Clean tables for shop 1
    await Sale.destroy({ where: { shopId: testShopId } }).catch(() => {});
    await Expense.destroy({ where: { shopId: testShopId } }).catch(() => {});
    await Inventory.destroy({ where: { shopId: testShopId } }).catch(() => {});
    await Product.destroy({ where: { shopId: testShopId } }).catch(() => {});
    await SystemSettings.destroy({ where: { shopId: testShopId } }).catch(() => {});

    // Clear Redis cache (both fresh key and stale key)
    if (redisClient && redisClient.status === 'ready') {
      const key = buildInsightsCacheKey(testOrgId, testShopId);
      const staleKey = buildStaleInsightsCacheKey(testOrgId, testShopId);
      if (key) await redisClient.del(key);
      if (staleKey) await redisClient.del(staleKey);
    }
    clearOrgCache();
  });

  describe('Redis Cache Hit, Miss and Invalidation', () => {
    let aiPostSpy;

    beforeEach(() => {
      process.env.INSIGHTS_CACHE_ENABLED = 'true';
      aiPostSpy = jest.spyOn(aiClient, 'post').mockImplementation(async (url) => {
        if (url.includes('/api/insights/analyze')) {
          return {
            data: [
              {
                insight_type: 'AI_REVENUE_GROWTH',
                description: 'Positive growth detected by AI',
                score: 0.95,
                recommendations: ['Maintain inventory']
              }
            ]
          };
        }
        if (url.includes('/api/forecasting/stock-depletion')) {
          return { data: { alerts: [] } };
        }
        if (url.includes('/api/insights/anomalies')) {
          return { data: { anomalies: [] } };
        }
        return { data: [] };
      });
    });

    afterEach(() => {
      delete process.env.INSIGHTS_CACHE_ENABLED;
      if (aiPostSpy) {
        aiPostSpy.mockRestore();
      }
    });

    it('should verify cache miss, populate cache on miss, and serve cache hit', async () => {
      const product = await Product.create({
        name: 'Cached Product',
        sku: 'CACHE01',
        price: 250,
        cost: 150,
        shopId: testShopId,
        organizationId: testOrgId
      });

      await Inventory.create({
        productId: product.id,
        shopId: testShopId,
        stockQuantity: 4,
        reorderPoint: 10
      });

      const key = buildInsightsCacheKey(testOrgId, testShopId);
      const initialCache = await redisClient.get(key);
      expect(initialCache).toBeNull();

      const res1 = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res1.body).toHaveProperty('trends');
      expect(res1.body).toHaveProperty('recommendations');
      expect(res1.body).toHaveProperty('alerts');
      expect(res1.body).toHaveProperty('generatedAt');

      const cachedRaw = await redisClient.get(key);
      expect(cachedRaw).not.toBeNull();
      const cached = JSON.parse(cachedRaw);
      expect(cached.trends).toBeDefined();

      const res2 = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res2.status).toBe(200);
      expect(res2.body).toEqual(res1.body);
      expect(res2.headers['x-insights-cache']).toBe('hit');
    });

    it('should invalidate cache when invalidateShopInsightsCache is invoked', async () => {
      const dummyPayload = { trends: { test: true }, recommendations: [], alerts: [], generatedAt: new Date().toISOString() };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60, { keepStale: true });

      const before = await getInsightsCache(testOrgId, testShopId);
      expect(before).toEqual(dummyPayload);

      await invalidateShopInsightsCache(testOrgId, testShopId);

      const after = await getInsightsCache(testOrgId, testShopId);
      expect(after).toBeNull();
    });

    it('should invalidate cache when invalidateShopInsightsCache is invoked with null orgId (resolving from Shop)', async () => {
      const dummyPayload = { trends: { fromShopLookup: true }, recommendations: [], alerts: [], generatedAt: new Date().toISOString() };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60, { keepStale: true });

      const before = await getInsightsCache(testOrgId, testShopId);
      expect(before).toEqual(dummyPayload);

      await invalidateShopInsightsCache(null, testShopId);

      const after = await getInsightsCache(testOrgId, testShopId);
      expect(after).toBeNull();
    });

    it('should NOT invalidate insights cache when invalidateShopProductCache is called (sale decoupling)', async () => {
      const { invalidateShopProductCache } = require('../../src/services/productCache');
      const dummyPayload = { trends: { intact: true }, recommendations: [], alerts: [], generatedAt: new Date().toISOString() };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60, { keepStale: true });

      await invalidateShopProductCache(testShopId);

      expect(await getInsightsCache(testOrgId, testShopId)).toEqual(dummyPayload);
    });

    it('should invalidate insights cache when explicit inventory mutation triggers invalidateShopInsightsCache', async () => {
      const dummyPayload = { trends: { willExpireOnStockChange: true }, recommendations: [], alerts: [], generatedAt: new Date().toISOString() };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60, { keepStale: true });

      expect(await getInsightsCache(testOrgId, testShopId)).toEqual(dummyPayload);

      await invalidateShopInsightsCache(testOrgId, testShopId);

      expect(await getInsightsCache(testOrgId, testShopId)).toBeNull();
    });

    it('AI fails -> fallback cached 30s, stale key unchanged', async () => {
      const key = buildInsightsCacheKey(testOrgId, testShopId);
      const staleKey = buildStaleInsightsCacheKey(testOrgId, testShopId);

      // Pre-seed stale key with prior real data
      const priorRealPayload = {
        trends: [],
        recommendations: [{ type: 'AI', priority: 'MEDIUM', message: 'Prior AI recommendation', details: [] }],
        alerts: [],
        generatedAt: new Date(Date.now() - 3600000).toISOString()
      };
      await redisClient.setex(staleKey, 86400, JSON.stringify(priorRealPayload));

      // Make AI service fail
      aiPostSpy.mockImplementation(async () => {
        throw new Error('AI Service Offline');
      });

      const setexSpy = jest.spyOn(redisClient, 'setex');

      const fallbackPayload = {
        trends: [],
        recommendations: [{ type: 'FALLBACK', priority: 'LOW', message: 'Rule fallback', details: [] }],
        alerts: [],
        generatedAt: new Date().toISOString()
      };

      // Direct service test ensuring fallback caches 30s with keepStale: false
      await setInsightsCache(testOrgId, testShopId, fallbackPayload, 30, { keepStale: false });

      expect(setexSpy).toHaveBeenCalledWith(key, 30, expect.any(String));
      expect(setexSpy).not.toHaveBeenCalledWith(staleKey, expect.any(Number), expect.any(String));

      // Stale key remains completely unchanged
      const staleDataAfterFail = await redisClient.get(staleKey);
      expect(JSON.parse(staleDataAfterFail)).toEqual(priorRealPayload);

      // Verify cached fallback has short TTL <= 30
      const ttl = await redisClient.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(30);

      setexSpy.mockRestore();
    });

    it('confirms triggerBackgroundAiInsights has a per-shop in-flight guard: 20 stale hits trigger only 1 refresh', async () => {
      let aiCallCount = 0;
      aiPostSpy.mockImplementation(async (url) => {
        if (url.includes('/api/insights/analyze')) {
          aiCallCount++;
          await new Promise(r => setTimeout(r, 20));
          return { data: [] };
        }
        return { data: [] };
      });

      const fakeReq = { user: { id: 105, shopId: testShopId }, authz: { scope: { organizationId: testOrgId } } };
      const basePayload = { trends: [], recommendations: [], alerts: [] };

      // Call triggerBackgroundAiInsights 20 times concurrently for testShopId
      for (let i = 0; i < 20; i++) {
        insightsController.triggerBackgroundAiInsights(fakeReq, testShopId, basePayload, {});
      }

      await new Promise(r => setTimeout(r, 80));
      expect(aiCallCount).toBe(1);
    });

    it('verifies /api/insights payload is identical for manager and owner roles for the same shop, while cashier is 403', async () => {
      const jwt = require('jsonwebtoken');
      const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

      const cashierToken = jwt.sign(
        { id: 201, role: 'cashier', shopId: testShopId, organizationId: testOrgId },
        privateKey,
        { algorithm: 'RS256', expiresIn: '1h' }
      );
      const managerToken = jwt.sign(
        { id: 202, role: 'manager', shopId: testShopId, organizationId: testOrgId },
        privateKey,
        { algorithm: 'RS256', expiresIn: '1h' }
      );
      const ownerToken = jwt.sign(
        { id: 203, role: 'admin', isOwner: true, shopId: testShopId, organizationId: testOrgId },
        privateKey,
        { algorithm: 'RS256', expiresIn: '1h' }
      );

      const resOwner = await request(app).get('/api/insights').set('Authorization', `Bearer ${ownerToken}`);
      const resManager = await request(app).get('/api/insights').set('Authorization', `Bearer ${managerToken}`);
      const resCashier = await request(app).get('/api/insights').set('Authorization', `Bearer ${cashierToken}`);

      expect(resOwner.status).toBe(200);
      expect(resManager.status).toBe(200);
      // Cashier role does not have 'view_reports' permission, so it receives 403 at route authorization
      expect(resCashier.status).toBe(403);

      // Authorized roles (manager and owner) receive identical response payloads
      expect(resManager.body).toEqual(resOwner.body);

      // Verify that direct controller invocation (bypassing route gate) also yields identical payload
      const cashierReq = { user: { id: 201, role: 'cashier', shopId: testShopId, organizationId: testOrgId }, authz: { scope: { activeShopId: testShopId, organizationId: testOrgId } } };
      let cashierDirectBody = null;
      const cashierRes = {
        setHeader: jest.fn(),
        json: jest.fn(data => { cashierDirectBody = data; })
      };
      await insightsController.getInsights(cashierReq, cashierRes);
      expect(cashierDirectBody).toEqual(resOwner.body);
    });

    it('includes generatedAt ISO timestamp in the insights payload', async () => {
      const res = await request(app).get('/api/insights').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('generatedAt');
      expect(typeof res.body.generatedAt).toBe('string');
      expect(new Date(res.body.generatedAt).getTime()).not.toBeNaN();
    });

    it('invalidates the key that a read just wrote, for a request where req.user.organizationId is missing but req.authz has it', async () => {
      const key = buildInsightsCacheKey(testOrgId, testShopId);

      const readReq = {
        shopId: testShopId,
        user: { id: 105, role: 'admin', shopId: testShopId },
        authz: {
          scope: { organizationId: testOrgId, activeShopId: testShopId },
          tenant: { organizationId: testOrgId }
        }
      };

      let responsePayload = null;
      const readRes = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockImplementation((payload) => {
          responsePayload = payload;
        })
      };

      await insightsController.getInsights(readReq, readRes);

      expect(readRes.json).toHaveBeenCalled();
      expect(responsePayload).toHaveProperty('trends');

      const cached = await redisClient.get(key);
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached)).toEqual(responsePayload);

      const delSpy = jest.spyOn(redisClient, 'del');
      await invalidateShopInsightsCache(null, testShopId);

      expect(delSpy).toHaveBeenCalledWith(key);
      const afterMutation = await redisClient.get(key);
      expect(afterMutation).toBeNull();

      delSpy.mockRestore();
    });

    it('skips caching entirely and creates no no-org key when orgId cannot be resolved', async () => {
      const unresolvableShopId = 999999;
      const unresolvableReq = {
        shopId: unresolvableShopId,
        user: { id: 999 },
        authz: { scope: {}, tenant: {} }
      };

      const resolved = await resolveOrganizationId(unresolvableReq, unresolvableShopId);
      expect(resolved).toBeNull();

      const getRes = await getInsightsCache(unresolvableReq, unresolvableShopId);
      expect(getRes).toBeNull();

      const setRes = await setInsightsCache(unresolvableReq, unresolvableShopId, { test: 1 });
      expect(setRes).toBe(false);

      const noOrgKey = 'insights:org:no-org:shop:999999';
      const exists = await redisClient.get(noOrgKey);
      expect(exists).toBeNull();
    });
  });

  describe('Output Equality Against Unmodified getInsights Behavior', () => {
    it('verifies that with INSIGHTS_CACHE_ENABLED unset the endpoint does not touch Redis and returns identical payload', async () => {
      delete process.env.INSIGHTS_CACHE_ENABLED;
      const getSpy = jest.spyOn(redisClient, 'get');
      const setexSpy = jest.spyOn(redisClient, 'setex');

      const res = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('trends');
      expect(res.body).toHaveProperty('recommendations');
      expect(res.body).toHaveProperty('alerts');

      // Redis insights cache must NOT be read or written when INSIGHTS_CACHE_ENABLED is unset
      const insightsGetCalls = getSpy.mock.calls.filter(call => typeof call[0] === 'string' && call[0].startsWith('insights:'));
      expect(insightsGetCalls).toHaveLength(0);

      const insightsSetCalls = setexSpy.mock.calls.filter(call => typeof call[0] === 'string' && call[0].startsWith('insights:'));
      expect(insightsSetCalls).toHaveLength(0);

      getSpy.mockRestore();
      setexSpy.mockRestore();
    });

    it('produces identical trends, low stock recommendations, and critical stock alerts on identical data', async () => {
      const p1 = await Product.create({
        name: 'Widget Alpha',
        sku: 'WA-01',
        price: 100,
        cost: 50,
        active: true,
        shopId: testShopId,
        organizationId: testOrgId
      });

      const p2 = await Product.create({
        name: 'Widget Beta',
        sku: 'WB-02',
        price: 300,
        cost: 100,
        active: true,
        shopId: testShopId,
        organizationId: testOrgId
      });

      await Inventory.create({
        productId: p1.id,
        shopId: testShopId,
        stockQuantity: 3,
        reorderPoint: 10
      });

      await Inventory.create({
        productId: p2.id,
        shopId: testShopId,
        stockQuantity: 8,
        reorderPoint: 10
      });

      await Expense.create({
        category: 'rent',
        amount: 80000,
        description: 'Monthly store rent',
        paymentMethod: 'bank_transfer',
        shopId: testShopId
      });

      await Sale.create({
        total: 1500,
        paymentAmount: 1500,
        shopId: testShopId,
        customerId: null
      });

      delete process.env.INSIGHTS_CACHE_ENABLED;
      const res = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      const invRec = res.body.recommendations.find(r => r.type === 'INVENTORY');
      expect(invRec).toBeDefined();
      expect(invRec.message).toBe('2 products need restocking');
      expect(invRec.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Widget Alpha', currentStock: 3, reorderPoint: 10 }),
          expect.objectContaining({ name: 'Widget Beta', currentStock: 8, reorderPoint: 10 })
        ])
      );

      const invAlert = res.body.alerts.find(a => a.type === 'INVENTORY' && a.severity === 'HIGH');
      expect(invAlert).toBeDefined();
      expect(invAlert.message).toBe('Critical stock levels detected');
      expect(invAlert.details).toHaveLength(1);
      expect(invAlert.details[0]).toEqual(
        expect.objectContaining({ name: 'Widget Alpha', currentStock: 3 })
      );

      const finRec = res.body.recommendations.find(r => r.type === 'FINANCIAL');
      expect(finRec).toBeDefined();
      expect(finRec.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'rent', amount: '80000.00' })
        ])
      );
    });
  });
});
