const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermissions');
const permissionController = require('../controllers/permissionController');

const checkAdminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Permission denied', details: 'Only admin users can manage role permissions' });
  }
  next();
};

// All routes require authentication and admin role
router.use(auth);
router.use(checkAdminOnly);

// Get matrix
router.get('/matrix', permissionController.getPermissionMatrix);

// Update matrix
router.put('/matrix', permissionController.updatePermissionMatrix);

module.exports = router;
