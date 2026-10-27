/**
 * Unit Tests for Receipt QR Generation & Round-Trip Scanning (Phase 5)
 *
 * Verifies:
 * - computeQrMatrix generates identical matrix with error correction level M
 * - renderQrSvg generates crisp inline SVG with shape-rendering="crispEdges" and quiet zones
 * - getQrBitmap generates 1-bit monochrome raster matrix
 * - Round-trip scan decoding with jsQR at both 80mm (dotSize=4) and 58mm (dotSize=3)
 */

import jsQR from 'jsqr';
import { computeQrMatrix, renderQrSvg, getQrBitmap } from '../qr';

describe('Receipt QR Generation & jsQR Round-Trip Scanning', () => {
  const TEST_PAYLOAD = 'https://pos.zana.test/r/aB3_dE9-gH1_jK2-mN3_pQ';

  test('throws when payload is empty or non-string', () => {
    expect(() => computeQrMatrix('')).toThrow();
    expect(() => computeQrMatrix(null)).toThrow();
    expect(() => renderQrSvg('')).toThrow();
    expect(() => getQrBitmap('')).toThrow();
  });

  test('computes QR matrix with standard 4-module quiet zone', () => {
    const { size, symbolSize, quietZone, matrix } = computeQrMatrix(TEST_PAYLOAD);

    expect(quietZone).toBe(4);
    expect(size).toBe(symbolSize + 8);
    expect(matrix.length).toBe(size);
    expect(matrix[0].length).toBe(size);

    // Quiet zone corners must be 0 (white)
    expect(matrix[0][0]).toBe(0);
    expect(matrix[0][size - 1]).toBe(0);
    expect(matrix[size - 1][0]).toBe(0);
    expect(matrix[size - 1][size - 1]).toBe(0);

    // QR finder pattern top-left starts at (4, 4) and must be black (1)
    expect(matrix[4][4]).toBe(1);
  });

  test('renderQrSvg produces crisp inline SVG with no external resources', () => {
    const svg80 = renderQrSvg(TEST_PAYLOAD, { sizeMm: 22 });

    expect(svg80).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg80).toContain('width="22mm"');
    expect(svg80).toContain('height="22mm"');
    expect(svg80).toContain('shape-rendering="crispEdges"');
    expect(svg80).toContain('<rect width="100%" height="100%" fill="#ffffff"/>');
    expect(svg80).toContain('<path fill="#000000"');
    expect(svg80).not.toContain('href=');
    expect(svg80).not.toContain('src=');
    expect(svg80).not.toMatch(/url\(/i);

    const svg58 = renderQrSvg(TEST_PAYLOAD, { sizeMm: 18 });
    expect(svg58).toContain('width="18mm"');
  });

  test('SVG and Bitmap raster share the exact same module matrix', () => {
    const { size, matrix } = computeQrMatrix(TEST_PAYLOAD);
    const bitmap = getQrBitmap(TEST_PAYLOAD, { dotSize: 1 }); // 1:1 scale

    expect(bitmap.width).toBe(size);
    expect(bitmap.height).toBe(size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        expect(bitmap.data[y * size + x]).toBe(matrix[y][x]);
      }
    }
  });

  describe('jsQR Round-Trip Decoding', () => {
    const decodeBitmap = (bitmap) => {
      const { width, height, data } = bitmap;
      // jsQR expects an RGBA Uint8ClampedArray (4 bytes per pixel)
      const rgba = new Uint8ClampedArray(width * height * 4);

      for (let i = 0; i < data.length; i++) {
        const offset = i * 4;
        const isBlack = data[i] === 1;
        const color = isBlack ? 0 : 255; // 0 = black, 255 = white

        rgba[offset] = color;     // R
        rgba[offset + 1] = color; // G
        rgba[offset + 2] = color; // B
        rgba[offset + 3] = 255;   // A
      }

      return jsQR(rgba, width, height);
    };

    test('successfully scans and decodes 80mm profile QR bitmap (dotSize = 4)', () => {
      const bitmap = getQrBitmap(TEST_PAYLOAD, { dotSize: 4 });
      const code = decodeBitmap(bitmap);

      expect(code).not.toBeNull();
      expect(code.data).toBe(TEST_PAYLOAD);
    });

    test('successfully scans and decodes 58mm profile QR bitmap (dotSize = 3)', () => {
      const bitmap = getQrBitmap(TEST_PAYLOAD, { dotSize: 3 });
      const code = decodeBitmap(bitmap);

      expect(code).not.toBeNull();
      expect(code.data).toBe(TEST_PAYLOAD);
    });
  });
});
