/**
 * Receipt Token Utilities (Phase 5)
 *
 * Generates and validates client-side receipt tokens for public receipt QR links.
 * Format: 16 cryptographically secure random bytes encoded as base64url (exactly 22 characters).
 */

/**
 * Generates a cryptographically secure 16-byte random token encoded as 22-char base64url.
 *
 * @returns {string} 22-character base64url token
 */
export function generateReceiptToken() {
  const bytes = new Uint8Array(16);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    // Node.js fallback
    try {
      const nodeCrypto = globalThis.require ? globalThis.require('crypto') : null;
      if (nodeCrypto?.randomFillSync) {
        nodeCrypto.randomFillSync(bytes);
      } else {
        throw new Error('No crypto.getRandomValues available');
      }
    } catch {
      throw new Error('No secure random number generator available');
    }
  }

  // Convert bytes to base64url
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');

  // Convert base64 to base64url: replace + with -, / with _, remove trailing =
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Validates whether a token matches the required 22 base64url character format.
 *
 * @param {any} token
 * @returns {boolean}
 */
export function isValidReceiptToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{22}$/.test(token);
}
