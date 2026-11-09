'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');

const {
  User,
  Shop,
  Organization,
  Product,
  Inventory,
  Sale,
  SaleItem,
  StockMovement,
  SystemSettings
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

describe('Checkout Batched Path Verification Suite', () => {
  let org, shop, adminUser, authHeader;
  let prodA, prodB, prodC;
  let invA, invB, invC;

  beforeAll(async () => {
    await sequelize.authenticate();
  });

  beforeEach(async () => {
    const ts = Date.now() + '-' + Math.floor(Math.random() * 100000);

    org = await Organization.create({
      name: `Test Org ${ts}`,
      slug: `test-org-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shop = await Shop.create({
      name: `Test Shop ${ts}`,
      organizationId: org.id,
      active: true
    });

    adminUser = await User.create({
      name: `Admin ${ts}`,
      email: `admin-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id
    });

    authHeader = tokenFor({
      id: adminUser.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    // Create 3 test products
    prodA = await Product.create({
      name: `Product A ${ts}`,
      sku: `SKU-A-${ts}`,
      price: 100.00,
      cost: 50.00,
      organizationId: org.id,
      active: true
    });

    prodB = await Product.create({
      name: `Product B ${ts}`,
      sku: `SKU-B-${ts}`,
      price: 250.00,
      cost: 150.00,
      organizationId: org.id,
      active: true
    });

    prodC = await Product.create({
      name: `Product C ${ts}`,
      sku: `SKU-C-${ts}`,
      price: 33.33,
      cost: 20.00,
      organizationId: org.id,
      active: true
    });

    // Inventories
    invA = await Inventory.create({
      shopId: shop.id,
      productId: prodA.id,
      stockQuantity: 50
    });

    invB = await Inventory.create({
      shopId: shop.id,
      productId: prodB.id,
      stockQuantity: 20
    });

    invC = await Inventory.create({
      shopId: shop.id,
      productId: prodC.id,
      stockQuantity: 10
    });
  });

  // 1. Tax-exclusive calculation
  it('correctly calculates tax-exclusive totals (subtotal + tax = total)', async () => {
    await SystemSettings.create({
      shopId: shop.id,
      taxRate: 16.0,
      taxInclusive: false
    });

    const payload = {
      items: [
        { productId: prodA.id, quantity: 2, unitPrice: 100, price: 100 } // 200 subtotal
      ],
      paymentMethod: 'cash',
      paymentAmount: 232.00,
      subtotal: 200.00,
      tax: 32.00,
      total: 232.00
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.subtotal)).toBeCloseTo(200.00, 2);
    expect(parseFloat(res.body.tax)).toBeCloseTo(32.00, 2);
    expect(parseFloat(res.body.total)).toBeCloseTo(232.00, 2);
  });

  // 2. Tax-inclusive calculation
  it('correctly calculates tax-inclusive totals (total = subtotal, tax extracted)', async () => {
    await SystemSettings.create({
      shopId: shop.id,
      taxRate: 16.0,
      taxInclusive: true
    });

    // 200 gross -> pre-tax = 200 / 1.16 = 172.41, tax = 27.59
    const payload = {
      items: [
        { productId: prodA.id, quantity: 2, unitPrice: 100, price: 100 }
      ],
      paymentMethod: 'cash',
      paymentAmount: 200.00,
      subtotal: 200.00,
      tax: 27.59,
      total: 200.00
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.total)).toBeCloseTo(200.00, 2);
    expect(parseFloat(res.body.tax)).toBeCloseTo(27.59, 2);
  });

  // 3. Discounts and currency rounding (2 decimal places)
  it('correctly applies line discounts, cart discounts, and 2-decimal rounding', async () => {
    await SystemSettings.create({
      shopId: shop.id,
      taxRate: 0,
      taxInclusive: false
    });

    // prodC is 33.33 * 3 = 99.99
    // Line discount of 10.00 on prodA (100 - 10 = 90)
    // Subtotal before cart discount = 90 + 99.99 = 189.99
    // Cart discount fixed = 9.99 -> Final total = 180.00
    const payload = {
      items: [
        { productId: prodA.id, quantity: 1, unitPrice: 100, price: 100, discount: 10.00 },
        { productId: prodC.id, quantity: 3, unitPrice: 33.33, price: 33.33, discount: 0 }
      ],
      discountType: 'fixed',
      discountValue: 9.99,
      discount: 9.99, // cart discount
      subtotal: 199.99,
      total: 180.00,
      paymentMethod: 'cash',
      paymentAmount: 180.00
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(201);
    expect(parseFloat(res.body.total)).toBeCloseTo(180.00, 2);
    expect(parseFloat(res.body.discount)).toBeCloseTo(19.99, 2);
  });

  // 4. Idempotent retry: same key returns same sale without second stock deduction
  it('returns identical sale and prevents double stock deduction on idempotent retry', async () => {
    const key = `idemp-${Date.now()}`;
    const payload = {
      items: [{ productId: prodA.id, quantity: 5, unitPrice: 100, price: 100 }],
      paymentMethod: 'cash',
      paymentAmount: 500.00,
      subtotal: 500.00,
      total: 500.00
    };

    // First request
    const res1 = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res1.status).toBe(201);
    const saleId1 = res1.body.id;

    // Check stock decremented by 5 (50 -> 45)
    await invA.reload();
    expect(invA.stockQuantity).toBe(45);

    // Second request with exact same payload and key
    const res2 = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(saleId1);

    // Assert stock was NOT decremented again
    await invA.reload();
    expect(invA.stockQuantity).toBe(45);
  });

  // 5. Insufficient stock: returns 409 and guarantees NO partial writes
  it('returns 409 on insufficient stock and guarantees atomic rollback without orphan rows', async () => {
    const initialInvA = invA.stockQuantity; // 50
    const initialInvB = invB.stockQuantity; // 20

    const payload = {
      items: [
        { productId: prodA.id, quantity: 5, unitPrice: 100, price: 100 }, // Available (50 >= 5)
        { productId: prodB.id, quantity: 999, unitPrice: 250, price: 250 } // Exceeds (20 < 999)
      ],
      paymentMethod: 'cash',
      paymentAmount: 250250.00,
      subtotal: 250250.00,
      total: 250250.00
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .send(payload);

    expect(res.status).toBe(409);
    expect(res.body.error || res.body.message).toMatch(/insufficient stock/i);

    // Assert NO partial decrements on prodA
    await invA.reload();
    expect(invA.stockQuantity).toBe(initialInvA);

    await invB.reload();
    expect(invB.stockQuantity).toBe(initialInvB);

    // Assert no orphan Sale rows created
    const orphanSales = await Sale.findAll({ where: { shopId: shop.id } });
    expect(orphanSales.length).toBe(0);
  });

  // 6. Two concurrent sales on overlapping products: strict ORDER BY productId ASC prevents deadlock
  it('executes two concurrent sales with overlapping products without deadlock and with exact final stock', async () => {
    // prodA (id lower) and prodB (id higher)
    // Request 1 asks for [prodA: 2, prodB: 3]
    // Request 2 asks for [prodB: 4, prodA: 1] (reversed order in payload)
    const initialA = invA.stockQuantity; // 50
    const initialB = invB.stockQuantity; // 20

    const req1Payload = {
      items: [
        { productId: prodA.id, quantity: 2, unitPrice: 100, price: 100 },
        { productId: prodB.id, quantity: 3, unitPrice: 250, price: 250 }
      ],
      paymentMethod: 'cash',
      paymentAmount: 950.00,
      subtotal: 950.00,
      total: 950.00
    };

    const req2Payload = {
      items: [
        { productId: prodB.id, quantity: 4, unitPrice: 250, price: 250 },
        { productId: prodA.id, quantity: 1, unitPrice: 100, price: 100 }
      ],
      paymentMethod: 'cash',
      paymentAmount: 1100.00,
      subtotal: 1100.00,
      total: 1100.00
    };

    // Run both concurrently
    const [res1, res2] = await Promise.all([
      request(app).post('/api/sales').set('Authorization', authHeader).send(req1Payload),
      request(app).post('/api/sales').set('Authorization', authHeader).send(req2Payload)
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    // Verify final stock:
    // prodA should have lost 2 + 1 = 3 -> 50 - 3 = 47
    // prodB should have lost 3 + 4 = 7 -> 20 - 7 = 13
    await invA.reload();
    expect(invA.stockQuantity).toBe(initialA - 3);

    await invB.reload();
    expect(invB.stockQuantity).toBe(initialB - 7);
  });

  // 7. Full refund restoring stock
  it('restores exact inventory and records stock movements upon refund', async () => {
    const initialStock = invA.stockQuantity; // 50

    const saleRes = await request(app)
      .post('/api/sales')
      .set('Authorization', authHeader)
      .send({
        items: [{ productId: prodA.id, quantity: 4, unitPrice: 100, price: 100 }],
        paymentMethod: 'cash',
        paymentAmount: 400.00,
        subtotal: 400.00,
        total: 400.00
      });

    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.id;

    await invA.reload();
    expect(invA.stockQuantity).toBe(initialStock - 4);

    // Process refund
    const refundRes = await request(app)
      .post(`/api/sales/${saleId}/refund`)
      .set('Authorization', authHeader)
      .send({
        items: [{ productId: prodA.id, quantity: 4, amount: 400.00, reason: 'Customer return' }],
        reason: 'Customer return',
        refundMethod: 'cash'
      });

    expect(refundRes.status).toBe(200);

    // Verify stock restored to exact initial quantity
    await invA.reload();
    expect(invA.stockQuantity).toBe(initialStock);

    // Verify stock movement was recorded
    const movement = await StockMovement.findOne({
      where: {
        shopId: shop.id,
        productId: prodA.id,
        type: 'SALE_REFUND'
      }
    });
    expect(movement).not.toBeNull();
    expect(parseFloat(movement.quantity)).toBe(4);
  });
});
