const express = require('express');
const router = express.Router();
const crypto = require('crypto');
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

    // Generate single-use cryptographically random verification token
    const callbackToken = crypto.randomBytes(32).toString('hex');

    // Call Daraja API to get CheckoutRequestID with callback verification token in CallBackURL
    const checkoutRequestId = await mpesaService.initiateStkPush({
      phone,
      amount,
      orderId,
      shopId,
      callbackToken
    });

    // Enrich saleData with user context and callback verification token
    const enrichedSaleData = {
      ...saleData,
      callbackToken,
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

// POST /api/mpesa/callback (unauthenticated - called directly by Safaricom with single-use query token)
router.post('/callback', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized callback: missing verification token.' });
    }

    const verification = mpesaService.verifyCallback(req.body);
    const { checkoutRequestId, resultCode, amount, mpesaReceiptNumber } = verification;

    const pendingPayment = await PendingPayment.findOne({
      where: { checkoutRequestId }
    });

    if (!pendingPayment) {
      return res.status(404).json({ error: 'Pending payment not found.' });
    }

    // Authenticate callback: verification token must match single-use token in pending payment
    const expectedToken = pendingPayment.saleData?.callbackToken;
    if (!expectedToken || token !== expectedToken) {
      console.warn(`[SECURITY ALERT] Invalid M-Pesa verification token for POS payment ${checkoutRequestId}. Provided: ${token}`);
      return res.status(401).json({ error: 'Unauthorized callback: invalid verification token.' });
    }

    // Check if already processed (Idempotency)
    if (pendingPayment.status !== 'pending') {
      return res.status(200).json({ message: 'Callback already processed.' });
    }

    if (resultCode === 0) {
      // Validate paid amount against requested amount
      if (Number(amount) < Number(pendingPayment.amount)) {
        await pendingPayment.update({ status: 'failed' });
        return res.status(400).json({ error: 'Paid amount is less than pending payment amount.' });
      }

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
router.get('/status/:checkoutRequestId', auth, async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const userShopId = req.shopId || req.user?.shopId;
    const pendingPayment = await PendingPayment.findOne({
      where: { checkoutRequestId }
    });

    if (!pendingPayment || pendingPayment.shopId !== userShopId) {
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
