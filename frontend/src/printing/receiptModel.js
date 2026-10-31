/**
 * Receipt data model: a plain, printer-agnostic description of one sale or credit note.
 *
 * Everything downstream (ESC/POS, HTML, plain text, and later PDF or
 * WhatsApp receipts) renders from this one structure, so a receipt can never
 * differ between output channels.
 */

/**
 * @typedef {object} ReceiptData
 * @property {'SALES_RECEIPT' | 'CREDIT_NOTE'} documentType
 * @property {boolean} isDuplicate
 * @property {string|null} logoUrl
 * @property {string} header
 * @property {string} footer
 * @property {string} notes
 * @property {object} business
 * @property {string} business.name
 * @property {string} business.address
 * @property {string} business.phone
 * @property {string} business.kraPin
 * @property {string} business.branch
 * @property {string} business.tagline
 * @property {boolean} business.showPoweredBy
 * @property {boolean} business.qrEnabled
 * @property {string|null} business.qrPayload
 * @property {object} meta
 * @property {string} meta.receiptNumber
 * @property {string|null} meta.invoiceNumber
 * @property {boolean} meta.pendingSync
 * @property {string|null} meta.cashierName
 * @property {string|null} [meta.originalInvoiceNumber]
 * @property {Date|string} meta.dateTime
 * @property {string} meta.customerName
 * @property {string} meta.paymentLabel
 * @property {boolean} meta.isOffline
 * @property {boolean} meta.isDuplicate
 * @property {Array<{name: string, quantity: number, unitPrice: number, lineTotal: number}>} lines
 * @property {object} totals
 * @property {number} totals.subtotal
 * @property {number} totals.discount
 * @property {number} totals.total
 * @property {number|null} totals.tendered
 * @property {number} totals.change
 * @property {object} totals.tax
 * @property {number} totals.tax.amount
 * @property {number} totals.tax.rate
 * @property {boolean} totals.tax.inclusive
 */

