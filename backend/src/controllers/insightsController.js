const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Expense = require('../models/Expense');
const SaleItem = require('../models/SaleItem');
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Calculate trends from sales and inventory data
 */
const calculateTrends = async () => {
  const currentDate = new Date();
  const lastMonth = new Date(currentDate.setMonth(currentDate.getMonth() - 1));

  // Get sales trends
  const salesTrends = await Sale.findAll({
    where: {
      createdAt: {
        [Op.gte]: lastMonth
      }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('SUM', sequelize.col('total')), 'totalSales']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
  });

  return salesTrends;
};

/**
 * Generate business recommendations based on data analysis
 */
const generateRecommendations = async () => {
  const recommendations = [];

  // Check low stock products
  const lowStockProducts = await Product.findAll({
    where: {
      stockQuantity: {
        [Op.lte]: sequelize.col('reorderPoint')
      }
    }
  });

  if (lowStockProducts.length > 0) {
    recommendations.push({
      type: 'INVENTORY',
      priority: 'HIGH',
      message: `${lowStockProducts.length} products need restocking`,
      details: lowStockProducts.map(p => ({
        id: p.id,
        name: p.name,
        currentStock: p.stockQuantity,
        reorderPoint: p.reorderPoint
      }))
    });
  }

  // Analyze expenses
  const monthlyExpenses = await Expense.findAll({
    where: {
      createdAt: {
        [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 1))
      }
    },
    attributes: [
      'category',
      [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
    ],
    group: ['category']
  });

  // Check for high expense categories
  const highExpenseCategories = monthlyExpenses
    .filter(exp => exp.getDataValue('totalAmount') > 5000) // Threshold can be adjusted
    .map(exp => ({
      category: exp.category,
      amount: exp.getDataValue('totalAmount')
    }));

  if (highExpenseCategories.length > 0) {
    recommendations.push({
      type: 'FINANCIAL',
      priority: 'MEDIUM',
      message: 'High expenses detected in certain categories',
      details: highExpenseCategories
    });
  }

  return recommendations;
};

/**
 * Generate business alerts based on critical metrics
 */
const generateAlerts = async () => {
  const alerts = [];

  // Check for critical stock levels
  const criticalStock = await Product.findAll({
    where: {
      stockQuantity: {
        [Op.lte]: 5 // Critical threshold
      }
    }
  });

  if (criticalStock.length > 0) {
    alerts.push({
      type: 'INVENTORY',
      severity: 'HIGH',
      message: 'Critical stock levels detected',
      details: criticalStock.map(p => ({
        id: p.id,
        name: p.name,
        currentStock: p.stockQuantity
      }))
    });
  }

  // Check for unusual sales patterns
  const today = new Date();
  const lastWeek = new Date(today.setDate(today.getDate() - 7));
  
  const weeklySales = await Sale.findAll({
    where: {
      createdAt: {
        [Op.gte]: lastWeek
      }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'saleCount'],
      [sequelize.fn('SUM', sequelize.col('total')), 'totalAmount']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))]
  });

  // Analyze for significant drops in sales
  if (weeklySales.length > 0) {
    const averageDailySales = weeklySales.reduce((acc, sale) => 
      acc + parseFloat(sale.getDataValue('totalAmount')), 0) / weeklySales.length;
    
    const latestSale = weeklySales[weeklySales.length - 1];
    if (latestSale && latestSale.getDataValue('totalAmount') < averageDailySales * 0.5) {
      alerts.push({
        type: 'SALES',
        severity: 'MEDIUM',
        message: 'Significant drop in daily sales detected',
        details: {
          date: latestSale.getDataValue('date'),
          amount: latestSale.getDataValue('totalAmount'),
          average: averageDailySales
        }
      });
    }
  }

  return alerts;
};

/**
 * Get all business insights
 */
