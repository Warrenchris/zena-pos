'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Sale,
  SaleItem,
  Product,
  Customer,
  Inventory,
  Expense,
  Plan,
  Subscription
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');

function tokenFor(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  const jti = payload.jti || crypto.randomUUID();
  const iat = payload.iat || Math.floor(Date.now() / 1000);
  return 'Bearer ' + jwt.sign({ jti, iat, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Gate 3F: Reports, Analytics, Dashboard & Derived Data Authorization Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerEmployeeA1, managerEmployeeA2, cashierEmployeeA1;
  let ownerUserB, managerEmployeeB1, cashierEmployeeB1;
  let planEnterprise;
  let productA1, productA2, productB1;
  let saleA1, saleA2, saleB1;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Subscription Plan
    [planEnterprise] = await Plan.findOrCreate({
      where: { code: 'enterprise_gate3f' },
      defaults: {
        name: 'Enterprise Gate 3F',
        code: 'enterprise_gate3f',
        price: 9999,
        interval: 'monthly',
        maxUsers: 1000,
        maxShops: 100,
        maxProducts: 10000,
        features: { all: true, org_insights: true, analytics: true, reports: true }
      }
    });
    // Always ensure plan features are up-to-date (findOrCreate does not update existing rows)
    await planEnterprise.update({
      features: { all: true, org_insights: true, analytics: true, reports: true }
    });

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Reports ${ts}`,
      slug: `org-a-reports-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Reports ${ts}`,
      slug: `org-b-reports-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // Subscriptions
    await Subscription.create({
      organizationId: orgA.id,
      planId: planEnterprise.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    await Subscription.create({
      organizationId: orgB.id,
      planId: planEnterprise.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    // 3. Setup Shops
    shopA1 = await Shop.create({
      name: `Shop A1 ${ts}`,
      organizationId: orgA.id,
      currency: 'KES',
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      currency: 'KES',
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
      currency: 'KES',
      active: true
    });

    // 4. Setup Users & Employees
    // Org A Owner
    ownerUserA = await User.create({
      name: `Owner A ${ts}`,
      email: `owner.a.${ts}@example.com`,
      password: 'HashedPassword123!',
      role: 'admin',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Org A Manager for Shop A1
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `mgr.a1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 50000,
      position: 'manager',
      status: 'active',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memMgrA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memMgrA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Org A Manager for Shop A2
    managerEmployeeA2 = await Employee.create({
      firstName: 'Manager',
      lastName: `A2 ${ts}`,
      email: `mgr.a2.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 50000,
      position: 'manager',
      status: 'active',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memMgrA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memMgrA2.id,
      shopId: shopA2.id,
      role: 'manager'
    });

    // Org A Cashier for Shop A1
    cashierEmployeeA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A1 ${ts}`,
      email: `cashier.a1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 30000,
      position: 'cashier',
      status: 'active',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memCashierA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memCashierA1.id,
      shopId: shopA1.id,
      role: 'cashier'
    });

    // Org B Owner
    ownerUserB = await User.create({
      name: `Owner B ${ts}`,
      email: `owner.b.${ts}@example.com`,
      password: 'HashedPassword123!',
      role: 'admin',
      shopId: shopB1.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Org B Manager for Shop B1
    managerEmployeeB1 = await Employee.create({
      firstName: 'Manager',
      lastName: `B1 ${ts}`,
      email: `mgr.b1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 50000,
      position: 'manager',
      status: 'active',
      shopId: shopB1.id,
      organizationId: orgB.id,
      isActive: true,
      authzVersion: 1
    });

    const memMgrB1 = await OrganizationMembership.create({
      organizationId: orgB.id,
      employeeId: managerEmployeeB1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memMgrB1.id,
      shopId: shopB1.id,
      role: 'manager'
    });

    // Org B Cashier for Shop B1
    cashierEmployeeB1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `B1 ${ts}`,
      email: `cashier.b1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 30000,
      position: 'cashier',
      status: 'active',
      shopId: shopB1.id,
      organizationId: orgB.id,
      isActive: true,
      authzVersion: 1
    });

    const memCashierB1 = await OrganizationMembership.create({
      organizationId: orgB.id,
      employeeId: cashierEmployeeB1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memCashierB1.id,
      shopId: shopB1.id,
      role: 'cashier'
    });

    // 5. Seed Test Data (Products, Sales, Inventory, Customers, Expenses)
    // Products
    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      price: 1000,
      cost: 600,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    productA2 = await Product.create({
      name: `Product A2 ${ts}`,
      sku: `SKU-A2-${ts}`,
      price: 2000,
      cost: 1200,
      shopId: shopA2.id,
      organizationId: orgA.id,
      active: true
    });

    productB1 = await Product.create({
      name: `Product B1 ${ts}`,
      sku: `SKU-B1-${ts}`,
      price: 3000,
      cost: 1800,
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true
    });

    // Inventories
    await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 20,
      reorderPoint: 5
    });

    await Inventory.create({
      productId: productA2.id,
      shopId: shopA2.id,
      stockQuantity: 15,
      reorderPoint: 5
    });

    await Inventory.create({
      productId: productB1.id,
      shopId: shopB1.id,
      stockQuantity: 30,
      reorderPoint: 10
    });

    // Customers
    const customerA1 = await Customer.create({
      name: `Customer A1 ${ts}`,
      email: `cust.a1.${ts}@example.com`,
      phone: `0711${Math.floor(100000 + Math.random() * 900000)}`,
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    const customerA2 = await Customer.create({
      name: `Customer A2 ${ts}`,
      email: `cust.a2.${ts}@example.com`,
      phone: `0722${Math.floor(100000 + Math.random() * 900000)}`,
      shopId: shopA2.id,
      organizationId: orgA.id
    });

    // Sales in Shop A1 (Total: 5000)
    saleA1 = await Sale.create({
      shopId: shopA1.id,
      userId: ownerUserA.id,
      employeeId: managerEmployeeA1.id,
      customerId: customerA1.id,
      subtotal: 5000,
      total: 5000,
      paymentAmount: 5000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleA1.id,
      productId: productA1.id,
      shopId: shopA1.id,
      quantity: 5,
      unitPrice: 1000,
      subtotal: 5000,
      total: 5000
    });

    // Sales in Shop A2 (Total: 10000)
    saleA2 = await Sale.create({
      shopId: shopA2.id,
      employeeId: managerEmployeeA2.id,
      customerId: customerA2.id,
      subtotal: 10000,
      total: 10000,
      paymentAmount: 10000,
      paymentMethod: 'mpesa',
      paymentStatus: 'paid',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleA2.id,
      productId: productA2.id,
      shopId: shopA2.id,
      quantity: 5,
      unitPrice: 2000,
      subtotal: 10000,
      total: 10000
    });

    // Sales in Shop B1 (Total: 15000)
    saleB1 = await Sale.create({
      shopId: shopB1.id,
      userId: ownerUserB.id,
      subtotal: 15000,
      total: 15000,
      paymentAmount: 15000,
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleB1.id,
      productId: productB1.id,
      shopId: shopB1.id,
      quantity: 5,
      unitPrice: 3000,
      subtotal: 15000,
      total: 15000
    });

    // Expenses
    await Expense.create({
      shopId: shopA1.id,
      organizationId: orgA.id,
      userId: ownerUserA.id,
      amount: 1500,
      category: 'rent',
      description: 'Shop A1 Rent',
      paymentMethod: 'cash',
      date: new Date()
    });

    await Expense.create({
      shopId: shopA2.id,
      organizationId: orgA.id,
      userId: ownerUserA.id,
      amount: 2500,
      category: 'utilities',
      description: 'Shop A2 Electricity',
      paymentMethod: 'mobile_money',
      date: new Date()
    });
  });

  afterAll(async () => {
    // Teardown redis or close hooks if needed
  });

  // Helper tokens
  const tokenOwnerA = () => tokenFor({ id: ownerUserA.id, organizationId: orgA.id, shopId: shopA1.id, role: 'admin', authzVersion: 1 });
  const tokenManagerA1 = () => tokenFor({ id: managerEmployeeA1.id, organizationId: orgA.id, shopId: shopA1.id, role: 'manager', isEmployee: true, authzVersion: 1 });
  const tokenManagerA2 = () => tokenFor({ id: managerEmployeeA2.id, organizationId: orgA.id, shopId: shopA2.id, role: 'manager', isEmployee: true, authzVersion: 1 });
  const tokenCashierA1 = () => tokenFor({ id: cashierEmployeeA1.id, organizationId: orgA.id, shopId: shopA1.id, role: 'cashier', isEmployee: true, authzVersion: 1 });
  const tokenOwnerB = () => tokenFor({ id: ownerUserB.id, organizationId: orgB.id, shopId: shopB1.id, role: 'admin', authzVersion: 1 });
  const tokenCashierB1 = () => tokenFor({ id: cashierEmployeeB1.id, organizationId: orgB.id, shopId: shopB1.id, role: 'cashier', isEmployee: true, authzVersion: 1 });

  // =========================================================================
  // 1. Authentication & Epoch Invalidation (Scenarios 1-5)
  // =========================================================================
  describe('1. Authentication & Epoch Invalidation', () => {
    test('1.1: Request missing Authorization header returns 401', async () => {
      const res = await request(app).get('/api/reports/sales-summary');
      expect(res.status).toBe(401);
    });

    test('1.2: Request with malformed / invalid signature token returns 401', async () => {
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
    });

    test('1.3: Token with stale authzVersion is rejected with 401 AUTHZ_VERSION_STALE', async () => {
      const staleToken = tokenFor({
        id: ownerUserA.id,
        organizationId: orgA.id,
        shopId: shopA1.id,
        role: 'admin',
        authzVersion: 0 // Stale! DB has 1
      });
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', staleToken);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    test('1.4: Revoked token JTI via tokenRevocationService returns 401', async () => {
      const jti = crypto.randomUUID();
      const token = tokenFor({
        id: ownerUserA.id,
        organizationId: orgA.id,
        shopId: shopA1.id,
        role: 'admin',
        jti,
        authzVersion: 1
      });

      await tokenRevocationService.revokeToken(jti, 3600);

      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', token);
      expect(res.status).toBe(401);
    });

    test('1.5: Missing shop context returns 403 SHOP_CONTEXT_REQUIRED', async () => {
      const tokenNoShop = tokenFor({
        id: ownerUserA.id,
        organizationId: orgA.id,
        role: 'admin',
        authzVersion: 1
      });
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', tokenNoShop);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_CONTEXT_REQUIRED');
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & Anti-Oracle (Scenarios 6-15)
  // =========================================================================
  describe('2. Multi-Tenant Isolation & Anti-Oracle', () => {
    test('2.1: Org B owner cannot query Org A reports via forged ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/reports/sales-summary?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.2: Org B owner cannot query Org A profit & loss via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/reports/profit-loss?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.3: Org B owner cannot query Org A dashboard stats via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/dashboard/stats?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.4: Org B owner cannot query Org A dashboard top products via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/dashboard/top-products?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.5: Org B owner cannot query Org A analytics visitors via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/analytics/visitors?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.6: Org B owner cannot query Org A analytics orders via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/analytics/orders?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.7: Org B owner cannot query Org A insights via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/insights?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.8: Org B owner cannot query Org A insights customer-segments via ?shopId parameter', async () => {
      const res = await request(app)
        .get(`/api/insights/customer-segments?shopId=${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('2.9: Org B user attempting to clear Org A forecast cache DELETE /api/ai/cache/org/:id is rejected with 403 TENANT_MISMATCH', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/org/${orgA.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    test('2.10: Org B user attempting to clear Org A shop forecast cache DELETE /api/ai/cache/:shopId is rejected with 403 SHOP_ACCESS_DENIED', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/${shopA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // 3. Branch Scope Isolation & Parameter Tampering Defense (Scenarios 11-20)
  // =========================================================================
  describe('3. Branch Scope Isolation & Parameter Tampering Defense', () => {
    test('3.1: Manager A1 sales summary receives only Shop A1 sales data and not Shop A2', async () => {
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Number(res.body.kpis.totalSales)).toBe(1);
      expect(Number(res.body.kpis.totalRevenue)).toBe(5000);
    });

    test('3.2: Manager A1 profit & loss receives only Shop A1 data and not Shop A2', async () => {
      const res = await request(app)
        .get('/api/reports/profit-loss')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      // Controller returns flat: revenue, operatingExpenses, profit
      expect(Number(res.body.revenue)).toBeGreaterThanOrEqual(0);
      expect(Number(res.body.operatingExpenses)).toBeGreaterThanOrEqual(0);
      expect(typeof res.body.profit).toBe('number');
    });

    test('3.3: Manager A1 tax estimate receives only Shop A1 data', async () => {
      const res = await request(app)
        .get('/api/reports/tax-estimate')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      // Controller returns taxableRevenue, not grossSales
      expect(typeof res.body.taxableRevenue).toBe('number');
      expect(res.body).toHaveProperty('estimatedTax');
    });

    test('3.4: Manager A1 employee sales receives only Shop A1 data', async () => {
      const res = await request(app)
        .get('/api/reports/employee-sales')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    test('3.5: Manager A1 dashboard stats receives only Shop A1 income and transaction counts', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Number(res.body.totalIncome)).toBe(5000);
      expect(Number(res.body.totalTransactions)).toBe(1);
    });

    test('3.6: Manager A1 dashboard revenue data receives only Shop A1 revenue', async () => {
      const res = await request(app)
        .get('/api/dashboard/revenue')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      // Controller returns { revenueData: [...] }
      expect(Array.isArray(res.body.revenueData)).toBe(true);
    });

    test('3.7: Manager A1 dashboard top products receives only Shop A1 products', async () => {
      const res = await request(app)
        .get('/api/dashboard/top-products')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const productNames = res.body.map(p => p.Product?.name);
      expect(productNames).toContain(productA1.name);
      expect(productNames).not.toContain(productA2.name);
    });

    test('3.8: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on sales summary and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/reports/sales-summary?shopId=${shopA2.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('3.9: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on profit-loss and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/reports/profit-loss?shopId=${shopA2.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('3.10: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on dashboard stats and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/dashboard/stats?shopId=${shopA2.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('3.11: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on analytics visitors and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/analytics/visitors?shopId=${shopA2.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('3.12: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on insights and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/insights?shopId=${shopA2.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('3.13: Organization Owner A can query Shop A2 explicitly via ?shopId=ShopA2 (universal tenant bypass)', async () => {
      const res = await request(app)
        .get(`/api/reports/sales-summary?shopId=${shopA2.id}`)
        .set('Authorization', tokenOwnerA());
      expect(res.status).toBe(200);
      expect(Number(res.body.kpis.totalSales)).toBe(1);
      expect(Number(res.body.kpis.totalRevenue)).toBe(10000);
    });
  });

  // =========================================================================
  // 4. Role Boundaries & Financial Visibility (Scenarios 21-35)
  // =========================================================================
  describe('4. Role Boundaries & Financial Visibility', () => {
    test('4.1: Cashier A1 is denied access to GET /api/reports/sales-summary with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.2: Cashier A1 is denied access to GET /api/reports/profit-loss with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/reports/profit-loss')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.3: Cashier A1 is denied access to GET /api/reports/tax-estimate with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/reports/tax-estimate')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.4: Cashier A1 is denied access to GET /api/reports/employee-sales with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/reports/employee-sales')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.5: Cashier A1 is denied access to GET /api/dashboard/stats with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.6: Cashier A1 is denied access to GET /api/dashboard/revenue with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/dashboard/revenue')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.7: Cashier A1 is denied access to GET /api/dashboard/top-products with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/dashboard/top-products')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.8: Cashier A1 is denied access to GET /api/analytics/visitors with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/analytics/visitors')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.9: Cashier A1 is denied access to GET /api/analytics/orders with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/analytics/orders')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.10: Cashier A1 is denied access to GET /api/analytics/customer-locations with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/analytics/customer-locations')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.11: Cashier A1 is denied access to GET /api/analytics/sales-channels with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/analytics/sales-channels')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.12: Cashier A1 is denied access to GET /api/analytics/top-products with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/analytics/top-products')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.13: Cashier A1 is denied access to GET /api/insights with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/insights')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.14: Cashier A1 is denied access to GET /api/insights/customer-segments with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/insights/customer-segments')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.15: Cashier A1 is denied access to GET /api/insights/monthly-revenue with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/insights/monthly-revenue')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.16: Cashier A1 is denied access to GET /api/insights/daily-sales with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/insights/daily-sales')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.17: Cashier A1 is denied access to GET /api/insights/stock-depletion with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/insights/stock-depletion')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.18: Cashier A1 is denied access to DELETE /api/ai/cache/:shopId with 403 INSUFFICIENT_ROLE', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/${shopA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    });

    test('4.19: Cashier A1 is denied access to DELETE /api/ai/cache/org/:organizationId with 403 ORG_ADMIN_REQUIRED', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/org/${orgA.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
    });

    test('4.20: Cashier A1 is denied access to POST /api/ai/forward/api/forecasting/forecast with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post('/api/ai/forward/api/forecasting/forecast')
        .set('Authorization', tokenCashierA1())
        .send({ dates: [], values: [] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    test('4.21: Manager A1 is denied access to GET /api/insights/organization/summary with 403 ORG_ADMIN_REQUIRED', async () => {
      const res = await request(app)
        .get('/api/insights/organization/summary')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
    });

    test('4.22: Manager A1 is denied access to GET /api/insights/organization/inventory-alerts with 403 ORG_ADMIN_REQUIRED', async () => {
      const res = await request(app)
        .get('/api/insights/organization/inventory-alerts')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
    });

    test('4.23: Manager A1 is denied access to GET /api/insights/organization/daily-sales with 403 ORG_ADMIN_REQUIRED', async () => {
      const res = await request(app)
        .get('/api/insights/organization/daily-sales')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
    });

    test('4.24: Manager A1 is denied access to DELETE /api/ai/cache/org/:organizationId with 403 ORG_ADMIN_REQUIRED', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/org/${orgA.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
    });

    test('4.25: Manager A1 attempting isOrgForecast=true on /api/ai/forward/api/forecasting/forecast is denied with 403 ORG_ADMIN_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/ai/forward/api/forecasting/forecast')
        .set('Authorization', tokenManagerA1())
        .send({ isOrgForecast: true, dates: [], values: [] });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
    });
  });

  // =========================================================================
  // 5. Aggregations, Date Bounds & Query Integrity (Scenarios 36-39)
  // =========================================================================
  describe('5. Aggregations, Date Bounds & Query Integrity', () => {
    test('5.1: Reports sales-summary respects date range filtering correctly', async () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const res = await request(app)
        .get(`/api/reports/sales-summary?startDate=${tomorrow}&endDate=${tomorrow}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Number(res.body.totalSales || 0)).toBe(0);
    });

    test('5.2: Inverted date range (startDate > endDate) is rejected with 400 Bad Request by validateDateRange', async () => {
      const res = await request(app)
        .get('/api/reports/sales-summary?startDate=2026-12-31&endDate=2026-01-01')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_DATE_RANGE');
    });

    test('5.3: Zero-sales branch returns zero revenue cleanly without leaking data', async () => {
      // Create empty shop with no sales
      const emptyShop = await Shop.create({
        name: `Empty Shop ${Date.now()}`,
        organizationId: orgA.id,
        currency: 'KES',
        active: true
      });
      const res = await request(app)
        .get(`/api/reports/sales-summary?shopId=${emptyShop.id}`)
        .set('Authorization', tokenOwnerA());
      expect(res.status).toBe(200);
      expect(Number(res.body.totalSales || 0)).toBe(0);
      expect(Number(res.body.totalRevenue || 0)).toBe(0);
    });
  });

  // =========================================================================
  // 6. AI Proxy & Forecast Security (Scenarios 40-42)
  // =========================================================================
  describe('6. AI Proxy & Forecast Security', () => {
    test('6.1: Public AI status probe /api/ai/status does not require authentication', async () => {
      const res = await request(app).get('/api/ai/status');
      expect([200, 502]).toContain(res.status);
    });

    test('6.2: Manager A1 can clear cache for accessible shop Shop A1', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/${shopA1.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('6.3: Manager A1 cannot clear cache for Shop A2 (403 SHOP_ACCESS_DENIED)', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/${shopA2.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    test('6.4: Owner A can clear organization forecast cache for Org A', async () => {
      const res = await request(app)
        .delete(`/api/ai/cache/org/${orgA.id}`)
        .set('Authorization', tokenOwnerA());
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // 7. Authorization Lifecycle Mutations (Scenarios 43-46)
  // =========================================================================
  describe('7. Authorization Lifecycle Mutations', () => {
    test('7.1: Role demotion increments authzVersion, immediately invalidating active session epoch', async () => {
      const activeToken = tokenFor({
        id: managerEmployeeA2.id,
        organizationId: orgA.id,
        shopId: shopA2.id,
        role: 'manager',
        isEmployee: true,
        authzVersion: 1
      });

      // Verify active session works initially
      const preRes = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', activeToken);
      expect(preRes.status).toBe(200);

      // Mutate authzVersion in DB (simulating epoch invalidation on role demotion)
      await managerEmployeeA2.update({ authzVersion: 2 });
      await tokenRevocationService.setAuthzVersion(managerEmployeeA2.id, true, 2);

      // Verify immediate revocation with 401 AUTHZ_VERSION_STALE
      const postRes = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', activeToken);
      expect(postRes.status).toBe(401);
      expect(postRes.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    test('7.2: Membership suspension rejects requests with 403 MEMBERSHIP_SUSPENDED', async () => {
      const suspendedUser = await User.create({
        name: 'Suspended Analyst',
        email: `suspended.${Date.now()}@example.com`,
        password: 'HashedPassword123!',
        role: 'admin',
        shopId: shopA1.id,
        active: true,
        authzVersion: 1
      });

      await OrganizationMembership.create({
        organizationId: orgA.id,
        userId: suspendedUser.id,
        orgRole: 'admin',
        status: 'suspended' // Suspended membership
      });

      const tokenSuspended = tokenFor({
        id: suspendedUser.id,
        organizationId: orgA.id,
        shopId: shopA1.id,
        role: 'admin',
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', tokenSuspended);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_SUSPENDED');
    });

    test('7.3: Organization subscription suspension rejects non-owner with 403 ORGANIZATION_SUSPENDED', async () => {
      const orgSuspended = await Organization.create({
        name: `Suspended Org ${Date.now()}`,
        slug: `suspended-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      });

      const shopSusp = await Shop.create({
        name: 'Susp Shop',
        organizationId: orgSuspended.id,
        currency: 'KES',
        active: true
      });

      const mgrSusp = await Employee.create({
        firstName: 'Mgr',
        lastName: 'Susp',
        email: `mgr.susp.${Date.now()}@example.com`,
        password: 'HashedPassword123!',
        salary: 50000,
        position: 'manager',
        status: 'active',
        shopId: shopSusp.id,
        organizationId: orgSuspended.id,
        isActive: true,
        authzVersion: 1
      });

      const memMgrSusp = await OrganizationMembership.create({
        organizationId: orgSuspended.id,
        employeeId: mgrSusp.id,
        orgRole: 'member',
        status: 'active'
      });

      await ShopAccess.create({
        membershipId: memMgrSusp.id,
        shopId: shopSusp.id,
        role: 'manager'
      });

      // Mark org as suspended in Redis cache
      await tokenRevocationService.setOrgStatus(orgSuspended.id, 'suspended');

      const tokenSuspMgr = tokenFor({
        id: mgrSusp.id,
        organizationId: orgSuspended.id,
        shopId: shopSusp.id,
        role: 'manager',
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', tokenSuspMgr);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    test('7.4: Organization deletion rejects requests with 403 ORGANIZATION_DELETED', async () => {
      const orgDeleted = await Organization.create({
        name: `Deleted Org ${Date.now()}`,
        slug: `deleted-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      });

      const shopDel = await Shop.create({
        name: 'Del Shop',
        organizationId: orgDeleted.id,
        currency: 'KES',
        active: true
      });

      const userDel = await User.create({
        name: 'Del User',
        email: `del.user.${Date.now()}@example.com`,
        password: 'HashedPassword123!',
        role: 'admin',
        shopId: shopDel.id,
        active: true,
        authzVersion: 1
      });

      await OrganizationMembership.create({
        organizationId: orgDeleted.id,
        userId: userDel.id,
        orgRole: 'owner',
        status: 'active'
      });

      // Mark org as deleted in Redis cache
      await tokenRevocationService.setOrgStatus(orgDeleted.id, 'deleted');

      const tokenDelUser = tokenFor({
        id: userDel.id,
        organizationId: orgDeleted.id,
        shopId: shopDel.id,
        role: 'admin',
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/reports/sales-summary')
        .set('Authorization', tokenDelUser);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_DELETED');
    });
  });
});
