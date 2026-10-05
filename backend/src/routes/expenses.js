const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { auth, authzContext, authorize } = require('../middleware/auth');
const { Expense, Shop } = require('../models');

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

// Mount canonical authentication and authorization context pipeline
router.use(auth);
router.use(authzContext);

// Routes
router.get('/', 
  authorize({
    permission: 'manage_expenses',
    shopScope: 'current'
  }),
  validateDateRange,
  validateCategoryQuery,
  expenseController.getAllExpenses
);

router.get('/statistics', 
  authorize({
    permissions: { any: ['manage_expenses', 'view_reports'] },
    shopScope: 'current'
  }),
  validateDateRange,
  expenseController.getExpenseStatistics
);

router.get('/:id', 
  authorize({
    permission: 'manage_expenses',
    shopScope: 'current',
    ownership: {
      getResource: (req) => Expense.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      managerPermission: 'manage_expenses',
      antiOracle: true
    }
  }),
  expenseController.getExpenseById
);

router.post('/', 
  authorize({
    permission: 'manage_expenses',
    shopScope: 'current'
  }),
  validateExpense,
  expenseController.createExpense
);

router.put('/:id', 
  authorize({
    permission: 'manage_expenses',
    shopScope: 'current',
    ownership: {
      getResource: (req) => Expense.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      managerPermission: 'manage_expenses',
      antiOracle: true
    }
  }),
  validateExpense,
  expenseController.updateExpense
);

router.delete('/:id', 
  authorize({
    roles: ['admin', 'org_admin'],
    shopScope: 'current',
    ownership: {
      getResource: (req) => Expense.findByPk(req.params.id, {
        include: [{ model: Shop, attributes: ['organizationId'] }]
      }),
      managerPermission: 'manage_expenses',
      antiOracle: true
    }
  }),
  expenseController.deleteExpense
);

module.exports = router;

