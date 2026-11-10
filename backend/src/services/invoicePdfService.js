const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatCurrency } = require('../utils/currency');

const PAGE_MARGIN = 50;
const FOOTER_RESERVE = 58;
const CONTENT_BOTTOM = () => 841.89 - PAGE_MARGIN - FOOTER_RESERVE;

const isVatRegistered = (settings) =>
  settings?.vatRegistered === true || settings?.vatRegistered === 'true' || settings?.vatRegistered === 1;

const isStructurallyValidKenyanPin = (value) =>
  /^[A-Z]\d{9}[A-Z]$/i.test(String(value || '').trim());

const getCurrencyFormatter = (settings = {}) => {
  const currency = settings.currencySymbol || settings.defaultCurrency || 'KSh';
  return (amount) => formatCurrency(amount, currency);
};

// Only load logos uploaded through the shop settings endpoint. Never accept
// arbitrary filesystem paths or remote URLs from persisted settings.
const loadShopLogo = (logoUrl) => {
  const match = String(logoUrl || '').match(/^\/uploads\/logos\/([A-Za-z0-9_-]+\.(?:png|jpe?g))$/i);
  if (!match) return null;

  const logoDirectory = path.resolve(__dirname, '../../uploads/logos');
  const logoPath = path.resolve(logoDirectory, match[1]);
  if (!logoPath.startsWith(`${logoDirectory}${path.sep}`)) return null;

  try {
    const buffer = fs.readFileSync(logoPath);
    const isPng = buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    return isPng || isJpeg ? buffer : null;
  } catch {
    return null;
  }
};

const drawRule = (doc, y, color = '#e2e8f0') => {
  doc.strokeColor(color).lineWidth(0.8).moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).stroke();
};

const drawTableHeader = (doc) => {
  const y = doc.y;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#475569');
  doc.text('ITEM', PAGE_MARGIN, y, { width: 235 });
  doc.text('QTY', 290, y, { width: 42, align: 'center' });
  doc.text('UNIT PRICE', 340, y, { width: 95, align: 'right' });
  doc.text('TOTAL', 445, y, { width: 100, align: 'right' });
  drawRule(doc, y + 16);
  return y + 24;
};

const addContentPage = (doc, withTableHeader = true) => {
  doc.addPage();
  doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
  if (withTableHeader) {
    doc.fontSize(8).fillColor('#64748b').text('INVOICE CONTINUED', PAGE_MARGIN, PAGE_MARGIN - 12);
    doc.y = PAGE_MARGIN + 8;
    return drawTableHeader(doc);
  }
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('INVOICE SUMMARY', PAGE_MARGIN, PAGE_MARGIN);
  drawRule(doc, doc.y + 8);
  return doc.y + 22;
};

const drawFooter = (doc, pageNumber, pageCount, showPoweredBy) => {
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    const y = doc.page.height - 48;
    drawRule(doc, y, '#cbd5e1');
    const text = showPoweredBy
      ? 'Thank you for your business  |  Powered by Zana POS'
      : 'Thank you for your business';
    doc.font('Helvetica').fontSize(8).fillColor('#64748b')
      .text(text, PAGE_MARGIN, y + 9, {
        width: doc.page.width - PAGE_MARGIN * 2 - 75,
        align: 'left',
        lineBreak: false,
      });
    doc.text(`Page ${pageNumber} of ${pageCount}`, doc.page.width - PAGE_MARGIN - 70, y + 9, {
      width: 70,
      align: 'right',
      lineBreak: false,
    });
  } finally {
    doc.page.margins.bottom = originalBottomMargin;
  }
};

