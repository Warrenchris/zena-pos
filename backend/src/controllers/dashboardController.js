const { Op } = require('sequelize');
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
      const incomeGrowth = ((totalIncome - prevIncome) / prevIncome) * 100;
      const transactionGrowth = ((totalTransactions - prevTransactions) / prevTransactions) * 100;
      const customerGrowth = (customerStats.count / await Customer.count({
        where: {
          shopId,
          createdAt: { [Op.between]: [prevStart, start] }
        }
      })) * 100 - 100;

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
  }
};

module.exports = dashboardController;