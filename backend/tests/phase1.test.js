const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { Shop, Category, Product, Sale, SaleItem, ActivityLog, Employee, User } = require('../src/models');

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

describe('Phase 1 Remediation Integration Tests', () => {
  let shop;
  let category;
  let products = [];
  const adminToken = tokenFor({ id: 101, role: 'admin', shopId: 1 });
  const cashierToken = tokenFor({ id: '550e8400-e29b-41d4-a716-446655440000', role: 'cashier', shopId: 1, isEmployee: true });

  const cleanDb = async () => {
    // Delete in reverse order of foreign key dependencies
    await ActivityLog.destroy({ where: { shopId: 1 } });
    await SaleItem.destroy({ where: { shopId: 1 } });
    await Sale.destroy({ where: { shopId: 1 } });
    await Product.destroy({ where: { shopId: 1 } });
    await User.destroy({ where: { [Op.or]: [{ id: 101 }, { email: 'admin@example.com' }] } });
    await Employee.destroy({ where: { [Op.or]: [{ id: '550e8400-e29b-41d4-a716-446655440000' }, { email: 'cashier@example.com' }] } });
  };

  beforeAll(async () => {
    await sequelize.authenticate();

    // Clean DB prior to seeding and user creation
    await cleanDb();

    // Ensure shop exists
    [shop] = await Shop.findOrCreate({
      where: { id: 1 },
      defaults: { name: 'Test Shop Alpha', active: true }
    });

    // Ensure category exists
    [category] = await Category.findOrCreate({
      where: { name: 'Phase1 Test Category', shopId: 1 },
      defaults: { active: true }
    });

    // Ensure admin user exists with ID 101 to pass Sales user foreign key checks
    await User.create({
      id: 101,
      name: 'Test Admin User',
      email: 'admin@example.com',
      password: 'Password123!',
      role: 'admin',
      shopId: 1
    });

    // Ensure UUID cashier exists in Employees table
    await Employee.create({
      id: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Test',
      lastName: 'Cashier',
      email: 'cashier@example.com',
      position: 'cashier',
      status: 'active',
      password: 'Password123!',
      salary: 2000.00,
      shopId: 1
    });

    // Seed 20 products
    for (let i = 1; i <= 20; i++) {
      const prod = await Product.create({
        name: `Product Number ${i}`,
        sku: `SKU-${i}-${Date.now()}`,
        barcode: `BARCODE-${1000 + i}`,
        price: 10.00 * i,
        cost: 5.00 * i,
        stockQuantity: 100,
        reorderPoint: 5,
        CategoryId: category.id,
        shopId: 1,
        active: true
      });
      products.push(prod);
    }
  }, 30000);

  afterAll(async () => {
    // Clean up
    await cleanDb();
  });

  // TEST 1.1 — Product search beyond 12 items
  test('TEST 1.1 — Product search beyond 12 items', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', adminToken)
      .query({ search: 'Product Number' })
      .expect(200);

    const result = res.body.products || res.body;
    const match = result.find(p => p.name === 'Product Number 15');
    expect(match).toBeDefined();

    // Check pagination count is indeed > 12
    const total = res.body.pagination?.total || result.length;
    expect(total).toBeGreaterThan(12);
  });

  // TEST 1.2 — Barcode lookup beyond 12 items
  test('TEST 1.2 — Barcode lookup beyond 12 items', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', adminToken)
      .query({ search: 'BARCODE-1018' })
      .expect(200);

    const result = res.body.products || res.body;
    expect(result.length).toBe(1);
    expect(result[0].barcode).toBe('BARCODE-1018');
  });

  // TEST 1.3 — Price manipulation rejection
  test('TEST 1.3 — Price manipulation rejection', async () => {
    const targetProduct = products[0];
    const initialSaleCount = await Sale.count();

    const payload = {
      items: [{ productId: targetProduct.id, quantity: 1, price: 0.01 }],
      total: 0.01,
      paymentAmount: 0.01,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(400);

    expect(res.body.error).toContain('Price mismatch');
    const finalSaleCount = await Sale.count();
    expect(finalSaleCount).toBe(initialSaleCount);
  });

  // TEST 1.4 — Underpayment rejection
  test('TEST 1.4 — Underpayment rejection', async () => {
    const targetProduct = products[1]; // Product 2 (Price: 20.00)
    const initialSaleCount = await Sale.count();

    const payload = {
      items: [{ productId: targetProduct.id, quantity: 1, price: 20.00 }],
      total: 20.00,
      paymentAmount: 19.00, // Underpayment
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(400);

    expect(res.body.error).toContain('Insufficient payment amount');
    const finalSaleCount = await Sale.count();
    expect(finalSaleCount).toBe(initialSaleCount);
  });

  // TEST 1.5 — Legitimate sale still works
  test('TEST 1.5 — Legitimate sale still works', async () => {
    const targetProduct = products[2]; // Product 3 (Price: 30.00)
    const initialStock = targetProduct.stockQuantity;

    const payload = {
      items: [{ productId: targetProduct.id, quantity: 2, price: 30.00 }],
      total: 60.00,
      paymentAmount: 60.00,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    expect(res.body.id).toBeDefined();

    // Verify stock is decremented
    const updatedProd = await Product.findByPk(targetProduct.id);
    expect(updatedProd.stockQuantity).toBe(initialStock - 2);
  });

  // TEST 1.6 — Activity log written on sale (integer user)
  test('TEST 1.6 — Activity log written on sale (integer user)', async () => {
    const targetProduct = products[3]; // Product 4 (Price: 40.00)
    const payload = {
      items: [{ productId: targetProduct.id, quantity: 1, price: 40.00 }],
      total: 40.00,
      paymentAmount: 50.00,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken) // Integer user (id: 101)
      .send(payload)
      .expect(201);

    const saleId = res.body.id;
    const log = await ActivityLog.findOne({
      where: {
        entity: 'Sale',
        entityId: String(saleId),
        userId: 101
      }
    });

    expect(log).toBeDefined();
    expect(log.action).toBe('SALE_CREATED');
  });

  // TEST 1.7 — Activity log written on sale (UUID employee)
  test('TEST 1.7 — Activity log written on sale (UUID employee)', async () => {
    const targetProduct = products[4]; // Product 5 (Price: 50.00)
    const payload = {
      items: [{ productId: targetProduct.id, quantity: 1, price: 50.00 }],
      total: 50.00,
      paymentAmount: 50.00,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', cashierToken) // UUID employee
      .send(payload)
      .expect(201);

    const saleId = res.body.id;
    const log = await ActivityLog.findOne({
      where: {
        entity: 'Sale',
        entityId: String(saleId),
        performedByEmployee: '550e8400-e29b-41d4-a716-446655440000'
      }
    });

    expect(log).toBeDefined();
    expect(log.action).toBe('SALE_CREATED');
  });

  // TEST 1.8 — Enhanced service import does not crash
  test('TEST 1.8 — Enhanced service import does not crash', () => {
    expect(() => {
      require('../src/services/EnhancedSaleService');
    }).not.toThrow();
  });
});
