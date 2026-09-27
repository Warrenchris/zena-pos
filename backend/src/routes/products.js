const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const productController = require('../controllers/productController');
const { auth, checkRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '../../uploads/imports');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeShop = String(req.shopId || 'shop').replace(/[^a-zA-Z0-9_-]/g, '');
    const uniqueName = `products_import_${safeShop}_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel', // legacy mime sometimes sent by browsers for csv/tsv
  ];
  const allowedExtensions = ['.csv', '.xlsx'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV and XLSX files are allowed.'), false);
  }
};

const uploadImport = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter
});

const handleImportMiddleware = (req, res, next) => {
  uploadImport.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size limit exceeded. Maximum allowed size is 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// Validation middleware
const validateProduct = [
  body('name')
    .if((value, { req }) => req.method === 'POST' || value !== undefined)
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
    .if((value, { req }) => req.method === 'POST' || value !== undefined)
    .notEmpty()
    .withMessage('Price is required')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('cost')
    .if((value, { req }) => req.method === 'POST' || value !== undefined)
    .notEmpty()
    .withMessage('Cost is required')
    .isFloat({ min: 0 })
    .withMessage('Cost must be a positive number'),
  body('stockQuantity')
    .optional({ checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Stock quantity must be a positive integer'),
  body('reorderPoint')
    .optional({ checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Reorder point must be a positive integer'),
  body().custom((value, { req }) => {
    if (req.method === 'PUT' && req.body.categoryId === undefined && req.body.CategoryId === undefined) {
      return true;
    }
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

const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');

// Routes
router.get('/batch', auth, productController.getProductsBatch);
router.get('/', auth, productController.getAllProducts);
router.get('/:id', auth, productController.getProductById);
router.post('/import', 
  auth, 
  requireActiveSubscription(),
  checkRole(['admin', 'manager', 'org_admin']), 
  handleImportMiddleware,
  productController.importProducts
);
router.post('/', 
  auth, 
  requireActiveSubscription(),
  checkRole(['admin', 'manager']), 
  validateProduct,
  productController.createProduct
);
router.put('/:id', 
  auth, 
  requireActiveSubscription(),
  checkRole(['admin', 'manager']), 
  validateProduct,
  productController.updateProduct
);
router.delete('/:id', 
  auth, 
  requireActiveSubscription(),
  checkRole(['admin', 'manager']), 
  productController.deleteProduct
);
router.post('/:id/deactivate', 
  auth, 
  requireActiveSubscription(),
  checkRole(['admin', 'org_admin']), 
  productController.deactivateProductOrgWide
);
router.patch('/:id/stock', 
  auth, 
  requireActiveSubscription(),
  checkRole(['admin', 'manager', 'org_admin', 'cashier']), 
  validateStockUpdate,
  productController.updateStock
);

module.exports = router;
