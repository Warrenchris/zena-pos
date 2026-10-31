/**
 * ESC/POS Thermal Logo Bitmap Processor (Phase 5)
 *
 * Converts a raster image / logo URL into a 1-bit monochrome bitmap:
 * - Scales to target dots (max 288 dots for 80mm, 192 dots for 58mm, max 120 dots height)
 * - Composites transparency onto a solid white background
 * - Converts to grayscale via Rec. 601 luma (0.299 R + 0.587 G + 0.114 B)
 * - Applies Floyd-Steinberg error-diffusion dithering (default) or plain threshold
 * - In-memory cache by URL + dimensions + mode
 * - Silent, graceful fallback (returns null) on load error or headless environment
 */

const logoCache = new Map();

/**
 * Validates whether an image aspect ratio is safe for thermal receipt printing.
 * Skips/rejects when natural height > 2x width (too tall/narrow, < 1:2)
 * OR width > 4x height (too wide/flat, > 4:1).
 *
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function isLogoAspectRatioSafe(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return false;
  if (h > 2 * w || w > 4 * h) {
    return false;
  }
  return true;
}

/**
 * Computes proportional target dimensions preserving aspect ratio.
 * Scales to fit inside max width AND max height using one scale factor:
 *   scale = min(maxW/w, maxH/h)
 * Never stretches one axis independently.
 *
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {object} [options]
 * @param {number} [options.maxDotsWidth=288] - 192 for 58mm, 288 for 80mm
 * @param {number} [options.maxDotsHeight=120] - 120 dots max
 * @returns {{ scale: number, targetW: number, targetH: number, width: number, height: number }}
 */
export function computeLogoDimensions(sourceWidth, sourceHeight, { maxDotsWidth = 288, maxDotsHeight = 120 } = {}) {
  const w = Number(sourceWidth) || 1;
  const h = Number(sourceHeight) || 1;
  const scale = Math.min(maxDotsWidth / w, maxDotsHeight / h);
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  return { scale, targetW, targetH, width: targetW, height: targetH };
}

/**
 * Pure dithering function that converts a 2D array of grayscale luminance values (0-255)
 * to a 1-bit monochrome Uint8Array (1 = black/print dot, 0 = white/blank).
 *
 * @param {number[]|Uint8ClampedArray|Float32Array} luma - Grayscale pixels (0 = black, 255 = white)
 * @param {number} width
 * @param {number} height
 * @param {object} [options]
 * @param {'floyd-steinberg' | 'threshold'} [options.ditherMode='floyd-steinberg']
 * @param {number} [options.threshold=128]
 * @returns {Uint8Array} Length width * height, containing 1 (black) or 0 (white)
 */
export function ditherGrayscaleToMonochrome(luma, width, height, { ditherMode = 'floyd-steinberg', threshold = 128 } = {}) {
  const result = new Uint8Array(width * height);

  if (ditherMode === 'threshold') {
    for (let i = 0; i < luma.length; i++) {
      result[i] = luma[i] < threshold ? 1 : 0;
    }
    return result;
  }

  // Floyd-Steinberg error diffusion: work on a mutable float array
  const buffer = new Float32Array(luma);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width) + x;
      const oldVal = buffer[idx];
      const newVal = oldVal < threshold ? 0 : 255;
      const error = oldVal - newVal;

      result[idx] = newVal === 0 ? 1 : 0;

      // Distribute error to neighboring pixels
      if (x + 1 < width) {
        buffer[idx + 1] += error * (7 / 16);
      }
      if (x - 1 >= 0 && y + 1 < height) {
        buffer[idx + width - 1] += error * (3 / 16);
      }
      if (y + 1 < height) {
        buffer[idx + width] += error * (5 / 16);
      }
      if (x + 1 < width && y + 1 < height) {
        buffer[idx + width + 1] += error * (1 / 16);
      }
    }
  }

  return result;
}

/**
 * Loads an image from URL or data URL and converts it to a 1-bit monochrome bitmap.
 *
 * @param {string} logoUrl
 * @param {object} [options]
 * @param {number} [options.maxDotsWidth=288]  - Max width dots (288 for 80mm, 192 for 58mm)
 * @param {number} [options.maxDotsHeight=120] - Max height dots (120)
 * @param {'floyd-steinberg' | 'threshold'} [options.ditherMode='floyd-steinberg']
 * @param {number} [options.threshold=128]
 * @returns {Promise<{ width: number, height: number, data: Uint8Array } | null>}
 */
export async function getLogoBitmap(logoUrl, {
  maxDotsWidth = 288,
  maxDotsHeight = 120,
  ditherMode = 'floyd-steinberg',
  threshold = 128,
} = {}) {
  if (!logoUrl || typeof logoUrl !== 'string') return null;

  const cacheKey = `${logoUrl}_${maxDotsWidth}_${maxDotsHeight}_${ditherMode}_${threshold}`;
  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey);
  }

  // Graceful fallback if DOM or Canvas is unavailable (e.g. Node tests)
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }

  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new Error('Image load timed out'));
      }, (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ? 500 : 5000);

      image.crossOrigin = 'Anonymous';
      image.onload = () => {
        clearTimeout(timer);
        resolve(image);
      };
      image.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error('Failed to load logo image'));
      };
      image.src = logoUrl;
    });

    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    if (!natW || !natH) return null;

    // Aspect ratio safety check: skip if natural height > 2x width OR width > 4x height
    if (!isLogoAspectRatioSafe(natW, natH)) {
      return null;
    }

    // Scale down proportionally if larger than constraints
    const scale = Math.min(maxDotsWidth / natW, maxDotsHeight / natH);
    const targetW = Math.max(1, Math.round(natW * scale));
    const targetH = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    // 1. Composite on solid white background for transparency
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const imgData = ctx.getImageData(0, 0, targetW, targetH);
    const rgba = imgData.data;
    const luma = new Float32Array(targetW * targetH);

    // 2. Convert to Rec. 601 luma composited on white
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3] / 255;

      const y = (0.299 * r) + (0.587 * g) + (0.114 * b);
      // Composite over white
      luma[p] = (y * a) + (255 * (1 - a));
    }

    // 3. Dither to 1-bit monochrome
    const data = ditherGrayscaleToMonochrome(luma, targetW, targetH, { ditherMode, threshold });
    const result = { width: targetW, height: targetH, data };

    logoCache.set(cacheKey, result);
    return result;
  } catch (err) {
    // Silent fallback on network/CORS error or invalid image
    return null;
  }
}

/**
 * Clears the in-memory logo bitmap cache.
 */
export function clearLogoCache() {
  logoCache.clear();
}
