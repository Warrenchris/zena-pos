const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const sequelize = require('../config/database');
const { logActivity } = require('../middleware/logger');

// Get all sales with pagination
exports.getAllSales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const sales = await Sale.findAndCountAll({
      where: { shopId: req.user.shopId },
      include: [
        { 
          model: SaleItem,
          include: [{ 
            model: Product,
            attributes: ['id', 'name', 'sku'],
            where: { shopId: req.user.shopId }
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone'],
          where: { shopId: req.user.shopId }
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
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

// Get sale by ID
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      include: [
        {
          model: SaleItem,
          include: [{ 
            model: Product,
            attributes: ['id', 'name', 'sku', 'price'],
            where: { shopId: req.user.shopId }
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone', 'loyaltyPoints'],
          where: { shopId: req.user.shopId }
        }
      ]
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
};

// Create new sale
exports.createSale = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      items,
      customerId,
      paymentMethod,
      discount = 0,
      tax = 0,
      notes
    } = req.body;

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale must include at least one item' });
    }

    // Calculate totals and validate stock
    let subtotal = 0;
    const productUpdates = [];
    const saleItems = [];

    for (const item of items) {
      const product = await Product.findOne({
        where: { id: item.productId, active: true, shopId: req.user.shopId }
      });

      if (!product) {
        await t.rollback();
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }

      if (product.stockQuantity < item.quantity) {
        await t.rollback();
        return res.status(400).json({ 
          error: `Insufficient stock for product ${product.name}`
        });
      }

      const itemSubtotal = product.price * item.quantity;
      subtotal += itemSubtotal;

      productUpdates.push({
        id: product.id,
        stockQuantity: product.stockQuantity - item.quantity
      });

      saleItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        subtotal: itemSubtotal,
        discount: item.discount || 0
      });
    }

    const total = subtotal + tax - discount;

    // Generate invoice number (YYYYMMDD-XXXX format)
    const date = new Date();
    const dateStr = date.toISOString().slice(0,10).replace(/-/g,'');
    const lastSale = await Sale.findOne({
      where: {
        invoiceNumber: {
          [Op.like]: `${dateStr}-%`
        },
        shopId: req.user.shopId
      },
      order: [['invoiceNumber', 'DESC']]
    });

    let sequence = '0001';
    if (lastSale) {
      const lastSequence = parseInt(lastSale.invoiceNumber.split('-')[1]);
      sequence = String(lastSequence + 1).padStart(4, '0');
    }
    const invoiceNumber = `${dateStr}-${sequence}`;

    // Create sale
    const sale = await Sale.create({
      invoiceNumber,
      subtotal,
      tax,
      discount,
      total,
      paymentMethod,
      paymentStatus: 'completed',
      customerId,
      userId: req.user.id,
      notes,
      shopId: req.user.shopId
    }, { transaction: t });

    // Create sale items
    await Promise.all(saleItems.map(item => 
      SaleItem.create({
        ...item,
        saleId: sale.id
      }, { transaction: t })
    ));

    // Update product stock
    await Promise.all(productUpdates.map(update =>
      Product.update(
        { stockQuantity: update.stockQuantity },
        { where: { id: update.id }, transaction: t }
      )
    ));

    // Update customer's total purchases and loyalty points if customer exists
    if (customerId) {
      const customer = await Customer.findByPk(customerId);
      if (customer) {
        const loyaltyPoints = Math.floor(total); // 1 point per currency unit
        await customer.update({
          totalPurchases: customer.totalPurchases + total,
          loyaltyPoints: customer.loyaltyPoints + loyaltyPoints,
          lastVisit: new Date()
        }, { transaction: t });
      }
    }

    await t.commit();

    // Log activity
    try { await logActivity(req, 'SALE_CREATED', 'Sale', sale.id, { total }); } catch (_) {}

    // Fetch complete sale with relations
    const completeSale = await Sale.findOne({
      where: { id: sale.id },
      include: [
        {
          model: SaleItem,
          include: [{ 
            model: Product,
            attributes: ['id', 'name', 'sku', 'price']
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone', 'loyaltyPoints']
        }
      ]
    });

    res.status(201).json(completeSale);
  } catch (error) {
    await t.rollback();
    console.error('Sale creation error:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  }
};

// Update sale payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { paymentStatus } = req.body;
    const sale = await Sale.findByPk(req.params.id);

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    await sale.update({ paymentStatus });
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

// Get sales statistics
exports.getSalesStatistics = async (req, res) => {
  try {
    console.log('getSalesStatistics called with shopId:', req.user.shopId);
    const { startDate, endDate } = req.query;
    const whereClause = {
      shopId: req.user.shopId,
      createdAt: {
        [Op.between]: [
          startDate || new Date(new Date().setHours(0,0,0,0)),
          endDate || new Date(new Date().setHours(23,59,59,999))
        ]
      }
    };

    console.log('Where clause:', whereClause);

    // First, let's check if there are any sales at all
    const allSales = await Sale.findAll({ where: { shopId: req.user.shopId } });
    console.log('All sales for shopId', req.user.shopId, ':', allSales.length);

    const [totalSales, totalRevenue, averageTicket] = await Promise.all([
      Sale.count({ where: whereClause }),
      Sale.sum('total', { where: whereClause }),
      Sale.findOne({
        where: whereClause,
        attributes: [[sequelize.fn('AVG', sequelize.col('total')), 'average']]
      })
    ]);

    console.log('Statistics results:', { totalSales, totalRevenue, averageTicket });

    res.json({
      totalSales,
      totalRevenue: totalRevenue || 0,
      averageTicket: averageTicket ? averageTicket.getDataValue('average') || 0 : 0
    });
  } catch (error) {
    console.error('Sales statistics error:', error);
    res.status(500).json({ error: 'Failed to fetch sales statistics' });
  }
};
