const { Op } = require('sequelize');
const Sale = require('../models/Sale');
const Product = require('../models/Product');
const Customer = require('../models/Customer');

exports.getMySales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const sales = await Sale.findAndCountAll({
      where: {
        employeeId: req.user.id,
        shopId: req.shopId
      },
      include: [
        {
          model: Product,
          attributes: ['name', 'price', 'sku'],
          through: { attributes: ['quantity', 'priceAtSale'] }
        },
        {
          model: Customer,
          attributes: ['name', 'email', 'phone']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      sales: sales.rows,
      total: sales.count,
      totalPages: Math.ceil(sales.count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error getting sales:', error);
    res.status(500).json({ error: 'Error retrieving sales data' });
  }
};

exports.getSalesStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {
      employeeId: req.user.id,
      shopId: req.shopId
    };

    if (startDate && endDate) {
      where.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const stats = await Sale.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'totalRevenue'],
        [sequelize.fn('AVG', sequelize.col('totalAmount')), 'averageTransactionValue']
      ]
    });

    res.json(stats[0]);
  } catch (error) {
    console.error('Error getting sales stats:', error);
    res.status(500).json({ error: 'Error retrieving sales statistics' });
  }
};