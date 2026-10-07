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
  Inventory,
  Coupon,
  DiscountRule,
  HeldCart,
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

describe('Gate 3G: Coupons, Discounts & Held Carts Authorization Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerEmployeeA1, managerEmployeeA2, cashierEmployeeA1, cashierEmployeeA2;
  let ownerUserB, managerEmployeeB1, cashierEmployeeB1;
  let planEnterprise;
  let productA1, customerA1;
  let couponA1, discountA1, heldCartA1_Cashier1, heldCartA1_Cashier2;

  const MANAGER_PASSWORD = 'ManagerPassword123!';

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Subscription Plan
    [planEnterprise] = await Plan.findOrCreate({
      where: { code: 'enterprise_gate3g' },
      defaults: {
        name: 'Enterprise Gate 3G',
        code: 'enterprise_gate3g',
        price: 9999,
        interval: 'monthly',
        maxUsers: 1000,
        maxShops: 100,
        maxProducts: 10000,
        features: { all: true, coupons: true, discounts: true, held_carts: true }
      }
    });
    await planEnterprise.update({
      features: { all: true, coupons: true, discounts: true, held_carts: true }
    });

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Gate3G ${ts}`,
      slug: `org-a-gate3g-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Gate3G ${ts}`,
      slug: `org-b-gate3g-${ts}`,
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
      password: MANAGER_PASSWORD,
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
      password: MANAGER_PASSWORD,
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

    // Org A Cashier 1 for Shop A1
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

    // Org A Cashier 2 for Shop A1 (same shop, different owner for held-cart tests)
    cashierEmployeeA2 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A2 ${ts}`,
      email: `cashier.a2.${ts}@example.com`,
      password: 'CashierPassword123!',
      salary: 30000,
      position: 'cashier',
      status: 'active',
      shopId: shopA1.id,
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

    // Org B Manager
    managerEmployeeB1 = await Employee.create({
      firstName: 'Manager',
      lastName: `B1 ${ts}`,
      email: `mgr.b1.${ts}@example.com`,
      password: MANAGER_PASSWORD,
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

    // 5. Setup Domain Entities: Products, Customers, Coupons, Discounts, Held Carts
    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      price: 1000,
      cost: 500,
      shopId: shopA1.id,
      organizationId: orgA.id,
      stockQuantity: 100
    });

    await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 100
    });

    customerA1 = await Customer.create({
      name: 'Customer A1',
      phone: '254711000001',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    // Coupon in Shop A1
    couponA1 = await Coupon.create({
      code: `DISC20_${ts}`,
      title: '20 Percent Off Test Promo',
      discountType: 'percentage',
      discountValue: 20,
      minSpend: 500,
      maxDiscount: 1000,
      usageLimit: 100,
      usedCount: 0,
      isActive: true,
      shopId: shopA1.id
    });

    // Discount rule in Shop A1
    discountA1 = await DiscountRule.create({
      name: `Flash Discount ${ts}`,
      ruleType: 'percentage',
      discountValue: 15,
      scope: 'storewide',
      targetName: 'All Products',
      minAmount: 500,
      isActive: true,
      shopId: shopA1.id
    });

    // Held carts in Shop A1
    const heldAt = new Date();
    const expiresAt = new Date(heldAt.getTime() + 4 * 60 * 60 * 1000);

    heldCartA1_Cashier1 = await HeldCart.create({
      shopId: shopA1.id,
      cashierId: String(cashierEmployeeA1.id),
      label: 'Cashier 1 Cart',
      cartSnapshot: {
        items: [{ productId: productA1.id, name: productA1.name, price: 1000, quantity: 1 }],
        customer: { id: customerA1.id, name: customerA1.name },
        discounts: []
      },
      heldAt,
      expiresAt,
      status: 'held'
    });

    heldCartA1_Cashier2 = await HeldCart.create({
      shopId: shopA1.id,
      cashierId: String(cashierEmployeeA2.id),
      label: 'Cashier 2 Cart',
      cartSnapshot: {
        items: [{ productId: productA1.id, name: productA1.name, price: 1000, quantity: 2 }],
        customer: { id: customerA1.id, name: customerA1.name },
        discounts: []
      },
      heldAt,
      expiresAt,
      status: 'held'
    });
  });

  afterAll(async () => {
    await sequelize.close();
    if (redisClient && redisClient.quit) {
      await redisClient.quit();
    }
  });

  // Token generator helpers
  const tokenOwnerA = () => tokenFor({ id: ownerUserA.id, role: 'admin', shopId: shopA1.id, authzVersion: 1, isEmployee: false });
  const tokenMgrA1 = () => tokenFor({ id: managerEmployeeA1.id, role: 'manager', shopId: shopA1.id, authzVersion: 1, isEmployee: true });
  const tokenMgrA2 = () => tokenFor({ id: managerEmployeeA2.id, role: 'manager', shopId: shopA2.id, authzVersion: 1, isEmployee: true });
  const tokenCashierA1 = () => tokenFor({ id: cashierEmployeeA1.id, role: 'cashier', shopId: shopA1.id, authzVersion: 1, isEmployee: true });
  const tokenCashierA2 = () => tokenFor({ id: cashierEmployeeA2.id, role: 'cashier', shopId: shopA1.id, authzVersion: 1, isEmployee: true });
  const tokenOwnerB = () => tokenFor({ id: ownerUserB.id, role: 'admin', shopId: shopB1.id, authzVersion: 1, isEmployee: false });
  const tokenMgrB1 = () => tokenFor({ id: managerEmployeeB1.id, role: 'manager', shopId: shopB1.id, authzVersion: 1, isEmployee: true });
  const tokenCashierB1 = () => tokenFor({ id: cashierEmployeeB1.id, role: 'cashier', shopId: shopB1.id, authzVersion: 1, isEmployee: true });

  // =========================================================================
  // 1. Authentication & Epoch Invalidation
  // =========================================================================
  describe('1. Authentication & Epoch Invalidation', () => {
    it('1.1: Request missing Authorization header returns 401', async () => {
      const res = await request(app).get('/api/coupons');
      expect(res.status).toBe(401);
    });

    it('1.2: Request with malformed / invalid signature token returns 401', async () => {
      const res = await request(app)
        .get('/api/coupons')
        .set('Authorization', 'Bearer invalid.token.signature');
      expect(res.status).toBe(401);
    });

    it('1.3: Token with stale authzVersion is rejected with 401 AUTHZ_VERSION_STALE', async () => {
      const staleToken = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        authzVersion: 0, // Stale! DB has 1
        isEmployee: true
      });
      const res = await request(app)
        .get('/api/coupons')
        .set('Authorization', staleToken);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('1.4: Revoked token JTI via tokenRevocationService returns 401', async () => {
      const revokedJti = crypto.randomUUID();
      await tokenRevocationService.revokeToken(revokedJti, 3600);
      const revokedToken = tokenFor({
        id: managerEmployeeA1.id,
        role: 'manager',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: true,
        jti: revokedJti
      });
      const res = await request(app)
        .get('/api/coupons')
        .set('Authorization', revokedToken);
      expect(res.status).toBe(401);
    });

    it('1.5: Inactive user account is rejected with 401', async () => {
      const inactiveUser = await User.create({
        name: 'Inactive User',
        email: `inactive.${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopA1.id,
        active: false,
        authzVersion: 1
      });
      const inactiveToken = tokenFor({
        id: inactiveUser.id,
        role: 'admin',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: false
      });
      const res = await request(app)
        .get('/api/coupons')
        .set('Authorization', inactiveToken);
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. Multi-Tenant Isolation & Anti-Oracle Masking
  // =========================================================================
  describe('2. Multi-Tenant Isolation & Anti-Oracle Masking', () => {
    it('2.1: Org B manager cannot view Org A coupon by ID (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenMgrB1());
      expect(res.status).toBe(404);
    });

    it('2.2: Org B manager cannot update Org A coupon (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenMgrB1())
        .send({ title: 'Hacked Title' });
      expect(res.status).toBe(404);
    });

    it('2.3: Org B manager cannot delete Org A coupon (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenMgrB1());
      expect(res.status).toBe(404);
    });

    it('2.4: Org B manager cannot view Org A discount rule by ID (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenMgrB1());
      expect(res.status).toBe(404);
    });

    it('2.5: Org B manager cannot update Org A discount rule (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenMgrB1())
        .send({ name: 'Hacked Discount' });
      expect(res.status).toBe(404);
    });

    it('2.6: Org B manager cannot delete Org A discount rule (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenMgrB1());
      expect(res.status).toBe(404);
    });

    it('2.7: Org B cashier cannot recall Org A held cart (404 anti-oracle)', async () => {
      const res = await request(app)
        .post(`/api/held-carts/${heldCartA1_Cashier1.id}/recall`)
        .set('Authorization', tokenCashierB1());
      expect(res.status).toBe(404);
    });

    it('2.8: Org B cashier cannot delete Org A held cart (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/held-carts/${heldCartA1_Cashier1.id}`)
        .set('Authorization', tokenCashierB1());
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. Branch Scope Isolation & Parameter Tampering Defense
  // =========================================================================
  describe('3. Branch Scope Isolation & Parameter Tampering Defense', () => {
    it('3.1: Manager A2 cannot view Coupon in Shop A1 by ID (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenMgrA2());
      expect(res.status).toBe(404);
    });

    it('3.2: Manager A2 cannot update Coupon in Shop A1 (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenMgrA2())
        .send({ title: 'Tampered Coupon Title' });
      expect(res.status).toBe(404);
    });

    it('3.3: Manager A2 cannot delete Coupon in Shop A1 (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenMgrA2());
      expect(res.status).toBe(404);
    });

    it('3.4: Manager A2 cannot view DiscountRule in Shop A1 by ID (404 anti-oracle)', async () => {
      const res = await request(app)
        .get(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenMgrA2());
      expect(res.status).toBe(404);
    });

    it('3.5: Manager A2 cannot update DiscountRule in Shop A1 (404 anti-oracle)', async () => {
      const res = await request(app)
        .put(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenMgrA2())
        .send({ name: 'Tampered Discount' });
      expect(res.status).toBe(404);
    });

    it('3.6: Manager A2 cannot delete DiscountRule in Shop A1 (404 anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenMgrA2());
      expect(res.status).toBe(404);
    });

    it('3.7: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on coupons list and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/coupons?shopId=${shopA2.id}`)
        .set('Authorization', tokenMgrA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('3.8: Parameter tampering: Manager A1 attempts ?shopId=ShopA2 on discounts list and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/discounts?shopId=${shopA2.id}`)
        .set('Authorization', tokenMgrA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });

    it('3.9: Parameter tampering: Cashier A1 attempts ?shopId=ShopA2 on held carts and is rejected with 403', async () => {
      const res = await request(app)
        .get(`/api/held-carts?shopId=${shopA2.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
    });
  });

  // =========================================================================
  // 4. Role Boundaries & Permission Enforcement
  // =========================================================================
  describe('4. Role Boundaries & Permission Enforcement', () => {
    it('4.1: Cashier A1 is denied POST /api/coupons with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post('/api/coupons')
        .set('Authorization', tokenCashierA1())
        .send({
          code: 'CASHIERPROMO',
          title: 'Cashier Unauthorized Promo',
          discountType: 'percentage',
          discountValue: 10
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.2: Cashier A1 is denied GET /api/coupons with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/coupons')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.3: Cashier A1 is denied GET /api/coupons/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.4: Cashier A1 is denied PUT /api/coupons/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .put(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenCashierA1())
        .send({ title: 'Cashier Updated' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.5: Cashier A1 is denied DELETE /api/coupons/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .delete(`/api/coupons/${couponA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.6: Cashier A1 is denied POST /api/discounts with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .post('/api/discounts')
        .set('Authorization', tokenCashierA1())
        .send({
          name: 'Cashier Discount Rule',
          ruleType: 'percentage',
          discountValue: 10
        });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.7: Cashier A1 is denied GET /api/discounts with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get('/api/discounts')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.8: Cashier A1 is denied GET /api/discounts/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .get(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.9: Cashier A1 is denied PUT /api/discounts/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .put(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenCashierA1())
        .send({ name: 'Cashier Updated Discount' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });

    it('4.10: Cashier A1 is denied DELETE /api/discounts/:id with 403 PERMISSION_DENIED', async () => {
      const res = await request(app)
        .delete(`/api/discounts/${discountA1.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PERMISSION_DENIED');
    });
  });

  // =========================================================================
  // 5. Held Cart Ownership & Branch Manager Override
  // =========================================================================
  describe('5. Held Cart Ownership & Branch Manager Override', () => {
    let createdCartId;

    it('5.1: Cashier A1 can hold a cart (POST /api/held-carts) -> 201', async () => {
      const res = await request(app)
        .post('/api/held-carts')
        .set('Authorization', tokenCashierA1())
        .send({
          label: 'Customer Queue A1',
          items: [{ productId: productA1.id, name: productA1.name, price: 1000, quantity: 1 }],
          customer: { id: customerA1.id, name: customerA1.name }
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('held');
      expect(res.body.cashierId).toBe(String(cashierEmployeeA1.id));
      createdCartId = res.body.id;
    });

    it('5.2: Client-supplied cashierId is ignored; held cart cashierId is authoritatively assigned to caller', async () => {
      const res = await request(app)
        .post('/api/held-carts')
        .set('Authorization', tokenCashierA1())
        .send({
          cashierId: '999999_spoofed_cashier',
          employeeId: 'spoofed_employee',
          label: 'Spoof Attempt Cart',
          items: [{ productId: productA1.id, price: 1000, quantity: 1 }]
        });
      expect(res.status).toBe(201);
      expect(res.body.cashierId).toBe(String(cashierEmployeeA1.id));
    });

    it('5.3: Cashier A1 GET /api/held-carts receives ONLY their own held carts', async () => {
      const res = await request(app)
        .get('/api/held-carts')
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // All returned carts must belong to Cashier A1
      const allMine = res.body.every(cart => String(cart.cashierId) === String(cashierEmployeeA1.id));
      expect(allMine).toBe(true);
      // Must not contain Cashier 2's held cart
      const containsOther = res.body.some(cart => String(cart.id) === String(heldCartA1_Cashier2.id));
      expect(containsOther).toBe(false);
    });

    it('5.4: Cashier A1 can recall their own held cart -> 200', async () => {
      const res = await request(app)
        .post(`/api/held-carts/${createdCartId}/recall`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
    });

    it('5.5: Cashier A1 cannot recall Cashier A2\'s held cart in same shop -> 404 (anti-oracle)', async () => {
      const res = await request(app)
        .post(`/api/held-carts/${heldCartA1_Cashier2.id}/recall`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(404);
    });

    it('5.6: Cashier A1 cannot delete Cashier A2\'s held cart in same shop -> 404 (anti-oracle)', async () => {
      const res = await request(app)
        .delete(`/api/held-carts/${heldCartA1_Cashier2.id}`)
        .set('Authorization', tokenCashierA1());
      expect(res.status).toBe(404);
    });

    it('5.7: Manager A1 has branch-wide override: can recall Cashier A1\'s held cart -> 200', async () => {
      // Re-hold a cart for Cashier 1
      const holdRes = await request(app)
        .post('/api/held-carts')
        .set('Authorization', tokenCashierA1())
        .send({
          label: 'Queue for Manager Recall Test',
          items: [{ productId: productA1.id, price: 1000, quantity: 1 }]
        });
      expect(holdRes.status).toBe(201);
      const cartId = holdRes.body.id;

      // Manager recalls it
      const res = await request(app)
        .post(`/api/held-carts/${cartId}/recall`)
        .set('Authorization', tokenMgrA1());
      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
    });

    it('5.8: Manager A1 has branch-wide override: can delete Cashier A1\'s held cart -> 200', async () => {
      // Hold a cart
      const holdRes = await request(app)
        .post('/api/held-carts')
        .set('Authorization', tokenCashierA1())
        .send({
          label: 'Queue for Manager Delete Test',
          items: [{ productId: productA1.id, price: 1000, quantity: 1 }]
        });
      expect(holdRes.status).toBe(201);
      const cartId = holdRes.body.id;

      // Manager dismisses it
      const res = await request(app)
        .delete(`/api/held-carts/${cartId}`)
        .set('Authorization', tokenMgrA1());
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('dismissed successfully');
    });
  });

  // =========================================================================
  // 6. Coupon Validation & Checkout Application
  // =========================================================================
  describe('6. Coupon Validation & Checkout Application', () => {
    it('6.1: Cashier A1 can validate valid coupon code during checkout -> 200 { valid: true }', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', tokenCashierA1())
        .send({
          code: couponA1.code,
          cartAmount: 1000
        });
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.coupon.computedDiscount).toBe(200); // 20% of 1000
    });

    it('6.2: Cashier A1 validating inactive coupon returns 400 with valid: false', async () => {
      const inactiveCoupon = await Coupon.create({
        code: `INACTIVE_${Date.now()}`,
        title: 'Inactive Coupon',
        discountType: 'percentage',
        discountValue: 10,
        isActive: false,
        shopId: shopA1.id
      });
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', tokenCashierA1())
        .send({
          code: inactiveCoupon.code,
          cartAmount: 1000
        });
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('inactive');
    });

    it('6.3: Cashier A1 validating expired coupon returns 400 with valid: false', async () => {
      const expiredCoupon = await Coupon.create({
        code: `EXPIRED_${Date.now()}`,
        title: 'Expired Coupon',
        discountType: 'percentage',
        discountValue: 10,
        startDate: '2020-01-01',
        endDate: '2020-02-01',
        isActive: true,
        shopId: shopA1.id
      });
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', tokenCashierA1())
        .send({
          code: expiredCoupon.code,
          cartAmount: 1000
        });
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('expired');
    });

    it('6.4: Cashier A1 validating coupon below minSpend returns 400 with valid: false', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', tokenCashierA1())
        .send({
          code: couponA1.code,
          cartAmount: 200 // minSpend is 500
        });
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('Minimum spend');
    });

    it('6.5: Cashier A1 validating non-existent or cross-shop coupon code returns 400', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', tokenCashierA1())
        .send({
          code: 'DOES_NOT_EXIST_CODE',
          cartAmount: 1000
        });
      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Invalid coupon code');
    });
  });

  // =========================================================================
  // 7. Discount Approval Security & Integrity
  // =========================================================================
  describe('7. Discount Approval Security & Integrity', () => {
    it('7.1: Cashier submitting sale with discount below threshold passes without manager approval', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          paymentAmount: 950,
          amountPaid: 950,
          total: 950,
          discount: 50,
          discountType: 'percentage',
          discountValue: 5, // <= 10% threshold
          items: [{ productId: productA1.id, quantity: 1, price: 1000, discount: 0 }]
        });
      expect(res.status).toBe(201);
      expect(res.body.saleStatus || res.body.status).toBe('completed');
    });

    it('7.2: Cashier submitting sale with discount above threshold (> 10%) without approval is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: 150,
          discountType: 'percentage',
          discountValue: 15, // > 10% threshold, requires approval
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('requires manager approval');
    });

    it('7.3: Cashier attempting self-approval (passing own cashier ID) is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: 150,
          discountType: 'percentage',
          discountValue: 15,
          managerApprovalId: cashierEmployeeA1.id, // Self-approval attempt!
          managerPassword: 'CashierPassword123!',
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an active Manager or Admin');
    });

    it('7.4: Cashier attempting approval with wrong password is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: 150,
          discountType: 'percentage',
          discountValue: 15,
          managerApprovalId: managerEmployeeA1.id,
          managerPassword: 'WRONG_PASSWORD_XYZ',
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid password');
    });

    it('7.5: Cashier attempting approval using manager from another shop is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: 150,
          discountType: 'percentage',
          discountValue: 15,
          managerApprovalId: managerEmployeeA2.id, // Manager of Shop A2!
          managerPassword: MANAGER_PASSWORD,
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an active Manager or Admin');
    });

    it('7.6: Cashier attempting approval using manager from another organization is rejected with 403', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: 150,
          discountType: 'percentage',
          discountValue: 15,
          managerApprovalId: managerEmployeeB1.id, // Manager of Org B!
          managerPassword: MANAGER_PASSWORD,
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an active Manager or Admin');
    });

    it('7.7: Legitimate manager credentials authorize discount above threshold -> 201', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          paymentAmount: 850,
          amountPaid: 850,
          total: 850,
          discount: 150,
          discountType: 'percentage',
          discountValue: 15,
          managerApprovalId: managerEmployeeA1.id, // Valid Manager of Shop A1
          managerPassword: MANAGER_PASSWORD,
          items: [{ productId: productA1.id, quantity: 1, price: 1000, discount: 0 }]
        });
      expect(res.status).toBe(201);
      expect(res.body.saleStatus || res.body.status).toBe('completed');
    });

    it('7.8: Negative discount amount / percentage is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: -50,
          discountType: 'percentage',
          discountValue: -5,
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(400);
    });

    it('7.9: Excessive discount percentage (> 100%) is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', tokenCashierA1())
        .send({
          paymentMethod: 'cash',
          amountPaid: 1000,
          discount: 1200,
          discountType: 'percentage',
          discountValue: 120,
          items: [{ productId: productA1.id, quantity: 1, unitPrice: 1000, discount: 0 }]
        });
      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 8. Authorization Lifecycle Mutations
  // =========================================================================
  describe('8. Authorization Lifecycle Mutations', () => {
    it('8.1: Manager role demoted to cashier immediately invalidates active session epoch', async () => {
      // Create ephemeral manager
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

      const activeToken = tokenFor({
        id: ephemeralMgr.id,
        role: 'manager',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: true
      });

      // Valid call before demotion
      const beforeRes = await request(app)
        .get('/api/coupons')
        .set('Authorization', activeToken);
      expect(beforeRes.status).toBe(200);

      // Demote: update position and increment authzVersion
      await ephemeralMgr.update({
        position: 'cashier',
        authzVersion: ephemeralMgr.authzVersion + 1
      });

      // Call with now-stale token must be rejected with 401
      const afterRes = await request(app)
        .get('/api/coupons')
        .set('Authorization', activeToken);
      expect(afterRes.status).toBe(401);
      expect(afterRes.body.code).toBe('AUTHZ_VERSION_STALE');
    });

    it('8.2: Membership suspension rejects requests with 403 MEMBERSHIP_SUSPENDED', async () => {
      const suspendedEmp = await Employee.create({
        firstName: 'Suspended',
        lastName: `Staff ${Date.now()}`,
        email: `susp.${Date.now()}@example.com`,
        password: 'Password123!',
        salary: 30000,
        position: 'cashier',
        status: 'active',
        shopId: shopA1.id,
        organizationId: orgA.id,
        isActive: true,
        authzVersion: 1
      });

      const mem = await OrganizationMembership.create({
        organizationId: orgA.id,
        employeeId: suspendedEmp.id,
        orgRole: 'member',
        status: 'suspended' // SUSPENDED!
      });

      await ShopAccess.create({
        membershipId: mem.id,
        shopId: shopA1.id,
        role: 'cashier'
      });

      const token = tokenFor({
        id: suspendedEmp.id,
        role: 'cashier',
        shopId: shopA1.id,
        authzVersion: 1,
        isEmployee: true
      });

      const res = await request(app)
        .get('/api/held-carts')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('MEMBERSHIP_SUSPENDED');
    });

    it('8.3: Organization subscription suspension rejects non-owner with 403 ORGANIZATION_SUSPENDED', async () => {
      const suspendedOrg = await Organization.create({
        name: `Suspended Org ${Date.now()}`,
        slug: `susp-org-${Date.now()}`,
        status: 'suspended', // SUSPENDED ORG
        currency: 'KES'
      });

      const suspShop = await Shop.create({
        name: `Suspended Shop ${Date.now()}`,
        organizationId: suspendedOrg.id,
        currency: 'KES',
        active: true
      });

      const emp = await Employee.create({
        firstName: 'Staff',
        lastName: `SuspOrg ${Date.now()}`,
        email: `staff.susporg.${Date.now()}@example.com`,
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
        .get('/api/held-carts')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    });

    it('8.4: Organization deletion rejects requests with 403 ORGANIZATION_DELETED', async () => {
      const deletedOrg = await Organization.create({
        name: `Deleted Org ${Date.now()}`,
        slug: `del-org-${Date.now()}`,
        status: 'active',
        currency: 'KES'
      });
      await tokenRevocationService.setOrgStatus(deletedOrg.id, 'deleted');

      const delShop = await Shop.create({
        name: `Deleted Shop ${Date.now()}`,
        organizationId: deletedOrg.id,
        currency: 'KES',
        active: true
      });

      const emp = await Employee.create({
        firstName: 'Staff',
        lastName: `DelOrg ${Date.now()}`,
        email: `staff.delorg.${Date.now()}@example.com`,
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
        .get('/api/held-carts')
        .set('Authorization', token);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_DELETED');
    });
  });

  afterAll(async () => {
    if (redisClient && typeof redisClient.quit === 'function') {
      try { await redisClient.quit(); } catch (e) { /* ignore */ }
    }
  });
});

