/**
 * QR Code Generation for Inline SVG and ESC/POS Raster (Phase 5)
 *
 * Encodes public receipt URLs into QR codes using pinned 'qrcode' library.
 * Error correction level: 'M' (~15% recovery).
 * Quiet zone: 4 modules standard.
 *
 * Provides:
 * - computeQrMatrix: Shared matrix calculation so SVG & raster are identical
 * - renderQrSvg: Lightweight, self-contained SVG for HTML receipts (shape-rendering="crispEdges")
 * - getQrBitmap: 1-bit bitmap matrix for ESC/POS thermal raster printing
 */

import QRCode from 'qrcode';

const ERROR_CORRECTION_LEVEL = 'M';
const DEFAULT_QUIET_ZONE = 4;

/**
 * Computes the 2D boolean/1-0 module matrix for a payload.
 *
 * @param {string} payload
 * @param {object} [options]
 * @param {number} [options.quietZone=4]
 * @returns {{ size: number, symbolSize: number, quietZone: number, matrix: number[][] }}
 */
export function computeQrMatrix(payload, { quietZone = DEFAULT_QUIET_ZONE } = {}) {
  if (!payload || typeof payload !== 'string') {
    throw new Error('QR payload must be a non-empty string');
  }

  const qr = QRCode.create(payload, { errorCorrectionLevel: ERROR_CORRECTION_LEVEL });
  const symbolSize = qr.modules.size;
  const qz = Math.max(0, Number(quietZone) || 0);
  const totalSize = symbolSize + (qz * 2);

  const matrix = Array.from({ length: totalSize }, () => new Uint8Array(totalSize));

  for (let r = 0; r < symbolSize; r++) {
    for (let c = 0; c < symbolSize; c++) {
      if (qr.modules.get(r, c)) {
        matrix[r + qz][c + qz] = 1;
      }
    }
  }

  return {
    size: totalSize,
    symbolSize,
    quietZone: qz,
    matrix,
  };
}

/**
 * Generates a clean, crisp inline SVG QR code.
 * Uses a single unified path for dark modules and crispEdges shape-rendering.
 *
 * @param {string} payload
 * @param {object} [options]
 * @param {number} [options.sizeMm=22] - Width/height in mm (e.g. 22 for 80mm, 18 for 58mm)
 * @param {number} [options.quietZone=4]
 * @returns {string} Inline SVG markup
 */
export function renderQrSvg(payload, { sizeMm = 22, quietZone = DEFAULT_QUIET_ZONE } = {}) {
  const { size, matrix } = computeQrMatrix(payload, { quietZone });

  let pathData = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x]) {
        pathData += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${sizeMm}mm" height="${sizeMm}mm" shape-rendering="crispEdges" aria-label="Receipt QR Code"><rect width="100%" height="100%" fill="#ffffff"/><path fill="#000000" d="${pathData.trim()}"/></svg>`;
}

/**
 * Generates a 1-bit bitmap matrix suitable for ESC/POS raster printing.
 *
 * @param {string} payload
 * @param {object} [options]
 * @param {number} [options.dotSize=4]  - Number of printer dots per module (e.g. 4 for 80mm, 3 for 58mm)
 * @param {number} [options.quietZone=4]
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
export function getQrBitmap(payload, { dotSize = 4, quietZone = DEFAULT_QUIET_ZONE } = {}) {
  const { size, matrix } = computeQrMatrix(payload, { quietZone });
  const scale = Math.max(1, Math.floor(dotSize) || 1);
  const width = size * scale;
  const height = size * scale;
  const data = new Uint8Array(width * height);

  for (let my = 0; my < size; my++) {
    for (let mx = 0; mx < size; mx++) {
      const isBlack = matrix[my][mx];
      if (isBlack) {
        const startY = my * scale;
        const startX = mx * scale;
        for (let dy = 0; dy < scale; dy++) {
          const rowOffset = (startY + dy) * width;
          for (let dx = 0; dx < scale; dx++) {
            data[rowOffset + startX + dx] = 1;
          }
        }
      }
    }
  }

  return { width, height, data };
}
