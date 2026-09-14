const { Op } = require('sequelize');
const {
  SubscriptionInvoice,
  Subscription,
  Plan,
  Organization,
  Shop,
  sequelize
} = require('../models');
const { logActivity } = require('../middleware/logger');
const entitlementService = require('./entitlementService');

/**
 * Helper to record audit logs for billing events using the existing ActivityLog infrastructure
 */
async function logBillingActivity({ organizationId, action, invoiceId, details }, transaction = null) {
  try {
    const shop = await Shop.findOne({
      where: { organizationId, active: true },
      order: [['id', 'ASC']]
    });

    if (shop) {
      await logActivity({
        shopId: shop.id,
        performedBy: null,
        performedByType: 'system',
        action,
        entity: 'SubscriptionInvoice',
        entityId: invoiceId ? String(invoiceId) : null,
        details
      }, transaction);
    }
  } catch (err) {
    console.error('Failed to log billing activity:', err);
  }
}

/**
 * Generates a pending SubscriptionInvoice for an organization renewal or upgrade.
 * Does NOT touch the Subscription row yet (that happens upon confirmed payment).
 */
async function generateRenewalInvoice(organizationId, planId, billingCycle = null) {
  if (!organizationId) {
    throw new Error('Organization ID is required to generate renewal invoice.');
  }

  const subscription = await Subscription.findOne({ where: { organizationId } });
  if (!subscription) {
    throw new Error(`No subscription found for organization ${organizationId}.`);
  }

  const targetPlanId = planId || subscription.planId;
  const plan = await Plan.findByPk(targetPlanId);
  if (!plan) {
    throw new Error(`Plan with ID ${targetPlanId} not found.`);
  }

  const cycle = billingCycle || subscription.billingCycle || 'monthly';
  const monthlyPrice = parseFloat(plan.priceMonthly);
  const amount = cycle === 'yearly' ? monthlyPrice * 12 : monthlyPrice;

  // Established invoice numbering format: INV-SUB-{timestamp}-{organizationId}
  const invoiceNumber = `INV-SUB-${Date.now()}-${organizationId}`;

  const invoice = await SubscriptionInvoice.create({
    invoiceNumber,
    organizationId,
    subscriptionId: subscription.id,
    planId: plan.id,
    amount,
    currency: plan.currency || 'KES',
    billingPeriodStart: null,
    billingPeriodEnd: null,
    paymentChannel: 'manual', // Updated upon payment initiation (mpesa/card)
    paymentReference: null,
    gatewayReference: null,
    status: 'pending',
    paidAt: null,
    metadata: {
      billingCycle: cycle,
      planCode: plan.code
    }
  });

  return invoice;
}

/**
 * Applies confirmed payment to an invoice and extends the subscription period.
 * Must be executed within an active database transaction where SubscriptionInvoice is locked.
 */
async function processConfirmedRenewal({
  invoice,
  paymentMethod,
  receiptOrTxRef,
  gatewayReference = null,
  rawMetadata = null,
  transaction
}) {
  const subscription = await Subscription.findOne({
    where: { id: invoice.subscriptionId },
    lock: transaction.LOCK.UPDATE,
    transaction
  });

  if (!subscription) {
    throw new Error(`Subscription ${invoice.subscriptionId} not found for invoice.`);
  }

  const now = new Date();
  const isCurrentlyActive = subscription.status === 'active' && new Date(subscription.currentPeriodEnd) > now;
  const baseDate = isCurrentlyActive ? new Date(subscription.currentPeriodEnd) : now;
  const cycle = subscription.billingCycle || 'monthly';
  const daysToAdd = cycle === 'yearly' ? 365 : 30;
  const newPeriodEnd = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

  // Mark invoice as paid
  invoice.status = 'paid';
  invoice.paidAt = now;
  invoice.billingPeriodStart = isCurrentlyActive ? subscription.currentPeriodStart : now;
  invoice.billingPeriodEnd = newPeriodEnd;
  invoice.paymentReference = receiptOrTxRef || invoice.paymentReference;
  if (gatewayReference) {
    invoice.gatewayReference = gatewayReference;
  }
  invoice.metadata = {
    ...(invoice.metadata || {}),
    ...(rawMetadata || {}),
    confirmedAt: now.toISOString()
  };
  await invoice.save({ transaction });

  // Update subscription
  subscription.status = 'active';
  subscription.planId = invoice.planId;
  subscription.currentPeriodStart = isCurrentlyActive ? subscription.currentPeriodStart : now;
  subscription.currentPeriodEnd = newPeriodEnd;
  subscription.lastPaymentMethod = paymentMethod;
  subscription.lastPaymentDate = now;
  await subscription.save({ transaction });

  // Ensure organization status is set to active
  await Organization.update(
    { status: 'active' },
    { where: { id: invoice.organizationId }, transaction }
  );

  // Log activity
  await logBillingActivity({
    organizationId: invoice.organizationId,
    action: 'SUBSCRIPTION_RENEWAL_CONFIRMED',
    invoiceId: invoice.id,
    details: `${paymentMethod.toUpperCase()} renewal confirmed for invoice ${invoice.invoiceNumber}. Amount: ${invoice.amount} ${invoice.currency}. Period extended to ${newPeriodEnd.toISOString()}`
  }, transaction);

  return {
    invoice,
    subscription,
    newPeriodEnd
  };
}

