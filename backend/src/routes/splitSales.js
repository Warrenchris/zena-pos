const express = require('express');
const router = express.Router();
const EnhancedSaleService = require('../services/EnhancedSaleService');
const { auth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermissions');
const shopAuth = require('../middleware/shopAuth');

router.post('/', auth, shopAuth, checkPermission('create_sales'), async (req, res, next) => {
  try {
    const sale = await EnhancedSaleService.createSplitPaymentSale(req.body, req);
    res.status(201).json(sale);
  } catch (error) {
    console.error('Error in split sale:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create split payment sale' });
  }
});

module.exports = router;
