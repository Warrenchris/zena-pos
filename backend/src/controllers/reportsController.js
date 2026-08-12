const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const User = require('../models/User');
const Employee = require('../models/Employee');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');
const SaleRefund = require('../models/SaleRefund');
const { NON_CANCELLED_SALE_FILTER } = require('../constants/saleFilters');

// GET /api/reports/sales-summary?range=daily|monthly&startDate=&endDate=
exports.getSalesSummary = async (req, res) => {
  try {
    const { range = 'daily', startDate, endDate } = req.query;
    const normalizeRange = (s, e) => {
      const start = s ? new Date(s) : null;
      const end = e ? new Date(e) : null;
      // Don't modify hours for hourly range
      if (range !== 'hourly') {
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
      }
      return [start, end];
    };
    
    // Check if date range is within 24 hours
    const start = new Date(startDate);
    const end = new Date(endDate || new Date());
    const isWithin24Hours = (end - start) <= 24 * 60 * 60 * 1000;
    const actualRange = isWithin24Hours ? 'hourly' : range;
    const fmt = actualRange === 'monthly' ? '%Y-%m' : 
               actualRange === 'hourly' ? '%H:00' : '%Y-%m-%d';
    
    // First, let's find the date range of existing sales
    const shopId = req.user.shopId;
    const salesRange = await Sale.findOne({
      attributes: [
        [sequelize.fn('MIN', sequelize.col('createdAt')), 'minDate'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'maxDate']
      ]
    });

    console.log('Sales date range:', {
      min: salesRange?.getDataValue('minDate'),
      max: salesRange?.getDataValue('maxDate')
    });

    const where = { shopId, ...NON_CANCELLED_SALE_FILTER };
    
    // If we have sales, use their date range if no specific dates provided
    if (salesRange?.getDataValue('minDate')) {
      const [s, e] = normalizeRange(startDate || salesRange.getDataValue('minDate'), endDate || salesRange.getDataValue('maxDate'));
      where.createdAt = { [Op.between]: [ s, e ] };
    } else if (startDate || endDate) {
      const [s, e] = normalizeRange(startDate || '1970-01-01', endDate || new Date());
      where.createdAt = { [Op.between]: [ s, e ] };
    }

    // If caller requested hourly granularity for a single day (e.g. "today"),
    // ensure we expand the bounds to cover the full day so hourly aggregation
    // returns all hours for that day instead of an empty/zero-filled set.
    if (actualRange === 'hourly' && startDate) {
      try {
        const s = new Date(startDate);
        const e = new Date(endDate || startDate);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
        where.createdAt = { [Op.between]: [s, e] };
      } catch (err) {
        // ignore parsing errors and keep previous where
      }
    }

    console.log('getSalesSummary: actualRange=', actualRange, ' where=', JSON.stringify(where));

    // Get total stats first and compute salesTrend separately so we can
    // isolate and log errors for hourly aggregation without failing the whole
    // endpoint. This also makes debugging the 500 for single-day hourly easier.
    const totalStats = await Sale.findOne({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('customerId'))), 'activeCustomers']
      ]
    });

    const activeCustomers = await Sale.count({ where, distinct: true, col: 'customerId' });

    let salesTrend = [];
    if (actualRange === 'hourly') {
      try {
        const results = await Sale.findAll({
          where,
          attributes: [
            [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), fmt), 'hour'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'sales'],
            [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
            [sequelize.fn('SUM', sequelize.col('tax')), 'tax'],
            [sequelize.fn('SUM', sequelize.col('discount')), 'discount'],
          ],
          group: [sequelize.fn('HOUR', sequelize.col('createdAt'))],
          order: [[sequelize.fn('HOUR', sequelize.col('createdAt')), 'ASC']],
          raw: true
        });

        // Fill in missing hours with zero values. Use bounds from where.createdAt if available
        const hourlyData = {};
        let fillStart = start;
        let fillEnd = end;
        try {
          if (where && where.createdAt && Array.isArray(where.createdAt[Op.between])) {
            fillStart = where.createdAt[Op.between][0];
            fillEnd = where.createdAt[Op.between][1];
          }
        } catch (err) {
          // ignore and fallback to original start/end
        }
        const startHour = (fillStart && typeof fillStart.getHours === 'function') ? fillStart.getHours() : 0;
        const endHour = (fillEnd && typeof fillEnd.getHours === 'function') ? fillEnd.getHours() : 23;

        // Initialize all hours with zero values
        for (let h = 0; h <= 23; h++) {
          hourlyData[h] = {
            period: `${h.toString().padStart(2, '0')}:00`,
            sales: 0,
            revenue: 0,
            tax: 0,
            discount: 0
          };
        }

        // Overlay actual values
        results.forEach(row => {
          // row.hour might be '08:00' or '08' depending on dialect; parseInt handles both
          const hour = parseInt(row.hour);
          if (Number.isNaN(hour)) return;
          hourlyData[hour] = {
            period: `${hour.toString().padStart(2, '0')}:00`,
            sales: parseInt(row.sales) || 0,
            revenue: parseFloat(row.revenue) || 0,
            tax: parseFloat(row.tax) || 0,
            discount: parseFloat(row.discount) || 0
          };
        });

        salesTrend = Object.values(hourlyData);
      } catch (err) {
        console.error('hourly aggregation failed:', err?.message || err);
        console.error(err?.stack || err);
        // Fallback: return a 24-hour zero-filled series so frontend still works
        for (let h = 0; h <= 23; h++) {
          salesTrend.push({
            period: `${h.toString().padStart(2, '0')}:00`,
            sales: 0,
            revenue: 0,
            tax: 0,
            discount: 0
          });
        }
      }
    } else {
      // daily/monthly
      salesTrend = await Sale.findAll({
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
      });
    }

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
      salesTrend: (salesTrend || []).map(row => {
        const get = (r, k) => (r && typeof r.getDataValue === 'function' ? r.getDataValue(k) : r && r[k]);
        return {
          period: get(row, 'period') || get(row, 'hour') || get(row, 'period'),
          sales: Number(get(row, 'sales') || 0),
          revenue: Number(get(row, 'revenue') || 0),
          tax: Number(get(row, 'tax') || 0),
          discount: Number(get(row, 'discount') || 0)
        };
      }),
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
    // Log detailed error for debugging (temporarily include stack in response)
    console.error('getSalesSummary error:', e?.message || e);
    console.error(e?.stack || e);
    res.status(500).json({ error: 'Failed to compute sales summary', message: e?.message, stack: e?.stack });
  }
};

