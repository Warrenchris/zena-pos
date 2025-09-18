const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const User = require('../models/User');

// GET /api/reports/sales-summary?range=daily|monthly&startDate=&endDate=
exports.getSalesSummary = async (req, res) => {
  try {
    const { range = 'daily', startDate, endDate } = req.query;
    const fmt = range === 'monthly' ? '%Y-%m' : '%Y-%m-%d';

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {
        [Op.between]: [
          startDate ? new Date(startDate) : new Date('1970-01-01'),
          endDate ? new Date(endDate) : new Date(),
        ],
      };
    }

    const rows = await Sale.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt), 'period'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'saleCount'],
        [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
        [sequelize.fn('SUM', sequelize.col('tax')), 'tax'],
        [sequelize.fn('SUM', sequelize.col('discount')), 'discount'],
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt)],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt), 'ASC']],
    });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute sales summary' });
  }
};

// GET /api/reports/profit-loss?startDate=&endDate=
exports.getProfitAndLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {
        [Op.between]: [
          startDate ? new Date(startDate) : new Date('1970-01-01'),
          endDate ? new Date(endDate) : new Date(),
        ],
      };
    }

    const [revenue, tax, discount, expenses] = await Promise.all([
      Sale.sum('total', { where }),
      Sale.sum('tax', { where }),
      Sale.sum('discount', { where }),
      Expense.sum('amount', { where }),
    ]);

    const grossRevenue = Number(revenue || 0);
    const totalTax = Number(tax || 0);
    const totalDiscount = Number(discount || 0);
    const totalExpenses = Number(expenses || 0);
    const netRevenue = grossRevenue - totalTax + totalDiscount; // business-defined
    const profit = netRevenue - totalExpenses;

    res.json({ grossRevenue, totalTax, totalDiscount, netRevenue, totalExpenses, profit });
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute profit & loss' });
  }
};

// GET /api/reports/tax-estimate?startDate=&endDate=&rate=0.16
exports.getTaxEstimate = async (req, res) => {
  try {
    const { startDate, endDate, rate } = req.query;
    const taxRate = rate ? Number(rate) : 0.16; // default 16%
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {
        [Op.between]: [
          startDate ? new Date(startDate) : new Date('1970-01-01'),
          endDate ? new Date(endDate) : new Date(),
        ],
      };
    }

    const taxableRevenue = Number(await Sale.sum('subtotal', { where }) || 0);
    const estimatedTax = taxableRevenue * taxRate;
    res.json({ taxableRevenue, taxRate, estimatedTax });
  } catch (e) {
    res.status(500).json({ error: 'Failed to estimate tax' });
  }
};

// GET /api/reports/employee-sales?startDate=&endDate=&limit=10
exports.getEmployeeSales = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {
        [Op.between]: [
          startDate ? new Date(startDate) : new Date('1970-01-01'),
          endDate ? new Date(endDate) : new Date(),
        ],
      };
    }

    const rows = await Sale.findAll({
      where,
      attributes: [
        'UserId',
        [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'saleCount'],
        [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
      ],
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      group: ['UserId'],
      order: [[sequelize.literal('revenue'), 'DESC']],
      limit: Number(limit),
    });

    const result = rows.map(r => ({
      user: r.User ? { id: r.User.id, name: r.User.name, email: r.User.email } : { id: r.UserId },
      saleCount: Number(r.getDataValue('saleCount') || 0),
      revenue: Number(r.getDataValue('revenue') || 0),
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute employee sales' });
  }
};


