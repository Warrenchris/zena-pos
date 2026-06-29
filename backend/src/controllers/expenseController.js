const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Expense = require('../models/Expense');
const User = require('../models/User');
const sequelize = require('../config/database');
const { parseDate } = require('../utils/dateUtils');

// Get all expenses with pagination and filtering
exports.getAllExpenses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const { startDate, endDate, category } = req.query;
    
    // Build where clause based on filters
    const whereClause = { shopId: req.user.shopId };
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
      include: [{
        model: User,
        as: 'recordedBy',
        attributes: ['id', 'name', 'email'],
        where: { shopId: req.user.shopId }
      }],
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
    const expense = await Expense.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [{
        model: User,
        as: 'recordedBy',
        attributes: ['id', 'name', 'email'],
        where: { shopId: req.user.shopId }
      }]
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

    const expense = await Expense.create({
      description,
      amount,
      category,
      date: date || new Date(),
      paymentMethod,
      reference,
      notes,
      userId: req.user.id,
      shopId: req.user.shopId
    });

    const expenseWithUser = await Expense.findByPk(expense.id, {
      include: [{
        model: User,
        as: 'recordedBy',
        attributes: ['id', 'name', 'email']
      }]
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

    const expense = await Expense.findOne({
      where: { id: req.params.id, shopId: req.user.shopId }
    });
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

    const updatedExpense = await Expense.findByPk(expense.id, {
      include: [{
        model: User,
        as: 'recordedBy',
        attributes: ['id', 'name', 'email']
      }]
    });

    res.json(updatedExpense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.id, shopId: req.user.shopId }
    });
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

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
    const whereClause = {
      shopId: req.user.shopId,
      ...(startDate && endDate ? {
        date: {
          [Op.between]: [parseDate(startDate), parseDate(endDate)]
        }
      } : {}),
      ...(category ? { category } : {})
    };

    // Get total expenses and category breakdown
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
