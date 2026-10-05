const express = require('express');
const router = express.Router();
const { auth, authzContext, authorize } = require('../middleware/auth');
const unitController = require('../controllers/unitController');
const { unitValidation } = require('../middleware/validations');

// All routes require authentication and canonical authorization context
router.use(auth);
router.use(authzContext);

// Get all units
router.get('/',
  authorize({ permissions: { any: ['view_products', 'manage_products'] }, shopScope: 'current' }),
  unitController.getUnits
);

// Get a single unit
router.get('/:id',
  authorize({ permissions: { any: ['view_products', 'manage_products'] }, shopScope: 'current' }),
  unitController.getUnitById
);

// Create a new unit - requires admin or manager role
router.post('/',
  authorize({ permission: 'manage_products', shopScope: 'current' }),
  unitValidation.create,
  unitController.createUnit
);

// Update a unit - requires admin or manager role
router.put('/:id',
  authorize({ permission: 'manage_products', shopScope: 'current' }),
  unitValidation.update,
  unitController.updateUnit
);

// Delete a unit - requires admin role
router.delete('/:id',
  authorize({ roles: ['admin', 'org_admin'], shopScope: 'current' }),
  unitController.deleteUnit
);

module.exports = router;