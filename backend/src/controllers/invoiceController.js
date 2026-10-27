const { Op } = require('sequelize');
const { Invoice, InvoiceItem, Sale, SaleItem, User, Employee, Shop, Product, SystemSettings } = require('../models');
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
// Build Invoice PDF Document
exports.buildInvoicePdfDoc = (invoice, settings = {}) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  const shop = invoice.shop || {};
  const shopName = shop.name || settings.systemName || 'Zana POS';
  const branch = settings.branch || shop.branch || '';
  const shopAddress = shop.address || settings.address || '';
  const shopPhone = shop.phone || settings.contactPhone || '';
  const shopKraPin = shop.kraPin || settings.kraPin || '';

  // Header: Shop Name & Branch
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#0f172a').text(shopName.toUpperCase(), { align: 'left' });
  if (branch) {
    doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#475569').text(branch.toUpperCase(), { align: 'left' });
  }

  doc.fontSize(9.5).font('Helvetica').fillColor('#475569');
  if (shopAddress) doc.text(shopAddress);
  const contactParts = [];
  if (shopPhone) contactParts.push(`Tel: ${shopPhone}`);
  if (shopKraPin) contactParts.push(`PIN: ${shopKraPin}`);
  if (contactParts.length) doc.text(contactParts.join(' | '));

  doc.moveDown(0.8);
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);

  // Document Title & Meta block
  const hasVatPin = Boolean(shopKraPin && String(shopKraPin).trim().length > 0);
  const isVatRegistered = Boolean(settings.vatRegistered === true || settings.vatRegistered === 'true' || settings.vatRegistered === 1);
  const docTitle = (hasVatPin && isVatRegistered) ? 'TAX INVOICE' : 'INVOICE';
  doc.fontSize(15).font('Helvetica-Bold').fillColor('#0f172a').text(docTitle, { align: 'left' });
  doc.moveDown(0.4);

  const startY = doc.y;
  doc.fontSize(9.5).font('Helvetica').fillColor('#1e293b');

  const invNum = invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : 'N/A';
  const dateFormatted = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric' })
    : '-';
  const statusFormatted = (invoice.status || 'pending').toUpperCase();

  doc.text(`Invoice: ${invNum}`, 50, startY);
  doc.text(`Date: ${dateFormatted}`, 50, startY + 15);
  doc.text(`Status: ${statusFormatted}`, 50, startY + 30);

  const customerName = invoice.sale?.Customer?.name || invoice.sale?.customer?.name || invoice.sale?.customerName || invoice.customer?.name || null;
  const cashierOrIssuer = invoice.sale?.cashierName || invoice.user?.name || (invoice.employee ? `${invoice.employee.firstName || ''} ${invoice.employee.lastName || ''}`.trim() : null);
  const paymentMethod = invoice.paymentMethod || invoice.sale?.paymentMethod || 'Cash';

  let rightColY = startY;
  if (customerName && customerName !== 'Walk-in Customer') {
    doc.text(`Customer: ${customerName}`, 330, rightColY);
    rightColY += 15;
  }
  if (cashierOrIssuer) {
    doc.text(`Cashier / Issued By: ${cashierOrIssuer}`, 330, rightColY);
    rightColY += 15;
  }
  doc.text(`Payment Method: ${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}`, 330, rightColY);

  const maxY = Math.max(startY + 48, rightColY + 18);
  doc.y = maxY;
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);

  // Items Table Header
  const tableTop = doc.y;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#64748b');
  doc.text('ITEM', 50, tableTop);
  doc.text('QTY', 290, tableTop, { width: 45, align: 'center' });
  doc.text('UNIT PRICE', 345, tableTop, { width: 95, align: 'right' });
  doc.text('TOTAL', 450, tableTop, { width: 95, align: 'right' });

  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke();

  // Items Table Rows
  let currentY = tableTop + 22;
  doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a');
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  items.forEach((item) => {
    const name = item.product?.name || item.name || `Item #${item.productId || ''}`;
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price || item.unitPrice || 0);
    const lineTotal = Number(item.total ?? (price * qty));

    doc.text(name, 50, currentY, { width: 235 });
    doc.text(String(qty), 290, currentY, { width: 45, align: 'center' });
    doc.text(formatCurrency(price), 345, currentY, { width: 95, align: 'right' });
    doc.text(formatCurrency(lineTotal), 450, currentY, { width: 95, align: 'right' });
    currentY += 18;
  });

  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, currentY + 4).lineTo(545, currentY + 4).stroke();
  currentY += 14;

  // Totals Section
  const subtotal = Number(invoice.subtotal ?? (invoice.total || 0));
  const discount = Number(invoice.discount || 0);
  const tax = Number(invoice.tax || invoice.sale?.taxAmount || 0);
  const total = Number(invoice.total || subtotal);

  const taxRate = Number(invoice.sale?.taxRate || settings.taxRate || 0);
  const taxIncl = invoice.sale?.taxInclusive != null ? Boolean(invoice.sale.taxInclusive) : Boolean(settings.taxInclusive);
  const taxLabel = taxRate > 0 ? `Tax (${taxRate}%${taxIncl ? ' incl.' : ''}):` : 'Tax:';

  doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
  doc.text('Subtotal:', 345, currentY, { width: 95, align: 'right' });
  doc.text(formatCurrency(subtotal), 450, currentY, { width: 95, align: 'right' });
  currentY += 16;

  if (discount > 0) {
    doc.text('Discount:', 345, currentY, { width: 95, align: 'right' });
    doc.text(`-${formatCurrency(discount)}`, 450, currentY, { width: 95, align: 'right' });
    currentY += 16;
  }

  if (tax > 0) {
    doc.text(taxLabel, 345, currentY, { width: 95, align: 'right' });
    doc.text(formatCurrency(tax), 450, currentY, { width: 95, align: 'right' });
    currentY += 16;
  }

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a');
  doc.text('TOTAL:', 345, currentY, { width: 95, align: 'right' });
  doc.text(formatCurrency(total), 450, currentY, { width: 95, align: 'right' });

  // Footer: Separator and white-label text
  doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(50, 740).lineTo(545, 740).stroke();
  doc.fontSize(8.5).font('Helvetica').fillColor('#64748b');
  const showPoweredBy = settings.showPoweredBy !== false;
  const footerText = showPoweredBy
    ? 'Thank you for your business! · Powered by Zana POS'
    : 'Thank you for your business!';
  doc.text(footerText, 50, 750, { align: 'center', width: 495 });

  return doc;
};

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

    const settings = (await SystemSettings.findOne({ where: { shopId: invoice.shopId } })) || {};
    const doc = exports.buildInvoicePdfDoc(invoice, settings);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice-' + invoice.invoiceNumber + '.pdf');
    doc.pipe(res);
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