const { validationResult } = require('express-validator');
const { Op } = require('sequelize');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const sequelize = require('../config/database');
const { logActivity } = require('../middleware/logger');
const Employee = require('../models/Employee');
const UuidHelper = require('../utils/uuidHelper');
const User = require('../models/User');
const SaleRefund = require('../models/SaleRefund');
const SalePayment = require('../models/SalePayment');
const SystemSettings = require('../models/SystemSettings');
const { parseDate } = require('../utils/dateUtils');
const { WALK_IN_CUSTOMER_NAME } = require('../constants/customer');

// Get all sales with pagination
exports.getAllSales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get the sales with their items
    const sales = await Sale.findAndCountAll({
      where: {
        shopId: req.user.shopId
      },
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false, // Make this LEFT JOIN to get sales even without items
          include: [{
            model: Product,
            required: false, // Also make this LEFT JOIN
            attributes: ['id', 'name', 'sku', 'price']
          }]
        },
        {
          model: Customer,
          required: false, // Make this a LEFT JOIN
          attributes: ['id', 'name', 'email', 'phone']
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        },
        {
          model: User,
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
      distinct: true, // This ensures correct count with eager loading
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
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

// Update sale status and notes
exports.updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Find the sale
    const sale = await Sale.findOne({
      where: {
        id,
        shopId: req.user.shopId
      }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Update the sale
    const updatedSale = await sale.update({
      status,
      notes,
      updatedBy: req.user.id
    });

    // Log the activity
    await logActivity({
      shopId: req.user.shopId || req.shopId,
      performedBy: req.user.id,
      performedByType: req.user.isEmployee ? 'employee' : 'user',
      action: 'UPDATE_SALE',
      entity: 'Sale',
      entityId: sale.id,
      details: `Updated sale ${sale.invoiceNumber} status to ${status}`
    });

    res.json(updatedSale);
  } catch (error) {
    console.error('Error updating sale:', error);
    res.status(500).json({ error: 'Failed to update sale' });
  }
};

// Delete a sale (soft delete)
exports.deleteSale = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;

    // Find the sale
    const sale = await Sale.findOne({
      where: {
        id,
        shopId: req.user.shopId
      },
      include: [
        {
          model: SaleItem,
          include: [Product]
        }
      ]
    });

    if (!sale) {
      await t.rollback();
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Mark sale as deleted and store who deleted it
    await sale.update({
      status: 'deleted',
      deletedAt: new Date(),
      deletedBy: req.user.id
    }, { transaction: t });

    // Log the activity
    await logActivity({
      shopId: req.user.shopId || req.shopId,
      performedBy: req.user.id,
      performedByType: req.user.isEmployee ? 'employee' : 'user',
      action: 'DELETE_SALE',
      entity: 'Sale',
      entityId: sale.id,
      details: `Deleted sale ${sale.invoiceNumber}`
    }, t);

    await t.commit();
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    await t.rollback();
    console.error('Error deleting sale:', error);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
};

// Get sale by ID
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.user.shopId },
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false,
          include: [{
            model: Product,
            attributes: ['id', 'name', 'sku', 'price'],
            required: false
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone', 'loyaltyPoints'],
          required: false
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          required: false
        },
        {
          model: User,
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
};

// Get all payments for a specific sale
exports.getSalePayments = async (req, res) => {
  try {
    const { saleId } = req.params;
    const shopId = req.shopId || req.user.shopId;
    
    const sale = await Sale.findOne({
      where: { id: saleId, shopId }
    });
    
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const SalePayment = require('../models/SalePayment');
    const payments = await SalePayment.findAll({
      where: { saleId, shopId }
    });

    res.json(payments);
  } catch (error) {
    console.error('Failed to get sale payments:', error);
    res.status(500).json({ error: 'Failed to fetch sale payments' });
  }
};

// Create new sale
exports.createSale = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const shopId = req.shopId || req.user.shopId;
    const completeSale = await exports.createSaleInternal(req.body, shopId, req.user);

    res.status(201).json(completeSale);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Invoice number conflict. Please retry the sale.' });
    }
    console.error('Sale creation error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode === 500 ? 'Failed to create sale' : error.message
    });
  }
};

