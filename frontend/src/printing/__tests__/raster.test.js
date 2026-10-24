/**
 * Unit Tests for ESC/POS Raster Generator (Phase 5)
 *
 * Verifies:
 * - GS v 0 0 command header structure
 * - Row width byte-calculation and horizontal dot packing (MSB leftmost)
 * - Row bit padding when width is not a multiple of 8
 * - Banding logic splitting tall bitmaps into <= 128 row chunks
 */

import { buildRasterBytes } from '../raster';

describe('ESC/POS Raster Generator (GS v 0)', () => {
  const GS = 0x1d;

  test('returns empty Uint8Array for null or empty bitmap', () => {
    expect(buildRasterBytes(null)).toEqual(new Uint8Array(0));
    expect(buildRasterBytes({})).toEqual(new Uint8Array(0));
    expect(buildRasterBytes({ width: 0, height: 0, data: new Uint8Array(0) })).toEqual(new Uint8Array(0));
  });

  test('generates valid GS v 0 header and packs 8 horizontal dots per byte', () => {
    // 8x2 bitmap:
    // Row 0: 1 0 1 0 1 0 1 0 (0xAA)
    // Row 1: 0 1 0 1 0 1 0 1 (0x55)
    const bitmap = {
      width: 8,
      height: 2,
      data: new Uint8Array([
        1, 0, 1, 0, 1, 0, 1, 0,
        0, 1, 0, 1, 0, 1, 0, 1,
      ]),
    };

    const bytes = buildRasterBytes(bitmap);

    // Header: 1D 76 30 00 xL xH yL yH
    // xBytes = 1, yDots = 2
    expect(bytes[0]).toBe(GS);
    expect(bytes[1]).toBe(0x76); // 'v'
    expect(bytes[2]).toBe(0x30); // '0'
    expect(bytes[3]).toBe(0x00); // mode 0 (normal)
    expect(bytes[4]).toBe(1);    // xL (1 byte)
    expect(bytes[5]).toBe(0);    // xH
    expect(bytes[6]).toBe(2);    // yL (2 dots)
    expect(bytes[7]).toBe(0);    // yH

    // Data:
    expect(bytes[8]).toBe(0xAA);
    expect(bytes[9]).toBe(0x55);
    expect(bytes.length).toBe(8 + 2);
  });

  test('correctly pads horizontal bits when width is not a multiple of 8', () => {
    // 10x1 bitmap:
    // 10 dots -> Math.ceil(10/8) = 2 bytes
    // Dots: 1, 1, 1, 1, 0, 0, 0, 0,  1, 1 (padded with 6 zeros)
    // Byte 0: 0xF0 (11110000)
    // Byte 1: 0xC0 (11000000)
    const bitmap = {
      width: 10,
      height: 1,
      data: new Uint8Array([1, 1, 1, 1, 0, 0, 0, 0, 1, 1]),
    };

    const bytes = buildRasterBytes(bitmap);

    expect(bytes[4]).toBe(2); // xL = 2 bytes
    expect(bytes[5]).toBe(0);
    expect(bytes[6]).toBe(1); // yL = 1 dot
    expect(bytes[7]).toBe(0);

    expect(bytes[8]).toBe(0xF0);
    expect(bytes[9]).toBe(0xC0);
    expect(bytes.length).toBe(10);
  });

  test('splits images taller than 128 rows into consecutive bands', () => {
    const width = 16; // 2 bytes per row
    const height = 300; // Will split into: 128 + 128 + 44 rows
    const data = new Uint8Array(width * height);

    // Fill all dots black
    data.fill(1);

    const bytes = buildRasterBytes({ width, height, data }, { maxBandRows: 128 });

    // Each band has 8-byte header + (rows * 2 bytes)
    // Band 1: 8 + 128 * 2 = 264 bytes
    // Band 2: 8 + 128 * 2 = 264 bytes
    // Band 3: 8 + 44 * 2 = 96 bytes
    // Total = 624 bytes
    expect(bytes.length).toBe(624);

    // Band 1 header
    expect(bytes[0]).toBe(GS);
    expect(bytes[4]).toBe(2);   // xL = 2
    expect(bytes[6]).toBe(128); // yL = 128
    expect(bytes[7]).toBe(0);   // yH = 0

    // Band 2 header at offset 264
    expect(bytes[264]).toBe(GS);
    expect(bytes[264 + 4]).toBe(2);   // xL = 2
    expect(bytes[264 + 6]).toBe(128); // yL = 128
    expect(bytes[264 + 7]).toBe(0);

    // Band 3 header at offset 264 + 264 = 528
    expect(bytes[528]).toBe(GS);
    expect(bytes[528 + 4]).toBe(2);  // xL = 2
    expect(bytes[528 + 6]).toBe(44); // yL = 44
    expect(bytes[528 + 7]).toBe(0);
  });
});
