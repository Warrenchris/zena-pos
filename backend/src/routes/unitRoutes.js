const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const unitController = require('../controllers/unitController');
const { unitValidation } = require('../middleware/validations');

// All routes require authentication
router.use(auth);

// Get all units
router.get('/', unitController.getUnits);

// Get a single unit
router.get('/:id', unitController.getUnitById);

// Create a new unit - requires admin or manager role
router.post('/', 
  checkRole(['admin', 'manager']), 
  unitValidation.create, 
  unitController.createUnit
);

// Update a unit - requires admin or manager role
router.put('/:id', 
  checkRole(['admin', 'manager']), 
  unitValidation.update, 
  unitController.updateUnit
);

// Delete a unit - requires admin role
router.delete('/:id', checkRole(['admin']), unitController.deleteUnit);

module.exports = router;