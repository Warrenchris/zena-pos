/**
 * Backend Database Integration Test: Public Receipt Endpoint & Token Hashing (Phase 5)
 *
 * NOTE: THIS TEST REQUIRES A LIVE MYSQL DATABASE CONNECTION AND MIGRATED SCHEMA.
 * If MySQL is offline, it skips execution gracefully.
 */

const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { Shop, Sale, SaleItem, Product, SystemSettings } = require('../src/models');

describe('Backend DB Public Receipt Integration [REQUIRES LIVE MYSQL DB]', () => {
  let dbAvailable = false;
  let testShop = null;
  let testProduct = null;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      dbAvailable = true;

      testShop = await Shop.findOne();
      if (!testShop) {
        testShop = await Shop.create({
          name: 'Phase 5 Test Shop',
          currency: 'KES',
          status: 'active',
          address: 'Kimathi Street, Nairobi',
          phone: '+254711000111',
          kraPin: 'A009988776B',
        });
      }

      await SystemSettings.upsert({
        shopId: testShop.id,
        branch: 'Central Branch',
        tagline: 'Always Fresh',
        showPoweredBy: true,
        receiptHeader: 'Welcome to Test Shop',
        receiptFooter: 'Asante sana!',
        taxRate: 16,
        taxInclusive: false,
      });

      testProduct = await Product.findOne({ where: { shopId: testShop.id } });
      if (!testProduct) {
        testProduct = await Product.create({
          shopId: testShop.id,
          organizationId: testShop.organizationId || 1,
          name: 'Test Milk 500ml',
          price: 65.00,
          buyingPrice: 50.00,
          cost: 50.00,
          sku: `SKU-${Date.now()}`,
          stockQuantity: 100,
        });
      }
    } catch (err) {
      console.warn('MySQL database unavailable. Skipping live DB test:', err.message);
      dbAvailable = false;
    }
  });



  test('retrieves public receipt by valid token and strictly excludes PII', async () => {
    if (!dbAvailable) {
      console.log('SKIPPING: Live MySQL DB required for public receipt DB test');
      return;
    }

    const rawToken = 'token55_valid_12345678'; // 22 chars
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const receiptNumber = `R-LIVE-${Math.floor(100000 + Math.random() * 900000)}`;

    const sale = await Sale.create({
      shopId: testShop.id,
      receiptNumber,
      invoiceNumber: 'INV-TEST-001',
      receiptTokenHash: tokenHash,
      idempotencyKey: `idemp-${Date.now()}`,
      subtotal: 130.00,
      tax: 20.80,
      taxAmount: 20.80,
      taxRate: 16.00,
      taxInclusive: false,
      total: 150.80,
      paymentMethod: 'cash',
      paymentAmount: 200.00,
      change: 49.20,
      changeAmount: 49.20,
      customerName: 'Secret PII Customer',
      customerPhone: '+254799999999',
      customerEmail: 'secret@pii.com',
      cashierName: 'Secret PII Cashier',
    });

    await SaleItem.create({
      shopId: testShop.id,
      saleId: sale.id,
      productId: testProduct.id,
      quantity: 2,
      price: 65.00,
      total: 130.00,
    });

    // Request public receipt endpoint
    const res = await request(app)
      .get(`/api/public/receipts/${rawToken}`)
      .expect(200);

    // Headers
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex');

    const body = res.body;
    expect(body.documentType).toBe('SALES_RECEIPT');
    expect(body.business.name).toBe(testShop.name);
    expect(body.business.branch).toBe('Central Branch');
    expect(body.meta.receiptNumber).toBe(receiptNumber);
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0].name).toBe(testProduct.name);
    expect(body.lines[0].quantity).toBe(2);
    expect(body.lines[0].unitPrice).toBe(65);
    expect(body.lines[0].lineTotal).toBe(130);
    expect(body.totals.total).toBe(150.80);
    expect(body.totals.tendered).toBe(200.00);
    expect(body.totals.change).toBe(49.20);

    // Strict PII checks
    const jsonStr = JSON.stringify(body);
    expect(jsonStr).not.toContain('Secret PII Customer');
    expect(jsonStr).not.toContain('+254799999999');
    expect(jsonStr).not.toContain('secret@pii.com');
    expect(jsonStr).not.toContain('Secret PII Cashier');
    expect(jsonStr).not.toContain(tokenHash);

    // Cleanup
    await SaleItem.destroy({ where: { saleId: sale.id } });
    await sale.destroy();
  });

  test('returns 404 for unknown token or malformed token', async () => {
    if (!dbAvailable) return;

    // Unknown 22-char token
    await request(app)
      .get('/api/public/receipts/nonexistent_token_123')
      .expect(404);

    // Malformed token (short)
    await request(app)
      .get('/api/public/receipts/short')
      .expect(404);
  });

  test('enforces unique constraint on receiptTokenHash in database', async () => {
    if (!dbAvailable) return;

    const rawToken = 'tokendup_1234567890123';
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const sale1 = await Sale.create({
      shopId: testShop.id,
      receiptNumber: `R-DUP1-${Math.floor(100000 + Math.random() * 900000)}`,
      receiptTokenHash: tokenHash,
      idempotencyKey: `idemp-dup-1-${Date.now()}`,
      total: 100,
      paymentMethod: 'cash',
      paymentAmount: 100,
    });

    // Inserting a second sale with the exact same receiptTokenHash must fail
    await expect(
      Sale.create({
        shopId: testShop.id,
        receiptNumber: `R-DUP2-${Math.floor(100000 + Math.random() * 900000)}`,
        receiptTokenHash: tokenHash,
        idempotencyKey: `idemp-dup-2-${Date.now()}`,
        total: 200,
        paymentMethod: 'cash',
      paymentAmount: 100,
      })
    ).rejects.toThrow();

    await sale1.destroy();
  });

  test('rate limits requests exceeding 30 req/min per IP', async () => {
    if (!dbAvailable) return;

    // Send requests until rate limited
    const testIp = '198.51.100.99';
    let hitRateLimit = false;

    for (let i = 0; i < 35; i++) {
      const res = await request(app)
        .get('/api/public/receipts/nonexistent_token_123')
        .set('X-Forwarded-For', testIp);
      if (res.status === 429) {
        hitRateLimit = true;
        expect(res.body.error).toContain('Too many requests');
        break;
      }
    }

    expect(hitRateLimit).toBe(true);
  });
});
