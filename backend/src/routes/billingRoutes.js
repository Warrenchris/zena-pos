const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { auth } = require('../middleware/auth');
const { requireOrgOwner } = require('../middleware/requireOrgOwner');
const billingService = require('../services/billingService');
const billingPaymentService = require('../services/billingPaymentService');
const entitlementService = require('../services/entitlementService');
const {
  Plan,
  Subscription,
  SubscriptionInvoice,
  Shop,
  OrganizationMembership,
  Employee,
  sequelize
} = require('../models');

/**
 * GET /api/billing/plans
 * Public endpoint returning all active public billing plans.
 * Excludes internal/hidden 'grandfathered' tier.
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.findAll({
      where: {
        isActive: true,
        code: { [Op.ne]: 'grandfathered' }
      },
      attributes: [
        'id',
        'name',
        'code',
        'priceMonthly',
        'currency',
        'maxShops',
        'maxUsers',
        'features'
      ],
      order: [['priceMonthly', 'ASC'], ['id', 'ASC']]
    });

    return res.status(200).json({ plans });
  } catch (error) {
    console.error('Error fetching billing plans:', error);
    return res.status(500).json({ error: 'Failed to fetch billing plans.' });
  }
});

/**
 * GET /api/billing/subscription
 * Returns the calling user's organization's active subscription, current plan details,
 * and current quota consumption (active shops and active members).
 * Access: Authenticated active organization member.
 */
