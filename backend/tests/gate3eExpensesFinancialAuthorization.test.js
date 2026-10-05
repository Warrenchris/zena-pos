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
  Expense,
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

describe('Gate 3E: Expenses & Financial Operations Authorization Migration Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerEmployeeA1, managerEmployeeA2, cashierEmployeeA1;
  let ownerUserB;
  let planEnterprise;
  let expenseA1, expenseA2, expenseB1;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Subscription Plan
    [planEnterprise] = await Plan.findOrCreate({
      where: { code: 'enterprise_gate3e' },
      defaults: {
        name: 'Enterprise Gate 3E',
        code: 'enterprise_gate3e',
        price: 9999,
        interval: 'monthly',
        maxUsers: 1000,
        maxShops: 100,
        maxProducts: 10000,
        features: ['all']
      }
    });

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Expenses ${ts}`,
      slug: `org-a-expenses-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Expenses ${ts}`,
      slug: `org-b-expenses-${ts}`,
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
      name: `Shop A1 Expenses ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Expenses ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 Expenses ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 4. Users & Memberships
    // Owner User A (Org A, admin)
    ownerUserA = await User.create({
      name: `Owner A ${ts}`,
      email: `owner.expenses.${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Manager Employee A1 (assigned only to shopA1)
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `mgr.expenses.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 50000,
      position: 'Manager',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const mgrMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Manager Employee A2 (assigned only to shopA2)
    managerEmployeeA2 = await Employee.create({
      firstName: 'Manager',
      lastName: `A2 ${ts}`,
      email: `mgr.expenses.a2.${ts}@example.com`,
      password: 'Password123!',
      salary: 50000,
      position: 'Manager',
      status: 'active',
      shopId: shopA2.id,
      authzVersion: 1
    });

    const mgrMemA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA2.id,
      shopId: shopA2.id,
      role: 'manager'
    });

    // Cashier Employee A1 (assigned only to shopA1)
    cashierEmployeeA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A1 ${ts}`,
      email: `cashier.expenses.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 30000,
      position: 'Cashier',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const cashierMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierMemA1.id,
      shopId: shopA1.id,
      role: 'cashier'
    });

    // Owner User B (Org B, admin)
    ownerUserB = await User.create({
      name: `Owner B ${ts}`,
      email: `owner.expenses.b.${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id,
      active: true,
      authzVersion: 1,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      orgRole: 'owner',
      status: 'active'
    });

    // 5. Seed Initial Expenses
    expenseA1 = await Expense.create({
      description: `Shop A1 Rent ${ts}`,
      amount: 15000.00,
      category: 'rent',
      date: new Date('2026-05-10'),
      paymentMethod: 'bank_transfer',
      reference: 'RENT-A1-001',
      notes: 'Monthly branch rent',
      shopId: shopA1.id,
      organizationId: orgA.id,
      userId: ownerUserA.id
    });

    expenseA2 = await Expense.create({
      description: `Shop A2 Utilities ${ts}`,
      amount: 4500.00,
      category: 'utilities',
      date: new Date('2026-05-15'),
      paymentMethod: 'mobile_money',
      reference: 'UTIL-A2-001',
      notes: 'Water and electricity',
      shopId: shopA2.id,
      organizationId: orgA.id,
      employeeId: managerEmployeeA2.id
    });

    expenseB1 = await Expense.create({
      description: `Shop B1 Cleaning ${ts}`,
      amount: 2000.00,
      category: 'maintenance',
      date: new Date('2026-05-20'),
      paymentMethod: 'cash',
      reference: 'CLEAN-B1-001',
      notes: 'Store maintenance',
      shopId: shopB1.id,
      organizationId: orgB.id,
      userId: ownerUserB.id
    });
  });

  afterAll(async () => {
    try {
      await Expense.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await ShopAccess.destroy({ where: {} });
      await OrganizationMembership.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Employee.destroy({ where: { shopId: [shopA1.id, shopA2.id, shopB1.id] } });
      await User.destroy({ where: { id: [ownerUserA.id, ownerUserB.id] } });
      await Shop.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Subscription.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Organization.destroy({ where: { id: [orgA.id, orgB.id] } });
    } catch (err) {
      // Ignore teardown errors
    }
  });

  // =========================================================================
  // 1. Authentication & Epoch Enforcement
  // =========================================================================
  describe('1. Authentication & Epoch Enforcement', () => {
    it('1.1: rejects requests with missing Authorization header (401)', async () => {
      const res = await request(app).get('/api/expenses');
      expect(res.status).toBe(401);
    });

    it('1.2: rejects token with invalid signature (401)', async () => {
      const validToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });
      const invalidToken = `Bearer ${validToken.slice(0, -10)}badbadbadb`;
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', invalidToken);
      expect(res.status).toBe(401);
    });

    it('1.3: rejects revoked token JTI (401)', async () => {
      const jti = crypto.randomUUID();
      const token = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1,
        jti
      });

      await tokenRevocationService.revokeToken(jti, 3600);
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', token);
      expect(res.status).toBe(401);
    });

    it('1.4: rejects token with stale authzVersion (401 AUTHZ_VERSION_STALE)', async () => {
      const staleToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 0 // Authoritative DB version is >= 1
      });

      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', staleToken);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('1.5: rejects token without shop context on branch endpoints (403 Shop context required)', async () => {
      const noShopToken = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', noShopToken);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/shop context required/i);
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & Anti-Oracle Masking
  // =========================================================================
  describe('2. Multi-Tenant Isolation & Anti-Oracle Masking', () => {
    let tokenOrgB;

    beforeAll(() => {
      tokenOrgB = tokenFor({
        id: ownerUserB.id,
        role: 'admin',
        shopId: shopB1.id,
        organizationId: orgB.id,
        isEmployee: false,
        authzVersion: 1
      });
    });

    it('2.1: Org B admin cannot read Org A expense (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenOrgB);
      expect(res.status).toBe(404);
      expect(res.body.error || res.body.message).toMatch(/not found/i);
    });

    it('2.2: Org B admin cannot update Org A expense (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenOrgB)
        .send({
          description: 'Malicious Update',
          amount: 9999,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(res.status).toBe(404);
    });

    it('2.3: Org B admin cannot delete Org A expense (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenOrgB);
      expect(res.status).toBe(404);
    });

    it('2.4: Org B admin listing only returns Org B expenses (never leaks Org A)', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', tokenOrgB);
      expect(res.status).toBe(200);
      const descriptions = res.body.expenses.map(e => e.description);
      expect(descriptions).toContain(expenseB1.description);
      expect(descriptions).not.toContain(expenseA1.description);
      expect(descriptions).not.toContain(expenseA2.description);
    });

    it('2.5: Org B admin expense statistics only aggregates Org B data', async () => {
      const res = await request(app)
        .get('/api/expenses/statistics')
        .set('Authorization', tokenOrgB);
      expect(res.status).toBe(200);
      // Total expenses should match Org B only (2000.00), not Org A (15000 + 4500)
      expect(parseFloat(res.body.totalExpenses)).toBe(2000.00);
    });

    it('2.6: Forged organizationId in request body is rejected with 403 TENANT_MISMATCH', async () => {
      const tokenOrgA = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenOrgA)
        .send({
          description: 'Cross-tenant injection attempt',
          amount: 500,
          category: 'other',
          paymentMethod: 'cash',
          organizationId: orgB.id
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('TENANT_MISMATCH');
    });
  });

  // =========================================================================
  // 3. Branch Scope Isolation
  // =========================================================================
  describe('3. Branch Scope Isolation', () => {
    let tokenManagerA1, tokenManagerA2;

    beforeAll(() => {
      tokenManagerA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      tokenManagerA2 = tokenFor({
        id: managerEmployeeA2.id,
        role: 'manager',
        shopId: shopA2.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });
    });

    it('3.1: Manager in Shop A1 cannot read Shop A2 expense (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/expenses/${expenseA2.id}`)
        .set('Authorization', tokenManagerA1);
      expect(res.status).toBe(404);
    });

    it('3.2: Manager in Shop A1 cannot update Shop A2 expense (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/expenses/${expenseA2.id}`)
        .set('Authorization', tokenManagerA1)
        .send({
          description: 'Cross-branch modification attempt',
          amount: 1000,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(res.status).toBe(404);
    });

    it('3.3: Manager in Shop A1 cannot delete Shop A2 expense (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/expenses/${expenseA2.id}`)
        .set('Authorization', tokenManagerA1);
      // Fails closed with 403 (or 404 anti-oracle)
      expect([403, 404]).toContain(res.status);
    });

    it('3.4: Manager in Shop A1 cannot create expense in Shop A2 (shopId forced to activeShopId)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenManagerA1)
        .send({
          description: 'Branch parameter tampering test',
          amount: 800,
          category: 'other',
          paymentMethod: 'cash',
          shopId: shopA2.id // Attacker attempts to target Shop A2
        });

      expect(res.status).toBe(201);
      // Server authoritatively bounds to active branch (Shop A1), completely ignoring client-supplied shopId
      expect(res.body.shopId).toBe(shopA1.id);
    });

    it('3.5: Manager in Shop A1 statistics only aggregates Shop A1 expenses, never Shop A2', async () => {
      const res = await request(app)
        .get('/api/expenses/statistics')
        .set('Authorization', tokenManagerA1);
      expect(res.status).toBe(200);
      // Must not include expenseA2 (4500)
      const total = parseFloat(res.body.totalExpenses);
      expect(total).toBeGreaterThanOrEqual(15000);
      // Shop A2 amount of 4500 is NOT present in Shop A1 statistics
      const rentCat = res.body.categoryBreakdown.find(c => c.category === 'rent');
      expect(rentCat).toBeDefined();
      const utilCat = res.body.categoryBreakdown.find(c => c.category === 'utilities');
      expect(utilCat).toBeUndefined(); // Utilities was spent only in Shop A2
    });
  });

  // =========================================================================
  // 4. Financial Visibility & Role Boundaries (Cashier vs Manager vs Admin)
  // =========================================================================
  describe('4. Financial Visibility & Role Boundaries', () => {
    let tokenCashierA1, tokenManagerA1, tokenOwnerA;

    beforeAll(() => {
      tokenCashierA1 = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'cashier',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      tokenManagerA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      tokenOwnerA = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });
    });

    it('4.1: Cashier cannot list expenses via GET /api/expenses (403 PERMISSION_DENIED)', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', tokenCashierA1);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.2: Cashier cannot view expense details via GET /api/expenses/:id (403 PERMISSION_DENIED)', async () => {
      const res = await request(app)
        .get(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenCashierA1);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.3: Cashier cannot create expense via POST /api/expenses (403 PERMISSION_DENIED)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenCashierA1)
        .send({
          description: 'Cashier unauthorized expense',
          amount: 250,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.4: Cashier cannot update expense via PUT /api/expenses/:id (403 PERMISSION_DENIED)', async () => {
      const res = await request(app)
        .put(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenCashierA1)
        .send({
          description: 'Cashier tamper',
          amount: 100,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.5: Cashier cannot delete expense via DELETE /api/expenses/:id (403)', async () => {
      const res = await request(app)
        .delete(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenCashierA1);
      expect(res.status).toBe(403);
    });

    it('4.6: Cashier cannot access expense statistics / financial summary (403 PERMISSION_DENIED)', async () => {
      const res = await request(app)
        .get('/api/expenses/statistics')
        .set('Authorization', tokenCashierA1);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.7: Manager cannot delete expense (requires governance admin: 403 INSUFFICIENT_ROLE)', async () => {
      const res = await request(app)
        .delete(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenManagerA1);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('4.8: Org Admin / Owner can delete expense in authorized branch (200)', async () => {
      // Create a temporary expense to delete
      const tempExpense = await Expense.create({
        description: 'Temporary Expense for Deletion',
        amount: 300.00,
        category: 'other',
        date: new Date(),
        paymentMethod: 'cash',
        shopId: shopA1.id,
        organizationId: orgA.id,
        userId: ownerUserA.id
      });

      const res = await request(app)
        .delete(`/api/expenses/${tempExpense.id}`)
        .set('Authorization', tokenOwnerA);
      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted successfully/i);

      // Verify deletion in database
      const found = await Expense.findByPk(tempExpense.id);
      expect(found).toBeNull();
    });
  });

  // =========================================================================
  // 5. Parameter Manipulation & Identity Attribution
  // =========================================================================
  describe('5. Parameter Manipulation & Identity Attribution', () => {
    let tokenManagerA1;

    beforeAll(() => {
      tokenManagerA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });
    });

    it('5.1: Forged userId in body is ignored and attributed to authenticated session', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenManagerA1)
        .send({
          description: 'User ID Spoofing Attempt',
          amount: 600,
          category: 'maintenance',
          paymentMethod: 'cash',
          userId: 99999 // Attacker tries to attribute to non-existent or other user
        });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBeNull(); // Caller is employee, so userId is null
      expect(res.body.employeeId).toBe(managerEmployeeA1.id);
    });

    it('5.2: Forged employeeId in body is ignored and attributed to authenticated session', async () => {
      const tokenOwnerA = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      const fakeUUID = crypto.randomUUID();
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenOwnerA)
        .send({
          description: 'Employee ID Spoofing Attempt',
          amount: 750,
          category: 'marketing',
          paymentMethod: 'cash',
          employeeId: fakeUUID
        });

      expect(res.status).toBe(201);
      expect(res.body.employeeId).toBeNull(); // Caller is user, so employeeId is null
      expect(res.body.userId).toBe(ownerUserA.id);
    });

    it('5.3: Forged shopId in body is overridden by authoritative activeShopId', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenManagerA1)
        .send({
          description: 'Shop ID Tampering Attempt',
          amount: 400,
          category: 'other',
          paymentMethod: 'cash',
          shopId: 99999
        });

      expect(res.status).toBe(201);
      expect(res.body.shopId).toBe(shopA1.id);
    });

    it('5.4: Non-existent expense ID returns 404 identical to cross-tenant 404 (anti-oracle)', async () => {
      const res = await request(app)
        .get('/api/expenses/999999999')
        .set('Authorization', tokenManagerA1);
      expect(res.status).toBe(404);
      expect(res.body.error || res.body.message).toMatch(/not found/i);
    });

    it('5.5: Tampered role in JWT claim does not bypass database-backed role', async () => {
      const spoofedToken = tokenFor({
        id: cashierEmployeeA1.id,
        role: 'admin', // Spoofed admin claim in token
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', spoofedToken);
      // Canonical authzContext hydrates effectiveRole from DB ('cashier'), rejecting access
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });
  });

  // =========================================================================
  // 6. Financial Aggregations & Query Integrity
  // =========================================================================
  describe('6. Financial Aggregations & Query Integrity', () => {
    let tokenManagerA1;

    beforeAll(() => {
      tokenManagerA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });
    });

    it('6.1: Date range filtering accurately scopes expense statistics', async () => {
      const res = await request(app)
        .get('/api/expenses/statistics?startDate=2026-05-01&endDate=2026-05-12')
        .set('Authorization', tokenManagerA1);
      expect(res.status).toBe(200);
      expect(res.body.dateRange.start).toBe('2026-05-01');
      expect(res.body.dateRange.end).toBe('2026-05-12');
      // expenseA1 date is 2026-05-10 (15000)
      expect(parseFloat(res.body.totalExpenses)).toBeGreaterThanOrEqual(15000);
    });

    it('6.2: Category filtering accurately scopes statistics and listings', async () => {
      const resList = await request(app)
        .get('/api/expenses?category=rent')
        .set('Authorization', tokenManagerA1);
      expect(resList.status).toBe(200);
      expect(resList.body.expenses.every(e => e.category === 'rent')).toBe(true);

      const resStats = await request(app)
        .get('/api/expenses/statistics?category=rent')
        .set('Authorization', tokenManagerA1);
      expect(resStats.status).toBe(200);
      expect(resStats.body.categoryBreakdown.length).toBe(1);
      expect(resStats.body.categoryBreakdown[0].category).toBe('rent');
    });

    it('6.3: Zero-expense branch returns valid empty aggregation without leaking other branch/tenant data', async () => {
      // Create empty temporary shop in Org A
      const emptyShop = await Shop.create({
        name: `Empty Shop Expenses ${Date.now()}`,
        organizationId: orgA.id,
        active: true
      });

      const tokenOwnerEmptyShop = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: emptyShop.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });

      const res = await request(app)
        .get('/api/expenses/statistics')
        .set('Authorization', tokenOwnerEmptyShop);
      expect(res.status).toBe(200);
      expect(parseFloat(res.body.totalExpenses)).toBe(0);
      expect(res.body.categoryBreakdown).toEqual([]);
      expect(res.body.monthlyTrend).toEqual([]);
    });

    it('6.4: Negative amount in expense creation is rejected by validator (400)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenManagerA1)
        .send({
          description: 'Negative expense',
          amount: -50,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(res.status).toBe(400);
    });

    it('6.5: Missing description in expense creation is rejected by validator (400)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenManagerA1)
        .send({
          amount: 500,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 7. Operational Workflows & Dual Identity Attribution
  // =========================================================================
  describe('7. Operational Workflows & Dual Identity Attribution', () => {
    let tokenManagerA1, tokenOwnerA;

    beforeAll(() => {
      tokenManagerA1 = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: true,
        authzVersion: 1
      });

      tokenOwnerA = tokenFor({
        id: ownerUserA.id,
        role: 'admin',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isEmployee: false,
        authzVersion: 1
      });
    });

    it('7.1: User (admin) creates expense and is attributed as recordedBy (userId populated, employeeId null)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenOwnerA)
        .send({
          description: 'Owner recorded office stationery',
          amount: 1250.00,
          category: 'other',
          paymentMethod: 'cash',
          reference: 'OFF-001',
          notes: 'Stationery purchase'
        });

      expect(res.status).toBe(201);
      expect(res.body.userId).toBe(ownerUserA.id);
      expect(res.body.employeeId).toBeNull();
      expect(res.body.recordedBy).toBeDefined();
      expect(res.body.recordedBy.id).toBe(ownerUserA.id);
    });

    it('7.2: Employee (manager) creates expense and is attributed as employee (employeeId populated, userId null)', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenManagerA1)
        .send({
          description: 'Manager recorded breakroom supplies',
          amount: 850.00,
          category: 'other',
          paymentMethod: 'cash',
          reference: 'BRK-001',
          notes: 'Coffee and snacks'
        });

      expect(res.status).toBe(201);
      expect(res.body.employeeId).toBe(managerEmployeeA1.id);
      expect(res.body.userId).toBeNull();
      expect(res.body.employee).toBeDefined();
      expect(res.body.employee.id).toBe(managerEmployeeA1.id);
    });

    it('7.3: Manager updates expense notes and paymentMethod within authorized branch (200)', async () => {
      const res = await request(app)
        .put(`/api/expenses/${expenseA1.id}`)
        .set('Authorization', tokenManagerA1)
        .send({
          description: expenseA1.description,
          amount: expenseA1.amount,
          category: expenseA1.category,
          paymentMethod: 'bank_transfer',
          notes: 'Updated note by branch manager'
        });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('Updated note by branch manager');
    });

    it('7.4: Activity logs are created for expense creation, update, and deletion', async () => {
      const desc = `Tracked Expense ${Date.now()}`;
      // Create
      const resCreate = await request(app)
        .post('/api/expenses')
        .set('Authorization', tokenOwnerA)
        .send({
          description: desc,
          amount: 150.00,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(resCreate.status).toBe(201);
      const createdId = resCreate.body.id;

      // Update
      const resUpdate = await request(app)
        .put(`/api/expenses/${createdId}`)
        .set('Authorization', tokenOwnerA)
        .send({
          description: `${desc} Updated`,
          amount: 180.00,
          category: 'other',
          paymentMethod: 'cash'
        });
      expect(resUpdate.status).toBe(200);

      // Delete
      const resDelete = await request(app)
        .delete(`/api/expenses/${createdId}`)
        .set('Authorization', tokenOwnerA);
      expect(resDelete.status).toBe(200);

      // Verify activity logs in database
      const logs = await ActivityLog.findAll({
        where: {
          entity: 'Expense',
          entityId: createdId
        }
      });
      const actions = logs.map(l => l.action);
      expect(actions).toContain('EXPENSE_CREATED');
      expect(actions).toContain('EXPENSE_UPDATED');
      expect(actions).toContain('EXPENSE_DELETED');
    });
  });
});