const getInsights = async (req, res) => {
  try {
    const [trends, recommendations, alerts] = await Promise.all([
      calculateTrends(),
      generateRecommendations(),
      generateAlerts()
    ]);

    // Smart dashboard insights (heuristics)
    const smartRecommendations = [];

    // 1) Week-over-week sales change
    const now = new Date();
    const startThisWeek = new Date(now);
    startThisWeek.setDate(now.getDate() - 6);
    startThisWeek.setHours(0,0,0,0);
    const startPrevWeek = new Date(startThisWeek);
    startPrevWeek.setDate(startPrevWeek.getDate() - 7);

    const [thisWeekRevenue, prevWeekRevenue] = await Promise.all([
      Sale.sum('total', { where: { createdAt: { [Op.gte]: startThisWeek } } }),
      Sale.sum('total', { where: { createdAt: { [Op.between]: [startPrevWeek, new Date(startThisWeek.getTime()-1)] } } }),
    ]);
    if (thisWeekRevenue != null && prevWeekRevenue) {
      const change = prevWeekRevenue === 0 ? 0 : ((thisWeekRevenue - prevWeekRevenue) / prevWeekRevenue);
      if (change < -0.01) {
        smartRecommendations.push({
          type: 'INSIGHT',
          priority: 'MEDIUM',
          message: `You sold ${(Math.abs(change)*100).toFixed(0)}% less this week. Consider restocking fast movers.`,
          details: []
        });
      }
    }

    // 2) Most profitable product (approx)
    const profitRows = await SaleItem.findAll({
      attributes: [
        'ProductId',
        [sequelize.fn('SUM', sequelize.literal('(SaleItem.unitPrice - Product.cost - SaleItem.discount) * SaleItem.quantity')), 'profit']
      ],
      include: [{ model: Product, attributes: ['id','name','cost'] }],
      group: ['ProductId'],
      order: [[sequelize.literal('profit'), 'DESC']],
      limit: 1,
    });
    if (profitRows && profitRows.length > 0) {
      const pr = profitRows[0];
      const name = pr.Product?.name || pr.ProductId;
      const profit = Number(pr.getDataValue('profit') || 0);
      smartRecommendations.push({
        type: 'INSIGHT',
        priority: 'LOW',
        message: `Your most profitable product is ${name}.`,
        details: [{ profit }]
      });
    }

    // 3) Stock depletion forecast (simple)
    const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const salesByProduct = await SaleItem.findAll({
      attributes: [
        'ProductId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'qty']
      ],
      include: [{ model: Product, attributes: ['id','name','stockQuantity'] }],
      where: { createdAt: { [Op.gte]: twoWeeksAgo } },
      group: ['ProductId'],
    });
    const soonOut = [];
    for (const row of salesByProduct) {
      const prod = row.Product; if (!prod) continue;
      const sold = Number(row.getDataValue('qty') || 0);
      const daily = sold / 14;
      if (daily > 0) {
        const days = prod.stockQuantity / daily;
        if (days > 0 && days <= 7) {
          soonOut.push({ id: prod.id, name: prod.name, daysToDeplete: Math.ceil(days) });
        }
      }
    }
    if (soonOut.length) {
      smartRecommendations.push({
        type: 'FORECAST',
        priority: 'HIGH',
        message: 'Stock depletion forecast',
        details: soonOut
      });
    }

    // 4) Decision support suggestions (simple rules)
    if (profitRows && profitRows.length > 0) {
      smartRecommendations.push({
        type: 'DECISION',
        priority: 'LOW',
        message: 'Based on margins, a small price increase (e.g., 5%) on top performers may not impact sales.',
        details: []
      });
    }

    // 5) Policy & market alerts (prototype placeholder)
    const marketAlerts = [];
    if (process.env.MARKET_ALERTS_ENABLED === 'true') {
      try {
        const resp = await fetch(process.env.MARKET_ALERTS_URL, { method: 'GET' });
        if (resp.ok) {
          const data = await resp.json();
          for (const a of (Array.isArray(data)?data:[])) {
            marketAlerts.push({ type: 'MARKET', severity: 'LOW', message: a.title || 'Market advisory', details: a });
          }
        }
      } catch (_) {}
    }

    // Try augmenting with AI-driven insights
    let aiRecs = [];
    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';

      // Build simple monthly aggregates for the last 6 months
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
      }

      // Revenue and transactions from Sales
      const salesByMonth = await Sale.findAll({
        attributes: [
          [sequelize.fn('YEAR', sequelize.col('createdAt')), 'y'],
          [sequelize.fn('MONTH', sequelize.col('createdAt')), 'm'],
          [sequelize.fn('SUM', sequelize.col('total')), 'sumTotal'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'countSales'],
        ],
        group: [sequelize.fn('YEAR', sequelize.col('createdAt')), sequelize.fn('MONTH', sequelize.col('createdAt'))],
      });

      const salesMap = new Map();
      for (const row of salesByMonth) {
        const y = row.getDataValue('y');
        const m = row.getDataValue('m');
        salesMap.set(`${y}-${m}`, {
          revenue: parseFloat(row.getDataValue('sumTotal') || 0),
          tx: parseInt(row.getDataValue('countSales') || 0, 10),
        });
      }

      // Costs from Expenses
      const expenseByMonth = await Expense.findAll({
        attributes: [
          [sequelize.fn('YEAR', sequelize.col('createdAt')), 'y'],
          [sequelize.fn('MONTH', sequelize.col('createdAt')), 'm'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'sumAmount'],
        ],
        group: [sequelize.fn('YEAR', sequelize.col('createdAt')), sequelize.fn('MONTH', sequelize.col('createdAt'))],
      });

      const expMap = new Map();
      for (const row of expenseByMonth) {
        const y = row.getDataValue('y');
        const m = row.getDataValue('m');
        expMap.set(`${y}-${m}`, parseFloat(row.getDataValue('sumAmount') || 0));
      }

      // Customers per month (distinct)
      const custByMonth = await Sale.findAll({
        attributes: [
          [sequelize.fn('YEAR', sequelize.col('createdAt')), 'y'],
          [sequelize.fn('MONTH', sequelize.col('createdAt')), 'm'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('CustomerId'))), 'distinctCustomers'],
        ],
        group: [sequelize.fn('YEAR', sequelize.col('createdAt')), sequelize.fn('MONTH', sequelize.col('createdAt'))],
      });
      const custMap = new Map();
      for (const row of custByMonth) {
        const y = row.getDataValue('y');
        const m = row.getDataValue('m');
        custMap.set(`${y}-${m}`, parseInt(row.getDataValue('distinctCustomers') || 0, 10));
      }

      const revenue = [];
      const costs = [];
      const customer_count = [];
      const transaction_count = [];
      const average_transaction_value = [];

      for (const { year, month } of months) {
        const key = `${year}-${month}`;
        const s = salesMap.get(key) || { revenue: 0, tx: 0 };
        const c = expMap.get(key) || 0;
        const cust = custMap.get(key) || 0;
        revenue.push(s.revenue);
        costs.push(c);
        customer_count.push(cust);
        transaction_count.push(s.tx);
        average_transaction_value.push(s.tx > 0 ? s.revenue / s.tx : 0);
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(`${aiServiceUrl}/api/insights/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revenue, costs, customer_count, transaction_count, average_transaction_value }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const ai = await resp.json();
        if (Array.isArray(ai)) {
          aiRecs = ai.map((x) => ({
            type: x.insight_type || 'AI',
            priority: 'MEDIUM',
            message: x.description || 'AI insight',
            details: x.recommendations || [],
          }));
        }
      }
    } catch (e) {
      // Silent fallback; keep rule-based insights only
    }

    res.json({
      trends,
      recommendations: [...smartRecommendations, ...recommendations, ...aiRecs],
      alerts: [...alerts, ...marketAlerts],
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
};

module.exports = {
  getInsights
};
