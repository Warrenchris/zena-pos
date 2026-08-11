const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermissions');
const permissionController = require('../controllers/permissionController');

// All routes require authentication and manage_settings permission
router.use(auth);
router.use(checkPermission('manage_settings'));

// Get matrix
router.get('/matrix', permissionController.getPermissionMatrix);

// Update matrix
router.put('/matrix', permissionController.updatePermissionMatrix);

module.exports = router;