/**
 * Scheduled check: Transitions expired active subscriptions to past_due,
 * and past_due subscriptions exceeding the 7-day grace period to suspended.
 * Grandfathered subscriptions (year 2099) are strictly immune and never affected.
 */
async function checkAndTransitionExpiredSubscriptions(asOfDate = new Date()) {
  const currentDate = new Date(asOfDate);
  const gracePeriodCutoff = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  let transitionedToPastDue = 0;
  let transitionedToSuspended = 0;

  // 1. Find active subscriptions that expired (excluding grandfathered: currentPeriodEnd in 2099)
  const expiredActiveSubscriptions = await Subscription.findAll({
    where: {
      status: 'active',
      currentPeriodEnd: {
        [Op.lt]: currentDate,
        // Strict guard: grandfathered ends in 2099, ensure we never touch dates > year 2090
        [Op.lte]: new Date('2090-01-01')
      }
    },
    include: [{ model: Plan, where: { code: { [Op.ne]: 'grandfathered' } } }]
  });

  for (const sub of expiredActiveSubscriptions) {
    const t = await sequelize.transaction();
    try {
      await sub.update({ status: 'past_due' }, { transaction: t });
      await Organization.update(
        { status: 'past_due' },
        { where: { id: sub.organizationId }, transaction: t }
      );
      await logBillingActivity({
        organizationId: sub.organizationId,
        action: 'SUBSCRIPTION_TRANSITIONED_PAST_DUE',
        invoiceId: null,
        details: `Subscription transitioned to past_due as period ended at ${sub.currentPeriodEnd}`
      }, t);
      await t.commit();
      await entitlementService.invalidateOrgEntitlements(sub.organizationId);
      transitionedToPastDue++;
    } catch (err) {
      await t.rollback();
      console.error(`Failed to transition subscription ${sub.id} to past_due:`, err);
    }
  }

  // 2. Find past_due subscriptions that exceeded 7-day grace period
  const expiredGraceSubscriptions = await Subscription.findAll({
    where: {
      status: 'past_due',
      currentPeriodEnd: {
        [Op.lt]: gracePeriodCutoff,
        [Op.lte]: new Date('2090-01-01')
      }
    },
    include: [{ model: Plan, where: { code: { [Op.ne]: 'grandfathered' } } }]
  });

  for (const sub of expiredGraceSubscriptions) {
    const t = await sequelize.transaction();
    try {
      await sub.update({ status: 'suspended' }, { transaction: t });
      await Organization.update(
        { status: 'suspended' },
        { where: { id: sub.organizationId }, transaction: t }
      );
      await logBillingActivity({
        organizationId: sub.organizationId,
        action: 'SUBSCRIPTION_TRANSITIONED_SUSPENDED',
        invoiceId: null,
        details: `Subscription transitioned to suspended as grace period ended for period expiry ${sub.currentPeriodEnd}`
      }, t);
      await t.commit();
      await entitlementService.invalidateOrgEntitlements(sub.organizationId);
      transitionedToSuspended++;
    } catch (err) {
      await t.rollback();
      console.error(`Failed to transition subscription ${sub.id} to suspended:`, err);
    }
  }

  return {
    transitionedToPastDue,
    transitionedToSuspended
  };
}

module.exports = {
  generateRenewalInvoice,
  processConfirmedRenewal,
  checkAndTransitionExpiredSubscriptions,
  logBillingActivity
};
