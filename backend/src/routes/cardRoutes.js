const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
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

    const { paymentReference, redirectUrl } = paymentResult;

    // Enrich saleData with user context for finalization on verify
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
      // Find pending payment and update to failed
      const pendingPayment = await PendingPayment.findOne({
        where: { checkoutRequestId: reference, paymentChannel: 'card' }
      });
      if (pendingPayment && pendingPayment.status === 'pending') {
        await pendingPayment.update({ status: 'failed' });
      }
      return res.status(400).json({ error: 'Card payment verification failed or payment declined.' });
    }

    // Find pending payment
    const pendingPayment = await PendingPayment.findOne({
      where: { checkoutRequestId: reference, paymentChannel: 'card' }
    });

    if (!pendingPayment) {
      return res.status(404).json({ error: 'Pending payment record not found.' });
    }

    // Check if already processed
    if (pendingPayment.status === 'confirmed') {
      return res.json({ message: 'Payment already verified and sale created.' });
    }

    await pendingPayment.update({ status: 'confirmed' });

    let completeSale = null;
    if (pendingPayment.saleData) {
      const saleData = pendingPayment.saleData;
      saleData.paymentReference = verificationResult.gatewayRef;
      saleData.paymentProvider = 'card';
      saleData.paymentNotes = `Card payment verified. Gateway Ref: ${verificationResult.gatewayRef}`;

      const userContext = {
        id: saleData.employeeId || saleData.userId,
        isEmployee: saleData.isEmployee
      };

      completeSale = await saleController.createSaleInternal(
        saleData,
        pendingPayment.shopId,
        userContext
      );
    }

    res.json({ verified: true, sale: completeSale });
  } catch (error) {
    console.error('Card verification error:', error);
    res.status(500).json({ error: error.message || 'Failed to verify card payment.' });
  }
});

module.exports = router;
