const express = require('express');
const router = express.Router();
const { auth, checkRole, ensureShopIsolation } = require('../middleware/auth');
const {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
} = require('../controllers/employeeController');

const checkAdminOrSelf = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  const userId = req.user ? String(req.user.id) : null;
  const employeeId = req.user && req.user.employeeId ? String(req.user.employeeId) : null;
  const targetId = String(req.params.id);
  if ((userId && userId === targetId) || (employeeId && employeeId === targetId)) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied: Admin role required to view other employees' });
};

// Get all employees (admin only) – tenant scoped
router.get('/', auth, checkRole(['admin']), getAllEmployees);

// Get employee by ID (admin or self)
router.get('/:id', auth, checkAdminOrSelf, getEmployeeById);

// Create new employee (admin only) – shopId forced from token
router.post('/', auth, checkRole(['admin']), ensureShopIsolation, createEmployee);

// Update employee (admin only) – tenant scoped and shopId forced
router.put('/:id', auth, checkRole(['admin']), ensureShopIsolation, updateEmployee);

// Delete employee (admin only)
router.delete('/:id', auth, checkRole(['admin']), deleteEmployee);

module.exports = router;