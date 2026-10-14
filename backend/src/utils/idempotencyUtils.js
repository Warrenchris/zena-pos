'use strict';

const crypto = require('crypto');

/**
 * Normalizes and validates an incoming idempotency key from header or body.
 * Returns a trimmed string (max 64 chars) or null if omitted/empty.
 * Throws 400 Bad Request if the key is present but in an invalid format (e.g. object, array).
 */
function normalizeIdempotencyKey(rawKey) {
  if (rawKey === undefined || rawKey === null) {
    return null;
  }

  if (typeof rawKey !== 'string') {
    const err = new Error('Invalid Idempotency-Key format: must be a string.');
    err.statusCode = 400;
    throw err;
  }

  const trimmed = rawKey.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Column size in Sales table is VARCHAR(64)
  return trimmed.slice(0, 64);
}

/**
 * Generates a deterministic SHA-256 hash of the canonical sale payload.
 * Used to detect when an idempotency key is reused with different sale parameters.
 */
function generateSaleFingerprint(saleData, shopId) {
  const normalizedItems = (Array.isArray(saleData.items) ? saleData.items : [])
    .map(item => ({
      productId: item.productId !== undefined ? String(item.productId) : '',
      quantity: Number(item.quantity) || 0,
      price: item.price !== undefined ? Number(item.price) : undefined,
      discount: Number(item.discount || 0),
      discountType: item.discountType || null,
      discountValue: item.discountValue !== undefined && item.discountValue !== null ? Number(item.discountValue) : null
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  const canonical = {
    shopId: Number(shopId),
    items: normalizedItems,
    paymentMethod: String(saleData.paymentMethod || 'cash').toLowerCase(),
    paymentAmount: saleData.paymentAmount !== undefined ? Number(saleData.paymentAmount) : undefined,
    total: saleData.total !== undefined ? Number(saleData.total) : undefined,
    customerId: saleData.customerId || saleData.customer?.id || null,
    discount: Number(saleData.discount || 0),
    discountType: saleData.discountType || null,
    discountValue: saleData.discountValue !== undefined && saleData.discountValue !== null ? Number(saleData.discountValue) : null
  };

  if (Array.isArray(saleData.payments)) {
    canonical.payments = saleData.payments
      .map(p => ({
        paymentMethod: String(p.paymentMethod || '').toLowerCase(),
        amount: Number(p.amount) || 0
      }))
      .sort((a, b) => a.paymentMethod.localeCompare(b.paymentMethod));
  }

  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * Determines whether a database error is a unique constraint collision specifically
 * on the (shopId, idempotencyKey) index.
 */
function isIdempotencyUniqueError(err) {
  if (!err) return false;

  const isUniqueConstraint = err.name === 'SequelizeUniqueConstraintError' ||
    err.parent?.code === 'ER_DUP_ENTRY' ||
    err.original?.code === 'ER_DUP_ENTRY';

  if (!isUniqueConstraint) return false;

  // Check fields or index names
  if (err.fields && err.fields.idempotencyKey !== undefined) {
    return true;
  }

  const message = (err.message || '') + (err.parent?.message || '') + (err.original?.message || '');
  return message.includes('unique_sales_shop_idempotency_key') ||
    message.includes('idempotencyKey') ||
    message.includes('sales_idempotency_key_unique');
}

/**
 * Generates a deterministic SHA-256 fingerprint of a refund request payload.
 *
 * PURPOSE
 * -------
 * Used by processRefund to detect whether an incoming request is a retry of a
 * previously completed refund action, or a new request that reuses an already-used
 * idempotency key with a different payload (which is rejected 409).
 *
 * IDEMPOTENCY KEY CONTRACT — MUST be respected by all callers
 * -----------------------------------------------------------
 * 1. Each distinct refund action (i.e. each intentional user-initiated refund) MUST
 *    supply a fresh, unique idempotency key (e.g. a UUID generated at the time the
 *    user confirms the refund in the UI or POS terminal).
 * 2. A network retry of the same action MUST reuse the same idempotency key so the
 *    server can recognise and deduplicate it.
 * 3. A SECOND partial refund on the same sale for identical item quantities is a
 *    DIFFERENT action and therefore MUST use a different idempotency key.
 *
 * WHY THIS MATTERS
 * ----------------
 * This fingerprint hashes only {saleId, shopId, items}. It contains no cumulative
 * state (e.g. prior refunded quantities or a refund sequence number). Therefore:
 * - Two requests with the SAME key and SAME items → treated as a retry → deduplicated
 *   (correct: only one refund is issued regardless of how many times the request is sent).
 * - Two requests with DIFFERENT keys and SAME items → treated as distinct actions →
 *   both are processed independently (correct: e.g. two sequential partial refunds of
 *   identical quantities on the same sale).
 * - Two requests with the SAME key and DIFFERENT items → rejected 409 with
 *   IDEMPOTENCY_KEY_REUSED (correct: key collision with a different payload is an error).
 *
 * WHAT THE SERVER ENFORCES
 * ------------------------
 * - Same key + same fingerprint → idempotent success (deduplicated under the sale row lock).
 * - Same key + different fingerprint → 409 IDEMPOTENCY_KEY_REUSED.
 * - No key supplied → refund is processed normally but WITHOUT deduplication protection
 *   (callers are strongly advised to always supply a key).
 *
 * WHAT THE CLIENT MUST GUARANTEE
 * --------------------------------
 * The server CANNOT distinguish a retry from a second legitimate partial refund when
 * both share the same idempotency key AND the same item set. The client is solely
 * responsible for generating a unique key per intended refund action.
 */
function generateRefundFingerprint(saleId, shopId, items) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .filter(item => Number(item?.quantity) > 0)
    .map(item => ({
      productId: item.productId !== undefined ? String(item.productId) : '',
      quantity: Number(item.quantity) || 0,
      disposition: ['restock', 'damaged_writeoff', 'return_to_supplier'].includes(item.disposition)
        ? item.disposition
        : 'restock',
      reasonCode: ['DEFECTIVE', 'WRONG_ITEM', 'EXPIRED', 'CHANGED_MIND', 'OTHER'].includes(item.reasonCode)
        ? item.reasonCode
        : (['DEFECTIVE', 'WRONG_ITEM', 'EXPIRED', 'CHANGED_MIND', 'OTHER'].includes(item.reason) ? item.reason : 'OTHER')
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.disposition.localeCompare(b.disposition));

  const canonical = {
    saleId: Number(saleId),
    shopId: Number(shopId),
    items: normalizedItems
  };

  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

module.exports = {
  normalizeIdempotencyKey,
  generateSaleFingerprint,
  generateRefundFingerprint,
  isIdempotencyUniqueError
};
