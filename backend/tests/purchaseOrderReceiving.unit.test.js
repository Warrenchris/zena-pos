const {
  ReceiptValidationError,
  validateReceiptBatch,
  createReceiptRequestHash,
  validateReceiptRequestId,
  buildReceiptReference,
  buildReceiptRequestPrefix,
} = require('../src/services/purchaseOrderReceiving');

const lineItems = [
  { id: 11, productId: 101, productName: 'Coffee', sku: 'COF-01', quantityOrdered: '10.00', quantityReceived: '2.00' },
  { id: 12, productId: 102, productName: 'Tea', sku: 'TEA-01', quantityOrdered: '5.00', quantityReceived: '0.00' },
];

describe('purchase order receiving validation', () => {
  test('resolves line items by purchaseOrderItemId and calculates cumulative quantity delta', () => {
    const result = validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 7 }],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ current: 2, ordered: 10, delta: 5, newQuantityReceived: 7 });
  });

  test('supports legacy delta-based payloads', () => {
    const result = validateReceiptBatch({
      lineItems,
      receivedItems: [{ productId: 101, quantityToReceive: 3 }],
    });

    expect(result[0]).toMatchObject({ current: 2, delta: 3, newQuantityReceived: 5 });
  });

  test('treats an unchanged cumulative target as a safe replay with zero stock delta', () => {
    const result = validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 2 }],
    });

    expect(result[0].delta).toBe(0);
    expect(result[0].newQuantityReceived).toBe(2);
  });

  test('rejects an empty receivedItems array instead of treating it as receive-all', () => {
    expect(() => validateReceiptBatch({ lineItems, receivedItems: [] }))
      .toThrow('Provide at least one received item');
  });

  test('supports explicit receive-all and returns only outstanding quantities', () => {
    const result = validateReceiptBatch({ lineItems, receiveAll: true });
    expect(result).toHaveLength(2);
    expect(result.map(item => item.delta)).toEqual([8, 5]);
  });

  test('rejects receive-all combined with itemized quantities', () => {
    expect(() => validateReceiptBatch({
      lineItems,
      receiveAll: true,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 4 }],
    })).toThrow('Use either receiveAll or receivedItems');
  });

  test('rejects unknown line items instead of silently skipping them', () => {
    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [{ productId: 999, quantityToReceive: 1 }],
    })).toThrow('does not match any purchase order line item');
  });

  test('rejects ambiguous identifiers when multiple PO lines reference the same product', () => {
    const duplicatedProductLines = [
      ...lineItems,
      { id: 13, productId: 101, productName: 'Coffee bulk', sku: 'COF-02', quantityOrdered: 4, quantityReceived: 0 },
    ];

    expect(() => validateReceiptBatch({
      lineItems: duplicatedProductLines,
      receivedItems: [{ productId: 101, quantityToReceive: 1 }],
    })).toThrow('matches multiple purchase order lines');
  });

  test('rejects duplicate references to the same line in one batch', () => {
    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [
        { purchaseOrderItemId: 11, quantityReceived: 3 },
        { purchaseOrderItemId: 11, quantityReceived: 4 },
      ],
    })).toThrow('appears more than once');
  });

  test('rejects non-numeric, negative and over-ordered quantities', () => {
    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: '5units' }],
    })).toThrow('must be a valid number');

    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 1 }],
    })).toThrow('cannot be lower');

    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 11 }],
    })).toThrow('Maximum ordered quantity');
  });

  test('requires exactly one quantity representation', () => {
    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11 }],
    })).toThrow('Specify exactly one');

    expect(() => validateReceiptBatch({
      lineItems,
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 3, quantityToReceive: 1 }],
    })).toThrow('Specify exactly one');
  });

  test('rejects an order with no relational line items', () => {
    expect(() => validateReceiptBatch({ lineItems: [], receiveAll: true }))
      .toThrow('no receivable line items');
  });
});

describe('purchase order receipt idempotency helpers', () => {
  test('hashes an exact receipt payload deterministically', () => {
    const payload = {
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 5 }],
    };
    expect(createReceiptRequestHash(payload)).toBe(createReceiptRequestHash(payload));
    expect(createReceiptRequestHash(payload)).not.toBe(createReceiptRequestHash({
      receivedItems: [{ purchaseOrderItemId: 11, quantityReceived: 6 }],
    }));
    expect(createReceiptRequestHash({ receivedItems: [
      { purchaseOrderItemId: 11, quantityReceived: 5 },
      { purchaseOrderItemId: 12, quantityReceived: 3 },
    ] })).toBe(createReceiptRequestHash({ receivedItems: [
      { purchaseOrderItemId: 12, quantityReceived: 3 },
      { purchaseOrderItemId: 11, quantityReceived: 5 },
    ] }));
  });

  test('validates stable request IDs', () => {
    expect(validateReceiptRequestId('batch_01-abc')).toBe('batch_01-abc');
    expect(() => validateReceiptRequestId('bad request id')).toThrow(ReceiptValidationError);
    expect(() => validateReceiptRequestId('x'.repeat(81))).toThrow(ReceiptValidationError);
    expect(validateReceiptRequestId(undefined)).toBeNull();
  });

  test('creates a deterministic, compact reference and lookup prefix scoped to the PO', () => {
    const request = { purchaseOrderId: 44, requestId: 'batch-01', requestHash: 'a'.repeat(64) };
    const requestKeyHash = require('crypto').createHash('sha256').update('batch-01').digest('hex').slice(0, 16);
    expect(buildReceiptReference(request)).toBe(`PUR-PO-44-R${requestKeyHash}-${'a'.repeat(16)}`);
    expect(buildReceiptRequestPrefix(request)).toBe(`PUR-PO-44-R${requestKeyHash}-`);
    expect(buildReceiptReference(request).length).toBeLessThan(64);
  });
});
