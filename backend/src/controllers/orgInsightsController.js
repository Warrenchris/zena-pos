const { Op, Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const { Sale, Product, Inventory } = require('../models');
const { NON_CANCELLED_SALE_FILTER } = require('../constants/saleFilters');

/**
 * Controller: orgInsightsController
 * Additive organization roll-up analytics for multi-branch environments.
 * Strictly read-only; scoped by req.accessibleShopIds (populated by requireOrgAdmin).
 */

/**
 * 1. Executive Summary Roll-Up
 * Consolidated revenue, transaction volume, branch performance rankings, and daily trend.
 */
const getOrganizationSummary = async (req, res) => {
  try {
    let end = req.query.endDate ? new Date(req.query.endDate) : new Date();
    if (req.query.endDate && !req.query.endDate.includes('T')) {
      end.setHours(23, 59, 59, 999);
    }
    let start = req.query.startDate ? new Date(req.query.startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (req.query.startDate && !req.query.startDate.includes('T')) {
      start.setHours(0, 0, 0, 0);
    }

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startDate or endDate.' });
    }

    const shopIds = req.accessibleShopIds;

    // 1. Single Op.in query for branch aggregates
    const branchAggregates = await Sale.findAll({
      where: {
        shopId: { [Op.in]: shopIds },
        ...NON_CANCELLED_SALE_FILTER,
        createdAt: { [Op.between]: [start, end] }
      },
      attributes: [
        'shopId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
        [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue'],
        [sequelize.fn('AVG', sequelize.col('total')), 'avgTransactionValue']
      ],
      group: ['shopId'],
      raw: true
    });

    // Populate every accessible shop so zero-sale branches appear in ranking
    const branchMap = new Map();
    for (const shop of req.accessibleShops) {
      branchMap.set(shop.id, {
        shopId: shop.id,
        shopName: shop.name,
        totalRevenue: 0,
        totalSales: 0,
        averageTransactionValue: 0,
        revenueSharePercentage: 0,
        rank: 1
      });
    }

    for (const row of branchAggregates) {
      const sid = row.shopId;
      if (branchMap.has(sid)) {
        const rev = parseFloat(row.totalRevenue || 0);
        const count = parseInt(row.totalSales || 0, 10);
        const avg = count > 0 ? parseFloat((rev / count).toFixed(2)) : 0;
        const entry = branchMap.get(sid);
        entry.totalRevenue = parseFloat(rev.toFixed(2));
        entry.totalSales = count;
        entry.averageTransactionValue = avg;
      }
    }

    const totalRevenue = parseFloat(
      Array.from(branchMap.values()).reduce((sum, b) => sum + b.totalRevenue, 0).toFixed(2)
    );
    const totalSales = Array.from(branchMap.values()).reduce((sum, b) => sum + b.totalSales, 0);
    const averageTransactionValue = totalSales > 0 ? parseFloat((totalRevenue / totalSales).toFixed(2)) : 0;

    const sortedBranches = Array.from(branchMap.values()).sort((a, b) => {
      if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
      if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
      return a.shopId - b.shopId;
    });

    sortedBranches.forEach((b, idx) => {
      b.rank = idx + 1;
      b.revenueSharePercentage = totalRevenue > 0
        ? parseFloat(((b.totalRevenue / totalRevenue) * 100).toFixed(2))
        : 0;
    });

    // 2. Single Op.in query for daily trend
    const dailyTrend = await Sale.findAll({
      where: {
        shopId: { [Op.in]: shopIds },
        ...NON_CANCELLED_SALE_FILTER,
        createdAt: { [Op.between]: [start, end] }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('total')), 'totalSales'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    const salesTrend = dailyTrend.map(row => ({
      date: typeof row.date === 'string' ? row.date : (row.date ? new Date(row.date).toISOString().split('T')[0] : null),
      totalSales: parseFloat(parseFloat(row.totalSales || 0).toFixed(2)),
      transactionCount: parseInt(row.transactionCount || 0, 10)
    }));

    const scope = {
      role: req.membership.orgRole,
      accessibleShopsCount: req.accessibleShopIds.length,
      totalOrgShopsCount: req.totalOrgShopsCount
    };
    if (req.membership.orgRole === 'admin' && req.accessibleShopIds.length < req.totalOrgShopsCount) {
      scope.note = 'Scoped to authorized ShopAccess branches';
    }

    return res.json({
      organizationId: req.organizationId,
      scope,
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      metrics: {
        totalRevenue,
        totalSales,
        averageTransactionValue,
        activeShopsCount: req.accessibleShopIds.length
      },
      branchPerformance: sortedBranches,
      salesTrend
    });
  } catch (error) {
    console.error('[getOrganizationSummary] Error:', error);
    return res.status(500).json({ error: 'Failed to generate organization summary.', details: error.message });
  }
};

/**
 * 2. Cross-Branch Inventory Alerts & Transfer Advisory
 * Read-only inventory comparison across accessible shops. Zero database writes.
 */
const getOrganizationInventoryAlerts = async (req, res) => {
  try {
    const shopIds = req.accessibleShopIds;

    const products = await Product.findAll({
      where: {
        organizationId: req.organizationId,
        active: true
      },
      attributes: ['id', 'name', 'sku'],
      include: [{
        model: Inventory,
        where: {
          shopId: { [Op.in]: shopIds }
        },
        required: false,
        attributes: ['id', 'shopId', 'productId', 'stockQuantity', 'reorderPoint']
      }],
      order: [['id', 'ASC']]
    });

    const alerts = [];

    for (const prod of products) {
      const inventories = prod.Inventories || [];
      const invByShop = new Map(inventories.map(inv => [inv.shopId, inv]));

      const depletedShops = [];
      const surplusShops = [];

      for (const shop of req.accessibleShops) {
        const inv = invByShop.get(shop.id);
        const currentStock = inv ? parseFloat(inv.stockQuantity || 0) : 0;
        const threshold = (inv?.reorderPoint !== null && inv?.reorderPoint !== undefined) ? inv.reorderPoint : 10;

        if (currentStock <= threshold) {
          depletedShops.push({
            shopId: shop.id,
            shopName: shop.name,
            currentStock,
            reorderPoint: threshold,
            status: currentStock <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
          });
        } else {
          surplusShops.push({
            shopId: shop.id,
            shopName: shop.name,
            currentStock,
            reorderPoint: threshold,
            status: 'HEALTHY'
          });
        }
      }

      if (depletedShops.length > 0) {
        let transferRecommendation = 'Advisory: All accessible branches low on stock. Purchase order recommended.';
        if (surplusShops.length > 0) {
          surplusShops.sort((a, b) => (b.currentStock - b.reorderPoint) - (a.currentStock - a.reorderPoint));
          depletedShops.sort((a, b) => a.currentStock - b.currentStock);

          const topSurplus = surplusShops[0];
          const topDepleted = depletedShops[0];
          const availableExcess = topSurplus.currentStock - topSurplus.reorderPoint;
          const needed = Math.max(1, topDepleted.reorderPoint - topDepleted.currentStock);
          const suggestedTransfer = Math.max(1, Math.min(availableExcess, needed));

          if (availableExcess > 0) {
            transferRecommendation = `Advisory: Consider transferring up to ${suggestedTransfer} units from ${topSurplus.shopName} to ${topDepleted.shopName}.`;
          }
        }

        alerts.push({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          depletedShops,
          surplusShops,
          transferRecommendation
        });
      }
    }

    const scope = {
      role: req.membership.orgRole,
      accessibleShopsCount: req.accessibleShopIds.length,
      totalOrgShopsCount: req.totalOrgShopsCount
    };
    if (req.membership.orgRole === 'admin' && req.accessibleShopIds.length < req.totalOrgShopsCount) {
      scope.note = 'Scoped to authorized ShopAccess branches';
    }

    return res.json({
      organizationId: req.organizationId,
      scope,
      alertCount: alerts.length,
      alerts
    });
  } catch (error) {
    console.error('[getOrganizationInventoryAlerts] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch organization inventory alerts.', details: error.message });
  }
};

/**
 * 3. Consolidated Organization Daily Sales
 * Aggregated 90-day time series for AI forecasting consumption.
 */
const getOrganizationDailySales = async (req, res) => {
  try {
    const shopIds = req.accessibleShopIds;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    ninetyDaysAgo.setHours(0, 0, 0, 0);

    const dailySalesRows = await Sale.findAll({
      where: {
        shopId: { [Op.in]: shopIds },
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

    const daily_data = dailySalesRows.map(d => ({
      date: typeof d.date === 'string' ? d.date : (d.date ? new Date(d.date).toISOString().split('T')[0] : null),
      revenue: parseFloat(parseFloat(d.revenue || 0).toFixed(2)),
      transaction_count: parseInt(d.transaction_count || 0, 10),
      avg_transaction_value: parseFloat(parseFloat(d.avg_transaction_value || 0).toFixed(2))
    }));

    const dates = daily_data.map(d => d.date);
    const values = daily_data.map(d => d.revenue);

    const scope = {
      role: req.membership.orgRole,
      accessibleShopsCount: req.accessibleShopIds.length,
      totalOrgShopsCount: req.totalOrgShopsCount
    };
    if (req.membership.orgRole === 'admin' && req.accessibleShopIds.length < req.totalOrgShopsCount) {
      scope.note = 'Scoped to authorized ShopAccess branches';
    }

    if (daily_data.length < 14) {
      return res.json({
        organizationId: req.organizationId,
        scope,
        dates,
        values,
        daily_data,
        data_points: daily_data.length,
        warning: 'Insufficient historical sales data across branches (minimum 14 days required for forecasting)'
      });
    }

    return res.json({
      organizationId: req.organizationId,
      scope,
      dates,
      values,
      daily_data
    });
  } catch (error) {
    console.error('[getOrganizationDailySales] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch organization daily sales.', details: error.message });
  }
};

module.exports = {
  getOrganizationSummary,
  getOrganizationInventoryAlerts,
  getOrganizationDailySales,
};
