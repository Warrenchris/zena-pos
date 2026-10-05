const express = require('express');
const router = express.Router();
const { auth, authzContext, authorize } = require('../middleware/auth');
const brandController = require('../controllers/brandController');
const { brandValidation } = require('../middleware/validations');

// All routes require authentication and canonical authorization context
router.use(auth);
router.use(authzContext);

// Get all brands
router.get('/',
  authorize({ permissions: { any: ['view_products', 'manage_products'] }, shopScope: 'current' }),
  brandController.getBrands
);

// Get a single brand
router.get('/:id',
  authorize({ permissions: { any: ['view_products', 'manage_products'] }, shopScope: 'current' }),
  brandController.getBrandById
);

// Create a new brand - requires admin or manager role
router.post('/',
  authorize({ permission: 'manage_products', shopScope: 'current' }),
  brandValidation.create,
  brandController.createBrand
);

// Update a brand - requires admin or manager role
router.put('/:id',
  authorize({ permission: 'manage_products', shopScope: 'current' }),
  brandValidation.update,
  brandController.updateBrand
);

// Delete a brand - requires admin role
router.delete('/:id',
  authorize({ roles: ['admin', 'org_admin'], shopScope: 'current' }),
  brandController.deleteBrand
);

module.exports = router;