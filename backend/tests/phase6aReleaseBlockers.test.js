'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const {
  User,
  Shop,
  Organization,
  Category,
  Product,
  Inventory,
  StockMovement,
  Sale,
  SaleItem,
  PendingPayment,
  Employee,
  Invoice,
  InvoiceItem,
  Expense
} = require('../src/models');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 6A: Release Blocker Remediation Verification Suite', () => {
  let orgA, orgB;
  let shopA, shopB;
  let userA, userB;
  let employeeA, employeeB;
  let tokenUserA, tokenEmployeeA;
  let tokenUserB, tokenEmployeeB;
  let productA1, productA2, productB1;

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

    shopA = await Shop.create({
      name: `Shop A ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    userA = await User.create({
      name: `User A ${ts}`,
      email: `user-a-${ts}@example.com`,
      password: 'password123',
      role: 'admin',
      shopId: shopA.id,
      active: true
    });

    employeeA = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Cashier',
      lastName: `A ${ts}`,
      email: `employee-a-${ts}@example.com`,
      password: 'password123',
      position: 'cashier',
      role: 'cashier',
      status: 'active',
      shopId: shopA.id
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
      active: true
    });

    userB = await User.create({
      name: `User B ${ts}`,
      email: `user-b-${ts}@example.com`,
      password: 'password123',
      role: 'admin',
      shopId: shopB.id,
      active: true
    });

    employeeB = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Cashier',
      lastName: `B ${ts}`,
      email: `employee-b-${ts}@example.com`,
      password: 'password123',
      position: 'cashier',
      role: 'cashier',
      status: 'active',
      shopId: shopB.id
    });

    tokenUserA = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shopA.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenEmployeeA = tokenFor({
      id: employeeA.id,
      role: 'cashier',
      shopId: shopA.id,
      organizationId: orgA.id,
      isEmployee: true
    });

    tokenUserB = tokenFor({
      id: userB.id,
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id,
      isEmployee: false
    });

    tokenEmployeeB = tokenFor({
      id: employeeB.id,
      role: 'cashier',
      shopId: shopB.id,
      organizationId: orgB.id,
      isEmployee: true
    });

    // Products
    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      barcode: `BC-A1-${ts}`,
      price: 150.00,
      costPrice: 100.00,
      shopId: shopA.id,
      organizationId: orgA.id,
      active: true
    });

    await Inventory.create({
      productId: productA1.id,
      shopId: shopA.id,
      stockQuantity: 100,
      reorderPoint: 10
    });

    productA2 = await Product.create({
      name: `Product A2 ${ts}`,
      sku: `SKU-A2-${ts}`,
      barcode: `BC-A2-${ts}`,
      price: 250.00,
      costPrice: 180.00,
      shopId: shopA.id,
      organizationId: orgA.id,
      active: true
    });

    await Inventory.create({
      productId: productA2.id,
      shopId: shopA.id,
      stockQuantity: 50,
      reorderPoint: 5
    });

    productB1 = await Product.create({
      name: `Product B1 ${ts}`,
      sku: `SKU-B1-${ts}`,
      barcode: `BC-B1-${ts}`,
      price: 300.00,
      costPrice: 200.00,
      shopId: shopB.id,
      organizationId: orgB.id,
      active: true
    });

    await Inventory.create({
      productId: productB1.id,
      shopId: shopB.id,
      stockQuantity: 40,
      reorderPoint: 5
    });
  });

  // =========================================================================
  // 1. BLOCKER 1: PERF-01 / PERF-02 (Bounded Database Aggregates)
  // =========================================================================
  describe('PERF-01 / PERF-02: Bounded Queries and SQL Aggregates', () => {
    test('getSalesStatistics calculates accurate metrics via database aggregates without loading full sales list', async () => {
      // Seed 3 sales for Shop A
      await Sale.create({
        invoiceNumber: `INV-STAT-1-${Date.now()}`,
        total: 300,
        subtotal: 300,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id,
        status: 'completed'
      });
      await Sale.create({
        invoiceNumber: `INV-STAT-2-${Date.now()}`,
        total: 500,
        subtotal: 500,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id,
        status: 'completed'
      });

      const res = await request(app)
        .get('/api/sales/statistics')
        .set('Authorization', tokenUserA);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalSales', 2);
      expect(Number(res.body.totalRevenue)).toBe(800);
      expect(Number(res.body.averageTicket)).toBe(400);
    });

    test('dashboard getStats returns accurate database aggregates without loading sale items', async () => {
      await Sale.create({
        invoiceNumber: `INV-DASH-1-${Date.now()}`,
        total: 1000,
        subtotal: 1000,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id,
        status: 'completed'
      });

      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', tokenUserA);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalIncome', 1000);
      expect(res.body).toHaveProperty('totalTransactions', 1);
      expect(res.body).toHaveProperty('totalSales', 1);
      expect(res.body).toHaveProperty('totalCustomers');
    });
  });

  // =========================================================================
  // 2. BLOCKER 2: SEC-01 (Payment Callback Concurrency & Pessimistic Locking)
  // =========================================================================
  describe('SEC-01: Payment Callback Concurrency & Row Locking', () => {
    test('concurrent identical callbacks result in exactly one sale and one stock decrement', async () => {
      const checkoutRequestId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const callbackToken = `secret_cb_token_${Date.now()}`;
      const itemQty = 3;

      const saleData = {
        items: [{ productId: productA1.id, quantity: itemQty, discount: 0 }],
        paymentMethod: 'mobile',
        paymentAmount: 450,
        total: 450,
        subtotal: 450,
        tax: 0,
        discount: 0,
        userId: userA.id,
        isEmployee: false,
        callbackToken
      };

      await PendingPayment.create({
        checkoutRequestId,
        orderId: `ORDER-${Date.now()}`,
        shopId: shopA.id,
        amount: 450.00,
        status: 'pending',
        paymentChannel: 'mpesa',
        saleData
      });

      const callbackPayload = {
        Body: {
          stkCallback: {
            MerchantRequestID: '12345',
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 450.00 },
                { Name: 'MpesaReceiptNumber', Value: `RC_${Date.now()}` },
                { Name: 'TransactionDate', Value: 20260918090000 },
                { Name: 'PhoneNumber', Value: 254712345678 }
              ]
            }
          }
        }
      };

      // Fire 2 simultaneous identical callbacks
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/mpesa/callback?token=${callbackToken}`)
          .send(callbackPayload),
        request(app)
          .post(`/api/mpesa/callback?token=${callbackToken}`)
          .send(callbackPayload)
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify that exactly one callback processed and one reported already processed
      const messages = [res1.body.message, res2.body.message];
      expect(messages).toContain('Callback processed successfully.');
      expect(messages).toContain('Callback already processed.');

      // Verify database state: exactly ONE sale created
      const sales = await Sale.findAll({ where: { shopId: shopA.id } });
      expect(sales.length).toBe(1);

      // Verify inventory: exactly ONE decrement (100 - 3 = 97)
      const inv = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA.id } });
      expect(Number(inv.stockQuantity)).toBe(97);

      // Verify PendingPayment status finalized to confirmed
      const updatedPending = await PendingPayment.findOne({ where: { checkoutRequestId } });
      expect(updatedPending.status).toBe('confirmed');
    });

    test('callback with invalid token is rejected with 401 and creates no sale', async () => {
      const checkoutRequestId = `ws_CO_${Date.now()}_bad_token`;
      await PendingPayment.create({
        checkoutRequestId,
        orderId: `ORDER-${Date.now()}`,
        shopId: shopA.id,
        amount: 150.00,
        status: 'pending',
        paymentChannel: 'mpesa',
        saleData: {
          items: [{ productId: productA1.id, quantity: 1 }],
          callbackToken: 'correct_token'
        }
      });

      const res = await request(app)
        .post('/api/mpesa/callback?token=WRONG_TOKEN')
        .send({
          Body: {
            stkCallback: {
              CheckoutRequestID: checkoutRequestId,
              ResultCode: 0,
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: 150.00 },
                  { Name: 'MpesaReceiptNumber', Value: 'RC_FAKE' }
                ]
              }
            }
          }
        });

      expect(res.status).toBe(401);

      const sales = await Sale.findAll({ where: { shopId: shopA.id } });
      expect(sales.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. BLOCKER 3: SCHEM-01 (Scoped Unique Invoice Numbers)
  // =========================================================================
  describe('SCHEM-01: Cross-Tenant Invoice Number Independence', () => {
    test('different shops can create sales with identical invoiceNumber without collision', async () => {
      const sharedInvoiceNumber = `INV-CROSS-TENANT-${Date.now()}`;

      // Tenant A creates sale with invoiceNumber
      const saleA = await Sale.create({
        invoiceNumber: sharedInvoiceNumber,
        total: 150,
        subtotal: 150,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id,
        status: 'completed'
      });
      expect(saleA.id).toBeDefined();

      // Tenant B creates sale with the exact same invoiceNumber -> must succeed!
      const saleB = await Sale.create({
        invoiceNumber: sharedInvoiceNumber,
        total: 300,
        subtotal: 300,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopB.id,
        organizationId: orgB.id,
        userId: userB.id,
        status: 'completed'
      });
      expect(saleB.id).toBeDefined();

      // Same shop creating duplicate invoiceNumber -> must be rejected by unique_sales_shop_invoice_number!
      await expect(Sale.create({
        invoiceNumber: sharedInvoiceNumber,
        total: 150,
        subtotal: 150,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id,
        status: 'completed'
      })).rejects.toThrow();
    });
  });

  // =========================================================================
  // 4. BLOCKER 4: AUTH-01 (Session & Token Revocation)
  // =========================================================================
  describe('AUTH-01: Token Revocation, Inactivation, and Suspension', () => {
    test('token revocation via logout rejects subsequent requests immediately', async () => {
      const customJti = `jti_${Date.now()}_logout_test`;
      const token = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shopA.id,
        organizationId: orgA.id,
        isEmployee: false,
        jti: customJti
      });

      // Request before logout -> 200
      const res1 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token);
      expect(res1.status).toBe(200);

      // Call logout
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', token);
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toHaveProperty('message', 'Logged out successfully');

      // Subsequent request with revoked token -> 401
      const res2 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token);
      expect(res2.status).toBe(401);
      expect(res2.body.error).toContain('Token has been revoked');
    });

    test('deactivated employee token is immediately rejected with 401', async () => {
      const token = tokenFor({
        id: employeeA.id,
        role: 'cashier',
        shopId: shopA.id,
        organizationId: orgA.id,
        isEmployee: true
      });

      // Active employee passes
      const res1 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token);
      expect(res1.status).toBe(200);

      // Terminate employee
      await employeeA.update({ status: 'inactive' });
      await tokenRevocationService.setUserStatus(employeeA.id, true, 'inactive');

      // Subsequent request with existing token -> 401
      const res2 = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token);
      expect(res2.status).toBe(401);
      expect(res2.body.error).toContain('Account is deactivated or terminated');
    });

    test('suspended organization blocks operational access for members while allowing billing recovery', async () => {
      // Mark organization A as suspended
      await tokenRevocationService.setOrgStatus(orgA.id, 'suspended');

      // Cashier operational request -> 403
      const res1 = await request(app)
        .get('/api/products')
        .set('Authorization', tokenEmployeeA);
      expect(res1.status).toBe(403);
      expect(res1.body).toHaveProperty('code', 'ORGANIZATION_SUSPENDED');

      // Owner billing access -> permitted for recovery
      const res2 = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', tokenUserA);
      // Billing endpoint should not be blocked by 403 ORGANIZATION_SUSPENDED
      expect(res2.status).not.toBe(403);

      // Clean up org status
      await tokenRevocationService.setOrgStatus(orgA.id, 'active');
    });
  });

  // =========================================================================
  // 5. BLOCKER 5: DATA-01 (Dual Identity in Invoices & Expenses)
  // =========================================================================
  describe('DATA-01: Invoices and Expenses Dual Identity Attribution', () => {
    test('User creates invoice with integer userId and organizationId', async () => {
      // Create sale first
      const sale = await Sale.create({
        invoiceNumber: `INV-SALE-U-${Date.now()}`,
        total: 150,
        subtotal: 150,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id,
        status: 'completed'
      });

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', tokenUserA)
        .send({
          saleId: sale.id,
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(userA.id);
      expect(res.body.employeeId).toBeNull();
      expect(res.body.organizationId).toBe(orgA.id);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.name).toBe(userA.name);
    });

    test('Employee creates invoice with UUID employeeId and organizationId', async () => {
      const sale = await Sale.create({
        invoiceNumber: `INV-SALE-E-${Date.now()}`,
        total: 250,
        subtotal: 250,
        tax: 0,
        discount: 0,
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        employeeId: employeeA.id,
        status: 'completed'
      });

      const res = await request(app)
        .post('/api/invoices')
        .set('Authorization', tokenEmployeeA)
        .send({
          saleId: sale.id,
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(201);
      expect(res.body.employeeId).toBe(employeeA.id);
      expect(res.body.userId).toBeNull();
      expect(res.body.organizationId).toBe(orgA.id);
      expect(res.body.employee).toBeDefined();
      expect(res.body.employee.firstName).toBe('Cashier');
    });

    test('User creates expense with integer userId', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenUserA)
        .send({
          description: 'Office Electricity Bill',
          amount: 4500,
          category: 'utilities',
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(userA.id);
      expect(res.body.employeeId).toBeNull();
      expect(res.body.organizationId).toBe(orgA.id);
      expect(res.body.recordedBy).toBeDefined();
    });

    test('Employee creates expense with UUID employeeId without column truncation', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenEmployeeA)
        .send({
          description: 'Store Cleaning Supplies',
          amount: 1200,
          category: 'maintenance',
          paymentMethod: 'cash'
        });

      expect(res.status).toBe(201);
      expect(res.body.employeeId).toBe(employeeA.id);
      expect(res.body.userId).toBeNull();
      expect(res.body.organizationId).toBe(orgA.id);
      expect(res.body.employee).toBeDefined();
      expect(res.body.employee.firstName).toBe('Cashier');
    });

    test('getAllExpenses lists expenses created by both Users and Employees', async () => {
      // Create user expense
      await Expense.create({
        description: 'User Expense',
        amount: 500,
        category: 'other',
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        userId: userA.id
      });

      // Create employee expense
      await Expense.create({
        description: 'Employee Expense',
        amount: 750,
        category: 'other',
        paymentMethod: 'cash',
        shopId: shopA.id,
        organizationId: orgA.id,
        employeeId: employeeA.id
      });

      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', tokenUserA);

      expect(res.status).toBe(200);
      expect(res.body.expenses.length).toBeGreaterThanOrEqual(2);
      const descriptions = res.body.expenses.map(e => e.description);
      expect(descriptions).toContain('User Expense');
      expect(descriptions).toContain('Employee Expense');
    });
  });
});
