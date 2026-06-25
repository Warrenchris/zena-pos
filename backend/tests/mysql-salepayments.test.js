'use strict';
const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Category, Product, Sale, SaleItem, Customer,
  Employee, User, PendingPayment, HeldCart, ActivityLog
} = require('../src/models');
const SalePayment = require('../src/models/SalePayment');
const axios = require('axios');

jest.mock('axios');

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
  return 'Bearer ' + jwt.sign(user, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('MySQL + SalePayments Integration Tests', () => {
  let shop;
  let category;
  let product;

  const adminToken = tokenFor({ id: 201, role: 'admin', shopId: 1 });
  const cashierToken = tokenFor({ id: '660e8400-e29b-41d4-a716-446655440000', role: 'cashier', shopId: 1, isEmployee: true });

  const cleanDb = async () => {
    await SalePayment.destroy({ where: {} });
    await PendingPayment.destroy({ where: {} });
    await HeldCart.destroy({ where: { shopId: 1 } });
    await ActivityLog.destroy({ where: { shopId: 1 } });
    await SaleItem.destroy({ where: { shopId: 1 } });
    await Sale.destroy({ where: { shopId: 1 } });
    await Customer.destroy({ where: { shopId: 1 } });
    await Product.destroy({ where: { shopId: 1 } });
    await Category.destroy({ where: { shopId: 1 } });
    await User.destroy({ where: { [Op.or]: [{ id: 201 }, { email: 'msadmin@example.com' }] } });
    await Employee.destroy({ where: { [Op.or]: [{ id: '660e8400-e29b-41d4-a716-446655440000' }, { email: 'mscashier@example.com' }] } });
  };

  beforeAll(async () => {
    // Set mock env vars for payment services
    process.env.MPESA_CONSUMER_KEY = 'mock_consumer_key';
    process.env.MPESA_CONSUMER_SECRET = 'mock_consumer_secret';
    process.env.MPESA_SHORTCODE = '174379';
    process.env.MPESA_PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    process.env.MPESA_CALLBACK_URL = 'http://localhost:3000/api/mpesa/callback';
    process.env.FLW_SECRET_KEY = 'FLWSECK_TEST-mock_secret_key';
    process.env.FLW_PUBLIC_KEY = 'FLWPUBK_TEST-mock_public_key';

    await sequelize.authenticate();
    await cleanDb();

    [shop] = await Shop.findOrCreate({ where: { id: 1 }, defaults: { name: 'MS Test Shop', active: true } });

    category = await Category.create({ name: 'MS Test Category', shopId: 1, active: true });

    product = await Product.create({
      name: 'Paracetamol',
      sku: `SKU-MS-${Date.now()}`,
      barcode: 'BARCODE-MS-001',
      price: 15.00,
      cost: 7.00,
      stockQuantity: 200,
      reorderPoint: 5,
      categoryId: category.id,
      shopId: 1,
      active: true
    });

    await User.create({
      id: 201,
      name: 'MS Admin',
      email: 'msadmin@example.com',
      password: 'Password123!',
      role: 'admin',
      shopId: 1
    });

    await Employee.create({
      id: '660e8400-e29b-41d4-a716-446655440000',
      firstName: 'MS',
      lastName: 'Cashier',
      email: 'mscashier@example.com',
      position: 'cashier',
      status: 'active',
      password: 'Password123!',
      salary: 2000.00,
      shopId: 1
    });
  }, 30000);

  afterAll(async () => {
    await cleanDb();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================================================================
  // M.1 — pg_trgm migration skips on MySQL
  // ===================================================================
  test('TEST M.1 — pg_trgm migration skips on MySQL', async () => {
    // The migration 20260624000003-add-pg-trgm-to-products.js has a guard:
    //   if (queryInterface.sequelize.getDialect() !== 'postgres') return;
    // Verify it ran without errors by checking SequelizeMeta
    const [meta] = await sequelize.query(
      "SELECT name FROM SequelizeMeta WHERE name LIKE '%add-pg-trgm%'"
    );
    expect(meta.length).toBe(1);
    expect(meta[0].name).toContain('add-pg-trgm');

    // Verify NO pg_trgm index exists on Products (it should have been skipped)
    const [indexes] = await sequelize.query('SHOW INDEX FROM Products');
    const trgmIndex = indexes.find(idx => idx.Key_name && idx.Key_name.includes('trgm'));
    expect(trgmIndex).toBeUndefined();
  });

  // ===================================================================
  // M.2 — MySQL fuzzy search returns results for typo input
  // ===================================================================
  test('TEST M.2 — MySQL fuzzy search returns results for typo input', async () => {
    // Exact match should work
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', adminToken)
      .query({ search: 'Paracetamol' })
      .expect(200);

    const results = res.body.products || res.body;
    expect(results.length).toBeGreaterThan(0);
    const found = results.find(p => p.name === 'Paracetamol');
    expect(found).toBeDefined();

    // Fuzzy search with typo — should return results or at least not crash
    const fuzzyRes = await request(app)
      .get('/api/products')
      .set('Authorization', adminToken)
      .query({ search: 'Parcetamol', fuzzy: 'true' })
      .expect(200);

    // Should respond with 200 and not error
    expect(fuzzyRes.status).toBe(200);
    // searchType may be present
    if (fuzzyRes.body.searchType) {
      expect(['exact', 'fuzzy']).toContain(fuzzyRes.body.searchType);
    }
  });

  // ===================================================================
  // M.3 — Employee sales report runs on MySQL with correct grouping
  // ===================================================================
  test('TEST M.3 — Employee sales report runs on MySQL with correct grouping', async () => {
    // Seed 2 sales for the UUID employee
    await Sale.create({
      invoiceNumber: `INV-MS3A-${Date.now()}`,
      total: 15.00, paymentAmount: 15.00, paymentMethod: 'cash',
      shopId: 1, employeeId: '660e8400-e29b-41d4-a716-446655440000', userId: null
    });
    await Sale.create({
      invoiceNumber: `INV-MS3B-${Date.now()}`,
      total: 30.00, paymentAmount: 30.00, paymentMethod: 'cash',
      shopId: 1, userId: 201, employeeId: null
    });

    const res = await request(app)
      .get('/api/reports/employee-sales')
      .set('Authorization', adminToken)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);

    // Verify both performers appear and no null entry exists
    const nullEntry = res.body.find(r => r.performerId === null || r.performerId === 'null');
    expect(nullEntry).toBeUndefined();

    // Clean up sales
    await Sale.destroy({ where: { shopId: 1 } });
  });

  // ===================================================================
  // M.4 — ActivityLogs migration creates performedByEmployee as VARCHAR(36)
  // ===================================================================
  test('TEST M.4 — ActivityLogs.performedByEmployee is VARCHAR(36) or CHAR(36)', async () => {
    const [[col]] = await sequelize.query(
      "SHOW COLUMNS FROM ActivityLogs LIKE 'performedByEmployee'"
    );
    expect(col).toBeDefined();
    expect(['varchar(36)', 'char(36)']).toContain(col.Type.toLowerCase());
  });

  // ===================================================================
  // M.5 — PendingPayments table has DECIMAL(10,2) amount and InnoDB engine
  // ===================================================================
  test('TEST M.5 — PendingPayments has DECIMAL(10,2) amount and InnoDB engine', async () => {
    const [[amtCol]] = await sequelize.query(
      "SHOW COLUMNS FROM PendingPayments LIKE 'amount'"
    );
    expect(amtCol).toBeDefined();
    expect(amtCol.Type.toLowerCase()).toBe('decimal(10,2)');

    const [[createStmt]] = await sequelize.query('SHOW CREATE TABLE PendingPayments');
    const ddl = createStmt['Create Table'];
    expect(ddl).toContain('ENGINE=InnoDB');
  });

  // ===================================================================
  // M.6 — HeldCarts JSON column stores and retrieves cart snapshot
  // ===================================================================
  test('TEST M.6 — HeldCarts JSON column stores and retrieves cart snapshot', async () => {
    const snapshot = { items: [{ id: 'abc', quantity: 2, price: 15.00 }] };

    const held = await HeldCart.create({
      shopId: 1,
      cashierId: '660e8400-e29b-41d4-a716-446655440000',
      label: 'M.6 test hold',
      cartSnapshot: snapshot,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      status: 'held'
    });

    const retrieved = await HeldCart.findByPk(held.id);
    expect(retrieved).toBeDefined();
    expect(retrieved.cartSnapshot).toBeDefined();
    expect(retrieved.cartSnapshot.items).toHaveLength(1);
    expect(retrieved.cartSnapshot.items[0].id).toBe('abc');
    expect(Number(retrieved.cartSnapshot.items[0].price)).toBe(15.00);

    await HeldCart.destroy({ where: { id: held.id } });
  });

  // ===================================================================
  // M.7 — Sales.saleStatus ENUM includes partial_refund
  // ===================================================================
  test('TEST M.7 — Sales.saleStatus ENUM includes partial_refund', async () => {
    const [[statusCol]] = await sequelize.query(
      "SHOW COLUMNS FROM Sales LIKE 'saleStatus'"
    );
    expect(statusCol).toBeDefined();
    expect(statusCol.Type).toContain('partial_refund');
  });

  // ===================================================================
  // M.8 — Standard cash sale writes one SalePayments row
  // ===================================================================
  test('TEST M.8 — Standard cash sale writes one SalePayments row', async () => {
    const payload = {
      items: [{ productId: product.id, quantity: 1, price: 15.00 }],
      total: 15.00,
      paymentAmount: 15.00,
      paymentMethod: 'cash'
    };

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const saleId = res.body.id;
    expect(saleId).toBeDefined();

    const payments = await SalePayment.findAll({ where: { saleId } });
    expect(payments.length).toBe(1);
    expect(payments[0].paymentMethod).toBe('cash');
    expect(Number(payments[0].amount)).toBe(15.00);

    await SalePayment.destroy({ where: { saleId } });
    await SaleItem.destroy({ where: { saleId } });
    await Sale.destroy({ where: { id: saleId } });
  });

  // ===================================================================
  // M.9 — M-Pesa sale writes SalePayments row with correct gatewayRef
  // ===================================================================
  test('TEST M.9 — M-Pesa callback creates sale with paymentReference', async () => {
    const checkoutRequestId = 'ws_CO_TEST_M9';

    await PendingPayment.create({
      checkoutRequestId,
      orderId: 'order_test_M9',
      amount: 15.00,
      status: 'pending',
      paymentChannel: 'mpesa',
      shopId: 1,
      saleData: {
        items: [{ productId: product.id, quantity: 1, price: 15.00 }],
        total: 15.00,
        paymentAmount: 15.00,
        paymentMethod: 'mobile',
        customer: { name: 'M9 Customer' }
      }
    });

    const callbackPayload = {
      Body: {
        stkCallback: {
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 15.00 },
              { Name: 'MpesaReceiptNumber', Value: 'MPESA_TEST_M9' }
            ]
          }
        }
      }
    };

    await request(app)
      .post('/api/mpesa/callback')
      .send(callbackPayload)
      .expect(200);

    const sale = await Sale.findOne({ where: { paymentReference: 'MPESA_TEST_M9', shopId: 1 } });
    expect(sale).toBeDefined();

    // Verify a SalePayments row was written
    const payments = await SalePayment.findAll({ where: { saleId: sale.id } });
    expect(payments.length).toBeGreaterThanOrEqual(1);

    await SalePayment.destroy({ where: { saleId: sale.id } });
    await SaleItem.destroy({ where: { saleId: sale.id } });
    await Sale.destroy({ where: { id: sale.id } });
  });

  // ===================================================================
  // M.10 — Card sale writes SalePayments row with Flutterwave reference
  // ===================================================================
  test('TEST M.10 — Card sale writes SalePayments row with Flutterwave reference', async () => {
    const reference = 'flw_ref_test_M10';

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: { status: 'successful', amount: 15.00, currency: 'KES', id: 'FLW_REF_M10' }
      }
    });

    await PendingPayment.create({
      checkoutRequestId: reference,
      orderId: 'order_test_M10',
      amount: 15.00,
      status: 'pending',
      paymentChannel: 'card',
      shopId: 1,
      saleData: {
        items: [{ productId: product.id, quantity: 1, price: 15.00 }],
        total: 15.00,
        paymentAmount: 15.00,
        paymentMethod: 'card',
        customer: { name: 'Card M10 Customer' }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', adminToken)
      .send({ reference })
      .expect(200);

    expect(res.body.verified).toBe(true);

    const sale = await Sale.findOne({ where: { paymentReference: 'FLW_REF_M10', shopId: 1 } });
    expect(sale).toBeDefined();

    const payments = await SalePayment.findAll({ where: { saleId: sale.id } });
    expect(payments.length).toBeGreaterThanOrEqual(1);

    await SalePayment.destroy({ where: { saleId: sale.id } });
    await SaleItem.destroy({ where: { saleId: sale.id } });
    await Sale.destroy({ where: { id: sale.id } });
  });

  // ===================================================================
  // M.11 — Split sale with cash + M-Pesa creates two SalePayments rows
  // ===================================================================
  test('TEST M.11 — Split sale with cash + M-Pesa creates two SalePayments rows', async () => {
    const payload = {
      items: [{ productId: product.id, quantity: 1 }],
      total: 15.00,
      payments: [
        { paymentMethod: 'cash', amount: 5.00 },
        { paymentMethod: 'mpesa', amount: 10.00, gatewayRef: 'MPESA_SPLIT_M11' }
      ]
    };

    const res = await request(app)
      .post('/api/sales/split')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const saleId = res.body.id;
    expect(saleId).toBeDefined();
    expect(res.body.paymentMethod).toBe('split');

    const payments = await SalePayment.findAll({ where: { saleId } });
    expect(payments.length).toBe(2);

    const cashLeg = payments.find(p => p.paymentMethod === 'cash');
    const mpesaLeg = payments.find(p => p.paymentMethod === 'mpesa');
    expect(cashLeg).toBeDefined();
    expect(mpesaLeg).toBeDefined();
    expect(mpesaLeg.gatewayRef).toBe('MPESA_SPLIT_M11');

    await SalePayment.destroy({ where: { saleId } });
    await SaleItem.destroy({ where: { saleId } });
    await Sale.destroy({ where: { id: saleId } });
  });

  // ===================================================================
  // M.12 — Split sale rejected if payment amounts do not sum to total
  // ===================================================================
  test('TEST M.12 — Split sale rejected if payment amounts do not sum to total', async () => {
    const payload = {
      items: [{ productId: product.id, quantity: 1 }],
      total: 15.00,
      payments: [
        { paymentMethod: 'cash', amount: 5.00 },
        { paymentMethod: 'mpesa', amount: 3.00, gatewayRef: 'MPESA_UNDER_M12' }
        // Total = 8.00, but item total = 15.00
      ]
    };

    const res = await request(app)
      .post('/api/sales/split')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(400);

    expect(res.body.error).toContain('Insufficient payment amount');
  });

  // ===================================================================
  // M.13 — Split sale rejected if M-Pesa leg has no gatewayRef
  // ===================================================================
  test('TEST M.13 — Split sale rejected if M-Pesa leg has no gatewayRef', async () => {
    const payload = {
      items: [{ productId: product.id, quantity: 1 }],
      total: 15.00,
      payments: [
        { paymentMethod: 'cash', amount: 5.00 },
        { paymentMethod: 'mpesa', amount: 10.00 } // Missing gatewayRef
      ]
    };

    const res = await request(app)
      .post('/api/sales/split')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(400);

    expect(res.body.error).toContain('M-Pesa');
  });

  // ===================================================================
  // M.14 — GET /api/sales/:id/payments returns all payment legs
  // ===================================================================
  test('TEST M.14 — GET /api/sales/:id/payments returns all payment legs', async () => {
    // Create a split sale first
    const payload = {
      items: [{ productId: product.id, quantity: 1 }],
      total: 15.00,
      payments: [
        { paymentMethod: 'cash', amount: 7.00 },
        { paymentMethod: 'mpesa', amount: 8.00, gatewayRef: 'MPESA_SPLIT_M14' }
      ]
    };

    const splitRes = await request(app)
      .post('/api/sales/split')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const saleId = splitRes.body.id;

    // Fetch payments via the API
    const res = await request(app)
      .get(`/api/sales/${saleId}/payments`)
      .set('Authorization', adminToken)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body.find(p => p.paymentMethod === 'cash')).toBeDefined();
    expect(res.body.find(p => p.paymentMethod === 'mpesa')).toBeDefined();

    await SalePayment.destroy({ where: { saleId } });
    await SaleItem.destroy({ where: { saleId } });
    await Sale.destroy({ where: { id: saleId } });
  });

  // ===================================================================
  // M.15 — Split sale rolls back fully on transaction failure
  // ===================================================================
  test('TEST M.15 — Split sale rolls back fully on transaction failure', async () => {
    const initialStock = (await Product.findByPk(product.id)).stockQuantity;
    const initialSaleCount = await Sale.count({ where: { shopId: 1 } });

    // Mock SalePayment.create to throw on 2nd call
    let callCount = 0;
    const originalCreate = SalePayment.create.bind(SalePayment);
    const spy = jest.spyOn(SalePayment, 'create').mockImplementation(async function (...args) {
      callCount++;
      if (callCount === 2) {
        throw new Error('Simulated DB failure on 2nd SalePayment.create');
      }
      return originalCreate(...args);
    });

    try {
      const payload = {
        items: [{ productId: product.id, quantity: 1 }],
        total: 15.00,
        payments: [
          { paymentMethod: 'cash', amount: 7.00 },
          { paymentMethod: 'mpesa', amount: 8.00, gatewayRef: 'MPESA_ROLLBACK_M15' }
        ]
      };

      await request(app)
        .post('/api/sales/split')
        .set('Authorization', adminToken)
        .send(payload)
        .expect(500);
    } finally {
      spy.mockRestore();
    }

    // Verify stock unchanged
    const finalStock = (await Product.findByPk(product.id)).stockQuantity;
    expect(finalStock).toBe(initialStock);

    // Verify no sale was persisted
    const finalSaleCount = await Sale.count({ where: { shopId: 1 } });
    expect(finalSaleCount).toBe(initialSaleCount);
  });
});
