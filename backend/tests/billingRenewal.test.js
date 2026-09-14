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
  OrganizationMembership,
  SubscriptionInvoice,
  ActivityLog
} = require('../src/models');
const billingService = require('../src/services/billingService');
const entitlementService = require('../src/services/entitlementService');
const redisClient = require('../src/config/redis');
const axios = require('axios');

jest.mock('axios');

function generateToken(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Sub-Phase 6b: Subscription Renewal & Webhook Processing', () => {
  let org;
  let shop;
  let ownerUser;
  let adminUser;
  let ownerToken;
  let adminToken;
  let starterPlan;
  let growthPlan;
  let subscription;

  const MOCK_CHECKOUT_ID = 'ws_CO_TEST_RENEWAL_987654321';
  const FLW_SECRET_HASH = 'flw_test_secret_hash_value';

  beforeAll(async () => {
    process.env.FLW_SECRET_HASH = FLW_SECRET_HASH;
    process.env.FLW_SECRET_KEY = 'FLWSECK_TEST-mock';
    process.env.MPESA_CONSUMER_KEY = 'mock_consumer_key';
    process.env.MPESA_CONSUMER_SECRET = 'mock_consumer_secret';

    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    growthPlan = await Plan.findOne({ where: { code: 'growth' } });

    // Create test organization & shop
    org = await Organization.create({
      name: 'Renewal Test Org',
      slug: `renewal-test-${Date.now()}`,
      status: 'active'
    });

    shop = await Shop.create({
      name: 'Renewal Test Shop',
      organizationId: org.id,
      active: true
    });

    // Create owner user
    ownerUser = await User.create({
      name: 'Org Owner',
      email: `owner-${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop.id
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Create admin (non-owner) user
    adminUser = await User.create({
      name: 'Org Admin',
      email: `admin-${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop.id
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: adminUser.id,
      orgRole: 'admin',
      status: 'active'
    });

    ownerToken = generateToken({ id: ownerUser.id, email: ownerUser.email, role: 'admin', shopId: shop.id, organizationId: org.id });
    adminToken = generateToken({ id: adminUser.id, email: adminUser.email, role: 'admin', shopId: shop.id, organizationId: org.id });

    // Initial starter subscription
    subscription = await Subscription.create({
      organizationId: org.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 10 * 24 * 3600 * 1000), // 10 days remaining
      trialEndsAt: null
    });
  });

  afterAll(async () => {
    await SubscriptionInvoice.destroy({ where: { organizationId: org.id } });
    await Subscription.destroy({ where: { organizationId: org.id } });
    await ActivityLog.destroy({ where: { shopId: shop.id } });
    await OrganizationMembership.destroy({ where: { organizationId: org.id } });
    await User.destroy({ where: { id: [ownerUser.id, adminUser.id] } });
    await Shop.destroy({ where: { id: shop.id } });
    await Organization.destroy({ where: { id: org.id } });
    await entitlementService.invalidateOrgEntitlements(org.id);
  });

  describe('Verification 11: Access Control', () => {
    it('should reject non-owner (admin) calling renewal with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', adminToken)
        .send({ channel: 'mpesa', phone: '0712345678' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/owner privileges/i);
    });
  });

  describe('Verification 2: Renewal Invoice Generation', () => {
    it('should generate a pending SubscriptionInvoice with correct format and amount', async () => {
      const invoice = await billingService.generateRenewalInvoice(org.id, starterPlan.id, 'monthly');

      expect(invoice.id).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^INV-SUB-\d+-\d+$/);
      expect(parseFloat(invoice.amount)).toBe(parseFloat(starterPlan.priceMonthly));
      expect(invoice.currency).toBe('KES');
      expect(invoice.status).toBe('pending');
      expect(invoice.organizationId).toBe(org.id);
      expect(invoice.subscriptionId).toBe(subscription.id);
    });
  });

  describe('Verification 3: M-Pesa STK Push Initiation', () => {
    it('should initiate STK push and store CheckoutRequestID on invoice paymentReference', async () => {
      axios.get.mockResolvedValueOnce({
        data: { access_token: 'mock_daraja_access_token' }
      });
      axios.post.mockResolvedValueOnce({
        data: {
          CheckoutRequestID: MOCK_CHECKOUT_ID,
          CustomerMessage: 'Success. Request accepted for processing'
        }
      });

      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', ownerToken)
        .send({ channel: 'mpesa', phone: '0712345678' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.channel).toBe('mpesa');
      expect(res.body.checkoutRequestId).toBe(MOCK_CHECKOUT_ID);

      const invoice = await SubscriptionInvoice.findOne({
        where: { paymentReference: MOCK_CHECKOUT_ID }
      });
      expect(invoice).not.toBeNull();
      expect(invoice.status).toBe('pending');
      expect(invoice.paymentChannel).toBe('mpesa');
    });
  });

  describe('Verification 4: M-Pesa Webhook Success Path', () => {
    it('should confirm invoice, extend subscription period, create ActivityLog, and invalidate Redis cache', async () => {
      // Warm up entitlement cache
      await entitlementService.canUseFeature(org.id, 'org_insights');
      const cacheKey = `cache:entitlements:org:${org.id}`;
      const cacheBefore = await redisClient.get(cacheKey);
      expect(cacheBefore).not.toBeNull();

      const invoice = await SubscriptionInvoice.findOne({
        where: { paymentReference: MOCK_CHECKOUT_ID }
      });
      const subBefore = await Subscription.findOne({ where: { id: invoice.subscriptionId } });
      const initialEnd = new Date(subBefore.currentPeriodEnd);

      const payload = {
        Body: {
          stkCallback: {
            MerchantRequestID: 'mock_merchant_id',
            CheckoutRequestID: MOCK_CHECKOUT_ID,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: parseFloat(invoice.amount) },
                { Name: 'MpesaReceiptNumber', Value: 'QKH8765432' },
                { Name: 'TransactionDate', Value: 20260914120000 },
                { Name: 'PhoneNumber', Value: 254712345678 }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post('/api/billing/mpesa/callback')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.ResultCode).toBe(0);

      // Verify invoice marked paid
      const updatedInvoice = await SubscriptionInvoice.findByPk(invoice.id);
      expect(updatedInvoice.status).toBe('paid');
      expect(updatedInvoice.paidAt).not.toBeNull();

      // Verify subscription period extended by 30 days
      const updatedSub = await Subscription.findByPk(invoice.subscriptionId);
      expect(updatedSub.status).toBe('active');
      expect(updatedSub.lastPaymentMethod).toBe('mpesa');
      const expectedEnd = new Date(initialEnd.getTime() + 30 * 24 * 3600 * 1000);
      expect(new Date(updatedSub.currentPeriodEnd).toISOString().slice(0, 10))
        .toBe(expectedEnd.toISOString().slice(0, 10));

      // Verify Redis cache was invalidated
      const cacheAfter = await redisClient.get(cacheKey);
      expect(cacheAfter).toBeNull();

      // Verify ActivityLog entry created
      const log = await ActivityLog.findOne({
        where: {
          shopId: shop.id,
          action: 'SUBSCRIPTION_RENEWAL_CONFIRMED'
        }
      });
      expect(log).not.toBeNull();
      expect(log.details).toMatch(/QKH8765432/);
    });
  });

  describe('Verification 5: M-Pesa Webhook Idempotency', () => {
    it('should be a no-op when same callback is fired twice (period unchanged, 200 returned)', async () => {
      const invoice = await SubscriptionInvoice.findOne({
        where: { paymentReference: MOCK_CHECKOUT_ID }
      });
      const subBefore = await Subscription.findByPk(invoice.subscriptionId);
      const periodEndBefore = subBefore.currentPeriodEnd;

      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: MOCK_CHECKOUT_ID,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: parseFloat(invoice.amount) },
                { Name: 'MpesaReceiptNumber', Value: 'QKH8765432' }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post('/api/billing/mpesa/callback')
        .send(payload);

      expect(res.status).toBe(200);

      const subAfter = await Subscription.findByPk(invoice.subscriptionId);
      expect(new Date(subAfter.currentPeriodEnd).toISOString()).toBe(new Date(periodEndBefore).toISOString());
    });
  });

  describe('Verification 6: M-Pesa Amount Mismatch Rejection', () => {
    it('should reject callback when paid amount is less than invoice amount', async () => {
      const mismatchInvoice = await billingService.generateRenewalInvoice(org.id, starterPlan.id, 'monthly');
      const mismatchCheckoutId = 'ws_CO_MISMATCH_999999999';
      mismatchInvoice.paymentReference = mismatchCheckoutId;
      await mismatchInvoice.save();

      const payload = {
        Body: {
          stkCallback: {
            CheckoutRequestID: mismatchCheckoutId,
            ResultCode: 0,
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: 10 }, // 10 KES vs 1500 KES
                { Name: 'MpesaReceiptNumber', Value: 'MISM12345' }
              ]
            }
          }
        }
      };

      const res = await request(app)
        .post('/api/billing/mpesa/callback')
        .send(payload);

      expect(res.status).toBe(400);

      const invoiceAfter = await SubscriptionInvoice.findByPk(mismatchInvoice.id);
      expect(invoiceAfter.status).toBe('failed');
    });
  });

  describe('Verification 7: Flutterwave Signature Verification', () => {
    it('should immediately reject webhook without correct verif-hash with 401', async () => {
      const resNoSig = await request(app)
        .post('/api/billing/flutterwave/webhook')
        .send({ data: { tx_ref: 'any_ref' } });

      expect(resNoSig.status).toBe(401);

      const resBadSig = await request(app)
        .post('/api/billing/flutterwave/webhook')
        .set('verif-hash', 'wrong_signature')
        .send({ data: { tx_ref: 'any_ref' } });

      expect(resBadSig.status).toBe(401);
    });
  });

  describe('Verification 8: Flutterwave Success and Idempotency', () => {
    let flwInvoice;
    const FLW_TX_REF = `FLW-SUB-${Date.now()}`;

    beforeAll(async () => {
      flwInvoice = await billingService.generateRenewalInvoice(org.id, starterPlan.id, 'monthly');
      flwInvoice.paymentReference = FLW_TX_REF;
      flwInvoice.paymentChannel = 'card';
      await flwInvoice.save();
    });

    it('should confirm invoice, extend subscription, and invalidate Redis cache on valid webhook', async () => {
      const subBefore = await Subscription.findByPk(flwInvoice.subscriptionId);
      const initialEnd = new Date(subBefore.currentPeriodEnd);

      const payload = {
        event: 'charge.completed',
        data: {
          id: 78945612,
          tx_ref: FLW_TX_REF,
          amount: parseFloat(flwInvoice.amount),
          currency: 'KES',
          status: 'successful'
        }
      };

      const res = await request(app)
        .post('/api/billing/flutterwave/webhook')
        .set('verif-hash', FLW_SECRET_HASH)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');

      const updatedInvoice = await SubscriptionInvoice.findByPk(flwInvoice.id);
      expect(updatedInvoice.status).toBe('paid');
      expect(updatedInvoice.gatewayReference).toBe('78945612');

      const updatedSub = await Subscription.findByPk(flwInvoice.subscriptionId);
      expect(updatedSub.lastPaymentMethod).toBe('card');
      const expectedEnd = new Date(initialEnd.getTime() + 30 * 24 * 3600 * 1000);
      expect(new Date(updatedSub.currentPeriodEnd).toISOString().slice(0, 10))
        .toBe(expectedEnd.toISOString().slice(0, 10));
    });

    it('should be idempotent on duplicate Flutterwave delivery (returns 200, no extra period added)', async () => {
      const subBefore = await Subscription.findByPk(flwInvoice.subscriptionId);
      const periodEndBefore = subBefore.currentPeriodEnd;

      const payload = {
        event: 'charge.completed',
        data: {
          id: 78945612,
          tx_ref: FLW_TX_REF,
          amount: parseFloat(flwInvoice.amount),
          currency: 'KES',
          status: 'successful'
        }
      };

      const res = await request(app)
        .post('/api/billing/flutterwave/webhook')
        .set('verif-hash', FLW_SECRET_HASH)
        .send(payload);

      expect(res.status).toBe(200);

      const subAfter = await Subscription.findByPk(flwInvoice.subscriptionId);
      expect(new Date(subAfter.currentPeriodEnd).toISOString()).toBe(new Date(periodEndBefore).toISOString());
    });
  });

  describe('Verification 9: Concurrent Webhook Race Test', () => {
    it('should serialize two near-simultaneous webhook calls via row lock and extend period exactly once', async () => {
      const raceInvoice = await billingService.generateRenewalInvoice(org.id, starterPlan.id, 'monthly');
      const RACE_TX_REF = `RACE-TX-${Date.now()}`;
      raceInvoice.paymentReference = RACE_TX_REF;
      raceInvoice.paymentChannel = 'card';
      await raceInvoice.save();

      const subBefore = await Subscription.findByPk(raceInvoice.subscriptionId);
      const periodEndBefore = new Date(subBefore.currentPeriodEnd);

      const payload = {
        event: 'charge.completed',
        data: {
          id: 11223344,
          tx_ref: RACE_TX_REF,
          amount: parseFloat(raceInvoice.amount),
          currency: 'KES',
          status: 'successful'
        }
      };

      // Deliver 2 webhook calls concurrently
      const [res1, res2] = await Promise.all([
        request(app).post('/api/billing/flutterwave/webhook').set('verif-hash', FLW_SECRET_HASH).send(payload),
        request(app).post('/api/billing/flutterwave/webhook').set('verif-hash', FLW_SECRET_HASH).send(payload)
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify the subscription was extended exactly ONCE (+30 days), NOT twice (+60 days)
      const subAfter = await Subscription.findByPk(raceInvoice.subscriptionId);
      const expectedEnd = new Date(periodEndBefore.getTime() + 30 * 24 * 3600 * 1000);
      expect(new Date(subAfter.currentPeriodEnd).toISOString().slice(0, 10))
        .toBe(expectedEnd.toISOString().slice(0, 10));
    });
  });

  describe('Verification 10: Grace Period & Past-Due Transition', () => {
    let expiredOrg;
    let expiredShop;
    let testSub;
    let gfSub;

    beforeAll(async () => {
      expiredOrg = await Organization.create({
        name: 'Expired Test Org',
        slug: `expired-org-${Date.now()}`,
        status: 'active'
      });
      expiredShop = await Shop.create({
        name: 'Expired Test Shop',
        organizationId: expiredOrg.id,
        active: true
      });

      // Expired active subscription (ended yesterday)
      testSub = await Subscription.create({
        organizationId: expiredOrg.id,
        planId: starterPlan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(Date.now() - 31 * 24 * 3600 * 1000),
        currentPeriodEnd: new Date(Date.now() - 1 * 24 * 3600 * 1000), // expired 1 day ago
        trialEndsAt: null
      });

      // Grandfathered subscription (ends year 2099)
      const gfPlan = await Plan.findOne({ where: { code: 'grandfathered' } });
      gfSub = await Subscription.findOne({ where: { planId: gfPlan.id } });
    });

    afterAll(async () => {
      if (expiredShop) await ActivityLog.destroy({ where: { shopId: expiredShop.id } });
      if (testSub) await Subscription.destroy({ where: { id: testSub.id } });
      if (expiredShop) await Shop.destroy({ where: { id: expiredShop.id } });
      if (expiredOrg) await Organization.destroy({ where: { id: expiredOrg.id } });
    });

    it('should transition expired active subscription to past_due, while grandfathered org is immune', async () => {
      const result = await billingService.checkAndTransitionExpiredSubscriptions(new Date());

      expect(result.transitionedToPastDue).toBeGreaterThanOrEqual(1);

      const refreshedTestSub = await Subscription.findByPk(testSub.id);
      expect(refreshedTestSub.status).toBe('past_due');

      if (gfSub) {
        const refreshedGfSub = await Subscription.findByPk(gfSub.id);
        expect(refreshedGfSub.status).toBe('active');
        expect(new Date(refreshedGfSub.currentPeriodEnd) > new Date('2099-01-01')).toBe(true);
      }
    });

    it('should transition past_due subscription past 7-day grace period to suspended', async () => {
      // Simulate expired 8 days ago (past 7-day grace period)
      await testSub.update({
        status: 'past_due',
        currentPeriodEnd: new Date(Date.now() - 8 * 24 * 3600 * 1000)
      });

      const result = await billingService.checkAndTransitionExpiredSubscriptions(new Date());

      expect(result.transitionedToSuspended).toBeGreaterThanOrEqual(1);

      const refreshedTestSub = await Subscription.findByPk(testSub.id);
      expect(refreshedTestSub.status).toBe('suspended');
    });
  });
});