const buildInvoicePdfDoc = (invoice, settings = {}) => {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4', bufferPages: true });
  const shop = invoice.shop || {};
  const shopName = shop.name || settings.systemName || 'Business';
  const branch = settings.branch || shop.branch || '';
  const shopAddress = shop.address || settings.address || '';
  const shopPhone = shop.phone || settings.contactPhone || '';
  const pin = String(shop.kraPin || settings.kraPin || '').trim().toUpperCase();
  const vatRegistered = isVatRegistered(settings);
  const validPin = isStructurallyValidKenyanPin(pin);
  const money = getCurrencyFormatter(settings);
  const showPoweredBy = settings.showPoweredBy !== false;
  const logoBuffer = loadShopLogo(settings.businessLogo);
  const headerX = logoBuffer ? PAGE_MARGIN + 72 : PAGE_MARGIN;
  const headerWidth = doc.page.width - PAGE_MARGIN - headerX;

  if (logoBuffer) {
    doc.image(logoBuffer, PAGE_MARGIN, PAGE_MARGIN, { fit: [58, 58] });
  }
  doc.font('Helvetica-Bold').fontSize(17).fillColor('#0f172a')
    .text(shopName, headerX, PAGE_MARGIN, { width: headerWidth });
  if (branch) doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(branch, { width: headerWidth });
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748b');
  if (shopAddress) doc.text(shopAddress, { width: headerWidth });
  const contacts = [];
  if (shopPhone) contacts.push(`Tel: ${shopPhone}`);
  if (validPin) contacts.push(`KRA PIN: ${pin}`);
  if (contacts.length) doc.text(contacts.join('  |  '), { width: headerWidth });
  if (logoBuffer) doc.y = Math.max(doc.y, PAGE_MARGIN + 62);

  doc.moveDown(0.7);
  drawRule(doc, doc.y);
  doc.moveDown(0.7);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a')
    .text(validPin && vatRegistered ? 'TAX INVOICE' : 'INVOICE');
  doc.moveDown(0.35);

  const metaY = doc.y;
  const invoiceDate = invoice.createdAt
    ? new Date(invoice.createdAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
  const customerName = invoice.sale?.Customer?.name || invoice.sale?.customer?.name || invoice.sale?.customerName || invoice.customer?.name;
  const cashier = invoice.sale?.cashierName || invoice.user?.name ||
    (invoice.employee ? `${invoice.employee.firstName || ''} ${invoice.employee.lastName || ''}`.trim() : '');
  const paymentMethod = String(invoice.paymentMethod || invoice.sale?.paymentMethod || 'Cash');
  doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
  doc.text(`Invoice: #${invoice.invoiceNumber || 'N/A'}`, PAGE_MARGIN, metaY);
  doc.text(`Date: ${invoiceDate}`, PAGE_MARGIN, metaY + 14);
  doc.text(`Status: ${String(invoice.status || 'pending').toUpperCase()}`, PAGE_MARGIN, metaY + 28);
  let rightY = metaY;
  if (customerName && customerName !== 'Walk-in Customer') {
    doc.text(`Customer: ${customerName}`, 320, rightY, { width: 225 });
    rightY += 14;
  }
  if (cashier) {
    doc.text(`Issued by: ${cashier}`, 320, rightY, { width: 225 });
    rightY += 14;
  }
  doc.text(`Payment method: ${paymentMethod}`, 320, rightY, { width: 225 });
  doc.y = Math.max(metaY + 43, rightY + 12);
  drawRule(doc, doc.y);
  doc.moveDown(0.65);

  let currentY = drawTableHeader(doc);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a');

  for (const item of items) {
    const name = String(item.product?.name || item.name || `Item #${item.productId || ''}`);
    const qty = Number(item.quantity) || 1;
    const price = Number(item.price ?? item.unitPrice ?? 0);
    const lineTotal = Number(item.total ?? (price * qty));
    const nameHeight = doc.heightOfString(name, { width: 225, font: 'Helvetica', fontSize: 8.5 });
    const rowHeight = Math.max(14, nameHeight, 12) + 8;

    if (currentY + rowHeight > CONTENT_BOTTOM()) {
      currentY = addContentPage(doc, true);
      doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a');
    }

    doc.text(name, PAGE_MARGIN, currentY, { width: 225, height: rowHeight - 4 });
    doc.text(String(qty), 290, currentY, { width: 42, align: 'center' });
    doc.text(money(price), 340, currentY, { width: 95, align: 'right' });
    doc.text(money(lineTotal), 445, currentY, { width: 100, align: 'right' });
    drawRule(doc, currentY + rowHeight - 3, '#f1f5f9');
    currentY += rowHeight;
  }

  const subtotal = Number(invoice.subtotal ?? invoice.total ?? 0);
  const discount = Number(invoice.discount || 0);
  const tax = Number(invoice.tax ?? invoice.sale?.taxAmount ?? 0);
  const total = Number(invoice.total ?? subtotal);
  const taxRate = Number(invoice.sale?.taxRate || settings.taxRate || 0);
  const taxInclusive = invoice.sale?.taxInclusive != null ? Boolean(invoice.sale.taxInclusive) : Boolean(settings.taxInclusive);
  const summaryRows = 34 + (discount > 0 ? 16 : 0) + (tax > 0 ? 16 : 0) + 24;

  if (currentY + summaryRows > CONTENT_BOTTOM()) {
    currentY = addContentPage(doc, false);
  } else {
    currentY += 8;
  }

  drawRule(doc, currentY);
  currentY += 12;
  doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
  const drawTotalRow = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10.5 : 8.5).fillColor('#0f172a');
    doc.text(label, 340, currentY, { width: 95, align: 'right' });
    doc.text(value, 445, currentY, { width: 100, align: 'right' });
    currentY += bold ? 22 : 16;
  };
  drawTotalRow('Subtotal:', money(subtotal));
  if (discount > 0) drawTotalRow('Discount:', `-${money(discount)}`);
  if (tax > 0) drawTotalRow(taxRate > 0 ? `Tax (${taxRate}%${taxInclusive ? ' incl.' : ''}):` : 'Tax:', money(tax));
  drawTotalRow('TOTAL:', money(total), true);

  const range = doc.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    doc.switchToPage(page);
    drawFooter(doc, page + 1, range.count, showPoweredBy);
  }
  return doc;
};

module.exports = { buildInvoicePdfDoc, isStructurallyValidKenyanPin };