exports.createSaleInternal = async (saleData, shopId, user) => {
  const {
    items,
    customer,
    customerId,
    paymentMethod,
    paymentAmount,
    discount = 0,
    tax = 0,
    notes,
    total: frontendTotal,
    change: frontendChange,
    paymentReference,
    paymentProvider,
    paymentNotes
  } = saleData;

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Sale must include at least one item');
    err.statusCode = 400;
    throw err;
  }

  const saleResult = await sequelize.transaction(async (t) => {
    let subtotal = 0;
    const lockedProducts = [];
    const saleItems = [];

    for (const item of items) {
      const product = await Product.findOne({
        where: { id: item.productId, active: true, shopId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });

      if (!product) {
        const err = new Error(`Product ${item.productId} not found`);
        err.statusCode = 400;
        throw err;
      }

      if (product.stockQuantity < item.quantity) {
        const err = new Error(`Insufficient stock for product: ${product.name}`);
        err.statusCode = 409;
        throw err;
      }

      const itemPrice = product.price;
      const itemSubtotal = itemPrice * item.quantity;
      subtotal += itemSubtotal;

      lockedProducts.push({ product, item, itemPrice, itemSubtotal });

      saleItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        price: itemPrice,
        subtotal: itemSubtotal,
        discount: item.discount || 0
      });
    }

    const serverTotal = subtotal + parseFloat(tax || 0) - parseFloat(discount || 0);

    if (frontendTotal !== undefined && Math.abs(serverTotal - parseFloat(frontendTotal)) > 0.01) {
      const err = new Error('Price mismatch. Please refresh and retry.');
      err.statusCode = 400;
      throw err;
    }

    if (paymentAmount !== undefined && parseFloat(paymentAmount) < serverTotal) {
      const err = new Error('Insufficient payment amount.');
      err.statusCode = 400;
      throw err;
    }

    const total = serverTotal;
    const change = paymentAmount ? parseFloat(paymentAmount) - total : 0;

    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');

    const [lastSale] = await Sale.findAll({
      where: {
        invoiceNumber: { [Op.like]: `${dateStr}-%` },
        shopId
      },
      order: [['invoiceNumber', 'DESC']],
      limit: 1,
      lock: t.LOCK.UPDATE,
      transaction: t
    });

    let sequence = '0001';
    if (lastSale) {
      const lastSequence = parseInt(lastSale.invoiceNumber.split('-')[1], 10);
      sequence = String(lastSequence + 1).padStart(4, '0');
    }
    const invoiceNumber = `${dateStr}-${sequence}`;

    const jwtId = user?.id;
    const resolvedUserId = (typeof jwtId === 'number')
      ? jwtId
      : (typeof jwtId === 'string' && /^\d+$/.test(jwtId))
        ? parseInt(jwtId, 10)
        : null;

    const sale = await Sale.create({
      invoiceNumber,
      subtotal,
      tax,
      discount,
      total,
      paymentMethod,
      paymentAmount: paymentAmount ? parseFloat(paymentAmount) : null,
      change: change > 0 ? change : 0,
      paymentStatus: 'completed',
      customerName: customer?.name || WALK_IN_CUSTOMER_NAME,
      customerLocation: customer?.location || null,
      customerPhone: customer?.phone || null,
      customerEmail: customer?.email || null,
      customerId,
      userId: !user?.isEmployee ? resolvedUserId : null,
      employeeId: user?.isEmployee ? user.id : null,
      notes,
      shopId,
      paymentReference,
      paymentProvider,
      paymentNotes
    }, { transaction: t });

    await Promise.all(saleItems.map(item =>
      SaleItem.create({
        ...item,
        saleId: sale.id,
        shopId
      }, { transaction: t })
    ));

    await Promise.all(lockedProducts.map(({ product, item }) =>
      product.decrement('stockQuantity', { by: item.quantity, transaction: t })
    ));

    const SalePayment = require('../models/SalePayment');
    await SalePayment.create({
      saleId:        sale.id,
      shopId:        shopId,
      paymentMethod: paymentMethod,
      amount:        total,
      gatewayRef:    saleData.gatewayRef || paymentReference || null,
      paidAt:        new Date(),
      processedBy:   user?.isEmployee ? user.id : null,
    }, { transaction: t });

    const resolvedCustomerId = customerId || customer?.id || null;
    let finalCustomerId = resolvedCustomerId;
    const isWalkIn = !resolvedCustomerId && (!customer?.name || customer.name === WALK_IN_CUSTOMER_NAME);

    if (!isWalkIn) {
      if (resolvedCustomerId) {
        const existingCustomer = await Customer.findOne({
          where: { id: resolvedCustomerId, shopId },
          transaction: t
        });
        if (existingCustomer) {
          const loyaltyPoints = Math.floor(total);
          await existingCustomer.update({
            totalPurchases: parseFloat(existingCustomer.totalPurchases || 0) + total,
            loyaltyPoints: (existingCustomer.loyaltyPoints || 0) + loyaltyPoints,
            lastVisit: new Date(),
            ...(customer?.email && { email: customer.email }),
            ...(customer?.phone && { phone: customer.phone }),
            ...(customer?.location && { location: customer.location })
          }, { transaction: t });
        }
      } else if (customer && customer.name && customer.name !== WALK_IN_CUSTOMER_NAME) {
        let customerRecord = await Customer.findOne({
          where: {
            shopId,
            [Op.or]: [
              ...(customer.email ? [{ email: customer.email }] : []),
              ...(customer.phone ? [{ phone: customer.phone }] : []),
              { name: customer.name }
            ]
          },
          transaction: t
        });

        if (!customerRecord) {
          customerRecord = await Customer.create({
            name: customer.name,
            email: customer.email || null,
            phone: customer.phone || null,
            location: customer.location || null,
            totalPurchases: total,
            lastVisit: new Date(),
            shopId
          }, { transaction: t });
        } else {
          const loyaltyPoints = Math.floor(total);
          await customerRecord.update({
            totalPurchases: parseFloat(customerRecord.totalPurchases || 0) + total,
            loyaltyPoints: (customerRecord.loyaltyPoints || 0) + loyaltyPoints,
            lastVisit: new Date(),
            ...(customer.email && { email: customer.email }),
            ...(customer.phone && { phone: customer.phone }),
            ...(customer.location && { location: customer.location })
          }, { transaction: t });
        }

        finalCustomerId = customerRecord.id;
        await sale.update({ customerId: finalCustomerId }, { transaction: t });
      }
    }

    return { sale, invoiceNumber, total };
  });

  const { sale, invoiceNumber, total } = saleResult;

  try {
    await logActivity({
      shopId: shopId,
      performedBy: user?.id,
      performedByType: user?.isEmployee ? 'employee' : 'user',
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: sale.id,
      details: `Created sale ${invoiceNumber} with total ${total}`
    });
  } catch (error) {
    console.warn('Failed to log sale activity:', error);
  }

  const completeSale = await Sale.findOne({
    where: { id: sale.id, shopId: shopId },
    attributes: {
      exclude: ['UserId', 'CustomerId']
    },
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
        attributes: ['id', 'name', 'email', 'phone', 'location', 'loyaltyPoints']
      },
      {
        model: Employee,
        attributes: ['id', 'firstName', 'lastName', 'email'],
        as: 'Employee'
      }
    ]
  });

  return completeSale;
};

