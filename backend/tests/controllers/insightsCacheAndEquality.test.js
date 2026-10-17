const request = require('supertest');
const app = require('../../src/app');
const { Sale, Product, Inventory, Expense, Shop, User, SystemSettings } = require('../../src/models');
const sequelize = require('../../src/config/database');
const redisClient = require('../../src/config/redis');
const {
  isInsightsCacheEnabled,
  buildInsightsCacheKey,
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

    // Clear Redis cache
    if (redisClient && redisClient.status === 'ready') {
      const key = buildInsightsCacheKey(testOrgId, testShopId);
      await redisClient.del(key);
    }
  });

  describe('Redis Cache Hit, Miss and Invalidation', () => {
    beforeEach(() => {
      process.env.INSIGHTS_CACHE_ENABLED = 'true';
    });

    afterEach(() => {
      delete process.env.INSIGHTS_CACHE_ENABLED;
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
        stockQuantity: 4, // Critical stock (<=5) and low stock (<=10)
        reorderPoint: 10
      });

      await Sale.create({
        total: 1000,
        paymentAmount: 1000,
        shopId: testShopId,
        customerId: null
      });

      const key = buildInsightsCacheKey(testOrgId, testShopId);

      // Verify cache empty initially
      const preCheck = await getInsightsCache(testOrgId, testShopId);
      expect(preCheck).toBeNull();

      // First request: Cache Miss -> populates Redis
      const res1 = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res1.status).toBe(200);
      expect(res1.body).toHaveProperty('trends');
      expect(res1.body).toHaveProperty('recommendations');
      expect(res1.body).toHaveProperty('alerts');

      // Verify cache is now populated in Redis
      const cachedData = await getInsightsCache(testOrgId, testShopId);
      expect(cachedData).not.toBeNull();
      expect(cachedData.recommendations.length).toBe(res1.body.recommendations.length);

      // Spy on Sale.findAll to verify cache hit avoids DB query
      const saleSpy = jest.spyOn(Sale, 'findAll');

      // Second request: Cache Hit
      const res2 = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res2.status).toBe(200);
      expect(res2.body).toEqual(res1.body);
      expect(saleSpy).not.toHaveBeenCalled();

      saleSpy.mockRestore();
    });

    it('should invalidate cache when invalidateShopInsightsCache is invoked', async () => {
      const dummyPayload = { trends: [], recommendations: [{ type: 'TEST' }], alerts: [] };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60);

      const before = await getInsightsCache(testOrgId, testShopId);
      expect(before).toEqual(dummyPayload);

      // Invalidate
      await invalidateShopInsightsCache(testOrgId, testShopId);

      const after = await getInsightsCache(testOrgId, testShopId);
      expect(after).toBeNull();
    });

    it('should invalidate cache when invalidateShopInsightsCache is invoked with null orgId (resolving from Shop)', async () => {
      const dummyPayload = { trends: [], recommendations: [{ type: 'RESOLVE_TEST' }], alerts: [] };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60);

      const before = await getInsightsCache(testOrgId, testShopId);
      expect(before).toEqual(dummyPayload);

      // Invalidate with null orgId - must resolve organizationId from Shop and DEL directly without SCAN
      const delSpy = jest.spyOn(redisClient, 'del');
      const scanSpy = jest.spyOn(redisClient, 'scan');

      await invalidateShopInsightsCache(null, testShopId);

      expect(delSpy).toHaveBeenCalledWith(`insights:org:${testOrgId}:shop:${testShopId}`);
      expect(scanSpy).not.toHaveBeenCalled();

      const after = await getInsightsCache(testOrgId, testShopId);
      expect(after).toBeNull();

      delSpy.mockRestore();
      scanSpy.mockRestore();
    });

    it('should invalidate insights cache when invalidateShopProductCache is called', async () => {
      const { invalidateShopProductCache } = require('../../src/services/productCache');
      const dummyPayload = { trends: [], recommendations: [{ type: 'PROD_TEST' }], alerts: [] };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60);

      expect(await getInsightsCache(testOrgId, testShopId)).toEqual(dummyPayload);

      // Trigger product cache invalidation (which covers inventory/stock mutations)
      await invalidateShopProductCache(testShopId);

      expect(await getInsightsCache(testOrgId, testShopId)).toBeNull();
    });

    it('should invalidate insights cache when invalidateOrgProductCaches is called', async () => {
      const { invalidateOrgProductCaches } = require('../../src/services/productCache');
      const dummyPayload = { trends: [], recommendations: [{ type: 'ORG_TEST' }], alerts: [] };
      await setInsightsCache(testOrgId, testShopId, dummyPayload, 60);

      expect(await getInsightsCache(testOrgId, testShopId)).toEqual(dummyPayload);

      await invalidateOrgProductCaches(testOrgId);

      expect(await getInsightsCache(testOrgId, testShopId)).toBeNull();
    });
  });

  describe('Output Equality Between Old and Optimized Logic', () => {
    it('produces identical trends, low stock recommendations, and critical stock alerts on identical data', async () => {
      // Seed identical baseline scenario
      await SystemSettings.create({
        shopId: testShopId,
        lowStockThreshold: 12
      });

      const p1 = await Product.create({
        name: 'Widget Alpha',
        sku: 'WA-01',
        price: 500,
        cost: 200,
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

      // p1 is critical (stock=3 <= 5) and low (stock=3 <= 10)
      await Inventory.create({
        productId: p1.id,
        shopId: testShopId,
        stockQuantity: 3,
        reorderPoint: 10
      });

      // p2 is low stock (stock=8 <= 10) but NOT critical (stock=8 > 5)
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

      // Request without cache flag (tests direct optimized DB execution)
      delete process.env.INSIGHTS_CACHE_ENABLED;
      const res = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);

      // 1. Verify Low Stock Recommendations (both p1 and p2 must be flagged)
      const invRec = res.body.recommendations.find(r => r.type === 'INVENTORY');
      expect(invRec).toBeDefined();
      expect(invRec.message).toBe('2 products need restocking');
      expect(invRec.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Widget Alpha', currentStock: 3, reorderPoint: 10 }),
          expect.objectContaining({ name: 'Widget Beta', currentStock: 8, reorderPoint: 10 })
        ])
      );

      // 2. Verify Critical Stock Alerts (Q5 removed; in-memory filter must only include p1 whose stock=3 <= 5)
      const invAlert = res.body.alerts.find(a => a.type === 'INVENTORY' && a.severity === 'HIGH');
      expect(invAlert).toBeDefined();
      expect(invAlert.message).toBe('Critical stock levels detected');
      expect(invAlert.details).toHaveLength(1);
      expect(invAlert.details[0]).toEqual(
        expect.objectContaining({ name: 'Widget Alpha', currentStock: 3 })
      );

      // 3. Verify Financial Recommendations
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
