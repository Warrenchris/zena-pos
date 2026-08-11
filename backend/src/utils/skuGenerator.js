/**
 * Calculate EAN-13 check digit for a 12-digit string
 * Formula: Sum digits at odd indices (1-based) + 3 * Sum digits at even indices (1-based).
 * Check digit = (10 - (total % 10)) % 10.
 */
function calculateEan13CheckDigit(first12Digits) {
  if (first12Digits.length !== 12 || !/^\d+$/.test(first12Digits)) {
    throw new Error('EAN-13 check digit calculation requires exactly 12 numeric digits');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(first12Digits[i], 10);
    // 1-based index: odd positions multiplied by 1, even positions multiplied by 3
    if ((i + 1) % 2 === 0) {
      sum += digit * 3;
    } else {
      sum += digit;
    }
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Generate EAN-13 Barcode (13 digits with valid check digit)
 */
function generateEAN13() {
  // Use country prefix + random digits for first 12 digits (e.g. 200... for internal store barcodes)
  const countryPrefix = '200';
  let randomDigits = '';
  for (let i = 0; i < 9; i++) {
    randomDigits += Math.floor(Math.random() * 10);
  }
  const first12 = countryPrefix + randomDigits;
  const checkDigit = calculateEan13CheckDigit(first12);
  return first12 + checkDigit;
}

/**
 * Calculate UPC-A check digit for a 11-digit string
 */
function calculateUpcCheckDigit(first11Digits) {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(first11Digits[i], 10);
    if ((i + 1) % 2 !== 0) {
      sum += digit * 3;
    } else {
      sum += digit;
    }
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Generate UPC Barcode (12 digits with valid check digit)
 */
function generateUPC() {
  let first11 = '0'; // System number 0 for standard UPC
  for (let i = 0; i < 10; i++) {
    first11 += Math.floor(Math.random() * 10);
  }
  const checkDigit = calculateUpcCheckDigit(first11);
  return first11 + checkDigit;
}

/**
 * Generate CODE128 Barcode (Alpha-numeric string)
 */
function generateCode128() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = 'C128-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate Barcode depending on format
 */
function generateBarcode(format = 'EAN13') {
  const fmt = (format || 'EAN13').toUpperCase();
  switch (fmt) {
    case 'EAN13':
      return generateEAN13();
    case 'UPC':
      return generateUPC();
    case 'CODE128':
      return generateCode128();
    default:
      return generateEAN13();
  }
}

/**
 * Generate SKU using prefix and counter/random suffix
 */
function generateSKU(prefix = 'SKU', productCount = 1) {
  const cleanPrefix = (prefix || 'SKU').trim().toUpperCase();
  const sequenceNum = String(productCount).padStart(5, '0');
  const randomHex = Math.floor(Math.random() * 900 + 100);
  return `${cleanPrefix}-${sequenceNum}-${randomHex}`;
}

module.exports = {
  calculateEan13CheckDigit,
  generateEAN13,
  calculateUpcCheckDigit,
  generateUPC,
  generateCode128,
  generateBarcode,
  generateSKU
};
