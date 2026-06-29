const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { auth, checkRole } = require('../middleware/auth');

// Validation middleware
const validateExpense = [
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 200 })
    .withMessage('Description must be less than 200 characters'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0'),
  body('category')
    .isIn(['inventory', 'salary', 'rent', 'utilities', 'maintenance', 'marketing', 'other'])
    .withMessage('Invalid expense category'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  body('paymentMethod')
    .isIn(['cash', 'card', 'bank_transfer', 'mobile_money', 'other'])
    .withMessage('Invalid payment method'),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Reference must be less than 50 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
];

const { validateDateRange } = require('../middleware/validators');

const validateCategoryQuery = [
  query('category')
    .optional()
    .isIn(['inventory', 'salary', 'rent', 'utilities', 'maintenance', 'marketing', 'other'])
    .withMessage('Invalid expense category')
];

// Routes
router.get('/', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateDateRange,
  validateCategoryQuery,
  expenseController.getAllExpenses
);

router.get('/statistics', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateDateRange,
  expenseController.getExpenseStatistics
);

router.get('/:id', 
  auth, 
  checkRole(['admin', 'manager']), 
  expenseController.getExpenseById
);

router.post('/', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateExpense,
  expenseController.createExpense
);

router.put('/:id', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateExpense,
  expenseController.updateExpense
);

router.delete('/:id', 
  auth, 
  checkRole(['admin']), 
  expenseController.deleteExpense
);

module.exports = router;
