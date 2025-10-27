const { Op, Sequelize } = require('sequelize');
const { Sale, Customer, ActivityLog, SaleItem, Product } = require('../models');
const sequelize = require('../config/database');

// Helper function to calculate start date
function calculateStartDate(now, period) {
  switch (period) {
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    case 'week':
    default:
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      return startDate;
  }
}

// Helper function to calculate growth
function calculateGrowth(currentTotal, previousTotal) {
  return previousTotal === 0 
    ? 100 
    : ((currentTotal - previousTotal) / previousTotal) * 100;
}

const analyticsController = {
  // Get visitor statistics
  async getVisitors(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const startDate = calculateStartDate(now, period);

      // Get sales as proxy for visitors
      const sales = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [startDate, now] }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'visitors']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        raw: true
      });

      const currentPeriod = sales.reduce((sum, day) => sum + parseInt(day.visitors), 0);
      
      // Get previous period for comparison
      const previousStartDate = new Date(startDate.getTime() - (now - startDate));
      const previousSales = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [previousStartDate, startDate] }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        raw: true
      });
      
      const previousPeriod = previousSales.reduce((sum, day) => sum + parseInt(day.count || 0), 0);

      const percentageChange = calculateGrowth(currentPeriod, previousPeriod);

      // Format data for response
      const visitorData = sales.map(sale => ({
        date: sale.date,
        visitors: parseInt(sale.visitors)
      }));

      res.json({
        visitorData,
        percentageChange,
        totalVisitors: currentPeriod
      });
    } catch (error) {
      console.error('Error fetching visitor statistics:', error);
      res.status(500).json({ 
        error: 'Failed to fetch visitor statistics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get order tracking statistics
  async getOrderTracking(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const startDate = calculateStartDate(now, period);

      const orders = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [startDate, now] }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total')), 'revenue']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        raw: true
      });

      const currentPeriodOrders = orders.reduce((sum, day) => sum + parseInt(day.count), 0);
      const currentPeriodRevenue = orders.reduce((sum, day) => sum + parseFloat(day.revenue || 0), 0);

      // Get previous period data
      const previousStartDate = new Date(startDate.getTime() - (now - startDate));
      const previousOrders = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [previousStartDate, startDate] }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total')), 'revenue']
        ],
        raw: true
      });

      const previousPeriodOrders = previousOrders.reduce((sum, day) => sum + parseInt(day.count), 0);
      const previousPeriodRevenue = previousOrders.reduce((sum, day) => sum + parseFloat(day.revenue || 0), 0);

      const orderPercentageChange = calculateGrowth(currentPeriodOrders, previousPeriodOrders);
      const revenuePercentageChange = calculateGrowth(currentPeriodRevenue, previousPeriodRevenue);

      res.json({
        orderData: orders.map(o => ({ 
          date: o.date, 
          orders: parseInt(o.count),
          revenue: parseFloat(o.revenue || 0)
        })),
        orderPercentageChange,
        revenuePercentageChange,
        totalOrders: currentPeriodOrders,
        totalRevenue: currentPeriodRevenue
      });
    } catch (error) {
      console.error('Error fetching order statistics:', error);
      res.status(500).json({ 
        error: 'Failed to fetch order statistics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get top selling products
  async getTopProducts(req, res) {
    try {
      const { period = 'week', limit = 5 } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const startDate = calculateStartDate(now, period);

      // Use raw SQL query for better control
      // Note: For MySQL, table names are typically lowercase
      const topProducts = await sequelize.query(`
        SELECT 
          p.id,
          p.name,
          p.price,
          p.sku,
          SUM(si.quantity) as quantity,
          SUM(si.quantity * COALESCE(NULLIF(si.price, 0), si.unitPrice, p.price)) as revenue
        FROM SaleItems si
        INNER JOIN Sales s ON si.saleId = s.id
        INNER JOIN Products p ON si.productId = p.id
        WHERE s.shopId = :shopId
          AND s.createdAt BETWEEN :startDate AND :now
          AND p.shopId = :shopId
        GROUP BY p.id, p.name, p.price, p.sku
        ORDER BY revenue DESC
        LIMIT :limit
      `, {
        replacements: { shopId, startDate, now, limit: parseInt(limit) },
        type: sequelize.QueryTypes.SELECT
      });

      // Get current period total sales
      const currentPeriodSales = topProducts.reduce((sum, p) => 
        sum + parseInt(p.quantity || 0), 0
      );

      // Get previous period for comparison
      const previousStartDate = new Date(startDate.getTime() - (now - startDate));
      const [previousProducts] = await sequelize.query(`
        SELECT SUM(si.quantity) as totalQuantity
        FROM SaleItems si
        INNER JOIN Sales s ON si.saleId = s.id
        WHERE s.shopId = :shopId
          AND s.createdAt BETWEEN :previousStartDate AND :startDate
      `, {
        replacements: { shopId, previousStartDate, startDate },
        type: sequelize.QueryTypes.SELECT
      });

      const previousPeriodSales = parseInt(previousProducts?.totalQuantity || 0);
      const salesPercentageChange = calculateGrowth(currentPeriodSales, previousPeriodSales);

      // Format response data
      const formattedProducts = topProducts.map(item => ({
        id: item.id,
        name: item.name,
        price: parseFloat(item.price || 0),
        quantity: parseInt(item.quantity || 0),
        revenue: parseFloat(item.revenue || 0),
        imageUrl: null,
        sku: item.sku
      }));

      res.json({
        products: formattedProducts,
        salesPercentageChange,
        totalSales: currentPeriodSales
      });
    } catch (error) {
      console.error('Error fetching top products:', error);
      res.status(500).json({ 
        error: 'Failed to fetch top products',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get sales channels distribution
  async getSalesChannels(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const startDate = calculateStartDate(now, period);

      const channels = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [startDate, now] }
        },
        attributes: [
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
          [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue']
        ],
        group: ['paymentMethod'],
        raw: true
      });

      const totalSales = channels.reduce((sum, channel) => sum + parseInt(channel.totalSales), 0);
      const totalRevenue = channels.reduce((sum, channel) => sum + parseFloat(channel.totalRevenue || 0), 0);

      // Get previous period for comparison
      const previousStartDate = new Date(startDate.getTime() - (now - startDate));
      const previousChannels = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [previousStartDate, startDate] }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        raw: true
      });

      const previousSales = previousChannels.reduce((sum, c) => sum + parseInt(c.count), 0);
      const salesPercentageChange = calculateGrowth(totalSales, previousSales);

      res.json({
        platforms: channels.map(c => ({
          name: c.paymentMethod || 'Cash',
          orders: parseInt(c.totalSales),
          revenue: parseFloat(c.totalRevenue || 0),
          percentage: totalSales > 0 ? (parseInt(c.totalSales) / totalSales) * 100 : 0
        })),
        totalSales,
        totalRevenue,
        salesPercentageChange
      });
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      res.status(500).json({ 
        error: 'Failed to fetch sales channels',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get customer locations statistics
  async getCustomerLocations(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const startDate = calculateStartDate(now, period);

      // Get customers grouped by location
      const customerLocations = await Customer.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [startDate, now] }
        },
        attributes: [
          'address',
          [sequelize.fn('COUNT', sequelize.col('id')), 'customerCount']
        ],
        group: ['address'],
        having: sequelize.literal('customerCount > 0'),
        raw: true
      });

      const totalCustomers = customerLocations.reduce((sum, loc) => 
        sum + parseInt(loc.customerCount || 0), 0
      );

      // Get previous period
      const previousStartDate = new Date(startDate.getTime() - (now - startDate));
      const previousCustomers = await Customer.count({
        where: {
          shopId,
          createdAt: { [Op.between]: [previousStartDate, startDate] }
        }
      });

      const percentageChange = calculateGrowth(totalCustomers, previousCustomers);

      // Format location data
      const locationData = customerLocations
        .map(location => ({
          address: location.address || 'Unknown',
          customers: parseInt(location.customerCount),
          orders: 0,
          revenue: 0,
          percentage: totalCustomers > 0 ? (parseInt(location.customerCount) / totalCustomers) * 100 : 0
        }))
        .sort((a, b) => b.customers - a.customers);

      res.json({
        locations: locationData,
        totalCustomers,
        percentageChange
      });
    } catch (error) {
      console.error('Error fetching customer locations:', error);
      res.status(500).json({
        error: 'Failed to fetch customer locations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

module.exports = analyticsController;
