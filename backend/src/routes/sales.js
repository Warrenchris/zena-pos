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
    .isIn(['cash', 'card', 'mobile', 'mobile_money', 'other'])
    .withMessage('Invalid payment method'),
  body('paymentAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Payment amount must be a positive number'),
  body('customer')
    .optional()
    .isObject()
    .withMessage('Customer must be an object'),
  body('customer.name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Customer name must be between 1 and 100 characters'),
  body('customer.email')
    .optional()
    .isEmail()
    .withMessage('Invalid customer email'),
  body('customer.phone')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Customer phone must be less than 20 characters'),
  body('customer.location')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Customer location must be less than 100 characters'),
  body('employeeId')
    .optional()
    .isUUID()
    .withMessage('Invalid employee ID'),
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
  checkRole(['admin', 'manager', 'cashier']),
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

// Get specific sale - Permission check is handled in controller
router.get('/:id', 
  async (req, res, next) => {
    // Admin and managers can view all sales
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      return next();
    }
    // Cashiers can only view their own sales
    if (req.user.role === 'cashier') {
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
  checkPermission('create_sale'),
  body('products').isArray(),
  body('products.*.id').isInt(),
  body('products.*.quantity').isInt({ min: 1 }),
  body('customerId').optional().isInt(),
  body('paymentType').isIn(['cash', 'card', 'mobile']),
  body('notes').optional().isString(),
  validateRequest,
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

router.post('/', 
  auth,
  checkPermission('create_sales'),
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
