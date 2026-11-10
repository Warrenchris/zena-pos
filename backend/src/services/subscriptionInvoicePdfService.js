const PDFDocument = require('pdfkit');

const PAGE_MARGIN = 52;
const formatMoney = (amount, currency) => {
  const value = Number(amount || 0);
  const formatted = value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency || 'KES'} ${formatted}`;
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

const getPlatformEmail = () => {
  const candidates = [process.env.SMTP_FROM, process.env.SMTP_USER];
  for (const candidate of candidates) {
    const match = String(candidate || '').trim().match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) return match[0];
  }
  return '';
};

const buildSubscriptionInvoicePdfDoc = (invoice, options = {}) => {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
  const configuredName = String(options.companyName || process.env.COMPANY_NAME || '').trim();
  const platformName = configuredName || 'Zana POS';
  const platformEmail = options.companyEmail || getPlatformEmail();
  // Sequelize's unaliased model associations use their model names as properties.
  // Lowercase fallbacks keep the pure generator convenient for isolated callers.
  const organization = invoice.Organization || invoice.organization || {};
  const plan = invoice.Plan || invoice.plan || {};
  const subscription = invoice.Subscription || invoice.subscription || {};
  const organizationName = organization.name || 'Organization';
  const invoiceNumber = String(invoice.invoiceNumber || `SUB-${invoice.id}`);
  const status = String(invoice.status || 'pending').toLowerCase();
  const isPaid = status === 'paid';
  const isRefunded = status === 'refunded';
  const title = isPaid ? 'PAYMENT RECEIPT' : 'SUBSCRIPTION INVOICE';
  const currency = String(invoice.currency || organization.currency || 'KES').toUpperCase();
  const amount = formatMoney(invoice.amount, currency);
  const planName = plan.name || 'Subscription plan';
  const channel = invoice.paymentChannel ? String(invoice.paymentChannel).replace(/_/g, ' ').toUpperCase() : 'Not available';
  const invoiceBillingCycle = invoice.metadata?.billingCycle || subscription.billingCycle;
  const billingCycle = invoiceBillingCycle
    ? String(invoiceBillingCycle).replace(/_/g, ' ').toUpperCase()
    : '';
  const reference = invoice.gatewayReference || invoice.paymentReference || '';
  const referenceLabel = invoice.gatewayReference && isPaid && invoice.paymentChannel === 'mpesa'
    ? 'M-Pesa receipt'
    : invoice.gatewayReference
      ? 'Gateway reference'
      : 'Payment reference';
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  doc.font('Helvetica-Bold').fontSize(19).fillColor('#0f172a')
    .text(platformName, PAGE_MARGIN, y, { width: pageWidth });
  y = doc.y + 3;
  doc.font('Helvetica').fontSize(9).fillColor('#475569');
  if (platformEmail) {
    doc.text(platformEmail, PAGE_MARGIN, y, { width: pageWidth });
    y = doc.y + 18;
  } else {
    y += 22;
  }

  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).stroke();
  y += 26;
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a')
    .text(title, PAGE_MARGIN, y, { width: pageWidth });
  y = doc.y + 18;

  const addLabelValue = (label, value) => {
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(label.toUpperCase(), PAGE_MARGIN, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
      .text(String(value || '—'), PAGE_MARGIN + 175, y, { width: pageWidth - 175 });
    y = Math.max(doc.y, y + 14) + 8;
  };

  addLabelValue('Invoice number', invoiceNumber);
  addLabelValue('Issued to', organizationName);
  addLabelValue('Issue date', formatDate(invoice.createdAt));
  addLabelValue('Status', status.toUpperCase());
  addLabelValue('Plan', planName);
  if (billingCycle) addLabelValue('Billing cycle', billingCycle);
  addLabelValue('Payment channel', channel);

  if (invoice.billingPeriodStart && invoice.billingPeriodEnd) {
    addLabelValue('Billing period', `${formatDate(invoice.billingPeriodStart)} – ${formatDate(invoice.billingPeriodEnd)}`);
  }
  if (invoice.paidAt) addLabelValue('Paid on', formatDate(invoice.paidAt));
  if (reference) addLabelValue(referenceLabel, reference);

  y += 12;
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).stroke();
  y += 22;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569')
    .text('AMOUNT', PAGE_MARGIN, y);
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#0f172a')
    .text(amount, PAGE_MARGIN, y + 18, { width: pageWidth });
  y = doc.y + 35;

  doc.strokeColor('#e2e8f0').lineWidth(0.8).moveTo(PAGE_MARGIN, y).lineTo(doc.page.width - PAGE_MARGIN, y).stroke();
  y += 14;
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748b')
    .text(`Subscription billing record issued by ${platformName}.`, PAGE_MARGIN, y, { width: pageWidth });
  if (isRefunded) {
    doc.text('This payment has been marked as refunded.', PAGE_MARGIN, doc.y + 4, { width: pageWidth });
  } else if (status === 'failed') {
    doc.text('The payment attempt was not completed.', PAGE_MARGIN, doc.y + 4, { width: pageWidth });
  } else if (status === 'pending') {
    doc.text('Payment is pending and has not been recorded as completed.', PAGE_MARGIN, doc.y + 4, { width: pageWidth });
  }
  doc.text('Keep this document with your organization billing records.', PAGE_MARGIN, doc.y + 4, { width: pageWidth });

  const footerY = doc.page.height - 48;
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    doc.strokeColor('#cbd5e1').lineWidth(0.8).moveTo(PAGE_MARGIN, footerY).lineTo(doc.page.width - PAGE_MARGIN, footerY).stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#64748b')
      .text(`Generated by ${platformName}`, PAGE_MARGIN, footerY + 9, {
        width: pageWidth,
        align: 'center',
        lineBreak: false
      });
  } finally {
    doc.page.margins.bottom = originalBottomMargin;
  }

  return doc;
};

module.exports = { buildSubscriptionInvoicePdfDoc, getPlatformEmail };
