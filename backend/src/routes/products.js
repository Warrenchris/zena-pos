const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const productController = require('../controllers/productController');
const { auth, checkRole } = require('../middleware/auth');

// Validation middleware
const validateProduct = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ max: 200 })
    .withMessage('Product name must be less than 200 characters'),
  body('sku')
    .trim()
    .notEmpty()
    .withMessage('SKU is required')
    .isLength({ max: 50 })
    .withMessage('SKU must be less than 50 characters'),
  body('barcode')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Barcode must be less than 50 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('price')
    .notEmpty()
    .withMessage('Price is required')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('cost')
    .notEmpty()
    .withMessage('Cost is required')
    .isFloat({ min: 0 })
    .withMessage('Cost must be a positive number'),
  body('stockQuantity')
    .notEmpty()
    .withMessage('Stock quantity is required')
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a positive integer'),
  body('reorderPoint')
    .notEmpty()
    .withMessage('Reorder point is required')
    .isInt({ min: 0 })
    .withMessage('Reorder point must be a positive integer'),
  body('CategoryId')
    .notEmpty()
    .withMessage('Category is required')
    .isInt()
    .withMessage('Invalid category'),
  body('expirationDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Invalid expiration date')
];

const validateStockUpdate = [
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt()
    .withMessage('Quantity must be an integer')
];

// Routes
router.get('/', auth, productController.getAllProducts);
router.get('/:id', auth, productController.getProductById);
router.post('/', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateProduct,
  productController.createProduct
);
router.put('/:id', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateProduct,
  productController.updateProduct
);
router.delete('/:id', 
  auth, 
  checkRole(['admin']), 
  productController.deleteProduct
);
router.patch('/:id/stock', 
  auth, 
  checkRole(['admin', 'manager', 'cashier']), 
  validateStockUpdate,
  productController.updateStock
);

module.exports = router;
