const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { requireOrgOwner } = require('../middleware/requireOrgOwner');
const billingService = require('../services/billingService');
const billingPaymentService = require('../services/billingPaymentService');
const entitlementService = require('../services/entitlementService');
const { SubscriptionInvoice, sequelize } = require('../models');

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
        checkoutRequestId: initiationResult.checkoutRequestId,
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
    console.error('Subscription renewal initiation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to initiate subscription renewal.' });
  }
});

/**
 * POST /api/billing/mpesa/callback
 * Safaricom Daraja STK Push Callback webhook.
 * Public endpoint called directly by Safaricom.
 */
router.post('/mpesa/callback', async (req, res) => {
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

    // Process confirmed renewal and extend subscription
    await billingService.processConfirmedRenewal({
      invoice,
      paymentMethod: 'mpesa',
      receiptOrTxRef: receiptNumber,
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
