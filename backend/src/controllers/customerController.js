const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Customer = require('../models/Customer');
const { parseDate } = require('../utils/dateUtils');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');

// Get all customers with pagination and search
exports.getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    const whereClause = search ? {
      [Op.and]: [
        { active: true, shopId: req.user.shopId },
        {
          [Op.or]: [
            { name: { [Op.like]: `%${search}%` } },
            { email: { [Op.like]: `%${search}%` } },
            { phone: { [Op.like]: `%${search}%` } }
          ]
        }
      ]
    } : { active: true, shopId: req.user.shopId };

    const customers = await Customer.findAndCountAll({
      where: whereClause,
      order: [['name', 'ASC']],
      limit,
      offset
    });

    res.json({
      customers: customers.rows,
      total: customers.count,
      totalPages: Math.ceil(customers.count / limit),
      currentPage: page
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
};

// Get customer by ID with full profile: spending stats, paginated order history, favorites
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.user.shopId;

    const customer = await Customer.findOne({
      where: { id, active: true, shopId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const activeSaleCondition = {
      customerId: customer.id,
      shopId,
      [Op.or]: [
        { saleStatus: { [Op.ne]: 'cancelled' } },
        { status: { [Op.ne]: 'cancelled' } }
      ]
    };

    // 1. Spending Stats (live aggregate)
    const salesStats = await Sale.findOne({
      where: activeSaleCondition,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalOrders'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total')), 0), 'totalSpend'],
        [sequelize.fn('MIN', sequelize.col('createdAt')), 'firstOrderDate'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastOrderDate']
      ],
      raw: true
    });

    const totalOrders = parseInt(salesStats?.totalOrders || 0, 10);
    const totalSpend = parseFloat(salesStats?.totalSpend || 0);
    const averageOrderValue = totalOrders > 0 ? parseFloat((totalSpend / totalOrders).toFixed(2)) : 0;
    const firstOrderDate = salesStats?.firstOrderDate || null;
    const lastOrderDate = salesStats?.lastOrderDate || customer.lastVisit || null;

    // 2. Paginated Order History
    const { count: orderCount, rows: sales } = await Sale.findAndCountAll({
      where: { customerId: customer.id, shopId },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [{
        model: SaleItem,
        attributes: ['id', 'quantity', 'price', 'subtotal']
      }]
    });

    const orderHistory = sales.map(sale => {
      const s = sale.toJSON();
      const itemCount = s.SaleItems ? s.SaleItems.reduce((acc, item) => acc + (item.quantity || 1), 0) : 0;
      return {
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        total: parseFloat(s.total),
        paymentMethod: s.paymentMethod,
        status: s.saleStatus || s.status || 'completed',
        createdAt: s.createdAt,
        itemCount
      };
    });

    // 3. Favorites / Frequently Purchased Items (Single SQL Aggregation)
    const favorites = await SaleItem.findAll({
      attributes: [
        'productId',
        [sequelize.fn('COUNT', sequelize.col('SaleItem.id')), 'timesPurchased'],
        [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'totalQuantity'],
        [sequelize.fn('MAX', sequelize.col('Sale.createdAt')), 'lastPurchasedAt']
      ],
      include: [
        {
          model: Sale,
          where: activeSaleCondition,
          attributes: []
        },
        {
          model: Product,
          attributes: ['id', 'name', 'sku', 'price']
        }
      ],
      group: ['SaleItem.productId', 'Product.id'],
      order: [[sequelize.literal('timesPurchased'), 'DESC'], [sequelize.literal('totalQuantity'), 'DESC']],
      limit: 5
    });

    const formattedFavorites = favorites.map(fav => {
      const f = fav.toJSON();
      return {
        productId: f.productId,
        name: f.Product?.name || 'Unknown Product',
        sku: f.Product?.sku || '',
        price: parseFloat(f.Product?.price || 0),
        timesPurchased: parseInt(f.dataValues.timesPurchased || 0, 10),
        totalQuantity: parseInt(f.dataValues.totalQuantity || 0, 10),
        lastPurchasedAt: f.dataValues.lastPurchasedAt
      };
    });

    res.json({
      customer,
      stats: {
        totalSpend,
        totalOrders,
        averageOrderValue,
        firstOrderDate,
        lastOrderDate
      },
      orderHistory,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(orderCount / limit) || 1,
        totalOrders: orderCount,
        limit
      },
      favorites: formattedFavorites
    });
  } catch (error) {
    console.error('Error fetching customer profile:', error);
    res.status(500).json({ error: 'Failed to fetch customer details' });
  }
};

// Create new customer
exports.createCustomer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, address, notes } = req.body;

    // Check for duplicate email or phone within the same shop
    if (email) {
      const existingEmail = await Customer.findOne({ where: { email, shopId: req.user.shopId } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    if (phone) {
      const existingPhone = await Customer.findOne({ where: { phone, shopId: req.user.shopId } });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    const customer = await Customer.create({
      name,
      email,
      phone,
      address,
      notes,
      shopId: req.user.shopId
    });

    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create customer' });
  }
};

// Update customer
exports.updateCustomer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, address, notes } = req.body;
    const customer = await Customer.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check for duplicate email or phone if changed (within the same shop)
    if (email && email !== customer.email) {
      const existingEmail = await Customer.findOne({ where: { email, shopId: req.user.shopId } });
      if (existingEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    if (phone && phone !== customer.phone) {
      const existingPhone = await Customer.findOne({ where: { phone, shopId: req.user.shopId } });
      if (existingPhone) {
        return res.status(400).json({ error: 'Phone number already registered' });
      }
    }

    await customer.update({
      name,
      email,
      phone,
      address,
      notes
    });

    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update customer' });
  }
};

// Delete customer (soft delete)
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await customer.update({ active: false });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete customer' });
  }
};

// Adjust loyalty points
exports.adjustLoyaltyPoints = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { points, reason } = req.body;
    const customer = await Customer.findOne({
      where: { id: req.params.id, active: true }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const newPoints = customer.loyaltyPoints + parseInt(points);
    if (newPoints < 0) {
      return res.status(400).json({ error: 'Insufficient loyalty points' });
    }

    await customer.update({
      loyaltyPoints: newPoints,
      notes: customer.notes 
        ? `${customer.notes}\n${new Date().toISOString()}: ${points} points ${reason}`
        : `${new Date().toISOString()}: ${points} points ${reason}`
    });

    res.json(customer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to adjust loyalty points' });
  }
};

// Get customer statistics
exports.getCustomerStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const whereClause = startDate && endDate ? {
      createdAt: {
        [Op.between]: [parseDate(startDate), parseDate(endDate)]
      }
    } : {};

    const [totalCustomers, newCustomers, activeCustomers] = await Promise.all([
      Customer.count({ where: { active: true, shopId: req.user.shopId } }),
      Customer.count({
        where: {
          ...whereClause,
          active: true,
          shopId: req.user.shopId
        }
      }),
      Customer.count({
        where: {
          active: true,
          shopId: req.user.shopId,
          lastVisit: {
            [Op.gte]: new Date(new Date() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      })
    ]);

    res.json({
      totalCustomers,
      newCustomers,
      activeCustomers,
      retentionRate: totalCustomers > 0 
        ? (activeCustomers / totalCustomers * 100).toFixed(2) 
        : 0
    });
  } catch (error) {
    console.error('Customer statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch customer statistics' });
  }
};
