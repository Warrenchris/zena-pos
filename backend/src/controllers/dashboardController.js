const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const SaleItem = require('../models/SaleItem');
const User = require('../models/User');

// Helper function to get date range for period
const getDateRange = (period) => {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case 'weekly':
      start.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'yearly':
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setDate(now.getDate() - 7);
  }

  return { start, end: now };
};

// Helper function to calculate growth and handle division by zero
const calculateGrowth = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const dashboardController = {
  // Get overall statistics
  async getStats(req, res) {
    try {
      const { period = 'month' } = req.query;
      const { start, end } = getDateRange(period);
      const shopId = req.user.shopId;

      const [salesStats, customerStats] = await Promise.all([
        Sale.findAll({
          where: {
            shopId,
            createdAt: { [Op.between]: [start, end] }
          },
          include: [{ model: SaleItem }]
        }),
        Customer.findAndCountAll({
          where: {
            shopId,
            createdAt: { [Op.between]: [start, end] }
          }
        })
      ]);

      // Calculate sales metrics
      const totalIncome = salesStats.reduce((sum, sale) =>
        sum + sale.total, 0);

      const totalTransactions = salesStats.length;

      // Calculate previous period metrics for comparison
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - (end - start));

      const prevSales = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [prevStart, start] }
        }
      });

      const prevIncome = prevSales.reduce((sum, sale) =>
        sum + sale.total, 0);

      const prevTransactions = prevSales.length;

      // Calculate growth percentages
      const prevCustomerCount = await Customer.count({
        where: {
          shopId,
          createdAt: { [Op.between]: [prevStart, start] }
        }
      });

      const incomeGrowth = calculateGrowth(totalIncome, prevIncome);
      const transactionGrowth = calculateGrowth(totalTransactions, prevTransactions);
      const customerGrowth = calculateGrowth(customerStats.count, prevCustomerCount);

      res.json({
        totalIncome,
        totalSales: totalTransactions,
        totalCustomers: customerStats.count,
        totalTransactions,
        incomeGrowth,
        salesGrowth: transactionGrowth,
        customerGrowth,
        transactionGrowth
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Error fetching dashboard statistics' });
    }
  },

  // Get revenue data
  async getRevenueData(req, res) {
    try {
      const { period = 'weekly' } = req.query;
      const { start, end } = getDateRange(period);
      const shopId = req.user.shopId;

      const sales = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [start, end] }
        },
        order: [['createdAt', 'ASC']]
      });

      const revenueData = sales.reduce((acc, sale) => {
        const date = new Date(sale.createdAt);
        let key;

        switch (period) {
          case 'weekly':
            key = date.toLocaleDateString('en-US', { weekday: 'short' });
            break;
          case 'monthly':
            key = date.getDate().toString();
            break;
          case 'yearly':
            key = date.toLocaleDateString('en-US', { month: 'short' });
            break;
        }

        if (!acc[key]) {
          acc[key] = { date: key, revenue: 0 };
        }
        acc[key].revenue += sale.total;
        return acc;
      }, {});

      res.json({
        revenueData: Object.values(revenueData)
      });
    } catch (error) {
      console.error('Error fetching revenue data:', error);
      res.status(500).json({ error: 'Error fetching revenue data' });
    }
  },

  // Get top products
  async getTopProducts(req, res) {
    try {
      const { limit = 5 } = req.query;
      const shopId = req.user.shopId;

      const topProducts = await SaleItem.findAll({
        attributes: [
          'productId',
          [sequelize.fn('SUM', sequelize.col('quantity')), 'totalSold'],
          [sequelize.fn('SUM', sequelize.col('price')), 'totalRevenue']
        ],
        include: [{
          model: Product,
          attributes: ['name', 'price']
        }],
        where: {
          '$Product.shopId$': shopId
        },
        group: ['productId', 'Product.id'],
        order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
        limit: parseInt(limit)
      });

      res.json(topProducts);
    } catch (error) {
      console.error('Error fetching top products:', error);
      res.status(500).json({ error: 'Error fetching top products' });
    }
  },

  // Get visitor statistics
  async getVisitorStats(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const { start, end } = getDateRange(period);
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - (end - start) / (1000 * 60 * 60 * 24));

      // Get visitor data from sales (unique customers per day)
      const visitorData = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('customerId'))), 'visitors']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true
      });

      const totalVisitors = visitorData.reduce((sum, day) => sum + parseInt(day.visitors || 0), 0);

      // Get previous period visitors
      const prevVisitors = await Sale.count({
        where: {
          shopId,
          createdAt: { [Op.between]: [prevStart, start] }
        },
        distinct: true,
        col: 'customerId'
      });

      const percentageChange = calculateGrowth(totalVisitors, prevVisitors);

      res.json({
        visitorData,
        totalVisitors,
        percentageChange
      });
    } catch (error) {
      console.error('Error fetching visitor stats:', error);
      res.status(500).json({ error: 'Error fetching visitor statistics' });
    }
  },

  // Get order statistics
  async getOrderStats(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      const { start, end } = getDateRange(period);
      const prevStart = new Date(start);
      prevStart.setDate(prevStart.getDate() - (end - start) / (1000 * 60 * 60 * 24));

      // Get order data
      const orderData = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [start, end] }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'orders'],
          [sequelize.fn('SUM', sequelize.col('total')), 'revenue']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true
      });

      const totalOrders = orderData.reduce((sum, day) => sum + parseInt(day.orders || 0), 0);
      const totalRevenue = orderData.reduce((sum, day) => sum + parseFloat(day.revenue || 0), 0);

      // Get previous period data
      const prevOrders = await Sale.count({
        where: {
          shopId,
          createdAt: { [Op.between]: [prevStart, start] }
        }
      });

      const prevRevenue = await Sale.sum('total', {
        where: {
          shopId,
          createdAt: { [Op.between]: [prevStart, start] }
        }
      }) || 0;

      const orderPercentageChange = calculateGrowth(totalOrders, prevOrders);
      const revenuePercentageChange = calculateGrowth(totalRevenue, prevRevenue);

      res.json({
        orderData,
        totalOrders,
        totalRevenue,
        orderPercentageChange,
        revenuePercentageChange
      });
    } catch (error) {
      console.error('Error fetching order stats:', error);
      res.status(500).json({ error: 'Error fetching order statistics' });
    }
  },

  // Get platform distribution statistics
  async getPlatformStats(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const { start, end } = getDateRange(period);

      const platforms = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [start, end] }
        },
        attributes: [
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('id')), 'orders'],
          [sequelize.fn('SUM', sequelize.col('total')), 'revenue']
        ],
        group: ['paymentMethod'],
        raw: true
      });

      const totalOrders = platforms.reduce((sum, p) => sum + parseInt(p.orders || 0), 0);

      const formattedPlatforms = platforms.map(p => ({
        name: p.paymentMethod || 'Cash',
        orders: parseInt(p.orders || 0),
        revenue: parseFloat(p.revenue || 0),
        percentage: totalOrders > 0 ? (parseInt(p.orders || 0) / totalOrders) * 100 : 0
      }));

      res.json({
        platforms: formattedPlatforms,
        totalOrders
      });
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      res.status(500).json({ error: 'Error fetching platform statistics' });
    }
  },

  // Get location-based statistics
  async getLocationStats(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const { start, end } = getDateRange(period);

      // Get customer locations
      const locations = await Customer.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [start, end] }
        },
        attributes: [
          'address',
          [sequelize.fn('COUNT', sequelize.col('id')), 'customers']
        ],
        group: ['address'],
        raw: true
      });

      const totalCustomers = locations.reduce((sum, loc) => sum + parseInt(loc.customers || 0), 0);

      const formattedLocations = locations.map(loc => ({
        address: loc.address || 'Unknown',
        customers: parseInt(loc.customers || 0),
        percentage: totalCustomers > 0 ? (parseInt(loc.customers || 0) / totalCustomers) * 100 : 0
      }));

      res.json({
        locations: formattedLocations,
        totalCustomers
      });
    } catch (error) {
      console.error('Error fetching location stats:', error);
      res.status(500).json({ error: 'Error fetching location statistics' });
    }
  }
};

module.exports = dashboardController;