'use strict';

const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  Subscription,
  Plan,
  Customer,
  Product,
  Sale,
  SaleItem,
  HeldCart,
  ActivityLog,
  ShopAccess
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const { purgeExpiredOrganizations } = require('../src/services/accountPurgeScheduler');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return jwt.sign(
    { ...payload, jti: `jti_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Phase 7D: Organization Account Closure & Statutory 30-Day Purge Scheduler', () => {
  let testOrg;
  let testShop;
  let ownerUser;
  let ownerToken;
  let adminUser;
  let adminToken;
  let staffEmployee;
  let testSub;
  let starterPlan;
  let testCustomer;
  let testSale;
  let testProduct;
  let testSaleItem;
  let testHeldCart;

  const OWNER_PASSWORD = 'CorrectPassword123!';

  beforeAll(async () => {
    const ts = Date.now();

    // 1. Organization & Shop
    testOrg = await Organization.create({
      name: `ClosureOrg_${ts}`,
      slug: `closure-org-${ts}`,
      status: 'active'
    });

    testShop = await Shop.create({
      organizationId: testOrg.id,
      name: `ClosureShop_${ts}`,
      active: true
    });

    // 2. Owner User
    const hashedPassword = await bcrypt.hash(OWNER_PASSWORD, 10);
    ownerUser = await User.create({
      name: `Owner User ${ts}`,
      email: `owner_closure_${ts}@example.com`,
      password: hashedPassword,
      role: 'admin',
      shopId: testShop.id,
      active: true,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    ownerToken = generateToken({
      id: ownerUser.id,
      shopId: testShop.id,
      organizationId: testOrg.id,
      role: 'admin',
      orgRole: 'owner'
    });

    // 3. Admin User (non-owner)
    adminUser = await User.create({
      name: `Admin User ${ts}`,
      email: `admin_closure_${ts}@example.com`,
      password: hashedPassword,
      role: 'admin',
      shopId: testShop.id,
      active: true,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: adminUser.id,
      orgRole: 'admin',
      status: 'active'
    });

    adminToken = generateToken({
      id: adminUser.id,
      shopId: testShop.id,
      organizationId: testOrg.id,
      role: 'admin',
      orgRole: 'admin'
    });

    // 4. Employee staff member
    staffEmployee = await Employee.create({
      firstName: 'Jane',
      lastName: 'Cashier',
      email: `staff_closure_${ts}@example.com`,
      phone: '+254711999888',
      position: 'cashier',
      status: 'active',
      password: hashedPassword,
      salary: 25000,
      shopId: testShop.id
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      employeeId: staffEmployee.id,
      orgRole: 'member',
      status: 'active'
    });

    // 5. Subscription
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    if (!starterPlan) {
      starterPlan = await Plan.create({
        code: 'starter',
        name: 'Starter Plan',
        priceMonthly: 1500,
        priceYearly: 15000,
        features: { multi_shop: false, reports: true },
        maxShops: 1
      });
    }

    testSub = await Subscription.create({
      organizationId: testOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false
    });

    // 6. Customer & Sales records (for statutory 5-year retention verification)
    testCustomer = await Customer.create({
      name: `Customer To Anonymize ${ts}`,
      email: `cust_purge_${ts}@example.com`,
      phone: '+254712345678',
      address: '123 Main St, Nairobi',
      organizationId: testOrg.id,
      shopId: testShop.id
    });

    testSale = await Sale.create({
      invoiceNumber: `INV-PURGE-${ts}`,
      subtotal: 3000,
      tax: 480,
      total: 3480,
      paymentAmount: 3480,
      paymentMethod: 'mpesa',
      saleStatus: 'completed',
      shopId: testShop.id,
      customerId: testCustomer.id,
      userId: ownerUser.id
    });

    testProduct = await Product.create({
      name: `Purge Test Product ${ts}`,
      sku: `SKU-PURGE-${ts}`,
      price: 1500,
      cost: 1000,
      organizationId: testOrg.id,
      shopId: testShop.id,
      taxCategory: 'standard',
      active: true
    });

    testSaleItem = await SaleItem.create({
      saleId: testSale.id,
      shopId: testShop.id,
      productId: testProduct.id,
      quantity: 2,
      unitPrice: 1500,
      price: 1500,
      subtotal: 3000,
      taxRate: 16.00,
      taxAmount: 480,
      taxCategory: 'standard'
    });

    // 7. Ephemeral held cart (should be deleted upon purge)
    testHeldCart = await HeldCart.create({
      shopId: testShop.id,
      cashierId: staffEmployee.id,
      label: 'Parked Cart #1',
      cartSnapshot: { items: [{ id: 1, qty: 1 }] },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
  });

  afterAll(async () => {
    if (testHeldCart) await HeldCart.destroy({ where: { id: testHeldCart.id } });
    if (testSaleItem) await SaleItem.destroy({ where: { saleId: testSale?.id } });
    if (testSale) await Sale.destroy({ where: { id: testSale.id } });
    if (testProduct) await Product.destroy({ where: { id: testProduct.id } });
    if (testCustomer) await Customer.destroy({ where: { id: testCustomer.id } });
    if (testSub) await Subscription.destroy({ where: { id: testSub.id } });

    if (testOrg) {
      await ActivityLog.destroy({ where: { shopId: testShop.id } });
      await ShopAccess.destroy({ where: { shopId: testShop.id } });
      await OrganizationMembership.destroy({ where: { organizationId: testOrg.id } });
      await Shop.destroy({ where: { organizationId: testOrg.id } });
      await Organization.destroy({ where: { id: testOrg.id } });
    }

    if (staffEmployee) await Employee.destroy({ where: { id: staffEmployee.id } });
    if (ownerUser) await User.destroy({ where: { id: ownerUser.id } });
    if (adminUser) await User.destroy({ where: { id: adminUser.id } });
  });

  describe('1. Role Authorization & Password Re-verification', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/organizations/close-account')
        .send({ currentPassword: OWNER_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('should reject non-owner (admin) request with 403', async () => {
      const res = await request(app)
        .post('/api/organizations/close-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: OWNER_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only organization owners can close/i);
    });

    it('should reject request missing currentPassword with 401', async () => {
      const res = await request(app)
        .post('/api/organizations/close-account')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({});

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/password confirmation is required/i);
    });

    it('should reject request with incorrect currentPassword with 401', async () => {
      const res = await request(app)
        .post('/api/organizations/close-account')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ currentPassword: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid password/i);
    });
  });

  describe('2. Account Closure Execution & Side-Effects', () => {
    let closureResponse;

    it('should close account with valid owner password and return 30-day purge schedule', async () => {
      const beforeClose = Date.now();
      const res = await request(app)
        .post('/api/organizations/close-account')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ currentPassword: OWNER_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/organization account closed/i);
      expect(res.body.deletedAt).toBeDefined();
      expect(res.body.scheduledPurgeAt).toBeDefined();

      closureResponse = res.body;

      const deletedTime = new Date(res.body.deletedAt).getTime();
      const purgeTime = new Date(res.body.scheduledPurgeAt).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      // Verify scheduled purge is approximately 30 days from deletedAt
      expect(Math.abs(purgeTime - (deletedTime + thirtyDaysMs))).toBeLessThan(5000);
      expect(deletedTime).toBeGreaterThanOrEqual(beforeClose - 2000);
    });

    it('should set deletedAt and scheduledPurgeAt on Organization record while keeping status distinct', async () => {
      const refreshedOrg = await Organization.findByPk(testOrg.id);
      expect(refreshedOrg.deletedAt).not.toBeNull();
      expect(refreshedOrg.scheduledPurgeAt).not.toBeNull();
      // Status column must remain distinct from closure state per requirement
      expect(refreshedOrg.status).toBe('active');
    });

    it('should cancel organization subscription', async () => {
      const refreshedSub = await Subscription.findOne({ where: { organizationId: testOrg.id } });
      expect(refreshedSub.status).toBe('canceled');
      expect(refreshedSub.cancelAtPeriodEnd).toBe(true);
    });

    it('should revoke all existing session tokens for users in the organization', async () => {
      // Check user token cutoff timestamp
      const isRevoked = await tokenRevocationService.isUserTokenRevoked(
        ownerUser.id,
        false,
        Math.floor(Date.now() / 1000) - 10 // Token issued before closure
      );
      expect(isRevoked).toBe(true);
    });

    it('should write an ActivityLog entry recording ORGANIZATION_ACCOUNT_CLOSED', async () => {
      const log = await ActivityLog.findOne({
        where: {
          action: 'ORGANIZATION_ACCOUNT_CLOSED',
          userId: ownerUser.id
        }
      });
      expect(log).not.toBeNull();
      expect(log.details).toContain(testOrg.name);
    });

    it('should reject subsequent close-account attempts on already closed organization with 400', async () => {
      // Create fresh token after cutoff
      const freshToken = generateToken({
        id: ownerUser.id,
        shopId: testShop.id,
        organizationId: testOrg.id,
        role: 'admin',
        orgRole: 'owner',
        iat: Math.floor(Date.now() / 1000) + 10
      });

      const res = await request(app)
        .post('/api/organizations/close-account')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({ currentPassword: OWNER_PASSWORD });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/organization account is already closed/i);
    });
  });

  describe('3. Statutory 30-Day Purge Scheduler (accountPurgeScheduler)', () => {
    it('should NOT purge an organization whose scheduledPurgeAt has not elapsed', async () => {
      // Current scheduledPurgeAt is ~30 days in the future.
      const result = await purgeExpiredOrganizations(new Date()); // as of right now
      expect(result.organizationIds).not.toContain(testOrg.id);

      // Verify customer PII is still intact
      const cust = await Customer.findByPk(testCustomer.id);
      expect(cust.name).not.toBe('Anonymized Customer');
      expect(cust.email).toContain('cust_purge_');
    });

    it('should execute purge when simulated clock advances past scheduledPurgeAt', async () => {
      // Advance clock by 31 days
      const thirtyOneDaysLater = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);

      const result = await purgeExpiredOrganizations(thirtyOneDaysLater);
      expect(result.organizationIds).toContain(testOrg.id);

      // 1. Customer PII must be anonymized
      const anonymizedCust = await Customer.findByPk(testCustomer.id);
      expect(anonymizedCust.name).toBe('Anonymized Customer');
      expect(anonymizedCust.email).toBeNull();
      expect(anonymizedCust.phone).toBeNull();
      expect(anonymizedCust.address).toBeNull();

      // 2. Staff/Employee PII must be anonymized and status inactive
      const anonymizedStaff = await Employee.findByPk(staffEmployee.id);
      expect(anonymizedStaff.firstName).toBe('Anonymized');
      expect(anonymizedStaff.lastName).toBe('Staff');
      expect(anonymizedStaff.email).toMatch(/anonymized_.*@purged\.local/);
      expect(anonymizedStaff.phone).toBeNull();
      expect(anonymizedStaff.status).toBe('inactive');

      // 3. User PII must be anonymized and deactivated
      const anonymizedOwner = await User.findByPk(ownerUser.id);
      expect(anonymizedOwner.name).toBe('Anonymized User');
      expect(anonymizedOwner.email).toMatch(/purged_.*@purged\.local/);
      expect(anonymizedOwner.active).toBe(false);

      // 4. Ephemeral HeldCart must be destroyed
      const heldCartCheck = await HeldCart.findByPk(testHeldCart.id);
      expect(heldCartCheck).toBeNull();

      // 5. STATUTORY RETENTION: Sales and SaleItems must remain completely intact for 5-year tax audit compliance
      const preservedSale = await Sale.findByPk(testSale.id);
      expect(preservedSale).not.toBeNull();
      expect(Number(preservedSale.total)).toBe(3480);
      expect(Number(preservedSale.tax)).toBe(480);
      expect(preservedSale.invoiceNumber).toBe(testSale.invoiceNumber);

      const preservedSaleItem = await SaleItem.findOne({ where: { saleId: testSale.id } });
      expect(preservedSaleItem).not.toBeNull();
      expect(Number(preservedSaleItem.subtotal)).toBe(3000);
      expect(Number(preservedSaleItem.taxAmount)).toBe(480);
    });
  });
});
