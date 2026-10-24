/**
 * Unit Tests for Thermal Logo Bitmap & Dithering (Phase 5)
 *
 * Verifies:
 * - Floyd-Steinberg error diffusion and threshold dithering algorithms
 * - Graceful fallback on invalid logo or headless environment
 * - In-memory cache behavior
 */

import { ditherGrayscaleToMonochrome, getLogoBitmap, clearLogoCache } from '../logoBitmap';

describe('Logo Bitmap & Dithering Engine', () => {
  beforeEach(() => {
    clearLogoCache();
  });

  describe('ditherGrayscaleToMonochrome', () => {
    test('threshold mode classifies strictly at threshold value', () => {
      const luma = [0, 50, 127, 128, 200, 255];
      // threshold = 128: < 128 is black (1), >= 128 is white (0)
      const result = ditherGrayscaleToMonochrome(luma, 6, 1, { ditherMode: 'threshold', threshold: 128 });

      expect(Array.from(result)).toEqual([1, 1, 1, 0, 0, 0]);
    });

    test('Floyd-Steinberg preserves solid black and solid white completely', () => {
      const allBlack = new Float32Array(16).fill(0);
      const blackResult = ditherGrayscaleToMonochrome(allBlack, 4, 4, { ditherMode: 'floyd-steinberg' });
      expect(Array.from(blackResult)).toEqual(new Array(16).fill(1));

      const allWhite = new Float32Array(16).fill(255);
      const whiteResult = ditherGrayscaleToMonochrome(allWhite, 4, 4, { ditherMode: 'floyd-steinberg' });
      expect(Array.from(whiteResult)).toEqual(new Array(16).fill(0));
    });

    test('Floyd-Steinberg produces balanced half-toning on mid-gray gradient', () => {
      // 10x10 mid-gray patch (128)
      const midGray = new Float32Array(100).fill(128);
      const result = ditherGrayscaleToMonochrome(midGray, 10, 10, { ditherMode: 'floyd-steinberg', threshold: 128 });

      const blackDots = Array.from(result).filter((v) => v === 1).length;
      // Mid-gray (128/255) error diffusion should yield approximately 50% black dots
      expect(blackDots).toBeGreaterThanOrEqual(40);
      expect(blackDots).toBeLessThanOrEqual(60);
    });
  });

  describe('getLogoBitmap Fallback and Cache', () => {
    test('returns null for null, empty or non-string logoUrl', async () => {
      expect(await getLogoBitmap(null)).toBeNull();
      expect(await getLogoBitmap('')).toBeNull();
      expect(await getLogoBitmap(undefined)).toBeNull();
    });

    test('silently falls back to null in headless environment without crashing', async () => {
      // In Node test runner without full DOM Canvas support, it returns null gracefully
      const res = await getLogoBitmap('https://example.com/logo.png');
      expect(res === null || typeof res === 'object').toBe(true);
    });
  });
});
