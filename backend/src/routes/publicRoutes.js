const express = require('express');
const router = express.Router();
const publicReceiptController = require('../controllers/publicReceiptController');
const { createDistributedRateLimiter } = require('../utils/distributedRateLimiter');

// Rate limiter for public receipts: 30 requests per minute per IP
const publicReceiptLimiter = createDistributedRateLimiter({
  namespace: 'public-receipts',
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.ip || req.connection?.remoteAddress || 'unknown-public-ip',
  message: { error: 'Too many requests. Please try again later.' },
});

// GET /api/public/receipts/:token (unauthenticated, rate-limited)
router.get('/receipts/:token', publicReceiptLimiter, publicReceiptController.getPublicReceipt);

module.exports = router;
