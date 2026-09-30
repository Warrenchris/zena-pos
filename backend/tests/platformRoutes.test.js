'use strict';

const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const {
  User,
  Organization,
  Shop,
  Subscription,
  Plan,
  OrganizationMembership,
  SubscriptionInvoice,
  BillingNotificationLog
} = require('../src/models');
const { clearVerifiedCache } = require('../src/middleware/requirePlatformSuperAdmin');

function generateToken(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Phase 7B Step 3: Platform Operator Read-Only Routes Suite', () => {
  let superAdminUser;
  let superAdminToken;
  let tenantAdminUser;
  let tenantAdminToken;
  let cashierUser;
  let cashierToken;
  let unverifiedSuperAdminUser;
  let unverifiedSuperAdminToken;

  let testOrg1;
  let testOrg2;
  let testShop1;
  let starterPlan;
  let growthPlan;
  let invoice1;
  let notifLog1;

  beforeAll(async () => {
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });

    // 1. Create super-admin (verified)
    superAdminUser = await User.create({
      name: 'Platform Operator',
      email: `sa-route-test-${Date.now()}@zanapos.com`,
      password: 'password123',
      role: 'super_admin',
      shopId: null,
      active: true,
      emailVerifiedAt: new Date()
    });
    superAdminToken = generateToken({
      id: superAdminUser.id,
      role: 'super_admin',
      shopId: null
    });

    // 2. Create unverified super-admin
    unverifiedSuperAdminUser = await User.create({
      name: 'Unverified Operator',
      email: `sa-unver-route-${Date.now()}@zanapos.com`,
      password: 'password123',
      role: 'super_admin',
      shopId: null,
      active: true,
      emailVerifiedAt: null
    });
    unverifiedSuperAdminToken = generateToken({
      id: unverifiedSuperAdminUser.id,
      role: 'super_admin',
      shopId: null
    });

    // 3. Create test organizations and data
    testOrg1 = await Organization.create({
      name: 'Alpha Retailers',
      slug: `alpha-ret-${Date.now()}`,
      status: 'active',
      currency: 'KES'
    });

    testOrg2 = await Organization.create({
      name: 'Beta Groceries',
      slug: `beta-groc-${Date.now()}`,
      status: 'trialing',
      currency: 'KES'
    });

    testShop1 = await Shop.create({
      name: 'Alpha Main Shop',
      organizationId: testOrg1.id,
      active: true
    });

    // 4. Create tenant users
    tenantAdminUser = await User.create({
      name: 'Alpha Owner',
      email: `owner-alpha-${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: testShop1.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    tenantAdminToken = generateToken({
      id: tenantAdminUser.id,
      role: 'admin',
      shopId: testShop1.id,
      organizationId: testOrg1.id
    });

    await OrganizationMembership.create({
      organizationId: testOrg1.id,
      userId: tenantAdminUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    cashierUser = await User.create({
      name: 'Alpha Cashier',
      email: `cashier-alpha-${Date.now()}@test.com`,
      password: 'password123',
      role: 'cashier',
      shopId: testShop1.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    cashierToken = generateToken({
      id: cashierUser.id,
      role: 'cashier',
      shopId: testShop1.id,
      organizationId: testOrg1.id
    });

    // Subscriptions
    const sub1 = await Subscription.create({
      organizationId: testOrg1.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000)
    });

    await Subscription.create({
      organizationId: testOrg2.id,
      planId: growthPlan.id,
      status: 'trialing',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      trialEndsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000)
    });

    // Invoice & Notification Log
    invoice1 = await SubscriptionInvoice.create({
      invoiceNumber: `INV-PLAT-${Date.now()}`,
      organizationId: testOrg1.id,
      subscriptionId: sub1.id,
      planId: starterPlan.id,
      amount: 1500,
      currency: 'KES',
      paymentChannel: 'card',
      status: 'paid',
      paidAt: new Date()
    });

    notifLog1 = await BillingNotificationLog.create({
      organizationId: testOrg1.id,
      eventType: 'PAYMENT_RECEIPT',
      periodKey: invoice1.invoiceNumber,
      recipientEmail: tenantAdminUser.email,
      status: 'sent',
      sentAt: new Date()
    });
  });

  afterAll(async () => {
    if (notifLog1) await notifLog1.destroy();
    if (invoice1) await invoice1.destroy();
    if (testOrg1) {
      await Subscription.destroy({ where: { organizationId: testOrg1.id } });
      await OrganizationMembership.destroy({ where: { organizationId: testOrg1.id } });
      await User.destroy({ where: { id: [tenantAdminUser.id, cashierUser.id] } });
      await Shop.destroy({ where: { organizationId: testOrg1.id } });
      await Organization.destroy({ where: { id: testOrg1.id } });
    }
    if (testOrg2) {
      await Subscription.destroy({ where: { organizationId: testOrg2.id } });
      await Organization.destroy({ where: { id: testOrg2.id } });
    }
    if (superAdminUser) await superAdminUser.destroy();
    if (unverifiedSuperAdminUser) await unverifiedSuperAdminUser.destroy();
  });

  beforeEach(() => {
    clearVerifiedCache();
  });

  describe('1. Tenant Isolation on /api/platform/*', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/platform/overview');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authorization token required');
    });

    it('should reject tenant admin token with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/platform/overview')
        .set('Authorization', `Bearer ${tenantAdminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('super-admin privileges required');
    });

    it('should reject cashier token with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/platform/organizations')
        .set('Authorization', `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });

    it('should reject unverified super-admin with 403 EMAIL_VERIFICATION_REQUIRED', async () => {
      const res = await request(app)
        .get('/api/platform/overview')
        .set('Authorization', `Bearer ${unverifiedSuperAdminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });
  });

  describe('2. GET /api/platform/overview', () => {
    it('should return aggregated platform statistics', async () => {
      const res = await request(app)
        .get('/api/platform/overview')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('organizations');
      expect(res.body.organizations.total).toBeGreaterThanOrEqual(2);
      expect(res.body.organizations.active).toBeGreaterThanOrEqual(1);
      expect(res.body.organizations.trialing).toBeGreaterThanOrEqual(1);
      expect(res.body).toHaveProperty('infrastructure');
      expect(res.body).toHaveProperty('revenue');
      expect(res.body.revenue).toHaveProperty('estimatedMRR');
      expect(res.body).toHaveProperty('planDistribution');
    });
  });

  describe('3. GET /api/platform/organizations (with ADD 2 pagination clamp)', () => {
    it('should return paginated organizations with owner and subscription info', async () => {
      const res = await request(app)
        .get('/api/platform/organizations')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.organizations)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);

      const alpha = res.body.organizations.find(o => o.id === testOrg1.id);
      expect(alpha).toBeDefined();
      expect(alpha.name).toBe('Alpha Retailers');
      expect(alpha.subscription).toBeDefined();
      expect(alpha.subscription.plan.code).toBe('starter');
      expect(alpha.owner).toBeDefined();
      expect(alpha.owner.email).toBe(tenantAdminUser.email);
    });

    it('should clamp limit to max 100 when client requests limit=500 (ADD 2)', async () => {
      const res = await request(app)
        .get('/api/platform/organizations?limit=500')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });

    it('should filter organizations by status', async () => {
      const res = await request(app)
        .get('/api/platform/organizations?status=trialing')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      for (const org of res.body.organizations) {
        expect(org.status).toBe('trialing');
      }
    });

    it('should search organizations by name', async () => {
      const res = await request(app)
        .get('/api/platform/organizations?search=Alpha')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.organizations.some(o => o.name === 'Alpha Retailers')).toBe(true);
      expect(res.body.organizations.some(o => o.name === 'Beta Groceries')).toBe(false);
    });
  });

  describe('4. GET /api/platform/organizations/:id', () => {
    it('should return detailed tenant profile with quotas, shops, invoices, and notification logs', async () => {
      const res = await request(app)
        .get(`/api/platform/organizations/${testOrg1.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.organization.name).toBe('Alpha Retailers');
      expect(res.body.subscription.status).toBe('active');
      expect(res.body.quotaUsage).toBeDefined();
      expect(res.body.quotaUsage.shops.current).toBe(1);
      expect(res.body.quotaUsage.users.current).toBe(1);
      expect(Array.isArray(res.body.shops)).toBe(true);
      expect(res.body.shops.length).toBe(1);
      expect(Array.isArray(res.body.members)).toBe(true);
      expect(Array.isArray(res.body.recentInvoices)).toBe(true);
      expect(Array.isArray(res.body.recentNotifications)).toBe(true);
    });

    it('should return 404 for nonexistent organization ID', async () => {
      const res = await request(app)
        .get('/api/platform/organizations/99999999')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Organization not found');
    });
  });

  describe('5. GET /api/platform/plans', () => {
    it('should return all available plans and active subscriber counts', async () => {
      const res = await request(app)
        .get('/api/platform/plans')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.plans)).toBe(true);
      const starter = res.body.plans.find(p => p.code === 'starter');
      expect(starter).toBeDefined();
      expect(starter.activeSubscribers).toBeGreaterThanOrEqual(1);
    });
  });

  describe('6. GET /api/platform/invoices (with ADD 2 pagination clamp)', () => {
    it('should return cross-tenant invoices with pagination', async () => {
      const res = await request(app)
        .get('/api/platform/invoices')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invoices)).toBe(true);
      expect(res.body.pagination.limit).toBe(20);

      const inv = res.body.invoices.find(i => i.invoiceNumber === invoice1.invoiceNumber);
      expect(inv).toBeDefined();
      expect(inv.Organization.name).toBe('Alpha Retailers');
    });

    it('should clamp limit to max 100 on invoices (ADD 2)', async () => {
      const res = await request(app)
        .get('/api/platform/invoices?limit=250')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });
  });

  describe('7. GET /api/platform/notifications', () => {
    it('should return billing notification log records with organization info', async () => {
      const res = await request(app)
        .get('/api/platform/notifications')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      const notif = res.body.notifications.find(n => n.eventType === 'PAYMENT_RECEIPT' && n.organizationId === testOrg1.id);
      expect(notif).toBeDefined();
      expect(notif.Organization.name).toBe('Alpha Retailers');
    });
  });

  describe('8. Zero Mutation Endpoints in 7B (Confirmed 404 by omission)', () => {
    it('should return 404 for POST /api/platform/organizations', async () => {
      const res = await request(app)
        .post('/api/platform/organizations')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Hacked Org' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for PUT /api/platform/organizations/:id', async () => {
      const res = await request(app)
        .put(`/api/platform/organizations/${testOrg1.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'suspended' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for DELETE /api/platform/organizations/:id', async () => {
      const res = await request(app)
        .delete(`/api/platform/organizations/${testOrg1.id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for POST /api/platform/suspend', async () => {
      const res = await request(app)
        .post('/api/platform/suspend')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ orgId: testOrg1.id });

      expect(res.status).toBe(404);
    });
  });
});
