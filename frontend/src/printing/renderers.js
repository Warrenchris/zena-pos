import { EscPosBuilder } from './escpos';
import { layoutReceipt } from './layout';
import { normalizeProfile, getCharsPerLine } from './profile';
import { renderReceiptHtml } from './htmlReceipt';
import { getQrBitmap } from './qr';

const layoutFor = (receipt, profile, formatMoney) =>
  layoutReceipt(receipt, { charsPerLine: getCharsPerLine(profile), formatMoney });

/**
 * Emits standard Epson ESC/POS native 2D QR code commands (GS ( k).
 */
export function emitNativeQr(builder, payload, moduleSize = 4) {
  const str = String(payload || '');
  const size = Math.min(16, Math.max(1, Math.floor(moduleSize) || 4));

  // 1. Model: QR Code Model 2 (fn 165)
  builder.raw(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

  // 2. Module size (fn 167)
  builder.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);

  // 3. Error correction level M (fn 169): 49 = M
  builder.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);

  // 4. Store symbol data (fn 180)
  const dataLen = str.length + 3;
  const pL = dataLen & 0xff;
  const pH = (dataLen >> 8) & 0xff;
  const dataBytes = [];
  for (let i = 0; i < str.length; i++) {
    dataBytes.push(str.charCodeAt(i) & 0xff);
  }
  builder.raw(0x1d, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30, ...dataBytes);

  // 5. Print stored symbol (fn 181)
  builder.raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);
}

/**
 * Raw ESC/POS bytes for thermal printers (Bluetooth, USB, serial, network).
 *
 * Supports:
 * - Centered raster bitmap logo (if logoBitmap provided in options)
 * - Canonical text layout lines
 * - QR code at the end (raster mode default, or native mode) aligned right or center
 */
export function renderEscPos(receipt, profile, formatMoney, options = {}) {
  const p = normalizeProfile(profile);
  const b = new EscPosBuilder().init();

  // 1. Optional logo bitmap at the top
  if (options.logoBitmap) {
    b.align('center');
    b.raster(options.logoBitmap);
    b.feed(1);
    b.align('left');
  }

  // 2. Receipt layout lines
  layoutFor(receipt, p, formatMoney).forEach((line) => {
    b.bold(line.bold).double(line.double).line(line.text);
  });
  b.bold(false).double(false);

  // 3. Receipt QR Code (if enabled and payload present)
  if (receipt.business?.qrEnabled && receipt.business?.qrPayload) {
    const qrAlign = p.qrAlign || 'right';
    b.align(qrAlign);

    if (p.qrMode === 'native') {
      emitNativeQr(b, receipt.business.qrPayload, p.paperWidth === 58 ? 3 : 4);
    } else {
      const dotSize = p.paperWidth === 58 ? 3 : 4;
      const qrBitmap = getQrBitmap(receipt.business.qrPayload, { dotSize });
      b.raster(qrBitmap);
    }
    b.feed(1);
    b.align('left');
  }

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