// Update sale payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { paymentStatus } = req.body;
    const sale = await Sale.findOne({
      where: { id: req.params.id, shopId: req.shopId || req.user.shopId }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    await sale.update({ paymentStatus });
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update payment status' });
  }
};

// Get cashier-specific sales statistics
exports.getCashierStats = async (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;

    // Default start date to start of current week if not provided
    const now = new Date();
    const defaultWeekStart = new Date(now);
    defaultWeekStart.setDate(now.getDate() - now.getDay());
    defaultWeekStart.setHours(0, 0, 0, 0);

    const start = parseDate(startDate, defaultWeekStart);
    const end = parseDate(endDate, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)));

    // Build where clause
    const whereClause = {
      shopId: req.user.shopId,
      createdAt: {
        [Op.between]: [start, end]
      }
    };

    // For cashiers and employees, include both userId and employeeId matching
    if (req.user.role === 'cashier' || req.user.role === 'employee') {
      whereClause[Op.or] = [
        { userId: req.user.id },
        { employeeId: req.user.id }
      ];
    }
    else if (employeeId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId);
      if (isUuid) {
        whereClause.employeeId = employeeId;
      } else {
        whereClause.userId = employeeId;
      }
    }

    // Get sales data with SaleItems for items count
    const sales = await Sale.findAll({
      where: whereClause,
      attributes: [
        'id',
        'total',
        'createdAt',
        'employeeId',
        'userId'
      ],
      include: [
        {
          model: SaleItem,
          attributes: ['quantity'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const totalSales = sales.reduce((sum, sale) => {
      const total = parseFloat(sale.total || 0);
      return isNaN(total) ? sum : sum + total;
    }, 0);
    const orderCount = sales.length;

    // Today's stats
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    const todaySales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return saleDate >= todayStart && saleDate <= todayEnd;
    });

    const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total || 0), 0);
    const todayCount = todaySales.length;
    const todayItemCount = todaySales.reduce((sum, sale) => {
      const items = Array.isArray(sale.SaleItems) ? sale.SaleItems : [];
      return sum + items.reduce((iSum, item) => iSum + (parseInt(item.quantity || 0, 10)), 0);
    }, 0);

    // Week stats
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const weekSales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return saleDate >= weekStart && saleDate <= weekEnd;
    });

    const weekTotal = weekSales.reduce((sum, sale) => sum + parseFloat(sale.total || 0), 0);
    const weekCount = weekSales.length;

    res.json({
      today: {
        totalSales: todayTotal,
        orderCount: todayCount,
        itemCount: todayItemCount
      },
      week: {
        totalSales: weekTotal,
        orderCount: weekCount
      },
      period: {
        totalSales,
        orderCount,
        startDate: start,
        endDate: end
      },
      sales: sales.slice(0, 10)
    });

  } catch (error) {
    console.error('Error fetching cashier stats:', error);

    // More descriptive error response
    let errorMessage = 'Failed to fetch cashier statistics';
    let statusCode = 500;

    if (error.name === 'SequelizeDatabaseError' && error.message.includes('invalid input syntax')) {
      errorMessage = 'Invalid employee ID format';
      statusCode = 400;
    } else if (error.name === 'SequelizeValidationError') {
      errorMessage = error.message;
      statusCode = 400;
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: error.message
    });
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
          parseDate(startDate, new Date(new Date().setHours(0, 0, 0, 0))),
          parseDate(endDate, new Date(new Date().setHours(23, 59, 59, 999)))
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

