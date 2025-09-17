const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { auth, checkRole } = require('../middleware/auth');

// Validation middleware
const validateCustomer = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be less than 100 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Invalid email format')
    .normalizeEmail(),
  body('phone')
    .optional()
    .trim()
    .matches(/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/)
    .withMessage('Invalid phone number format'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address must be less than 200 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters')
];

const validateLoyaltyPoints = [
  body('points')
    .isInt()
    .withMessage('Points must be an integer'),
  body('reason')
    .trim()
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 200 })
    .withMessage('Reason must be less than 200 characters')
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
  customerController.getAllCustomers
);

router.get('/statistics', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateDateRange,
  customerController.getCustomerStatistics
);

router.get('/:id', 
  auth, 
  checkRole(['admin', 'manager', 'cashier']), 
  customerController.getCustomerById
);

router.post('/', 
  auth, 
  checkRole(['admin', 'manager', 'cashier']), 
  validateCustomer,
  customerController.createCustomer
);

router.put('/:id', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateCustomer,
  customerController.updateCustomer
);

router.delete('/:id', 
  auth, 
  checkRole(['admin']), 
  customerController.deleteCustomer
);

router.patch('/:id/loyalty-points', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateLoyaltyPoints,
  customerController.adjustLoyaltyPoints
);

module.exports = router;
