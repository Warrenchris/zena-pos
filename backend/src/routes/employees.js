const express = require('express');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
const {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
} = require('../controllers/employeeController');

// Get all employees (admin only)
router.get('/', auth, checkRole(['admin']), getAllEmployees);

// Get employee by ID (admin only)
router.get('/:id', auth, checkRole(['admin']), getEmployeeById);

// Create new employee (admin only)
router.post('/', auth, checkRole(['admin']), createEmployee);

// Update employee (admin only)
router.put('/:id', auth, checkRole(['admin']), updateEmployee);

// Delete employee (admin only)
router.delete('/:id', auth, checkRole(['admin']), deleteEmployee);

module.exports = router;