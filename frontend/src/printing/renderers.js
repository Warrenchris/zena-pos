import { EscPosBuilder } from './escpos';
import { layoutReceipt } from './layout';
import { normalizeProfile, getCharsPerLine } from './profile';
import { renderReceiptHtml } from './htmlReceipt';

const layoutFor = (receipt, profile, formatMoney) =>
  layoutReceipt(receipt, { charsPerLine: getCharsPerLine(profile), formatMoney });

/** Raw ESC/POS bytes for thermal printers (Bluetooth, USB, serial, network). */
export function renderEscPos(receipt, profile, formatMoney) {
  const p = normalizeProfile(profile);
  const b = new EscPosBuilder().init();

  layoutFor(receipt, p, formatMoney).forEach((line) => {
    b.bold(line.bold).double(line.double).line(line.text);
  });
  b.bold(false).double(false);

  b.feed(p.feedLines);
  if (p.openDrawer) b.openDrawer();
  b.cut(p.cut);
  return b.build();
}

/** Plain text, for previews, logs and tests. */
export function renderPlainText(receipt, profile, formatMoney) {
  return `${layoutFor(receipt, profile, formatMoney).map((l) => l.text).join('\n')}\n`;
}

/**
 * Standalone HTML document for browser/system-driver printing.
 *
 * Direct semantic HTML renderer matching the target roll-style receipt design.
 */
export function renderHtml(receipt, profile, formatMoney) {
  const p = normalizeProfile(profile);
  return renderReceiptHtml(receipt, { widthMm: p.paperWidth, formatMoney });
}
