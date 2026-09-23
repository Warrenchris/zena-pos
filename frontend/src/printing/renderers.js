import { EscPosBuilder } from './escpos';
import { layoutReceipt } from './layout';
import { normalizeProfile, getCharsPerLine } from './profile';

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

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Standalone HTML document for browser/system-driver printing.
 *
 * Same layout as ESC/POS, in a monospace font sized so that 32 (58mm) or
 * 48 (80mm) columns fit the printable area: 7pt monospace is ~1.5mm per
 * column, matching a thermal printer's native 12-dot font. The logo (if any) is
 * an <img>, so it only appears in this browser/driver path, not in ESC/POS.
 */
export function renderHtml(receipt, profile, formatMoney) {
  const p = normalizeProfile(profile);
  const rows = layoutFor(receipt, p, formatMoney)
    .map((l) => {
      const cls = ['l', l.bold ? 'b' : '', l.double ? 'd' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}">${escapeHtml(l.text)}</div>`;
    })
    .join('\n');

  const logo = receipt.logoUrl
    ? `<div class="logo"><img src="${escapeHtml(receipt.logoUrl)}" alt=""></div>\n`
    : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt</title>
<style>
  @page { size: ${p.paperWidth}mm auto; margin: 0; }
  html, body { margin: 0; background: #fff; color: #000; }
  body { width: ${p.paperWidth}mm; box-sizing: border-box; padding: 2mm 2mm 6mm;
         font: 7pt/1.3 "Courier New", "Liberation Mono", monospace; }
  .l { white-space: pre; overflow: hidden; min-height: 1.3em; }
  .b { font-weight: bold; }
  .d { font-size: 14pt; line-height: 1.2; min-height: 1.2em; }
  .logo { text-align: center; margin-bottom: 2mm; }
  .logo img { max-width: 100%; max-height: 20mm; filter: grayscale(1) contrast(1.5); }
</style>
</head>
<body>
${logo}${rows}
</body>
</html>`;
}
