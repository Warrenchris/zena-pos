const { Op, Sequelize } = require('sequelize');
const { Sale, Customer, ActivityLog, SaleItem, Product } = require('../models');
const sequelize = require('../config/database');

const analyticsController = {
  // Get visitor statistics
  async getVisitors(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate = calculateStartDate(now, period);

      const visits = await Sale.findAll({
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

      const totalVisitors = visits.reduce((sum, day) => sum + parseInt(day.visitors), 0);
      const visitorHistory = visits.map(v => ({
        date: v.date,
        value: parseInt(v.visitors)
      }));

      res.json({
        totalVisitors,
        visitorHistory,
        visitorGrowth: calculateGrowth(visits, startDate, now)
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
      let startDate = calculateStartDate(now, period);

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

      const totalOrders = orders.reduce((sum, day) => sum + parseInt(day.count), 0);
      const totalRevenue = orders.reduce((sum, day) => sum + parseFloat(day.revenue || 0), 0);

      res.json({
        totalOrders,
        totalRevenue,
        orderGrowth: calculateGrowth(orders, startDate, now, 'count'),
        revenueGrowth: calculateGrowth(orders, startDate, now, 'revenue'),
        orderHistory: orders.map(o => ({ date: o.date, value: parseInt(o.count) })),
        revenueHistory: orders.map(o => ({ date: o.date, value: parseFloat(o.revenue || 0) }))
      });
    } catch (error) {
      console.error('Error fetching order statistics:', error);
      res.status(500).json({ 
        error: 'Failed to fetch order statistics',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Get top products
  async getTopProducts(req, res) {
    try {
      const { period = 'week', limit = 5 } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate = calculateStartDate(now, period);

      const products = await SaleItem.findAll({
        where: {
          createdAt: { [Op.between]: [startDate, now] }
        },
        include: [{
          model: Product,
          where: { shopId },
          attributes: ['id', 'name', 'sku']
        }],
        attributes: [
          'productId',
          [sequelize.fn('SUM', sequelize.col('quantity')), 'totalSold'],
          [sequelize.fn('SUM', sequelize.literal('quantity * price')), 'totalRevenue']
        ],
        group: ['productId', 'Product.id', 'Product.name', 'Product.sku'],
        order: [[sequelize.literal('totalRevenue'), 'DESC']],
        limit: parseInt(limit),
        raw: true
      });

      res.json(products.map(p => ({
        id: p.productId,
        name: p['Product.name'],
        sku: p['Product.sku'],
        totalSold: parseInt(p.totalSold),
        totalRevenue: parseFloat(p.totalRevenue)
      })));
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
      let startDate = calculateStartDate(now, period);

      const channels = await Sale.findAll({
        where: {
          shopId,
          createdAt: { [Op.between]: [startDate, now] }
        },
        attributes: [
          'salesChannel',
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
          [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue']
        ],
        group: ['salesChannel'],
        raw: true
      });

      const totalSales = channels.reduce((sum, channel) => sum + parseInt(channel.totalSales), 0);

      res.json(channels.map(c => ({
        channel: c.salesChannel || 'In-Store',
        sales: parseInt(c.totalSales),
        revenue: parseFloat(c.totalRevenue || 0),
        percentage: (parseInt(c.totalSales) / totalSales) * 100
      })));
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      res.status(500).json({ 
        error: 'Failed to fetch sales channels',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined 
      });
    }
  },

  // Helper function to calculate start date
  calculateStartDate(now, period) {
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
  },

  // Helper function to calculate growth
  calculateGrowth(data, startDate, endDate, valueKey = 'value') {
    const periodLength = endDate - startDate;
    const previousStartDate = new Date(startDate.getTime() - periodLength);
    
    const currentTotal = data.reduce((sum, item) => {
      const date = new Date(item.date);
      if (date >= startDate && date <= endDate) {
        return sum + parseFloat(item[valueKey] || 0);
      }
      return sum;
    }, 0);

    const previousTotal = data.reduce((sum, item) => {
      const date = new Date(item.date);
      if (date >= previousStartDate && date < startDate) {
        return sum + parseFloat(item[valueKey] || 0);
      }
      return sum;
    }, 0);

    return previousTotal === 0 
      ? 100 
      : ((currentTotal - previousTotal) / previousTotal) * 100;
  },

  // Get customer locations statistics
  async getCustomerLocations(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate;

      // Calculate start date based on period
      switch (period) {
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'week':
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
      }

      // Get customers grouped by location
      const customerLocations = await Customer.findAll({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        },
        attributes: [
          'address',
          [sequelize.fn('COUNT', sequelize.col('id')), 'customerCount']
        ],
        group: ['address'],
        having: sequelize.literal('customerCount > 0')
      });

      // Get total customer count
      const totalCustomers = await Customer.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        }
      });

      // Calculate percentage change
      const previousPeriodCustomers = await Customer.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [
              new Date(startDate.getTime() - (now - startDate)),
              startDate
            ]
          }
        }
      });

      const percentageChange = previousPeriodCustomers === 0
        ? 100
        : ((totalCustomers - previousPeriodCustomers) / previousPeriodCustomers) * 100;

      // Format location data
      const locationData = customerLocations.map(location => ({
        address: location.address || 'Unknown Address',
        customers: parseInt(location.get('customerCount')),
        orders: 0, // Simplified - no order count for now
        revenue: 0, // Simplified - no revenue for now
        percentage: (parseInt(location.get('customerCount')) / totalCustomers) * 100
      }));

      // Sort by customer count descending
      locationData.sort((a, b) => b.customers - a.customers);

      res.json({
        locations: locationData || [],
        totalCustomers: totalCustomers || 0,
        percentageChange: percentageChange || 0
      });
    } catch (error) {
      console.error('Error fetching customer locations:', error);
      res.status(500).json({
        error: 'Failed to fetch customer locations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
      res.status(500).json({ error: 'Error fetching customer locations' });
    }
  },

  // Get sales by platform/channel
  async getSalesChannels(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate;

      // Calculate start date based on period
      switch (period) {
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'week':
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
      }

      // Get sales grouped by payment method (using as platform)
      const salesByPlatform = await Sale.findAll({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        },
        attributes: [
          'paymentMethod',
          [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
          [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue']
        ],
        group: ['paymentMethod']
      });

      // Get total sales for percentage calculation
      const totalSales = await Sale.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        }
      });

      const totalRevenue = await Sale.sum('total', {
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        }
      }) || 0;

      // Calculate percentage changes
      const previousPeriodSales = await Sale.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [
              new Date(startDate.getTime() - (now - startDate)),
              startDate
            ]
          }
        }
      });

      const salesPercentageChange = previousPeriodSales === 0
        ? 100
        : ((totalSales - previousPeriodSales) / previousPeriodSales) * 100;

      // Format the data
      const platformData = salesByPlatform.map(platform => ({
        name: platform.paymentMethod || 'In-Store', // Default to In-Store if paymentMethod is null
        orders: parseInt(platform.get('orderCount')),
        revenue: parseFloat(platform.get('totalRevenue')),
        percentage: (parseInt(platform.get('orderCount')) / totalSales) * 100
      }));

      res.json({
        platforms: platformData,
        totalSales,
        totalRevenue,
        salesPercentageChange
      });
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      res.status(500).json({ error: 'Error fetching sales channels' });
    }
  },

  // Get top selling products
  async getTopProducts(req, res) {
    try {
      const { period = 'week', limit = 5 } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate;

      // Calculate start date based on period
      switch (period) {
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'week':
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
      }

      // Get top selling products - simplified approach
      const topProducts = []; // Simplified for now - return empty array

      // Calculate percentage changes - simplified
      const currentPeriodSales = 0; // Simplified for now
      const salesPercentageChange = 0; // Simplified for now

      // Format response data
      const formattedProducts = topProducts.map(item => ({
        id: item.ProductId,
        name: item.productName,
        quantity: parseInt(item.totalQuantity),
        revenue: parseFloat(item.totalRevenue),
        price: parseFloat(item.productPrice),
        imageUrl: null // No imageUrl field in Product model
      }));

      res.json({
        products: formattedProducts,
        salesPercentageChange,
        totalSales: currentPeriodSales
      });
    } catch (error) {
      console.error('Error fetching top products:', error);
      res.status(500).json({ error: 'Error fetching top products' });
    }
  },

  // Get order tracking statistics
  async getOrderTracking(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate;

      // Calculate start date based on period
      switch (period) {
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'week':
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
      }

      const orders = await Sale.findAll({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('total')), 'total']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
      });

      // Calculate percentage changes
      const previousPeriodOrders = await Sale.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [
              new Date(startDate.getTime() - (now - startDate)),
              startDate
            ]
          }
        }
      });

      const currentPeriodOrders = await Sale.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        }
      });

      const previousPeriodRevenue = await Sale.sum('total', {
        where: {
          shopId,
          createdAt: {
            [Op.between]: [
              new Date(startDate.getTime() - (now - startDate)),
              startDate
            ]
          }
        }
      }) || 0;

      const currentPeriodRevenue = await Sale.sum('total', {
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          }
        }
      }) || 0;

      const orderPercentageChange = previousPeriodOrders === 0 
        ? 100 
        : ((currentPeriodOrders - previousPeriodOrders) / previousPeriodOrders) * 100;

      const revenuePercentageChange = previousPeriodRevenue === 0
        ? 100
        : ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100;

      // Format data for response
      const orderData = orders.map(order => ({
        date: new Date(order.getDataValue('date')).toLocaleDateString('en-US', { weekday: 'short' }),
        orders: parseInt(order.getDataValue('count')),
        revenue: parseFloat(order.getDataValue('total') || 0)
      }));

      res.json({
        orderData,
        orderPercentageChange,
        revenuePercentageChange,
        totalOrders: currentPeriodOrders,
        totalRevenue: currentPeriodRevenue
      });
    } catch (error) {
      console.error('Error fetching order statistics:', error);
      res.status(500).json({ error: 'Error fetching order statistics' });
    }
  },

  // Get visitor statistics
  async getVisitors(req, res) {
    try {
      const { period = 'week' } = req.query;
      const shopId = req.user.shopId;
      const now = new Date();
      let startDate;

      // Calculate start date based on period
      switch (period) {
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case 'week':
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
      }

      // Get activity logs for the period
      const activityLogs = await ActivityLog.findAll({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          },
          action: 'VISIT'
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
      });

      // Calculate percentage change
      const previousPeriod = await ActivityLog.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [
              new Date(startDate.getTime() - (now - startDate)),
              startDate
            ]
          },
          action: 'VISIT'
        }
      });

      const currentPeriod = await ActivityLog.count({
        where: {
          shopId,
          createdAt: {
            [Op.between]: [startDate, now]
          },
          action: 'VISIT'
        }
      });

      const percentageChange = previousPeriod === 0 
        ? 100 
        : ((currentPeriod - previousPeriod) / previousPeriod) * 100;

      // Format data for response
      const visitorData = activityLogs.map(log => ({
        date: new Date(log.getDataValue('date')).toLocaleDateString('en-US', { weekday: 'short' }),
        visitors: parseInt(log.getDataValue('count'))
      }));

      res.json({
        visitorData,
        percentageChange,
        totalVisitors: currentPeriod
      });
    } catch (error) {
      console.error('Error fetching visitor statistics:', error);
      res.status(500).json({ error: 'Error fetching visitor statistics' });
    }
  }
};

module.exports = analyticsController;