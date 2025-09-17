const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { auth, checkRole } = require('../middleware/auth');

// Validation middleware
const validateSale = [
  body('items')
    .isArray()
    .withMessage('Items must be an array')
    .notEmpty()
    .withMessage('At least one item is required'),
  body('items.*.productId')
    .isInt()
    .withMessage('Invalid product ID'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('customerId')
    .optional()
    .isInt()
    .withMessage('Invalid customer ID'),
  body('paymentMethod')
    .isIn(['cash', 'card', 'mobile_money', 'other'])
    .withMessage('Invalid payment method'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('tax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax must be a positive number'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
];

const validatePaymentStatus = [
  body('paymentStatus')
    .isIn(['pending', 'completed', 'failed'])
    .withMessage('Invalid payment status')
];

const validateDateRange = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
];

// Routes
router.get('/', 
  auth, 
  checkRole(['admin', 'manager', 'cashier']), 
  saleController.getAllSales
);

router.get('/statistics', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateDateRange,
  saleController.getSalesStatistics
);

router.get('/:id', 
  auth, 
  checkRole(['admin', 'manager', 'cashier']), 
  saleController.getSaleById
);

router.post('/', 
  auth, 
  checkRole(['admin', 'manager', 'cashier']), 
  validateSale,
  saleController.createSale
);

router.patch('/:id/payment-status', 
  auth, 
  checkRole(['admin', 'manager']), 
  validatePaymentStatus,
  saleController.updatePaymentStatus
);

module.exports = router;
