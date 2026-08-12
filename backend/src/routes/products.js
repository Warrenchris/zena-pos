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
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('SKU must be less than 50 characters'),
  body('barcode')
    .optional({ checkFalsy: true })
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
    .optional({ checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Reorder point must be a positive integer'),
  body().custom((value, { req }) => {
    const catId = req.body.categoryId || req.body.CategoryId;
    if (catId === undefined || catId === null || catId === '') {
      throw new Error('Category is required');
    }
    if (isNaN(parseInt(catId, 10)) || parseInt(catId, 10) <= 0) {
      throw new Error('Invalid category');
    }
    return true;
  }),
  body('expirationDate')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Invalid expiration date')
  ,
  body('weightGrams')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('Weight (grams) must be a non-negative integer')
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
