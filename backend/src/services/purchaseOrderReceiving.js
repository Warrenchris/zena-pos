const crypto = require('crypto');

class ReceiptValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ReceiptValidationError';
    this.statusCode = statusCode;
  }
}

function toFiniteQuantity(value, label) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new ReceiptValidationError(`${label} must be a valid number`);
  }
  if (typeof value === 'string' && !value.trim()) {
    throw new ReceiptValidationError(`${label} must be a valid number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ReceiptValidationError(`${label} must be a valid number`);
  }
  return parsed;
}

function resolveLineItem(receipt, lineItems) {
  const identifiers = [];
  if (receipt.purchaseOrderItemId !== undefined && receipt.purchaseOrderItemId !== null) {
    identifiers.push(item => String(item.id) === String(receipt.purchaseOrderItemId));
  }
  if (receipt.productId !== undefined && receipt.productId !== null) {
    identifiers.push(item => String(item.productId) === String(receipt.productId));
  }
  if (typeof receipt.sku === 'string' && receipt.sku.trim()) {
    identifiers.push(item => String(item.sku || '') === receipt.sku.trim());
  }
  if (typeof receipt.productName === 'string' && receipt.productName.trim()) {
    identifiers.push(item => String(item.productName || '') === receipt.productName.trim());
  }

  if (identifiers.length === 0) {
    throw new ReceiptValidationError('Each received item must identify a purchase order line item');
  }

  const matches = lineItems.filter(item => identifiers.every(matchesIdentifier => matchesIdentifier(item)));
  if (matches.length === 0) {
    throw new ReceiptValidationError('A received item does not match any purchase order line item');
  }
  if (matches.length > 1) {
    throw new ReceiptValidationError('A received item matches multiple purchase order lines; include purchaseOrderItemId');
  }
  return matches[0];
}

function validateReceiptBatch({ lineItems, receivedItems, receiveAll = false }) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ReceiptValidationError('This purchase order has no receivable line items');
  }

  if (receiveAll) {
    if (Array.isArray(receivedItems) && receivedItems.length > 0) {
      throw new ReceiptValidationError('Use either receiveAll or receivedItems, not both');
    }
    return lineItems.map(lineItem => {
      const ordered = Number(lineItem.quantityOrdered || 0);
      const current = Number(lineItem.quantityReceived || 0);
      const delta = Math.round((ordered - current) * 100) / 100;
      return { lineItem, current, ordered, delta, newQuantityReceived: ordered };
    }).filter(item => item.delta > 0);
  }

  if (!Array.isArray(receivedItems) || receivedItems.length === 0) {
    throw new ReceiptValidationError('Provide at least one received item, or explicitly set receiveAll to true');
  }

  const seenLineItems = new Set();
  return receivedItems.map((receipt, index) => {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
      throw new ReceiptValidationError(`Received item #${index + 1} is invalid`);
    }

    const lineItem = resolveLineItem(receipt, lineItems);
    if (seenLineItems.has(String(lineItem.id))) {
      throw new ReceiptValidationError(`Purchase order line ${lineItem.productName} appears more than once in this receipt`);
    }
    seenLineItems.add(String(lineItem.id));

    const ordered = Number(lineItem.quantityOrdered || 0);
    const current = Number(lineItem.quantityReceived || 0);
    let delta;
    let newQuantityReceived;

    const hasDelta = receipt.quantityToReceive !== undefined;
    const hasCumulative = receipt.quantityReceived !== undefined;
    if (hasDelta === hasCumulative) {
      throw new ReceiptValidationError(`Specify exactly one receiving quantity for ${lineItem.productName}`);
    }

    if (hasCumulative) {
      newQuantityReceived = toFiniteQuantity(receipt.quantityReceived, `Received quantity for ${lineItem.productName}`);
      delta = Math.round((newQuantityReceived - current) * 100) / 100;
      if (delta < 0) {
        throw new ReceiptValidationError(`Received quantity for ${lineItem.productName} cannot be lower than the quantity already received`);
      }
    } else {
      delta = toFiniteQuantity(receipt.quantityToReceive, `Quantity to receive for ${lineItem.productName}`);
      if (delta <= 0) {
        throw new ReceiptValidationError(`Quantity to receive for ${lineItem.productName} must be greater than zero`);
      }
      newQuantityReceived = Math.round((current + delta) * 100) / 100;
    }

    if (newQuantityReceived > ordered) {
      throw new ReceiptValidationError(`Cannot receive ${newQuantityReceived} units of ${lineItem.productName}. Maximum ordered quantity is ${ordered}.`);
    }

    return { lineItem, current, ordered, delta, newQuantityReceived };
  });
}

function createReceiptRequestHash({ receivedItems, receiveAll = false }) {
  const canonicalItems = Array.isArray(receivedItems)
    ? receivedItems.map(item => ({
        purchaseOrderItemId: item?.purchaseOrderItemId ?? null,
        productId: item?.productId ?? null,
        sku: item?.sku ?? null,
        productName: item?.productName ?? null,
        quantityToReceive: item?.quantityToReceive ?? null,
        quantityReceived: item?.quantityReceived ?? null,
      })).sort((a, b) => String(a.purchaseOrderItemId ?? a.productId ?? a.sku ?? a.productName)
        .localeCompare(String(b.purchaseOrderItemId ?? b.productId ?? b.sku ?? b.productName)))
    : null;

  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ receiveAll: Boolean(receiveAll), receivedItems: canonicalItems }))
    .digest('hex');
}

function validateReceiptRequestId(requestId) {
  if (requestId === undefined || requestId === null || requestId === '') return null;
  if (typeof requestId !== 'string' || requestId.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(requestId)) {
    throw new ReceiptValidationError('Receipt request ID must contain only letters, numbers, hyphens or underscores (max 80 characters)');
  }
  return requestId;
}

function buildReceiptReference({ purchaseOrderId, requestId, requestHash }) {
  return `${buildReceiptRequestPrefix({ purchaseOrderId, requestId })}${requestHash.slice(0, 16)}`;
}

function buildReceiptRequestPrefix({ purchaseOrderId, requestId }) {
  const requestKeyHash = crypto.createHash('sha256').update(requestId).digest('hex').slice(0, 16);
  return `PUR-PO-${purchaseOrderId}-R${requestKeyHash}-`;
}

module.exports = {
  ReceiptValidationError,
  validateReceiptBatch,
  createReceiptRequestHash,
  validateReceiptRequestId,
  buildReceiptReference,
  buildReceiptRequestPrefix,
};
