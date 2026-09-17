'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Shop,
  Organization,
  Category,
  Product,
  Inventory,
  StockMovement,
  StockTransfer
} = require('../src/models');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

async function createProductHelper(data) {
  const rand = Math.floor(Math.random() * 1000000);
  return await Product.create({
    sku: `SKU-${Date.now()}-${rand}`,
    barcode: `BC-${Date.now()}-${rand}`,
    ...data
  });
}

describe('Phase 4: Stock Transfer Idempotency & Tenant Enforcement Suite', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1, shopB2;
  let userA, userB;
  let tokenA, tokenB;
  let categoryA, categoryB;

  beforeAll(async () => {
    await sequelize.authenticate();
  }, 30000);

  beforeEach(async () => {
    const ts = Date.now() + '-' + Math.floor(Math.random() * 10000);

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
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    userA = await User.create({
      name: `Manager A ${ts}`,
      email: `managerA_${ts}@test.com`,
      password: 'hashedpassword',
      role: 'admin',
      orgRole: 'owner',
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    tokenA = tokenFor({
      id: userA.id,
      email: userA.email,
      role: 'admin',
      orgRole: 'owner',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    categoryA = await Category.create({
      name: `Cat A ${ts}`,
      organizationId: orgA.id,
      shopId: shopA1.id
    });

    // Organization B
    orgB = await Organization.create({
      name: `Org B ${ts}`,
      slug: `org-b-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    shopB2 = await Shop.create({
      name: `Shop B2 ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    userB = await User.create({
      name: `Manager B ${ts}`,
      email: `managerB_${ts}@test.com`,
      password: 'hashedpassword',
      role: 'admin',
      orgRole: 'owner',
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true
    });

    tokenB = tokenFor({
      id: userB.id,
      email: userB.email,
      role: 'admin',
      orgRole: 'owner',
      shopId: shopB1.id,
      organizationId: orgB.id
    });

    categoryB = await Category.create({
      name: `Cat B ${ts}`,
      organizationId: orgB.id,
      shopId: shopB1.id
    });
  });

  // ==========================================================================
  // Test 1: Same Idempotency-Key Sequential Replay
  // ==========================================================================
  test('1. Sequential replay with same Idempotency-Key returns original result, mutates stock once, and creates exactly 2 movements', async () => {
    const prodA = await createProductHelper({
      name: 'Sequential Item',
      price: 150,
      cost: 80,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    // Initial stock: 50 in Shop A1, 0 in Shop A2
    await Inventory.create({ productId: prodA.id, shopId: shopA1.id, stockQuantity: 50, reorderPoint: 5 });
    await Inventory.create({ productId: prodA.id, shopId: shopA2.id, stockQuantity: 0, reorderPoint: 5 });

    const key = `key-seq-${Date.now()}`;

    // First request
    const res1 = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 15,
        notes: 'Initial transfer'
      });

    expect(res1.status).toBe(201);
    expect(res1.body).toHaveProperty('reference');
    expect(res1.body.reference).toMatch(/^TRF-/);
    expect(res1.body.sourceNewStock).toBe(35);
    expect(res1.body.destinationNewStock).toBe(15);
    const initialReference = res1.body.reference;

    // Second request: identical payload and same Idempotency-Key
    const res2 = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 15,
        notes: 'Initial transfer'
      });

    expect([200, 201]).toContain(res2.status);
    expect(res2.body.reference).toBe(initialReference);
    expect(res2.body.sourceNewStock).toBe(35);
    expect(res2.body.destinationNewStock).toBe(15);

    // Verify database inventory: must NOT have debited a second time (must still be 35 and 15)
    const invA1 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA1.id } });
    const invA2 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA2.id } });
    expect(parseFloat(invA1.stockQuantity)).toBe(35);
    expect(parseFloat(invA2.stockQuantity)).toBe(15);

    // Verify database movements: exactly 2 movements exist with this reference
    const movements = await StockMovement.findAll({ where: { reference: initialReference } });
    expect(movements.length).toBe(2);

    const debitMv = movements.find(m => m.quantity < 0);
    const creditMv = movements.find(m => m.quantity > 0);
    expect(debitMv.shopId).toBe(shopA1.id);
    expect(parseFloat(debitMv.quantity)).toBe(-15);
    expect(creditMv.shopId).toBe(shopA2.id);
    expect(parseFloat(creditMv.quantity)).toBe(15);

    // Exactly 1 StockTransfer record exists in the table
    const transferRecord = await StockTransfer.findOne({ where: { organizationId: orgA.id, idempotencyKey: key } });
    expect(transferRecord).not.toBeNull();
    expect(transferRecord.reference).toBe(initialReference);
  });

  // ==========================================================================
  // Test 2: Same Idempotency-Key Concurrent Replay
  // ==========================================================================
  test('2. Concurrent requests with same Idempotency-Key commit exactly once and return the identical transfer reference', async () => {
    const prodA = await createProductHelper({
      name: 'Concurrent Item',
      price: 200,
      cost: 100,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    await Inventory.create({ productId: prodA.id, shopId: shopA1.id, stockQuantity: 50, reorderPoint: 5 });
    await Inventory.create({ productId: prodA.id, shopId: shopA2.id, stockQuantity: 0, reorderPoint: 5 });

    const key = `key-concurrent-${Date.now()}`;

    // Fire 5 identical requests concurrently with the exact same key
    const promises = Array.from({ length: 5 }, () =>
      request(app)
        .post('/api/transfers')
        .set('Authorization', tokenA)
        .set('Idempotency-Key', key)
        .send({
          sourceShopId: shopA1.id,
          destinationShopId: shopA2.id,
          productId: prodA.id,
          quantity: 10,
          notes: 'Concurrent transfer'
        })
    );

    const responses = await Promise.all(promises);

    // All successful responses must return 200 or 201 and reference the exact same transfer
    const references = new Set();
    for (const res of responses) {
      expect([200, 201]).toContain(res.status);
      expect(res.body).toHaveProperty('reference');
      references.add(res.body.reference);
    }

    // Exactly one unique transfer reference across all concurrent responses
    expect(references.size).toBe(1);

    // Inventory was debited exactly once (50 - 10 = 40, NOT 0!)
    const invA1 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA1.id } });
    const invA2 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA2.id } });
    expect(parseFloat(invA1.stockQuantity)).toBe(40);
    expect(parseFloat(invA2.stockQuantity)).toBe(10);

    // StockMovements count: exactly 2 paired records
    const [ref] = references;
    const movements = await StockMovement.findAll({ where: { reference: ref } });
    expect(movements.length).toBe(2);

    // StockTransfers record: exactly 1
    const transfers = await StockTransfer.findAll({ where: { organizationId: orgA.id, idempotencyKey: key } });
    expect(transfers.length).toBe(1);
  });

  // ==========================================================================
  // Test 3: Same Key With Different Transfer Payload Rejection
  // ==========================================================================
  test('3. Reusing same Idempotency-Key with different parameters is rejected with 422 and does not mutate inventory', async () => {
    const prodA = await createProductHelper({
      name: 'Payload Item',
      price: 100,
      cost: 50,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    await Inventory.create({ productId: prodA.id, shopId: shopA1.id, stockQuantity: 50, reorderPoint: 5 });
    await Inventory.create({ productId: prodA.id, shopId: shopA2.id, stockQuantity: 0, reorderPoint: 5 });

    const key = `key-diff-payload-${Date.now()}`;

    // First request: transfer 10
    const res1 = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 10
      });
    expect(res1.status).toBe(201);

    // Second request: reuse key with different quantity (25 instead of 10)
    const res2 = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 25
      });

    expect(res2.status).toBe(422);
    expect(res2.body.error).toMatch(/different transfer parameters/i);

    // Verify inventory only reflects the first 10-unit transfer (40 and 10, NOT 15 and 35)
    const invA1 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA1.id } });
    const invA2 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA2.id } });
    expect(parseFloat(invA1.stockQuantity)).toBe(40);
    expect(parseFloat(invA2.stockQuantity)).toBe(10);
  });

  // ==========================================================================
  // Test 4: Same Key Across Different Organizations
  // ==========================================================================
  test('4. Same Idempotency-Key used by different organizations does not collide or replay cross-tenant data', async () => {
    const prodA = await createProductHelper({
      name: 'Org A Item',
      price: 100,
      cost: 50,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    const prodB = await createProductHelper({
      name: 'Org B Item',
      price: 100,
      cost: 50,
      organizationId: orgB.id,
      categoryId: categoryB.id,
      active: true
    });

    await Inventory.create({ productId: prodA.id, shopId: shopA1.id, stockQuantity: 30, reorderPoint: 5 });
    await Inventory.create({ productId: prodA.id, shopId: shopA2.id, stockQuantity: 0, reorderPoint: 5 });

    await Inventory.create({ productId: prodB.id, shopId: shopB1.id, stockQuantity: 40, reorderPoint: 5 });
    await Inventory.create({ productId: prodB.id, shopId: shopB2.id, stockQuantity: 0, reorderPoint: 5 });

    const sharedKey = `shared-org-key-${Date.now()}`;

    // Org A transfers 12 units
    const resA = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', sharedKey)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 12
      });

    expect(resA.status).toBe(201);
    expect(resA.body.quantity).toBe(12);
    expect(resA.body.sourceShopId).toBe(shopA1.id);

    // Org B uses the exact same key to transfer 8 units
    const resB = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenB)
      .set('Idempotency-Key', sharedKey)
      .send({
        sourceShopId: shopB1.id,
        destinationShopId: shopB2.id,
        productId: prodB.id,
        quantity: 8
      });

    expect(resB.status).toBe(201);
    expect(resB.body.quantity).toBe(8);
    expect(resB.body.sourceShopId).toBe(shopB1.id);
    expect(resB.body.reference).not.toBe(resA.body.reference);

    // Verify Org A inventory: 30 - 12 = 18
    const invA1 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA1.id } });
    expect(parseFloat(invA1.stockQuantity)).toBe(18);

    // Verify Org B inventory: 40 - 8 = 32
    const invB1 = await Inventory.findOne({ where: { productId: prodB.id, shopId: shopB1.id } });
    expect(parseFloat(invB1.stockQuantity)).toBe(32);
  });

  // ==========================================================================
  // Test 5: Failed Transfer Does Not Consume Idempotency Key
  // ==========================================================================
  test('5. Transactional failure (insufficient stock) does not leave a consumed idempotency record and key can be reused', async () => {
    const prodA = await createProductHelper({
      name: 'Limited Item',
      price: 300,
      cost: 150,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    await Inventory.create({ productId: prodA.id, shopId: shopA1.id, stockQuantity: 10, reorderPoint: 5 });
    await Inventory.create({ productId: prodA.id, shopId: shopA2.id, stockQuantity: 0, reorderPoint: 5 });

    const key = `key-fail-test-${Date.now()}`;

    // Attempt transfer of 999 units (should fail with 409)
    const failRes = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 999
      });

    expect(failRes.status).toBe(409);

    // Idempotency state must NOT have been saved
    const record = await StockTransfer.findOne({ where: { organizationId: orgA.id, idempotencyKey: key } });
    expect(record).toBeNull();

    // Now send a valid transfer (5 units) using the same key
    const validRes = await request(app)
      .post('/api/transfers')
      .set('Authorization', tokenA)
      .set('Idempotency-Key', key)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: prodA.id,
        quantity: 5
      });

    expect(validRes.status).toBe(201);
    expect(validRes.body.quantity).toBe(5);

    const invA1 = await Inventory.findOne({ where: { productId: prodA.id, shopId: shopA1.id } });
    expect(parseFloat(invA1.stockQuantity)).toBe(5);
  });

  // ==========================================================================
  // Test 6: Database Constraint Enforcement on StockMovement.organizationId
  // ==========================================================================
  test('6. StockMovement.organizationId cannot be NULL at database level', async () => {
    const prodA = await createProductHelper({
      name: 'Constraint Item',
      price: 100,
      cost: 50,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    // Attempt direct raw insert with NULL organizationId
    await expect(
      sequelize.query(`
        INSERT INTO StockMovements (shopId, productId, quantity, previousStock, newStock, type, createdAt, updatedAt)
        VALUES (${shopA1.id}, ${prodA.id}, 10, 0, 10, 'ADJUSTMENT', NOW(), NOW())
      `)
    ).rejects.toThrow();
  });
});
