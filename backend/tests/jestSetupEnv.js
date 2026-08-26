/**
 * Jest setupFilesAfterFramework — runs inside each Jest worker before any test.
 *
 * Generates a throwaway RSA-2048 key pair and injects it into process.env so
 * that every test file that calls jwt.sign({ algorithm: 'RS256' }) gets a real,
 * valid key.  This avoids the "secretOrPrivateKey must be an asymmetric key"
 * error that occurs when JWT_PRIVATE_KEY is empty or a placeholder in CI.
 *
 * The generated key is ephemeral — it is NOT persisted and has no relation to
 * production keys.
 */

const crypto = require('crypto');

// Only generate if a real key isn't already present in the environment.
const existingKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
const hasRealKey = existingKey.includes('-----BEGIN');

if (!hasRealKey) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Store as single-line escaped strings, matching how the app reads them.
  process.env.JWT_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');
  process.env.JWT_PUBLIC_KEY  = publicKey.replace(/\n/g, '\\n');
}
