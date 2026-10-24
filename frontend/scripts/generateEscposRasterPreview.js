import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { getQrBitmap } from '../src/printing/qr.js';
import { ditherGrayscaleToMonochrome } from '../src/printing/logoBitmap.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CRC32 calculation for PNG
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function createPng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = createChunk('IHDR', ihdr);

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const lineOffset = y * (1 + width * 4);
    scanlines[lineOffset] = 0;
    rgbaBuffer.copy(scanlines, lineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Creates a synthetic brand logo bitmap with Floyd-Steinberg dithering
 */
function createSyntheticLogo(width, height) {
  // Grayscale buffer with gradient and shapes
  const luma = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width) + x;
      // Background gradient
      luma[idx] = 255;
    }
  }

  // Draw rounded icon box in center
  const boxW = Math.min(width - 40, 80);
  const boxH = Math.min(height - 10, 60);
  const startX = Math.floor((width - boxW) / 2);
  const startY = Math.floor((height - boxH) / 2);

  for (let y = startY; y < startY + boxH; y++) {
    for (let x = startX; x < startX + boxW; x++) {
      luma[(y * width) + x] = 80; // Dark grey / bronze
    }
  }

  // Draw white 'Z' inside box
  const zLeft = startX + 15;
  const zRight = startX + boxW - 15;
  const zTop = startY + 12;
  const zBottom = startY + boxH - 12;

  for (let y = zTop; y <= zBottom; y++) {
    for (let x = zLeft; x <= zRight; x++) {
      const topBar = y >= zTop && y <= zTop + 6;
      const bottomBar = y >= zBottom - 6 && y <= zBottom;
      const progress = (y - zTop) / (zBottom - zTop);
      const diagX = Math.round(zRight - (progress * (zRight - zLeft)));
      const diagonal = Math.abs(x - diagX) <= 3;

      if (topBar || bottomBar || diagonal) {
        luma[(y * width) + x] = 255; // White
      }
    }
  }

  const dithered = ditherGrayscaleToMonochrome(luma, width, height, { ditherMode: 'floyd-steinberg' });
  return { width, height, data: dithered };
}

// Generate ESC/POS Preview
const sampleQrPayload = 'https://app.zana.pos/r/aB3_dE9-gH1_jK2-mN3_pQ';

// 80mm roll: 576 dots wide
const w80 = 576;
const logo80 = createSyntheticLogo(288, 70);
const qr80 = getQrBitmap(sampleQrPayload, { dotSize: 4 }); // 164x164

// 58mm roll: 384 dots wide
const w58 = 384;
const logo58 = createSyntheticLogo(192, 50);
const qr58 = getQrBitmap(sampleQrPayload, { dotSize: 3 }); // 123x123

