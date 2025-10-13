const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const EnhancedSalesController = require('../controllers/enhancedSalesController');
const auth = require('../middleware/auth');
const shopAuth = require('../middleware/shopAuth');

// Apply auth and shop middleware to all routes
router.use(auth, shopAuth);

// Create a new sale with enhanced functionality
router.post('/',
  [
    body('items').isArray().withMessage('Items must be an array'),
    body('items.*.productId').isInt().withMessage('Product ID must be an integer'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('items.*.price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('customerId').optional().isInt().withMessage('Customer ID must be an integer'),
    body('discountType').optional().isIn(['percentage', 'fixed']).withMessage('Invalid discount type'),
    body('discountValue').optional().isFloat({ min: 0 }).withMessage('Discount must be a positive number'),
    body('paymentMethod').isIn(['cash', 'card', 'mobile_money', 'bank_transfer', 'split']).withMessage('Invalid payment method'),
    body('payments').optional().isArray().withMessage('Payments must be an array'),
    body('payments.*.amount').optional().isFloat({ min: 0 }).withMessage('Payment amount must be positive'),
    body('payments.*.paymentMethod').optional().isIn(['cash', 'card', 'mobile_money', 'bank_transfer']).withMessage('Invalid payment method'),
  ],
  EnhancedSalesController.createSale
);

// Get a specific sale
router.get('/:id', EnhancedSalesController.getSale);

// Create a refund
router.post('/:id/refund',
  [
    body('amount').isFloat({ min: 0 }).withMessage('Refund amount must be positive'),
    body('reason').isString().notEmpty().withMessage('Refund reason is required'),
    body('refundMethod').isIn(['cash', 'card', 'mobile_money', 'bank_transfer']).withMessage('Invalid refund method'),
  ],
  EnhancedSalesController.createRefund
);

// Update sale status
router.patch('/:id/status',
  [
    body('status').isIn(['processing', 'completed', 'cancelled', 'refunded']).withMessage('Invalid status'),
  ],
  EnhancedSalesController.updateSaleStatus
);

// Get sales by date range
router.get('/',
  [
    query('startDate').isISO8601().withMessage('Start date must be a valid ISO date'),
    query('endDate').isISO8601().withMessage('End date must be a valid ISO date'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a positive number'),
  ],
  EnhancedSalesController.getSalesByDateRange
);

module.exports = router;