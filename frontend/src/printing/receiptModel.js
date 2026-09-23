/**
 * Receipt data model: a plain, printer-agnostic description of one sale.
 *
 * Everything downstream (ESC/POS, HTML, plain text, and later PDF or
 * WhatsApp receipts) renders from this one structure, so a receipt can never
 * differ between output channels.
 */

const PAYMENT_LABELS = {
  cash: 'Cash',
  card: 'Card',
  mpesa: 'M-Pesa',
  split: 'Split Tender',
};

const paymentLabel = (method) => {
  const key = String(method || 'cash').toLowerCase();
  if (PAYMENT_LABELS[key]) return PAYMENT_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

const DEFAULT_FOOTER = 'Thank you for your business!';

/**
 * @param {object} completedSale  { serverData, items, customer, total, paymentMethod,
 *                                  paymentAmount, change, notes, isOffline }
 * @param {object} [options]
 * @param {object} [options.business]  { name, address, phone, kraPin }
 * @param {object} [options.receiptSettings]  { header, footer, showLogo, logoUrl } (see receiptSettings.js)
 * @param {Date}   [options.now]
 */
export function buildReceipt(completedSale, { business = {}, receiptSettings = {}, now = new Date() } = {}) {
  const {
    serverData,
    items = [],
    customer,
    total = 0,
    paymentMethod = 'cash',
    paymentAmount = 0,
    change = 0,
    notes,
    isOffline = false,
  } = completedSale || {};

  const lines = items.map((item) => {
    const unitPrice = num(item.price);
    const quantity = item.quantity ?? 1;
    return {
      name: item.name || 'Item',
      quantity,
      unitPrice,
      lineTotal: unitPrice * num(quantity),
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const grandTotal = num(total);
  const customFooter = typeof receiptSettings?.footer === 'string' ? receiptSettings.footer.trim() : '';
  const isCash = String(paymentMethod).toLowerCase() === 'cash';

  return {
    // Logo is only ever an image URL (HTML/browser printing); ESC/POS output has no logo yet.
    logoUrl: receiptSettings?.showLogo !== false && receiptSettings?.logoUrl ? receiptSettings.logoUrl : null,
    business: {
      name: business?.name || '',
      address: business?.address || '',
      phone: business?.phone || '',
      kraPin: business?.kraPin || '',
    },
    meta: {
      invoiceNumber: String(serverData?.invoiceNumber || serverData?.id || 'N/A'),
      dateTime: serverData?.createdAt || now,
      customerName: customer?.name || 'Walk-in Customer',
      paymentLabel: paymentLabel(paymentMethod),
      isOffline: Boolean(isOffline),
    },
    lines,
    totals: {
      subtotal,
      discount: Math.max(0, subtotal - grandTotal),
      total: grandTotal,
      tendered: isCash ? num(paymentAmount) : null,
      change: isCash ? num(change) : 0,
    },
    header: typeof receiptSettings?.header === 'string' ? receiptSettings.header.trim() : '',
    notes: notes || '',
    footer: customFooter || DEFAULT_FOOTER,
  };
}