// Render roll onto an RGBA canvas
function renderThermalRoll(paperWidth, logo, qr, title) {
  const paperHeight = 460;
  const rgba = Buffer.alloc(paperWidth * paperHeight * 4);

  // Fill white paper background
  for (let i = 0; i < paperWidth * paperHeight; i++) {
    rgba[i * 4] = 255;     // R
    rgba[i * 4 + 1] = 255; // G
    rgba[i * 4 + 2] = 255; // B
    rgba[i * 4 + 3] = 255; // A
  }

  const setPixel = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= paperWidth || y < 0 || y >= paperHeight) return;
    const idx = (y * paperWidth + x) * 4;
    rgba[idx] = r;
    rgba[idx + 1] = g;
    rgba[idx + 2] = b;
    rgba[idx + 3] = a;
  };

  // Blit 1-bit monochrome bitmap
  const blitBitmap = (bitmap, offsetX, offsetY) => {
    for (let by = 0; by < bitmap.height; by++) {
      for (let bx = 0; bx < bitmap.width; bx++) {
        const isDot = bitmap.data[(by * bitmap.width) + bx] === 1;
        if (isDot) {
          setPixel(offsetX + bx, offsetY + by, 15, 23, 42); // Black/Navy ink
        }
      }
    }
  };

  // Blit logo centered
  const logoX = Math.floor((paperWidth - logo.width) / 2);
  blitBitmap(logo, logoX, 20);

  // Blit divider rule
  const ruleY1 = 110;
  for (let x = 16; x < paperWidth - 16; x++) {
    setPixel(x, ruleY1, 203, 213, 225);
  }

  // Draw simulated receipt lines (dots)
  const drawLine = (y, indent = 24, length = paperWidth - 48, thickness = 2) => {
    for (let dy = 0; dy < thickness; dy++) {
      for (let x = indent; x < indent + length; x++) {
        setPixel(x, y + dy, 71, 85, 105);
      }
    }
  };

  drawLine(130, 40, paperWidth - 80, 4); // Store Name
  drawLine(142, 60, paperWidth - 120, 2); // Branch
  drawLine(150, 50, paperWidth - 100, 2); // Contact

  // Meta lines
  drawLine(175, 24, 180, 2);
  drawLine(185, 24, 160, 2);

  // Items table simulation
  for (let row = 0; row < 3; row++) {
    drawLine(210 + (row * 16), 24, paperWidth - 48, 2);
  }

  // Total bar
  const ruleY2 = 280;
  for (let x = 16; x < paperWidth - 16; x++) {
    for (let dy = 0; dy < 3; dy++) {
      setPixel(x, ruleY2 + dy, 15, 23, 42);
    }
  }

  // Blit QR Code in footer
  // Right-aligned on 80mm, centered on 58mm
  const qrX = paperWidth > 400 ? paperWidth - qr.width - 24 : Math.floor((paperWidth - qr.width) / 2);
  const qrY = 300;
  blitBitmap(qr, qrX, qrY);

  return { width: paperWidth, height: paperHeight, buffer: rgba };
}

const roll80 = renderThermalRoll(w80, logo80, qr80, '80mm Roll');
const roll58 = renderThermalRoll(w58, logo58, qr58, '58mm Roll');

// Composite into a side-by-side presentation canvas
const canvasW = w80 + w58 + 64; // 576 + 384 + 64 = 1024
const canvasH = 540;
const canvasRgba = Buffer.alloc(canvasW * canvasH * 4);

// Fill slate dark background (#0f172a)
for (let i = 0; i < canvasW * canvasH; i++) {
  canvasRgba[i * 4] = 15;     // R
  canvasRgba[i * 4 + 1] = 23; // G
  canvasRgba[i * 4 + 2] = 42; // B
  canvasRgba[i * 4 + 3] = 255;// A
}

// Blit roll80 at x = 20, y = 50
const blitRoll = (roll, startX, startY) => {
  for (let y = 0; y < roll.height; y++) {
    for (let x = 0; x < roll.width; x++) {
      const srcIdx = (y * roll.width + x) * 4;
      const dstIdx = ((startY + y) * canvasW + (startX + x)) * 4;
      canvasRgba[dstIdx] = roll.buffer[srcIdx];
      canvasRgba[dstIdx + 1] = roll.buffer[srcIdx + 1];
      canvasRgba[dstIdx + 2] = roll.buffer[srcIdx + 2];
      canvasRgba[dstIdx + 3] = 255;
    }
  }
};

blitRoll(roll80, 20, 50);
blitRoll(roll58, w80 + 44, 50);

const pngBuffer = createPng(canvasW, canvasH, canvasRgba);

const targetDirs = [
  path.join(__dirname, '..', 'receipt-preview'),
  path.join(__dirname, '..', '..', 'receipt-preview'),
];

for (const dir of targetDirs) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'escpos-preview.png'), pngBuffer);
}

console.log('✓ ESC/POS raster preview PNG generated successfully at:');
console.log(`  ${path.join(targetDirs[0], 'escpos-preview.png')}`);
console.log(`  ${path.join(targetDirs[1], 'escpos-preview.png')}`);
