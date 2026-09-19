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

module.exports = {
  normalizeIdempotencyKey,
  generateSaleFingerprint,
  isIdempotencyUniqueError
};
