const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Expense = require('../models/Expense');
const SaleItem = require('../models/SaleItem');
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const insightsConfig = require('../config/insightsConfig');
const axios = require('axios');
const aiClient = require('../utils/aiClient');
const { NON_CANCELLED_SALE_FILTER } = require('../constants/saleFilters');

const formatCurrency = (amount) => `KSh ${Number(amount || 0).toLocaleString()}`;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Calculate trends from sales and inventory data
 */
const calculateTrends = async (shopId) => {
  const currentDate = new Date();
  const lastMonth = new Date(currentDate.setMonth(currentDate.getMonth() - 1));

  // Get sales trends
  const salesTrends = await Sale.findAll({
    where: {
      shopId,
      ...NON_CANCELLED_SALE_FILTER,
      createdAt: {
        [Op.gte]: lastMonth
      }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.cast(sequelize.fn('SUM', sequelize.col('total')), 'DECIMAL(10,2)'), 'totalSales']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
  });

  // Convert to plain objects and ensure totalSales is a number
  const formattedTrends = salesTrends.map(trend => ({
    date: trend.get('date'),
    totalSales: parseFloat(trend.get('totalSales') || 0)
  }));

  return formattedTrends;
};

/**
 * Generate business recommendations based on data analysis
 */
const generateRecommendations = async (shopId) => {
  const recommendations = [];

  // Check low stock products
  const lowStockProducts = await Product.findAll({
    where: {
      shopId,
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
      shopId,
      createdAt: {
        [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 1))
      }
    },
    attributes: [
      'category',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total']
    ],
    group: ['category']
  });

  // Check for high expense categories
  const highExpenseCategories = monthlyExpenses
    .filter(exp => exp.getDataValue('total') > insightsConfig.HIGH_EXPENSE_THRESHOLD)
    .map(exp => ({
      category: exp.category,
      amount: exp.getDataValue('total')
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
 * Rule-based sales anomaly alerts (fallback when AI unavailable)
 */
const generateRuleBasedAlerts = async (shopId) => {
  const alerts = [];
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const weeklySales = await Sale.findAll({
    where: {
      shopId,
      createdAt: { [Op.gte]: lastWeek }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'saleCount'],
      [sequelize.fn('SUM', sequelize.col('total')), 'total']
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))]
  });

  if (weeklySales.length > 0) {
    const averageDailySales = weeklySales.reduce((acc, sale) =>
      acc + parseFloat(sale.getDataValue('total')), 0) / weeklySales.length;

    const latestSale = weeklySales[weeklySales.length - 1];
    if (latestSale && latestSale.getDataValue('total') < averageDailySales * insightsConfig.SALES_DROP_THRESHOLD) {
      alerts.push({
        type: 'SALES',
        severity: 'MEDIUM',
        message: 'Significant drop in daily sales detected',
        details: {
          date: latestSale.getDataValue('date'),
          amount: latestSale.getDataValue('total'),
          average: averageDailySales
        }
      });
    }
  }

  return alerts;
};

/**
 * AI-powered sales anomaly detection using Isolation Forest
 */
const generateSmartAlerts = async (shopId, userId) => {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const dailySales = await Sale.findAll({
    where: {
      shopId,
      saleStatus: 'completed',
      createdAt: { [Op.gte]: ninetyDaysAgo }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
      [sequelize.fn('AVG', sequelize.col('total')), 'avg_transaction_value'],
    ],
    group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
    order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    raw: true
  });

  if (dailySales.length < 14) {
    return generateRuleBasedAlerts(shopId);
  }

  try {
    const aiResponse = await aiClient.post(
      `/api/insights/anomalies`,
      { daily_data: dailySales, contamination: 0.05 },
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId }
    );

    return aiResponse.data.anomalies.slice(0, 3).map((anomaly) => ({
      type: 'sales_anomaly',
      severity: anomaly.severity,
      title: `Unusual sales pattern detected on ${anomaly.date}`,
      description: `Revenue was ${formatCurrency(anomaly.revenue)} with ${anomaly.transaction_count} transactions — statistically unusual for this day of week.`,
      recommendation: 'Review what happened on this date. Compare with external events, promotions, or operational issues.',
      date: anomaly.date,
      anomaly_score: anomaly.anomaly_score
    }));
  } catch (error) {
    console.error('[generateSmartAlerts] AI service unavailable, using rule-based fallback:', error.message);
    return generateRuleBasedAlerts(shopId);
  }
};

/**
 * Prophet-based stock depletion forecast via AI service
 */