router.get('/subscription', auth, async (req, res) => {
  try {
    let orgId = req.organizationId ? parseInt(req.organizationId, 10) : (req.user?.organizationId ? parseInt(req.user.organizationId, 10) : null);
    if (!orgId && req.user?.shopId) {
      const callerShop = await Shop.findByPk(req.user.shopId, { attributes: ['organizationId'] });
      orgId = callerShop?.organizationId || null;
    }

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    // Verify caller belongs to this organization
    const membershipWhere = {
      organizationId: orgId,
      status: 'active'
    };
    if (req.user?.isEmployee) {
      membershipWhere.employeeId = req.user.id;
    } else {
      membershipWhere.userId = req.user?.id;
    }

    const membership = await OrganizationMembership.findOne({ where: membershipWhere });
    if (!membership) {
      let hasShopAccess = false;
      if (req.shopId) {
        const callerShop = await Shop.findOne({ where: { id: req.shopId, organizationId: orgId } });
        if (callerShop) hasShopAccess = true;
      }
      if (!hasShopAccess) {
        return res.status(403).json({ error: 'Access denied: user does not belong to this organization.' });
      }
    }

    const subscription = await Subscription.findOne({
      where: { organizationId: orgId },
      include: [{
        model: Plan,
        attributes: [
          'id',
          'name',
          'code',
          'priceMonthly',
          'currency',
          'maxShops',
          'maxUsers',
          'features',
          'isActive'
        ]
      }]
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found for this organization.' });
    }

    // Days remaining in trial computation
    let daysRemainingInTrial = null;
    if (subscription.status === 'trialing' && subscription.trialEndsAt) {
      const now = new Date();
      const diffMs = new Date(subscription.trialEndsAt).getTime() - now.getTime();
      daysRemainingInTrial = diffMs > 0 ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0;
    }

    // Exact count of active shops (same query as shopController.js:createShop)
    const currentActiveShopCount = await Shop.count({
      where: { organizationId: orgId, active: true }
    });

    // Exact count of active members (same logic as employeeController.js:createEmployee)
    const activeMemberships = await OrganizationMembership.findAll({
      where: { organizationId: orgId, status: 'active' },
      attributes: ['userId', 'employeeId']
    });

    const memberEmployeeIds = new Set(
      activeMemberships.filter(m => m.employeeId).map(m => m.employeeId)
    );

    const orgShops = await Shop.findAll({
      where: { organizationId: orgId },
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

    const currentActiveMemberCount = activeMemberships.length + unlinkedEmployeeCount;

    const plan = subscription.Plan;
    const isUnlimitedShops = plan.maxShops === -1;
    const isUnlimitedUsers = plan.maxUsers === -1;
    const isUnlimited = isUnlimitedShops && isUnlimitedUsers;

    return res.status(200).json({
      subscription: {
        id: subscription.id,
        organizationId: subscription.organizationId,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        lastPaymentMethod: subscription.lastPaymentMethod,
        lastPaymentDate: subscription.lastPaymentDate,
        daysRemainingInTrial,
        plan: {
          id: plan.id,
          name: plan.name,
          code: plan.code,
          priceMonthly: plan.priceMonthly,
          currency: plan.currency,
          maxShops: plan.maxShops,
          maxUsers: plan.maxUsers,
          features: plan.features,
          isUnlimited
        }
      },
      quotas: {
        shops: {
          current: currentActiveShopCount,
          limit: plan.maxShops,
          isUnlimited: isUnlimitedShops
        },
        users: {
          current: currentActiveMemberCount,
          limit: plan.maxUsers,
          isUnlimited: isUnlimitedUsers
        }
      }
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription details.' });
  }
});

/**
 * GET /api/billing/invoices
 * Returns paginated list of subscription renewal invoices for the calling organization.
 * Access: Organization Owner ONLY.
 */
router.get('/invoices', auth, requireOrgOwner, async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: invoices } = await SubscriptionInvoice.findAndCountAll({
      where: { organizationId },
      attributes: [
        'id',
        'invoiceNumber',
        'amount',
        'currency',
        'status',
        'paymentChannel',
        'paidAt',
        'createdAt'
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    return res.status(200).json({
      invoices,
      total: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching subscription invoices:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription invoices.' });
  }
});

/**
 * POST /api/billing/subscription/renew
 * Initiates subscription renewal via M-Pesa STK Push or Flutterwave Card Checkout.
 * Access Control: Organization Owner ONLY.
 */
router.post('/subscription/renew', auth, requireOrgOwner, async (req, res) => {
  try {
    const { channel, phone, planId } = req.body;
    const organizationId = req.organizationId;

    if (!channel || !['mpesa', 'card'].includes(channel)) {
      return res.status(400).json({ error: 'Valid payment channel ("mpesa" or "card") is required.' });
    }

    if (channel === 'mpesa' && !phone) {
      return res.status(400).json({ error: 'Phone number is required for M-Pesa renewal.' });
    }

    // Generate pending invoice for this renewal
    const invoice = await billingService.generateRenewalInvoice(organizationId, planId);

    if (channel === 'mpesa') {
      const initiationResult = await billingPaymentService.initiateMpesaRenewal({
        phone,
        invoice,
        organizationId
      });

      return res.status(200).json({
        success: true,
        channel: 'mpesa',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        currency: invoice.currency,
        customerMessage: initiationResult.customerMessage
      });
    } else {
      const initiationResult = await billingPaymentService.initiateCardRenewal({
        invoice,
        userEmail: req.user?.email,
        userName: req.user?.name
      });

      return res.status(200).json({
        success: true,
        channel: 'card',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        currency: invoice.currency,
        paymentReference: initiationResult.paymentReference,
        redirectUrl: initiationResult.redirectUrl
      });
    }
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.details ? error.details : {})
      });
    }
    console.error('Subscription renewal initiation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate subscription renewal.' });
  }
});

/**
 * POST /api/billing/subscription/cancel
 * Schedules subscription cancellation at period end.
 * Access Control: Organization Owner ONLY.
 */
router.post('/subscription/cancel', auth, requireOrgOwner, async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const subscription = await billingService.cancelSubscription(organizationId);
    return res.status(200).json({
      message: 'Subscription will cancel at the end of the current billing period.',
      subscription
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error canceling subscription:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

/**
 * POST /api/billing/subscription/reactivate
 * Reactivates a subscription pending cancellation.
 * Access Control: Organization Owner ONLY.
 */
router.post('/subscription/reactivate', auth, requireOrgOwner, async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const subscription = await billingService.reactivateSubscription(organizationId);
    return res.status(200).json({
      message: 'Subscription successfully reactivated.',
      subscription
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error reactivating subscription:', error);
    return res.status(500).json({ error: 'Failed to reactivate subscription.' });
  }
});

/**
 * POST /api/billing/mpesa/callback
 * Safaricom Daraja STK Push Callback webhook.
 * Public endpoint called directly by Safaricom with single-use query token.
 */
router.post('/mpesa/callback', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized callback: missing verification token.' });
  }

  const stkCallback = req.body?.Body?.stkCallback;
  if (!stkCallback) {
    return res.status(400).json({ error: 'Invalid Safaricom callback payload structure.' });
  }

  const checkoutRequestId = stkCallback.CheckoutRequestID;
  const resultCode = stkCallback.ResultCode;
  const resultDesc = stkCallback.ResultDesc;

  if (!checkoutRequestId) {
    return res.status(400).json({ error: 'Missing CheckoutRequestID in callback payload.' });
  }

  const t = await sequelize.transaction();
  try {
    // Look up invoice strictly by CheckoutRequestID saved in paymentReference with pessimistic row lock
    const invoice = await SubscriptionInvoice.findOne({
      where: { paymentReference: checkoutRequestId },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Subscription invoice not found for this CheckoutRequestID.' });
    }

    // Authenticate callback: verification token must match single-use token stored in invoice metadata
    const expectedToken = invoice.metadata?.callbackToken;
    if (!expectedToken || token !== expectedToken) {
      await t.rollback();
      console.warn(`[SECURITY ALERT] Invalid M-Pesa verification token for invoice ${invoice.invoiceNumber}. Provided: ${token}`);
      return res.status(401).json({ error: 'Unauthorized callback: invalid verification token.' });
    }

    // Idempotency check: Already confirmed invoices must NOT extend the period twice
    if (invoice.status === 'paid') {
      await billingService.logBillingActivity({
        organizationId: invoice.organizationId,
        action: 'SUBSCRIPTION_WEBHOOK_IDEMPOTENT_NOOP',
        invoiceId: invoice.id,
        details: `Duplicate M-Pesa callback received for already confirmed invoice ${invoice.invoiceNumber}. No changes made.`
      }, t);
      await t.commit();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Callback already processed.' });
    }

    // Handle payment failure or user cancellation
    if (resultCode !== 0) {
      invoice.status = 'failed';
      invoice.metadata = {
        ...(invoice.metadata || {}),
        callback: req.body,
        resultCode,
        resultDesc
      };
      await invoice.save({ transaction: t });

      await billingService.logBillingActivity({
        organizationId: invoice.organizationId,
        action: 'SUBSCRIPTION_PAYMENT_FAILED',
        invoiceId: invoice.id,
        details: `M-Pesa payment failed or was cancelled. ResultCode: ${resultCode}, Desc: ${resultDesc}`
      }, t);

      await t.commit();
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Payment failure recorded.' });
    }

    // Handle payment success (resultCode === 0): Assert amount & extract receipt
    const items = stkCallback.CallbackMetadata?.Item || [];
    const amountItem = items.find(i => i.Name === 'Amount');
    const receiptItem = items.find(i => i.Name === 'MpesaReceiptNumber');

    const paidAmount = amountItem ? Number(amountItem.Value) : 0;
    const receiptNumber = receiptItem ? String(receiptItem.Value) : '';

    if (paidAmount < Number(invoice.amount)) {
      invoice.status = 'failed';
      invoice.metadata = {
        ...(invoice.metadata || {}),
        callback: req.body,
        error: 'Amount mismatch',
        paidAmount,
        expectedAmount: invoice.amount
      };
      await invoice.save({ transaction: t });

      await billingService.logBillingActivity({
        organizationId: invoice.organizationId,
        action: 'SUBSCRIPTION_PAYMENT_AMOUNT_MISMATCH',
        invoiceId: invoice.id,
        details: `M-Pesa callback rejected: Paid amount ${paidAmount} is less than required invoice amount ${invoice.amount}.`
      }, t);

      await t.commit();
      return res.status(400).json({ error: 'Paid amount does not match invoice amount.' });
    }

    // In production / non-test environments, perform secondary status query check if credentials are configured
    if (process.env.NODE_ENV !== 'test' && process.env.MPESA_CONSUMER_KEY) {
      try {
        const queryStatus = await billingPaymentService.queryMpesaStkPushStatus({ checkoutRequestId });
        if (queryStatus && queryStatus.ResultCode && String(queryStatus.ResultCode) !== '0') {
          invoice.status = 'failed';
          await invoice.save({ transaction: t });
          await t.commit();
          return res.status(400).json({ error: 'M-Pesa status query indicated unsuccessful payment.' });
        }
      } catch (queryErr) {
        console.warn('Daraja status query verification warning:', queryErr.message);
      }
    }

    // Process confirmed renewal and extend subscription
    await billingService.processConfirmedRenewal({
      invoice,
      paymentMethod: 'mpesa',
      receiptOrTxRef: checkoutRequestId,
      gatewayReference: receiptNumber,
      rawMetadata: req.body,
      transaction: t
    });

    await t.commit();

    // Invalidate Redis entitlement cache after successful commit
    await entitlementService.invalidateOrgEntitlements(invoice.organizationId);

    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    await t.rollback();
    console.error('M-Pesa callback processing transaction error:', err);
    return res.status(500).json({ error: 'Internal callback processing error.' });
  }
});

/**
 * POST /api/billing/flutterwave/webhook
 * Flutterwave Card Webhook handler.
 * Public endpoint called directly by Flutterwave.
 */
router.post('/flutterwave/webhook', async (req, res) => {
  // 1. Webhook Signature Verification BEFORE touching database
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature = req.headers['verif-hash'];

  if (!secretHash || !signature || signature !== secretHash) {
    return res.status(401).json({ error: 'Invalid or missing Flutterwave webhook signature header.' });
  }

  const data = req.body?.data;
  const txRef = data?.tx_ref;

  if (!txRef) {
    return res.status(400).json({ error: 'Missing tx_ref in webhook payload.' });
  }

  const t = await sequelize.transaction();
  try {
    // Look up invoice strictly by tx_ref saved in paymentReference with pessimistic row lock
    const invoice = await SubscriptionInvoice.findOne({
      where: { paymentReference: txRef },
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    if (!invoice) {
      await t.rollback();
      return res.status(404).json({ error: 'Subscription invoice not found for this tx_ref.' });
    }

    // Idempotency check: Already confirmed invoices must NOT extend the period twice
    if (invoice.status === 'paid') {
      await billingService.logBillingActivity({
        organizationId: invoice.organizationId,
        action: 'SUBSCRIPTION_WEBHOOK_IDEMPOTENT_NOOP',
        invoiceId: invoice.id,
        details: `Duplicate Flutterwave webhook received for already confirmed invoice ${invoice.invoiceNumber}. No changes made.`
      }, t);
      await t.commit();
      return res.status(200).json({ message: 'Invoice already processed.' });
    }

    // Assert status, amount, and currency
    const isSuccessful = data.status === 'successful';
    const isAmountValid = Number(data.amount) >= Number(invoice.amount);
    const isCurrencyValid = !data.currency || data.currency.toUpperCase() === invoice.currency.toUpperCase();

    if (!isSuccessful || !isAmountValid || !isCurrencyValid) {
      invoice.status = 'failed';
      invoice.metadata = {
        ...(invoice.metadata || {}),
        webhook: req.body,
        error: 'Validation failed',
        isSuccessful,
        isAmountValid,
        isCurrencyValid
      };
      await invoice.save({ transaction: t });

      await billingService.logBillingActivity({
        organizationId: invoice.organizationId,
        action: 'SUBSCRIPTION_PAYMENT_REJECTED',
        invoiceId: invoice.id,
        details: `Card webhook rejected: status=${data.status}, amount=${data.amount} (expected >= ${invoice.amount}), currency=${data.currency}`
      }, t);

      await t.commit();
      return res.status(400).json({ error: 'Payment validation failed or payment unsuccessful.' });
    }

    // Process confirmed renewal and extend subscription
    await billingService.processConfirmedRenewal({
      invoice,
      paymentMethod: 'card',
      receiptOrTxRef: txRef,
      gatewayReference: String(data.id || ''),
      rawMetadata: req.body,
      transaction: t
    });

    await t.commit();

    // Invalidate Redis entitlement cache after successful commit
    await entitlementService.invalidateOrgEntitlements(invoice.organizationId);

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    await t.rollback();
    console.error('Flutterwave webhook processing transaction error:', err);
    return res.status(500).json({ error: 'Internal webhook processing error.' });
  }
});

module.exports = router;
