const express = require('express');
const router = express.Router();
const { auth, adminAuth } = require('../middleware/auth');
const {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
} = require('../controllers/employeeController');

// Get all employees (admin only)
router.get('/', auth, adminAuth, getAllEmployees);

// Get employee by ID (admin only)
router.get('/:id', auth, adminAuth, getEmployeeById);

// Create new employee (admin only)
router.post('/', auth, adminAuth, createEmployee);

// Update employee (admin only)
router.put('/:id', auth, adminAuth, updateEmployee);

// Delete employee (admin only)
router.delete('/:id', auth, adminAuth, deleteEmployee);

module.exports = router;