const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
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

// Get customer by ID with purchase history
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findOne({
      where: { id: req.params.id, active: true, shopId: req.user.shopId },
      include: [{
        model: Sale,
        where: { shopId: req.user.shopId },
        include: [{
          model: SaleItem,
          include: [{
            model: Product,
            attributes: ['id', 'name', 'sku', 'price'],
            where: { shopId: req.user.shopId }
          }]
        }]
      }]
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Calculate customer insights
    const totalSales = customer.Sales.length;
    const totalSpent = customer.Sales.reduce((sum, sale) => sum + sale.total, 0);
    const averageTicket = totalSales > 0 ? totalSpent / totalSales : 0;
    
    // Get frequently purchased products
    const productFrequency = {};
    customer.Sales.forEach(sale => {
      sale.SaleItems.forEach(item => {
        const productId = item.Product.id;
        if (!productFrequency[productId]) {
          productFrequency[productId] = {
            product: item.Product,
            quantity: 0,
            totalSpent: 0
          };
        }
        productFrequency[productId].quantity += item.quantity;
        productFrequency[productId].totalSpent += item.subtotal;
      });
    });

    const frequentProducts = Object.values(productFrequency)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    res.json({
      customer,
      insights: {
        totalSales,
        totalSpent,
        averageTicket,
        frequentProducts,
        lastVisit: customer.lastVisit
      }
    });
  } catch (error) {
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
