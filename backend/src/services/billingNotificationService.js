'use strict';

const { Op } = require('sequelize');
const {
  BillingNotificationLog,
  OrganizationMembership,
  Subscription,
  SubscriptionInvoice,
  Plan,
  User,
  Organization
} = require('../models');
const emailService = require('./emailService');
const { getFrontendUrl } = require('../utils/frontendUrl');
const logger = require('../utils/logger');

/**
 * Resolves the primary owner of an organization for billing communications.
 * Vital operational communications (invoices, receipts, reminders, suspensions)
 * are delivered to the organization owner even if their email is unverified.
 */
async function resolveOrgOwner(organizationId) {
  try {
    const ownerMembership = await OrganizationMembership.findOne({
      where: {
        organizationId,
        orgRole: 'owner',
        status: 'active'
      },
      include: [{ model: User }]
    });

    if (ownerMembership && ownerMembership.User) {
      return {
        userId: ownerMembership.User.id,
        email: ownerMembership.User.email,
        name: ownerMembership.User.name,
        emailVerified: Boolean(ownerMembership.User.emailVerifiedAt)
      };
    }

    // Fallback: any active user in the organization if no owner role found
    const fallbackMembership = await OrganizationMembership.findOne({
      where: {
        organizationId,
        status: 'active',
        userId: { [Op.ne]: null }
      },
      include: [{ model: User }],
      order: [['createdAt', 'ASC']]
    });

    if (fallbackMembership && fallbackMembership.User) {
      return {
        userId: fallbackMembership.User.id,
        email: fallbackMembership.User.email,
        name: fallbackMembership.User.name,
        emailVerified: Boolean(fallbackMembership.User.emailVerifiedAt)
      };
    }

    return null;
  } catch (err) {
    logger.error(`[BillingNotificationService] Error resolving owner for org ${organizationId}:`, err);
    return null;
  }
}

/**
 * Check B: Live state re-check before sending reminder notifications.
 * Validates whether the subscription is still in the expected state
 * (trialing for trial alerts, active for renewal alerts) and that
 * grandfathered plans are excluded.
 */
async function checkLiveStateForReminder(organizationId, eventType) {
  const subscription = await Subscription.findOne({
    where: { organizationId },
    include: [{ model: Plan }]
  });

  if (!subscription) {
    return { ok: false, reason: 'SUBSCRIPTION_NOT_FOUND' };
  }

  // CHECK A: Grandfathered subscriptions are immune to reminders
  if (subscription.Plan && subscription.Plan.code === 'grandfathered') {
    return { ok: false, reason: 'GRANDFATHERED_PLAN' };
  }

  const now = new Date();

  if (eventType.startsWith('TRIAL_ENDING_')) {
    if (subscription.status !== 'trialing') {
      return { ok: false, reason: `STATUS_NOT_TRIALING:${subscription.status}` };
    }
    if (!subscription.trialEndsAt) {
      return { ok: false, reason: 'NO_TRIAL_END_DATE' };
    }
    const trialEnd = new Date(subscription.trialEndsAt);
    if (trialEnd <= now) {
      return { ok: false, reason: 'TRIAL_ALREADY_EXPIRED' };
    }
    return { ok: true, subscription };
  }

  if (eventType.startsWith('RENEWAL_DUE_')) {
    if (subscription.status !== 'active') {
      return { ok: false, reason: `STATUS_NOT_ACTIVE:${subscription.status}` };
    }
    if (!subscription.currentPeriodEnd) {
      return { ok: false, reason: 'NO_PERIOD_END_DATE' };
    }
    const periodEnd = new Date(subscription.currentPeriodEnd);
    if (periodEnd <= now) {
      return { ok: false, reason: 'PERIOD_ALREADY_EXPIRED' };
    }
    return { ok: true, subscription };
  }

  return { ok: true, subscription };
}

/**
 * Helper to record or update notification log.
 */
