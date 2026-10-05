const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Expense = require('../models/Expense');
const User = require('../models/User');
const Employee = require('../models/Employee');
const sequelize = require('../config/database');
const { parseDate } = require('../utils/dateUtils');
const { logActivity } = require('../middleware/logger');

// Canonical authz context resolution helper
const getAuthContext = (req) => {
  const organizationId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId || null;
  const shopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId || null;
  const isEmployee = req.authz ? Boolean(req.authz.identity?.isEmployee) : (req.user ? Boolean(req.user.isEmployee) : false);
  const actorId = req.authz ? req.authz.identity?.id : req.user?.id;
  const resolvedUserId = req.authz ? req.authz.identity?.userId : (!isEmployee ? actorId : null);
  const resolvedEmployeeId = req.authz ? req.authz.identity?.employeeId : (isEmployee ? actorId : null);
  return { organizationId, shopId, isEmployee, actorId, resolvedUserId, resolvedEmployeeId };
};

// Get all expenses with pagination and filtering
exports.getAllExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const { startDate, endDate, category } = req.query;
    const { organizationId, shopId } = getAuthContext(req);
    
    // Build where clause based on filters with strict multi-tenant & branch scoping
    const whereClause = {};
    if (shopId) whereClause.shopId = shopId;
    if (organizationId) whereClause.organizationId = organizationId;

    if (startDate && endDate) {
      whereClause.date = {
        [Op.between]: [parseDate(startDate), parseDate(endDate)]
      };
    }
    if (category) {
      whereClause.category = category;
    }

    const expenses = await Expense.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'recordedBy',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ],
      order: [['date', 'DESC']],
      limit,
      offset
    });

    res.json({
      expenses: expenses.rows,
      total: expenses.count,
      totalPages: Math.ceil(expenses.count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

// Get expense by ID
exports.getExpenseById = async (req, res) => {
  try {
    const { organizationId, shopId } = getAuthContext(req);
    const whereClause = { id: req.params.id };
    if (organizationId) whereClause.organizationId = organizationId;
    if (shopId) whereClause.shopId = shopId;

    const expense = await Expense.findOne({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'recordedBy',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ]
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
};

// Create new expense
exports.createExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      description,
      amount,
      category,
      date,
      paymentMethod,
      reference,
      notes
    } = req.body;

    const { organizationId, shopId, isEmployee, actorId } = getAuthContext(req);

    const resolvedUserId = !isEmployee ? actorId : null;
    const resolvedEmployeeId = isEmployee ? actorId : null;

    const expense = await Expense.create({
      description,
      amount,
      category,
      date: date || new Date(),
      paymentMethod,
      reference,
      notes,
      userId: resolvedUserId,
      employeeId: resolvedEmployeeId,
      organizationId,
      shopId
    });

    await logActivity({
      shopId,
      performedBy: actorId,
      performedByType: isEmployee ? 'employee' : 'user',
      action: 'EXPENSE_CREATED',
      entity: 'Expense',
      entityId: expense.id,
      details: `Created expense: ${expense.description} (${expense.amount} KES)`
    });

    const expenseWithUser = await Expense.findByPk(expense.id, {
      include: [
        {
          model: User,
          as: 'recordedBy',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ]
    });

    res.status(201).json(expenseWithUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create expense' });
  }
};

// Update expense
exports.updateExpense = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { organizationId, shopId, isEmployee, actorId } = getAuthContext(req);
    const whereClause = { id: req.params.id };
    if (organizationId) whereClause.organizationId = organizationId;
    if (shopId) whereClause.shopId = shopId;

    const expense = await Expense.findOne({ where: whereClause });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const {
      description,
      amount,
      category,
      date,
      paymentMethod,
      reference,
      notes
    } = req.body;

    await expense.update({
      description,
      amount,
      category,
      date,
      paymentMethod,
      reference,
      notes
    });

    await logActivity({
      shopId: expense.shopId || shopId,
      performedBy: actorId,
      performedByType: isEmployee ? 'employee' : 'user',
      action: 'EXPENSE_UPDATED',
      entity: 'Expense',
      entityId: expense.id,
      details: `Updated expense: ${expense.description} (${expense.amount} KES)`
    });

    const updatedExpense = await Expense.findByPk(expense.id, {
      include: [
        {
          model: User,
          as: 'recordedBy',
          attributes: ['id', 'name', 'email'],
          required: false
        },
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        }
      ]
    });

    res.json(updatedExpense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const { organizationId, shopId, isEmployee, actorId } = getAuthContext(req);
    const whereClause = { id: req.params.id };
    if (organizationId) whereClause.organizationId = organizationId;
    if (shopId) whereClause.shopId = shopId;

    const expense = await Expense.findOne({ where: whereClause });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await logActivity({
      shopId: expense.shopId || shopId,
      performedBy: actorId,
      performedByType: isEmployee ? 'employee' : 'user',
      action: 'EXPENSE_DELETED',
      entity: 'Expense',
      entityId: expense.id,
      details: `Deleted expense: ${expense.description} (${expense.amount} KES)`
    });

    await expense.destroy();
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};

// Get expense statistics and summary
exports.getExpenseStatistics = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    const { organizationId, shopId } = getAuthContext(req);

    const whereClause = {
      ...(shopId ? { shopId } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(startDate && endDate ? {
        date: {
          [Op.between]: [parseDate(startDate), parseDate(endDate)]
        }
      } : {}),
      ...(category ? { category } : {})
    };

    // Get total expenses and category breakdown with strict multi-tenant & shop scoping
    const [totalExpenses, categoryBreakdown, monthlyTrend] = await Promise.all([
      Expense.sum('amount', { where: whereClause }),
      Expense.findAll({
        where: whereClause,
        attributes: [
          'category',
          [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['category']
      }),
      Expense.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m-01'), 'month'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'total']
        ],
        group: [sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m-01')],
        order: [[sequelize.fn('DATE_FORMAT', sequelize.col('date'), '%Y-%m-01'), 'ASC']]
      })
    ]);

    // Get payment method breakdown
    const paymentMethodBreakdown = await Expense.findAll({
      where: whereClause,
      attributes: [
        'paymentMethod',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['paymentMethod']
    });

    // Calculate average expense per category
    const categoryAverages = categoryBreakdown.map(category => ({
      category: category.category,
      average: category.getDataValue('total') / category.getDataValue('count'),
      total: category.getDataValue('total'),
      count: category.getDataValue('count')
    }));

    res.json({
      totalExpenses: totalExpenses || 0,
      categoryBreakdown: categoryAverages,
      paymentMethodBreakdown,
      monthlyTrend,
      dateRange: {
        start: startDate || 'all time',
        end: endDate || 'current'
      }
    });
  } catch (error) {
    console.error('Expense statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch expense statistics' });
  }
};

