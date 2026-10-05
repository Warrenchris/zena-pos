const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { auth, authzContext, authorize } = require('../middleware/auth');

router.use(auth);
router.use(authzContext);

// Validation middleware
const validateCategory = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Category name is required')
    .isLength({ max: 100 })
    .withMessage('Category name must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('taxCategory')
    .optional({ nullable: true })
    .isIn(['standard', 'zero_rated', 'exempt'])
    .withMessage('taxCategory must be standard, zero_rated, or exempt')
];

// Routes
router.get('/',
  authorize({ permissions: { any: ['view_products', 'manage_categories', 'manage_products'] }, shopScope: 'current' }),
  categoryController.getAllCategories
);

router.get('/:id',
  authorize({ permissions: { any: ['view_products', 'manage_categories', 'manage_products'] }, shopScope: 'current' }),
  categoryController.getCategoryById
);

router.post('/',
  authorize({ permission: 'manage_categories', shopScope: 'current' }),
  validateCategory,
  categoryController.createCategory
);

router.put('/:id',
  authorize({ permission: 'manage_categories', shopScope: 'current' }),
  validateCategory,
  categoryController.updateCategory
);

router.delete('/:id',
  authorize({ roles: ['admin', 'org_admin'], shopScope: 'current' }),
  categoryController.deleteCategory
);

module.exports = router;
