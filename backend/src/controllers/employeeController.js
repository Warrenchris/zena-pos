const { Op } = require('sequelize');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');
const { validateEmployee } = require('../utils/validation');
const sequelize = require('../config/database');
const { NON_CANCELLED_SALE_FILTER } = require('../constants/saleFilters');

// Get all employees and shop staff
exports.getAllEmployees = async (req, res) => {
  try {
    // Enforce tenant scope based on authenticated user's shop
    const where = { shopId: req.user.shopId };
    
    const employees = await Employee.findAll({ 
      where,
      order: [['createdAt', 'DESC']] 
    });

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role', 'active', 'shopId'],
      order: [['createdAt', 'DESC']]
    });

    const empList = employees.map(e => (e.toJSON ? e.toJSON() : e));
    const userList = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      shopId: u.shopId
    }));

    // Merge & deduplicate by ID
    const map = new Map();
    [...empList, ...userList].forEach(item => {
      if (item && item.id) {
        map.set(String(item.id), item);
      }
    });

    const combinedList = Array.from(map.values());
    res.json(combinedList);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

// Get employee by ID (with stats, sales history, and top products)
exports.getEmployeeById = async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const targetId = req.params.id;

    // Check Employee table first, then User table if not found or if ID is numeric
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
    
    let employeeData = null;
    let isUser = false;

    if (isUuid) {
      const emp = await Employee.findOne({ where: { id: targetId, shopId } });
      if (emp) {
        employeeData = emp.toJSON ? emp.toJSON() : emp;
      }
    } else if (/^\d+$/.test(targetId)) {
      const u = await User.findOne({ where: { id: parseInt(targetId, 10), shopId } });
      if (u) {
        const uJson = u.toJSON ? u.toJSON() : u;
        employeeData = {
          id: uJson.id,
          firstName: uJson.name ? uJson.name.split(' ')[0] : 'User',
          lastName: uJson.name && uJson.name.split(' ').length > 1 ? uJson.name.split(' ').slice(1).join(' ') : '',
          email: uJson.email,
          phone: '',
          position: uJson.role || 'user',
          status: uJson.active ? 'active' : 'inactive',
          hireDate: uJson.createdAt,
          salary: 0,
          shopId: uJson.shopId
        };
        isUser = true;
      }
    } else {
      // Direct lookup as Employee ID even if format non-standard
      const emp = await Employee.findOne({ where: { id: targetId, shopId } });
      if (emp) {
        employeeData = emp.toJSON ? emp.toJSON() : emp;
      }
    }

    if (!employeeData) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const saleWhere = {
      shopId,
      ...NON_CANCELLED_SALE_FILTER,
      [isUser ? 'userId' : 'employeeId']: targetId
    };

    // 1. Sales Performance Stats
    const salesStats = await Sale.findOne({
      where: saleWhere,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total')), 0), 'totalRevenue'],
        [sequelize.fn('MIN', sequelize.col('createdAt')), 'firstSaleDate'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastSaleDate']
      ],
      raw: true
    });

    const totalSales = parseInt(salesStats?.totalSales || 0, 10);
    const totalRevenue = parseFloat(salesStats?.totalRevenue || 0);
    const averageSaleValue = totalSales > 0 ? parseFloat((totalRevenue / totalSales).toFixed(2)) : 0;
    const firstSaleDate = salesStats?.firstSaleDate || null;
    const lastSaleDate = salesStats?.lastSaleDate || null;

    // 2. Paginated Sales History
    const historyWhere = {
      shopId,
      ...NON_CANCELLED_SALE_FILTER,
      [isUser ? 'userId' : 'employeeId']: targetId
    };

    const { count: orderCount, rows: sales } = await Sale.findAndCountAll({
      where: historyWhere,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [{
        model: SaleItem,
        attributes: ['id', 'quantity', 'price', 'subtotal']
      }]
    });

    const salesHistory = sales.map(sale => {
      const s = sale.toJSON();
      const itemCount = s.SaleItems ? s.SaleItems.reduce((acc, item) => acc + (item.quantity || 1), 0) : 0;
      return {
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        total: parseFloat(s.total),
        paymentMethod: s.paymentMethod,
        status: s.saleStatus || 'completed',
        createdAt: s.createdAt,
        itemCount
      };
    });

    // 3. Top Products Sold (Single SQL GROUP BY Aggregation)
    let topProducts = [];
    try {
      const topItems = await SaleItem.findAll({
        attributes: [
          'productId',
          [sequelize.fn('COUNT', sequelize.col('SaleItem.id')), 'timesSold'],
          [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'totalQuantity'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('SaleItem.subtotal')), sequelize.fn('SUM', sequelize.literal('SaleItem.price * SaleItem.quantity'))), 'totalRevenue']
        ],
        include: [
          {
            model: Sale,
            where: saleWhere,
            attributes: []
          },
          {
            model: Product,
            attributes: ['id', 'name', 'sku', 'price']
          }
        ],
        group: ['SaleItem.productId', 'Product.id', 'Product.name', 'Product.sku', 'Product.price'],
        order: [[sequelize.literal('timesSold'), 'DESC'], [sequelize.literal('totalQuantity'), 'DESC']],
        limit: 5
      });

      topProducts = topItems.map(item => {
        const i = item.toJSON ? item.toJSON() : item;
        return {
          productId: i.productId,
          name: i.Product?.name || 'Unknown Product',
          sku: i.Product?.sku || '',
          price: parseFloat(i.Product?.price || 0),
          timesSold: parseInt(i.timesSold || item.dataValues?.timesSold || 0, 10),
          totalQuantity: parseInt(i.totalQuantity || item.dataValues?.totalQuantity || 0, 10),
          totalRevenue: parseFloat(i.totalRevenue || item.dataValues?.totalRevenue || 0)
        };
      });
    } catch (topErr) {
      console.warn('Could not compute top products for employee:', topErr.message);
      topProducts = [];
    }

    res.json({
      employee: employeeData,
      stats: {
        totalSales,
        totalRevenue,
        averageSaleValue,
        firstSaleDate,
        lastSaleDate
      },
      salesHistory,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(orderCount / limit) || 1,
        totalSales: orderCount,
        limit
      },
      topProducts
    });
  } catch (error) {
    console.error('Error fetching employee details:', error);
    res.status(500).json({ error: 'Failed to fetch employee details' });
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
    // Force shopId from token, ignore any client-sent shopId
    const payload = { ...req.body, shopId: req.user.shopId };
    const employee = await Employee.create(payload, { transaction });

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
      where: { id: req.params.id, shopId: req.user.shopId },
      individualHooks: true // This ensures password hashing hooks are run
    });

    if (!updated) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const updatedEmployee = await Employee.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
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
      where: { id: req.params.id, shopId: req.user.shopId }
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