const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const sequelize = require('../config/database');
const cardPaymentService = require('../services/cardPaymentService');
const { PendingPayment, Shop, Organization } = require('../models');
const saleController = require('../controllers/saleController');
const logger = require('../utils/logger');

/**
 * Safely parse any monetary amount (string, number, decimal) into exact integer minor units (cents).
 * Avoids binary floating-point representation and precision issues.
 * Returns BigInt cents or null if invalid format.
 */
function parseCents(amount) {
  if (amount === undefined || amount === null || amount === '') return null;
  let str;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount < 0) return null;
    str = amount.toFixed(2);
  } else {
    str = String(amount).trim();
  }
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return null;
  const [intPart, fracPart = ''] = str.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(paddedFrac);
}

// POST /api/card/initiate (authenticated)
router.post('/initiate', auth, async (req, res) => {
  try {
    const { amount, currency, customerEmail, customerName, orderId, saleData } = req.body;
    const shopId = req.shopId || req.user.shopId;
    const callerOrgId = req.organizationId || req.user?.organizationId;

    if (!amount || !orderId) {
      return res.status(400).json({ error: 'Amount and order ID are required.' });
    }

    const cents = parseCents(amount);
    if (cents === null || cents <= 0n) {
      return res.status(400).json({ error: 'Amount must be a valid positive monetary number.' });
    }

    const shop = await Shop.findByPk(shopId, {
      include: [{ model: Organization, attributes: ['id', 'currency'] }]
    });

    if (!shop) {
      return res.status(404).json({ error: 'Shop not found.' });
    }

    if (callerOrgId && shop.organizationId !== callerOrgId) {
      return res.status(403).json({ error: 'Access denied: shop does not belong to your organization.' });
    }

    const resolvedCurrency = (currency || saleData?.currency || shop.Organization?.currency || 'KES').toUpperCase();

    // Call chosen gateway (Flutterwave)
    const paymentResult = await cardPaymentService.initiateCardPayment({
      amount,
      currency: resolvedCurrency,
      customerEmail,
      customerName,
      orderId,
      shopId
    });

    const paymentReference = paymentResult.paymentReference;
    const redirectUrl = paymentResult.redirectUrl;

    // Enrich saleData with user context and authoritative currency
    const enrichedSaleData = {
      ...saleData,
      currency: resolvedCurrency,
      organizationId: shop.organizationId,
      paymentMethod: 'card',
      paymentAmount: parseFloat(amount),
      userId: !req.user.isEmployee ? req.user.id : null,
      employeeId: req.user.isEmployee ? req.user.id : null,
      isEmployee: req.user.isEmployee,
    };

    // Store a pending payment record
    await PendingPayment.create({
      checkoutRequestId: paymentReference,
      orderId,
      shopId,
      amount,
      status: 'pending',
      paymentChannel: 'card',
      saleData: enrichedSaleData
    });

    res.json({ paymentReference, redirectUrl });
  } catch (error) {
    logger.error('Card payment initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate card payment.' });
  }
});

