'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Shop,
  Organization,
  Category,
  Product,
  Inventory,
  Sale,
  PendingPayment
} = require('../src/models');

jest.mock('axios');

function tokenFor(payload) {
  const fs = require('fs');
  const path = require('path');
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 6B-01: Payment & Financial Adversarial Hardening (FIN-01)', () => {
  let orgA, orgB;
  let shopA, shopB;
  let userA, userB;
  let tokenA, tokenB;

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

    shopA = await Shop.create({
      name: `Shop A ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    userA = await User.create({
      name: `User A ${ts}`,
      email: `user-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id,
      organizationId: orgA.id
    });

    tokenA = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shopA.id,
      organizationId: orgA.id
    });

    // Organization B (for cross-tenant testing)
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
      organizationId: orgB.id
    });
  });

  // Helper to create a standard PendingPayment in Shop A with consistent item price
  async function createPendingPayment(ref, amount, currency = 'KES') {
    const numAmount = parseFloat(amount);
    const itemProduct = await Product.create({
      name: `Prod-${ref}`,
      sku: `SKU-${ref}`,
      barcode: `BAR-${ref}`,
      price: numAmount,
      cost: numAmount / 2,
      shopId: shopA.id,
      organizationId: orgA.id,
      active: true
    });

    await Inventory.create({
      productId: itemProduct.id,
      shopId: shopA.id,
      stockQuantity: 50,
      reorderPoint: 5
    });

    return await PendingPayment.create({
      checkoutRequestId: ref,
      orderId: `order-${ref}`,
      amount,
      status: 'pending',
      paymentChannel: 'card',
      shopId: shopA.id,
      saleData: {
        currency,
        items: [{ productId: itemProduct.id, quantity: 1, price: numAmount }],
        total: numAmount,
        paymentAmount: numAmount,
        paymentMethod: 'card',
        organizationId: orgA.id,
        userId: userA.id,
        isEmployee: false,
        customer: { name: 'Adversarial Tester' }
      }
    });
  }

  // TEST 1 — Valid payment
  test('Test 1 — Valid payment (1,000 KES expected == 1,000 KES verified) succeeds', async () => {
    const ref = `test1_ref_${Date.now()}`;
    await createPendingPayment(ref, 1000.00, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1000.00,
          currency: 'KES',
          id: 'FLW_GATEWAY_TEST_1'
        }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(200);

    expect(res.body.verified).toBe(true);

    // PendingPayment status updated to confirmed
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    expect(pending.status).toBe('confirmed');

    // Sale record created with gateway reference
    const sale = await Sale.findOne({ where: { paymentReference: 'FLW_GATEWAY_TEST_1' } });
    expect(sale).toBeDefined();
    expect(Number(sale.total)).toBe(1000.00);

    // Inventory decremented from 50 to 49
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(49);
  });

  // TEST 2 — Underpayment
  test('Test 2 — Underpayment (100,000 KES expected vs 10 KES verified) rejected', async () => {
    const ref = `test2_ref_${Date.now()}`;
    await createPendingPayment(ref, 100000.00, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 10.00,
          currency: 'KES',
          id: 'FLW_GATEWAY_TEST_2_UNDER'
        }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(400);

    expect(res.body.error).toMatch(/amount mismatch/i);

    // Assert: No sale created
    const sale = await Sale.findOne({ where: { paymentReference: 'FLW_GATEWAY_TEST_2_UNDER' } });
    expect(sale).toBeNull();

    // Assert: PendingPayment marked failed
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    expect(pending.status).toBe('failed');
    expect(pending.saleData.verificationFailure.reason).toBe('AMOUNT_MISMATCH');

    // Assert: Inventory NOT decremented
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(50);
  });

  // TEST 3 — Overpayment
  test('Test 3 — Overpayment (1,000 KES expected vs 1,100 KES verified) rejected', async () => {
    const ref = `test3_ref_${Date.now()}`;
    await createPendingPayment(ref, 1000.00, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1100.00,
          currency: 'KES',
          id: 'FLW_GATEWAY_TEST_3_OVER'
        }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(400);

    expect(res.body.error).toMatch(/amount mismatch/i);

    // Assert: No sale created
    const sale = await Sale.findOne({ where: { paymentReference: 'FLW_GATEWAY_TEST_3_OVER' } });
    expect(sale).toBeNull();

    // Assert: PendingPayment marked failed
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    expect(pending.status).toBe('failed');
    expect(pending.saleData.verificationFailure.reason).toBe('AMOUNT_MISMATCH');

    // Assert: Inventory NOT decremented
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(50);
  });

  // TEST 4 — Currency mismatch
  test('Test 4 — Currency mismatch (1,000 KES expected vs 1,000 USD verified) rejected', async () => {
    const ref = `test4_ref_${Date.now()}`;
    await createPendingPayment(ref, 1000.00, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1000.00,
          currency: 'USD',
          id: 'FLW_GATEWAY_TEST_4_CURR'
        }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(400);

    expect(res.body.error).toMatch(/currency mismatch/i);

    // Assert: No sale created
    const sale = await Sale.findOne({ where: { paymentReference: 'FLW_GATEWAY_TEST_4_CURR' } });
    expect(sale).toBeNull();

    // Assert: PendingPayment marked failed
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    expect(pending.status).toBe('failed');
    expect(pending.saleData.verificationFailure.reason).toBe('CURRENCY_MISMATCH');

    // Assert: Inventory NOT decremented
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(50);
  });

  // TEST 5 — Forged verification
  test('Test 5 — Forged verification (gateway reports verified = false) rejected', async () => {
    const ref = `test5_ref_${Date.now()}`;
    await createPendingPayment(ref, 1000.00, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'failed',
          amount: 1000.00,
          currency: 'KES',
          id: ''
        }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(400);

    expect(res.body.error).toMatch(/failed or payment declined/i);

    // Assert: No sale created
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    expect(pending.status).toBe('failed');

    // Assert: Inventory NOT decremented
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(50);
  });

  // TEST 6 — Wrong payment reference
  test('Test 6 — Wrong payment reference (non-existent reference) rejected with 404', async () => {
    const bogusRef = `bogus_ref_${Date.now()}`;

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: bogusRef })
      .expect(404);

    expect(res.body.error).toMatch(/not found/i);
    expect(axios.get).not.toHaveBeenCalled();
  });

  // TEST 7 — Cross-tenant payment reference
  test('Test 7 — Cross-tenant payment reference (User B verifies Org A payment) rejected with 403', async () => {
    const ref = `test7_ref_${Date.now()}`;
    await createPendingPayment(ref, 500.00, 'KES');

    // User B attempts to verify User A's pending payment
    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenB)
      .send({ reference: ref })
      .expect(403);

    expect(res.body.error).toMatch(/another organization/i);

    // External gateway MUST NOT even be called
    expect(axios.get).not.toHaveBeenCalled();

    // Payment in Org A remains untouched (pending)
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    expect(pending.status).toBe('pending');
  });

  // TEST 8 — Replay
  test('Test 8 — Replay (submitting exact same successful verification twice) does not duplicate settlement', async () => {
    const ref = `test8_ref_${Date.now()}`;
    const gatewayRef = `FLW_GATEWAY_TEST_8_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await createPendingPayment(ref, 200.00, 'KES');

    axios.get.mockResolvedValue({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 200.00,
          currency: 'KES',
          id: gatewayRef
        }
      }
    });

    // First verification -> 200 OK, sale created
    const res1 = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(200);

    expect(res1.body.verified).toBe(true);

    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    const prodId = pending.saleData.items[0].productId;
    const invAfter1 = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter1.stockQuantity)).toBe(49); // 50 - 1

    // Replay: Second verification of same reference -> 200 OK (idempotent, already confirmed)
    const res2 = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(200);

    expect(res2.body.verified).toBe(true);
    expect(res2.body.message).toMatch(/already verified/i);

    // Assert: Exactly ONE sale exists for this payment reference
    const sales = await Sale.findAll({ where: { paymentReference: gatewayRef } });
    expect(sales.length).toBe(1);

    // Assert: Inventory NOT decremented a second time
    const invAfter2 = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter2.stockQuantity)).toBe(49);
  });

  // TEST 9 — Concurrent verification
  test('Test 9 — Concurrent verification produces exactly one settlement and one inventory mutation', async () => {
    const ref = `test9_ref_${Date.now()}`;
    const gatewayRef = `FLW_GATEWAY_TEST_9_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await createPendingPayment(ref, 300.00, 'KES');

    axios.get.mockResolvedValue({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 300.00,
          currency: 'KES',
          id: gatewayRef
        }
      }
    });

    // Fire 2 concurrent verification requests for the exact same payment reference
    const [res1, res2] = await Promise.all([
      request(app).post('/api/card/verify').set('Authorization', tokenA).send({ reference: ref }),
      request(app).post('/api/card/verify').set('Authorization', tokenA).send({ reference: ref })
    ]);

    // Both should return 200 (one newly settled, one idempotently reported)
    expect([200, 200]).toContain(res1.status);
    expect([200, 200]).toContain(res2.status);

    // Exactly one sale created
    const sales = await Sale.findAll({ where: { paymentReference: gatewayRef } });
    expect(sales.length).toBe(1);

    // Inventory decremented exactly once (50 - 1 = 49)
    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: ref } });
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(49);
  });

  // TEST 10 — Already-settled payment
  test('Test 10 — Already-settled payment rejected from second settlement', async () => {
    const ref = `test10_ref_${Date.now()}`;
    const pending = await createPendingPayment(ref, 100.00, 'KES');

    // Manually mark as confirmed
    await pending.update({ status: 'confirmed' });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref })
      .expect(200);

    expect(res.body.verified).toBe(true);
    expect(res.body.message).toMatch(/already verified/i);

    // Gateway was NOT called
    expect(axios.get).not.toHaveBeenCalled();

    // Inventory unchanged
    const prodId = pending.saleData.items[0].productId;
    const invAfter = await Inventory.findOne({ where: { productId: prodId, shopId: shopA.id } });
    expect(parseFloat(invAfter.stockQuantity)).toBe(50);
  });

  // TEST 11 — Amount formatting
  test('Test 11 — Amount formatting handles integer, decimal string, and number equivalents without precision loss', async () => {
    // 11a: Pending integer 1000 vs Gateway decimal 1000.00
    const refA = `test11a_ref_${Date.now()}`;
    await createPendingPayment(refA, '1000', 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1000.00,
          currency: 'KES',
          id: 'FLW_GATEWAY_11A'
        }
      }
    });

    const resA = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: refA })
      .expect(200);

    expect(resA.body.verified).toBe(true);

    // 11b: Pending decimal 500.00 vs Gateway string "500.00"
    const refB = `test11b_ref_${Date.now()}`;
    await createPendingPayment(refB, 500.00, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: '500.00',
          currency: 'KES',
          id: 'FLW_GATEWAY_11B'
        }
      }
    });

    const resB = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: refB })
      .expect(200);

    expect(resB.body.verified).toBe(true);

    // 11c: Pending string decimal "250.50" vs Gateway number 250.5
    const refC = `test11c_ref_${Date.now()}`;
    await createPendingPayment(refC, '250.50', 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 250.5,
          currency: 'KES',
          id: 'FLW_GATEWAY_11C'
        }
      }
    });

    const resC = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: refC })
      .expect(200);

    expect(resC.body.verified).toBe(true);
  });

  // TEST 12 — Decimal precision
  test('Test 12 — Decimal precision: realistic values (1000.10, 1000.01, 999.99) tested for zero float rounding bugs', async () => {
    // 12a: 1000.10
    const ref10 = `test12_10_${Date.now()}`;
    await createPendingPayment(ref10, 1000.10, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1000.10,
          currency: 'KES',
          id: 'FLW_GATEWAY_12_10'
        }
      }
    });

    const res10 = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref10 })
      .expect(200);

    expect(res10.body.verified).toBe(true);

    // 12b: 1000.01
    const ref01 = `test12_01_${Date.now()}`;
    await createPendingPayment(ref01, 1000.01, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1000.01,
          currency: 'KES',
          id: 'FLW_GATEWAY_12_01'
        }
      }
    });

    const res01 = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref01 })
      .expect(200);

    expect(res01.body.verified).toBe(true);

    // 12c: 999.99
    const ref99 = `test12_99_${Date.now()}`;
    await createPendingPayment(ref99, 999.99, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 999.99,
          currency: 'KES',
          id: 'FLW_GATEWAY_12_99'
        }
      }
    });

    const res99 = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: ref99 })
      .expect(200);

    expect(res99.body.verified).toBe(true);

    // 12d: Discrepancy by 1 cent (1000.01 expected vs 1000.02 gateway) must REJECT
    const refDiff = `test12_diff_${Date.now()}`;
    await createPendingPayment(refDiff, 1000.01, 'KES');

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 1000.02,
          currency: 'KES',
          id: 'FLW_GATEWAY_12_DIFF'
        }
      }
    });

    const resDiff = await request(app)
      .post('/api/card/verify')
      .set('Authorization', tokenA)
      .send({ reference: refDiff })
      .expect(400);

    expect(resDiff.body.error).toMatch(/amount mismatch/i);
    const pendingDiff = await PendingPayment.findOne({ where: { checkoutRequestId: refDiff } });
    expect(pendingDiff.status).toBe('failed');
  });
});
