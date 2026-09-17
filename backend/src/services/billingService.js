const { Op } = require('sequelize');
const {
  SubscriptionInvoice,
  Subscription,
  Plan,
  Organization,
  Shop,
  OrganizationMembership,
  Employee,
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
 * Validates plan availability, prevents unauthorized grandfathered selection,
 * checks downgrade resource conflicts, and reuses recent pending invoices.
 */
async function generateRenewalInvoice(organizationId, planId, billingCycle = null) {
  if (!organizationId) {
    const err = new Error('Organization ID is required to generate renewal invoice.');
    err.statusCode = 400;
    throw err;
  }

  const subscription = await Subscription.findOne({ where: { organizationId } });
  if (!subscription) {
    const err = new Error(`No subscription found for organization ${organizationId}.`);
    err.statusCode = 404;
    throw err;
  }

  const targetPlanId = planId ? parseInt(planId, 10) : subscription.planId;
  const plan = await Plan.findByPk(targetPlanId);
  if (!plan) {
    const err = new Error(`Plan with ID ${targetPlanId} not found.`);
    err.statusCode = 404;
    err.code = 'PLAN_NOT_FOUND';
    throw err;
  }

  // P1-02: Plan Security - validate plan is active and not grandfathered
  if (!plan.isActive || plan.code === 'grandfathered') {
    const err = new Error('The selected plan is not available for public subscription or renewal.');
    err.statusCode = 400;
    err.code = 'INVALID_PLAN';
    throw err;
  }

  // P1-05: Downgrade Reconciliation - check if active resources exceed target plan limits
  if (targetPlanId !== subscription.planId) {
    const activeShopsCount = await Shop.count({
      where: { organizationId, active: true }
    });

    if (plan.maxShops !== -1 && activeShopsCount > plan.maxShops) {
      const err = new Error(`Cannot switch to ${plan.name} plan: organization currently has ${activeShopsCount} active branches, but ${plan.name} allows a maximum of ${plan.maxShops}. Please deactivate excess branches before downgrading.`);
      err.statusCode = 409;
      err.code = 'PLAN_RESOURCE_CONFLICT';
      err.shops = {
        limit: plan.maxShops,
        active: activeShopsCount
      };
      err.details = {
        resource: 'shops',
        limit: plan.maxShops,
        active: activeShopsCount
      };
      throw err;
    }

    const activeMemberships = await OrganizationMembership.findAll({
      where: { organizationId, status: 'active' },
      attributes: ['userId', 'employeeId']
    });

    const memberEmployeeIds = new Set(
      activeMemberships.filter(m => m.employeeId).map(m => m.employeeId)
    );

    const orgShops = await Shop.findAll({
      where: { organizationId },
      attributes: ['id']
    });
    const shopIds = orgShops.map(s => s.id);

    let unlinkedEmployeeCount = 0;
    if (shopIds.length > 0) {
      const activeEmployees = await Employee.findAll({
        where: {
          shopId: shopIds,
          status: 'active'
        },
        attributes: ['id']
      });
      unlinkedEmployeeCount = activeEmployees.filter(e => !memberEmployeeIds.has(e.id)).length;
    }

    const activeUsersCount = activeMemberships.length + unlinkedEmployeeCount;

    if (plan.maxUsers !== -1 && activeUsersCount > plan.maxUsers) {
      const err = new Error(`Cannot switch to ${plan.name} plan: organization currently has ${activeUsersCount} active team members, but ${plan.name} allows a maximum of ${plan.maxUsers}. Please deactivate excess team members before downgrading.`);
      err.statusCode = 409;
      err.code = 'PLAN_RESOURCE_CONFLICT';
      err.users = {
        limit: plan.maxUsers,
        active: activeUsersCount
      };
      err.details = {
        resource: 'users',
        limit: plan.maxUsers,
        active: activeUsersCount
      };
      throw err;
    }
  }

  const cycle = billingCycle || subscription.billingCycle || 'monthly';
  const monthlyPrice = parseFloat(plan.priceMonthly);
  const amount = cycle === 'yearly' ? monthlyPrice * 12 : monthlyPrice;

  // Invoice Spam / Idempotency Prevention: Reuse existing pending invoice if created within the last 1 hour for same plan & cycle
  const existingPendingInvoice = await SubscriptionInvoice.findOne({
    where: {
      organizationId,
      planId: plan.id,
      status: 'pending',
      amount,
      createdAt: {
        [Op.gte]: new Date(Date.now() - 60 * 60 * 1000)
      }
    },
    order: [['createdAt', 'DESC']]
  });

  if (existingPendingInvoice) {
    return existingPendingInvoice;
  }

  // Supersede older pending invoices for different plans
  await SubscriptionInvoice.update(
    { status: 'failed' },
    {
      where: {
        organizationId,
        status: 'pending'
      }
    }
  );

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
  subscription.cancelAtPeriodEnd = false;
  subscription.lastPaymentMethod = paymentMethod;
  subscription.lastPaymentDate = now;
  await subscription.save({ transaction });

  // Ensure organization status is set to active
  await Organization.update(
    { status: 'active' },
    { where: { id: invoice.organizationId }, transaction }
  );

  const refString = gatewayReference ? ` Receipt/Ref: ${gatewayReference}.` : '';
  // Log activity
  await logBillingActivity({
    organizationId: invoice.organizationId,
    action: 'SUBSCRIPTION_RENEWAL_CONFIRMED',
    invoiceId: invoice.id,
    details: `${paymentMethod.toUpperCase()} renewal confirmed for invoice ${invoice.invoiceNumber}.${refString} Amount: ${invoice.amount} ${invoice.currency}. Period extended to ${newPeriodEnd.toISOString()}`
  }, transaction);

  return {
    invoice,
    subscription,
    newPeriodEnd
  };
}

/**
 * Scheduled check: Transitions expired trialing and active subscriptions to past_due,
 * and past_due subscriptions exceeding the 7-day grace period to suspended.
 * Grandfathered subscriptions (year 2099) are strictly immune and never affected.
 */
async function checkAndTransitionExpiredSubscriptions(asOfDate = new Date()) {
  const currentDate = new Date(asOfDate);
  const gracePeriodCutoff = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  let transitionedToPastDue = 0;
  let transitionedToSuspended = 0;

  // 1. P0-01: Find trialing subscriptions that expired (trialEndsAt < currentDate)
  const expiredTrials = await Subscription.findAll({
    where: {
      status: 'trialing',
      [Op.or]: [
        { trialEndsAt: { [Op.lt]: currentDate } },
        { currentPeriodEnd: { [Op.lt]: currentDate } }
      ]
    },
    include: [{ model: Plan, where: { code: { [Op.ne]: 'grandfathered' } } }]
  });

  for (const sub of expiredTrials) {
    const t = await sequelize.transaction();
    try {
      const trialEnd = new Date(sub.trialEndsAt || sub.currentPeriodEnd);
      const isPastGrace = trialEnd < gracePeriodCutoff;
      const targetStatus = isPastGrace ? 'suspended' : 'past_due';

      await sub.update({ status: targetStatus }, { transaction: t });
      await Organization.update(
        { status: targetStatus },
        { where: { id: sub.organizationId }, transaction: t }
      );
      await logBillingActivity({
        organizationId: sub.organizationId,
        action: isPastGrace ? 'SUBSCRIPTION_TRANSITIONED_SUSPENDED' : 'SUBSCRIPTION_TRANSITIONED_PAST_DUE',
        invoiceId: null,
        details: `Trial expired at ${trialEnd.toISOString()}. Transitioned to ${targetStatus}.`
      }, t);
      await t.commit();
      await entitlementService.invalidateOrgEntitlements(sub.organizationId);

      if (isPastGrace) {
        transitionedToSuspended++;
      } else {
        transitionedToPastDue++;
      }
    } catch (err) {
      await t.rollback();
      console.error(`Failed to transition expired trial subscription ${sub.id}:`, err);
    }
  }

  // 2. Find active subscriptions that expired (excluding grandfathered: currentPeriodEnd in 2099)
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

  // 3. Find past_due subscriptions that exceeded 7-day grace period
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

/**
 * Schedules subscription cancellation at current period end.
 */
async function cancelSubscription(organizationId, transaction = null) {
  if (!organizationId) {
    const err = new Error('Organization ID is required.');
    err.statusCode = 400;
    throw err;
  }

  const subscription = await Subscription.findOne({
    where: { organizationId },
    transaction
  });

  if (!subscription) {
    const err = new Error('Subscription not found.');
    err.statusCode = 404;
    throw err;
  }

  subscription.cancelAtPeriodEnd = true;
  await subscription.save({ transaction });

  await logBillingActivity({
    organizationId,
    action: 'SUBSCRIPTION_CANCELLATION_SCHEDULED',
    invoiceId: null,
    details: `Subscription cancellation scheduled for period end: ${subscription.currentPeriodEnd}`
  }, transaction);

  await entitlementService.invalidateOrgEntitlements(organizationId);

  return subscription;
}

/**
 * Reactivates auto-renewal for a subscription scheduled for cancellation.
 */
async function reactivateSubscription(organizationId, transaction = null) {
  if (!organizationId) {
    const err = new Error('Organization ID is required.');
    err.statusCode = 400;
    throw err;
  }

  const subscription = await Subscription.findOne({
    where: { organizationId },
    transaction
  });

  if (!subscription) {
    const err = new Error('Subscription not found.');
    err.statusCode = 404;
    throw err;
  }

  subscription.cancelAtPeriodEnd = false;
  await subscription.save({ transaction });

  await logBillingActivity({
    organizationId,
    action: 'SUBSCRIPTION_REACTIVATED',
    invoiceId: null,
    details: `Subscription auto-renewal reactivated for period end: ${subscription.currentPeriodEnd}`
  }, transaction);

  await entitlementService.invalidateOrgEntitlements(organizationId);

  return subscription;
}

module.exports = {
  generateRenewalInvoice,
  processConfirmedRenewal,
  checkAndTransitionExpiredSubscriptions,
  cancelSubscription,
  reactivateSubscription,
  logBillingActivity
};
