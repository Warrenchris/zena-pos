const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Expense = require('../models/Expense');
const SaleItem = require('../models/SaleItem');
const SaleRefund = require('../models/SaleRefund');
const SystemSettings = require('../models/SystemSettings');
require('../models'); // Ensure all Sequelize model associations are initialized
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const insightsConfig = require('../config/insightsConfig');
const axios = require('axios');
const aiClient = require('../utils/aiClient');
const { NON_CANCELLED_SALE_FILTER, REALIZED_SALE_FILTER, NET_SALE_REVENUE_SQL } = require('../constants/saleFilters');
const { getInsightsCache, setInsightsCache } = require('../services/insightsCacheService');

const formatCurrency = (amount) => `KSh ${Number(amount || 0).toLocaleString()}`;
const AI_SERVICE_URL = process.env.AI_SERVICE_BASE_URL || process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const getAuthorizedShopId = (req) => {
  const defaultShopId = req.authz?.scope?.activeShopId || req.shopId || req.user?.shopId;
  if (req.query?.shopId !== undefined && req.query?.shopId !== null && req.query?.shopId !== '') {
    const requestedShopId = parseInt(req.query.shopId, 10);
    if (Number.isNaN(requestedShopId) || requestedShopId <= 0) {
      return null;
    }
    if (req.authz?.scope?.hasShopAccess && typeof req.authz.scope.hasShopAccess === 'function') {
      return req.authz.scope.hasShopAccess(requestedShopId) ? requestedShopId : null;
    }
    if (req.user) {
      const role = req.user.role || 'user';
      if ((req.user.isEmployee && role !== 'manager') || role === 'cashier' || !['admin', 'org_admin', 'manager', 'super_admin'].includes(role)) {
        return Number(req.user.shopId) === requestedShopId ? requestedShopId : null;
      }
      if (Array.isArray(req.user.accessibleShopIds) && !req.user.isOwner && !['org_admin', 'super_admin'].includes(role)) {
        return req.user.accessibleShopIds.map(Number).includes(requestedShopId) ? requestedShopId : null;
      }
    }
    return requestedShopId;
  }
  return defaultShopId;
};

/**
 * Calculate trends from sales and inventory data
 */
