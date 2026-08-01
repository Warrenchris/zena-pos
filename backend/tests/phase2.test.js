const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { Shop, Category, Product, Sale, SaleItem, Customer, Employee, User, PendingPayment, SalePayment, ActivityLog } = require('../src/models');
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

  return 'Bearer ' + jwt.sign(
    user,
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h'
    }
  );
}

describe('Phase 2 Remediation Tests', () => {
  let shop1, shop2;
  let category;
  let product;
  const adminToken = tokenFor({ id: 101, role: 'admin', shopId: 1 });
  const cashierToken = tokenFor({ id: '550e8400-e29b-41d4-a716-446655440000', role: 'cashier', shopId: 1, isEmployee: true });

  const cleanDb = async () => {
    await ActivityLog.destroy({ where: {} });
    await PendingPayment.destroy({ where: {} });
    await SaleItem.destroy({ where: {} });
    await SalePayment.destroy({ where: {} });
    await Sale.destroy({ where: {} });
    await Customer.destroy({ where: {} });
    await Product.destroy({ where: {} });
    await Category.destroy({ where: {} });
    await User.destroy({ where: { [Op.or]: [{ id: 101 }, { email: 'admin@example.com' }] } });
    await Employee.destroy({ where: { [Op.or]: [{ id: '550e8400-e29b-41d4-a716-446655440000' }, { email: 'cashier@example.com' }] } });
  };

  beforeAll(async () => {
    // Configure mock credentials for payment services
    process.env.MPESA_CONSUMER_KEY = 'mock_consumer_key';
    process.env.MPESA_CONSUMER_SECRET = 'mock_consumer_secret';
    process.env.MPESA_SHORTCODE = '174379';
    process.env.MPESA_PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
    process.env.MPESA_CALLBACK_URL = 'http://localhost:3000/api/mpesa/callback';
    process.env.FLW_SECRET_KEY = 'FLWSECK_TEST-mock_secret_key';
    process.env.FLW_PUBLIC_KEY = 'FLWPUBK_TEST-mock_public_key';

    await sequelize.authenticate();
    await cleanDb();

    // Setup shops
    [shop1] = await Shop.findOrCreate({ where: { id: 1 }, defaults: { name: 'Shop 1', active: true } });
    [shop2] = await Shop.findOrCreate({ where: { id: 2 }, defaults: { name: 'Shop 2', active: true } });

    // Setup category
    category = await Category.create({ name: 'Test Category', shopId: 1, active: true });

    // Setup products
    product = await Product.create({
      name: 'Test Product',
      sku: `SKU-TEST-${Date.now()}`,
      barcode: 'BARCODE-TEST',
      price: 10.00,
      cost: 5.00,
      stockQuantity: 100,
      reorderPoint: 5,
      categoryId: category.id,
      shopId: 1,
      active: true
    });

    // Setup User and Employee
    await User.create({
      id: 101,
      name: 'Admin Manager',
      email: 'admin@example.com',
      password: 'Password123!',
      role: 'admin',
      shopId: 1
    });

    await Employee.create({
      id: '550e8400-e29b-41d4-a716-446655440000',
      firstName: 'Cashier',
      lastName: 'UUID',
      email: 'cashier@example.com',
      position: 'cashier',
      status: 'active',
      password: 'Password123!',
      salary: 1500,
      shopId: 1
    });
  }, 30000);

  afterAll(async () => {
    await cleanDb();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // TEST 2.1 — STK push is triggered on M-Pesa selection
  test('TEST 2.1 — STK push is triggered on M-Pesa selection', async () => {
    axios.get.mockResolvedValueOnce({ data: { access_token: 'mpesa_oauth_token' } });
    axios.post.mockResolvedValueOnce({ data: { CheckoutRequestID: 'ws_CO_TEST_2.1' } });

    const payload = {
      phone: '0712345678',
      amount: 10.00,
      orderId: 'order_test_2.1',
      saleData: {
        items: [{ productId: product.id, quantity: 1, price: 10.00 }],
        total: 10.00,
        paymentAmount: 10.00,
        customer: { name: 'Mpesa Customer' }
      }
    };

    const res = await request(app)
      .post('/api/mpesa/initiate')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(200);

    expect(res.body.checkoutRequestId).toBe('ws_CO_TEST_2.1');
    expect(axios.post).toHaveBeenCalledTimes(1);

    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: 'ws_CO_TEST_2.1' } });
    expect(pending).toBeDefined();
    expect(pending.status).toBe('pending');
    expect(pending.paymentChannel).toBe('mpesa');
  });

  // TEST 2.2 — M-Pesa callback confirms sale
  test('TEST 2.2 — M-Pesa callback confirms sale', async () => {
    const checkoutRequestId = 'ws_CO_TEST_2.2';
    const initialStock = product.stockQuantity;

    await PendingPayment.create({
      checkoutRequestId,
      orderId: 'order_test_2.2',
      amount: 20.00,
      status: 'pending',
      paymentChannel: 'mpesa',
      shopId: 1,
      saleData: {
        items: [{ productId: product.id, quantity: 2, price: 10.00 }],
        total: 20.00,
        paymentAmount: 20.00,
        paymentMethod: 'mobile',
        customer: { name: 'M-Pesa Callback User' }
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
              { Name: 'Amount', Value: 20.00 },
              { Name: 'MpesaReceiptNumber', "Value": 'MPESAREC2.2' }
            ]
          }
        }
      }
    };

    await request(app)
      .post('/api/mpesa/callback')
      .send(callbackPayload)
      .expect(200);

    const pending = await PendingPayment.findOne({ where: { checkoutRequestId } });
    expect(pending.status).toBe('confirmed');

    const sale = await Sale.findOne({ where: { paymentReference: 'MPESAREC2.2' } });
    expect(sale).toBeDefined();
    expect(Number(sale.total)).toBe(20.00);

    const updatedProduct = await Product.findByPk(product.id);
    expect(updatedProduct.stockQuantity).toBe(initialStock - 2);
  });

  // TEST 2.3 — M-Pesa callback failure leaves sale uncreated
  test('TEST 2.3 — M-Pesa callback failure leaves sale uncreated', async () => {
    const checkoutRequestId = 'ws_CO_TEST_2.3';
    const initialSaleCount = await Sale.count();
    const initialStock = (await Product.findByPk(product.id)).stockQuantity;

    await PendingPayment.create({
      checkoutRequestId,
      orderId: 'order_test_2.3',
      amount: 10.00,
      status: 'pending',
      paymentChannel: 'mpesa',
      shopId: 1,
      saleData: {
        items: [{ productId: product.id, quantity: 1, price: 10.00 }],
        total: 10.00,
        paymentAmount: 10.00,
        paymentMethod: 'mobile',
        customer: { name: 'Fail User' }
      }
    });

    const callbackPayload = {
      Body: {
        stkCallback: {
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 1032,
          ResultDesc: 'Request cancelled by user.'
        }
      }
    };

    await request(app)
      .post('/api/mpesa/callback')
      .send(callbackPayload)
      .expect(200);

    const pending = await PendingPayment.findOne({ where: { checkoutRequestId } });
    expect(pending.status).toBe('failed');

    const finalSaleCount = await Sale.count();
    expect(finalSaleCount).toBe(initialSaleCount);

    const finalStock = (await Product.findByPk(product.id)).stockQuantity;
    expect(finalStock).toBe(initialStock);
  });

  // TEST 2.4 — Card payment verification creates sale
  test('TEST 2.4 — Card payment verification creates sale', async () => {
    const reference = 'flw_ref_test_2.4';
    const initialStock = (await Product.findByPk(product.id)).stockQuantity;

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'successful',
          amount: 10.00,
          currency: 'KES',
          id: 'FLW_GATEWAY_REF_2.4'
        }
      }
    });

    await PendingPayment.create({
      checkoutRequestId: reference,
      orderId: 'order_test_2.4',
      amount: 10.00,
      status: 'pending',
      paymentChannel: 'card',
      shopId: 1,
      saleData: {
        items: [{ productId: product.id, quantity: 1, price: 10.00 }],
        total: 10.00,
        paymentAmount: 10.00,
        paymentMethod: 'card',
        customer: { name: 'Card Customer' }
      }
    });

    const res = await request(app)
      .post('/api/card/verify')
      .set('Authorization', adminToken)
      .send({ reference })
      .expect(200);

    expect(res.body.verified).toBe(true);

    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: reference } });
    expect(pending.status).toBe('confirmed');

    const sale = await Sale.findOne({ where: { paymentReference: 'FLW_GATEWAY_REF_2.4' } });
    expect(sale).toBeDefined();

    const finalStock = (await Product.findByPk(product.id)).stockQuantity;
    expect(finalStock).toBe(initialStock - 1);
  });

  // TEST 2.5 — Failed card verification blocks sale
  test('TEST 2.5 — Failed card verification blocks sale', async () => {
    const reference = 'flw_ref_test_2.5';
    const initialSaleCount = await Sale.count();

    axios.get.mockResolvedValueOnce({
      data: {
        status: 'success',
        data: {
          status: 'failed',
          amount: 0,
          currency: 'KES',
          id: ''
        }
      }
    });

    await PendingPayment.create({
      checkoutRequestId: reference,
      orderId: 'order_test_2.5',
      amount: 10.00,
      status: 'pending',
      paymentChannel: 'card',
      shopId: 1,
      saleData: {
        items: [{ productId: product.id, quantity: 1, price: 10.00 }],
        total: 10.00,
        paymentAmount: 10.00,
        paymentMethod: 'card',
        customer: { name: 'Failed Card User' }
      }
    });

    await request(app)
      .post('/api/card/verify')
      .set('Authorization', adminToken)
      .send({ reference })
      .expect(400);

    const pending = await PendingPayment.findOne({ where: { checkoutRequestId: reference } });
    expect(pending.status).toBe('failed');

    const finalSaleCount = await Sale.count();
    expect(finalSaleCount).toBe(initialSaleCount);
  });

  // TEST 2.6 — Customer search returns existing records
  test('TEST 2.6 — Customer search returns existing records', async () => {
    // Seed 5 customers for shopId=1
    for (let i = 1; i <= 5; i++) {
      await Customer.create({
        name: `Customer Alpha ${i}`,
        email: `customer${i}@shop1.com`,
        phone: `071111111${i}`,
        shopId: 1,
        active: true
      });
    }

    // Seed customer for shopId=2 to assert isolation
    await Customer.create({
      name: 'Customer Shop 2',
      email: 'customer@shop2.com',
      phone: '0722222222',
      shopId: 2,
      active: true
    });

    const res = await request(app)
      .get('/api/customers')
      .set('Authorization', adminToken)
      .query({ search: 'Alpha 3' })
      .expect(200);

    const customers = res.body.customers || res.body;
    expect(customers.length).toBe(1);
    expect(customers[0].name).toBe('Customer Alpha 3');

    // Assert: customers from other shops do not appear
    const otherRes = await request(app)
      .get('/api/customers')
      .set('Authorization', adminToken)
      .query({ search: 'Shop 2' })
      .expect(200);

    const otherCustomers = otherRes.body.customers || otherRes.body;
    expect(otherCustomers.length).toBe(0);
  });

  // TEST 2.7 — Sale with selected customer does not duplicate record
  test('TEST 2.7 — Sale with selected customer does not duplicate record', async () => {
    const existing = await Customer.create({
      id: 777,
      name: 'Loyal Search User',
      email: 'loyal@shop1.com',
      phone: '0733333333',
      totalPurchases: 0,
      shopId: 1,
      active: true
    });

    const initialCustomerCount = await Customer.count();

    const payload = {
      items: [{ productId: product.id, quantity: 1, price: 10.00 }],
      discount: 9.00,
      total: 1.00,
      paymentAmount: 1.00,
      paymentMethod: 'cash',
      customerId: existing.id,
      customer: {
        name: existing.name,
        email: existing.email,
        phone: existing.phone
      }
    };

    await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const finalCustomerCount = await Customer.count();
    expect(finalCustomerCount).toBe(initialCustomerCount);

    const updatedCustomer = await Customer.findByPk(existing.id);
    expect(Number(updatedCustomer.totalPurchases)).toBe(1.00);
  });

  // TEST 2.8 — Sale with new customer creates one record
  test('TEST 2.8 — Sale with new customer creates one record', async () => {
    const initialCustomerCount = await Customer.count();

    const payload = {
      items: [{ productId: product.id, quantity: 1, price: 10.00 }],
      total: 10.00,
      paymentAmount: 10.00,
      paymentMethod: 'cash',
      customerId: null,
      customer: {
        name: 'Brand New Person',
        phone: '0744444444'
      }
    };

    await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const finalCustomerCount = await Customer.count();
    expect(finalCustomerCount).toBe(initialCustomerCount + 1);

    const createdCustomer = await Customer.findOne({ where: { name: 'Brand New Person', shopId: 1 } });
    expect(createdCustomer).toBeDefined();
  });

  // TEST 2.8b — Walk-in sale does not create Customer record
  test('TEST 2.8b — Walk-in sale does not create Customer record', async () => {
    const initialCustomerCount = await Customer.count();

    const payload = {
      items: [{ productId: product.id, quantity: 1, price: 10.00 }],
      total: 10.00,
      paymentAmount: 10.00,
      paymentMethod: 'cash',
      customerId: null,
      customer: {
        name: 'Walk-in Customer'
      }
    };

    await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const finalCustomerCount = await Customer.count();
    expect(finalCustomerCount).toBe(initialCustomerCount);
  });

  // TEST 2.8c — Sale with customerId updates customer record regardless of customer.name
  test('TEST 2.8c — Sale with customerId updates customer record regardless of customer.name', async () => {
    const existing = await Customer.create({
      name: 'Walk-in Customer',
      shopId: 1,
      totalPurchases: 0
    });

    const payload = {
      items: [{ productId: product.id, quantity: 1, price: 10.00 }],
      total: 10.00,
      paymentAmount: 10.00,
      paymentMethod: 'cash',
      customerId: existing.id,
      customer: {
        name: 'Walk-in Customer'
      }
    };

    await request(app)
      .post('/api/sales')
      .set('Authorization', adminToken)
      .send(payload)
      .expect(201);

    const updatedCustomer = await Customer.findByPk(existing.id);
    expect(Number(updatedCustomer.totalPurchases)).toBe(10.00);
  });

  // TEST 2.9 — Employee sales report includes UUID cashier sales
  test('TEST 2.9 — Employee sales report includes UUID cashier sales', async () => {
    // Clear sales first
    await SaleItem.destroy({ where: {} });
    await SalePayment.destroy({ where: {} });
    await Sale.destroy({ where: {} });

    // Seed 3 sales for employee
    for (let i = 1; i <= 3; i++) {
      await Sale.create({
        invoiceNumber: `INV-CASH-${i}-${Date.now()}`,
        total: 10.00,
        paymentAmount: 10.00,
        paymentMethod: 'cash',
        shopId: 1,
        employeeId: '550e8400-e29b-41d4-a716-446655440000',
        userId: null
      });
    }

    const res = await request(app)
      .get('/api/reports/employee-sales')
      .set('Authorization', adminToken)
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    const entry = res.body.find(r => r.performerId === '550e8400-e29b-41d4-a716-446655440000');
    expect(entry).toBeDefined();
    expect(entry.totalSales).toBe(3);
    expect(entry.performerType).toBe('employee');
    expect(entry.performerName).toBe('Cashier UUID');

    const nullEntry = res.body.find(r => r.performerId === null || r.performerId === 'null');
    expect(nullEntry).toBeUndefined();
  });

  // TEST 2.10 — Employee sales report includes integer user sales
  test('TEST 2.10 — Employee sales report includes integer user sales', async () => {
    // Seed 2 sales for user 101
    for (let i = 1; i <= 2; i++) {
      await Sale.create({
        invoiceNumber: `INV-USER-${i}-${Date.now()}`,
        total: 20.00,
        paymentAmount: 20.00,
        paymentMethod: 'cash',
        shopId: 1,
        employeeId: null,
        userId: 101
      });
    }

    const res = await request(app)
      .get('/api/reports/employee-sales')
      .set('Authorization', adminToken)
      .expect(200);

    const entry = res.body.find(r => r.performerId === '101');
    expect(entry).toBeDefined();
    expect(entry.totalSales).toBe(2);
    expect(entry.performerType).toBe('user');
    expect(entry.performerName).toBe('Admin Manager');
  });

  // TEST 2.11 — Date range filter works on employee sales report
  test('TEST 2.11 — Date range filter works on employee sales report', async () => {
    // Clear sales
    await SaleItem.destroy({ where: {} });
    await SalePayment.destroy({ where: {} });
    await Sale.destroy({ where: {} });

    // Seed 3 sales on different dates
    const d1 = new Date('2026-06-10T12:00:00Z');
    const d2 = new Date('2026-06-22T12:00:00Z');
    const d3 = new Date('2026-07-05T12:00:00Z');

    await Sale.create({
      invoiceNumber: `INV-D1-${Date.now()}`,
      total: 10.00,
      paymentAmount: 10.00,
      paymentMethod: 'cash',
      shopId: 1,
      userId: 101,
      createdAt: d1
    });

    await Sale.create({
      invoiceNumber: `INV-D2-${Date.now()}`,
      total: 15.00,
      paymentAmount: 15.00,
      paymentMethod: 'cash',
      shopId: 1,
      userId: 101,
      createdAt: d2
    });

    await Sale.create({
      invoiceNumber: `INV-D3-${Date.now()}`,
      total: 20.00,
      paymentAmount: 20.00,
      paymentMethod: 'cash',
      shopId: 1,
      userId: 101,
      createdAt: d3
    });

    // Request with range covering only D2
    const res = await request(app)
      .get('/api/reports/employee-sales')
      .set('Authorization', adminToken)
      .query({
        startDate: '2026-06-21T00:00:00.000Z',
        endDate: '2026-06-23T23:59:59.000Z'
      })
      .expect(200);

    expect(res.body.length).toBe(1);
    expect(res.body[0].totalSales).toBe(1);
    expect(Number(res.body[0].totalRevenue)).toBe(15.00);
  });
});
