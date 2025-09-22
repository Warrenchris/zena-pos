const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const brandController = require('../controllers/brandController');
const { brandValidation } = require('../middleware/validations');

// All routes require authentication
router.use(auth);

// Get all brands
router.get('/', brandController.getBrands);

// Get a single brand
router.get('/:id', brandController.getBrandById);

// Create a new brand - requires admin or manager role
router.post('/', 
  checkRole(['admin', 'manager']), 
  brandValidation.create, 
  brandController.createBrand
);

// Update a brand - requires admin or manager role
router.put('/:id', 
  checkRole(['admin', 'manager']), 
  brandValidation.update, 
  brandController.updateBrand
);

// Delete a brand - requires admin role
router.delete('/:id', checkRole(['admin']), brandController.deleteBrand);

module.exports = router;