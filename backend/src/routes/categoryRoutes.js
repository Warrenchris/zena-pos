const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkRole } = require('../middleware/rolePermissions');
const categoryController = require('../controllers/categoryController');
const { categoryValidation } = require('../middleware/validations');

// All routes require authentication
router.use(auth);

// Get all categories (with optional topLevel query param)
router.get('/', categoryValidation.list, categoryController.getCategories);

// Get subcategories for a specific category
router.get('/:id/subcategories', categoryController.getSubcategories);

// Get a single category
router.get('/:id', categoryController.getCategoryById);

// Create a new category - requires admin or manager role
router.post('/', 
  checkRole(['admin', 'manager']), 
  categoryValidation.create, 
  categoryController.createCategory
);

// Update a category - requires admin or manager role
router.put('/:id', 
  checkRole(['admin', 'manager']), 
  categoryValidation.update, 
  categoryController.updateCategory
);

// Delete a category - requires admin role
router.delete('/:id', checkRole(['admin']), categoryController.deleteCategory);

module.exports = router;