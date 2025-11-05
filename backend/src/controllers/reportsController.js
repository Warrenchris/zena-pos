const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const User = require('../models/User');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');

// GET /api/reports/sales-summary?range=daily|monthly&startDate=&endDate=
exports.getSalesSummary = async (req, res) => {
  try {
    const { range = 'daily', startDate, endDate } = req.query;
    const normalizeRange = (s, e) => {
      const start = s ? new Date(s) : null;
      const end = e ? new Date(e) : null;
      if (start) start.setHours(0, 0, 0, 0);
      if (end) end.setHours(23, 59, 59, 999);
      return [start, end];
    };
    const fmt = range === 'monthly' ? '%Y-%m' : '%Y-%m-%d';
    
    // First, let's find the date range of existing sales
    const shopId = req.user.shopId;
    const salesRange = await Sale.findOne({
      where: { shopId },
      attributes: [
        [sequelize.fn('MIN', sequelize.col('createdAt')), 'minDate'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'maxDate']
      ]
    });

    console.log('Sales date range:', {
      min: salesRange?.getDataValue('minDate'),
      max: salesRange?.getDataValue('maxDate')
    });

    const where = { shopId };
    
    // If we have sales, use their date range if no specific dates provided
    if (salesRange?.getDataValue('minDate')) {
      const [s, e] = normalizeRange(startDate || salesRange.getDataValue('minDate'), endDate || salesRange.getDataValue('maxDate'));
      where.createdAt = { [Op.between]: [ s, e ] };
    } else if (startDate || endDate) {
      const [s, e] = normalizeRange(startDate || '1970-01-01', endDate || new Date());
      where.createdAt = { [Op.between]: [ s, e ] };
    }

    // First, let's log the total count of sales for debugging
    const totalSales = await Sale.count({ where });
    console.log(`Total sales for shop ${req.user.shopId}:`, totalSales);
    
    // Get total stats
    const [totalStats, salesTrend, activeCustomers] = await Promise.all([
      Sale.findOne({
        where,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
          [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('customerId'))), 'activeCustomers']
        ]
      }),
      Sale.findAll({
        where,
        attributes: [
          [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt), 'period'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'sales'],
          [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
          [sequelize.fn('SUM', sequelize.col('tax')), 'tax'],
          [sequelize.fn('SUM', sequelize.col('discount')), 'discount'],
        ],
        group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt)],
        order: [[sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt), 'ASC']],
      }),
      Sale.count({
        where,
        distinct: true,
        col: 'customerId'
      })
    ]);

    // Additional analytics aligned to the same date range
    let paymentRows = []
    let productRows = []
    try {
      paymentRows = await Sale.findAll({
        where,
        attributes: [
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total')), 'total']
        ],
        group: ['paymentMethod'],
      })
    } catch (err) {
      console.warn('Payment breakdown query failed:', err?.message)
      paymentRows = []
    }
    try {
      productRows = await SaleItem.findAll({
        include: [
          { model: Sale, required: true, where, attributes: [] },
          { model: Product, required: true, attributes: ['id','name'] }
        ],
        attributes: [
          ['productId','productId'],
          [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'quantity'],
          [sequelize.literal('SUM(SaleItem.quantity * COALESCE(NULLIF(SaleItem.price, 0), SaleItem.unitPrice, SaleItem.originalPrice, 0))'), 'revenue']
        ],
        group: ['SaleItem.productId','Product.id','Product.name'],
        order: [[sequelize.literal('revenue'), 'DESC']],
        limit: 5
      })
    } catch (err) {
      console.warn('Top products query failed:', err?.message)
      productRows = []
    }

    // Format response
    const response = {
      kpis: {
        totalRevenue: Number(totalStats?.getDataValue('totalRevenue') || 0),
        totalSales: Number(totalStats?.getDataValue('totalSales') || 0),
        activeCustomers: activeCustomers || 0,
        topProduct: productRows?.[0]?.Product?.name || '-'
      },
      salesTrend: salesTrend.map(row => ({
        period: row.getDataValue('period'),
        sales: Number(row.getDataValue('sales') || 0),
        revenue: Number(row.getDataValue('revenue') || 0),
        tax: Number(row.getDataValue('tax') || 0),
        discount: Number(row.getDataValue('discount') || 0)
      })),
      paymentBreakdown: paymentRows.map(r => ({
        method: r.getDataValue('paymentMethod') || 'Cash',
        value: Number(r.getDataValue('count') || 0),
        revenue: Number(r.getDataValue('total') || 0)
      })),
      topEmployees: [], // We'll add this feature later
      productPerformance: productRows.map(r => ({
        product: r.Product?.name || 'Product',
        sold: Number(r.getDataValue('quantity') || 0),
        revenue: Number(r.getDataValue('revenue') || 0)
      })),
      customerSegments: [] // We'll add this feature later
    };

    console.log('Response:', JSON.stringify(response, null, 2));
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: 'Failed to compute sales summary' });
  }
};

// GET /api/reports/profit-loss?startDate=&endDate=
exports.getProfitAndLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = { shopId: req.user.shopId };
    if (startDate || endDate) {
      const s = startDate ? new Date(startDate) : new Date('1970-01-01');
      const e = endDate ? new Date(endDate) : new Date();
      s.setHours(0,0,0,0);
      e.setHours(23,59,59,999);
      where.createdAt = { [Op.between]: [ s, e ] };
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
    const where = { shopId: req.user.shopId };
    if (startDate || endDate) {
      const s = startDate ? new Date(startDate) : new Date('1970-01-01');
      const e = endDate ? new Date(endDate) : new Date();
      s.setHours(0,0,0,0);
      e.setHours(23,59,59,999);
      where.createdAt = { [Op.between]: [ s, e ] };
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
    const where = { shopId: req.user.shopId };
    if (startDate || endDate) {
      const s = startDate ? new Date(startDate) : new Date('1970-01-01');
      const e = endDate ? new Date(endDate) : new Date();
      s.setHours(0,0,0,0);
      e.setHours(23,59,59,999);
      where.createdAt = { [Op.between]: [ s, e ] };
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


