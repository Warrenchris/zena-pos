import { formatDateTime } from '../utils/dateTime.js';
import { renderQrSvg } from './qr.js';

/**
 * Escapes HTML characters in user-provided strings to prevent XSS.
 *
 * @param {any} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a number with 2 decimal places and thousands separators.
 * Example: 1020 -> "1,020.00"
 */
function formatNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Default money formatter if none provided: "KSh 5,600.00"
 */
function defaultFormatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}KSh ${formatNumber(abs)}`;
}

/**
 * Renders a full, self-contained HTML document for browser/driver printing
 * directly from canonical ReceiptData.
 *
 * Light-theme only, inline CSS, zero external fonts or network requests.
 *
 * @param {import('./receiptModel').ReceiptData} receipt
 * @param {object} [options]
 * @param {number} [options.widthMm=80] - Target paper width in mm (80 or 58)
 * @param {Function} [options.formatMoney] - Money formatter function
 * @returns {string} Fully self-contained HTML string
 */
export function renderReceiptHtml(receipt, { widthMm = 80, formatMoney = defaultFormatMoney } = {}) {
  const width = Number(widthMm) === 58 ? 58 : 80;
  const is58mm = width === 58;

  const {
    documentType = 'SALES_RECEIPT',
    isDuplicate = false,
    business = {},
    meta = {},
    lines = [],
    totals = {},
    notes = '',
    footer = '',
    header = '',
    logoUrl: modelLogoUrl = null,
  } = receipt || {};

  // Resolve logo URL
  const logoUrl = modelLogoUrl || business.logoUrl || null;
  const showLogo = Boolean(logoUrl);

  // Business & Header elements
  const showPoweredBy = business.showPoweredBy !== false;
  const storeName = business.name ? String(business.name).toUpperCase() : '';
  const branch = business.branch ? String(business.branch) : '';
  const address = business.address && (!branch || business.address.toUpperCase() !== branch.toUpperCase())
    ? String(business.address)
    : '';

  const contactParts = [];
  if (business.phone) contactParts.push(`Tel: ${business.phone}`);
  if (business.kraPin) contactParts.push(`PIN: ${business.kraPin}`);
  const contactLine = contactParts.join(' | ');

  // Document Title
  const titleText = documentType === 'CREDIT_NOTE' ? 'CREDIT NOTE' : 'SALES RECEIPT';
  const duplicateBadge = (meta.isDuplicate || isDuplicate)
    ? '<div class="duplicate-badge-wrap"><span class="duplicate-badge">DUPLICATE COPY</span></div>'
    : '';

  // Meta block
  const invLabel = !meta.invoiceNumber || meta.invoiceNumber === 'Pending'
    ? 'Pending'
    : `#${meta.invoiceNumber}`;
  const dateStr = formatDateTime(meta.dateTime);
  const cashierName = meta.cashierName || null;
  const customerName = meta.customerName && meta.customerName !== 'Walk-in Customer'
    ? meta.customerName
    : null;
  const paymentLabel = meta.paymentLabel || 'Cash';
  const originalInvoice = meta.originalInvoiceNumber || null;
  const reasonNotes = documentType === 'CREDIT_NOTE' && notes ? notes : null;

  // Status banner
  const isPendingSync = Boolean(meta.pendingSync || meta.isOffline);

  // Items rows
  let itemsContent = '';
  if (is58mm) {
    // 58mm: 2-line layout per item
    const rows58 = lines.map((line) => {
      const sub = `${line.quantity} &times; ${formatMoney(line.unitPrice)}`;
      const lineNotes = [];
      if (line.note) lineNotes.push(`<div class="item-sub-note">${escapeHtml(line.note)}</div>`);
      if (line.discount && line.discount > 0) {
        lineNotes.push(`<div class="item-sub-note">Discount: -${formatMoney(line.discount)}</div>`);
      }

      return `
        <div class="item-block-58">
          <div class="item-name-58">${escapeHtml(line.name)}</div>
          <div class="item-row-58">
            <span class="item-sub-58">${sub}</span>
            <span class="item-total-58">${formatMoney(line.lineTotal)}</span>
          </div>
          ${lineNotes.join('')}
        </div>
      `;
    }).join('');

    itemsContent = `<div class="items-list-58">${rows58}</div>`;
  } else {
    // 80mm: 4-column table
    const tableRows = lines.map((line) => {
      const sub = `${line.quantity} &times; ${formatMoney(line.unitPrice)}`;
      const lineNotes = [];
      if (line.note) lineNotes.push(`<div class="item-sub-note">${escapeHtml(line.note)}</div>`);
      if (line.discount && line.discount > 0) {
        lineNotes.push(`<div class="item-sub-note">Discount: -${formatMoney(line.discount)}</div>`);
      }

      return `
        <tr>
          <td class="col-item">
            <div class="item-name">${escapeHtml(line.name)}</div>
            <div class="item-sub">${sub}</div>
            ${lineNotes.join('')}
          </td>
          <td class="col-qty">${escapeHtml(line.quantity)}</td>
          <td class="col-price">${formatNumber(line.unitPrice)}</td>
          <td class="col-total">${formatNumber(line.lineTotal)}</td>
        </tr>
      `;
    }).join('');

    itemsContent = `
      <table class="items-table">
        <thead>
          <tr>
            <th class="col-item">ITEM</th>
            <th class="col-qty">QTY</th>
            <th class="col-price">UNIT PRICE</th>
            <th class="col-total">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
  }

  // Totals calculations & labels
  const subtotalFormatted = formatMoney(totals.subtotal ?? 0);
  const discountFormatted = totals.discount > 0 ? `-${formatMoney(totals.discount)}` : null;

  // Tax breakdown
  let taxRow = '';
  if (totals.tax && totals.tax.amount !== 0 && totals.tax.amount !== null && totals.tax.amount !== undefined) {
    const rateStr = totals.tax.rate ? `${totals.tax.rate}%` : '';
    let taxLabel = 'Tax';
    if (totals.tax.inclusive) {
      taxLabel = rateStr ? `Tax (${rateStr} incl.)` : 'Tax (incl.)';
    } else if (rateStr) {
      taxLabel = `Tax (${rateStr})`;
    }
    taxRow = `
      <div class="total-row">
        <span class="total-label">${escapeHtml(taxLabel)}</span>
        <span class="total-val">${formatMoney(totals.tax.amount)}</span>
      </div>
    `;
  }

  const grandTotalFormatted = formatMoney(totals.total ?? 0);

  // Cash tendered & change
  let tenderRows = '';
  if (totals.tendered !== null && totals.tendered !== undefined) {
    tenderRows += `
      <div class="total-row">
        <span class="total-label">Amount Received</span>
        <span class="total-val">${formatMoney(totals.tendered)}</span>
      </div>
    `;
    if (totals.change !== null && totals.change !== undefined) {
      tenderRows += `
        <div class="total-row change-row">
          <span class="total-label">Change Due</span>
          <span class="total-val">${formatMoney(totals.change)}</span>
        </div>
      `;
    }
  }

  // Custom header lines
  const headerLines = header
    ? String(header).split('\n').filter((l) => l.trim().length > 0)
    : [];

  // Footer text
  const footerLines = footer && footer.trim()
    ? String(footer).trim().split('\n').filter((l) => l.trim().length > 0)
    : ['Thank you for your business!'];

  // Receipt Number fallback: receiptNumber, or fallback to invoiceNumber for legacy sales
  const receiptNumber = meta.receiptNumber || meta.invoiceNumber || null;
  const tagline = business.tagline || '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page {
    size: ${width}mm auto;
    margin: 0;
  }
  @media print {
    html, body {
      width: ${width}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .receipt-container {
      width: ${width}mm !important;
      box-shadow: none !important;
      border: none !important;
      padding: 3mm 3mm 5mm !important;
    }
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
  }
  .receipt-container {
    width: ${width}mm;
    margin: 0 auto;
    padding: 3.5mm;
    background: #fff;
    color: #111111;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    color-scheme: light;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt-container * {
    box-sizing: border-box;
  }
  .receipt-container .header-brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .receipt-container .header-logo {
    max-height: 22px;
    max-width: 50px;
    object-fit: contain;
    filter: grayscale(1) contrast(1.3);
  }
  .receipt-container .header-wordmark {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.8px;
    color: #111111;
  }
  .receipt-container .store-name {
    font-size: 13.5px;
    font-weight: 800;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.25;
    margin: 2px 0;
  }
  .receipt-container .store-branch {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    color: #444444;
    text-align: center;
    margin-bottom: 1.5px;
  }
  .receipt-container .store-address {
    font-size: 9.5px;
    color: #444444;
    text-align: center;
    margin-bottom: 1.5px;
  }
  .receipt-container .store-contact {
    font-size: 9px;
    color: #666666;
    text-align: center;
    margin-bottom: 4px;
  }
  .receipt-container .custom-header {
    font-size: 9px;
    color: #333333;
    text-align: center;
    margin: 2px 0;
  }
  .receipt-container .divider-rule {
    border: 0;
    border-top: 1px solid #cccccc;
    margin: 5px 0;
  }
  .receipt-container .doc-title {
    font-size: 13px;
    font-weight: 800;
    text-align: center;
    letter-spacing: 0.5px;
    margin: 4px 0 2px;
  }
  .receipt-container .duplicate-badge-wrap {
    text-align: center;
    margin: 1px 0 3px;
  }
  .receipt-container .duplicate-badge {
    display: inline-block;
    border: 1px solid #111111;
    border-radius: 3px;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.5px;
    padding: 1px 5px;
    text-align: center;
    color: #111111;
  }
  .receipt-container .meta-block {
    font-family: ui-monospace, "Courier New", Courier, monospace;
    font-size: 9px;
    line-height: 1.4;
    margin: 5px 0;
  }
  .receipt-container .meta-row {
    display: flex;
    justify-content: flex-start;
  }
  .receipt-container .meta-label {
    width: 65px;
    color: #111111;
    font-weight: 600;
    flex-shrink: 0;
  }
  .receipt-container .meta-val {
    color: #111111;
    word-break: break-all;
  }
  .receipt-container .offline-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background-color: #fef3c7;
    color: #92400e;
    border-radius: 4px;
    padding: 3.5px 6px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin: 5px 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt-container .offline-icon {
    width: 13px;
    height: 13px;
    stroke: #92400e;
    flex-shrink: 0;
  }
  .receipt-container .items-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    margin: 5px 0;
    font-size: 9.5px;
  }
  .receipt-container .items-table th {
    font-size: 8px;
    font-weight: 600;
    color: #555555;
    text-transform: uppercase;
    border-bottom: 1px solid #cccccc;
    padding: 3px 0;
  }
  .receipt-container .col-item { width: 48%; text-align: left; }
  .receipt-container .col-qty { width: 12%; text-align: center; }
  .receipt-container .col-price { width: 20%; text-align: right; }
  .receipt-container .col-total { width: 20%; text-align: right; }
  .receipt-container .items-table td {
    padding: 3px 0;
    vertical-align: top;
    word-break: break-word;
  }
  .receipt-container .item-name {
    font-weight: 700;
    color: #111111;
    line-height: 1.25;
  }
  .receipt-container .item-sub {
    font-size: 8.5px;
    color: #666666;
    margin-top: 1px;
  }
  .receipt-container .item-sub-note {
    font-size: 8px;
    color: #666666;
    font-style: italic;
  }
  .receipt-container .items-list-58 {
    margin: 5px 0;
    border-top: 1px solid #cccccc;
    border-bottom: 1px solid #cccccc;
    padding: 3px 0;
  }
  .receipt-container .item-block-58 {
    margin-bottom: 4px;
  }
  .receipt-container .item-name-58 {
    font-weight: 700;
    font-size: 9.5px;
    color: #111111;
    word-break: break-word;
  }
  .receipt-container .item-row-58 {
    display: flex;
    justify-content: space-between;
    font-size: 8.5px;
    margin-top: 1px;
  }
  .receipt-container .item-sub-58 {
    color: #666666;
  }
  .receipt-container .item-total-58 {
    font-weight: 600;
    color: #111111;
  }
  .receipt-container .totals-section {
    margin: 5px 0;
    font-size: 9.5px;
  }
  .receipt-container .total-row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    color: #111111;
  }
  .receipt-container .total-label {
    color: #333333;
  }
  .receipt-container .total-val {
    font-variant-numeric: tabular-nums;
  }
  .receipt-container .grand-total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #e5e5e5;
    font-size: 13px;
    font-weight: 800;
    padding: 3.5px 5px;
    margin: 4px 0;
    border-radius: 3px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .receipt-container .grand-total-val {
    font-variant-numeric: tabular-nums;
  }
  .receipt-container .change-row {
    font-weight: 700;
    color: #111111;
  }
  .receipt-container .general-notes {
    font-size: 8.5px;
    color: #444444;
    margin: 4px 0;
    padding-top: 3px;
    border-top: 1px dashed #cccccc;
  }
  .receipt-container .notes-label {
    font-weight: 600;
  }
  .receipt-container .footer-section {
    margin-top: 6px;
    text-align: center;
  }
  .receipt-container .thank-you-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 2px 0;
  }
  .receipt-container .thank-you-rule {
    flex: 1;
    border-bottom: 0.75px solid #111111;
    height: 0;
  }
  .receipt-container .thank-you,
  .receipt-container .thank-you-text {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1.5px 0;
    color: #111111;
    text-align: center;
  }
  .receipt-container .tagline {
    font-size: 8px;
    color: #666666;
    margin-top: 2px;
  }
  .receipt-container .footer-bottom-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 3px;
    text-align: left;
  }
  .receipt-container .footer-left {
    font-size: 8px;
    color: #444444;
  }
  .receipt-container .receipt-no {
    font-family: ui-monospace, "Courier New", Courier, monospace;
    font-size: 8.5px;
    white-space: nowrap;
  }
  .receipt-container .receipt-no-full {
    text-align: left;
    width: 100%;
    margin-top: 3px;
    white-space: nowrap;
  }
  .receipt-container .powered-by {
    font-size: 7.5px;
    color: #777777;
    margin-top: 1px;
  }
  .receipt-container .footer-right {
    min-width: 44px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
  }
  .receipt-container .qr-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .receipt-container .qr-caption {
    font-size: 7px;
    color: #666666;
    margin-top: 2px;
    letter-spacing: 0.2px;
    text-align: center;
  }
</style>
</head>
<body>
<div class="receipt-container">
  <!-- Header -->
  <div class="header-brand">
    ${showLogo ? `<img src="${escapeHtml(logoUrl)}" class="header-logo" alt="Business logo" />` : ''}
    ${showPoweredBy ? '<span class="header-wordmark">ZANA POS</span>' : ''}
  </div>

  ${storeName ? `<div class="store-name">${escapeHtml(storeName)}</div>` : ''}
  ${branch ? `<div class="store-branch">${escapeHtml(branch)}</div>` : ''}
  ${address ? `<div class="store-address">${escapeHtml(address)}</div>` : ''}
  ${contactLine ? `<div class="store-contact">${escapeHtml(contactLine)}</div>` : ''}
  ${headerLines.map((l) => `<div class="custom-header">${escapeHtml(l)}</div>`).join('\n')}

  <hr class="divider-rule" />

  <!-- Title & Duplicate -->
  <div class="doc-title">${escapeHtml(titleText)}</div>
  ${duplicateBadge}

  <!-- Meta Block -->
  <div class="meta-block">
    <div class="meta-row"><span class="meta-label">Invoice:</span><span class="meta-val">${escapeHtml(invLabel)}</span></div>
    ${dateStr ? `<div class="meta-row"><span class="meta-label">Date:</span><span class="meta-val">${escapeHtml(dateStr)}</span></div>` : ''}
    ${cashierName ? `<div class="meta-row"><span class="meta-label">Cashier:</span><span class="meta-val">${escapeHtml(cashierName)}</span></div>` : ''}
    ${customerName ? `<div class="meta-row"><span class="meta-label">Customer:</span><span class="meta-val">${escapeHtml(customerName)}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Payment:</span><span class="meta-val">${escapeHtml(paymentLabel)}</span></div>
    ${originalInvoice ? `<div class="meta-row"><span class="meta-label">Original Invoice:</span><span class="meta-val">#${escapeHtml(originalInvoice)}</span></div>` : ''}
    ${reasonNotes ? `<div class="meta-row"><span class="meta-label">Reason:</span><span class="meta-val">${escapeHtml(reasonNotes)}</span></div>` : ''}
  </div>

  <!-- Status banner -->
  ${isPendingSync ? `
    <div class="offline-banner">
      <svg class="offline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="1" y1="1" x2="23" y2="23"></line>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
        <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
        <line x1="12" y1="20" x2="12.01" y2="20"></line>
      </svg>
      <span>OFFLINE SALE &middot; PENDING SYNC</span>
    </div>
  ` : ''}

  <!-- Items -->
  ${itemsContent}

  <!-- Divider rule -->
  <hr class="divider-rule" />

  <!-- Totals -->
  <div class="totals-section">
    <div class="total-row">
      <span class="total-label">Subtotal</span>
      <span class="total-val">${subtotalFormatted}</span>
    </div>
    ${discountFormatted ? `
      <div class="total-row">
        <span class="total-label">Discount</span>
        <span class="total-val">${discountFormatted}</span>
      </div>
    ` : ''}
    ${taxRow}
    <div class="grand-total-row">
      <span class="grand-total-label">TOTAL</span>
      <span class="grand-total-val">${grandTotalFormatted}</span>
    </div>
    ${tenderRows}
  </div>

  ${notes && documentType !== 'CREDIT_NOTE' ? `
    <div class="general-notes">
      <span class="notes-label">Notes:</span> ${escapeHtml(notes)}
    </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer-section">
    ${footerLines.map((l) => `
    <div class="thank-you-row">
      <span class="thank-you-rule"></span>
      <span class="thank-you thank-you-text">${escapeHtml(l)}</span>
      <span class="thank-you-rule"></span>
    </div>`).join('\n')}
    ${tagline ? `<div class="tagline">${escapeHtml(tagline)}</div>` : ''}
    ${is58mm && receiptNumber ? `<div class="receipt-no receipt-no-full" style="white-space: nowrap;">Receipt No: ${escapeHtml(receiptNumber)}</div>` : ''}
    <div class="footer-bottom-row">
      <div class="footer-left">
        ${(!is58mm && receiptNumber) ? `<div class="receipt-no" style="white-space: nowrap;">Receipt No: ${escapeHtml(receiptNumber)}</div>` : ''}
        ${showPoweredBy ? '<div class="powered-by">Powered by Zana POS</div>' : ''}
      </div>
      <div class="footer-right">
        ${(business.qrEnabled && business.qrPayload) ? `
          <div class="qr-wrap">
            ${renderQrSvg(business.qrPayload, { sizeMm: is58mm ? 18 : 22 })}
            <div class="qr-caption">Scan to view receipt</div>
          </div>
        ` : ''}
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}
