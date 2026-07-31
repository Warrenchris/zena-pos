const { Op } = require('sequelize');
const { Invoice, InvoiceItem, Sale, SaleItem, User, Shop, Product } = require('../models');
const PDFDocument = require('pdfkit');
const { formatCurrency } = require('../utils/currency');

// Helper: always restrict to user's shop
const shopWhere = (req) => ({ shopId: req.user.shopId });

// List invoices for user's shop with optional filters
exports.getInvoices = async (req, res) => {
  try {
    const where = { ...shopWhere(req) };
    if (req.query.status) where.status = req.query.status;
    if (req.query.search)
      where.invoiceNumber = { [Op.like]: `%${req.query.search}%` };
    if (req.query.startDate && req.query.endDate) {
      where.createdAt = {
        [Op.between]: [new Date(req.query.startDate), new Date(req.query.endDate)]
      };
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { count, rows } = await Invoice.findAndCountAll({
      where,
      include: [ { model: User, as: 'user' }, { model: Shop, as: 'shop' } ],
      order: [['createdAt','DESC']],
      limit,
      offset
    });
    res.json({ total: count, invoices: rows, currentPage: page, totalPages: Math.ceil(count/limit) });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ error: 'Failed to fetch invoices', details: error.message });
  }
};

// Get invoice with items and sale (must belong to user's shop)
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      where: { id: req.params.id, ...shopWhere(req) },
      include: [
        { model: User, as: 'user' },
        { model: Shop, as: 'shop' },
        { model: InvoiceItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Sale, as: 'sale' },
      ],
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
};

// Create invoice from saleId (must belong to your shop, auto-copy sale items)
exports.createInvoice = async (req, res) => {
  try {
    const { saleId, paymentMethod, paymentDate } = req.body;
    if (!saleId) return res.status(400).json({ error: 'saleId required' });
    // Sale must exist AND belong to user's shop
    const sale = await Sale.findOne({ where: { id: saleId, shopId: req.user.shopId } });
    if (!sale) return res.status(400).json({ error: 'Sale not found for this shop' });

    // Generate unique invoice number: INV-{timestamp}-{shopId}
    const invoiceNumber = `INV-${Date.now()}-${req.user.shopId}`;
    const subtotal = sale.subtotal ?? (sale.total - (sale.tax ?? 0) + (sale.discount ?? 0));
    const tax = sale.tax ?? 0;
    const discount = sale.discount ?? 0;
    const total = sale.total ?? 0;

    // Create Invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      saleId,
      userId: req.user.id,
      shopId: req.user.shopId,
      subtotal,
      tax,
      discount,
      total,
      status: 'pending',
      paymentMethod: paymentMethod || sale.paymentMethod || null,
      paymentDate: paymentDate || null,
    });

    // Copy SaleItems to InvoiceItems
    const saleItems = await SaleItem.findAll({ where: { saleId: sale.id } });
    for (const sItem of saleItems) {
      const price = Number(sItem.unitPrice ?? sItem.price ?? sItem.originalPrice ?? 0);
      const quantity = Number(sItem.quantity || 1);
      const totalItem = Number(sItem.subtotal ?? (price * quantity));

      await InvoiceItem.create({
        invoiceId: invoice.id,
        productId: sItem.productId,
        quantity,
        price,
        total: totalItem,
      });
    }

    // Return invoice with associations
    const result = await Invoice.findOne({
      where: { id: invoice.id },
      include: [
        { model: User, as: 'user' },
        { model: Shop, as: 'shop' },
        { model: InvoiceItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Sale, as: 'sale' },
      ],
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ error: 'Failed to create invoice', details: error.message });
  }
};

// Update invoice status only if belongs to your shop
exports.updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ where: { id: req.params.id, ...shopWhere(req) } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    // Only allow updating status, payment info
    if (req.body.status) invoice.status = req.body.status;
    if (req.body.paymentMethod) invoice.paymentMethod = req.body.paymentMethod;
    if (req.body.paymentDate) invoice.paymentDate = req.body.paymentDate;
    await invoice.save();
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update invoice' });
  }
};

// Delete invoice (must be in your shop)
exports.deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ where: { id: req.params.id, ...shopWhere(req) } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    await invoice.destroy();
    res.json({ message: 'Invoice deleted' });
  } catch (error) {
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
    const where = { ...shopWhere(req) };
    
    // Date range filter
    if (req.query.startDate && req.query.endDate) {
      where.createdAt = {
        [Op.between]: [new Date(req.query.startDate), new Date(req.query.endDate)]
      };
    }

    const stats = await Invoice.findAll({
      where,
      attributes: [
        [Invoice.sequelize.fn('COUNT', Invoice.sequelize.col('id')), 'total'],
        [Invoice.sequelize.fn('SUM', Invoice.sequelize.col('total')), 'totalAmount'],
        [Invoice.sequelize.fn('COUNT', 
          Invoice.sequelize.literal("CASE WHEN status = 'paid' THEN 1 END")), 
        'paidCount'],
        [Invoice.sequelize.fn('COUNT', 
          Invoice.sequelize.literal("CASE WHEN status = 'pending' THEN 1 END")), 
        'pendingCount'],
        [Invoice.sequelize.fn('COUNT', 
          Invoice.sequelize.literal("CASE WHEN status = 'overdue' THEN 1 END")), 
        'overdueCount']
      ]
    });

    res.json(stats[0]);
  } catch (error) {
    console.error('Error fetching invoice statistics:', error);
    res.status(500).json({ error: 'Failed to fetch invoice statistics' });
  }
};