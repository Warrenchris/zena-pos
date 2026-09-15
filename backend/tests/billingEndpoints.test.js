'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const {
  sequelize,
  Organization,
  Subscription,
  Plan,
  User,
  Shop,
  Employee,
  OrganizationMembership,
  SubscriptionInvoice,
  ActivityLog
} = require('../src/models');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Read-Only Billing Endpoints (GET /plans, /subscription, /invoices)', () => {
  let starterPlan;
  let growthPlan;
  let proPlan;
  let gfPlan;

  let gfOrg;
  let gfShop;
  let gfOwner;
  let gfOwnerToken;
  let gfSub;

  let trialOrg;
  let trialShop1;
  let trialShop2;
  let trialOwner;
  let trialOwnerToken;
  let trialAdmin;
  let trialAdminToken;
  let trialEmployee;
  let trialSub;

  let starterOrg;
  let starterShop;
  let starterOwner;
  let starterOwnerToken;
  let starterSub;

  let invoicesOrg;
  let invoicesOwner;
  let invoicesOwnerToken;
  let invoicesAdmin;
  let invoicesAdminToken;
  let invoicesSub;

  beforeAll(async () => {
    await sequelize.authenticate();

    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });
    proPlan = await Plan.findOne({ where: { code: 'pro' } });
    gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });

    const ts = Date.now();

    // 1. Setup Grandfathered Org
    gfOrg = await Organization.create({
      name: `GF Test Org ${ts}`,
      slug: `gf-org-${ts}`,
      status: 'active'
    });
    gfShop = await Shop.create({
      name: `GF Test Shop ${ts}`,
      organizationId: gfOrg.id,
      active: true
    });
    gfOwner = await User.create({
      name: 'GF Owner',
      email: `gf-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: gfShop.id
    });
    await OrganizationMembership.create({
      organizationId: gfOrg.id,
      userId: gfOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    gfSub = await Subscription.create({
      organizationId: gfOrg.id,
      planId: gfPlan.id,
      status: 'active',
      billingCycle: 'yearly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });
    gfOwnerToken = generateToken({
      id: gfOwner.id,
      email: gfOwner.email,
      role: 'admin',
      shopId: gfShop.id,
      organizationId: gfOrg.id
    });

    // 2. Setup Trialing Org with 2 shops and 1 employee
    trialOrg = await Organization.create({
      name: `Trial Test Org ${ts}`,
      slug: `trial-org-${ts}`,
      status: 'active'
    });
    trialShop1 = await Shop.create({
      name: `Trial Shop 1 ${ts}`,
      organizationId: trialOrg.id,
      active: true
    });
    trialShop2 = await Shop.create({
      name: `Trial Shop 2 ${ts}`,
      organizationId: trialOrg.id,
      active: true
    });
    trialOwner = await User.create({
      name: 'Trial Owner',
      email: `trial-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: trialShop1.id
    });
    await OrganizationMembership.create({
      organizationId: trialOrg.id,
      userId: trialOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    trialAdmin = await User.create({
      name: 'Trial Admin',
      email: `trial-admin-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: trialShop1.id
    });
    await OrganizationMembership.create({
      organizationId: trialOrg.id,
      userId: trialAdmin.id,
      orgRole: 'admin',
      status: 'active'
    });
    trialEmployee = await Employee.create({
      firstName: 'Jane',
      lastName: 'Doe',
      email: `trial-emp-${ts}@test.com`,
      shopId: trialShop2.id,
      position: 'Cashier',
      password: 'password123',
      salary: 25000,
      status: 'active'
    });

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    trialSub = await Subscription.create({
      organizationId: trialOrg.id,
      planId: growthPlan.id,
      status: 'trialing',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: trialEnds,
      trialEndsAt: trialEnds,
      cancelAtPeriodEnd: false
    });
    trialOwnerToken = generateToken({
      id: trialOwner.id,
      email: trialOwner.email,
      role: 'admin',
      shopId: trialShop1.id,
      organizationId: trialOrg.id
    });
    trialAdminToken = generateToken({
      id: trialAdmin.id,
      email: trialAdmin.email,
      role: 'admin',
      shopId: trialShop1.id,
      organizationId: trialOrg.id
    });

    // 3. Setup Starter Tier Org at 1 shop quota
    starterOrg = await Organization.create({
      name: `Starter Test Org ${ts}`,
      slug: `starter-org-${ts}`,
      status: 'active'
    });
    starterShop = await Shop.create({
      name: `Starter Shop ${ts}`,
      organizationId: starterOrg.id,
      active: true
    });
    starterOwner = await User.create({
      name: 'Starter Owner',
      email: `starter-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: starterShop.id
    });
    await OrganizationMembership.create({
      organizationId: starterOrg.id,
      userId: starterOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    starterSub = await Subscription.create({
      organizationId: starterOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      trialEndsAt: null,
      cancelAtPeriodEnd: false
    });
    starterOwnerToken = generateToken({
      id: starterOwner.id,
      email: starterOwner.email,
      role: 'admin',
      shopId: starterShop.id,
      organizationId: starterOrg.id
    });

    // 4. Setup Invoices Org with 3 invoices
    invoicesOrg = await Organization.create({
      name: `Invoices Org ${ts}`,
      slug: `inv-org-${ts}`,
      status: 'active'
    });
    const invShop = await Shop.create({
      name: `Invoices Shop ${ts}`,
      organizationId: invoicesOrg.id,
      active: true
    });
    invoicesOwner = await User.create({
      name: 'Invoices Owner',
      email: `inv-owner-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: invShop.id
    });
    await OrganizationMembership.create({
      organizationId: invoicesOrg.id,
      userId: invoicesOwner.id,
      orgRole: 'owner',
      status: 'active'
    });
    invoicesAdmin = await User.create({
      name: 'Invoices Admin Non-Owner',
      email: `inv-admin-${ts}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: invShop.id
    });
    await OrganizationMembership.create({
      organizationId: invoicesOrg.id,
      userId: invoicesAdmin.id,
      orgRole: 'admin',
      status: 'active'
    });
    invoicesSub = await Subscription.create({
      organizationId: invoicesOrg.id,
      planId: growthPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    invoicesOwnerToken = generateToken({
      id: invoicesOwner.id,
      email: invoicesOwner.email,
      role: 'admin',
      shopId: invShop.id,
      organizationId: invoicesOrg.id
    });
    invoicesAdminToken = generateToken({
      id: invoicesAdmin.id,
      email: invoicesAdmin.email,
      role: 'admin',
      shopId: invShop.id,
      organizationId: invoicesOrg.id
    });

    // Create 3 invoices with distinct createdAt timestamps
    await SubscriptionInvoice.create({
      invoiceNumber: `SUB-INV-TEST-001-${ts}`,
      organizationId: invoicesOrg.id,
      subscriptionId: invoicesSub.id,
      planId: growthPlan.id,
      amount: 4500.00,
      currency: 'KES',
      paymentChannel: 'mpesa',
      status: 'paid',
      paidAt: new Date(Date.now() - 60 * 24 * 3600 * 1000),
      createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000)
    });
    await SubscriptionInvoice.create({
      invoiceNumber: `SUB-INV-TEST-002-${ts}`,
      organizationId: invoicesOrg.id,
      subscriptionId: invoicesSub.id,
      planId: growthPlan.id,
      amount: 4500.00,
      currency: 'KES',
      paymentChannel: 'card',
      status: 'paid',
      paidAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
      createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000)
    });
    await SubscriptionInvoice.create({
      invoiceNumber: `SUB-INV-TEST-003-${ts}`,
      organizationId: invoicesOrg.id,
      subscriptionId: invoicesSub.id,
      planId: growthPlan.id,
      amount: 4500.00,
      currency: 'KES',
      paymentChannel: 'mpesa',
      status: 'pending',
      paidAt: null,
      createdAt: new Date()
    });
  });

  afterAll(async () => {
    // Cleanup created test records defensively
    const orgIds = [gfOrg?.id, trialOrg?.id, starterOrg?.id, invoicesOrg?.id].filter(Boolean);
    const userIds = [
      gfOwner?.id,
      trialOwner?.id,
      trialAdmin?.id,
      starterOwner?.id,
      invoicesOwner?.id,
      invoicesAdmin?.id
    ].filter(Boolean);

    if (invoicesOrg?.id) {
      await SubscriptionInvoice.destroy({ where: { organizationId: invoicesOrg.id } });
    }
    if (orgIds.length > 0) {
      await Subscription.destroy({ where: { organizationId: orgIds } });
    }
    if (trialEmployee?.id) {
      await Employee.destroy({ where: { id: trialEmployee.id } });
    }
    if (orgIds.length > 0) {
      await OrganizationMembership.destroy({ where: { organizationId: orgIds } });
      await Shop.destroy({ where: { organizationId: orgIds } });
    }
    if (userIds.length > 0) {
      await User.destroy({ where: { id: userIds } });
    }
    if (orgIds.length > 0) {
      await Organization.destroy({ where: { id: orgIds } });
    }
  });

  // -------------------------------------------------------------------------
  // ENDPOINT 1: GET /api/billing/plans
  // -------------------------------------------------------------------------
  describe('GET /api/billing/plans', () => {
    test('returns exactly the 3 active public tiers (Starter, Growth, Pro) and excludes grandfathered', async () => {
      const res = await request(app)
        .get('/api/billing/plans')
        .expect(200);

      expect(res.body).toHaveProperty('plans');
      expect(Array.isArray(res.body.plans)).toBe(true);
      expect(res.body.plans.length).toBe(3);

      const codes = res.body.plans.map(p => p.code);
      expect(codes).toContain('starter');
      expect(codes).toContain('growth');
      expect(codes).toContain('pro');
      expect(codes).not.toContain('grandfathered');

      // Validate required attributes
      const starter = res.body.plans.find(p => p.code === 'starter');
      expect(starter).toHaveProperty('id');
      expect(starter).toHaveProperty('name', 'Starter');
      expect(starter).toHaveProperty('priceMonthly');
      expect(starter).toHaveProperty('currency', 'KES');
      expect(starter).toHaveProperty('maxShops', 1);
      expect(starter).toHaveProperty('maxUsers', 2);
      expect(starter).toHaveProperty('features');
      expect(starter.features).toHaveProperty('multi_shop', false);
    });

    test('is publicly accessible without auth token', async () => {
      const res = await request(app)
        .get('/api/billing/plans')
        .expect(200);

      expect(res.body.plans).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // ENDPOINT 2: GET /api/billing/subscription
  // -------------------------------------------------------------------------
  describe('GET /api/billing/subscription', () => {
    test('requires authentication', async () => {
      await request(app)
        .get('/api/billing/subscription')
        .expect(401);
    });

    test('for a grandfathered org: represents unlimited quotas clearly, daysRemainingInTrial is null', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', gfOwnerToken)
        .expect(200);

      expect(res.body).toHaveProperty('subscription');
      expect(res.body).toHaveProperty('quotas');

      const { subscription, quotas } = res.body;

      // Status and period
      expect(subscription.status).toBe('active');
      expect(subscription.daysRemainingInTrial).toBeNull();
      expect(new Date(subscription.currentPeriodEnd).getFullYear()).toBe(2099);

      // Plan details
      expect(subscription.plan.code).toBe('grandfathered');
      expect(subscription.plan.isUnlimited).toBe(true);

      // Quotas representation
      expect(quotas.shops.isUnlimited).toBe(true);
      expect(quotas.shops.limit).toBe(-1);
      expect(quotas.shops.current).toBe(1);

      expect(quotas.users.isUnlimited).toBe(true);
      expect(quotas.users.limit).toBe(-1);
      expect(quotas.users.current).toBe(1); // 1 owner member
    });

    test('for a trialing org: computes daysRemainingInTrial and reflects accurate real shop and user counts', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', trialOwnerToken)
        .expect(200);

      const { subscription, quotas } = res.body;

      expect(subscription.status).toBe('trialing');
      expect(typeof subscription.daysRemainingInTrial).toBe('number');
      expect(subscription.daysRemainingInTrial).toBeGreaterThanOrEqual(13);
      expect(subscription.daysRemainingInTrial).toBeLessThanOrEqual(15);

      expect(subscription.plan.code).toBe('growth');
      expect(subscription.plan.maxShops).toBe(3);
      expect(subscription.plan.maxUsers).toBe(10);
      expect(subscription.plan.isUnlimited).toBe(false);

      // Quota usage: 2 real shops created, 3 real members (trialOwner + trialAdmin + trialEmployee)
      expect(quotas.shops.current).toBe(2);
      expect(quotas.shops.limit).toBe(3);
      expect(quotas.shops.isUnlimited).toBe(false);

      expect(quotas.users.current).toBe(3);
      expect(quotas.users.limit).toBe(10);
      expect(quotas.users.isUnlimited).toBe(false);
    });

    test('for a starter-tier org at quota: accurately returns 1/1 shops used', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', starterOwnerToken)
        .expect(200);

      const { subscription, quotas } = res.body;

      expect(subscription.status).toBe('active');
      expect(subscription.daysRemainingInTrial).toBeNull();
      expect(subscription.plan.code).toBe('starter');
      expect(subscription.plan.maxShops).toBe(1);

      // 1 shop active out of 1 max
      expect(quotas.shops.current).toBe(1);
      expect(quotas.shops.limit).toBe(1);
      expect(quotas.shops.isUnlimited).toBe(false);
    });

    test('allows non-owner active organization members (e.g. admin) to view subscription (read-only)', async () => {
      const res = await request(app)
        .get('/api/billing/subscription')
        .set('Authorization', trialAdminToken)
        .expect(200);

      expect(res.body.subscription.status).toBe('trialing');
      expect(res.body.subscription.plan.code).toBe('growth');
    });
  });

  // -------------------------------------------------------------------------
  // ENDPOINT 3: GET /api/billing/invoices
  // -------------------------------------------------------------------------
  describe('GET /api/billing/invoices', () => {
    test('requires authentication', async () => {
      await request(app)
        .get('/api/billing/invoices')
        .expect(401);
    });

    test('rejects non-owners with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', invoicesAdminToken)
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    test('returns paginated invoices ordered most recent first for organization owner', async () => {
      // Page 1, limit 2
      const res1 = await request(app)
        .get('/api/billing/invoices?page=1&limit=2')
        .set('Authorization', invoicesOwnerToken)
        .expect(200);

      expect(res1.body).toHaveProperty('invoices');
      expect(res1.body).toHaveProperty('total', 3);
      expect(res1.body).toHaveProperty('totalPages', 2);
      expect(res1.body).toHaveProperty('currentPage', 1);
      expect(res1.body.invoices.length).toBe(2);

      // Most recent first: invoice 3 was created today, invoice 2 30 days ago
      expect(res1.body.invoices[0].invoiceNumber).toContain('SUB-INV-TEST-003');
      expect(res1.body.invoices[1].invoiceNumber).toContain('SUB-INV-TEST-002');

      // Verify invoice attributes
      const firstInv = res1.body.invoices[0];
      expect(firstInv).toHaveProperty('id');
      expect(firstInv).toHaveProperty('invoiceNumber');
      expect(firstInv).toHaveProperty('amount');
      expect(firstInv).toHaveProperty('currency', 'KES');
      expect(firstInv).toHaveProperty('status', 'pending');
      expect(firstInv).toHaveProperty('paymentChannel', 'mpesa');
      expect(firstInv).toHaveProperty('createdAt');

      // Page 2, limit 2
      const res2 = await request(app)
        .get('/api/billing/invoices?page=2&limit=2')
        .set('Authorization', invoicesOwnerToken)
        .expect(200);

      expect(res2.body.invoices.length).toBe(1);
      expect(res2.body.invoices[0].invoiceNumber).toContain('SUB-INV-TEST-001');
      expect(res2.body.currentPage).toBe(2);
    });
  });
});
