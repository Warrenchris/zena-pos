'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const app = require('../src/app');
const sequelize = require('../src/config/database');

jest.mock('axios');
const {
  User,
  Shop,
  Organization,
  Product,
  Inventory,
  Sale,
  SaleItem,
  SalePayment,
  StockMovement,
  PendingPayment
} = require('../src/models');

function getPrivateKey() {
  const fs = require('fs');
  const path = require('path');
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

describe('Phase 6B-03: POS Resilience & Client Idempotency Hardening (POS-01)', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB;
  let userA, userB;
  let tokenA, tokenB;
  let productA1, inventoryA1;
  let productA2, inventoryA2;
  let productB, inventoryB;

  beforeAll(async () => {
    process.env.FLW_SECRET_KEY = 'FLWSECK_TEST-mock_secret_key';
    process.env.FLW_PUBLIC_KEY = 'FLWPUBK_TEST-mock_public_key';
    await sequelize.authenticate();
  }, 30000);

  beforeEach(async () => {
    jest.clearAllMocks();
    const ts = Date.now() + '-' + Math.floor(Math.random() * 100000);

    // Organization A
    orgA = await Organization.create({
      name: `Org A ${ts}`,
      slug: `org-a-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // Shop A1 (Branch 1)
    shopA1 = await Shop.create({
      name: `Shop A1 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    // Shop A2 (Branch 2)
    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    userA = await User.create({
      name: `User A ${ts}`,
      email: `user-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    tokenA = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    // Organization B (Tenant B)
    orgB = await Organization.create({
      name: `Org B ${ts}`,
      slug: `org-b-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopB = await Shop.create({
      name: `Shop B ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    userB = await User.create({
      name: `User B ${ts}`,
      email: `user-b-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id
    });

    tokenB = tokenFor({
      id: userB.id,
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id,
      isEmployee: false
    });

    // Product & Inventory for Shop A1
    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      price: 100,
      cost: 50,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    inventoryA1 = await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 50,
      reorderPoint: 5
    });

    // Product & Inventory for Shop A2
    productA2 = await Product.create({
      name: `Product A2 ${ts}`,
      sku: `SKU-A2-${ts}`,
      price: 150,
      cost: 75,
      shopId: shopA2.id,
      organizationId: orgA.id,
      active: true
    });

    inventoryA2 = await Inventory.create({
      productId: productA2.id,
      shopId: shopA2.id,
      stockQuantity: 40,
      reorderPoint: 5
    });

    // Product & Inventory for Shop B
    productB = await Product.create({
      name: `Product B ${ts}`,
      sku: `SKU-B-${ts}`,
      price: 200,
      cost: 100,
      shopId: shopB.id,
      organizationId: orgB.id,
      active: true
    });

    inventoryB = await Inventory.create({
      productId: productB.id,
      shopId: shopB.id,
      stockQuantity: 30,
      reorderPoint: 5
    });
  });

  // =========================================================================
  // 1. Valid sale
  // =========================================================================
  test('Test 1: Valid sale creation with Idempotency-Key succeeds (201)', async () => {
    const key = `key-test1-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.invoiceNumber).toBeDefined();
    expect(parseFloat(res.body.total)).toBe(100);

    // Verify stock decremented
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(49);
  });

  // =========================================================================
  // 2. Sequential duplicate
  // =========================================================================
  test('Test 2: Sequential duplicate request returns the original sale without second mutation', async () => {
    const key = `key-test2-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 2, price: 100 }],
      total: 200,
      paymentAmount: 200,
      paymentMethod: 'cash'
    };

    // First request
    const res1 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    // Sequential retry with identical key and payload
    const res2 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload);

    expect([200, 201]).toContain(res2.status);
    expect(res2.body.id).toBe(res1.body.id);
    expect(res2.body.invoiceNumber).toBe(res1.body.invoiceNumber);

    // Exactly 1 sale in DB with this key
    const saleCount = await Sale.count({ where: { shopId: shopA1.id, idempotencyKey: key } });
    expect(saleCount).toBe(1);

    // Stock decremented only once (50 - 2 = 48)
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(48);
  });

  // =========================================================================
  // 3. Same key / same payload
  // =========================================================================
  test('Test 3: Same key with same payload returns identical result fields', async () => {
    const key = `key-test3-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res1 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    const res2 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res2.body.id).toBe(res1.body.id);
    expect(res2.body.invoiceNumber).toBe(res1.body.invoiceNumber);
    expect(parseFloat(res2.body.total)).toBe(parseFloat(res1.body.total));
    expect(res2.body.SaleItems.length).toBe(res1.body.SaleItems.length);
  });

  // =========================================================================
  // 4. Same key / different payload
  // =========================================================================
  test('Test 4: Same key with different payload is rejected with 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const key = `key-test4-${Date.now()}`;
    const payload1 = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };
    const payload2 = {
      items: [{ productId: productA1.id, quantity: 3, price: 100 }],
      total: 300,
      paymentAmount: 300,
      paymentMethod: 'cash'
    };

    // First request succeeds
    await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload1)
      .expect(201);

    // Second request with SAME key but DIFFERENT payload must fail with 409
    const conflictRes = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload2)
      .expect(409);

    expect(conflictRes.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(conflictRes.body.error || conflictRes.body.message).toMatch(/idempotency key was already used with a different request/i);

    // Stock must be 49 (only deducted 1 from first sale, NOT 1 + 3)
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(49);
  });

  // =========================================================================
  // 5. Concurrent identical requests (5+ requests)
  // =========================================================================
  test('Test 5: Concurrent identical requests produce exactly 1 sale and 1 inventory deduction', async () => {
    const key = `key-test5-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 2, price: 100 }],
      total: 200,
      paymentAmount: 200,
      paymentMethod: 'cash'
    };

    // Fire 6 simultaneous concurrent requests
    const promises = Array.from({ length: 6 }, () =>
      request(app)
        .post('/api/sales')
        .set('Authorization', tokenA)
        .set('Idempotency-Key', key)
        .send(payload)
    );

    const responses = await Promise.all(promises);

    // All should return successful status (201 for winner, 200/201 for recovered duplicates)
    responses.forEach(res => {
      expect([200, 201]).toContain(res.status);
    });

    // All responses return the identical sale ID and invoice number
    const firstSaleId = responses[0].body.id;
    const firstInvoice = responses[0].body.invoiceNumber;
    responses.forEach(res => {
      expect(res.body.id).toBe(firstSaleId);
      expect(res.body.invoiceNumber).toBe(firstInvoice);
    });

    // Exactly 1 sale created in database
    const sales = await Sale.findAll({ where: { shopId: shopA1.id, idempotencyKey: key } });
    expect(sales.length).toBe(1);

    // Inventory decremented exactly once (50 - 2 = 48)
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(48);
  });

  // =========================================================================
  // 6. Inventory exactly once
  // =========================================================================
  test('Test 6: Multiple retries cannot double-decrement inventory stock', async () => {
    const key = `key-test6-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 5, price: 100 }],
      total: 500,
      paymentAmount: 500,
      paymentMethod: 'cash'
    };

    // Sequential 4 calls
    await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload).expect(201);
    await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload);
    await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload);
    await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload);

    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(45); // 50 - 5 = 45, NOT 30
  });

  // =========================================================================
  // 7. StockMovement exactly once
  // =========================================================================
  test('Test 7: Exactly 1 StockMovement record created despite multiple retries', async () => {
    const key = `key-test7-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res = await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload).expect(201);
    await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload);

    const movements = await StockMovement.findAll({
      where: {
        shopId: shopA1.id,
        productId: productA1.id,
        reference: res.body.invoiceNumber
      }
    });

    expect(movements.length).toBe(1);
    expect(parseFloat(movements[0].quantity)).toBe(-1);
  });

  // =========================================================================
  // 8. Payment exactly once
  // =========================================================================
  test('Test 8: Exactly 1 SalePayment record created for the sale', async () => {
    const key = `key-test8-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res = await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload).expect(201);
    await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload);

    const payments = await SalePayment.findAll({
      where: {
        saleId: res.body.id,
        shopId: shopA1.id
      }
    });

    expect(payments.length).toBe(1);
    expect(parseFloat(payments[0].amount)).toBe(100);
  });

  // =========================================================================
  // 9. Invoice exactly once
  // =========================================================================
  test('Test 9: Exactly 1 unique invoiceNumber exists for the logical sale', async () => {
    const key = `key-test9-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res1 = await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload).expect(201);
    const res2 = await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload);

    const matchingSales = await Sale.findAll({
      where: {
        shopId: shopA1.id,
        invoiceNumber: res1.body.invoiceNumber
      }
    });

    expect(matchingSales.length).toBe(1);
    expect(res2.body.invoiceNumber).toBe(res1.body.invoiceNumber);
  });

  // =========================================================================
  // 10. Retry after simulated timeout
  // =========================================================================
  test('Test 10: Retry after simulated client timeout returns original committed sale', async () => {
    const key = `key-test10-${Date.now()}`;
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    // Client sends initial request; server commits sale
    const initialRes = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    // Client drops connection / times out, then retries with same Idempotency-Key
    const retryRes = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload);

    expect([200, 201]).toContain(retryRes.status);
    expect(retryRes.body.id).toBe(initialRes.body.id);
    expect(retryRes.body.invoiceNumber).toBe(initialRes.body.invoiceNumber);
  });

  // =========================================================================
  // 11. Cross-tenant same key
  // =========================================================================
  test('Test 11: Cross-tenant isolation — identical key in Org A and Org B both succeed independently', async () => {
    const sharedKey = `shared-cross-tenant-key-${Date.now()}`;

    const payloadA = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const payloadB = {
      items: [{ productId: productB.id, quantity: 1, price: 200 }],
      total: 200,
      paymentAmount: 200,
      paymentMethod: 'cash'
    };

    // Tenant A creates sale with sharedKey
    const resA = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', sharedKey)
      .send(payloadA)
      .expect(201);

    // Tenant B creates sale with identical sharedKey
    const resB = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenB)
      .set('Idempotency-Key', sharedKey)
      .send(payloadB)
      .expect(201);

    expect(resA.body.id).not.toBe(resB.body.id);
    expect(resA.body.shopId).toBe(shopA1.id);
    expect(resB.body.shopId).toBe(shopB.id);

    // Both sales exist in their respective shops
    const saleA = await Sale.findOne({ where: { shopId: shopA1.id, idempotencyKey: sharedKey } });
    const saleB = await Sale.findOne({ where: { shopId: shopB.id, idempotencyKey: sharedKey } });
    expect(saleA).not.toBeNull();
    expect(saleB).not.toBeNull();
  });

  // =========================================================================
  // 12. Cross-shop same key (same tenant, different branches)
  // =========================================================================
  test('Test 12: Cross-shop isolation — identical key in Shop A1 and Shop A2 both succeed independently', async () => {
    const sharedKey = `shared-cross-branch-key-${Date.now()}`;

    const tokenBranch2 = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    const payload1 = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const payload2 = {
      items: [{ productId: productA2.id, quantity: 1, price: 150 }],
      total: 150,
      paymentAmount: 150,
      paymentMethod: 'cash'
    };

    // Branch 1 creates sale
    const res1 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', sharedKey)
      .send(payload1)
      .expect(201);

    // Branch 2 creates sale with same key
    const res2 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenBranch2)
      .set('Idempotency-Key', sharedKey)
      .send(payload2)
      .expect(201);

    expect(res1.body.id).not.toBe(res2.body.id);
    expect(res1.body.shopId).toBe(shopA1.id);
    expect(res2.body.shopId).toBe(shopA2.id);
  });

  // =========================================================================
  // 13. Legacy request without key (backward compatibility)
  // =========================================================================
  test('Test 13: Legacy clients without idempotency key continue to function without deduplication', async () => {
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    // Request 1 without key
    const res1 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .send(payload)
      .expect(201);

    // Request 2 without key — must create a NEW separate sale (backward compatible)
    const res2 = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .send(payload)
      .expect(201);

    expect(res1.body.id).not.toBe(res2.body.id);
    expect(res1.body.invoiceNumber).not.toBe(res2.body.invoiceNumber);

    // Both sales have null idempotencyKey
    const sale1 = await Sale.findByPk(res1.body.id);
    const sale2 = await Sale.findByPk(res2.body.id);
    expect(sale1.idempotencyKey).toBeNull();
    expect(sale2.idempotencyKey).toBeNull();

    // Stock decremented for both sales (50 - 2 = 48)
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(48);
  });

  // =========================================================================
  // 14. Malformed key validation
  // =========================================================================
  test('Test 14: Malformed key (non-string format in body) is rejected with 400 Bad Request', async () => {
    const payload = {
      idempotencyKey: { invalid: 'object-format' },
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .send(payload)
      .expect(400);

    expect(res.body.error).toMatch(/must be a string/i);
  });

  // =========================================================================
  // 15. Empty key handling
  // =========================================================================
  test('Test 15: Empty or whitespace-only key is treated as no key (backward compatible, succeeds)', async () => {
    const payload = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', '   ')
      .send(payload)
      .expect(201);

    const sale = await Sale.findByPk(res.body.id);
    expect(sale.idempotencyKey).toBeNull();
  });

  // =========================================================================
  // 16. Key normalization & header precedence
  // =========================================================================
  test('Test 16: Key is trimmed and header takes precedence over body key', async () => {
    const headerKey = `header-key-${Date.now()}`;
    const bodyKey = `body-key-${Date.now()}`;

    const payload = {
      idempotencyKey: bodyKey,
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', `  ${headerKey}  `)
      .send(payload)
      .expect(201);

    const sale = await Sale.findByPk(res.body.id);
    expect(sale.idempotencyKey).toBe(headerKey); // Trimmed headerKey wins
  });

  // =========================================================================
  // 17. Rollback after downstream failure
  // =========================================================================
  test('Test 17: Transaction rollback prevents partial mutations on downstream failure', async () => {
    const key = `key-test17-${Date.now()}`;

    // Request with quantity exceeding stock (409 Insufficient stock)
    const payload = {
      items: [{ productId: productA1.id, quantity: 9999, price: 100 }],
      total: 999900,
      paymentAmount: 999900,
      paymentMethod: 'cash'
    };

    await request(app)
      .post('/api/sales')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(409);

    // No sale created
    const sale = await Sale.findOne({ where: { shopId: shopA1.id, idempotencyKey: key } });
    expect(sale).toBeNull();

    // Inventory intact at 50
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(50);
  });

  // =========================================================================
  // 18. Concurrent same key with different payload
  // =========================================================================
  test('Test 18: Concurrent requests with same key but different payloads — exactly one succeeds, conflicting rejected', async () => {
    const key = `key-test18-${Date.now()}`;
    const payload1 = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };
    const payload2 = {
      items: [{ productId: productA1.id, quantity: 2, price: 100 }],
      total: 200,
      paymentAmount: 200,
      paymentMethod: 'cash'
    };

    const [res1, res2] = await Promise.all([
      request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload1),
      request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', key).send(payload2)
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One must succeed (201) and one must be rejected (409)
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  // =========================================================================
  // 19. Multiple independent sales
  // =========================================================================
  test('Test 19: Multiple independent sales with distinct keys succeed without interference', async () => {
    const keyA = `key-indep-A-${Date.now()}`;
    const keyB = `key-indep-B-${Date.now()}`;

    const payloadA = {
      items: [{ productId: productA1.id, quantity: 1, price: 100 }],
      total: 100,
      paymentAmount: 100,
      paymentMethod: 'cash'
    };
    const payloadB = {
      items: [{ productId: productA1.id, quantity: 3, price: 100 }],
      total: 300,
      paymentAmount: 300,
      paymentMethod: 'cash'
    };

    const resA = await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', keyA).send(payloadA).expect(201);
    const resB = await request(app).post('/api/sales').set('Authorization', tokenA).set('Idempotency-Key', keyB).send(payloadB).expect(201);

    expect(resA.body.id).not.toBe(resB.body.id);
    expect(resA.body.invoiceNumber).not.toBe(resB.body.invoiceNumber);

    // Total stock deducted: 1 + 3 = 4 (50 - 4 = 46)
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(46);
  });

  // =========================================================================
  // 20. Existing Phase 6B-01 payment security regression
  // =========================================================================
  test('Test 20: Card payment verification uses reference as idempotency key and cannot be double-settled', async () => {
    const cardRef = `card-ref-${Date.now()}`;

    // Create a pending card payment
    const pending = await PendingPayment.create({
      checkoutRequestId: cardRef,
      orderId: `order-${cardRef}`,
      amount: 100,
      status: 'pending',
      paymentChannel: 'card',
      shopId: shopA1.id,
      saleData: {
        currency: 'KES',
        items: [{ productId: productA1.id, quantity: 1, price: 100 }],
        total: 100,
        paymentAmount: 100,
        paymentMethod: 'card',
        organizationId: orgA.id,
        userId: userA.id,
        isEmployee: false
      }
    });

    const axios = require('axios');
    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 100,
          currency: 'KES',
          tx_ref: cardRef,
          id: 998877
        }
      }
    });

    // Verify card payment
    const verifyRes = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: cardRef })
      .expect(200);

    expect(verifyRes.body.verified).toBe(true);

    // Second verification attempt is idempotent (already confirmed -> 200 OK)
    const replayVerifyRes = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: cardRef })
      .expect(200);

    expect(replayVerifyRes.body.verified).toBe(true);
    expect(replayVerifyRes.body.message).toMatch(/already verified/i);

    // Exactly 1 sale created with idempotencyKey = cardRef
    const saleCount = await Sale.count({ where: { shopId: shopA1.id, idempotencyKey: cardRef } });
    expect(saleCount).toBe(1);

    // Inventory decremented exactly once (50 - 1 = 49)
    await inventoryA1.reload();
    expect(parseFloat(inventoryA1.stockQuantity)).toBe(49);
  });
});
