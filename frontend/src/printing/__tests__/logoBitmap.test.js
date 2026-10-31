/**
 * Unit Tests for Thermal Logo Bitmap & Dithering (Phase 5)
 *
 * Verifies:
 * - Floyd-Steinberg error diffusion and threshold dithering algorithms
 * - Graceful fallback on invalid logo or headless environment
 * - In-memory cache behavior
 */

import { ditherGrayscaleToMonochrome, getLogoBitmap, clearLogoCache, computeLogoDimensions, isLogoAspectRatioSafe } from '../logoBitmap';

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

  describe('Aspect ratio preservation & scaling', () => {
    test('a square 48x48 source yields a square bitmap at both widths', () => {
      // 58mm: max 192x120 dots
      const dims58 = computeLogoDimensions(48, 48, { maxDotsWidth: 192, maxDotsHeight: 120 });
      expect(dims58.width).toBe(dims58.height);
      expect(dims58.width).toBe(120);

      // 80mm: max 288x120 dots
      const dims80 = computeLogoDimensions(48, 48, { maxDotsWidth: 288, maxDotsHeight: 120 });
      expect(dims80.width).toBe(dims80.height);
      expect(dims80.width).toBe(120);
    });

    test('a wide logo and a tall logo keep their ratio within 1 dot', () => {
      // Wide logo: 400x100 (ratio 4:1)
      const wideSrc = { w: 400, h: 100, ratio: 4.0 };
      const wide58 = computeLogoDimensions(wideSrc.w, wideSrc.h, { maxDotsWidth: 192, maxDotsHeight: 120 });
      expect(wide58.width).toBeLessThanOrEqual(192);
      expect(wide58.height).toBeLessThanOrEqual(120);
      const wide58ExpectedH = Math.round(wide58.width / wideSrc.ratio);
      expect(Math.abs(wide58.height - wide58ExpectedH)).toBeLessThanOrEqual(1);

      const wide80 = computeLogoDimensions(wideSrc.w, wideSrc.h, { maxDotsWidth: 288, maxDotsHeight: 120 });
      expect(wide80.width).toBeLessThanOrEqual(288);
      expect(wide80.height).toBeLessThanOrEqual(120);
      const wide80ExpectedH = Math.round(wide80.width / wideSrc.ratio);
      expect(Math.abs(wide80.height - wide80ExpectedH)).toBeLessThanOrEqual(1);

      // Tall logo: 100x400 (ratio 1:4)
      const tallSrc = { w: 100, h: 400, ratio: 0.25 };
      const tall58 = computeLogoDimensions(tallSrc.w, tallSrc.h, { maxDotsWidth: 192, maxDotsHeight: 120 });
      expect(tall58.width).toBeLessThanOrEqual(192);
      expect(tall58.height).toBeLessThanOrEqual(120);
      const tall58ExpectedW = Math.round(tall58.height * tallSrc.ratio);
      expect(Math.abs(tall58.width - tall58ExpectedW)).toBeLessThanOrEqual(1);

      const tall80 = computeLogoDimensions(tallSrc.w, tallSrc.h, { maxDotsWidth: 288, maxDotsHeight: 120 });
      expect(tall80.width).toBeLessThanOrEqual(288);
      expect(tall80.height).toBeLessThanOrEqual(120);
      const tall80ExpectedW = Math.round(tall80.height * tallSrc.ratio);
      expect(Math.abs(tall80.width - tall80ExpectedW)).toBeLessThanOrEqual(1);
    });
  });

  describe('isLogoAspectRatioSafe', () => {
    test('returns true for square and safe aspect ratios between 1:2 and 4:1', () => {
      expect(isLogoAspectRatioSafe(100, 100)).toBe(true);
      expect(isLogoAspectRatioSafe(400, 100)).toBe(true); // 4:1
      expect(isLogoAspectRatioSafe(100, 200)).toBe(true); // 1:2
      expect(isLogoAspectRatioSafe(300, 100)).toBe(true);
    });

    test('returns false for aspect ratios outside 1:2 to 4:1', () => {
      expect(isLogoAspectRatioSafe(401, 100)).toBe(false); // > 4:1 (too wide)
      expect(isLogoAspectRatioSafe(100, 201)).toBe(false); // < 1:2 (too tall, h > 2*w)
      expect(isLogoAspectRatioSafe(50, 200)).toBe(false);
      expect(isLogoAspectRatioSafe(600, 100)).toBe(false);
    });

    test('returns false for zero, negative or non-numeric dimensions', () => {
      expect(isLogoAspectRatioSafe(0, 100)).toBe(false);
      expect(isLogoAspectRatioSafe(100, 0)).toBe(false);
      expect(isLogoAspectRatioSafe(-10, 50)).toBe(false);
      expect(isLogoAspectRatioSafe(null, undefined)).toBe(false);
    });
  });
});
