const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const mpesaService = require('../services/mpesaService');
const { PendingPayment, Sale } = require('../models');
const saleController = require('../controllers/saleController');

// POST /api/mpesa/initiate (authenticated)
router.post('/initiate', auth, async (req, res) => {
  try {
    const { phone, amount, orderId, saleData } = req.body;
    const shopId = req.shopId || req.user.shopId;

    if (!phone || !amount || !orderId) {
      return res.status(400).json({ error: 'Phone number, amount, and order ID are required.' });
    }

    // Call Daraja API to get CheckoutRequestID
    const checkoutRequestId = await mpesaService.initiateStkPush({
      phone,
      amount,
      orderId,
      shopId
    });

    // Enrich saleData with user context for finalization on callback
    const enrichedSaleData = {
      ...saleData,
      paymentMethod: 'mobile',
      paymentAmount: parseFloat(amount),
      userId: !req.user.isEmployee ? req.user.id : null,
      employeeId: req.user.isEmployee ? req.user.id : null,
      isEmployee: req.user.isEmployee,
    };

    // Store a pending payment record
    await PendingPayment.create({
      checkoutRequestId,
      orderId,
      shopId,
      amount,
      status: 'pending',
      paymentChannel: 'mpesa',
      saleData: enrichedSaleData
    });

    res.json({ checkoutRequestId });
  } catch (error) {
    console.error('M-Pesa initiation error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate M-Pesa STK Push.' });
  }
});

// POST /api/mpesa/callback (unauthenticated - called directly by Safaricom)
router.post('/callback', async (req, res) => {
  try {
    const verification = mpesaService.verifyCallback(req.body);
    const { checkoutRequestId, resultCode, amount, mpesaReceiptNumber } = verification;

    const pendingPayment = await PendingPayment.findOne({
      where: { checkoutRequestId }
    });

    if (!pendingPayment) {
      return res.status(404).json({ error: 'Pending payment not found.' });
    }

    // Check if already processed
    if (pendingPayment.status !== 'pending') {
      return res.json({ message: 'Callback already processed.' });
    }

    if (resultCode === 0) {
      const saleData = pendingPayment.saleData || {};
      saleData.paymentReference = mpesaReceiptNumber;
      saleData.paymentProvider = 'mpesa';
      saleData.paymentNotes = `M-Pesa STK Push confirmed. Receipt: ${mpesaReceiptNumber}`;

      await pendingPayment.update({ 
        status: 'confirmed',
        saleData
      });

      // Create the sale using extracted logic ONLY if it's a standard checkout (contains items)
      if (saleData && Array.isArray(saleData.items) && saleData.items.length > 0) {
        const userContext = {
          id: saleData.employeeId || saleData.userId,
          isEmployee: saleData.isEmployee
        };

        await saleController.createSaleInternal(
          saleData,
          pendingPayment.shopId,
          userContext
        );
      }
    } else {
      await pendingPayment.update({ status: 'failed' });
    }

    res.json({ message: 'Callback processed successfully.' });
  } catch (error) {
    console.error('M-Pesa callback handling error:', error);
    res.status(500).json({ error: error.message || 'Failed to process callback.' });
  }
});

// GET /api/mpesa/status/:checkoutRequestId (authenticated/frontend polling)
router.get('/status/:checkoutRequestId', async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const pendingPayment = await PendingPayment.findOne({
      where: { checkoutRequestId }
    });

    if (!pendingPayment) {
      return res.status(404).json({ error: 'Pending payment not found.' });
    }

    let saleId = null;
    let gatewayRef = null;
    if (pendingPayment.status === 'confirmed') {
      gatewayRef = pendingPayment.saleData?.paymentReference;
      if (gatewayRef && pendingPayment.saleData?.items) {
        const sale = await Sale.findOne({
          where: { paymentReference: gatewayRef, shopId: pendingPayment.shopId }
        });
        if (sale) {
          saleId = sale.id;
        }
      }
    }

    res.json({ status: pendingPayment.status, saleId, gatewayRef });
  } catch (error) {
    console.error('M-Pesa status query error:', error);
    res.status(500).json({ error: 'Failed to retrieve transaction status.' });
  }
});

module.exports = router;