// GET /api/reports/profit-loss?startDate=&endDate=&shopId=
exports.getProfitAndLoss = async (req, res) => {
  try {
    const { startDate, endDate, shopId: queryShopId } = req.query;
    const targetShopId = queryShopId ? parseInt(queryShopId, 10) : (req.shopId || req.user?.shopId);

    const where = { shopId: targetShopId, ...NON_CANCELLED_SALE_FILTER };
    const expenseWhere = { shopId: targetShopId };
    if (startDate || endDate) {
      const s = startDate ? new Date(startDate) : new Date('1970-01-01');
      const e = endDate ? new Date(endDate) : new Date();
      s.setHours(0,0,0,0);
      e.setHours(23,59,59,999);
      where.createdAt = { [Op.between]: [ s, e ] };
      expenseWhere.createdAt = { [Op.between]: [ s, e ] };
    }

    // Revenue components (exclude tax, subtract discounts)
    const [subtotalSum, discountSum, taxSum] = await Promise.all([
      Sale.sum('subtotal', { where }),
      Sale.sum('discount', { where }),
      Sale.sum('tax', { where }),
    ]);

    // If subtotal is null in some records, reconstruct revenue from items
    let revenuePreDiscount = Number(subtotalSum || 0);
    if (!revenuePreDiscount) {
      const row = await SaleItem.findOne({
        include: [{ model: Sale, required: true, where, attributes: [] }],
        attributes: [
          [sequelize.literal('SUM(SaleItem.quantity * COALESCE(NULLIF(SaleItem.price, 0), SaleItem.unitPrice, SaleItem.originalPrice, 0))'), 'amount']
        ],
        raw: true
      });
      revenuePreDiscount = Number(row?.amount || 0);
    }
    const totalDiscount = Number(discountSum || 0);
    const refundWhere = { shopId: targetShopId, status: 'processed' };
    if (where.createdAt) {
      refundWhere.createdAt = where.createdAt;
    }
    const totalRefunds = Number(await SaleRefund.sum('amount', { where: refundWhere }) || 0);
    const revenue = Math.max(0, revenuePreDiscount - totalDiscount - totalRefunds);

    // COGS from items (quantity * Product.cost)
    const cogsRow = await SaleItem.findOne({
      include: [
        { model: Sale, required: true, where, attributes: [] },
        { model: Product, required: true, attributes: [] }
      ],
      attributes: [[sequelize.literal('SUM(SaleItem.quantity * COALESCE(Product.cost, 0))'), 'cogs']],
      raw: true
    });
    const cogs = Number(cogsRow?.cogs || 0);

    // Operating expenses
    const operatingExpenses = Number(await Expense.sum('amount', { where: expenseWhere }) || 0);

    const grossProfit = revenue - cogs;
    const profit = grossProfit - operatingExpenses;

    // Backward-compatible fields
    const grossRevenue = revenuePreDiscount; // pre-discount, pre-tax subtotal
    const totalTax = Number(taxSum || 0);
    const netRevenue = revenue; // after discounts, before tax
    const totalExpenses = operatingExpenses;

    res.json({
      // New fields
      revenue,
      cogs,
      grossProfit,
      operatingExpenses,
      profit,
      // Legacy fields (kept for UI compatibility)
      grossRevenue,
      totalTax,
      totalDiscount,
      netRevenue,
      totalExpenses,
    });
  } catch (e) {
    console.error('getProfitAndLoss error:', e);
    res.status(500).json({ error: 'Failed to compute profit & loss' });
  }
};