const getStockDepletionForecast = async (shopId, userId) => {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const products = await Product.findAll({
    where: { shopId, active: true },
    attributes: ['id', 'name', 'stockQuantity']
  });

  if (!products.length) return [];

  const dailySalesRows = await SaleItem.findAll({
    where: { shopId, createdAt: { [Op.gte]: ninetyDaysAgo } },
    attributes: [
      'productId',
      [sequelize.fn('DATE', sequelize.col('SaleItem.createdAt')), 'date'],
      [sequelize.fn('SUM', sequelize.col('quantity')), 'quantity'],
    ],
    group: ['productId', sequelize.fn('DATE', sequelize.col('SaleItem.createdAt'))],
    raw: true
  });

  const salesByProduct = {};
  for (const row of dailySalesRows) {
    const pid = row.productId;
    if (!salesByProduct[pid]) salesByProduct[pid] = [];
    salesByProduct[pid].push({ date: row.date, quantity: parseFloat(row.quantity || 0) });
  }

  const payload = {
    products: products.map((p) => ({
      product_id: String(p.id),
      product_name: p.name,
      current_stock: parseFloat(p.stockQuantity || 0),
      daily_sales: salesByProduct[p.id] || []
    })),
    alert_threshold_days: insightsConfig.STOCK_DEPLETION_DAYS
  };

  try {
    const aiResponse = await aiClient.post(
      `/api/forecasting/stock-depletion`,
      payload,
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId }
    );

    return (aiResponse.data.alerts || []).map((item) => ({
      id: item.product_id,
      name: item.product_name,
      daysToDeplete: item.days_until_depletion,
      algorithm: item.algorithm,
      confidence: item.confidence
    }));
  } catch (error) {
    console.error('[getStockDepletionForecast] AI service unavailable, using linear fallback:', error.message);

    const lookbackDays = insightsConfig.SALES_VELOCITY_LOOKBACK_DAYS;
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - lookbackDays);

    const salesByProductAgg = await SaleItem.findAll({
      where: { shopId, createdAt: { [Op.gte]: twoWeeksAgo } },
      attributes: [
        'productId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'qty']
      ],
      include: [{ model: Product, attributes: ['id', 'name', 'stockQuantity'], where: { shopId } }],
      group: ['productId'],
    });

    const soonOut = [];
    for (const row of salesByProductAgg) {
      const prod = row.Product;
      if (!prod) continue;
      const sold = Number(row.getDataValue('qty') || 0);
      const daily = sold / lookbackDays;
      if (daily > 0) {
        const days = prod.stockQuantity / daily;
        if (days > 0 && days <= insightsConfig.STOCK_DEPLETION_DAYS) {
          soonOut.push({ id: prod.id, name: prod.name, daysToDeplete: Math.ceil(days) });
        }
      }
    }
    return soonOut;
  }
};

/**
 * Generate business alerts based on critical metrics
 */
