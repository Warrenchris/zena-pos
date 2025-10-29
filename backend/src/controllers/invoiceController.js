const Invoice = require('../models/Invoice');
const Sale = require('../models/Sale');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Shop = require('../models/Shop');
const { Op } = require('sequelize');
const PDFDocument = require('pdfkit');
const { formatCurrency } = require('../utils/currency');

// Helper function to build query options
const buildQueryOptions = (query, user) => {
  const options = {
    where: {},
    include: [
      {
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'email', 'phone']
      },
      {
        model: User,
        as: 'issuer',
        attributes: ['id', 'name', 'email']
      },
      {
        model: Shop,
        as: 'shop',
        attributes: ['id', 'name']
      }
    ],
    order: [['createdAt', 'DESC']]
  };

    // Add search filter
  if (query.search) {
    options.where[Op.or] = [
      { invoiceNumber: { [Op.like]: '%' + query.search + '%' } },
      { '$customer.name$': { [Op.like]: '%' + query.search + '%' } }
    ];
  }  // Add status filter
  if (query.status && query.status !== 'all') {
    options.where.status = query.status;
  }

  // Add date range filter
  if (query.startDate && query.endDate) {
    options.where.createdAt = {
      [Op.between]: [new Date(query.startDate), new Date(query.endDate)]
    };
  }

  // Role-based filters
  if (user.role !== 'admin') {
    options.where.shopId = user.shopId;
    if (user.role === 'cashier') {
      options.where.issuerId = user.id;
    }
  }

  // Add pagination
  if (query.page && query.limit) {
    options.offset = (query.page - 1) * query.limit;
    options.limit = parseInt(query.limit);
  }

  return options;
};

// Get all invoices with filters and pagination
exports.getInvoices = async (req, res) => {
  try {
    const options = buildQueryOptions(req.query, req.user);
    const { count, rows } = await Invoice.findAndCountAll(options);

    res.json({
      total: count,
      invoices: rows,
      currentPage: req.query.page ? parseInt(req.query.page) : 1,
      totalPages: req.query.limit ? Math.ceil(count / req.query.limit) : 1
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
};

// Get single invoice by ID
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [
        {
          model: Sale,
          as: 'sale',
          include: ['items']
        },
        {
          model: Customer,
          as: 'customer'
        },
        {
          model: User,
          as: 'issuer'
        },
        {
          model: Shop,
          as: 'shop'
        }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Check permission
    if (req.user.role !== 'admin' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

// Create new invoice
exports.createInvoice = async (req, res) => {
  try {
    const invoiceData = {
      ...req.body,
      issuerId: req.user.id,
      shopId: req.user.shopId
    };

    const invoice = await Invoice.create(invoiceData);
    
    // Fetch the created invoice with associations
    const createdInvoice = await Invoice.findByPk(invoice.id, {
      include: ['customer', 'issuer', 'shop']
    });

    res.status(201).json(createdInvoice);
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
};

// Update invoice
exports.updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Check permission
    if (req.user.role !== 'admin' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await invoice.update(req.body);
    
    // Fetch updated invoice with associations
    const updatedInvoice = await Invoice.findByPk(invoice.id, {
      include: ['customer', 'issuer', 'shop']
    });

    res.json(updatedInvoice);
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};

// Delete invoice
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id);
    
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Check permission
    if (req.user.role !== 'admin' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await invoice.destroy();
    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
};

// Generate PDF
exports.generatePDF = async (req, res) => {
  try {
    const invoice = await Invoice.findByPk(req.params.id, {
      include: [
        {
          model: Sale,
          as: 'sale',
          include: ['items']
        },
        'customer',
        'issuer',
        'shop'
      ]
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Check permission
    if (req.user.role !== 'admin' && invoice.shopId !== req.user.shopId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create PDF document
    const doc = new PDFDocument();
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice-' + invoice.invoiceNumber + '.pdf');
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add content to PDF
    doc
      .fontSize(25)
      .text('Invoice', { align: 'center' })
      .moveDown();

    doc
      .fontSize(12)
      .text('Invoice Number: ' + invoice.invoiceNumber)
      .text('Date: ' + new Date(invoice.createdAt).toLocaleDateString())
      .text('Due Date: ' + (invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'))
      .moveDown();

    // Add more invoice details...
    
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
};

// Send invoice by email - temporarily disabled
exports.sendByEmail = async (req, res) => {
  return res.status(501).json({
    message: 'Email service is temporarily disabled'
  });
};

// Get invoice statistics
exports.getStatistics = async (req, res) => {
  try {
    const where = {};
    
    // Role-based filters
    if (req.user.role !== 'admin') {
      where.shopId = req.user.shopId;
      if (req.user.role === 'cashier') {
        where.issuerId = req.user.id;
      }
    }

    // Date range filter
    if (req.query.startDate && req.query.endDate) {
      where.createdAt = {
        [Op.between]: [new Date(req.query.startDate), new Date(req.query.endDate)]
      };
    }

    const stats = await Invoice.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('SUM', sequelize.col('total')), 'totalAmount'],
        [sequelize.fn('COUNT', 
          sequelize.literal("CASE WHEN status = 'paid' THEN 1 END")), 
        'paidCount'],
        [sequelize.fn('COUNT', 
          sequelize.literal("CASE WHEN status = 'pending' THEN 1 END")), 
        'pendingCount'],
        [sequelize.fn('COUNT', 
          sequelize.literal("CASE WHEN status = 'overdue' THEN 1 END")), 
        'overdueCount']
      ]
    });

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching invoice statistics:', error);
    res.status(500).json({ error: 'Failed to fetch invoice statistics' });
  }
};