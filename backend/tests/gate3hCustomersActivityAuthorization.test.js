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
  Product,
  Customer,
  Sale,
  SaleItem,
  ActivityLog,
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

describe('Gate 3H: Customers & Audit Activity Authorization Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerEmployeeA1, managerEmployeeA2, cashierEmployeeA1, cashierEmployeeA2;
  let delegatedAdminEmployeeA1;
  let ownerUserB, managerEmployeeB1, cashierEmployeeB1;
  let planEnterprise;
  let customerA1, customerA2, customerB1;
  let activityLogA1, activityLogB1;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Subscription Plan
    [planEnterprise] = await Plan.findOrCreate({
      where: { code: 'enterprise_gate3h' },
      defaults: {
        name: 'Enterprise Gate 3H',
        code: 'enterprise_gate3h',
        price: 9999,
        interval: 'monthly',
        maxUsers: 1000,
        maxShops: 100,
        maxProducts: 10000,
        features: { all: true, customers: true, activity: true }
      }
    });
    await planEnterprise.update({
      features: { all: true, customers: true, activity: true }
    });

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Gate3H ${ts}`,
      slug: `org-a-gate3h-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Gate3H ${ts}`,
      slug: `org-b-gate3h-${ts}`,
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
      features: { all: true, customers: true, activity: true }
    });

    await Subscription.create({
      organizationId: orgB.id,
      planId: planEnterprise.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      features: { all: true, customers: true, activity: true }
    });

    // 3. Setup Shops
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

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
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

    // Org A Delegated Admin (employee with orgRole='admin')
    delegatedAdminEmployeeA1 = await Employee.create({
      firstName: 'Delegated',
      lastName: `Admin A1 ${ts}`,
      email: `del.admin.a1.${ts}@example.com`,
      password: 'HashedPassword123!',
      salary: 60000,
      position: 'manager',
      status: 'active',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memDelAdminA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: delegatedAdminEmployeeA1.id,
      orgRole: 'admin',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memDelAdminA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Org A Manager for Shop A1
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `mgr.a1.${ts}@example.com`,
      password: 'ManagerPassword123!',
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
      password: 'ManagerPassword123!',
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
      password: 'CashierPassword123!',
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

    // Org A Cashier for Shop A2
    cashierEmployeeA2 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A2 ${ts}`,
      email: `cashier.a2.${ts}@example.com`,
      password: 'CashierPassword123!',
      salary: 30000,
      position: 'cashier',
      status: 'active',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isActive: true,
      authzVersion: 1
    });

    const memCashierA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: memCashierA2.id,
      shopId: shopA2.id,
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

    // Org B Manager
    managerEmployeeB1 = await Employee.create({
      firstName: 'Manager',
      lastName: `B1 ${ts}`,
      email: `mgr.b1.${ts}@example.com`,
      password: 'ManagerPassword123!',
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

    // Org B Cashier
    cashierEmployeeB1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `B1 ${ts}`,
      email: `cashier.b1.${ts}@example.com`,
      password: 'CashierPassword123!',
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

    // 5. Setup Customers
    customerA1 = await Customer.create({
      name: `Customer Alpha ${ts}`,
      email: `cust.alpha.${ts}@example.com`,
      phone: `0711${Math.floor(100000 + Math.random() * 900000)}`,
      address: 'Shop A1 Main Street',
      loyaltyPoints: 100,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    customerA2 = await Customer.create({
      name: `Customer Beta ${ts}`,
      email: `cust.beta.${ts}@example.com`,
      phone: `0722${Math.floor(100000 + Math.random() * 900000)}`,
      address: 'Shop A2 Mall Way',
      loyaltyPoints: 50,
      active: true,
      shopId: shopA2.id,
      organizationId: orgA.id
    });

    customerB1 = await Customer.create({
      name: `Customer Gamma ${ts}`,
      email: `cust.gamma.${ts}@example.com`,
      phone: `0733${Math.floor(100000 + Math.random() * 900000)}`,
      address: 'Shop B1 Westlands',
      loyaltyPoints: 200,
      active: true,
      shopId: shopB1.id,
      organizationId: orgB.id
    });

    // 6. Setup Activity Logs
    activityLogA1 = await ActivityLog.create({
      action: 'SALE_CREATED',
      details: 'Sale completed in Shop A1',
      userId: ownerUserA.id,
      shopId: shopA1.id
    });

    activityLogB1 = await ActivityLog.create({
      action: 'EXPENSE_RECORDED',
      details: 'Expense recorded in Shop B1',
      userId: ownerUserB.id,
      shopId: shopB1.id
    });
  });

  afterAll(async () => {
    if (redisClient && typeof redisClient.quit === 'function') {
      try { await redisClient.quit(); } catch (e) { /* ignore */ }
    }
  });

  // Helpers to generate tokens
  const tokenOwnerA = () => tokenFor({
    id: ownerUserA.id,
    role: 'admin',
    shopId: shopA1.id,
    authzVersion: 1,
    isEmployee: false
  });

  const tokenDelAdminA1 = () => tokenFor({
    id: delegatedAdminEmployeeA1.id,
    role: 'manager',
    shopId: shopA1.id,
    authzVersion: 1,
    isEmployee: true
  });

  const tokenManagerA1 = () => tokenFor({
    id: managerEmployeeA1.id,
    role: 'manager',
    shopId: shopA1.id,
    authzVersion: 1,
    isEmployee: true
  });

  const tokenManagerA2 = () => tokenFor({
    id: managerEmployeeA2.id,
    role: 'manager',
    shopId: shopA2.id,
    authzVersion: 1,
    isEmployee: true
  });

  const tokenCashierA1 = () => tokenFor({
    id: cashierEmployeeA1.id,
    role: 'cashier',
    shopId: shopA1.id,
    authzVersion: 1,
    isEmployee: true
  });

  const tokenCashierA2 = () => tokenFor({
    id: cashierEmployeeA2.id,
    role: 'cashier',
    shopId: shopA2.id,
    authzVersion: 1,
    isEmployee: true
  });

  const tokenOwnerB = () => tokenFor({
    id: ownerUserB.id,
    role: 'admin',
    shopId: shopB1.id,
    authzVersion: 1,
    isEmployee: false
  });

  const tokenManagerB1 = () => tokenFor({
    id: managerEmployeeB1.id,
    role: 'manager',
    shopId: shopB1.id,
    authzVersion: 1,
    isEmployee: true
  });

  const tokenCashierB1 = () => tokenFor({
    id: cashierEmployeeB1.id,
    role: 'cashier',
    shopId: shopB1.id,
    authzVersion: 1,
    isEmployee: true
  });

  // =========================================================================
  // 1. Authentication & Epoch Invalidation
  // =========================================================================
  describe('1. Authentication & Epoch Invalidation', () => {
    it('1.1: Request missing Authorization header returns 401', async () => {
      const res = await request(app).get('/api/customers');
      expect(res.status).toBe(401);
    });

    it('1.2: Request with malformed / invalid signature token returns 401', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
    });

    it('1.3: Token with stale authzVersion is rejected with 401 AUTHZ_VERSION_STALE', async () => {
      const staleToken = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        authzVersion: 0, // Stale! Authoritative version is 1
        isEmployee: true
      });
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', staleToken);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('1.4: Revoked token JTI via tokenRevocationService returns 401', async () => {
      const jti = crypto.randomUUID();
      const token = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: true,
        jti
      });

      await tokenRevocationService.revokeToken(jti, 3600);

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', token);
      expect(res.status).toBe(401);
    });

    it('1.5: Inactive user account is rejected with 401', async () => {
      const inactiveUser = await User.create({
        name: 'Inactive User',
        email: `inactive.${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopA1.id,
        active: false,
        authzVersion: 1
      });

      const token = tokenFor({
        id: inactiveUser.id,
        role: 'cashier',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', token);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & Anti-Oracle Masking
  // =========================================================================
  describe('2. Multi-Tenant Isolation & Anti-Oracle Masking', () => {
    it('2.1: Org B manager cannot view Org A customer by ID (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenManagerB1());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('2.2: Org B manager cannot update Org A customer (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenManagerB1())
        .send({ name: 'Tampered Customer Name' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('2.3: Org B admin cannot delete Org A customer (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenOwnerB());
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('2.4: Org B manager cannot adjust loyalty points of Org A customer (404 anti-oracle)', async () => {
      const res = await request(app)
        .patch(`/api/customers/${customerA1.id}/loyalty-points`)
        .set('Authorization', tokenManagerB1())
        .send({ points: 50, reason: 'Unauthorized bonus' });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('2.5: Org B manager listing customers receives ONLY Org B customers, never Org A', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', tokenManagerB1());
      expect(res.status).toBe(200);
      expect(res.body.customers).toBeDefined();
      const ids = res.body.customers.map(c => c.id);
      expect(ids).toContain(customerB1.id);
      expect(ids).not.toContain(customerA1.id);
      expect(ids).not.toContain(customerA2.id);
    });

    it('2.6: Org B manager customer statistics aggregates strictly Org B customers', async () => {
      const res = await request(app)
        .get('/api/customers/statistics')
        .set('Authorization', tokenManagerB1());
      expect(res.status).toBe(200);
      expect(res.body.totalCustomers).toBe(1); // Only customerB1
    });

    it('2.7: Org B manager querying activity logs receives strictly Org B activity logs', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', tokenManagerB1());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const logIds = res.body.map(l => l.id);
      expect(logIds).toContain(activityLogB1.id);
      expect(logIds).not.toContain(activityLogA1.id);
    });

    it('2.8: Forged organizationId in query/header cannot bypass tenant boundary', async () => {
      const res = await request(app)
        .get(`/api/customers/${customerA1.id}?organizationId=${orgA.id}`)
        .set('Authorization', tokenManagerB1())
        .set('X-Organization-Id', String(orgA.id));
      expect([403, 404]).toContain(res.status);
    });
  });

  // =========================================================================
  // 3. Branch Scope Isolation & Parameter Tampering Defense
  // =========================================================================
  describe('3. Branch Scope Isolation & Parameter Tampering Defense', () => {
    it('3.1: Manager A1 attempts ?shopId=ShopB1 on activity logs and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/activity?shopId=${shopB1.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
    });

    it('3.2: Manager A1 querying activity logs without shopId parameter sees logs for shopA1', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const logIds = res.body.map(l => l.id);
      expect(logIds).toContain(activityLogA1.id);
      expect(logIds).not.toContain(activityLogB1.id);
    });

    it('3.3: Customer creation body tampering: caller in Org A passing foreign organizationId is rejected with 403 TENANT_MISMATCH', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', tokenManagerA1())
        .send({
          name: `Tamper Cust ${ts}`,
          email: `tamper.${ts}@example.com`,
          phone: `0755${Math.floor(100000 + Math.random() * 900000)}`,
          organizationId: orgB.id, // Forged foreign org!
          shopId: shopB1.id        // Forged foreign shop!
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_MISMATCH');
    });

    it('3.4: Customer statistics with ?shopId=ShopB1 rejected with 403 SHOP_ACCESS_DENIED', async () => {
      const res = await request(app)
        .get(`/api/customers/statistics?shopId=${shopB1.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('3.5: Cashier A1 attempting ?shopId=ShopA2 on customer directory rejected with 403 SHOP_ACCESS_DENIED', async () => {
      const res = await request(app)
        .get(`/api/customers?shopId=${shopA2.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // 4. Role Boundaries & Permission Enforcement
  // =========================================================================
  describe('4. Role Boundaries & Permission Enforcement', () => {
    it('4.1: Cashier A1 is denied DELETE /api/customers/:id with 403 INSUFFICIENT_ROLE', async () => {
      const res = await request(app)
        .delete(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('4.2: Manager A1 is denied DELETE /api/customers/:id with 403 INSUFFICIENT_ROLE (admin/org_admin only)', async () => {
      const res = await request(app)
        .delete(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('4.3: Owner A can delete customer -> 200', async () => {
      const ts = Date.now();
      const tempCust = await Customer.create({
        name: `Temp Delete Cust ${ts}`,
        email: `temp.del.${ts}@example.com`,
        organizationId: orgA.id,
        shopId: shopA1.id
      });

      const res = await request(app)
        .delete(`/api/customers/${tempCust.id}`)
        .set('Authorization', tokenOwnerA());
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });

    it('4.4: Delegated Org Admin A can delete customer -> 200', async () => {
      const ts = Date.now();
      const tempCust = await Customer.create({
        name: `Temp Del Admin Cust ${ts}`,
        email: `temp.deladmin.${ts}@example.com`,
        organizationId: orgA.id,
        shopId: shopA1.id
      });

      const res = await request(app)
        .delete(`/api/customers/${tempCust.id}`)
        .set('Authorization', tokenDelAdminA1());
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });

    it('4.5: Cashier A1 is denied PUT /api/customers/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .put(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenCashierA1())
        .send({ name: 'Cashier Edited Name' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.6: Manager A1 can update customer -> 200', async () => {
      const res = await request(app)
        .put(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenManagerA1())
        .send({ name: 'Manager Updated Alpha Name' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Manager Updated Alpha Name');
    });

    it('4.7: Cashier A1 is denied PATCH /api/customers/:id/loyalty-points with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .patch(`/api/customers/${customerA1.id}/loyalty-points`)
        .set('Authorization', tokenCashierA1())
        .send({ points: 20, reason: 'Cashier manual bonus' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.8: Manager A1 can adjust loyalty points -> 200', async () => {
      const initialPoints = customerA1.loyaltyPoints;
      const res = await request(app)
        .patch(`/api/customers/${customerA1.id}/loyalty-points`)
        .set('Authorization', tokenManagerA1())
        .send({ points: 25, reason: 'Manager anniversary bonus' });
      expect(res.status).toBe(200);
      expect(res.body.loyaltyPoints).toBe(initialPoints + 25);
    });

    it('4.9: Cashier A1 is denied GET /api/customers/statistics with 403 PERMISSION_DENIED or INSUFFICIENT_ROLE', async () => {
      const res = await request(app)
        .get('/api/customers/statistics')
        .set('Authorization', tokenCashierA1());
      expect([403]).toContain(res.status);
    });

    it('4.10: Manager A1 can view customer statistics -> 200', async () => {
      const res = await request(app)
        .get('/api/customers/statistics')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(res.body.totalCustomers).toBeDefined();
      expect(res.body.retentionRate).toBeDefined();
    });

    it('4.11: Cashier A1 is denied GET /api/activity with 403', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', tokenCashierA1());
      expect([403]).toContain(res.status);
    });

    it('4.12: Manager A1 can view activity logs -> 200', async () => {
      const res = await request(app)
        .get('/api/activity')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('4.13: Cashier A1 can register customer at POS checkout (POST /api/customers) -> 201', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', tokenCashierA1())
        .send({
          name: `Walkin POS Customer ${ts}`,
          email: `pos.walkin.${ts}@example.com`,
          phone: `0799${Math.floor(100000 + Math.random() * 900000)}`,
          address: 'Nairobi West'
        });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(`Walkin POS Customer ${ts}`);
    });

    it('4.14: Cashier A1 can view customer directory at POS checkout (GET /api/customers) -> 200', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(200);
      expect(res.body.customers).toBeDefined();
    });

    it('4.15: Cashier A1 can view customer details by ID at POS checkout (GET /api/customers/:id) -> 200', async () => {
      const res = await request(app)
        .get(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(200);
      expect(res.body.customer).toBeDefined();
      expect(res.body.customer.id).toBe(customerA1.id);
    });
  });

  // =========================================================================
  // 5. Customer Multi-Branch Sharing (ISO-03 Invariant)
  // =========================================================================
  describe('5. Customer Multi-Branch Sharing (ISO-03 Invariant)', () => {
    it('5.1: Customer registered in Shop A1 can be viewed by staff in Shop A2 of the same organization -> 200', async () => {
      const res = await request(app)
        .get(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenCashierA2());
      expect(res.status).toBe(200);
      expect(res.body.customer.id).toBe(customerA1.id);
    });

    it('5.2: Order history and total spend aggregated across both shops in the organization', async () => {
      // Create product in Shop A1
      const prodA1 = await Product.create({
        name: `Prod A1 ${Date.now()}`,
        sku: `SKU-A1-${Date.now()}`,
        price: 200,
        cost: 100,
        shopId: shopA1.id,
        organizationId: orgA.id,
        stockQuantity: 50
      });

      // Create product in Shop A2
      const prodA2 = await Product.create({
        name: `Prod A2 ${Date.now()}`,
        sku: `SKU-A2-${Date.now()}`,
        price: 300,
        cost: 150,
        shopId: shopA2.id,
        organizationId: orgA.id,
        stockQuantity: 50
      });

      // Create sale in Shop A1 for customerA1
      const sale1 = await Sale.create({
        invoiceNumber: `INV-A1-${Date.now()}`,
        customerId: customerA1.id,
        shopId: shopA1.id,
        userId: ownerUserA.id,
        subtotal: 200,
        total: 200,
        paymentAmount: 200,
        saleStatus: 'completed'
      });
      await SaleItem.create({
        saleId: sale1.id,
        productId: prodA1.id,
        shopId: shopA1.id,
        quantity: 1,
        price: 200,
        subtotal: 200
      });

      // Create sale in Shop A2 for customerA1
      const sale2 = await Sale.create({
        invoiceNumber: `INV-A2-${Date.now()}`,
        customerId: customerA1.id,
        shopId: shopA2.id,
        userId: ownerUserA.id,
        subtotal: 300,
        total: 300,
        paymentAmount: 300,
        saleStatus: 'completed'
      });
      await SaleItem.create({
        saleId: sale2.id,
        productId: prodA2.id,
        shopId: shopA2.id,
        quantity: 1,
        price: 300,
        subtotal: 300
      });

      // Query from Shop A1
      const resA1 = await request(app)
        .get(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(resA1.status).toBe(200);
      expect(resA1.body.stats.totalSpend).toBeGreaterThanOrEqual(500);
      expect(resA1.body.stats.totalOrders).toBeGreaterThanOrEqual(2);

      // Query from Shop A2
      const resA2 = await request(app)
        .get(`/api/customers/${customerA1.id}`)
        .set('Authorization', tokenCashierA2());
      expect(resA2.status).toBe(200);
      expect(resA2.body.stats.totalSpend).toBeGreaterThanOrEqual(500);
      expect(resA2.body.stats.totalOrders).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 6. Input Validation & Business Logic Bounds
  // =========================================================================
  describe('6. Input Validation & Business Logic Bounds', () => {
    it('6.1: Customer statistics with inverted date range (startDate > endDate) rejected with 400', async () => {
      const res = await request(app)
        .get('/api/customers/statistics?startDate=2026-12-31&endDate=2026-01-01')
        .set('Authorization', tokenManagerA1());
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_DATE_RANGE');
    });

    it('6.2: Adjusting loyalty points resulting in negative points balance rejected with 400', async () => {
      const res = await request(app)
        .patch(`/api/customers/${customerA1.id}/loyalty-points`)
        .set('Authorization', tokenManagerA1())
        .send({ points: -99999, reason: 'Excess deduction' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Insufficient loyalty points');
    });

    it('6.3: Customer creation with duplicate email within same organization rejected with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', tokenManagerA1())
        .send({
          name: 'Duplicate Email Cust',
          email: customerA1.email, // Already used in Org A!
          phone: '0711999888'
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Email already registered');
    });

    it('6.4: Customer creation with duplicate phone within same organization rejected with 400', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', tokenManagerA1())
        .send({
          name: 'Duplicate Phone Cust',
          email: `unique.${Date.now()}@example.com`,
          phone: customerA1.phone // Already used in Org A!
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Phone number already registered');
    });
  });

  // =========================================================================
  // 7. Authorization Lifecycle Mutations
  // =========================================================================
  describe('7. Authorization Lifecycle Mutations', () => {
    it('7.1: Manager role demoted to cashier immediately invalidates active session epoch', async () => {
      const ephemeralMgr = await Employee.create({
        firstName: 'Ephemeral',
        lastName: `Mgr ${Date.now()}`,
        email: `ephem.mgr.${Date.now()}@example.com`,
        password: 'Password123!',
        salary: 45000,
        position: 'manager',
        status: 'active',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isActive: true,
        authzVersion: 1
      });

      const mem = await OrganizationMembership.create({
        organizationId: orgA.id,
        employeeId: ephemeralMgr.id,
        orgRole: 'member',
        status: 'active'
      });

      await ShopAccess.create({
        membershipId: mem.id,
        shopId: shopA1.id,
        role: 'manager'
      });

      const sessionToken = tokenFor({
        id: ephemeralMgr.id,
        role: 'manager',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: true
      });

      // Verify manager access works initially
      const initRes = await request(app)
        .get('/api/customers/statistics')
        .set('Authorization', sessionToken);
      expect(initRes.status).toBe(200);

      // Perform mutation: increment authzVersion
      await ephemeralMgr.update({ authzVersion: 2, position: 'cashier' });

      // Next request with version 1 is immediately rejected
      const postRes = await request(app)
        .get('/api/customers/statistics')
        .set('Authorization', sessionToken);
      expect(postRes.status).toBe(401);
      expect(postRes.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('7.2: Membership suspension rejects requests with 403 MEMBERSHIP_SUSPENDED', async () => {
      const suspendedUser = await User.create({
        name: `Suspended User ${Date.now()}`,
        email: `susp.${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopA1.id,
        active: true,
        authzVersion: 1
      });

      const mem = await OrganizationMembership.create({
        organizationId: orgA.id,
        userId: suspendedUser.id,
        orgRole: 'member',
        status: 'suspended'
      });

      await ShopAccess.create({
        membershipId: mem.id,
        shopId: shopA1.id,
        role: 'cashier'
      });

      const token = tokenFor({
        id: suspendedUser.id,
        role: 'cashier',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: false
      });

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_SUSPENDED');
    });

    it('7.3: Organization subscription suspension rejects non-owner with 403 ORGANIZATION_SUSPENDED', async () => {
      const suspendedOrg = await Organization.create({
        name: `Suspended Org ${Date.now()}`,
        slug: `susp-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      });

      const suspShop = await Shop.create({
        name: `Susp Shop ${Date.now()}`,
        organizationId: suspendedOrg.id,
        active: true
      });

      await Subscription.create({
        organizationId: suspendedOrg.id,
        planId: planEnterprise.id,
        status: 'suspended', // Suspended sub!
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31')
      });

      const emp = await Employee.create({
        firstName: 'Susp',
        lastName: `Staff ${Date.now()}`,
        email: `susp.staff.${Date.now()}@example.com`,
        password: 'Password123!',
        salary: 30000,
        position: 'cashier',
        status: 'active',
        shopId: suspShop.id,
        organizationId: suspendedOrg.id,
        isActive: true,
        authzVersion: 1
      });

      const mem = await OrganizationMembership.create({
        organizationId: suspendedOrg.id,
        employeeId: emp.id,
        orgRole: 'member',
        status: 'active'
      });

      await ShopAccess.create({
        membershipId: mem.id,
        shopId: suspShop.id,
        role: 'cashier'
      });

      const token = tokenFor({
        id: emp.id,
        role: 'cashier',
        shopId: suspShop.id,
        authzVersion: 1,
        isEmployee: true
      });

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    it('7.4: Organization deletion rejects requests with 403 ORGANIZATION_DELETED', async () => {
      const deletedOrg = await Organization.create({
        name: `Deleted Org ${Date.now()}`,
        slug: `del-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      });

      await tokenRevocationService.setOrgStatus(deletedOrg.id, 'deleted');

      const delShop = await Shop.create({
        name: `Del Shop ${Date.now()}`,
        organizationId: deletedOrg.id,
        active: true
      });

      const emp = await Employee.create({
        firstName: 'Del',
        lastName: `Staff ${Date.now()}`,
        email: `del.staff.${Date.now()}@example.com`,
        password: 'Password123!',
        salary: 30000,
        position: 'cashier',
        status: 'active',
        shopId: delShop.id,
        organizationId: deletedOrg.id,
        isActive: true,
        authzVersion: 1
      });

      const mem = await OrganizationMembership.create({
        organizationId: deletedOrg.id,
        employeeId: emp.id,
        orgRole: 'member',
        status: 'active'
      });

      await ShopAccess.create({
        membershipId: mem.id,
        shopId: delShop.id,
        role: 'cashier'
      });

      const token = tokenFor({
        id: emp.id,
        role: 'cashier',
        shopId: delShop.id,
        authzVersion: 1,
        isEmployee: true
      });

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_DELETED');
    });
  });
});