// GET /api/reports/tax-estimate?startDate=&endDate=&rate=0.16
exports.getTaxEstimate = async (req, res) => {
  try {
    const { startDate, endDate, rate } = req.query;
    const taxRate = rate ? Number(rate) : 0.16; // default 16%
    const where = { shopId: req.user.shopId, ...NON_CANCELLED_SALE_FILTER };
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
    const where = {
      shopId: req.user.shopId,
      ...NON_CANCELLED_SALE_FILTER
    };
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
        [sequelize.literal('COALESCE(CAST(userId AS CHAR), employeeId)'), 'performerId'],
        [sequelize.fn('COUNT', sequelize.col('Sale.id')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue'],
        [sequelize.fn('AVG', sequelize.col('total')), 'averageSaleValue']
      ],
      group: [sequelize.literal('COALESCE(CAST(userId AS CHAR), employeeId)')],
      order: [[sequelize.literal('totalRevenue'), 'DESC']],
      limit: Number(limit),
      raw: true
    });

    const userIds = [];
    const employeeIds = [];
    rows.forEach(r => {
      const pid = r.performerId;
      if (pid) {
        if (/^[0-9]+$/.test(pid)) {
          userIds.push(parseInt(pid, 10));
        } else {
          employeeIds.push(pid);
        }
      }
    });

    const [users, employees] = await Promise.all([
      User.findAll({
        where: { id: userIds, shopId: req.user.shopId },
        attributes: ['id', 'name', 'email']
      }),
      Employee.findAll({
        where: { id: employeeIds, shopId: req.user.shopId },
        attributes: ['id', 'firstName', 'lastName', 'email', 'position']
      })
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u]));
    const employeeMap = new Map(employees.map(e => [String(e.id), e]));

    const result = [];
    for (const r of rows) {
      const pid = r.performerId;
      if (!pid) continue;

      let performerName = 'Unknown Performer';
      let performerType = 'user';
      let role = '';

      if (userMap.has(pid)) {
        const u = userMap.get(pid);
        performerName = u.name;
        performerType = 'user';
        role = 'Manager';
      } else if (employeeMap.has(pid)) {
        const e = employeeMap.get(pid);
        performerName = `${e.firstName} ${e.lastName}`.trim();
        performerType = 'employee';
        role = e.position === 'cashier' ? 'Cashier' : e.position === 'manager' ? 'Manager' : e.position;
      }

      result.push({
        performerId: pid,
        performerName,
        performerType,
        role,
        totalSales: Number(r.totalSales || 0),
        totalRevenue: Number(r.totalRevenue || 0),
        averageSaleValue: Number(r.averageSaleValue || 0)
      });
    }

    res.json(result);
  } catch (e) {
    console.error('Failed to compute employee sales:', e);
    res.status(500).json({ error: 'Failed to compute employee sales' });
  }
};


