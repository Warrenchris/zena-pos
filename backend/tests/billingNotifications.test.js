'use strict';

const request = require('supertest');
const app = require('../src/app');
const {
  sequelize,
  Organization,
  Shop,
  User,
  OrganizationMembership,
  Subscription,
  SubscriptionInvoice,
  Plan,
  BillingNotificationLog,
  ActivityLog
} = require('../src/models');
const emailService = require('../src/services/emailService');
const billingNotificationService = require('../src/services/billingNotificationService');
const billingService = require('../src/services/billingService');
const { checkAndSendBillingReminders } = require('../src/services/billingScheduler');
const jwt = require('jsonwebtoken');

function generateToken(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Phase 7A: Billing Notifications & Lifecycle Emails Suite', () => {
  let org;
  let shop;
  let ownerUser;
  let starterPlan;
  let grandfatheredPlan;
  let subscription;

  const FLW_SECRET_HASH = 'test_flw_secret_notifications_123';

  beforeAll(async () => {
    process.env.FLW_SECRET_HASH = FLW_SECRET_HASH;

    starterPlan = await Plan.findOne({ where: { code: 'starter' } });
    grandfatheredPlan = await Plan.findOne({ where: { code: 'grandfathered' } });

    // Create test organization & shop
    org = await Organization.create({
      name: 'Notifications Test Org',
      slug: `notif-test-${Date.now()}`,
      status: 'active'
    });

    shop = await Shop.create({
      name: 'Notifications Test Shop',
      organizationId: org.id,
      active: true
    });

    // Create unverified owner user (to test unverified owner delivery)
    ownerUser = await User.create({
      name: 'Unverified Owner',
      email: `owner-notif-${Date.now()}@test.com`,
      password: 'password123',
      role: 'admin',
      shopId: shop.id,
      emailVerifiedAt: null // Explicitly unverified!
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Base active subscription
    subscription = await Subscription.create({
      organizationId: org.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      trialEndsAt: null
    });
  });

  afterAll(async () => {
    try {
      if (org) {
        await BillingNotificationLog.destroy({ where: { organizationId: org.id } });
        await SubscriptionInvoice.destroy({ where: { organizationId: org.id } });
        await Subscription.destroy({ where: { organizationId: org.id } });
        await OrganizationMembership.destroy({ where: { organizationId: org.id } });
        if (shop) await ActivityLog.destroy({ where: { shopId: shop.id } });
        if (ownerUser) await User.destroy({ where: { id: ownerUser.id } });
        if (shop) await Shop.destroy({ where: { id: shop.id } });
        await Organization.destroy({ where: { id: org.id } });
      }
    } catch (cleanupErr) {
      console.error('Error cleaning up billing notifications test data:', cleanupErr);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1 & 2. Trial Ending Reminders (5 Days and 1 Day)', () => {
    it('should trigger TRIAL_ENDING_5D reminder and record log in BillingNotificationLog', async () => {
      const sendTrialSpy = jest.spyOn(emailService, 'sendTrialEndingEmail').mockResolvedValue({ messageId: 'msg-trial-5d' });

      const today = new Date('2026-10-10T12:00:00Z');
      const trialEndsAt = new Date('2026-10-15T12:00:00Z'); // exactly 5 calendar days later

      await subscription.update({
        status: 'trialing',
        trialEndsAt
      });

      const results = await checkAndSendBillingReminders(today);

      expect(results.trialEnding5d).toBe(1);
      expect(sendTrialSpy).toHaveBeenCalledTimes(1);
      expect(sendTrialSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        name: ownerUser.name,
        daysRemaining: 5
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'TRIAL_ENDING_5D'
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
      expect(log.recipientEmail).toBe(ownerUser.email);
      expect(log.periodKey).toBe('2026-10-15');
    });

    it('should trigger TRIAL_ENDING_1D reminder and record log in BillingNotificationLog', async () => {
      const sendTrialSpy = jest.spyOn(emailService, 'sendTrialEndingEmail').mockResolvedValue({ messageId: 'msg-trial-1d' });

      const today = new Date('2026-10-14T12:00:00Z');
      const trialEndsAt = new Date('2026-10-15T12:00:00Z'); // exactly 1 calendar day later

      await subscription.update({
        status: 'trialing',
        trialEndsAt
      });

      const results = await checkAndSendBillingReminders(today);

      expect(results.trialEnding1d).toBe(1);
      expect(sendTrialSpy).toHaveBeenCalledTimes(1);
      expect(sendTrialSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        name: ownerUser.name,
        daysRemaining: 1
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'TRIAL_ENDING_1D'
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
      expect(log.periodKey).toBe('2026-10-15');
    });
  });

  describe('3 & 4. Renewal Due Reminders (7 Days and 1 Day)', () => {
    it('should trigger RENEWAL_DUE_7D reminder and record log in BillingNotificationLog', async () => {
      const sendRenewalSpy = jest.spyOn(emailService, 'sendRenewalDueEmail').mockResolvedValue({ messageId: 'msg-renewal-7d' });

      const today = new Date('2026-10-08T00:00:00Z');
      const currentPeriodEnd = new Date('2026-10-15T00:00:00Z'); // 7 days later

      await subscription.update({
        status: 'active',
        currentPeriodEnd,
        trialEndsAt: null
      });

      const results = await checkAndSendBillingReminders(today);

      expect(results.renewalDue7d).toBe(1);
      expect(sendRenewalSpy).toHaveBeenCalledTimes(1);
      expect(sendRenewalSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        name: ownerUser.name,
        planName: starterPlan.name
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'RENEWAL_DUE_7D'
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
      expect(log.periodKey).toBe('2026-10-15');
    });

    it('should trigger RENEWAL_DUE_1D reminder and record log in BillingNotificationLog', async () => {
      const sendRenewalSpy = jest.spyOn(emailService, 'sendRenewalDueEmail').mockResolvedValue({ messageId: 'msg-renewal-1d' });

      const today = new Date('2026-10-14T00:00:00Z');
      const currentPeriodEnd = new Date('2026-10-15T00:00:00Z'); // 1 day later

      await subscription.update({
        status: 'active',
        currentPeriodEnd
      });

      const results = await checkAndSendBillingReminders(today);

      expect(results.renewalDue1d).toBe(1);
      expect(sendRenewalSpy).toHaveBeenCalledTimes(1);

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'RENEWAL_DUE_1D'
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
      expect(log.periodKey).toBe('2026-10-15');
    });
  });

  describe('5. Payment Receipt Notification', () => {
    it('should dispatch PAYMENT_RECEIPT on confirmed renewal with invoice and period details', async () => {
      const sendReceiptSpy = jest.spyOn(emailService, 'sendPaymentReceiptEmail').mockResolvedValue({ messageId: 'msg-receipt-1' });

      const invoice = await SubscriptionInvoice.create({
        invoiceNumber: `INV-RECEIPT-${Date.now()}`,
        organizationId: org.id,
        subscriptionId: subscription.id,
        planId: starterPlan.id,
        amount: 1500,
        currency: 'KES',
        paymentChannel: 'card',
        status: 'pending'
      });

      const t = await sequelize.transaction();
      try {
        await billingService.processConfirmedRenewal({
          invoice,
          paymentMethod: 'card',
          receiptOrTxRef: 'TX_RECEIPT_123',
          gatewayReference: 'FLW_GW_123',
          rawMetadata: { test: true },
          transaction: t
        });
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }

      expect(sendReceiptSpy).toHaveBeenCalledTimes(1);
      expect(sendReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        invoiceNumber: invoice.invoiceNumber,
        amount: 1500,
        currency: 'KES',
        paymentMethod: 'card'
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'PAYMENT_RECEIPT',
          periodKey: invoice.invoiceNumber
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
      expect(log.invoiceId).toBe(invoice.id);
    });
  });

  describe('6. CHECK C: Payment Failed Notification on Card Rejection', () => {
    it('should fire PAYMENT_FAILED ONLY on actual card webhook failure/rejection', async () => {
      const sendFailedSpy = jest.spyOn(emailService, 'sendPaymentFailedEmail').mockResolvedValue({ messageId: 'msg-failed-1' });

      const txRef = `FLW-FAIL-${Date.now()}`;
      const invoice = await SubscriptionInvoice.create({
        invoiceNumber: `INV-FAIL-${Date.now()}`,
        organizationId: org.id,
        subscriptionId: subscription.id,
        planId: starterPlan.id,
        amount: 2500,
        currency: 'KES',
        paymentChannel: 'card',
        paymentReference: txRef,
        status: 'pending'
      });

      const res = await request(app)
        .post('/api/billing/flutterwave/webhook')
        .set('verif-hash', FLW_SECRET_HASH)
        .send({
          event: 'charge.completed',
          data: {
            id: 998877,
            tx_ref: txRef,
            amount: 2500,
            currency: 'KES',
            status: 'failed' // Payment failed at card gateway!
          }
        });

      expect(res.status).toBe(400);

      expect(sendFailedSpy).toHaveBeenCalledTimes(1);
      expect(sendFailedSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        invoiceNumber: invoice.invoiceNumber,
        amount: '2500.00',
        currency: 'KES'
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'PAYMENT_FAILED',
          periodKey: invoice.invoiceNumber
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
    });
  });

  describe('7. Account Suspended Notification', () => {
    it('should dispatch ACCOUNT_SUSPENDED when subscription transitions to suspended after grace period', async () => {
      const sendSuspendedSpy = jest.spyOn(emailService, 'sendAccountSuspendedEmail').mockResolvedValue({ messageId: 'msg-susp-1' });

      const pastGraceDate = new Date(Date.now() - 10 * 24 * 3600 * 1000); // 10 days ago (past 7-day grace)

      await subscription.update({
        status: 'past_due',
        currentPeriodEnd: pastGraceDate
      });

      const result = await billingService.checkAndTransitionExpiredSubscriptions(new Date());
      expect(result.transitionedToSuspended).toBeGreaterThanOrEqual(1);

      expect(sendSuspendedSpy).toHaveBeenCalledTimes(1);
      expect(sendSuspendedSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        name: ownerUser.name
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'ACCOUNT_SUSPENDED'
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
    });
  });

  describe('8. Account Reactivated Notification', () => {
    it('should dispatch ACCOUNT_REACTIVATED when subscription is reactivated', async () => {
      const sendReactivatedSpy = jest.spyOn(emailService, 'sendAccountReactivatedEmail').mockResolvedValue({ messageId: 'msg-react-1' });

      await subscription.update({
        status: 'active',
        cancelAtPeriodEnd: true
      });

      await billingService.reactivateSubscription(org.id);

      expect(sendReactivatedSpy).toHaveBeenCalledTimes(1);
      expect(sendReactivatedSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: ownerUser.email,
        name: ownerUser.name,
        planName: starterPlan.name
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'ACCOUNT_REACTIVATED'
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('sent');
    });
  });

  describe('9. Duplicate Idempotency Guard', () => {
    it('should NOT dispatch a second email for the same (organizationId, eventType, periodKey)', async () => {
      const sendRenewalSpy = jest.spyOn(emailService, 'sendRenewalDueEmail').mockResolvedValue({ messageId: 'msg-idempotency-1' });

      const periodKey = '2026-11-20';
      await subscription.update({
        status: 'active',
        currentPeriodEnd: new Date('2026-11-20T00:00:00Z')
      });

      // First call
      const firstResult = await billingNotificationService.notifyRenewalDue({
        organizationId: org.id,
        daysRemaining: 7,
        subscription
      });
      expect(firstResult.success).toBe(true);
      expect(firstResult.skipped).toBeUndefined();
      expect(sendRenewalSpy).toHaveBeenCalledTimes(1);

      // Second identical call
      const secondResult = await billingNotificationService.notifyRenewalDue({
        organizationId: org.id,
        daysRemaining: 7,
        subscription
      });
      expect(secondResult.success).toBe(true);
      expect(secondResult.skipped).toBe(true);
      expect(secondResult.reason).toBe('ALREADY_SENT');
      expect(sendRenewalSpy).toHaveBeenCalledTimes(1); // Still 1!
    });

    it('should reject a direct duplicate write attempt at the database unique constraint level', async () => {
      const periodKey = `2026-11-dup-${Date.now()}`;

      // First direct create succeeds
      const firstEntry = await BillingNotificationLog.create({
        organizationId: org.id,
        eventType: 'RENEWAL_DUE_7D',
        periodKey,
        recipientEmail: ownerUser.email,
        status: 'sent',
        sentAt: new Date()
      });
      expect(firstEntry).toBeDefined();

      // Second write attempt with identical (organizationId, eventType, periodKey) tuple
      // MUST throw SequelizeUniqueConstraintError from MySQL
      await expect(
        BillingNotificationLog.create({
          organizationId: org.id,
          eventType: 'RENEWAL_DUE_7D',
          periodKey,
          recipientEmail: ownerUser.email,
          status: 'sent',
          sentAt: new Date()
        })
      ).rejects.toThrow();
    });
  });

  describe('10. CHECK A: Grandfathered Plan Exclusion', () => {
    it('should strictly exclude grandfathered plan subscriptions from reminder notifications', async () => {
      const sendRenewalSpy = jest.spyOn(emailService, 'sendRenewalDueEmail').mockResolvedValue({});
      const sendTrialSpy = jest.spyOn(emailService, 'sendTrialEndingEmail').mockResolvedValue({});

      try {
        // Set subscription to grandfathered plan
        await subscription.update({
          planId: grandfatheredPlan.id,
          status: 'active',
          currentPeriodEnd: new Date('2099-12-31T23:59:59Z')
        });

        // Run reminder job for arbitrary date
        await checkAndSendBillingReminders(new Date());

        // Check our test org's owner received no emails
        expect(sendRenewalSpy).not.toHaveBeenCalledWith(expect.objectContaining({ to: ownerUser.email }));
        expect(sendTrialSpy).not.toHaveBeenCalledWith(expect.objectContaining({ to: ownerUser.email }));

        // Directly attempting to call notifyRenewalDue should be rejected by Check A/B
        const directAttempt = await billingNotificationService.notifyRenewalDue({
          organizationId: org.id,
          daysRemaining: 7,
          subscription
        });

        expect(directAttempt.skipped).toBe(true);
        expect(directAttempt.reason).toBe('GRANDFATHERED_PLAN');
      } finally {
        // Reset subscription to starter plan for subsequent tests
        await subscription.update({ planId: starterPlan.id });
      }
    });
  });

  describe('11. CHECK B: Live State Re-Check at Send Time', () => {
    it('should skip TRIAL_ENDING reminder if subscription has already upgraded to active', async () => {
      const sendTrialSpy = jest.spyOn(emailService, 'sendTrialEndingEmail').mockResolvedValue({});

      // Live subscription is active, not trialing
      await subscription.update({
        status: 'active',
        trialEndsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000)
      });

      const res = await billingNotificationService.notifyTrialEnding({
        organizationId: org.id,
        daysRemaining: 5,
        subscription
      });

      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('STATUS_NOT_TRIALING:active');
      expect(sendTrialSpy).not.toHaveBeenCalled();
    });

    it('should skip RENEWAL_DUE reminder if subscription is already suspended', async () => {
      const sendRenewalSpy = jest.spyOn(emailService, 'sendRenewalDueEmail').mockResolvedValue({});

      // Live subscription is suspended
      await subscription.update({
        status: 'suspended',
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 3600 * 1000)
      });

      const res = await billingNotificationService.notifyRenewalDue({
        organizationId: org.id,
        daysRemaining: 7,
        subscription
      });

      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('STATUS_NOT_ACTIVE:suspended');
      expect(sendRenewalSpy).not.toHaveBeenCalled();
    });
  });

  describe('12. Unverified Owner Delivery', () => {
    it('should deliver notifications to owner even if emailVerifiedAt is null', async () => {
      const sendReceiptSpy = jest.spyOn(emailService, 'sendPaymentReceiptEmail').mockResolvedValue({ messageId: 'msg-unverified-1' });

      // Confirm owner is unverified
      const refreshedOwner = await User.findByPk(ownerUser.id);
      expect(refreshedOwner.emailVerifiedAt).toBeNull();

      const invoice = await SubscriptionInvoice.create({
        invoiceNumber: `INV-UNVERIFIED-${Date.now()}`,
        organizationId: org.id,
        subscriptionId: subscription.id,
        planId: starterPlan.id,
        amount: 1500,
        currency: 'KES',
        paymentChannel: 'card',
        status: 'pending'
      });

      const res = await billingNotificationService.notifyPaymentReceipt({
        organizationId: org.id,
        invoice,
        subscription,
        paymentMethod: 'card'
      });

      expect(res.success).toBe(true);
      expect(sendReceiptSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: refreshedOwner.email,
        isEmailVerified: false
      }));

      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'PAYMENT_RECEIPT',
          periodKey: invoice.invoiceNumber
        }
      });
      expect(log.status).toBe('sent');
      expect(log.recipientEmail).toBe(refreshedOwner.email);
    });

    it('should include unverified email warning banner in rendered email HTML when isEmailVerified is false', async () => {
      const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-banner-test-1' });
      emailService.setTransporter({ sendMail: mockSendMail });

      try {
        await emailService.sendPaymentReceiptEmail({
          to: ownerUser.email,
          name: ownerUser.name,
          invoiceNumber: 'INV-TEST-BANNER',
          amount: 1500,
          currency: 'KES',
          paymentMethod: 'card',
          newPeriodEnd: new Date(),
          receiptUrl: 'http://localhost/billing',
          isEmailVerified: false
        });

        expect(mockSendMail).toHaveBeenCalledTimes(1);
        const sentMailArgs = mockSendMail.mock.calls[0][0];
        expect(sentMailArgs.to).toBe(ownerUser.email);
        expect(sentMailArgs.html).toContain('Action Recommended:');
        expect(sentMailArgs.html).toContain('Your account email is not yet verified');

        // And verify that when isEmailVerified is true, banner is omitted
        mockSendMail.mockClear();
        await emailService.sendPaymentReceiptEmail({
          to: ownerUser.email,
          name: ownerUser.name,
          invoiceNumber: 'INV-TEST-BANNER-2',
          amount: 1500,
          currency: 'KES',
          paymentMethod: 'card',
          newPeriodEnd: new Date(),
          receiptUrl: 'http://localhost/billing',
          isEmailVerified: true
        });

        expect(mockSendMail).toHaveBeenCalledTimes(1);
        expect(mockSendMail.mock.calls[0][0].html).not.toContain('Your account email is not yet verified');
      } finally {
        emailService.setTransporter(null);
      }
    });
  });

  describe('13. Non-Blocking SMTP Failure Resiliency', () => {
    it('should record status=failed in BillingNotificationLog and NOT abort transaction or throw', async () => {
      jest.spyOn(emailService, 'sendPaymentReceiptEmail').mockRejectedValue(new Error('SMTP service connection timed out'));

      const invoice = await SubscriptionInvoice.create({
        invoiceNumber: `INV-SMTPFAIL-${Date.now()}`,
        organizationId: org.id,
        subscriptionId: subscription.id,
        planId: starterPlan.id,
        amount: 1500,
        currency: 'KES',
        paymentChannel: 'card',
        status: 'pending'
      });

      // Calling notify directly returns success: false with error without throwing
      const result = await billingNotificationService.notifyPaymentReceipt({
        organizationId: org.id,
        invoice,
        subscription,
        paymentMethod: 'card'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('SMTP service connection timed out');

      // Verify failure log was recorded
      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'PAYMENT_RECEIPT',
          periodKey: invoice.invoiceNumber
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('failed');
      expect(log.error).toContain('SMTP service connection timed out');
    });

    it('should allow enclosing operation (processConfirmedRenewal) to complete and commit despite email transport failure', async () => {
      jest.spyOn(emailService, 'sendPaymentReceiptEmail').mockRejectedValue(new Error('SMTP connect ECONNREFUSED 127.0.0.1:25'));

      const invoice = await SubscriptionInvoice.create({
        invoiceNumber: `INV-ENCLOSING-${Date.now()}`,
        organizationId: org.id,
        subscriptionId: subscription.id,
        planId: starterPlan.id,
        amount: 3000,
        currency: 'KES',
        paymentChannel: 'card',
        status: 'pending'
      });

      const initialPeriodEnd = subscription.currentPeriodEnd;

      const t = await sequelize.transaction();
      try {
        await billingService.processConfirmedRenewal({
          invoice,
          paymentMethod: 'card',
          receiptOrTxRef: 'TX_ENCLOSING_FAIL',
          gatewayReference: 'GW_ENCLOSING_FAIL',
          rawMetadata: { test: true },
          transaction: t
        });
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }

      // Allow afterCommit hook to finish executing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Assert enclosing operation completed successfully
      await invoice.reload();
      expect(invoice.status).toBe('paid');
      expect(invoice.paidAt).not.toBeNull();

      await subscription.reload();
      expect(subscription.status).toBe('active');
      expect(new Date(subscription.currentPeriodEnd).getTime()).toBeGreaterThan(new Date(initialPeriodEnd).getTime());

      // Assert failure log was recorded in BillingNotificationLog
      const log = await BillingNotificationLog.findOne({
        where: {
          organizationId: org.id,
          eventType: 'PAYMENT_RECEIPT',
          periodKey: invoice.invoiceNumber
        }
      });
      expect(log).not.toBeNull();
      expect(log.status).toBe('failed');
      expect(log.error).toContain('ECONNREFUSED');
    });
  });
});