const PAYMENT_LABELS = {
  cash: 'Cash',
  card: 'Card',
  mpesa: 'M-Pesa',
  mobile: 'Mobile Money',
  mobile_money: 'Mobile Money',
  store_credit: 'Store Credit',
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
 * Builds a standardized ReceiptData model from a completed sale object.
 *
 * @param {object} completedSale
 * @param {object} [options]
 * @param {object} [options.business] { name, address, phone, kraPin, branch, tagline, showPoweredBy, qrEnabled }
 * @param {object} [options.receiptSettings] { header, footer, showLogo, logoUrl, branch, tagline, showPoweredBy, qrEnabled }
 * @param {Date}   [options.now]
 * @param {boolean} [options.isDuplicate=false]
 * @returns {ReceiptData}
 */
export function buildReceipt(completedSale, { business = {}, receiptSettings = {}, now = new Date(), isDuplicate = false, publicAppUrl } = {}) {
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

  // Resolve invoiceNumber: server invoice number if assigned, otherwise null / Pending
  let rawInvoice = serverData?.invoiceNumber || completedSale?.invoiceNumber || null;
  let invoiceNumber = null;
  if (rawInvoice && rawInvoice !== 'Pending' && rawInvoice !== 'N/A') {
    invoiceNumber = String(rawInvoice);
  } else if (!isOffline && !completedSale?.pendingSync && serverData?.id && !String(serverData.id).startsWith('offline-')) {
    invoiceNumber = String(serverData.id);
  } else if (!isOffline && !completedSale?.pendingSync && completedSale && !serverData && !completedSale.receiptNumber) {
    // Legacy fallback test cases where serverData is null and no offline flag
    invoiceNumber = 'N/A';
  }

  // Resolve receiptNumber: device receipt number or fallback to invoiceNumber / id for legacy sales
  const rawReceipt = serverData?.receiptNumber || completedSale?.receiptNumber;
  const receiptNumber = rawReceipt
    ? String(rawReceipt)
    : (invoiceNumber && invoiceNumber !== 'Pending'
      ? invoiceNumber
      : (serverData?.id ? String(serverData.id) : (completedSale ? 'N/A' : 'N/A')));

  // Resolve pendingSync status
  const pendingSync = Boolean(
    isOffline ||
    completedSale?.isOffline ||
    completedSale?.pendingSync ||
    (!invoiceNumber || invoiceNumber === 'Pending')
  );

  // Cashier name from snapshot or user relation
  const cashierName = completedSale?.cashierName ||
    serverData?.cashierName ||
    serverData?.User?.name ||
    serverData?.Employee?.firstName ||
    null;

  // Tax snapshot prioritization: prioritize sale-time snapshots over recomputation
  const taxObj = completedSale?.tax && typeof completedSale.tax === 'object' ? completedSale.tax : null;
  const snapTaxAmount = completedSale?.taxAmount ?? serverData?.taxAmount ?? taxObj?.amount ?? completedSale?.tax ?? serverData?.tax ?? 0;
  const snapTaxRate = completedSale?.taxRate ?? serverData?.taxRate ?? taxObj?.rate ?? 0;
  const snapTaxInclusive = completedSale?.taxInclusive ?? serverData?.taxInclusive ?? taxObj?.inclusive ?? false;

  const showPoweredBy = business?.showPoweredBy !== undefined
    ? Boolean(business.showPoweredBy)
    : (receiptSettings?.showPoweredBy !== false);

  const resolvedPublicAppUrl = publicAppUrl ||
    receiptSettings?.publicAppUrl ||
    business?.publicAppUrl ||
    (typeof process !== 'undefined' && process.env?.VITE_PUBLIC_APP_URL ? process.env.VITE_PUBLIC_APP_URL : '') ||
    (typeof window !== 'undefined' && window.__PUBLIC_APP_URL__ ? window.__PUBLIC_APP_URL__ : '') ||
    '';

  const receiptToken = completedSale?.receiptToken ||
    serverData?.receiptToken ||
    completedSale?.meta?.receiptToken ||
    null;

  const qrEnabled = business?.qrEnabled !== undefined
    ? Boolean(business.qrEnabled)
    : Boolean(receiptSettings?.qrEnabled);

  const saleShop = completedSale?.business || completedSale?.shop || completedSale?.serverData?.shop || {};
  const activeBusiness = (business && Object.keys(business).length > 0) ? business : saleShop;

  return {
    documentType: 'SALES_RECEIPT',
    isDuplicate: Boolean(isDuplicate || completedSale?.isDuplicate),
    logoUrl: receiptSettings?.showLogo !== false && receiptSettings?.logoUrl
      ? receiptSettings.logoUrl
      : (activeBusiness?.logoUrl || null),
    business: {
      name: activeBusiness?.name || activeBusiness?.systemName || '',
      address: activeBusiness?.address || '',
      phone: activeBusiness?.phone || activeBusiness?.contactPhone || '',
      kraPin: activeBusiness?.kraPin || '',
      branch: activeBusiness?.branch || receiptSettings?.branch || '',
      tagline: activeBusiness?.tagline || receiptSettings?.tagline || '',
      brandIcon: activeBusiness?.brandIcon || receiptSettings?.brandIcon || null,
      showPoweredBy,
      qrEnabled,
      qrPayload: (qrEnabled && (typeof resolvedPublicAppUrl === 'string' ? resolvedPublicAppUrl.trim().replace(/\/+$/, '') : '') && receiptToken)
        ? (resolvedPublicAppUrl.trim().replace(/\/+$/, '') + '/r/' + receiptToken)
        : null,
    },
    meta: {
      receiptNumber,
      receiptToken,

      invoiceNumber,
      pendingSync,
      cashierName,
      dateTime: serverData?.createdAt || completedSale?.createdAt || now,
      customerName: customer?.name || 'Walk-in Customer',
      paymentLabel: paymentLabel(paymentMethod),
      isOffline: Boolean(isOffline),
      isDuplicate: Boolean(isDuplicate || completedSale?.isDuplicate),
    },
    lines,
    totals: {
      subtotal,
      discount: Math.max(0, subtotal - grandTotal),
      total: grandTotal,
      tendered: isCash ? num(paymentAmount) : null,
      change: isCash ? num(change) : 0,
      tax: {
        amount: num(snapTaxAmount),
        rate: num(snapTaxRate),
        inclusive: Boolean(snapTaxInclusive),
      },
    },
    header: typeof receiptSettings?.header === 'string' ? receiptSettings.header.trim() : '',
    notes: notes || '',
    footer: customFooter || DEFAULT_FOOTER,
  };
}

/**
 * Builds a standardized ReceiptData model for a SalesReturn / Credit Note record.
 * Negative line items and negative totals are produced.
 *
 * @param {object} returnRecord
 * @param {object} [options]
 * @returns {ReceiptData}
 */
export function buildCreditNote(returnRecord, { business = {}, receiptSettings = {}, isDuplicate = false, now = new Date() } = {}) {
  const customFooter = typeof receiptSettings?.footer === 'string' ? receiptSettings.footer.trim() : '';
  const returnItems = Array.isArray(returnRecord?.items) ? returnRecord.items : [];

  const lines = returnItems.map((item) => {
    const qty = num(item.quantity) || 1;
    const rawPrice = num(item.price ?? item.unitPrice ?? (item.amount ? num(item.amount) / qty : 0));
    const rawTotal = num(item.amount ?? (rawPrice * qty));
    const lineObj = {
      name: item.productName || item.Product?.name || item.name || 'Returned Item',
      quantity: -Math.abs(qty),
      unitPrice: -Math.abs(rawPrice),
      lineTotal: -Math.abs(rawTotal),
    };
    if (item.disposition) {
      lineObj.note = `Disposition: ${item.disposition}`;
    }
    return lineObj;
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const totalRefund = returnRecord?.totalRefundAmount !== undefined && returnRecord.totalRefundAmount !== null
    ? -Math.abs(num(returnRecord.totalRefundAmount))
    : (returnRecord?.amount !== undefined && returnRecord.amount !== null
      ? -Math.abs(num(returnRecord.amount))
      : subtotal);

  const origInv = returnRecord?.originalInvoiceNumber || returnRecord?.sale?.invoiceNumber || null;
  const creditNoteNum = returnRecord?.creditNoteNumber || `CN-${origInv || returnRecord?.saleId || 'N/A'}`;
  const reason = returnRecord?.reason || returnRecord?.reasonNotes || returnRecord?.items?.[0]?.reasonNotes || returnRecord?.items?.[0]?.reasonCode || 'Return / Refund';

  const showPoweredBy = business?.showPoweredBy !== undefined
    ? Boolean(business.showPoweredBy)
    : (receiptSettings?.showPoweredBy !== false);

  const rawMethod = returnRecord?.refundMethod || returnRecord?.paymentMethod || 'cash';
  const methodText = paymentLabel(rawMethod);
  const refundMethodLabel = methodText.toLowerCase().includes('refund') ? methodText : `${methodText} Refund`;

  const duplicateFlag = Boolean(isDuplicate || returnRecord?.isDuplicate);

  let taxRefundAmount = 0;
  if (returnRecord?.totalTaxRefunded !== undefined && returnRecord.totalTaxRefunded !== null) {
    taxRefundAmount = -Math.abs(num(returnRecord.totalTaxRefunded));
  } else if (returnRecord?.taxRefund !== undefined && returnRecord.taxRefund !== null) {
    taxRefundAmount = -Math.abs(num(returnRecord.taxRefund));
  } else {
    const itemTaxSum = returnItems.reduce((acc, it) => acc + (num(it.taxAmount) || 0), 0);
    if (itemTaxSum > 0) {
      taxRefundAmount = -Math.abs(itemTaxSum);
    }
  }

  const taxRate = num(returnRecord?.taxRate || returnRecord?.tax?.rate || 0);
  const taxInclusive = Boolean(returnRecord?.taxInclusive ?? returnRecord?.tax?.inclusive ?? false);

  return {
    documentType: 'CREDIT_NOTE',
    isDuplicate: duplicateFlag,
    logoUrl: receiptSettings?.showLogo !== false && receiptSettings?.logoUrl ? receiptSettings.logoUrl : null,
    business: {
      name: business?.name || returnRecord?.shop?.systemName || '',
      address: business?.address || '',
      phone: business?.phone || returnRecord?.shop?.contactPhone || '',
      kraPin: business?.kraPin || '',
      branch: business?.branch || receiptSettings?.branch || '',
      tagline: business?.tagline || receiptSettings?.tagline || '',
      brandIcon: business?.brandIcon || receiptSettings?.brandIcon || null,
      showPoweredBy,
      qrEnabled: false,
      qrPayload: null, // Credit notes get no QR in this phase
    },
    meta: {
      receiptNumber: creditNoteNum,
      invoiceNumber: creditNoteNum,
      originalInvoiceNumber: origInv,
      dateTime: returnRecord?.issuedAt || returnRecord?.refundedAt || returnRecord?.createdAt || now,
      customerName: returnRecord?.customer?.name || returnRecord?.customerName || 'Walk-in Customer',
      paymentLabel: refundMethodLabel,
      cashierName: returnRecord?.cashierName || returnRecord?.refundedBy || returnRecord?.refunderName || null,
      pendingSync: false,
      isOffline: false,
      isDuplicate: duplicateFlag,
    },
    lines,
    totals: {
      subtotal,
      discount: 0,
      total: totalRefund,
      tendered: null,
      change: null,
      tax: {
        amount: taxRefundAmount,
        rate: taxRate,
        inclusive: taxInclusive,
      },
    },
    header: typeof receiptSettings?.header === 'string' ? receiptSettings.header.trim() : (returnRecord?.shop?.receiptHeader || ''),
    notes: reason,
    footer: customFooter || returnRecord?.shop?.receiptFooter || DEFAULT_FOOTER,
  };
}
