const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { auth, checkRole } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermissions');
const { Sale } = require('../models');
const { validateRequest, validateDateRange } = require('../middleware/validators');

// All routes require authentication
router.use(auth);

// Validation middleware
const validateSale = [
  // Required fields validation
  body('items')
    .isArray()
    .withMessage('Items must be an array')
    .notEmpty()
    .withMessage('At least one item is required'),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  // .isInt() removed to allow UUIDs
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('items.*.originalPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Original price must be a positive number'),
  body('items.*.price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('items.*.discountType')
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be percentage or fixed'),
  body('items.*.discountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number'),
  body('items.*.taxRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax rate must be a positive number'),
  body('items.*.taxAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax amount must be a positive number'),
  body('items.*.notes')
    .optional()
    .isString()
    .withMessage('Item notes must be a string'),
  body('items.*.serialNumber')
    .optional()
    .isString()
    .withMessage('Serial number must be a string'),
  body('items.*.batchNumber')
    .optional()
    .isString()
    .withMessage('Batch number must be a string'),

  // Customer fields validation
  body('customerId')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined) {
        return true; // Allow null/undefined for walk-in customers
      }
      if (!Number.isInteger(value)) {
        throw new Error('Invalid customer ID');
      }
      return true;
    }),
  body('customer')
    .optional()
    .isObject()
    .withMessage('Customer must be an object'),
  body('customer.name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Customer name must be between 1 and 100 characters'),
  body('customer.email')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return true; // Allow empty email for walk-in customers
      }
      // Only validate email format if a value is provided
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        throw new Error('Invalid email format');
      }
      return true;
    }),
  body('customer.phone')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone must be less than 20 characters'),
  body('customer.location')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location must be less than 100 characters'),

  // Payment fields validation  
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'card', 'mobile', 'mobile_money', 'check', 'store_credit'])
    .withMessage('Invalid payment method'),
  body('paymentAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Payment amount must be a positive number'),
  body('paymentReference')
    .optional()
    .isString()
    .withMessage('Payment reference must be a string'),
  body('paymentProvider')
    .optional()
    .isString()
    .withMessage('Payment provider must be a string'),
  body('paymentNotes')
    .optional()
    .isString()
    .withMessage('Payment notes must be a string'),

  // Amount fields
  body('subtotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Subtotal must be a positive number'),
  body('tax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax must be a positive number'),
  body('taxRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Tax rate must be a positive number'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('discountType')
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be percentage or fixed'),
  body('discountValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a positive number'),
  body('total')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Total must be a positive number'),
  body('change')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Change amount must be a positive number'),

  // Customer experience fields
  body('customerNotes')
    .optional()
    .isString()
    .withMessage('Customer notes must be a string'),
  body('deliveryAddress')
    .optional()
    .isString()
    .withMessage('Delivery address must be a string'),
  body('deliveryInstructions')
    .optional()
    .isString()
    .withMessage('Delivery instructions must be a string'),
  body('preferredLanguage')
    .optional()
    .isString()
    .isLength({ min: 2, max: 5 })
    .withMessage('Preferred language must be a valid language code'),

  // Business operations fields
  body('source')
    .optional()
    .isIn(['pos', 'online', 'phone', 'mobile_app'])
    .withMessage('Invalid sale source'),
  body('saleStatus')
    .optional()
    .isIn(['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded', 'partially_refunded'])
    .withMessage('Invalid sale status'),
  body('fulfillmentStatus')
    .optional()
    .isIn(['pending', 'processing', 'ready', 'delivered', 'collected', 'failed'])
    .withMessage('Invalid fulfillment status'),

  // Additional metadata
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be less than 500 characters'),
  body('employeeId')
    .optional()
    .isString()
    .withMessage('Employee ID must be a string')
];

const validatePaymentStatus = [
  body('paymentStatus')
    .isIn(['pending', 'completed', 'failed'])
    .withMessage('Invalid payment status')
];

// Basic routes with role-based access
router.get('/',
  checkRole(['admin', 'manager']),
  saleController.getAllSales
);

router.get('/statistics',
  checkRole(['admin', 'manager']),
  validateDateRange,
  saleController.getSalesStatistics
);

router.get('/cashier-stats',
  auth,
  checkRole(['admin', 'manager', 'cashier', 'employee']),
  validateDateRange,
  saleController.getCashierStats
);

// Admin route to get all sales with filtering
router.get('/admin/all',
  checkRole(['admin', 'manager']),
  validateDateRange,
  saleController.getAllSalesForAdmin
);

// Cashier route to get only their own sales
router.get('/my-sales',
  checkPermission('view_own_sales'),
  validateDateRange,
  saleController.getMySales
);

// Get all sales returns for shop
router.get('/returns/all',
  checkRole(['admin', 'manager', 'cashier', 'employee']),
  saleController.getAllReturns
);

// Get payments for a specific sale
router.get('/:saleId/payments',
  saleController.getSalePayments
);

// Get specific sale - Permission check is handled in controller
router.get('/:id',
  async (req, res, next) => {
    // Admin and managers can view all sales
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      return next();
    }
    // Cashiers and employees can only view their own sales
    if (req.user.role === 'cashier' || req.user.role === 'employee') {
      const sale = await Sale.findOne({
        where: {
          id: req.params.id,
          employeeId: req.user.id,
          shopId: req.user.shopId
        }
      });
      if (sale) {
        return next();
      }
      return res.status(403).json({ error: 'Access denied to this sale' });
    }
    return res.status(403).json({ error: 'Access denied' });
  },
  saleController.getSaleById
);

// Create new sale - Cashiers can only create sales for their shop
router.post('/',
  checkPermission('create_sales'),
  validateSale,
  saleController.createSale
);

// Update sale - Only managers and admin can update sales
router.put('/:id',
  checkRole(['admin', 'manager']),
  body('status').optional().isIn(['completed', 'cancelled', 'refunded']),
  body('notes').optional().isString(),
  validateRequest,
  saleController.updateSale
);

// Delete sale - Only admin can delete sales
router.delete('/:id',
  checkRole(['admin']),
  saleController.deleteSale
);

router.patch('/:id/payment-status',
  auth,
  checkRole(['admin', 'manager']),
  validatePaymentStatus,
  saleController.updatePaymentStatus
);

// POST /api/sales/:saleId/refund - Process itemized refund
router.post('/:saleId/refund',
  checkPermission('process_refunds'),
  saleController.processRefund
);

// GET /api/sales/:saleId/refunds - Get all refunds for a sale
router.get('/:saleId/refunds',
  saleController.getSaleRefunds
);

// GET /api/sales/:saleId/credit-note - Get credit note document data
router.get('/:saleId/credit-note',
  saleController.getCreditNote
);

module.exports = router;
