import { toPrinterText, wrapText, wrapParagraphs, twoCol, center, rule } from './text';

const pad2 = (n) => String(n).padStart(2, '0');

export function formatReceiptDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Lay a receipt out as fixed-width lines: [{ text, bold, double }].
 *
 * Alignment is baked into `text` (padding), so ESC/POS, HTML and plain text
 * all print identically. `double` lines print at 2x width and height, so they
 * only have half as many columns to work with.
 */
export function layoutReceipt(receipt, { charsPerLine, formatMoney }) {
  const width = charsPerLine;
  const half = Math.floor(width / 2);
  const out = [];
  const add = (text, { bold = false, double = false } = {}) => out.push({ text, bold, double });
  const blank = () => add('');
  const money = (n) => toPrinterText(formatMoney(n));
  const kv = (label, value) => wrapText(`${label}: ${value}`, width).forEach((l) => add(l));

  const { business, meta, lines, totals, notes, footer, header = '' } = receipt;

  // Header
  wrapText(business.name, half).forEach((l) => add(center(l, half), { bold: true, double: true }));
  wrapText(business.address, width).forEach((l) => add(center(l, width)));
  if (business.phone) wrapText(`Tel: ${business.phone}`, width).forEach((l) => add(center(l, width)));
  if (business.kraPin) wrapText(`KRA PIN: ${business.kraPin}`, width).forEach((l) => add(center(l, width)));
  const headerLines = wrapParagraphs(header, width);
  if (headerLines.length) {
    blank();
    headerLines.forEach((l) => add(center(l, width)));
  }
  blank();
  add(center('RECEIPT', width), { bold: true });
  add(rule(width));

  // Sale details
  kv('Invoice', `#${meta.invoiceNumber}`);
  const date = formatReceiptDate(meta.dateTime);
  if (date) kv('Date', date);
  kv('Customer', meta.customerName);
  kv('Payment', meta.paymentLabel);
  if (meta.isOffline) wrapText('Offline sale - pending sync', width).forEach((l) => add(l, { bold: true }));
  add(rule(width));

  // Items: name on its own line(s), then "qty x price ..... line total".
  // Two lines per item stays readable even on 32-column paper.
  lines.forEach((line) => {
    wrapText(line.name, width).forEach((l) => add(l));
    add(twoCol(`  ${line.quantity} x ${money(line.unitPrice)}`, money(line.lineTotal), width));
  });
  add(rule(width));

  // Totals
  add(twoCol('Subtotal', money(totals.subtotal), width));
  if (totals.discount > 0) add(twoCol('Discount', `-${money(totals.discount)}`, width));

  const totalMoney = money(totals.total);
  if ('TOTAL'.length + 1 + totalMoney.length <= half) {
    add(twoCol('TOTAL', totalMoney, half), { bold: true, double: true });
  } else {
    // Amount too wide to double: fall back to bold at normal size.
    add(twoCol('TOTAL', totalMoney, width), { bold: true });
  }

  if (totals.tendered !== null) {
    add(twoCol('Amount Received', money(totals.tendered), width));
    if (totals.change > 0) add(twoCol('Change Due', money(totals.change), width), { bold: true });
  }

  if (notes) {
    add(rule(width));
    wrapText(`Notes: ${notes}`, width).forEach((l) => add(l));
  }

  blank();
  wrapParagraphs(footer, width).forEach((l) => add(center(l, width)));

  return out;
}
