const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET environment variable is missing. Please set ENCRYPTION_SECRET in your .env file.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt plain text using AES-256-CBC
 * Output format: <iv_hex>:<encrypted_hex>
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt string encrypted with encrypt()
 */
function decrypt(text) {
  if (text === null || text === undefined || text === '') return text;
  if (typeof text !== 'string' || !text.includes(':')) return text;
  try {
    const key = getEncryptionKey();
    const parts = text.split(':');
    if (parts.length !== 2) return text;
    const [ivHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error.message);
    return text;
  }
}

/**
 * Return a masked version of a secret string (e.g. showing only last 4 characters)
 */
function maskSecret(text) {
  if (!text || typeof text !== 'string') return '';
  // Decrypt if it's stored in encrypted format
  const plainText = text.includes(':') ? decrypt(text) : text;
  if (!plainText) return '';
  if (plainText.length <= 4) return '****';
  return '*'.repeat(plainText.length - 4) + plainText.slice(-4);
}

/**
 * Helper to check if a value is a masked placeholder (e.g. starts with stars)
 */
function isMaskedValue(text) {
  if (!text || typeof text !== 'string') return false;
  return text.startsWith('*');
}

module.exports = {
  encrypt,
  decrypt,
  maskSecret,
  isMaskedValue
};
