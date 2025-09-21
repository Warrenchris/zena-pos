const Employee = require('../models/Employee');
const User = require('../models/User');
const { validateEmployee } = require('../utils/validation');
const sequelize = require('../config/database');

// Get all employees
exports.getAllEmployees = async (req, res) => {
  try {
    const { shopId } = req.query;
    const where = shopId ? { shopId } : {};
    
    const employees = await Employee.findAll({ 
      where,
      order: [['createdAt', 'DESC']] 
    });
    
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

// Get employee by ID
exports.getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findByPk(req.params.id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
};

// Create new employee
exports.createEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const validationError = validateEmployee(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // Check if email already exists in either Users or Employees
    const existingUser = await User.findOne({ where: { email: req.body.email } });
    const existingEmployee = await Employee.findOne({ where: { email: req.body.email } });
    
    if (existingUser || existingEmployee) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Create employee record
    const employee = await Employee.create(req.body, { transaction });

    await transaction.commit();
    res.status(201).json(employee);
  } catch (error) {
    console.error('Error creating employee:', error);
    await transaction.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to create employee' });
  }
};

// Update employee
exports.updateEmployee = async (req, res) => {
  try {
    // Add the ID to the payload for validation
    const payload = { ...req.body, id: req.params.id };
    const validationError = validateEmployee(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // If password is empty, remove it from the update payload
    if (!req.body.password) {
      delete req.body.password;
    }

    const [updated] = await Employee.update(req.body, {
      where: { id: req.params.id },
      individualHooks: true // This ensures password hashing hooks are run
    });

    if (!updated) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const updatedEmployee = await Employee.findByPk(req.params.id);
    res.json(updatedEmployee);
  } catch (error) {
    console.error('Error updating employee:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Failed to update employee' });
  }
};

// Delete employee
exports.deleteEmployee = async (req, res) => {
  try {
    const deleted = await Employee.destroy({
      where: { id: req.params.id }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};