const generateAlerts = async (shopId, userId) => {
  const alerts = [];

  const criticalStock = await Product.findAll({
    where: {
      shopId,
      stockQuantity: {
        [Op.lte]: insightsConfig.CRITICAL_STOCK_UNITS
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

  const salesAlerts = await generateSmartAlerts(shopId, userId);
  alerts.push(...salesAlerts);

  return alerts;
};

/**
 * Get all business insights
 */
const getInsights = async (req, res) => {
  try {
    if (!req.shopId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const shopId = req.shopId;

    const [trends, recommendations, alerts] = await Promise.all([
      calculateTrends(shopId),
      generateRecommendations(shopId),
      generateAlerts(shopId, req.user?.id)
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
      Sale.sum('total', { where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt: { [Op.gte]: startThisWeek } } }),
      Sale.sum('total', { where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt: { [Op.between]: [startPrevWeek, new Date(startThisWeek.getTime()-1)] } } }),
    ]);
    if (thisWeekRevenue != null && prevWeekRevenue) {
      const change = prevWeekRevenue === 0 ? 0 : ((thisWeekRevenue - prevWeekRevenue) / prevWeekRevenue);
      if (change < -insightsConfig.REVENUE_DECLINE_THRESHOLD) {
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
      where: { shopId },
      attributes: [
        'ProductId',
        [sequelize.fn('SUM', sequelize.literal('(SaleItem.unitPrice - Product.cost - SaleItem.discount) * SaleItem.quantity')), 'profit']
      ],
      include: [{ model: Product, attributes: ['id','name','cost'], where: { shopId } }],
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

    // 3) Stock depletion forecast (Prophet via AI service)
    const soonOut = await getStockDepletionForecast(shopId, req.user?.id);
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
      } catch (err) {
        console.error('[InsightsController] Market alerts fetch failed:', err.message);
      }
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
        where: { shopId, ...NON_CANCELLED_SALE_FILTER },
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
        where: { shopId },
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
        where: { shopId, ...NON_CANCELLED_SALE_FILTER },
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

      // Get JWT token from request headers to forward to AI service
      const authHeader = req.headers.authorization || req.headers.Authorization;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), insightsConfig.AI_SERVICE_TIMEOUT_MS);
      const resp = await fetch(`${aiServiceUrl}/api/insights/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
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
      console.error('[InsightsController] AI service call failed:', e.message);
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

const getCustomerSegments = async (req, res) => {
  const shopId = req.shopId;
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const customerMetrics = await Sale.findAll({
      where: { shopId, saleStatus: 'completed' },
      attributes: [
        'customerId',
        [sequelize.fn('SUM', sequelize.col('total')), 'total_spend'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'purchase_frequency'],
        [sequelize.fn('AVG', sequelize.col('total')), 'avg_transaction_value'],
        [sequelize.fn('DATEDIFF', sequelize.fn('NOW'), sequelize.fn('MAX', sequelize.col('createdAt'))), 'days_since_last_purchase'],
      ],
      group: ['customerId'],
      having: sequelize.where(sequelize.col('customerId'), { [Op.ne]: null }),
      raw: true
    });

    if (customerMetrics.length < 10) {
      return res.json({
        segments: [],
        message: `Only ${customerMetrics.length} customers found. Need at least 10 for segmentation.`,
        total_customers_analyzed: customerMetrics.length
      });
    }

    const aiResponse = await aiClient.post(
      `/api/insights/customer-segments`,
      { customers: customerMetrics },
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId: req.user?.id }
    );

    res.json(aiResponse.data);
  } catch (error) {
    console.error('[getCustomerSegments] Error:', error.message);
    if (error.status === 503) {
      return res.status(503).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to generate customer segments' });
  }
};

const getMonthlyRevenue = async (req, res) => {
  const shopId = req.shopId;
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const salesByMonth = await Sale.findAll({
      where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt: { [Op.gte]: twelveMonthsAgo } },
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m-01'), 'month'],
        [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
      ],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m-01')],
      order: [[sequelize.literal('month'), 'ASC']],
      raw: true
    });

    res.json({
      dates: salesByMonth.map((r) => r.month),
      values: salesByMonth.map((r) => parseFloat(r.revenue || 0)),
    });
  } catch (error) {
    console.error('[getMonthlyRevenue] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch monthly revenue' });
  }
};

const getDailySales = async (req, res) => {
  const shopId = req.shopId;
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const dailySales = await Sale.findAll({
      where: {
        shopId,
        saleStatus: 'completed',
        createdAt: { [Op.gte]: ninetyDaysAgo }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('total')), 'revenue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('AVG', sequelize.col('total')), 'avg_transaction_value'],
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    const dates = dailySales.map(d => d.date);
    const values = dailySales.map(d => parseFloat(d.revenue || 0));

    res.json({
      dates,
      values,
      daily_data: dailySales
    });
  } catch (error) {
    console.error('[getDailySales] Error:', error.message);
    res.status(500).json({ error: 'Failed to fetch daily sales' });
  }
};

const getStockDepletion = async (req, res) => {
  const shopId = req.shopId;
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const products = await Product.findAll({
      where: { shopId, active: true },
      attributes: ['id', 'name', 'stockQuantity']
    });

    const dailySalesRows = await SaleItem.findAll({
      where: { shopId, createdAt: { [Op.gte]: ninetyDaysAgo } },
      attributes: [
        'productId',
        [sequelize.fn('DATE', sequelize.col('SaleItem.createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'quantity'],
      ],
      group: ['productId', sequelize.fn('DATE', sequelize.col('SaleItem.createdAt'))],
      raw: true
    });

    const salesByProduct = {};
    for (const row of dailySalesRows) {
      const pid = row.productId;
      if (!salesByProduct[pid]) salesByProduct[pid] = [];
      salesByProduct[pid].push({ date: row.date, quantity: parseFloat(row.quantity || 0) });
    }

    const aiResponse = await aiClient.post(
      `/api/forecasting/stock-depletion`,
      {
        products: products.map((p) => ({
          product_id: String(p.id),
          product_name: p.name,
          current_stock: parseFloat(p.stockQuantity || 0),
          daily_sales: salesByProduct[p.id] || []
        })),
        alert_threshold_days: insightsConfig.STOCK_DEPLETION_DAYS
      },
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId: req.user?.id }
    );

    res.json(aiResponse.data);
  } catch (error) {
    console.error('[getStockDepletion] Error:', error.message);
    if (error.status === 503) {
      return res.status(503).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to generate stock depletion forecast' });
  }
};

module.exports = {
  getInsights,
  getCustomerSegments,
  getMonthlyRevenue,
  getDailySales,
  getStockDepletion,
};
