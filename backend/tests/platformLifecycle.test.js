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
  PlatformAuditLog,
  ActivityLog,
  sequelize
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const entitlementService = require('../src/services/entitlementService');
const billingService = require('../src/services/billingService');
const billingPaymentService = require('../src/services/billingPaymentService');
const emailService = require('../src/services/emailService');

function generateToken(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Platform Lifecycle Controls Suite (Suspend / Deactivate / Reactivate / Audit)', () => {
  let superAdminUser;
  let superAdminToken;
  let tenantOwnerUser;
  let tenantOwnerToken;
  let cashierUser;
  let cashierToken;

  let starterPlan;
  let grandfatheredPlan;
  let testOrg;
  let testSub;

  beforeAll(async () => {
    jest.spyOn(emailService, 'sendAccountSuspendedEmail').mockResolvedValue({ messageId: 'mock-susp' });
    jest.spyOn(emailService, 'sendAccountReactivatedEmail').mockResolvedValue({ messageId: 'mock-react' });
    jest.spyOn(emailService, 'sendPaymentReceiptEmail').mockResolvedValue({ messageId: 'mock-receipt' });
    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    if (!starterPlan) {
      starterPlan = await Plan.create({
        code: 'starter',
        name: 'Starter Plan',
        priceMonthly: 1500,
        priceYearly: 15000,
        currency: 'KES',
        maxShops: 1,
        maxUsers: 2,
        features: JSON.stringify({ basicReports: true })
      });
    }

    grandfatheredPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
    if (!grandfatheredPlan) {
      grandfatheredPlan = await Plan.create({
        code: 'grandfathered',
        name: 'Grandfathered Plan',
        priceMonthly: 0,
        priceYearly: 0,
        currency: 'KES',
        maxShops: -1,
        maxUsers: -1,
        features: JSON.stringify({ all: true })
      });
    }

    // 1. Create super_admin
    superAdminUser = await User.create({
      name: 'Super Admin Operator',
      email: `sa-lifecycle-${Date.now()}@zanapos.local`,
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

    // 2. Create organization and tenant owner
    testOrg = await Organization.create({
      name: 'Lifecycle Test Org',
      slug: `lifecycle-org-${Date.now()}`,
      status: 'active',
      currency: 'KES'
    });

    const testShop = await Shop.create({
      name: 'Lifecycle Shop',
      organizationId: testOrg.id,
      active: true
    });

    tenantOwnerUser = await User.create({
      name: 'Org Owner',
      email: `owner-lifecycle-${Date.now()}@zanapos.local`,
      password: 'password123',
      role: 'admin',
      shopId: testShop.id,
      active: true,
      emailVerifiedAt: new Date()
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: tenantOwnerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    tenantOwnerToken = generateToken({
      id: tenantOwnerUser.id,
      role: 'admin',
      shopId: testShop.id,
      organizationId: testOrg.id
    });

    // Cashier
    cashierUser = await User.create({
      name: 'Cashier User',
      email: `cashier-lifecycle-${Date.now()}@zanapos.local`,
      password: 'password123',
      role: 'cashier',
      shopId: testShop.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    cashierToken = generateToken({
      id: cashierUser.id,
      role: 'cashier',
      shopId: testShop.id,
      organizationId: testOrg.id
    });

    // Subscription for testOrg (period ends 30 days in future)
    testSub = await Subscription.create({
      organizationId: testOrg.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      manualHold: false
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
  });

  describe('1. Authentication & Authorization Guards', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .send({ reason: 'Compliance violation reported' });

      expect(res.status).toBe(401);
    });

    it('rejects non-super-admin (tenant owner) with 403', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${tenantOwnerToken}`)
        .send({ reason: 'Compliance violation reported' });

      expect(res.status).toBe(403);
    });

    it('rejects non-super-admin (cashier) with 403', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/deactivate`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ reason: 'Terms of service breach' });

      expect(res.status).toBe(403);
    });
  });

  describe('2. Input Validation Guards', () => {
    it('rejects missing or empty reason with 400', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Reason is required/);
    });

    it('rejects reason shorter than 10 characters with 400', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Too short' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least 10 characters/);
    });

    it('rejects reason longer than 500 characters with 400', async () => {
      const longReason = 'A'.repeat(501);
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: longReason });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not exceed 500 characters/);
    });

    it('rejects invalid organization ID with 400', async () => {
      const res = await request(app)
        .post('/api/platform/organizations/not-an-id/suspend')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Compliance check failed by platform team' });

      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent organization', async () => {
      const res = await request(app)
        .post('/api/platform/organizations/999999/suspend')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Compliance hold for non-existent' });

      expect(res.status).toBe(404);
    });
  });

  describe('3. Transitions, Audit Logging, and 409 Conflict Invariants', () => {
    it('returns 409 when attempting to modify a closed/deleted organization', async () => {
      const deletedOrg = await Organization.create({
        name: 'Deleted Org',
        slug: `deleted-org-${Date.now()}`,
        status: 'canceled',
        deletedAt: new Date(),
        scheduledPurgeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      const res = await request(app)
        .post(`/api/platform/organizations/${deletedOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Attempting to suspend closed account' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/closed or deleted/);
    });

    it('suspends an active organization: updates Org, Subscription, writes audit row and sets cache', async () => {
      const setOrgStatusSpy = jest.spyOn(tokenRevocationService, 'setOrgStatus');
      const invalidateSpy = jest.spyOn(entitlementService, 'invalidateOrgEntitlements');

      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Suspicious billing activity detected by risk model' });

      expect(res.status).toBe(200);
      expect(res.body.organization.status).toBe('suspended');
      expect(res.body.subscription.manualHold).toBe(true);

      // Verify DB state
      const reloadedOrg = await Organization.findByPk(testOrg.id);
      expect(reloadedOrg.status).toBe('suspended');

      const reloadedSub = await Subscription.findOne({ where: { organizationId: testOrg.id } });
      expect(reloadedSub.status).toBe('suspended');
      expect(reloadedSub.manualHold).toBe(true);

      // Verify PlatformAuditLogs row
      const auditLog = await PlatformAuditLog.findOne({
        where: { organizationId: testOrg.id, action: 'ORGANIZATION_SUSPENDED' },
        order: [['createdAt', 'DESC']]
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.actorUserId).toBe(superAdminUser.id);
      expect(auditLog.fromStatus).toBe('active');
      expect(auditLog.toStatus).toBe('suspended');
      expect(auditLog.reason).toBe('Suspicious billing activity detected by risk model');

      // Verify post-commit service calls
      expect(setOrgStatusSpy).toHaveBeenCalledWith(testOrg.id, 'suspended');
      expect(invalidateSpy).toHaveBeenCalledWith(testOrg.id);

      setOrgStatusSpy.mockRestore();
      invalidateSpy.mockRestore();
    });

    it('rejects suspending an already-held suspended organization with 409 (no-op guard)', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Duplicate suspension attempt' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already suspended under manual hold/);
    });

    it('reactivates a suspended organization with future period untouched', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'KYC documents verified and risk cleared by compliance team' });

      expect(res.status).toBe(200);
      expect(res.body.organization.status).toBe('active');
      expect(res.body.subscription.status).toBe('active');
      expect(res.body.subscription.manualHold).toBe(false);

      const reloadedOrg = await Organization.findByPk(testOrg.id);
      expect(reloadedOrg.status).toBe('active');

      const reloadedSub = await Subscription.findOne({ where: { organizationId: testOrg.id } });
      expect(reloadedSub.status).toBe('active');
      expect(reloadedSub.manualHold).toBe(false);

      const auditLog = await PlatformAuditLog.findOne({
        where: { organizationId: testOrg.id, action: 'ORGANIZATION_REACTIVATED' },
        order: [['createdAt', 'DESC']]
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.fromStatus).toBe('suspended');
      expect(auditLog.toStatus).toBe('active');
    });

    it('rejects reactivating an already active, non-held organization with 409', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Attempting redundant reactivation' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already active and not on hold/);
    });

    it('deactivates an organization: updates to canceled with manualHold=true and writes audit row', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Operator-initiated permanent platform debarment' });

      expect(res.status).toBe(200);
      expect(res.body.organization.status).toBe('canceled');
      expect(res.body.subscription.status).toBe('canceled');
      expect(res.body.subscription.manualHold).toBe(true);

      const reloadedOrg = await Organization.findByPk(testOrg.id);
      expect(reloadedOrg.status).toBe('canceled');

      const reloadedSub = await Subscription.findOne({ where: { organizationId: testOrg.id } });
      expect(reloadedSub.status).toBe('canceled');
      expect(reloadedSub.manualHold).toBe(true);

      const auditLog = await PlatformAuditLog.findOne({
        where: { organizationId: testOrg.id, action: 'ORGANIZATION_DEACTIVATED' },
        order: [['createdAt', 'DESC']]
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.toStatus).toBe('canceled');
    });

    it('rejects deactivating an already deactivated organization with 409', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Redundant deactivation attempt' });

      expect(res.status).toBe(409);
    });

    it('rejects suspending a canceled/deactivated organization with 409', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${testOrg.id}/suspend`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Attempting to suspend deactivated account' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Cannot suspend an organization that is canceled/);
    });
  });

  describe('4. Reactivate with Lapsed Period Validation', () => {
    let lapsedOrg;
    let lapsedSub;

    beforeAll(async () => {
      lapsedOrg = await Organization.create({
        name: 'Lapsed Period Org',
        slug: `lapsed-org-${Date.now()}`,
        status: 'suspended',
        currency: 'KES'
      });

      // Period ended 10 days ago
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      lapsedSub = await Subscription.create({
        organizationId: lapsedOrg.id,
        planId: starterPlan.id,
        status: 'suspended',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: pastDate,
        manualHold: true
      });
    });

    it('rejects reactivation of lapsed subscription without newPeriodEnd with 400', async () => {
      const res = await request(app)
        .post(`/api/platform/organizations/${lapsedOrg.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ reason: 'Reactivation without providing new period end date' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/newPeriodEnd is required because the current subscription period has lapsed/);
    });

    it('rejects newPeriodEnd that is in the past with 400', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const res = await request(app)
        .post(`/api/platform/organizations/${lapsedOrg.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          reason: 'Reactivation with past newPeriodEnd provided',
          newPeriodEnd: pastDate
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/valid future date/);
    });

    it('rejects newPeriodEnd beyond 400 days in future with 400', async () => {
      const farFutureDate = new Date(Date.now() + 450 * 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .post(`/api/platform/organizations/${lapsedOrg.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          reason: 'Reactivation with excessive period end date',
          newPeriodEnd: farFutureDate
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot exceed 400 days/);
    });

    it('successfully reactivates lapsed organization when valid future newPeriodEnd is provided', async () => {
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const res = await request(app)
        .post(`/api/platform/organizations/${lapsedOrg.id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          reason: 'Valid courtesy reactivation by platform team',
          newPeriodEnd: futureDate.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.organization.status).toBe('active');
      expect(res.body.subscription.status).toBe('active');
      expect(res.body.subscription.manualHold).toBe(false);

      const reloadedSub = await Subscription.findByPk(lapsedSub.id);
      expect(Math.abs(new Date(reloadedSub.currentPeriodEnd).getTime() - futureDate.getTime())).toBeLessThan(2000);
    });
  });

  describe('5. Platform Audit Log Pagination Endpoint', () => {
    it('returns paginated audit logs for the organization capped at 100', async () => {
      const res = await request(app)
        .get(`/api/platform/organizations/${testOrg.id}/audit?page=1&limit=50`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.organization.id).toBe(testOrg.id);
      expect(Array.isArray(res.body.auditLogs)).toBe(true);
      expect(res.body.auditLogs.length).toBeGreaterThan(0);
      expect(res.body.pagination.limit).toBe(50);

      const firstLog = res.body.auditLogs[0];
      expect(firstLog.actor).toBeDefined();
      expect(firstLog.actor.role).toBe('super_admin');
    });

    it('caps limit at 100 if requested limit exceeds 100', async () => {
      const res = await request(app)
        .get(`/api/platform/organizations/${testOrg.id}/audit?page=1&limit=500`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(100);
    });
  });

  describe('6. Grandfathered Tier Hold Semantics (getEffectiveSubscriptionStatus)', () => {
    it('resolves unheld grandfathered subscription as "active"', () => {
      const unheldGfSub = {
        status: 'active',
        manualHold: false,
        Plan: { code: 'grandfathered' },
        currentPeriodEnd: new Date(Date.now() - 5000)
      };

      const effective = entitlementService.getEffectiveSubscriptionStatus(unheldGfSub);
      expect(effective).toBe('active');
    });

    it('resolves held grandfathered subscription with rawStatus "suspended" as "suspended"', () => {
      const heldGfSub = {
        status: 'suspended',
        manualHold: true,
        Plan: { code: 'grandfathered' },
        currentPeriodEnd: new Date('2099-12-31')
      };

      const effective = entitlementService.getEffectiveSubscriptionStatus(heldGfSub);
      expect(effective).toBe('suspended');
    });

    it('resolves held grandfathered subscription with rawStatus "canceled" as "canceled"', () => {
      const heldGfSub = {
        status: 'canceled',
        manualHold: true,
        Plan: { code: 'grandfathered' },
        currentPeriodEnd: new Date('2099-12-31')
      };

      const effective = entitlementService.getEffectiveSubscriptionStatus(heldGfSub);
      expect(effective).toBe('canceled');
    });

    it('still returns "active" for grandfathered sub if manualHold is false even if raw status is suspended (immune)', () => {
      const immuneGfSub = {
        status: 'suspended',
        manualHold: false,
        Plan: { code: 'grandfathered' }
      };

      const effective = entitlementService.getEffectiveSubscriptionStatus(immuneGfSub);
      expect(effective).toBe('active');
    });
  });

  describe('7. Payment During Manual Hold (processConfirmedRenewal)', () => {
    let heldOrg;
    let heldSub;
    let invoice;

    beforeAll(async () => {
      heldOrg = await Organization.create({
        name: 'Payment Hold Org',
        slug: `pay-hold-org-${Date.now()}`,
        status: 'suspended',
        currency: 'KES'
      });

      await Shop.create({
        name: 'Payment Hold Shop',
        organizationId: heldOrg.id,
        active: true
      });

      const fixedEnd = new Date('2026-11-15T00:00:00.000Z');
      heldSub = await Subscription.create({
        organizationId: heldOrg.id,
        planId: starterPlan.id,
        status: 'suspended',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-10-15T00:00:00.000Z'),
        currentPeriodEnd: fixedEnd,
        manualHold: true
      });

      invoice = await SubscriptionInvoice.create({
        organizationId: heldOrg.id,
        subscriptionId: heldSub.id,
        planId: starterPlan.id,
        invoiceNumber: `INV-HOLD-${Date.now()}`,
        amount: 1500,
        currency: 'KES',
        billingCycle: 'monthly',
        paymentChannel: 'mpesa',
        status: 'pending',
        dueDate: new Date()
      });
    });

    it('records invoice as paid with heldByPlatform flag, leaving subscription and org status unchanged', async () => {
      const initialPeriodEnd = heldSub.currentPeriodEnd;

      const t = await sequelize.transaction();
      try {
        await billingService.processConfirmedRenewal({
          invoice,
          paymentMethod: 'mpesa',
          receiptOrTxRef: 'MPESA-HOLD-TEST',
          gatewayReference: 'GW-HOLD-12345',
          transaction: t
        });
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }

      // Reload records from DB
      const reloadedInvoice = await SubscriptionInvoice.findByPk(invoice.id);
      expect(reloadedInvoice.status).toBe('paid');
      expect(reloadedInvoice.metadata?.heldByPlatform).toBe(true);

      const reloadedSub = await Subscription.findByPk(heldSub.id);
      expect(reloadedSub.status).toBe('suspended');
      expect(reloadedSub.manualHold).toBe(true);
      expect(new Date(reloadedSub.currentPeriodEnd).toISOString()).toBe(new Date(initialPeriodEnd).toISOString());

      const reloadedOrg = await Organization.findByPk(heldOrg.id);
      expect(reloadedOrg.status).toBe('suspended');

      // Verify activity log row
      const activity = await ActivityLog.findOne({
        where: { action: 'PAYMENT_RECEIVED_DURING_HOLD' },
        order: [['createdAt', 'DESC']]
      });
      expect(activity).toBeDefined();
      expect(activity.details).toMatch(/Subscription manual hold was respected; status and period unchanged/);
    });
  });
  describe('8. Phase 2 Hardening: Platform Hold Enforcements', () => {
    let heldOwnerUser;
    let heldOwnerToken;
    let heldOrg2;
    let heldSub2;
    let heldShop2;

    let unheldOwnerUser;
    let unheldOwnerToken;
    let unheldOrg;
    let unheldSub;
    let unheldShop;

    beforeAll(async () => {
      jest.spyOn(billingPaymentService, 'initiateMpesaRenewal').mockResolvedValue({
        customerMessage: 'Success. Request accepted for processing'
      });
      jest.spyOn(billingPaymentService, 'initiateCardRenewal').mockResolvedValue({
        paymentReference: 'FLW_MOCK_REF_12345',
        redirectUrl: 'https://checkout.flutterwave.com/mock'
      });

      // 1. Held Org setup
      heldOrg2 = await Organization.create({
        name: 'Phase 2 Held Org',
        slug: 'phase2-held-org-' + Date.now(),
        status: 'suspended',
        currency: 'KES'
      });
      heldShop2 = await Shop.create({
        name: 'Held Shop 2',
        organizationId: heldOrg2.id,
        active: true
      });
      heldOwnerUser = await User.create({
        name: 'Held Owner',
        email: 'held-owner-' + Date.now() + '@test.com',
        password: '$2a$10$dummyHashForTestingPassw12345678901234567890',
        role: 'admin',
        shopId: heldShop2.id,
        isEmailVerified: true,
        emailVerifiedAt: new Date()
      });
      await OrganizationMembership.create({
        organizationId: heldOrg2.id,
        userId: heldOwnerUser.id,
        orgRole: 'owner',
        status: 'active'
      });
      heldSub2 = await Subscription.create({
        organizationId: heldOrg2.id,
        planId: starterPlan.id,
        status: 'suspended',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        manualHold: true
      });
      heldOwnerToken = generateToken({
        id: heldOwnerUser.id,
        email: heldOwnerUser.email,
        role: 'admin',
        orgRole: 'owner',
        organizationId: heldOrg2.id,
        shopId: heldShop2.id
      });

      // 2. Unheld Suspended Org setup
      unheldOrg = await Organization.create({
        name: 'Phase 2 Unheld Org',
        slug: 'phase2-unheld-org-' + Date.now(),
        status: 'suspended',
        currency: 'KES'
      });
      unheldShop = await Shop.create({
        name: 'Unheld Shop',
        organizationId: unheldOrg.id,
        active: true
      });
      unheldOwnerUser = await User.create({
        name: 'Unheld Owner',
        email: 'unheld-owner-' + Date.now() + '@test.com',
        password: '$2a$10$dummyHashForTestingPassw12345678901234567890',
        role: 'admin',
        shopId: unheldShop.id,
        isEmailVerified: true,
        emailVerifiedAt: new Date()
      });
      await OrganizationMembership.create({
        organizationId: unheldOrg.id,
        userId: unheldOwnerUser.id,
        orgRole: 'owner',
        status: 'active'
      });
      unheldSub = await Subscription.create({
        organizationId: unheldOrg.id,
        planId: starterPlan.id,
        status: 'suspended',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        manualHold: false
      });
      unheldOwnerToken = generateToken({
        id: unheldOwnerUser.id,
        email: unheldOwnerUser.email,
        role: 'admin',
        orgRole: 'owner',
        organizationId: unheldOrg.id,
        shopId: unheldShop.id
      });
    });

    it('held suspended org receives 403 with platformHold message and flag on operational route', async () => {
      await entitlementService.invalidateOrgEntitlements(heldOrg2.id);
      const res = await request(app)
        .get('/api/sales')
        .set('Authorization', 'Bearer ' + heldOwnerToken);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
      expect(res.body.isSuspended).toBe(true);
      expect(res.body.platformHold).toBe(true);
      expect(res.body.error).toBe('Your account has been placed on hold by the platform. Please contact support.');
    });

    it('held canceled org receives 403 with platformHold message and flag on operational route', async () => {
      await heldSub2.update({ status: 'canceled' });
      await entitlementService.invalidateOrgEntitlements(heldOrg2.id);

      const res = await request(app)
        .get('/api/sales')
        .set('Authorization', 'Bearer ' + heldOwnerToken);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('SUBSCRIPTION_CANCELED');
      expect(res.body.isCanceled).toBe(true);
      expect(res.body.platformHold).toBe(true);
      expect(res.body.error).toBe('Your account has been placed on hold by the platform. Please contact support.');

      // Restore to suspended for remaining tests
      await heldSub2.update({ status: 'suspended' });
      await entitlementService.invalidateOrgEntitlements(heldOrg2.id);
    });

    it('unheld suspended org message and output is byte-identical to standard behavior', async () => {
      await entitlementService.invalidateOrgEntitlements(unheldOrg.id);
      const res = await request(app)
        .get('/api/sales')
        .set('Authorization', 'Bearer ' + unheldOwnerToken);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
      expect(res.body.isSuspended).toBe(true);
      expect(res.body.platformHold).toBeUndefined();
      expect(res.body.error).toBe('Organization subscription is suspended. Please settle outstanding invoices to restore access.');
    });

    it('rejects M-Pesa renewal initiation on held org with 409 PLATFORM_HOLD and creates no invoice', async () => {
      const invoiceCountBefore = await SubscriptionInvoice.count({ where: { organizationId: heldOrg2.id } });

      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', 'Bearer ' + heldOwnerToken)
        .send({ channel: 'mpesa', phone: '254712345678' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PLATFORM_HOLD');
      expect(res.body.error).toBe('Payments are disabled while your account is on hold. Please contact support.');

      const invoiceCountAfter = await SubscriptionInvoice.count({ where: { organizationId: heldOrg2.id } });
      expect(invoiceCountAfter).toBe(invoiceCountBefore);
    });

    it('rejects card renewal initiation on held org with 409 PLATFORM_HOLD and creates no invoice', async () => {
      const invoiceCountBefore = await SubscriptionInvoice.count({ where: { organizationId: heldOrg2.id } });

      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', 'Bearer ' + heldOwnerToken)
        .send({ channel: 'card' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PLATFORM_HOLD');
      expect(res.body.error).toBe('Payments are disabled while your account is on hold. Please contact support.');

      const invoiceCountAfter = await SubscriptionInvoice.count({ where: { organizationId: heldOrg2.id } });
      expect(invoiceCountAfter).toBe(invoiceCountBefore);
    });

    it('permits renewal initiation on unheld org normally', async () => {
      const resMpesa = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', 'Bearer ' + unheldOwnerToken)
        .send({ channel: 'mpesa', phone: '254712345678' });

      expect(resMpesa.status).toBe(200);
      expect(resMpesa.body.success).toBe(true);
      expect(resMpesa.body.channel).toBe('mpesa');

      const resCard = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', 'Bearer ' + unheldOwnerToken)
        .send({ channel: 'card' });

      expect(resCard.status).toBe(200);
      expect(resCard.body.success).toBe(true);
      expect(resCard.body.channel).toBe('card');
    });
  });

});
