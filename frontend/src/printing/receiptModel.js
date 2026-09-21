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

/**
 * @param {object} completedSale  { serverData, items, customer, total, paymentMethod,
 *                                  paymentAmount, change, notes, isOffline }
 * @param {object} [options]
 * @param {object} [options.business]  { name, address, phone, kraPin }
 * @param {Date}   [options.now]
 */
export function buildReceipt(completedSale, { business = {}, now = new Date() } = {}) {
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
  const isCash = String(paymentMethod).toLowerCase() === 'cash';

  return {
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
    notes: notes || '',
    footer: 'Thank you for your business!',
  };
}
