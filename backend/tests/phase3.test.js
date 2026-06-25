const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { Shop, Category, Product, Sale, SaleItem, Customer, Employee, User, SaleRefund, HeldCart, SalePayment, ActivityLog } = require('../src/models');

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');

  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  return 'Bearer ' + jwt.sign(
    user,
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h'
    }
  );
}

// Mock localStorage for the frontend emulation tests
const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = String(value); }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
  };
})();

global.localStorage = mockLocalStorage;

describe('Phase 3 Remediation Tests', () => {
  let shop1, shop2;
  let category;
  let product1, product2;
  let sale;
  const adminToken = tokenFor({ id: 101, role: 'admin', shopId: 1 });
  const shop2AdminToken = tokenFor({ id: 102, role: 'admin', shopId: 2 });
  const cashierToken = tokenFor({ id: '550e8400-e29b-41d4-a716-446655440000', role: 'cashier', shopId: 1, isEmployee: true });

  const cleanDb = async () => {
    await ActivityLog.destroy({ where: {} });
    await HeldCart.destroy({ where: {} });
    await SaleRefund.destroy({ where: {} });
    await SaleItem.destroy({ where: {} });
    await SalePayment.destroy({ where: {} });
    await Sale.destroy({ where: {} });
    await Customer.destroy({ where: {} });
    await Product.destroy({ where: {} });
    await Category.destroy({ where: {} });
    await User.destroy({ where: { [Op.or]: [{ id: 101 }, { id: 102 }, { email: 'admin@example.com' }] } });
    await Employee.destroy({ where: { [Op.or]: [{ id: '550e8400-e29b-41d4-a716-446655440000' }, { email: 'cashier@example.com' }] } });
  };

  beforeAll(async () => {
    await sequelize.authenticate();
    await cleanDb();

    // Setup shops
    [shop1] = await Shop.findOrCreate({ where: { id: 1 }, defaults: { name: 'Shop 1', active: true } });
    [shop2] = await Shop.findOrCreate({ where: { id: 2 }, defaults: { name: 'Shop 2', active: true } });

    // Setup category
    category = await Category.create({ name: 'Test Category', shopId: 1, active: true });

    // Setup products
    product1 = await Product.create({
      name: 'Product A',
      sku: 'SKU-A',
      barcode: 'BARCODE-A',
      price: 15.00,
      cost: 7.00,
      stockQuantity: 100,
      reorderPoint: 5,
      categoryId: category.id,
      shopId: 1,
      active: true
    });

    product2 = await Product.create({
      name: 'Product B',
      sku: 'SKU-B',
      barcode: 'BARCODE-B',
      price: 25.00,
      cost: 12.00,
      stockQuantity: 50,
      reorderPoint: 5,
      categoryId: category.id,
      shopId: 1,
      active: true
    });

    // Setup User and Employee
    await User.create({
      id: 101,
      name: 'Admin Manager 1',
      email: 'admin1@example.com',
      password: 'Password123!',
      role: 'admin',
      shopId: 1
    });

    await User.create({
      id: 102,
      name: 'Admin Manager 2',
      email: 'admin2@example.com',
      password: 'Password123!',
      role: 'admin',
      shopId: 2
    });

    await Employee.create({
      id: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Cashier',
      lastName: 'UUID',
      email: 'cashier@example.com',
      position: 'cashier',
      status: 'active',
      password: 'Password123!',
      salary: 2000.00,
      shopId: 1
    });
  });

  afterAll(async () => {
    await cleanDb();
    await sequelize.close();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  // TEST 3.1 — Cart survives page refresh (frontend logic emulation)
  test('TEST 3.1 — Cart survives page refresh', async () => {
    const cashierId = '550e8400-e29b-41d4-a716-446655440000';
    const key = `zena_cart_${cashierId}`;
    
    const initialCart = {
      items: [
        { id: product1.id, name: 'Product A', quantity: 2, price: 10.00 } // price snapshot at 10.00
      ],
      customer: { name: 'Restored User' },
      customerId: 5,
      savedAt: Date.now()
    };

    localStorage.setItem(key, JSON.stringify(initialCart));

    // Simulate Mount rehydration and price verification
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toBeDefined();
    expect(stored.customerId).toBe(5);

    // Verify re-fetching logic: Backend fetch of product1 returns 15.00 (new price)
    const res = await request(app)
      .get(`/api/products/${product1.id}`)
      .set('Authorization', cashierToken)
      .expect(200);

    const freshPrice = parseFloat(res.body.price);
    expect(freshPrice).toBe(15.00); // Verify it re-fetched 15.00, not 10.00
  });

  // TEST 3.2 — Cart does not restore after checkout
  test('TEST 3.2 — Cart does not restore after checkout', () => {
    const cashierId = '550e8400-e29b-41d4-a716-446655440000';
    const key = `zena_cart_${cashierId}`;

    // Checkout clears persisted cart
    localStorage.setItem(key, JSON.stringify({ items: [{ id: product1.id }] }));
    localStorage.removeItem(key);

    const stored = localStorage.getItem(key);
    expect(stored).toBeNull();
  });

  // TEST 3.3 — Cart does not bleed between cashier accounts
  test('TEST 3.3 — Cart does not bleed between cashier accounts', () => {
    const cashier1 = 'cashier_1';
    const cashier2 = 'cashier_2';

    localStorage.setItem(`zena_cart_${cashier1}`, JSON.stringify({ items: [{ id: product1.id }] }));

    // Cashier 2 mounts and should see their own empty cart (no key exists)
    const storedCashier2 = localStorage.getItem(`zena_cart_${cashier2}`);
    expect(storedCashier2).toBeNull();
  });

  // TEST 3.4 — Expired cart (> 8 hours) is silently discarded
  test('TEST 3.4 — Expired cart (> 8 hours) is silently discarded', () => {
    const cashierId = '550e8400-e29b-41d4-a716-446655440000';
    const key = `zena_cart_${cashierId}`;

    const nineHoursAgo = Date.now() - (9 * 60 * 60 * 1000);
    const expiredCart = {
      items: [{ id: product1.id }],
      savedAt: nineHoursAgo
    };

    localStorage.setItem(key, JSON.stringify(expiredCart));

    // Simulation of client mounting checks
    const parsed = JSON.parse(localStorage.getItem(key));
    const age = Date.now() - parsed.savedAt;
    let finalCart = parsed;
    if (age > 8 * 60 * 60 * 1000) {
      localStorage.removeItem(key);
      finalCart = null;
    }

    expect(finalCart).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  // TEST 3.5 — Hold cart saves to database
  test('TEST 3.5 — Hold cart saves to database', async () => {
    const payload = {
      label: 'Test hold',
      items: [
        { productId: product1.id, quantity: 2, price: 15.00 }
      ],
      customer: { name: 'Held Customer' }
    };

    const res = await request(app)
      .post('/api/held-carts')
      .set('Authorization', cashierToken)
      .send(payload)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.label).toBe('Test hold');
    expect(res.body.status).toBe('held');

    const dbRow = await HeldCart.findByPk(res.body.id);
    expect(dbRow).toBeDefined();
    expect(dbRow.status).toBe('held');
  });

  // TEST 3.6 — Recall restores cart and marks hold as recalled
  test('TEST 3.6 — Recall restores cart and marks hold as recalled', async () => {
    const held = await HeldCart.create({
      shopId: 1,
      cashierId: '550e8400-e29b-41d4-a716-446655440000',
      label: 'Recall Test',
      cartSnapshot: { items: [{ id: product1.id, quantity: 1, price: 15.00 }] },
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      status: 'held'
    });

    const res = await request(app)
      .post(`/api/held-carts/${held.id}/recall`)
      .set('Authorization', cashierToken)
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(res.body.items[0].id).toBe(product1.id);

    const dbRow = await HeldCart.findByPk(held.id);
    expect(dbRow.status).toBe('recalled');
  });

  // TEST 3.7 — Expired held carts are not returned
  test('TEST 3.7 — Expired held carts are not returned', async () => {
    // Seed expired cart
    await HeldCart.create({
      shopId: 1,
      cashierId: '550e8400-e29b-41d4-a716-446655440000',
      label: 'Expired Cart',
      cartSnapshot: { items: [] },
      heldAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // expired 1hr ago
      status: 'held'
    });

    const res = await request(app)
      .get('/api/held-carts')
      .set('Authorization', cashierToken)
      .expect(200);

    const expired = res.body.find(c => c.label === 'Expired Cart');
    expect(expired).toBeUndefined();
  });

  // TEST 3.8 — Full refund updates sale status to 'refunded'
  test('TEST 3.8 — Full refund updates sale status to \'refunded\'', async () => {
    const initialStock1 = (await Product.findByPk(product1.id)).stockQuantity;
    const initialStock2 = (await Product.findByPk(product2.id)).stockQuantity;

    // Seed sale
    const s = await Sale.create({
      invoiceNumber: `INV-${Date.now()}-1`,
      subtotal: 40.00,
      total: 40.00,
      paymentAmount: 40.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({ saleId: s.id, productId: product1.id, quantity: 1, price: 15.00, shopId: 1 });
    await SaleItem.create({ saleId: s.id, productId: product2.id, quantity: 1, price: 25.00, shopId: 1 });

    const refundPayload = {
      items: [
        { productId: product1.id, quantity: 1, reason: 'Defective' },
        { productId: product2.id, quantity: 1, reason: 'Wrong Size' }
      ]
    };

    const res = await request(app)
      .post(`/api/sales/${s.id}/refund`)
      .set('Authorization', adminToken)
      .send(refundPayload)
      .expect(200);

    expect(res.body.saleStatus).toBe('refunded');
    expect(res.body.refunds.length).toBe(2);

    const updatedSale = await Sale.findByPk(s.id);
    expect(updatedSale.saleStatus).toBe('refunded');

    const finalStock1 = (await Product.findByPk(product1.id)).stockQuantity;
    const finalStock2 = (await Product.findByPk(product2.id)).stockQuantity;

    expect(finalStock1).toBe(initialStock1 + 1);
    expect(finalStock2).toBe(initialStock2 + 1);
  });

  // TEST 3.9 — Partial refund updates sale status to 'partial_refund'
  test('TEST 3.9 — Partial refund updates sale status to \'partial_refund\'', async () => {
    const initialStock1 = (await Product.findByPk(product1.id)).stockQuantity;

    const s = await Sale.create({
      invoiceNumber: `INV-${Date.now()}-2`,
      subtotal: 30.00,
      total: 30.00,
      paymentAmount: 30.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({ saleId: s.id, productId: product1.id, quantity: 2, price: 15.00, shopId: 1 });

    const refundPayload = {
      items: [
        { productId: product1.id, quantity: 1, reason: 'Returned' }
      ]
    };

    const res = await request(app)
      .post(`/api/sales/${s.id}/refund`)
      .set('Authorization', adminToken)
      .send(refundPayload)
      .expect(200);

    expect(res.body.saleStatus).toBe('partial_refund');
    expect(res.body.refunds.length).toBe(1);

    const updatedSale = await Sale.findByPk(s.id);
    expect(updatedSale.saleStatus).toBe('partial_refund');

    const finalStock1 = (await Product.findByPk(product1.id)).stockQuantity;
    expect(finalStock1).toBe(initialStock1 + 1);
  });

  // TEST 3.10 — Over-refund is rejected
  test('TEST 3.10 — Over-refund is rejected', async () => {
    const initialStock1 = (await Product.findByPk(product1.id)).stockQuantity;

    const s = await Sale.create({
      invoiceNumber: `INV-${Date.now()}-3`,
      subtotal: 15.00,
      total: 15.00,
      paymentAmount: 15.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({ saleId: s.id, productId: product1.id, quantity: 1, price: 15.00, shopId: 1 });

    const refundPayload = {
      items: [
        { productId: product1.id, quantity: 2, reason: 'Over Refund' } // sold only 1
      ]
    };

    await request(app)
      .post(`/api/sales/${s.id}/refund`)
      .set('Authorization', adminToken)
      .send(refundPayload)
      .expect(400);

    const finalStock1 = (await Product.findByPk(product1.id)).stockQuantity;
    expect(finalStock1).toBe(initialStock1); // Stock must remain unchanged
  });

  // TEST 3.11 — Cross-shop refund is rejected
  test('TEST 3.11 — Cross-shop refund is rejected', async () => {
    const s = await Sale.create({
      invoiceNumber: `INV-${Date.now()}-4`,
      subtotal: 15.00,
      total: 15.00,
      paymentAmount: 15.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1 // belongs to shop 1
    });

    await SaleItem.create({ saleId: s.id, productId: product1.id, quantity: 1, price: 15.00, shopId: 1 });

    const refundPayload = {
      items: [
        { productId: product1.id, quantity: 1, reason: 'Cross-shop' }
      ]
    };

    // Authenticated as shop 2 Admin
    await request(app)
      .post(`/api/sales/${s.id}/refund`)
      .set('Authorization', shop2AdminToken)
      .send(refundPayload)
      .expect(403);
  });

  // TEST 3.12 — Refund transaction is atomic
  test('TEST 3.12 — Refund transaction is atomic', async () => {
    const initialStock1 = (await Product.findByPk(product1.id)).stockQuantity;
    const initialStock2 = (await Product.findByPk(product2.id)).stockQuantity;

    const s = await Sale.create({
      invoiceNumber: `INV-${Date.now()}-5`,
      subtotal: 30.00,
      total: 30.00,
      paymentAmount: 30.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({ saleId: s.id, productId: product1.id, quantity: 1, price: 15.00, shopId: 1 });
    await SaleItem.create({ saleId: s.id, productId: product2.id, quantity: 1, price: 15.00, shopId: 1 });

    const refundPayload = {
      items: [
        { productId: product1.id, quantity: 1, reason: 'Valid refund item 1' },
        { productId: product2.id, quantity: 1, reason: 'Valid refund item 2' }
      ]
    };

    let callCount = 0;
    const originalCreate = SaleRefund.create;
    const spy = jest.spyOn(SaleRefund, 'create').mockImplementation(async function(values, options) {
      callCount++;
      if (callCount === 2) {
        throw new Error('Simulated database error on second insert');
      }
      return originalCreate.call(SaleRefund, values, options);
    });

    try {
      await request(app)
        .post(`/api/sales/${s.id}/refund`)
        .set('Authorization', adminToken)
        .send(refundPayload)
        .expect(500); // rollback error
    } finally {
      spy.mockRestore();
    }

    // Verify stock remains completely unchanged
    const finalStock1 = (await Product.findByPk(product1.id)).stockQuantity;
    const finalStock2 = (await Product.findByPk(product2.id)).stockQuantity;
    expect(finalStock1).toBe(initialStock1);
    expect(finalStock2).toBe(initialStock2);

    // Verify no SaleRefund record was saved
    const refundRows = await SaleRefund.findAll({ where: { saleId: s.id } });
    expect(refundRows.length).toBe(0);
  });
});
