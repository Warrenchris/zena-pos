import { toPrinterText, wrapText, wrapParagraphs, twoCol, center, rule } from './text';

import { formatDateTime } from '../utils/formatters';

export function formatReceiptDate(value) {
  return formatDateTime(value);
}

function formatAmountNumber(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Lay a receipt out as fixed-width lines: [{ text, bold, double, ... }].
 *
 * Alignment is baked into `text` (padding), so ESC/POS, HTML and plain text
 * all print identically. `double` lines print at 2x width and height, so they
 * only have half as many columns to work with.
 */
export function layoutReceipt(receipt, { charsPerLine, formatMoney }) {
  const width = charsPerLine;
  const half = Math.floor(width / 2);
  const out = [];
  const add = (text, opts = {}) => out.push({ text, ...opts });
  const blank = () => add('');
  const money = (n) => toPrinterText(formatMoney(n));
  const kv = (label, value) => wrapText(`${label}: ${value}`, width).forEach((l) => add(l));

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
  } = receipt;

  // 1. Header
  if (business.showPoweredBy !== false) {
    add(center('ZANA POS', width), { muted: true });
  }

  const storeName = toPrinterText(business.name || '').toUpperCase();
  if (storeName) {
    if (storeName.length <= half) {
      add(center(storeName, half), { bold: true, double: true });
    } else {
      wrapText(storeName, half).forEach((l) => add(center(l, half), { bold: true, double: true }));
    }
  }

  if (business.branch) {
    wrapText(business.branch.toUpperCase(), width).forEach((l) => add(center(l, width)));
  }

  if (business.address && (!business.branch || business.address.toUpperCase() !== business.branch.toUpperCase())) {
    wrapText(business.address, width).forEach((l) => add(center(l, width)));
  }

  const contactParts = [];
  if (business.phone) contactParts.push(`Tel: ${business.phone}`);
  if (business.kraPin) contactParts.push(`PIN: ${business.kraPin}`);
  if (contactParts.length > 0) {
    const combined = contactParts.join(' | ');
    if (combined.length <= width) {
      add(center(combined, width));
    } else {
      contactParts.forEach((part) => add(center(part, width)));
    }
  }

  const headerLines = wrapParagraphs(header, width);
  if (headerLines.length) {
    blank();
    headerLines.forEach((l) => add(center(l, width)));
  }

  add(rule(width));

  // 2. Title
  const titleText = documentType === 'CREDIT_NOTE' ? 'CREDIT NOTE' : 'SALES RECEIPT';
  add(center(titleText, width), { bold: true });
  if (meta.isDuplicate || isDuplicate) {
    add(center('*** DUPLICATE COPY ***', width), { bold: true });
  }

  // 3. Meta block
  const invLabel = !meta.invoiceNumber || meta.invoiceNumber === 'Pending' ? 'Pending' : `#${meta.invoiceNumber}`;
  kv('Invoice', invLabel);
  const date = formatReceiptDate(meta.dateTime);
  if (date) kv('Date', date);
  if (meta.cashierName) kv('Cashier', meta.cashierName);
  if (meta.customerName) kv('Customer', meta.customerName);
  if (meta.paymentLabel) kv('Payment', meta.paymentLabel);

  if (documentType === 'CREDIT_NOTE') {
    if (meta.originalInvoiceNumber) kv('Original Invoice', `#${meta.originalInvoiceNumber}`);
    if (notes) kv('Reason', notes);
  }

  // 4. Status banner (when pendingSync or isOffline)
  if (meta.pendingSync || meta.isOffline) {
    blank();
    const border = `+${'-'.repeat(width - 2)}+`;
    const bannerMsg = 'OFFLINE SALE * PENDING SYNC';
    const inner = center(bannerMsg, width - 2).padEnd(width - 2);
    add(border, { banner: true });
    add(`|${inner}|`, { banner: true, bold: true });
    add(border, { banner: true });
  }

  // 5. Items table
  if (width >= 48) {
    // 80mm roll: 4-column layout (ITEM | QTY | UNIT PRICE | TOTAL)
    const wQty = 3;
    const wPrice = 10;
    const wTotal = 8;
    const wItem = width - (wQty + 1 + wPrice + 1 + wTotal + 1);

    blank();
    const colHeader = 'ITEM'.padEnd(wItem) + ' ' + 'QTY'.padStart(wQty) + ' ' + 'UNIT PRICE'.padStart(wPrice) + ' ' + 'TOTAL'.padStart(wTotal);
    add(colHeader, { bold: true });
    add(rule(width));

    lines.forEach((line) => {
      const qtyStr = String(line.quantity).padStart(wQty);
      const priceStr = formatAmountNumber(line.unitPrice).padStart(wPrice);
      const totalStr = formatAmountNumber(line.lineTotal).padStart(wTotal);
      const rightCol = `${qtyStr} ${priceStr} ${totalStr}`;

      const nameLines = wrapText(line.name, wItem);
      const firstLine = nameLines[0] || '';
      add(twoCol(firstLine, rightCol, width), { bold: true });

      for (let i = 1; i < nameLines.length; i += 1) {
        add(nameLines[i]);
      }

      const subLine = `  ${line.quantity} x ${money(line.unitPrice)}`;
      add(subLine, { muted: true });

      if (line.note) {
        wrapText(`  ${line.note}`, width).forEach((l) => add(l, { muted: true }));
      }
      if (line.discount && line.discount > 0) {
        add(`  Discount: -${money(line.discount)}`, { muted: true });
      }
    });
  } else {
    // 58mm roll: 2-line layout per item
    add(rule(width));
    lines.forEach((line) => {
      wrapText(line.name, width).forEach((l) => add(l, { bold: true }));
      const leftCol = `  ${line.quantity} x ${formatAmountNumber(line.unitPrice)}`;
      add(twoCol(leftCol, money(line.lineTotal), width));

      if (line.note) {
        wrapText(`  ${line.note}`, width).forEach((l) => add(l, { muted: true }));
      }
      if (line.discount && line.discount > 0) {
        add(`  Discount: -${money(line.discount)}`, { muted: true });
      }
    });
  }
  add(rule(width));

  // 6. Totals
  add(twoCol('Subtotal', money(totals.subtotal), width));
  if (totals.discount > 0) {
    add(twoCol('Discount', `-${money(totals.discount)}`, width));
  }

  // Tax breakdown
  if (totals.tax && totals.tax.amount !== 0 && totals.tax.amount !== null && totals.tax.amount !== undefined) {
    const rateStr = totals.tax.rate ? `${totals.tax.rate}%` : '';
    let taxLabel = 'Tax';
    if (totals.tax.inclusive) {
      taxLabel = rateStr ? `Tax (${rateStr} incl.)` : 'Tax (incl.)';
    } else if (rateStr) {
      taxLabel = `Tax (${rateStr})`;
    }
    add(twoCol(taxLabel, money(totals.tax.amount), width));
  }

  // Large highlighted TOTAL row
  const totalMoney = money(totals.total);
  if ('TOTAL'.length + 1 + totalMoney.length <= half) {
    add(twoCol('TOTAL', totalMoney, half), { bold: true, double: true, highlighted: true });
  } else {
    add(twoCol('TOTAL', totalMoney, width), { bold: true, highlighted: true });
  }

  // Cash tender and change
  if (totals.tendered !== null && totals.tendered !== undefined) {
    add(twoCol('Amount Received', money(totals.tendered), width));
    if (totals.change !== null && totals.change !== undefined) {
      add(twoCol('Change Due', money(totals.change), width), { bold: true });
    }
  }

  if (notes && documentType !== 'CREDIT_NOTE') {
    add(rule(width));
    wrapText(`Notes: ${notes}`, width).forEach((l) => add(l));
  }

  // 7. Footer
  const footerText = footer && footer.trim() ? footer.trim() : 'Thank you for your business!';
  add(rule(width));
  wrapParagraphs(footerText, width).forEach((l) => add(center(l, width)));
  add(rule(width));

  if (business.tagline) {
    wrapText(business.tagline, width).forEach((l) => add(center(l, width)));
  }

  if (meta.receiptNumber) {
    add(center(`Receipt No: ${meta.receiptNumber}`, width));
  }

  if (business.showPoweredBy !== false) {
    add(center('Powered by Zana POS', width), { muted: true });
  }


  return out;
}
