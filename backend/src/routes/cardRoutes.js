const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const sequelize = require('../config/database');
const cardPaymentService = require('../services/cardPaymentService');
const { PendingPayment } = require('../models');
const saleController = require('../controllers/saleController');

// POST /api/card/initiate (authenticated)
router.post('/initiate', auth, async (req, res) => {
  try {
    const { amount, currency, customerEmail, customerName, orderId, saleData } = req.body;
    const shopId = req.shopId || req.user.shopId;

    if (!amount || !orderId) {
      return res.status(400).json({ error: 'Amount and order ID are required.' });
    }

    // Call chosen gateway (Flutterwave)
    const paymentResult = await cardPaymentService.initiateCardPayment({
      amount,
      currency,
      customerEmail,
      customerName,
      orderId,
      shopId
    });

    const paymentReference = paymentResult.paymentReference;
    const redirectUrl = paymentResult.redirectUrl;

    // Enrich saleData with user context
    const enrichedSaleData = {
      ...saleData,
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
    console.error('Card payment initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate card payment.' });
  }
});

// POST /api/card/verify (authenticated)
router.post('/verify', auth, async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    const verificationResult = await cardPaymentService.verifyPayment(reference);

    if (!verificationResult.verified) {
      // Find pending payment and update to failed under lock
      await sequelize.transaction(async (t) => {
        const pendingPayment = await PendingPayment.findOne({
          where: { checkoutRequestId: reference, paymentChannel: 'card', shopId: req.shopId || req.user?.shopId },
          lock: t.LOCK.UPDATE,
          transaction: t
        });
        if (pendingPayment && pendingPayment.status === 'pending') {
          await pendingPayment.update({ status: 'failed' }, { transaction: t });
        }
      });
      return res.status(400).json({ error: 'Card payment verification failed or payment declined.' });
    }

    let completeSale = null;
    let alreadyConfirmed = false;

    await sequelize.transaction(async (t) => {
      // Find pending payment under exclusive row lock
      const pendingPayment = await PendingPayment.findOne({
        where: { checkoutRequestId: reference, paymentChannel: 'card', shopId: req.shopId || req.user?.shopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!pendingPayment) {
        const err = new Error('Pending payment record not found.');
        err.statusCode = 404;
        throw err;
      }

      // Check if already processed (Idempotency under lock)
      if (pendingPayment.status === 'confirmed') {
        alreadyConfirmed = true;
        return;
      }

      if (pendingPayment.status === 'failed') {
        const err = new Error('Payment already failed.');
        err.statusCode = 400;
        throw err;
      }

      const saleData = pendingPayment.saleData || {};
      saleData.paymentReference = verificationResult.gatewayRef;
      saleData.paymentProvider = 'card';
      saleData.paymentNotes = `Card payment verified. Gateway Ref: ${verificationResult.gatewayRef}`;

      if (saleData && Array.isArray(saleData.items) && saleData.items.length > 0) {
        const userContext = {
          id: saleData.employeeId || saleData.userId,
          isEmployee: saleData.isEmployee
        };

        completeSale = await saleController.createSaleInternal(
          saleData,
          pendingPayment.shopId,
          userContext,
          null,
          t
        );
      }

      await pendingPayment.update({ 
        status: 'confirmed',
        saleData
      }, { transaction: t });
    });

    if (alreadyConfirmed) {
      return res.json({ message: 'Payment already verified and sale created.' });
    }

    res.json({ verified: true, sale: completeSale });
  } catch (error) {
    console.error('Card verification error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ error: error.message || 'Failed to verify card payment.' });
  }
});

module.exports = router;
