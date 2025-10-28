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

// Get all employees (admin only) – tenant scoped
router.get('/', auth, checkRole(['admin']), getAllEmployees);

// Get employee by ID (admin only)
router.get('/:id', auth, checkRole(['admin']), getEmployeeById);

// Create new employee (admin only) – shopId forced from token
router.post('/', auth, checkRole(['admin']), ensureShopIsolation, createEmployee);

// Update employee (admin only) – tenant scoped and shopId forced
router.put('/:id', auth, checkRole(['admin']), ensureShopIsolation, updateEmployee);

// Delete employee (admin only)
router.delete('/:id', auth, checkRole(['admin']), deleteEmployee);

module.exports = router;