const calculateTrends = async (shopId) => {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

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

  // Check low stock products using reorderPoint or SystemSettings.lowStockThreshold fallback
  const settings = await SystemSettings.findOne({ where: { shopId } });
  const defaultLowStock = settings?.lowStockThreshold !== undefined ? settings.lowStockThreshold : 10;

  const inventoryRows = await Inventory.findAll({
    where: { shopId },
    include: [{
      model: Product,
      attributes: ['id', 'name', 'active'],
      where: { active: true },
      required: false
    }]
  });
  const lowStockProducts = inventoryRows.filter(inv => {
    const threshold = (inv.reorderPoint !== null && inv.reorderPoint !== undefined) ? inv.reorderPoint : defaultLowStock;
    return parseFloat(inv.stockQuantity || 0) <= threshold;
  });

  if (lowStockProducts.length > 0) {
    recommendations.push({
      type: 'INVENTORY',
      priority: 'HIGH',
      message: `${lowStockProducts.length} products need restocking`,
      details: lowStockProducts.map(inv => ({
        id: inv.Product ? inv.Product.id : inv.productId,
        name: inv.Product ? inv.Product.name : 'Unknown Product',
        currentStock: parseFloat(inv.stockQuantity || 0),
        reorderPoint: (inv.reorderPoint !== null && inv.reorderPoint !== undefined) ? inv.reorderPoint : defaultLowStock
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
      ...REALIZED_SALE_FILTER,
      createdAt: { [Op.gte]: lastWeek }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'saleCount'],
      [sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'total']
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
const generateSmartAlerts = async (shopId, userOrId, aiTracker) => {
  const user = typeof userOrId === 'object' && userOrId !== null ? userOrId : null;
  const userId = user?.id || (typeof userOrId === 'number' || typeof userOrId === 'string' ? userOrId : null);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const dailySales = await Sale.findAll({
    where: {
      shopId,
      ...REALIZED_SALE_FILTER,
      createdAt: { [Op.gte]: ninetyDaysAgo }
    },
    attributes: [
      [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
      [sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'revenue'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
      [sequelize.literal(`AVG(${NET_SALE_REVENUE_SQL})`), 'avg_transaction_value'],
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
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId, user: user || (userId ? { id: userId } : null) }
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
    if (aiTracker) aiTracker.failed = true;
    return generateRuleBasedAlerts(shopId);
  }
};

/**
 * Helper to build Sequelize query options for retrieving net sales demand
 * from SaleItems, joined with Sales and adjusted for processed refunds.
 * Strictly excludes cancelled, refunded, pending, and failed transactions,
 * accounts for partial refunds without double-subtracting when a single sale
 * contains multiple SaleItem rows for the same productId, and preserves shop isolation.
 */
const buildNetDemandQuery = (shopId, sinceDate, groupByDate = true) => {
  const saleProductNetExpr = `(
    COALESCE((
      SELECT SUM(\`si_sum\`.\`quantity\`)
      FROM \`SaleItems\` AS \`si_sum\`
      WHERE \`si_sum\`.\`saleId\` = \`SaleItem\`.\`saleId\`
        AND \`si_sum\`.\`productId\` = \`SaleItem\`.\`productId\`
    ), 0) - COALESCE((
      SELECT SUM(\`sr\`.\`quantity\`)
      FROM \`SaleRefunds\` AS \`sr\`
      WHERE \`sr\`.\`saleId\` = \`SaleItem\`.\`saleId\`
        AND \`sr\`.\`productId\` = \`SaleItem\`.\`productId\`
        AND \`sr\`.\`status\` = 'processed'
    ), 0)
  )`;

  const netQtyLiteral = `SUM(
    CASE
      WHEN \`SaleItem\`.\`id\` = (
        SELECT MIN(\`si_min\`.\`id\`)
        FROM \`SaleItems\` AS \`si_min\`
        WHERE \`si_min\`.\`saleId\` = \`SaleItem\`.\`saleId\`
          AND \`si_min\`.\`productId\` = \`SaleItem\`.\`productId\`
      ) AND ${saleProductNetExpr} > 0
      THEN ${saleProductNetExpr}
      ELSE 0
    END
  )`;

  const attributes = groupByDate
    ? [
        'productId',
        [sequelize.fn('DATE', sequelize.col('SaleItem.createdAt')), 'date'],
        [sequelize.literal(netQtyLiteral), 'quantity']
      ]
    : [
        'productId',
        [sequelize.literal(netQtyLiteral), 'qty']
      ];

  const group = groupByDate
    ? ['productId', sequelize.fn('DATE', sequelize.col('SaleItem.createdAt'))]
    : ['productId'];

  return {
    include: [{
      model: Sale,
      required: true,
      attributes: [],
      where: {
        shopId,
        ...REALIZED_SALE_FILTER
      }
    }],
    where: {
      shopId,
      createdAt: { [Op.gte]: sinceDate }
    },
    attributes,
    group,
    raw: true
  };
};

/**
 * Prophet-based stock depletion forecast via AI service
 */
const getStockDepletionForecast = async (shopId, userOrId, aiTracker) => {
  const user = typeof userOrId === 'object' && userOrId !== null ? userOrId : null;
  const userId = user?.id || (typeof userOrId === 'number' || typeof userOrId === 'string' ? userOrId : null);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const products = await Product.findAll({
    where: { active: true },
    attributes: ['id', 'name'],
    include: [{
      model: Inventory,
      attributes: ['stockQuantity'],
      where: { shopId },
      required: true
    }]
  });

  if (!products.length) return [];

  const dailySalesRows = await SaleItem.findAll(buildNetDemandQuery(shopId, ninetyDaysAgo, true));

  const salesByProduct = {};
  for (const row of dailySalesRows) {
    const pid = row.productId;
    const qty = parseFloat(row.quantity || 0);
    if (qty <= 0) continue;
    if (!salesByProduct[pid]) salesByProduct[pid] = [];
    salesByProduct[pid].push({ date: row.date, quantity: qty });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const payload = {
    products: products.map((p) => ({
      product_id: String(p.id),
      product_name: p.name,
      current_stock: parseFloat(p.Inventories?.[0]?.stockQuantity || 0),
      daily_sales: salesByProduct[p.id] || [],
      lookback_days: 90,
      reference_date: todayIso
    })),
    alert_threshold_days: insightsConfig.STOCK_DEPLETION_DAYS,
    lookback_days: 90,
    reference_date: todayIso
  };

  try {
    const aiResponse = await aiClient.post(
      `/api/forecasting/stock-depletion`,
      payload,
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId, user: user || (userId ? { id: userId } : null) }
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
    if (aiTracker) aiTracker.failed = true;

    const lookbackDays = insightsConfig.SALES_VELOCITY_LOOKBACK_DAYS;
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - lookbackDays);

    const salesByProductAgg = await SaleItem.findAll(buildNetDemandQuery(shopId, twoWeeksAgo, false));
    const soldMap = new Map(salesByProductAgg.map(r => [r.productId, Number(r.qty || 0)]));

    const soonOut = [];
    for (const prod of products) {
      const invStock = parseFloat(prod.Inventories?.[0]?.stockQuantity || 0);
      if (invStock <= 0) {
        soonOut.push({ id: prod.id, name: prod.name, daysToDeplete: 0 });
        continue;
      }
      const sold = soldMap.get(prod.id) || 0;
      const daily = sold / lookbackDays;
      if (daily > 0) {
        const days = invStock / daily;
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
const generateAlerts = async (shopId, userOrId, aiTracker) => {
  const alerts = [];

  const criticalInventories = await Inventory.findAll({
    where: {
      shopId,
      stockQuantity: {
        [Op.lte]: insightsConfig.CRITICAL_STOCK_UNITS
      }
    },
    include: [{
      model: Product,
      attributes: ['id', 'name', 'active'],
      where: { active: true },
      required: false
    }]
  });

  if (criticalInventories.length > 0) {
    alerts.push({
      type: 'INVENTORY',
      severity: 'HIGH',
      message: 'Critical stock levels detected',
      details: criticalInventories.map(inv => ({
        id: inv.Product ? inv.Product.id : inv.productId,
        name: inv.Product ? inv.Product.name : 'Unknown Product',
        currentStock: parseFloat(inv.stockQuantity || 0)
      }))
    });
  }

  const salesAlerts = await generateSmartAlerts(shopId, userOrId, aiTracker);
  alerts.push(...salesAlerts);

  return alerts;
};

/**
 * Get all business insights
 */
const getInsights = async (req, res) => {
  try {
    const shopId = getAuthorizedShopId(req);
    if (!shopId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cached = await getInsightsCache(req, shopId);
    if (cached) {
      return res.json(cached);
    }

    const aiTracker = { failed: false };

    const [trends, recommendations, alerts] = await Promise.all([
      calculateTrends(shopId),
      generateRecommendations(shopId),
      generateAlerts(shopId, req.user, aiTracker)
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

    const [thisWeekRevenueRow, prevWeekRevenueRow] = await Promise.all([
      Sale.findOne({
        where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt: { [Op.gte]: startThisWeek } },
        attributes: [[sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'revenue']],
        raw: true
      }),
      Sale.findOne({
        where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt: { [Op.between]: [startPrevWeek, new Date(startThisWeek.getTime()-1)] } },
        attributes: [[sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'revenue']],
        raw: true
      }),
    ]);
    const thisWeekRevenue = parseFloat(thisWeekRevenueRow?.revenue || 0);
    const prevWeekRevenue = parseFloat(prevWeekRevenueRow?.revenue || 0);
    if (thisWeekRevenue != null && prevWeekRevenue) {
      const daysThisWeek = Math.max(1, (now.getTime() - startThisWeek.getTime()) / (24 * 60 * 60 * 1000));
      const avgDailyThisWeek = (thisWeekRevenue || 0) / daysThisWeek;
      const avgDailyPrevWeek = prevWeekRevenue / 7;
      const change = avgDailyPrevWeek === 0 ? 0 : ((avgDailyThisWeek - avgDailyPrevWeek) / avgDailyPrevWeek);
      if (change < -insightsConfig.REVENUE_DECLINE_THRESHOLD) {
        smartRecommendations.push({
          type: 'INSIGHT',
          priority: 'MEDIUM',
          message: `Daily sales velocity is ${(Math.abs(change)*100).toFixed(0)}% lower this week. Consider restocking fast movers.`,
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
      include: [
        { model: Sale, required: true, attributes: [], where: { shopId, ...REALIZED_SALE_FILTER } },
        { model: Product, attributes: ['id', 'name', 'cost'], required: true }
      ],
      group: ['SaleItem.productId', 'Product.id', 'Product.name', 'Product.cost'],
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
    const soonOut = await getStockDepletionForecast(shopId, req.user, aiTracker);
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
          [sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'sumTotal'],
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

      // Customer repeat and retention metrics
      const uniqueCustomerSales = await Sale.findAll({
        where: {
          shopId,
          ...NON_CANCELLED_SALE_FILTER,
          customerId: { [Op.ne]: null }
        },
        attributes: [
          'customerId',
          [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
          [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastVisit']
        ],
        group: ['customerId'],
        raw: true
      });
      const totalUniqueCustomers = uniqueCustomerSales.length;
      const repeatCustomers = uniqueCustomerSales.filter(c => Number(c.orderCount) > 1).length;
      const repeatCustomerRate = totalUniqueCustomers > 0 ? (repeatCustomers / totalUniqueCustomers) : 0;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const activeCustomersCount = uniqueCustomerSales.filter(c => new Date(c.lastVisit) >= thirtyDaysAgo).length;
      const activeRetentionRate = totalUniqueCustomers > 0 ? (activeCustomersCount / totalUniqueCustomers) : 0;

      const aiResponse = await aiClient.post(
        '/api/insights/analyze',
        {
          revenue,
          costs,
          customer_count,
          transaction_count,
          average_transaction_value,
          repeat_customer_rate: repeatCustomerRate,
          retention_rate: activeRetentionRate,
          total_customers: totalUniqueCustomers,
          repeat_customers: repeatCustomers,
        },
        {
          timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS,
          shopId,
          userId: req.user?.id,
          user: req.user,
          authz: req.authz
        }
      );

      const ai = aiResponse?.data;
      if (Array.isArray(ai)) {
        aiRecs = ai.map((x) => ({
          type: x.insight_type || 'AI',
          priority: 'MEDIUM',
          message: x.description || 'AI insight',
          details: x.recommendations || [],
        }));
      } else {
        aiTracker.failed = true;
      }
    } catch (e) {
      console.error('[InsightsController] AI service call failed:', e.message);
      aiTracker.failed = true;
    }

    const payload = {
      trends,
      recommendations: [...smartRecommendations, ...recommendations, ...aiRecs],
      alerts: [...alerts, ...marketAlerts],
    };

    if (!aiTracker.failed) {
      await setInsightsCache(req, shopId, payload);
    }

    res.json(payload);
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
};

const getCustomerSegments = async (req, res) => {
  const shopId = getAuthorizedShopId(req);
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const customerMetrics = await Sale.findAll({
      where: { shopId, ...REALIZED_SALE_FILTER },
      attributes: [
        'customerId',
        [sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'total_spend'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'purchase_frequency'],
        [sequelize.literal(`AVG(${NET_SALE_REVENUE_SQL})`), 'avg_transaction_value'],
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
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId: req.user?.id, user: req.user }
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
  const shopId = getAuthorizedShopId(req);
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const salesByMonth = await Sale.findAll({
      where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt: { [Op.gte]: twelveMonthsAgo } },
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y-%m-01'), 'month'],
        [sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'revenue'],
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
  const shopId = getAuthorizedShopId(req);
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const dailySales = await Sale.findAll({
      where: {
        shopId,
        ...REALIZED_SALE_FILTER,
        createdAt: { [Op.gte]: ninetyDaysAgo }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.literal(`SUM(${NET_SALE_REVENUE_SQL})`), 'revenue'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.literal(`AVG(${NET_SALE_REVENUE_SQL})`), 'avg_transaction_value'],
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
  const shopId = getAuthorizedShopId(req);
  if (!shopId) return res.status(401).json({ error: 'Unauthorized' });

  let products = null;
  let salesByProduct = {};

  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    products = await Product.findAll({
      where: { active: true },
      attributes: ['id', 'name'],
      include: [{
        model: Inventory,
        attributes: ['stockQuantity'],
        where: { shopId },
        required: true
      }]
    });

    const dailySalesRows = await SaleItem.findAll(buildNetDemandQuery(shopId, ninetyDaysAgo, true));

    salesByProduct = {};
    for (const row of dailySalesRows) {
      const pid = row.productId;
      const qty = parseFloat(row.quantity || 0);
      if (qty <= 0) continue;
      if (!salesByProduct[pid]) salesByProduct[pid] = [];
      salesByProduct[pid].push({ date: row.date, quantity: qty });
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const aiResponse = await aiClient.post(
      `/api/forecasting/stock-depletion`,
      {
        products: products.map((p) => ({
          product_id: String(p.id),
          product_name: p.name,
          current_stock: parseFloat(p.Inventories?.[0]?.stockQuantity || 0),
          daily_sales: salesByProduct[p.id] || [],
          lookback_days: 90,
          reference_date: todayIso
        })),
        alert_threshold_days: insightsConfig.STOCK_DEPLETION_DAYS,
        lookback_days: 90,
        reference_date: todayIso
      },
      { timeout: insightsConfig.AI_SERVICE_TIMEOUT_MS, shopId, userId: req.user?.id, user: req.user }
    );

    res.json(aiResponse.data);
  } catch (error) {
    if (products === null) {
      console.error('[getStockDepletion] Database query failed before AI call:', error.message);
      return res.status(500).json({ error: 'Failed to generate stock depletion forecast' });
    }

    console.warn('[getStockDepletion] AI service unavailable, generating local linear fallback:', error.message);
    try {
      const fallbackResults = products.map((p) => {
        const invStock = parseFloat(p.Inventories?.[0]?.stockQuantity || 0);
        const sales = salesByProduct[p.id] || [];
        const totalSold = sales.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
        const dailyVelocity = totalSold / 90;
        let daysUntilDepletion = 999;
        if (invStock <= 0) {
          daysUntilDepletion = 0;
        } else if (dailyVelocity > 0) {
          daysUntilDepletion = Math.ceil(invStock / dailyVelocity);
        }
        return {
          product_id: String(p.id),
          product_name: p.name,
          current_stock: invStock,
          days_until_depletion: daysUntilDepletion,
          alert: daysUntilDepletion <= insightsConfig.STOCK_DEPLETION_DAYS,
          algorithm: 'linear_fallback',
          confidence: totalSold > 0 ? 'medium' : 'low',
          data_points: sales.length,
          warning: 'AI service offline; using linear velocity estimate.'
        };
      });
      return res.json(fallbackResults);
    } catch (fallbackErr) {
      console.error('[getStockDepletion] Linear fallback failed:', fallbackErr.message);
      return res.status(500).json({ error: 'Failed to generate stock depletion forecast' });
    }
  }
};

module.exports = {
  getInsights,
  getCustomerSegments,
  getMonthlyRevenue,
  getDailySales,
  getStockDepletion,
  getStockDepletionForecast,
  buildNetDemandQuery,
  getAuthorizedShopId,
};