// POST /api/card/verify (authenticated)
router.post('/verify', auth, async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference || typeof reference !== 'string' || !reference.trim()) {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    const cleanRef = reference.trim();
    const callerShopId = req.shopId || req.user?.shopId;
    const callerOrgId = req.organizationId || req.user?.organizationId;

    // 1. Pre-lookup pending payment to enforce tenant isolation and fast-path state checks
    const pendingPayment = await PendingPayment.findOne({
      where: { checkoutRequestId: cleanRef, paymentChannel: 'card' },
      include: [{
        model: Shop,
        attributes: ['id', 'organizationId'],
        include: [{
          model: Organization,
          attributes: ['id', 'currency']
        }]
      }]
    });

    if (!pendingPayment) {
      return res.status(404).json({ error: 'Pending payment record not found.' });
    }

    // Tenant isolation: caller's organization must match pending payment shop's organization
    if (callerOrgId && pendingPayment.Shop?.organizationId && pendingPayment.Shop.organizationId !== callerOrgId) {
      return res.status(403).json({ error: 'Access denied: payment belongs to another organization.' });
    }

    // Shop isolation: if caller is scoped to a shop, verify payment belongs to that shop
    if (callerShopId && pendingPayment.shopId !== callerShopId) {
      return res.status(403).json({ error: 'Access denied: payment belongs to another shop.' });
    }

    // Fast-path idempotency: already confirmed payments return 200 without calling external gateway
    if (pendingPayment.status === 'confirmed') {
      return res.status(200).json({
        verified: true,
        message: 'Payment already verified and sale created.'
      });
    }

    // Terminal state: already failed payments are rejected immediately
    if (pendingPayment.status === 'failed') {
      return res.status(400).json({ error: 'Payment already failed.' });
    }

    // 2. Call external gateway verification (performed outside database transaction)
    const verificationResult = await cardPaymentService.verifyPayment(cleanRef);

    let completeSale = null;
    let alreadyConfirmed = false;

    // 3. Pessimistic row-locked database settlement
    await sequelize.transaction(async (t) => {
      const lockedPending = await PendingPayment.findOne({
        where: { id: pendingPayment.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [{
          model: Shop,
          attributes: ['id', 'organizationId'],
          include: [{
            model: Organization,
            attributes: ['id', 'currency']
          }]
        }]
      });

      if (!lockedPending) {
        const err = new Error('Pending payment record not found.');
        err.statusCode = 404;
        throw err;
      }

      // Concurrency check under exclusive row lock: Did another request settle this payment?
      if (lockedPending.status === 'confirmed') {
        alreadyConfirmed = true;
        return;
      }

      if (lockedPending.status === 'failed') {
        const err = new Error('Payment already failed.');
        err.statusCode = 400;
        throw err;
      }

      // Check external gateway verification success
      if (!verificationResult || !verificationResult.verified) {
        await lockedPending.update({ status: 'failed' }, { transaction: t });
        const err = new Error('Card payment verification failed or payment declined.');
        err.statusCode = 400;
        throw err;
      }

      // FIN-01: Deterministic Monetary Amount Validation (exact cents comparison)
      const expectedCents = parseCents(lockedPending.amount);
      const gatewayCents = parseCents(verificationResult.amount);

      if (expectedCents === null || gatewayCents === null || gatewayCents !== expectedCents) {
        logger.warn(`[FIN-01 SECURITY ALERT] Card payment amount mismatch for ref ${cleanRef}. Expected: ${lockedPending.amount} (${expectedCents} cents), Gateway: ${verificationResult.amount} (${gatewayCents} cents)`);
        await lockedPending.update({
          status: 'failed',
          saleData: {
            ...(lockedPending.saleData || {}),
            verificationFailure: {
              reason: 'AMOUNT_MISMATCH',
              expectedAmount: lockedPending.amount,
              gatewayAmount: verificationResult.amount
            }
          }
        }, { transaction: t });
        const err = new Error('Payment amount mismatch: verified amount does not match expected payment amount.');
        err.statusCode = 400;
        throw err;
      }

      // FIN-01: Currency Validation
      const expectedCurrency = (
        lockedPending.saleData?.currency ||
        lockedPending.Shop?.Organization?.currency ||
        'KES'
      ).toUpperCase();
      const gatewayCurrency = String(verificationResult.currency || '').toUpperCase();

      if (!gatewayCurrency || gatewayCurrency !== expectedCurrency) {
        logger.warn(`[FIN-01 SECURITY ALERT] Card payment currency mismatch for ref ${cleanRef}. Expected: ${expectedCurrency}, Gateway: ${gatewayCurrency}`);
        await lockedPending.update({
          status: 'failed',
          saleData: {
            ...(lockedPending.saleData || {}),
            verificationFailure: {
              reason: 'CURRENCY_MISMATCH',
              expectedCurrency,
              gatewayCurrency
            }
          }
        }, { transaction: t });
        const err = new Error('Payment currency mismatch: verified currency does not match expected payment currency.');
        err.statusCode = 400;
        throw err;
      }

      // Settle sale and update inventory atomically
      const saleData = lockedPending.saleData || {};
      saleData.paymentReference = verificationResult.gatewayRef || cleanRef;
      saleData.paymentProvider = 'card';
      saleData.paymentNotes = `Card payment verified. Gateway Ref: ${verificationResult.gatewayRef || cleanRef}`;

      if (saleData && Array.isArray(saleData.items) && saleData.items.length > 0) {
        const userContext = {
          id: saleData.employeeId || saleData.userId,
          isEmployee: saleData.isEmployee
        };

        completeSale = await saleController.createSaleInternal(
          saleData,
          lockedPending.shopId,
          userContext,
          null,
          t
        );
      }

      await lockedPending.update({
        status: 'confirmed',
        saleData
      }, { transaction: t });
    });

    if (alreadyConfirmed) {
      return res.status(200).json({
        verified: true,
        message: 'Payment already verified and sale created.'
      });
    }

    res.json({ verified: true, sale: completeSale });
  } catch (error) {
    logger.error('Card verification error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message || 'Failed to verify card payment.' });
  }
});

module.exports = router;

