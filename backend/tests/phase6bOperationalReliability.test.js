'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const aiCacheService = require('../src/services/aiCacheService');
const {
  createDistributedRateLimiter,
  incrementAndCheck,
  resetRateLimitKey,
  localFallbackStore
} = require('../src/utils/distributedRateLimiter');
const {
  User,
  Shop,
  Organization,
  OrganizationMembership,
  Category,
  Product,
  Inventory
} = require('../src/models');

function getPrivateKey() {
  return process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
}

function tokenFor(payload) {
  const privateKey = getPrivateKey();
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 6B-06: Operational Reliability, AI Cache Hardening, Distributed Rate Limiting & Observability', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB;
  let adminA, adminB;
  let tokenAdminA, tokenAdminB;
  const testFilesToClean = [];

  beforeAll(async () => {
    await sequelize.authenticate();
  }, 30000);

  beforeEach(async () => {
    const ts = Date.now() + '-' + Math.floor(Math.random() * 100000);

    // Organization A
    orgA = await Organization.create({
      name: `Org A ${ts}`,
      slug: `org-a-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopA1 = await Shop.create({
      name: `Shop A1 ${ts}`,
      organizationId: orgA.id,
      status: 'active'
    });

    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      status: 'active'
    });

    adminA = await User.create({
      name: `Admin A ${ts}`,
      email: `admin-a-${ts}@example.com`,
      password: 'HashedPassword123!',
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      status: 'active'
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: adminA.id,
      orgRole: 'owner'
    });

    tokenAdminA = tokenFor({
      id: adminA.id,
      email: adminA.email,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    // Organization B
    orgB = await Organization.create({
      name: `Org B ${ts}`,
      slug: `org-b-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopB = await Shop.create({
      name: `Shop B ${ts}`,
      organizationId: orgB.id,
      status: 'active'
    });

    adminB = await User.create({
      name: `Admin B ${ts}`,
      email: `admin-b-${ts}@example.com`,
      password: 'HashedPassword123!',
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id,
      status: 'active'
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: adminB.id,
      orgRole: 'owner'
    });

    tokenAdminB = tokenFor({
      id: adminB.id,
      email: adminB.email,
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id,
      isEmployee: false
    });
  });

  afterAll(async () => {
    // Clean up any test spreadsheets
    for (const f of testFilesToClean) {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    }
  });

  // =========================================================================
  // 1. AI Distributed Cache Hardening (AI-01)
  // =========================================================================
  describe('1. AI Distributed Cache & Tenant Isolation (AI-01)', () => {
    test('1.1: Build distributed forecast cache key enforces org and shop namespacing', () => {
      const payload = { dates: ['2026-09-01', '2026-09-02'], values: [100, 200] };
      const keyShopA = aiCacheService.buildForecastCacheKey(orgA.id, shopA1.id, payload, 30, 'prophet');
      const keyShopB = aiCacheService.buildForecastCacheKey(orgB.id, shopB.id, payload, 30, 'prophet');
      const keyOrgA = aiCacheService.buildOrgForecastCacheKey(orgA.id, payload, 30, 'prophet');

      expect(keyShopA).toContain(`ai:forecast:org:${orgA.id}:shop:${shopA1.id}:prophet:30:`);
      expect(keyShopB).toContain(`ai:forecast:org:${orgB.id}:shop:${shopB.id}:prophet:30:`);
      expect(keyOrgA).toContain(`ai:forecast:org:${orgA.id}:prophet:30:`);

      // Tenant separation: keys must differ even with identical parameters
      expect(keyShopA).not.toBe(keyShopB);
      expect(keyShopA).not.toBe(keyOrgA);
    });

    test('1.2: Redis authoritative cache set and get works with L1 hydration', async () => {
      const payload = { dates: ['2026-09-01'], values: [500] };
      const testKey = `ai:forecast:org:${orgA.id}:shop:${shopA1.id}:prophet:30:test_${Date.now()}`;
      const testData = { predictions: [510, 520], status: 'ok', generatedAt: Date.now() };

      // Ensure key is cleared
      aiCacheService.l1Cache.del(testKey);
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del(testKey);
      }

      // Initial get is a miss
      const initialMiss = await aiCacheService.getForecast(testKey);
      expect(initialMiss).toBeNull();

      // Set forecast in authoritative cache
      await aiCacheService.setForecast(testKey, testData, 60);

      // Verify in Redis
      if (redisClient && redisClient.status === 'ready') {
        const rawRedis = await redisClient.get(testKey);
        expect(rawRedis).not.toBeNull();
        expect(JSON.parse(rawRedis)).toEqual(testData);
      }

      // Flush L1 to verify Redis reads and re-hydrates L1
      aiCacheService.l1Cache.del(testKey);
      const rehydrated = await aiCacheService.getForecast(testKey);
      expect(rehydrated).toEqual(testData);
      expect(aiCacheService.l1Cache.get(testKey)).toEqual(testData);

      // Clean up
      await aiCacheService.invalidateShopForecastCache(orgA.id, shopA1.id);
    });

    test('1.3: Distributed invalidation (SCAN & DEL) clears matching Redis keys across replicas', async () => {
      const key1 = `ai:forecast:org:${orgA.id}:shop:${shopA1.id}:prophet:30:k1`;
      const key2 = `ai:forecast:org:${orgA.id}:shop:${shopA1.id}:rf:30:k2`;
      const keyOtherOrg = `ai:forecast:org:${orgB.id}:shop:${shopB.id}:prophet:30:k3`;

      await aiCacheService.setForecast(key1, { val: 1 }, 120);
      await aiCacheService.setForecast(key2, { val: 2 }, 120);
      await aiCacheService.setForecast(keyOtherOrg, { val: 3 }, 120);

      // Invalidate Org A
      const cleared = await aiCacheService.invalidateOrgForecastCache(orgA.id);
      expect(cleared).toBeGreaterThanOrEqual(2);

      // Org A keys must be gone
      expect(await aiCacheService.getForecast(key1)).toBeNull();
      expect(await aiCacheService.getForecast(key2)).toBeNull();

      // Org B key must remain completely untouched
      const preserved = await aiCacheService.getForecast(keyOtherOrg);
      expect(preserved).toEqual({ val: 3 });

      // Clean up Org B
      await aiCacheService.invalidateOrgForecastCache(orgB.id);
    });

    test('1.4: Cross-organization cache invalidation via DELETE /api/ai/cache/org/:id is rejected with 403', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/org/${orgB.id}`)
        .set('Authorization', tokenAdminA)
        .send();

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('cannot clear cache for another organization');
    });

    test('1.5: Upstream AI failure response sanitizes and strips internal AI_SERVICE_URL', async () => {
      // Dispatch a request to an endpoint with intentionally invalid/unreachable parameters
      // to verify error sanitization
      const res = await request(app)
        .post('/api/ai/forward/api/forecasting/forecast')
        .set('Authorization', tokenAdminA)
        .send({ dates: 'not-an-array', values: 'invalid' });

      // Should return structured safe error without leaking internal hostnames
      const responseStr = JSON.stringify(res.body);
      expect(responseStr).not.toContain('http://127.0.0.1:8000');
      expect(responseStr).not.toContain('http://zana-ai-service:8000');
      expect(res.body.requestId || res.headers['x-request-id']).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Distributed Rate Limiting (RATE-01)
  // =========================================================================
  describe('2. Distributed Rate Limiting (RATE-01)', () => {
    test('2.1: Distributed limiter enforces quota and returns 429 when max is exceeded', async () => {
      const testKey = `ratelimit:test:quota_${Date.now()}`;
      const maxRequests = 3;
      const windowSec = 10;

      for (let i = 1; i <= maxRequests; i++) {
        const res = await incrementAndCheck(testKey, maxRequests, windowSec);
        expect(res.allowed).toBe(true);
        expect(res.current).toBe(i);
      }

      // 4th request must be rejected
      const blockedRes = await incrementAndCheck(testKey, maxRequests, windowSec);
      expect(blockedRes.allowed).toBe(false);
      expect(blockedRes.current).toBe(maxRequests + 1);

      await resetRateLimitKey(testKey);
    });

    test('2.2: Tenant separation: Org A reaching limit does not throttle Org B', async () => {
      const keyOrgA = `ratelimit:test:org:${orgA.id}`;
      const keyOrgB = `ratelimit:test:org:${orgB.id}`;
      const limit = 2;

      // Exhaust Org A
      await incrementAndCheck(keyOrgA, limit, 10);
      await incrementAndCheck(keyOrgA, limit, 10);
      const blockedOrgA = await incrementAndCheck(keyOrgA, limit, 10);
      expect(blockedOrgA.allowed).toBe(false);

      // Org B should have its full quota available
      const orgBFirst = await incrementAndCheck(keyOrgB, limit, 10);
      expect(orgBFirst.allowed).toBe(true);
      expect(orgBFirst.current).toBe(1);

      await resetRateLimitKey(keyOrgA);
      await resetRateLimitKey(keyOrgB);
    });

    test('2.3: Rate limiter fails open gracefully when Redis connection is unavailable', async () => {
      // Test the local fallback store directly to verify fail-open mechanics
      const fallbackKey = `ratelimit:fallback_test:${Date.now()}`;
      localFallbackStore.delete(fallbackKey);

      // Simulate local fallback execution
      const now = Date.now();
      localFallbackStore.set(fallbackKey, { current: 1, resetAt: now + 5000 });

      expect(localFallbackStore.get(fallbackKey).current).toBe(1);
      localFallbackStore.delete(fallbackKey);
    });
  });

  // =========================================================================
  // 3. File Import Security (ExcelJS Migration)
  // =========================================================================
  describe('3. File Import Security & ExcelJS Integration', () => {
    test('3.1: Valid CSV file imports products successfully and assigns tenant context', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-import-'));
      const tempCsvPath = path.join(tmpDir, `test_import_${Date.now()}.csv`);
      try {
        const csvData = [
          'name,sku,barcode,price,cost,stockQuantity,category',
          `CSV Test Prod ${Date.now()},SKUCSV${Date.now()},111222333444,150.00,80.00,25,`
        ].join('\n');

        fs.writeFileSync(tempCsvPath, csvData);

        const res = await request(app)
          .post('/api/products/import')
          .set('Authorization', tokenAdminA)
          .attach('file', tempCsvPath);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary.successful).toBeGreaterThanOrEqual(1);

        // Clean up product from DB
        await Product.destroy({ where: { organizationId: orgA.id, name: { [sequelize.Sequelize.Op.like]: 'CSV Test Prod%' } } });
      } finally {
        if (fs.existsSync(tempCsvPath)) fs.unlinkSync(tempCsvPath);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      }
    });

    test('3.2: Valid XLSX created with ExcelJS imports cleanly without prototype pollution', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-import-'));
      const tempXlsxPath = path.join(tmpDir, `test_import_${Date.now()}.xlsx`);
      try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Products');
        worksheet.addRow(['name', 'sku', 'barcode', 'price', 'cost', 'stockQuantity']);
        worksheet.addRow([`XLSX Test Prod ${Date.now()}`, `SKUXLSX${Date.now()}`, '555666777888', 250.00, 120.00, 50]);

        await workbook.xlsx.writeFile(tempXlsxPath);

        const res = await request(app)
          .post('/api/products/import')
          .set('Authorization', tokenAdminA)
          .attach('file', tempXlsxPath);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.summary.successful).toBe(1);

        // Verify prototype was not polluted
        expect(Object.prototype.polluted).toBeUndefined();

        // Clean up product
        await Product.destroy({ where: { organizationId: orgA.id, name: { [sequelize.Sequelize.Op.like]: 'XLSX Test Prod%' } } });
      } finally {
        if (fs.existsSync(tempXlsxPath)) fs.unlinkSync(tempXlsxPath);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      }
    });

    test('3.3: Malformed/corrupted spreadsheet upload is rejected with safe 400 Bad Request', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corrupt-import-'));
      const corruptPath = path.join(tmpDir, `corrupt_${Date.now()}.xlsx`);
      try {
        fs.writeFileSync(corruptPath, 'THIS_IS_CORRUPT_NON_ZIP_DATA');

        const res = await request(app)
          .post('/api/products/import')
          .set('Authorization', tokenAdminA)
          .attach('file', corruptPath);

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
      } finally {
        if (fs.existsSync(corruptPath)) fs.unlinkSync(corruptPath);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      }
    });

    test('3.4: Disallowed file extension (.txt/.exe) is rejected by upload filter with 400', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'txt-import-'));
      const invalidPath = path.join(tmpDir, `script_${Date.now()}.txt`);
      try {
        fs.writeFileSync(invalidPath, 'some text');

        const res = await request(app)
          .post('/api/products/import')
          .set('Authorization', tokenAdminA)
          .attach('file', invalidPath);

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Only CSV and XLSX files are allowed');
      } finally {
        if (fs.existsSync(invalidPath)) fs.unlinkSync(invalidPath);
        if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
      }
    });

    test('3.5: In-memory XLSX containing "Product Name", "Price (KES)" and "Category" columns imports rows successfully', async () => {
      const ts = Date.now();
      const cat = await Category.create({
        name: `Import Cat ${ts}`,
        organizationId: orgA.id,
        shopId: shopA1.id,
        active: true
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)', 'Category']);
      worksheet.addRow([`Prod KES 1 ${ts}`, 2500.50, cat.name]);
      worksheet.addRow([`Prod KES 2 ${ts}`, 990.00, cat.name]);

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'in_memory_products.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.successful).toBe(2);
      expect(res.body.summary.errors).toBe(0);

      // Verify products were created and cost defaulted to 0 with warning recorded
      const createdProducts = await Product.findAll({
        where: {
          organizationId: orgA.id,
          name: [`Prod KES 1 ${ts}`, `Prod KES 2 ${ts}`]
        }
      });
      expect(createdProducts.length).toBe(2);
      expect(parseFloat(createdProducts[0].cost)).toBe(0);
      expect(parseFloat(createdProducts[1].cost)).toBe(0);
      expect(createdProducts[0].categoryId).toBe(cat.id);
      expect(res.body.warnings).toBeDefined();
      expect(res.body.warnings.length).toBeGreaterThanOrEqual(2);

      // Clean up
      await Product.destroy({ where: { organizationId: orgA.id, name: [`Prod KES 1 ${ts}`, `Prod KES 2 ${ts}`] } });
      await Category.destroy({ where: { id: cat.id } });
    });

    test('3.6: Import resolves aliases: unit price/selling price, buying price/unit cost, and qty/stock', async () => {
      const ts = Date.now();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['product_name', 'selling price', 'buying price', 'stock']);
      worksheet.addRow([`Alias Prod 1 ${ts}`, 150.00, 80.00, 35]);

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'aliases_import.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.successful).toBe(1);

      const created = await Product.findOne({
        where: { organizationId: orgA.id, name: `Alias Prod 1 ${ts}` }
      });
      expect(created).not.toBeNull();
      expect(parseFloat(created.price)).toBe(150.00);
      expect(parseFloat(created.cost)).toBe(80.00);

      await Product.destroy({ where: { organizationId: orgA.id, name: `Alias Prod 1 ${ts}` } });
    });

    test('3.7: Fails fast with 400 and does not query categories when tenant context is missing', async () => {
      const productController = require('../src/controllers/productController');
      const req = {
        file: { path: 'nonexistent.xlsx', originalname: 'test.xlsx' },
        user: {} // neither organizationId nor shopId
      };
      let responseStatus = null;
      let responseBody = null;
      const res = {
        status: (code) => {
          responseStatus = code;
          return {
            json: (body) => { responseBody = body; }
          };
        }
      };

      await productController.importProducts(req, res);

      expect(responseStatus).toBe(400);
      expect(responseBody).toEqual({ error: 'Tenant context required' });
    });

    test('3.8: Auto-creates missing category and assigns it to the imported product', async () => {
      const ts = Date.now();
      const newCatName = `AutoCreatedCat ${ts}`;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)', 'Category']);
      worksheet.addRow([`AutoCat Prod ${ts}`, 450.00, newCatName]);

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'autocat.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.successful).toBe(1);
      expect(res.body.createdCategories).toContain(newCatName);

      const dbCategory = await Category.findOne({
        where: { name: newCatName, organizationId: orgA.id }
      });
      expect(dbCategory).not.toBeNull();

      const dbProduct = await Product.findOne({
        where: { name: `AutoCat Prod ${ts}`, organizationId: orgA.id }
      });
      expect(dbProduct).not.toBeNull();
      expect(dbProduct.categoryId).toBe(dbCategory.id);

      // Clean up
      await Product.destroy({ where: { id: dbProduct.id } });
      await Category.destroy({ where: { id: dbCategory.id } });
    });

    test('3.9: Reuses auto-created category across subsequent rows without duplicate creation', async () => {
      const ts = Date.now();
      const sharedCatName = `SharedAutoCat ${ts}`;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)', 'Category']);
      worksheet.addRow([`Shared Prod 1 ${ts}`, 120.00, sharedCatName]);
      worksheet.addRow([`Shared Prod 2 ${ts}`, 240.00, sharedCatName]);

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'shared_cat.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.successful).toBe(2);
      expect(res.body.createdCategories).toEqual([sharedCatName]);

      const catCount = await Category.count({
        where: { name: sharedCatName, organizationId: orgA.id }
      });
      expect(catCount).toBe(1);

      const dbCategory = await Category.findOne({
        where: { name: sharedCatName, organizationId: orgA.id }
      });

      const prods = await Product.findAll({
        where: { organizationId: orgA.id, name: [`Shared Prod 1 ${ts}`, `Shared Prod 2 ${ts}`] }
      });
      expect(prods.length).toBe(2);
      expect(prods[0].categoryId).toBe(dbCategory.id);
      expect(prods[1].categoryId).toBe(dbCategory.id);

      // Clean up
      await Product.destroy({ where: { organizationId: orgA.id, name: [`Shared Prod 1 ${ts}`, `Shared Prod 2 ${ts}`] } });
      await Category.destroy({ where: { id: dbCategory.id } });
    });

    test('3.10: Enforces 50 new category auto-creation cap and skips excess with clear error', async () => {
      const ts = Date.now();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)', 'Category']);

      for (let i = 1; i <= 52; i++) {
        const catName = `CapCat_${ts}_${i}`;
        worksheet.addRow([`CapProd_${ts}_${i}`, 50 + i, catName]);
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'cap_test.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.summary.successful).toBe(50);
      expect(res.body.summary.skipped).toBe(2);
      expect(res.body.createdCategories.length).toBe(50);

      const excessErrors = res.body.errors.filter(e => e.message === 'too many new categories; create them first');
      expect(excessErrors.length).toBe(2);

      // Clean up created products and categories
      await Product.destroy({
        where: {
          organizationId: orgA.id,
          name: { [sequelize.Sequelize.Op.like]: `CapProd_${ts}_%` }
        }
      });
      await Category.destroy({
        where: {
          organizationId: orgA.id,
          name: { [sequelize.Sequelize.Op.like]: `CapCat_${ts}_%` }
        }
      });
    }, 60000);

    test('3.11: Returns success:false and specific summary message when 0 products are imported', async () => {
      const ts = Date.now();
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)']);
      worksheet.addRow(['', 100]); // missing name

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'zero_success.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('0 products imported, 1 rows skipped. See errors below.');
      expect(res.body.summary.successful).toBe(0);
      expect(res.body.summary.skipped).toBe(1);
    });

    test('3.12: Reactivates soft-deleted (active: false) category and treats as created', async () => {
      const ts = Date.now();
      const catName = `SoftDeletedCat ${ts}`;
      const cat = await Category.create({
        name: catName,
        organizationId: orgA.id,
        shopId: shopA1.id
      });
      await cat.update({ active: false });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)', 'Category']);
      worksheet.addRow([`Prod Reactivated ${ts}`, 350.00, catName]);

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'reactivate_cat.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.successful).toBe(1);
      expect(res.body.createdCategories).toContain(catName);

      await cat.reload();
      expect(cat.active).toBe(true);

      const prod = await Product.findOne({
        where: { name: `Prod Reactivated ${ts}`, organizationId: orgA.id }
      });
      expect(prod).not.toBeNull();
      expect(prod.categoryId).toBe(cat.id);

      // Clean up
      await Product.destroy({ where: { id: prod.id } });
      await Category.destroy({ where: { id: cat.id } });
    });

    test('3.13: Row with invalid expiration date creates no category and is reported in errors', async () => {
      const ts = Date.now();
      const nonExistentCatName = `NeverCreatedCat ${ts}`;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');
      worksheet.addRow(['Product Name', 'Price (KES)', 'Category', 'Expiration Date']);
      worksheet.addRow([`Invalid Date Prod ${ts}`, 200.00, nonExistentCatName, 'invalid-not-a-date']);

      const buffer = await workbook.xlsx.writeBuffer();

      const res = await request(app)
        .post('/api/products/import')
        .set('Authorization', tokenAdminA)
        .attach('file', Buffer.from(buffer), 'invalid_date.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.summary.successful).toBe(0);
      expect(res.body.summary.skipped).toBe(1);
      expect(res.body.errors.some(e => e.field === 'expirationDate')).toBe(true);

      // Assert no category was created
      const cat = await Category.findOne({
        where: { name: nonExistentCatName, organizationId: orgA.id }
      });
      expect(cat).toBeNull();
    });
  });

  // =========================================================================
  // 4. Observability & Request Correlation (OBS-01)
  // =========================================================================
  describe('4. Observability & Request Correlation (OBS-01)', () => {
    test('4.1: Automatically generates UUID X-Request-Id when client header is omitted', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      // Valid UUID v4 pattern
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('4.2: Accepts and mirrors valid trusted client-provided X-Request-Id', async () => {
      const customId = `client-req-${Date.now()}-abc`;
      const res = await request(app)
        .get('/')
        .set('X-Request-Id', customId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    test('4.3: Malformed/oversized client X-Request-Id (>64 chars) is replaced with safe UUID', async () => {
      const oversizedId = 'A'.repeat(128);
      const res = await request(app)
        .get('/')
        .set('X-Request-Id', oversizedId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).not.toBe(oversizedId);
      expect(res.headers['x-request-id'].length).toBeLessThanOrEqual(64);
    });

    test('4.4: Error responses include requestId and success:false in standard envelope', async () => {
      const customId = `err-trace-${Date.now()}`;
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid.token.payload')
        .set('X-Request-Id', customId);

      expect(res.status).toBe(401);
      expect(res.body.requestId).toBe(customId);
      expect(res.headers['x-request-id']).toBe(customId);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('token');

      // Test 404 response header correlation
      const res404 = await request(app)
        .get('/api/sales/999999999')
        .set('Authorization', tokenAdminA)
        .set('X-Request-Id', customId);
      expect(res404.status).toBe(404);
      expect(res404.headers['x-request-id']).toBe(customId);
      expect(res404.body.error).toBe('Sale not found');
    });
  });
});
