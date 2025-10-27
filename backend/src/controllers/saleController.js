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
      userId: req.user.id,
      action: 'UPDATE_SALE',
      details: `Updated sale ${sale.invoiceNumber} status to ${status}`,
      entityId: sale.id,
      entityType: 'sale',
      shopId: req.user.shopId
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
      userId: req.user.id,
      action: 'DELETE_SALE',
      details: `Deleted sale ${sale.invoiceNumber}`,
      entityId: sale.id,
      entityType: 'sale',
      shopId: req.user.shopId
    }, { transaction: t });

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
      customer,
      customerId,
      paymentMethod,
      paymentAmount,
      discount = 0,
      tax = 0,
      notes,
      total: frontendTotal,
      change: frontendChange,
      employeeId: frontendEmployeeId
    } = req.body;
    
    // Always use the current user's ID as the employeeId for cashiers
    const employeeId = req.user.id;

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

      // Use frontend price if provided, otherwise use product price
      const itemPrice = item.price || product.price;
      const itemSubtotal = itemPrice * item.quantity;
      subtotal += itemSubtotal;

      productUpdates.push({
        id: product.id,
        stockQuantity: product.stockQuantity - item.quantity
      });

      saleItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price, // Always store the original product price
        price: itemPrice, // Store the actual price used (frontend or product)
        subtotal: itemSubtotal,
        discount: item.discount || 0
      });
    }

    // Use frontend total if provided and valid, otherwise calculate
    const total = frontendTotal && frontendTotal > 0 ? parseFloat(frontendTotal) : (subtotal + tax - discount);
    
    // Calculate change if payment amount is provided
    const change = frontendChange !== undefined ? parseFloat(frontendChange) : (paymentAmount ? parseFloat(paymentAmount) - total : 0);

    // Generate invoice number (YYYYMMDD-XXXX format) with transaction lock
    const date = new Date();
    const dateStr = date.toISOString().slice(0,10).replace(/-/g,'');
    
    const [lastSale] = await Sale.findAll({
      where: {
        invoiceNumber: {
          [Op.like]: `${dateStr}-%`
        },
        shopId: req.user.shopId
      },
      order: [['invoiceNumber', 'DESC']],
      limit: 1,
      lock: true,
      transaction: t
    });

    let sequence = '0001';
    if (lastSale) {
      const lastSequence = parseInt(lastSale.invoiceNumber.split('-')[1]);
      sequence = String(lastSequence + 1).padStart(4, '0');
    }
    const invoiceNumber = `${dateStr}-${sequence}`;

    // Resolve userId (integer) vs employeeId (UUID)
    const jwtId = req.user?.id;
    const resolvedUserId = (typeof jwtId === 'number')
      ? jwtId
      : (typeof jwtId === 'string' && /^\d+$/.test(jwtId))
        ? parseInt(jwtId, 10)
        : null;

    // Create sale with customer information and employee tracking
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
      // Store customer information directly in sale record
      customerName: customer?.name || 'Walk-in Customer',
      customerLocation: customer?.location || null,
      customerPhone: customer?.phone || null,
      customerEmail: customer?.email || null,
      customerId,
      userId: resolvedUserId, // Only set when numeric
      employeeId: employeeId || jwtId, // Track which employee/cashier made the sale
      notes,
      shopId: req.user.shopId
    }, { transaction: t });

    // Create sale items
    try {
      await Promise.all(saleItems.map(item => 
        SaleItem.create({
          ...item,
          saleId: sale.id,
          shopId: req.user.shopId
        }, { transaction: t })
      ));

      // Update product stock
      await Promise.all(productUpdates.map(update =>
        Product.update(
          { stockQuantity: update.stockQuantity },
          { where: { id: update.id }, transaction: t }
        )
      ));
    } catch (error) {
      await t.rollback();
      console.error('Error creating sale items or updating stock:', error);
      return res.status(500).json({ error: 'Failed to process sale items' });
    }

    // Handle customer creation/update for customer relationship management
    let finalCustomerId = customerId;
    
    if (customer && customer.name && customer.name !== 'Walk-in Customer') {
      // Try to find existing customer by email, phone, or name
      let customerRecord = await Customer.findOne({
        where: { 
          shopId: req.user.shopId,
          [Op.or]: [
            ...(customer.email ? [{ email: customer.email }] : []),
            ...(customer.phone ? [{ phone: customer.phone }] : []),
            { name: customer.name }
          ]
        },
        transaction: t
      });

      if (!customerRecord) {
        // Create new customer
        customerRecord = await Customer.create({
          name: customer.name,
          email: customer.email || null,
          phone: customer.phone || null,
          location: customer.location || null,
          totalPurchases: total,
          lastVisit: new Date(),
          shopId: req.user.shopId
        }, { transaction: t });
      } else {
        // Update existing customer
        const loyaltyPoints = Math.floor(total); // 1 point per currency unit
        await customerRecord.update({
          totalPurchases: parseFloat(customerRecord.totalPurchases) + total,
          loyaltyPoints: customerRecord.loyaltyPoints + loyaltyPoints,
          lastVisit: new Date(),
          ...(customer.email && { email: customer.email }),
          ...(customer.phone && { phone: customer.phone }),
          ...(customer.location && { location: customer.location })
        }, { transaction: t });
      }
      
      finalCustomerId = customerRecord.id;
      
      // Update sale with customer ID
      await sale.update({ customerId: finalCustomerId }, { transaction: t });
    } else if (customerId) {
      // Update existing customer's total purchases and loyalty points
      const customer = await Customer.findByPk(customerId, { transaction: t });
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
    try {
      await logActivity({
        userId: req.user.id,
        action: 'SALE_CREATED',
        details: `Created sale ${invoiceNumber} with total ${total}`,
        entityId: sale.id,
        entityType: 'sale',
        shopId: req.user.shopId
      });
    } catch (error) {
      console.warn('Failed to log sale activity:', error);
      // Continue execution as this is non-critical
    }

    // Fetch complete sale with relations
    const completeSale = await Sale.findOne({
      where: { id: sale.id },
      attributes: {
        exclude: ['UserId', 'CustomerId'] // Explicitly exclude any duplicate columns
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

// Get cashier-specific sales statistics
exports.getCashierStats = async (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;
    
    // Default the dates if not provided (use UTC day boundaries to avoid TZ drift)
    const now = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const end = endDate
      ? new Date(endDate)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    // Build where clause
    const whereClause = {
      shopId: req.user.shopId,
      createdAt: {
        [Op.between]: [start, end]
      }
    };

    // For cashiers and employees, always show their own stats only
    if (req.user.role === 'cashier' || req.user.role === 'employee') {
      try {
        whereClause.employeeId = UuidHelper.validate(req.user.id);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid employee ID format',
          details: error.message
        });
      }
    }
    // For managers/admins, filter by employeeId if provided
    else if (employeeId) {
      try {
        const validEmployeeId = UuidHelper.validate(employeeId);
        const employee = await Employee.findOne({
          where: { 
            id: validEmployeeId,
            shopId: req.user.shopId 
          }
        });
        
        if (!employee) {
          return res.status(404).json({ 
            error: 'Employee not found',
            details: `No employee found with ID ${employeeId} in shop ${req.user.shopId}`
          });
        }
        whereClause.employeeId = validEmployeeId;
      } catch (err) {
        console.error('Error finding employee:', err);
        return res.status(400).json({
          error: 'Invalid employee ID format',
          details: err.message
        });
      }
    }

    // Get sales data
    const sales = await Sale.findAll({
      where: whereClause,
      attributes: [
        'id',
        'total',
        'createdAt',
        'employeeId'
      ],
      include: [
        {
          model: Employee,
          attributes: ['id', 'firstName', 'lastName'],
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Add debug logging
    console.log('Fetched sales:', {
      count: sales.length,
      employeeIds: sales.map(s => s.employeeId)
    });

    // Calculate statistics with error handling
    const totalSales = sales.reduce((sum, sale) => {
      const total = parseFloat(sale.total || 0);
      return isNaN(total) ? sum : sum + total;
    }, 0);
    const orderCount = sales.length;

    // Get today's stats specifically
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0));
    const todayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    const todaySales = sales.filter(sale => {
      const saleDate = new Date(sale.createdAt);
      return saleDate >= todayStart && saleDate <= todayEnd;
    });

    const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const todayCount = todaySales.length;

    // Get this week's stats
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

    const weekTotal = weekSales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const weekCount = weekSales.length;

    res.json({
      today: {
        totalSales: todayTotal,
        orderCount: todayCount
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
      sales: sales.slice(0, 10) // Return recent sales for the dashboard
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
          startDate || new Date(new Date().setHours(0,0,0,0)),
          endDate || new Date(new Date().setHours(23,59,59,999))
        ]
      };
    }

    // Add cashier filter
    if (cashierId) {
      whereClause.employeeId = cashierId;
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
        employee: sales.rows[0].Employee?.firstName || 'No employee'
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
    const whereClause = {
      shopId: req.user.shopId,
      employeeId: req.user.id // Only show sales made by this cashier
    };

    // Add date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {
        [Op.between]: [
          startDate || new Date(new Date().setHours(0,0,0,0)),
          endDate || new Date(new Date().setHours(23,59,59,999))
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
