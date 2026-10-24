const { Op } = require('sequelize');
const { Invoice, InvoiceItem, Sale, SaleItem, User, Employee, Shop, Product } = require('../models');
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
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: Employee, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'email'] },
        { model: Shop, as: 'shop' }
      ],
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
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: Employee, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'email'] },
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

    const resolvedUserId = !req.user.isEmployee ? req.user.id : null;
    const resolvedEmployeeId = req.user.isEmployee ? req.user.id : null;
    const resolvedOrgId = req.organizationId || req.user?.organizationId || sale.organizationId || null;

    // Create Invoice
    const invoice = await Invoice.create({
      invoiceNumber,
      saleId,
      userId: resolvedUserId,
      employeeId: resolvedEmployeeId,
      organizationId: resolvedOrgId,
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
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: Employee, as: 'employee', attributes: ['id', 'firstName', 'lastName', 'email'] },
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
    const where = req.user?.role === 'super_admin' ? { id: req.params.id } : { id: req.params.id, ...shopWhere(req) };
    const invoice = await Invoice.findOne({
      where,
      include: [
        { model: Shop, as: 'shop' },
        { model: InvoiceItem, as: 'items', include: [{ model: Product, as: 'product' }] },
        { model: Sale, as: 'sale' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: Employee, as: 'employee', attributes: ['id', 'firstName', 'lastName'] },
      ]
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const shop = invoice.shop || {};
    const shopName = shop.name || 'Zana POS';
    const shopAddress = shop.address || '';
    const shopPhone = shop.phone || '';
    const shopKraPin = shop.kraPin ? `KRA PIN: ${shop.kraPin}` : '';

    // Create PDF document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice-' + invoice.invoiceNumber + '.pdf');
    
    // Pipe PDF to response
    doc.pipe(res);

    // Header: Real Shop branding
    doc.fontSize(20).font('Helvetica-Bold').text(shopName, { align: 'left' });
    doc.fontSize(10).font('Helvetica');
    if (shopAddress) doc.text(shopAddress);
    if (shopPhone) doc.text(`Tel: ${shopPhone}`);
    if (shopKraPin) doc.text(shopKraPin);

    doc.moveDown(1);
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Meta details
    doc.fontSize(16).font('Helvetica-Bold').text('INVOICE', { align: 'left' });
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica');
    const startY = doc.y;
    doc.text(`Invoice Number: #${invoice.invoiceNumber}`, 50, startY);
    doc.text(`Date Issued: ${new Date(invoice.createdAt).toLocaleDateString()}`, 50, startY + 15);
    doc.text(`Status: ${(invoice.status || 'pending').toUpperCase()}`, 50, startY + 30);

    if (invoice.paymentMethod) {
      doc.text(`Payment Method: ${invoice.paymentMethod.toUpperCase()}`, 350, startY);
    }
    const billedTo = invoice.user?.name || (invoice.employee ? `${invoice.employee.firstName} ${invoice.employee.lastName}` : null);
    if (billedTo) {
      doc.text(`Issued By: ${billedTo}`, 350, startY + 15);
    }

    doc.y = startY + 55;
    doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(1);

    // Table Header
    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Item', 50, tableTop);
    doc.text('Qty', 280, tableTop, { width: 50, align: 'center' });
    doc.text('Unit Price', 350, tableTop, { width: 90, align: 'right' });
    doc.text('Total', 455, tableTop, { width: 90, align: 'right' });
    doc.strokeColor('#e5e7eb').lineWidth(1).moveTo(50, tableTop + 15).lineTo(545, tableTop + 15).stroke();

    // Table Rows
    let currentY = tableTop + 25;
    doc.font('Helvetica').fontSize(10);
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    items.forEach((item) => {
      const name = item.product?.name || item.name || `Item #${item.productId || ''}`;
      const qty = item.quantity || 1;
      const price = Number(item.price || 0);
      const total = Number(item.total || (price * qty));

      doc.text(name, 50, currentY, { width: 220 });
      doc.text(String(qty), 280, currentY, { width: 50, align: 'center' });
      doc.text(formatCurrency(price), 350, currentY, { width: 90, align: 'right' });
      doc.text(formatCurrency(total), 455, currentY, { width: 90, align: 'right' });
      currentY += 20;
    });

    doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, currentY + 5).lineTo(545, currentY + 5).stroke();
    currentY += 15;

    // Totals
    const subtotal = Number(invoice.subtotal || invoice.total || 0);
    const tax = Number(invoice.tax || 0);
    const discount = Number(invoice.discount || 0);
    const total = Number(invoice.total || subtotal);

    doc.font('Helvetica').text('Subtotal:', 350, currentY, { width: 90, align: 'right' });
    doc.text(formatCurrency(subtotal), 455, currentY, { width: 90, align: 'right' });
    currentY += 15;

    if (discount > 0) {
      doc.text('Discount:', 350, currentY, { width: 90, align: 'right' });
      doc.text(`-${formatCurrency(discount)}`, 455, currentY, { width: 90, align: 'right' });
      currentY += 15;
    }

    if (tax > 0) {
      doc.text('Tax / VAT:', 350, currentY, { width: 90, align: 'right' });
      doc.text(formatCurrency(tax), 455, currentY, { width: 90, align: 'right' });
      currentY += 15;
    }

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL:', 350, currentY, { width: 90, align: 'right' });
    doc.text(formatCurrency(total), 455, currentY, { width: 90, align: 'right' });

    // Footer
    doc.fontSize(9).font('Helvetica').fillColor('#6b7280');
    doc.text('Thank you for your business! Powered by Zana POS.', 50, 750, { align: 'center', width: 495 });

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