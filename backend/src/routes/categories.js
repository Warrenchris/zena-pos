const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { auth, checkRole } = require('../middleware/auth');

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
    .withMessage('Description must be less than 500 characters')
];

// Routes
router.get('/', auth, categoryController.getAllCategories);
router.get('/:id', auth, categoryController.getCategoryById);
router.post('/', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateCategory,
  categoryController.createCategory
);
router.put('/:id', 
  auth, 
  checkRole(['admin', 'manager']), 
  validateCategory,
  categoryController.updateCategory
);
router.delete('/:id', 
  auth, 
  checkRole(['admin']), 
  categoryController.deleteCategory
);

module.exports = router;
