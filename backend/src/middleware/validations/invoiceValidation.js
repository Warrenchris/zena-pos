const { body } = require('express-validator');
const { validate } = require('../validate');

const invoiceValidation = {
  create: [
    body('customerId')
      .optional(),
    
    body('saleId')
      .notEmpty()
      .withMessage('Sale ID is required'),
    
    body('status')
      .optional()
      .isIn(['draft', 'pending', 'paid', 'overdue', 'cancelled'])
      .withMessage('Invalid invoice status'),
    
    body('subtotal')
      .optional()
      .isNumeric()
      .withMessage('Subtotal must be a number')
      .custom(value => value >= 0)
      .withMessage('Subtotal cannot be negative'),
    
    body('tax')
      .optional()
      .isNumeric()
      .withMessage('Tax must be a number')
      .custom(value => value >= 0)
      .withMessage('Tax cannot be negative'),
    
    body('discount')
      .optional()
      .isNumeric()
      .withMessage('Discount must be a number')
      .custom(value => value >= 0)
      .withMessage('Discount cannot be negative'),
    
    body('total')
      .optional()
      .isNumeric()
      .withMessage('Total must be a number')
      .custom(value => value >= 0)
      .withMessage('Total cannot be negative'),
    
    body('notes')
      .optional()
      .isString()
      .withMessage('Notes must be a string')
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot exceed 1000 characters'),
    
    body('dueDate')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid date'),
    
    body('paymentMethod')
      .optional()
      .isString()
      .withMessage('Payment method must be a string')
      .trim()
      .isLength({ max: 50 })
      .withMessage('Payment method cannot exceed 50 characters'),
    
    validate
  ],

  update: [
    body('status')
      .optional()
      .isIn(['draft', 'pending', 'paid', 'overdue', 'cancelled'])
      .withMessage('Invalid invoice status'),
    
    body('subtotal')
      .optional()
      .isNumeric()
      .withMessage('Subtotal must be a number')
      .custom(value => value >= 0)
      .withMessage('Subtotal cannot be negative'),
    
    body('tax')
      .optional()
      .isNumeric()
      .withMessage('Tax must be a number')
      .custom(value => value >= 0)
      .withMessage('Tax cannot be negative'),
    
    body('discount')
      .optional()
      .isNumeric()
      .withMessage('Discount must be a number')
      .custom(value => value >= 0)
      .withMessage('Discount cannot be negative'),
    
    body('total')
      .optional()
      .isNumeric()
      .withMessage('Total must be a number')
      .custom(value => value >= 0)
      .withMessage('Total cannot be negative'),
    
    body('notes')
      .optional()
      .isString()
      .withMessage('Notes must be a string')
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Notes cannot exceed 1000 characters'),
    
    body('dueDate')
      .optional()
      .isISO8601()
      .withMessage('Due date must be a valid date'),
    
    body('paymentMethod')
      .optional()
      .isString()
      .withMessage('Payment method must be a string')
      .trim()
      .isLength({ max: 50 })
      .withMessage('Payment method cannot exceed 50 characters'),
    
    validate
  ]
};

module.exports = {
  invoiceValidation
};