async function recordNotification({
  organizationId,
  subscriptionId = null,
  invoiceId = null,
  eventType,
  periodKey,
  recipientEmail,
  recipientName = null,
  status,
  error = null,
  metadata = null
}) {
  try {
    const existing = await BillingNotificationLog.findOne({
      where: { organizationId, eventType, periodKey }
    });

    if (existing) {
      await existing.update({
        subscriptionId: subscriptionId || existing.subscriptionId,
        invoiceId: invoiceId || existing.invoiceId,
        recipientEmail,
        recipientName,
        status,
        error,
        metadata,
        sentAt: new Date()
      });
      return existing;
    }

    return await BillingNotificationLog.create({
      organizationId,
      subscriptionId,
      invoiceId,
      eventType,
      periodKey,
      recipientEmail,
      recipientName,
      status,
      error,
      metadata,
      sentAt: new Date()
    });
  } catch (err) {
    logger.error(`[BillingNotificationService] Failed to record log for ${eventType}:`, err);
    return null;
  }
}

const billingNotificationService = {
  resolveOrgOwner,
  checkLiveStateForReminder,

  /**
   * Notify organization owner that free trial is ending (e.g. 5d or 1d left).
   */
  async notifyTrialEnding({ organizationId, daysRemaining, subscription: passedSub = null }) {
    try {
      const eventType = daysRemaining === 1 ? 'TRIAL_ENDING_1D' : 'TRIAL_ENDING_5D';

      // Check B: Live state re-check at send time
      const liveCheck = await checkLiveStateForReminder(organizationId, eventType);
      if (!liveCheck.ok) {
        logger.info(`[BillingNotif] Skipping ${eventType} for org ${organizationId}: ${liveCheck.reason}`);
        return { success: true, skipped: true, reason: liveCheck.reason };
      }

      const subscription = liveCheck.subscription || passedSub;
      const trialEndsAt = subscription.trialEndsAt;
      const periodKey = new Date(trialEndsAt).toISOString().split('T')[0];

      // Idempotency check
      const existing = await BillingNotificationLog.findOne({
        where: { organizationId, eventType, periodKey }
      });
      if (existing && existing.status === 'sent') {
        logger.info(`[BillingNotif] Already sent ${eventType} for org ${organizationId} period ${periodKey}`);
        return { success: true, skipped: true, reason: 'ALREADY_SENT', logId: existing.id };
      }

      const owner = await resolveOrgOwner(organizationId);
      if (!owner || !owner.email) {
        logger.warn(`[BillingNotif] Cannot send ${eventType} for org ${organizationId}: No active owner email found.`);
        await recordNotification({
          organizationId,
          subscriptionId: subscription.id,
          eventType,
          periodKey,
          recipientEmail: 'none',
          status: 'skipped',
          error: 'NO_ACTIVE_OWNER'
        });
        return { success: false, skipped: true, reason: 'NO_ACTIVE_OWNER' };
      }

      const frontendUrl = getFrontendUrl();
      const upgradeUrl = `${frontendUrl}/billing`;

      try {
        await emailService.sendTrialEndingEmail({
          to: owner.email,
          name: owner.name,
          daysRemaining,
          trialEndsAt,
          upgradeUrl,
          isEmailVerified: owner.emailVerified
        });

        const log = await recordNotification({
          organizationId,
          subscriptionId: subscription.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'sent',
          metadata: { daysRemaining, trialEndsAt }
        });

        return { success: true, logId: log?.id };
      } catch (sendErr) {
        logger.error(`[BillingNotif] Failed sending ${eventType} email to ${owner.email}:`, sendErr);
        await recordNotification({
          organizationId,
          subscriptionId: subscription.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'failed',
          error: sendErr.message,
          metadata: { daysRemaining, trialEndsAt }
        });
        return { success: false, error: sendErr.message };
      }
    } catch (err) {
      logger.error(`[BillingNotif] Unexpected error in notifyTrialEnding for org ${organizationId}:`, err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Notify organization owner that subscription renewal is due (e.g. 7d or 1d left).
   */
  async notifyRenewalDue({ organizationId, daysRemaining, subscription: passedSub = null }) {
    try {
      const eventType = daysRemaining === 1 ? 'RENEWAL_DUE_1D' : 'RENEWAL_DUE_7D';

      // Check B: Live state re-check at send time
      const liveCheck = await checkLiveStateForReminder(organizationId, eventType);
      if (!liveCheck.ok) {
        logger.info(`[BillingNotif] Skipping ${eventType} for org ${organizationId}: ${liveCheck.reason}`);
        return { success: true, skipped: true, reason: liveCheck.reason };
      }

      const subscription = liveCheck.subscription || passedSub;
      const currentPeriodEnd = subscription.currentPeriodEnd;
      const periodKey = new Date(currentPeriodEnd).toISOString().split('T')[0];

      // Idempotency check
      const existing = await BillingNotificationLog.findOne({
        where: { organizationId, eventType, periodKey }
      });
      if (existing && existing.status === 'sent') {
        logger.info(`[BillingNotif] Already sent ${eventType} for org ${organizationId} period ${periodKey}`);
        return { success: true, skipped: true, reason: 'ALREADY_SENT', logId: existing.id };
      }

      const owner = await resolveOrgOwner(organizationId);
      if (!owner || !owner.email) {
        logger.warn(`[BillingNotif] Cannot send ${eventType} for org ${organizationId}: No active owner email found.`);
        await recordNotification({
          organizationId,
          subscriptionId: subscription.id,
          eventType,
          periodKey,
          recipientEmail: 'none',
          status: 'skipped',
          error: 'NO_ACTIVE_OWNER'
        });
        return { success: false, skipped: true, reason: 'NO_ACTIVE_OWNER' };
      }

      const frontendUrl = getFrontendUrl();
      const renewalUrl = `${frontendUrl}/billing`;
      const planName = subscription.Plan?.name || 'Standard';
      const amount = subscription.billingCycle === 'yearly'
        ? (subscription.Plan?.priceYearly || subscription.Plan?.priceMonthly * 10)
        : (subscription.Plan?.priceMonthly || 0);
      const currency = subscription.Plan?.currency || 'KES';

      try {
        await emailService.sendRenewalDueEmail({
          to: owner.email,
          name: owner.name,
          planName,
          amount,
          currency,
          currentPeriodEnd,
          renewalUrl,
          isEmailVerified: owner.emailVerified
        });

        const log = await recordNotification({
          organizationId,
          subscriptionId: subscription.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'sent',
          metadata: { daysRemaining, currentPeriodEnd, planName, amount, currency }
        });

        return { success: true, logId: log?.id };
      } catch (sendErr) {
        logger.error(`[BillingNotif] Failed sending ${eventType} email to ${owner.email}:`, sendErr);
        await recordNotification({
          organizationId,
          subscriptionId: subscription.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'failed',
          error: sendErr.message,
          metadata: { daysRemaining, currentPeriodEnd, planName, amount, currency }
        });
        return { success: false, error: sendErr.message };
      }
    } catch (err) {
      logger.error(`[BillingNotif] Unexpected error in notifyRenewalDue for org ${organizationId}:`, err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Notify organization owner of successful payment receipt.
   */
  async notifyPaymentReceipt({ organizationId, invoice, subscription = null, paymentMethod = 'card' }) {
    try {
      const eventType = 'PAYMENT_RECEIPT';
      const periodKey = String(invoice.invoiceNumber || invoice.id);

      // Idempotency check
      const existing = await BillingNotificationLog.findOne({
        where: { organizationId, eventType, periodKey }
      });
      if (existing && existing.status === 'sent') {
        logger.info(`[BillingNotif] Already sent ${eventType} for invoice ${periodKey}`);
        return { success: true, skipped: true, reason: 'ALREADY_SENT', logId: existing.id };
      }

      const owner = await resolveOrgOwner(organizationId);
      if (!owner || !owner.email) {
        logger.warn(`[BillingNotif] Cannot send ${eventType} for org ${organizationId}: No active owner email found.`);
        await recordNotification({
          organizationId,
          subscriptionId: subscription?.id || invoice?.subscriptionId,
          invoiceId: invoice.id,
          eventType,
          periodKey,
          recipientEmail: 'none',
          status: 'skipped',
          error: 'NO_ACTIVE_OWNER'
        });
        return { success: false, skipped: true, reason: 'NO_ACTIVE_OWNER' };
      }

      const frontendUrl = getFrontendUrl();
      const receiptUrl = `${frontendUrl}/billing`;

      try {
        await emailService.sendPaymentReceiptEmail({
          to: owner.email,
          name: owner.name,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.currency || 'KES',
          paymentMethod,
          newPeriodEnd: subscription?.currentPeriodEnd || invoice.billingPeriodEnd,
          receiptUrl,
          isEmailVerified: owner.emailVerified
        });

        const log = await recordNotification({
          organizationId,
          subscriptionId: subscription?.id || invoice?.subscriptionId,
          invoiceId: invoice.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'sent',
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            currency: invoice.currency,
            paymentMethod
          }
        });

        return { success: true, logId: log?.id };
      } catch (sendErr) {
        logger.error(`[BillingNotif] Failed sending ${eventType} email to ${owner.email}:`, sendErr);
        await recordNotification({
          organizationId,
          subscriptionId: subscription?.id || invoice?.subscriptionId,
          invoiceId: invoice.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'failed',
          error: sendErr.message,
          metadata: { invoiceNumber: invoice.invoiceNumber }
        });
        return { success: false, error: sendErr.message };
      }
    } catch (err) {
      logger.error(`[BillingNotif] Unexpected error in notifyPaymentReceipt for org ${organizationId}:`, err);
      return { success: false, error: err.message };
    }
  },

  /**
   * CHECK C: Notify organization owner of card payment webhook failure.
   * Only called on real card webhook failure rejections (not inferred from M-Pesa timeouts).
   */
  async notifyPaymentFailed({ organizationId, invoice, reason = 'Payment validation failed or rejected by provider' }) {
    try {
      const eventType = 'PAYMENT_FAILED';
      const periodKey = String(invoice.invoiceNumber || invoice.id);

      // Idempotency check
      const existing = await BillingNotificationLog.findOne({
        where: { organizationId, eventType, periodKey }
      });
      if (existing && existing.status === 'sent') {
        logger.info(`[BillingNotif] Already sent ${eventType} for invoice ${periodKey}`);
        return { success: true, skipped: true, reason: 'ALREADY_SENT', logId: existing.id };
      }

      const owner = await resolveOrgOwner(organizationId);
      if (!owner || !owner.email) {
        logger.warn(`[BillingNotif] Cannot send ${eventType} for org ${organizationId}: No active owner email found.`);
        await recordNotification({
          organizationId,
          subscriptionId: invoice?.subscriptionId,
          invoiceId: invoice.id,
          eventType,
          periodKey,
          recipientEmail: 'none',
          status: 'skipped',
          error: 'NO_ACTIVE_OWNER'
        });
        return { success: false, skipped: true, reason: 'NO_ACTIVE_OWNER' };
      }

      const frontendUrl = getFrontendUrl();
      const retryUrl = `${frontendUrl}/billing`;

      try {
        await emailService.sendPaymentFailedEmail({
          to: owner.email,
          name: owner.name,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          currency: invoice.currency || 'KES',
          reason,
          retryUrl,
          isEmailVerified: owner.emailVerified
        });

        const log = await recordNotification({
          organizationId,
          subscriptionId: invoice?.subscriptionId,
          invoiceId: invoice.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'sent',
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            currency: invoice.currency,
            reason
          }
        });

        return { success: true, logId: log?.id };
      } catch (sendErr) {
        logger.error(`[BillingNotif] Failed sending ${eventType} email to ${owner.email}:`, sendErr);
        await recordNotification({
          organizationId,
          subscriptionId: invoice?.subscriptionId,
          invoiceId: invoice.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'failed',
          error: sendErr.message,
          metadata: { invoiceNumber: invoice.invoiceNumber, reason }
        });
        return { success: false, error: sendErr.message };
      }
    } catch (err) {
      logger.error(`[BillingNotif] Unexpected error in notifyPaymentFailed for org ${organizationId}:`, err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Notify organization owner that subscription has been suspended after grace period ended.
   */
  async notifyAccountSuspended({ organizationId, subscription, gracePeriodEnd = null }) {
    try {
      const eventType = 'ACCOUNT_SUSPENDED';
      const periodKey = subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toISOString().split('T')[0]
        : (subscription?.trialEndsAt
            ? new Date(subscription.trialEndsAt).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]);

      // Idempotency check
      const existing = await BillingNotificationLog.findOne({
        where: { organizationId, eventType, periodKey }
      });
      if (existing && existing.status === 'sent') {
        logger.info(`[BillingNotif] Already sent ${eventType} for org ${organizationId} period ${periodKey}`);
        return { success: true, skipped: true, reason: 'ALREADY_SENT', logId: existing.id };
      }

      const owner = await resolveOrgOwner(organizationId);
      if (!owner || !owner.email) {
        logger.warn(`[BillingNotif] Cannot send ${eventType} for org ${organizationId}: No active owner email found.`);
        await recordNotification({
          organizationId,
          subscriptionId: subscription?.id,
          eventType,
          periodKey,
          recipientEmail: 'none',
          status: 'skipped',
          error: 'NO_ACTIVE_OWNER'
        });
        return { success: false, skipped: true, reason: 'NO_ACTIVE_OWNER' };
      }

      const frontendUrl = getFrontendUrl();
      const reactivateUrl = `${frontendUrl}/billing`;

      try {
        await emailService.sendAccountSuspendedEmail({
          to: owner.email,
          name: owner.name,
          gracePeriodEnd,
          reactivateUrl,
          isEmailVerified: owner.emailVerified
        });

        const log = await recordNotification({
          organizationId,
          subscriptionId: subscription?.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'sent',
          metadata: { gracePeriodEnd }
        });

        return { success: true, logId: log?.id };
      } catch (sendErr) {
        logger.error(`[BillingNotif] Failed sending ${eventType} email to ${owner.email}:`, sendErr);
        await recordNotification({
          organizationId,
          subscriptionId: subscription?.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'failed',
          error: sendErr.message,
          metadata: { gracePeriodEnd }
        });
        return { success: false, error: sendErr.message };
      }
    } catch (err) {
      logger.error(`[BillingNotif] Unexpected error in notifyAccountSuspended for org ${organizationId}:`, err);
      return { success: false, error: err.message };
    }
  },

  /**
   * Notify organization owner that account has been reactivated.
   */
  async notifyAccountReactivated({ organizationId, subscription }) {
    try {
      const eventType = 'ACCOUNT_REACTIVATED';
      const periodKey = subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      // Idempotency check
      const existing = await BillingNotificationLog.findOne({
        where: { organizationId, eventType, periodKey }
      });
      if (existing && existing.status === 'sent') {
        logger.info(`[BillingNotif] Already sent ${eventType} for org ${organizationId} period ${periodKey}`);
        return { success: true, skipped: true, reason: 'ALREADY_SENT', logId: existing.id };
      }

      const owner = await resolveOrgOwner(organizationId);
      if (!owner || !owner.email) {
        logger.warn(`[BillingNotif] Cannot send ${eventType} for org ${organizationId}: No active owner email found.`);
        await recordNotification({
          organizationId,
          subscriptionId: subscription?.id,
          eventType,
          periodKey,
          recipientEmail: 'none',
          status: 'skipped',
          error: 'NO_ACTIVE_OWNER'
        });
        return { success: false, skipped: true, reason: 'NO_ACTIVE_OWNER' };
      }

      let planName = subscription?.Plan?.name;
      if (!planName && subscription?.planId) {
        const p = await Plan.findByPk(subscription.planId);
        planName = p?.name;
      }

      try {
        await emailService.sendAccountReactivatedEmail({
          to: owner.email,
          name: owner.name,
          planName: planName || 'Standard',
          currentPeriodEnd: subscription?.currentPeriodEnd,
          isEmailVerified: owner.emailVerified
        });

        const log = await recordNotification({
          organizationId,
          subscriptionId: subscription?.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'sent',
          metadata: { planName, currentPeriodEnd: subscription?.currentPeriodEnd }
        });

        return { success: true, logId: log?.id };
      } catch (sendErr) {
        logger.error(`[BillingNotif] Failed sending ${eventType} email to ${owner.email}:`, sendErr);
        await recordNotification({
          organizationId,
          subscriptionId: subscription?.id,
          eventType,
          periodKey,
          recipientEmail: owner.email,
          recipientName: owner.name,
          status: 'failed',
          error: sendErr.message,
          metadata: { planName, currentPeriodEnd: subscription?.currentPeriodEnd }
        });
        return { success: false, error: sendErr.message };
      }
    } catch (err) {
      logger.error(`[BillingNotif] Unexpected error in notifyAccountReactivated for org ${organizationId}:`, err);
      return { success: false, error: err.message };
    }
  }
};

module.exports = billingNotificationService;
