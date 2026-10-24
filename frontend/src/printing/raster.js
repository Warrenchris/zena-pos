/**
 * ESC/POS Raster Bit Image Generator (GS v 0) (Phase 5)
 *
 * Converts a monochrome 1-bit bitmap matrix into standard ESC/POS GS v 0 raster bytes.
 * To protect printer buffers from overflowing on large images, images taller than
 * maxBandRows (default: 128 rows) are split into consecutive raster bands.
 *
 * GS v 0 syntax:
 *   GS   v   0   m   xL   xH   yL   yH   [d1 ... dk]
 *   0x1D 0x76 0x30 0x00 (xBytes & 0xFF) ((xBytes >> 8) & 0xFF) (yDots & 0xFF) ((yDots >> 8) & 0xFF) ...
 */

const GS = 0x1d;

/**
 * Builds ESC/POS GS v 0 raster bytes from a 1-bit bitmap.
 *
 * @param {object} bitmap
 * @param {number} bitmap.width  - Width in pixels/dots
 * @param {number} bitmap.height - Height in pixels/dots
 * @param {Uint8Array|Array<number>} bitmap.data - 1 byte per pixel: truthy (1/255) = black (print), 0 = white (blank)
 * @param {object} [options]
 * @param {number} [options.maxBandRows=128] - Maximum rows per raster band (<= 128 recommended)
 * @returns {Uint8Array} Packed ESC/POS command bytes
 */
export function buildRasterBytes(bitmap, { maxBandRows = 128 } = {}) {
  if (!bitmap || !bitmap.width || !bitmap.height || !bitmap.data) {
    return new Uint8Array(0);
  }

  const { width, height, data } = bitmap;
  const xBytes = Math.ceil(width / 8);
  const bandLimit = Math.max(1, Math.min(maxBandRows, 128));

  const result = [];

  for (let bandStart = 0; bandStart < height; bandStart += bandLimit) {
    const bandRows = Math.min(bandLimit, height - bandStart);

    const xL = xBytes & 0xff;
    const xH = (xBytes >> 8) & 0xff;
    const yL = bandRows & 0xff;
    const yH = (bandRows >> 8) & 0xff;

    // Header: GS v 0 0 xL xH yL yH
    result.push(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH);

    // Band raster data: xBytes per row, 8 horizontal dots per byte (MSB leftmost)
    for (let r = 0; r < bandRows; r++) {
      const y = bandStart + r;
      const rowOffset = y * width;

      for (let b = 0; b < xBytes; b++) {
        let byteVal = 0;
        const xOffset = b * 8;

        for (let bit = 0; bit < 8; bit++) {
          const x = xOffset + bit;
          if (x < width) {
            const pixel = data[rowOffset + x];
            if (pixel) {
              byteVal |= (1 << (7 - bit));
            }
          }
        }

        result.push(byteVal);
      }
    }
  }

  return Uint8Array.from(result);
}