// Get all sales for admin with filtering by cashier and date range
exports.getAllSalesForAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { startDate, endDate, cashierId, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    // Build where clause
    const whereClause = {
      shopId: req.user.shopId
    };

    // Add date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          parseDate(startDate, new Date(new Date().setHours(0, 0, 0, 0))),
          parseDate(endDate, new Date(new Date().setHours(23, 59, 59, 999)))
        ]
      };
    }

    // Add cashier filter
    if (cashierId) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cashierId);
      if (isUuid) {
        whereClause.employeeId = cashierId;
      } else {
        whereClause.userId = cashierId;
      }
    }

    const sales = await Sale.findAndCountAll({
      where: whereClause,
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false,
          as: 'SaleItems', // Explicitly set the alias
          include: [{
            model: Product,
            as: 'Product',
            attributes: ['id', 'name', 'sku', 'price'],
            required: false
          }]
        },
        {
          model: Customer,
          as: 'Customer',
          attributes: ['id', 'name', 'email', 'phone'],
          required: false
        },
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          as: 'Employee',
          required: false
        },
        {
          model: User,
          attributes: ['id', 'name', 'email'],
          required: false
        }
      ],
      distinct: true,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    // Log for debugging
    console.log('Fetched sales:', {
      total: sales.count,
      returned: sales.rows.length,
      sample: sales.rows.length > 0 ? {
        id: sales.rows[0].id,
        saleItemsCount: sales.rows[0].SaleItems?.length || 0,
        customer: sales.rows[0].Customer?.name || 'No customer',
        employee: sales.rows[0].Employee?.firstName || sales.rows[0].User?.name || 'No employee/user'
      } : null
    });

    res.json({
      sales: sales.rows,
      total: sales.count,
      totalPages: Math.ceil(sales.count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching admin sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

// Get cashier's own sales only
exports.getMySales = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { startDate, endDate, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

    // Build where clause - only show sales made by this cashier
    // Use OR to check both userId and employeeId to handle legacy sales
    const whereClause = {
      shopId: req.user.shopId,
      [Op.or]: [
        { userId: req.user.id },
        { employeeId: req.user.id }
      ]
    };

    // Add date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          parseDate(startDate, new Date(new Date().setHours(0, 0, 0, 0))),
          parseDate(endDate, new Date(new Date().setHours(23, 59, 59, 999)))
        ]
      };
    }

    const sales = await Sale.findAndCountAll({
      where: whereClause,
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
      },
      include: [
        {
          model: SaleItem,
          required: false,
          include: [{
            model: Product,
            attributes: ['id', 'name', 'sku'],
            required: false
          }]
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'phone'],
          required: false
        }
      ],
      distinct: true,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit,
      offset
    });

    // Normalize response to match frontend expectations
    const normalizedRows = sales.rows.map((row) => {
      const sale = row.get ? row.get({ plain: true }) : row;

      const saleItems = Array.isArray(sale.SaleItems) ? sale.SaleItems : [];
      const products = saleItems.map((si) => ({
        id: si.Product?.id ?? si.ProductId ?? null,
        name: si.Product?.name ?? 'Unknown',
        quantity: si.quantity ?? 0,
        priceAtSale: parseFloat(
          (si.price ?? si.unitPrice ?? si.originalPrice ?? 0)
        )
      }));

      const itemsText = saleItems.map(item =>
        `${item.quantity}x ${item.Product?.name || 'Unknown Product'}`
      ).join(', ');

      return {
        id: sale.id,
        createdAt: sale.createdAt,
        invoiceNumber: sale.invoiceNumber,
        customer: sale.Customer ? {
          id: sale.Customer.id,
          name: sale.Customer.name,
          email: sale.Customer.email,
          phone: sale.Customer.phone
        } : null,
        products,
        items: saleItems.length > 0 ? itemsText : '0 items',
        itemCount: `${saleItems.length} items`,
        totalAmount: parseFloat(sale.total ?? 0),
        total: parseFloat(sale.total ?? 0),
        paymentMethod: (sale.paymentMethod || 'cash').toUpperCase(),
        status: (sale.saleStatus || 'completed').toUpperCase()
      };
    });

    res.json({
      sales: normalizedRows,
      total: sales.count,
      totalPages: Math.ceil(sales.count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching my sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
};

exports.processRefund = async (req, res) => {
  const { saleId } = req.params;
  const { items, managerApprovalId, adminOverride } = req.body;
  const refundedBy = String(req.user.id);
  const shopId = req.shopId || req.user.shopId;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Refund items are required' });
  }

  try {
    // Validate sale exists and belongs to shopId
    const sale = await Sale.findOne({
      where: { id: saleId }
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.shopId !== shopId) {
      return res.status(403).json({ error: 'Access denied: cross-shop refund' });
    }

    // Fetch system settings for return policy & approval thresholds
    const systemSettings = await SystemSettings.findOne({ where: { shopId } });
    const returnWindowDays = systemSettings?.returnWindowDays !== undefined ? systemSettings.returnWindowDays : 30;
    const maxUnapproved = parseFloat(systemSettings?.maxUnapprovedRefundAmount !== undefined ? systemSettings.maxUnapprovedRefundAmount : 5000);

    // Return Window Eligibility Check
    const daysSinceSale = (new Date() - new Date(sale.createdAt)) / (1000 * 60 * 60 * 24);
    if (daysSinceSale > returnWindowDays && !adminOverride && req.user.role !== 'admin') {
      return res.status(400).json({ 
        error: `Return window expired. Sales older than ${returnWindowDays} days require administrator override.` 
      });
    }

    const saleItems = await SaleItem.findAll({
      where: { saleId }
    });

    const saleItemsMap = new Map(saleItems.map(si => [si.productId, si]));

    // Find all previous refunds for this sale
    const previousRefunds = await SaleRefund.findAll({
      where: { saleId, status: 'processed' }
    });

    // Map of productId -> sum of previously refunded quantity
    const previouslyRefundedMap = new Map();
    previousRefunds.forEach(pr => {
      const qty = previouslyRefundedMap.get(pr.productId) || 0;
      previouslyRefundedMap.set(pr.productId, qty + (pr.quantity || 0));
    });

    // Filter out items with quantity <= 0
    const itemsToRefund = items.filter(item => item.quantity > 0);
    if (itemsToRefund.length === 0) {
      return res.status(400).json({ error: 'No items with quantity > 0 specified for refund' });
    }

    // Extract approval credentials and flags
    const { managerApprovalId, managerPassword, adminOverride } = req.body;

    // Server-side enforcement: Only admin/manager can pass adminOverride
    if (adminOverride && !['admin', 'manager'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin or Manager role is strictly required to execute policy overrides.' });
    }

    // Validate each item, non-returnable status, and available quantity
    for (const item of itemsToRefund) {
      const saleItem = saleItemsMap.get(item.productId);
      if (!saleItem) {
        return res.status(400).json({ error: `Product ${item.productId} was not part of this sale` });
      }

      const prevQty = previouslyRefundedMap.get(item.productId) || 0;
      const availableQty = saleItem.quantity - prevQty;

      if (item.quantity > availableQty) {
        return res.status(400).json({ 
          error: `Cannot refund ${item.quantity} units of product ${item.productId}. Only ${availableQty} units available for refund.` 
        });
      }

      // Check Non-Returnable flag on Product (gated server-side by admin/manager role)
      const productRecord = await Product.findOne({ where: { id: item.productId, shopId } });
      const canBypassNonReturnable = adminOverride && ['admin', 'manager'].includes(req.user.role);
      if (productRecord && productRecord.nonReturnable && !canBypassNonReturnable && req.user.role !== 'admin') {
        return res.status(400).json({ error: `Product "${productRecord.name}" is marked as non-returnable.` });
      }
    }

    // Calculate total net refund amount across all requested items (net price accounting for discounts)
    let calculatedTotalRefund = 0;
    const itemsWithNetPrice = itemsToRefund.map(item => {
      const saleItem = saleItemsMap.get(item.productId);
      const lineQuantity = saleItem.quantity || 1;
      const lineSubtotal = parseFloat(saleItem.subtotal || (parseFloat(saleItem.unitPrice || saleItem.price || saleItem.originalPrice || 0) * lineQuantity));
      const lineDiscount = parseFloat(saleItem.discount || 0);
      
      const netLineAmount = Math.max(0, lineSubtotal - lineDiscount);
      const netUnitPrice = netLineAmount / lineQuantity;

      const lineRefundAmount = parseFloat((item.quantity * netUnitPrice).toFixed(2));
      calculatedTotalRefund += lineRefundAmount;

      return {
        ...item,
        netUnitPrice,
        lineRefundAmount
      };
    });

    const totalRefundAmount = parseFloat(calculatedTotalRefund.toFixed(2));

    // Approval Threshold & Credential Check
    let verifiedManagerId = null;
    if (totalRefundAmount > maxUnapproved && req.user.role !== 'admin') {
      if (!managerApprovalId) {
        return res.status(403).json({ 
          error: `Refund total (${totalRefundAmount} KSh) exceeds unapproved threshold (${maxUnapproved} KSh). Manager approval & password credentials are required.` 
        });
      }

      const approvingManager = await User.findOne({
        where: { id: managerApprovalId, shopId, active: true }
      });

      if (!approvingManager || !['manager', 'admin'].includes(approvingManager.role)) {
        return res.status(403).json({ error: 'Selected approving user is not an active Manager or Admin.' });
      }

      if (managerPassword) {
        const isValidPassword = await approvingManager.validatePassword(managerPassword);
        if (!isValidPassword) {
          return res.status(401).json({ error: `Invalid password for approving manager ${approvingManager.name || approvingManager.email}.` });
        }
      }

      verifiedManagerId = String(approvingManager.id);
    } else if (managerApprovalId) {
      verifiedManagerId = String(managerApprovalId);
    }

    // Determine refund method
    const refundMethod = (sale.paymentMethod === 'mobile' || sale.paymentMethod === 'mobile_money')
      ? 'mobile_money'
      : (['cash', 'card', 'store_credit'].includes(sale.paymentMethod) ? sale.paymentMethod : 'cash');

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refundedBy);
    const processedBy = isUuid ? refundedBy : null;

    const t = await sequelize.transaction();

    try {
      const createdRefunds = [];
      
      for (const item of itemsWithNetPrice) {
        const disposition = ['restock', 'damaged_writeoff', 'return_to_supplier'].includes(item.disposition)
          ? item.disposition
          : 'restock';

        const validReasonCodes = ['DEFECTIVE', 'WRONG_ITEM', 'EXPIRED', 'CHANGED_MIND', 'OTHER'];
        const reasonCode = validReasonCodes.includes(item.reasonCode)
          ? item.reasonCode
          : (validReasonCodes.includes(item.reason) ? item.reason : 'OTHER');
        
        const reasonNotes = item.reasonNotes || item.reason || 'Customer Return';

        // a. Insert row into SaleRefunds
        const refundRow = await SaleRefund.create({
          saleId: parseInt(saleId, 10),
          productId: item.productId,
          quantity: item.quantity,
          amount: item.lineRefundAmount,
          refundAmount: item.lineRefundAmount,
          reason: reasonNotes,
          reasonCode,
          reasonNotes,
          disposition,
          managerApprovalId: verifiedManagerId || managerApprovalId || null,
          refundMethod,
          processedBy,
          refundedBy,
          status: 'processed',
          shopId,
          refundedAt: new Date(),
          metadata: {
            disposition,
            isWriteOff: disposition === 'damaged_writeoff'
          }
        }, { transaction: t });

        createdRefunds.push(refundRow);

        // b. Update inventory ONLY if disposition is 'restock'
        if (disposition === 'restock') {
          const product = await Product.findOne({
            where: { id: item.productId, shopId },
            lock: t.LOCK.UPDATE,
            transaction: t
          });

          if (product) {
            await product.increment('stockQuantity', { by: item.quantity, transaction: t });
          }
        } else if (disposition === 'damaged_writeoff') {
          // Log damaged write-off loss in ActivityLogs
          await logActivity({
            shopId,
            performedBy: req.user.id,
            performedByType: req.user.isEmployee ? 'employee' : 'user',
            action: 'inventory_writeoff',
            entity: 'product',
            entityId: item.productId,
            details: `Wrote off ${item.quantity} units of product ${item.productId} as damaged/defective from refund #${refundRow.id}`
          }, t);
        }
      }

      // c. Negative payment ledger entry in SalePayment to record cash/method reversal
      await SalePayment.create({
        saleId: parseInt(saleId, 10),
        amount: -totalRefundAmount,
        paymentMethod: refundMethod,
        paymentReference: `REFUND-${saleId}-${Date.now()}`,
        paymentProvider: 'System Refund Reversal',
        status: 'completed',
        processedBy,
        shopId,
        paidAt: new Date(),
        metadata: {
          isRefundReversal: true,
          refundedBy,
          managerApprovalId: managerApprovalId || null
        }
      }, { transaction: t });

      // d. Determine if all items in the sale are fully refunded
      const updatedRefundedMap = new Map(previouslyRefundedMap);
      itemsToRefund.forEach(item => {
        const qty = updatedRefundedMap.get(item.productId) || 0;
        updatedRefundedMap.set(item.productId, qty + item.quantity);
      });

      let allFullyRefunded = true;
      for (const saleItem of saleItems) {
        const totalRefunded = updatedRefundedMap.get(saleItem.productId) || 0;
        if (totalRefunded < saleItem.quantity) {
          allFullyRefunded = false;
          break;
        }
      }

      const saleStatus = allFullyRefunded ? 'refunded' : 'partial_refund';
      
      // Update Sales.saleStatus
      await sale.update({ saleStatus }, { transaction: t });

      // e. Decrement customer totalPurchases and loyaltyPoints if sale was for a registered customer
      if (sale.customerId) {
        const pointsToDeduct = Math.floor(totalRefundAmount);
        const customerRecord = await Customer.findOne({ where: { id: sale.customerId, shopId }, transaction: t });
        if (customerRecord) {
          const newTotalPurchases = Math.max(0, parseFloat(customerRecord.totalPurchases || 0) - totalRefundAmount);
          const newLoyaltyPoints = Math.max(0, (customerRecord.loyaltyPoints || 0) - pointsToDeduct);
          await customerRecord.update({
            totalPurchases: newTotalPurchases,
            loyaltyPoints: newLoyaltyPoints
          }, { transaction: t });
        }
      }

      // f. Log activity
      await logActivity({
        shopId,
        performedBy: req.user.id,
        performedByType: req.user.isEmployee ? 'employee' : 'user',
        action: 'refund',
        entity: 'sale',
        entityId: parseInt(saleId, 10),
        details: `Processed ${allFullyRefunded ? 'full' : 'partial'} refund for sale ${sale.invoiceNumber} (Total: ${totalRefundAmount} KSh)`
      }, t);

      await t.commit();

      res.json({
        refunds: createdRefunds,
        saleStatus,
        totalRefundAmount
      });
    } catch (error) {
      await t.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to process refund' });
  }
};

exports.getSaleRefunds = async (req, res) => {
  const { saleId } = req.params;
  const shopId = req.shopId || req.user.shopId;

  try {
    const refunds = await SaleRefund.findAll({
      where: { saleId, shopId },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // We also need the refunding employee's or user's name.
    const userIds = [];
    const employeeIds = [];

    refunds.forEach(r => {
      const refBy = r.refundedBy;
      if (refBy) {
        if (/^[0-9]+$/.test(refBy)) {
          userIds.push(parseInt(refBy, 10));
        } else {
          employeeIds.push(refBy);
        }
      }
    });

    const [users, employees] = await Promise.all([
      User.findAll({
        where: { id: userIds, shopId },
        attributes: ['id', 'name']
      }),
      Employee.findAll({
        where: { id: employeeIds, shopId },
        attributes: ['id', 'firstName', 'lastName']
      })
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u.name]));
    const employeeMap = new Map(employees.map(e => [String(e.id), `${e.firstName} ${e.lastName}`.trim()]));

    const formattedRefunds = refunds.map(r => {
      let performerName = 'Unknown';
      const refBy = r.refundedBy;
      if (refBy) {
        if (userMap.has(refBy)) {
          performerName = userMap.get(refBy);
        } else if (employeeMap.has(refBy)) {
          performerName = employeeMap.get(refBy);
        }
      }

      return {
        id: r.id,
        saleId: r.saleId,
        productId: r.productId,
        quantity: r.quantity,
        amount: parseFloat(r.amount || 0),
        refundAmount: parseFloat(r.refundAmount || 0),
        reason: r.reason,
        refundMethod: r.refundMethod,
        refundedBy: r.refundedBy,
        refunderName: performerName,
        refundedAt: r.refundedAt || r.createdAt,
        product: r.product
      };
    });

    res.json(formattedRefunds);
  } catch (error) {
    console.error('Error fetching sale refunds:', error);
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
};

exports.getAllReturns = async (req, res) => {
  const shopId = req.shopId || req.user.shopId;

  try {
    const refunds = await SaleRefund.findAll({
      where: { shopId },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'sku', 'price']
        },
        {
          model: Sale,
          as: 'sale',
          attributes: ['id', 'invoiceNumber', 'customerName', 'total', 'paymentMethod', 'createdAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const userIds = [];
    const employeeIds = [];

    refunds.forEach(r => {
      const refBy = r.refundedBy;
      if (refBy) {
        if (/^[0-9]+$/.test(refBy)) {
          userIds.push(parseInt(refBy, 10));
        } else {
          employeeIds.push(refBy);
        }
      }
    });

    const [users, employees] = await Promise.all([
      User.findAll({
        where: { id: userIds, shopId },
        attributes: ['id', 'name']
      }),
      Employee.findAll({
        where: { id: employeeIds, shopId },
        attributes: ['id', 'firstName', 'lastName']
      })
    ]);

    const userMap = new Map(users.map(u => [String(u.id), u.name]));
    const employeeMap = new Map(employees.map(e => [String(e.id), `${e.firstName} ${e.lastName}`.trim()]));

    const formattedRefunds = refunds.map(r => {
      let performerName = 'System Admin';
      const refBy = r.refundedBy;
      if (refBy) {
        if (userMap.has(refBy)) {
          performerName = userMap.get(refBy);
        } else if (employeeMap.has(refBy)) {
          performerName = employeeMap.get(refBy);
        }
      }

      return {
        id: r.id,
        saleId: r.saleId,
        productId: r.productId,
        quantity: r.quantity,
        amount: parseFloat(r.amount || 0),
        refundAmount: parseFloat(r.refundAmount || 0),
        reason: r.reason || 'Customer Return',
        refundMethod: r.refundMethod || 'cash',
        refundedBy: r.refundedBy,
        refunderName: performerName,
        refundedAt: r.refundedAt || r.createdAt,
        product: r.product,
        sale: r.sale
      };
    });

    res.json(formattedRefunds);
  } catch (error) {
    console.error('Error fetching all returns:', error);
    res.status(500).json({ error: 'Failed to fetch sales returns' });
  }
};

exports.getCreditNote = async (req, res) => {
  const { saleId } = req.params;
  const shopId = req.shopId || req.user.shopId;

  try {
    const sale = await Sale.findOne({
      where: { id: saleId, shopId },
      include: [
        { model: Customer },
        { model: User, attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const refunds = await SaleRefund.findAll({
      where: { saleId, shopId, status: 'processed' },
      include: [
        { model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'barcode'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (refunds.length === 0) {
      return res.status(404).json({ error: 'No processed refunds found for this sale' });
    }

    const settings = await SystemSettings.findOne({ where: { shopId } });
    const totalRefundedAmount = refunds.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

    const creditNote = {
      creditNoteNumber: `CN-${sale.invoiceNumber || sale.id}`,
      originalInvoiceNumber: sale.invoiceNumber,
      saleId: sale.id,
      issuedAt: refunds[0]?.refundedAt || refunds[0]?.createdAt || new Date(),
      customer: sale.Customer ? {
        name: sale.Customer.name,
        email: sale.Customer.email,
        phone: sale.Customer.phone
      } : { name: sale.customerName || 'Walk-in Customer' },
      items: refunds.map(r => ({
        refundId: r.id,
        productId: r.productId,
        productName: r.product?.name || 'Unknown Product',
        sku: r.product?.sku || 'N/A',
        quantity: r.quantity,
        amount: parseFloat(r.amount),
        disposition: r.disposition || 'restock',
        reasonCode: r.reasonCode || 'OTHER',
        reasonNotes: r.reasonNotes || r.reason || ''
      })),
      totalRefundAmount: parseFloat(totalRefundedAmount.toFixed(2)),
      paymentMethod: refunds[0]?.refundMethod || sale.paymentMethod,
      shop: {
        systemName: settings?.systemName || 'Zana POS',
        contactEmail: settings?.contactEmail,
        contactPhone: settings?.contactPhone,
        receiptHeader: settings?.receiptHeader,
        receiptFooter: settings?.receiptFooter
      }
    };

    res.json(creditNote);
  } catch (error) {
    console.error('Error fetching credit note:', error);
    res.status(500).json({ error: 'Failed to generate credit note' });
  }
};


