/**
 * Backend Pure-Logic Unit Tests: Receipt Number Validation, Collision & Idempotency (Phase 2)
 */

describe('Receipt Number Validation & Collision Logic (Backend Phase 2)', () => {
  const RECEIPT_NUMBER_REGEX = /^R-[A-Za-z0-9]{4}-\d{6}$/;

  const validateReceiptNumberFormat = (receiptNumber) => {
    if (!receiptNumber) return true; // optional
    return RECEIPT_NUMBER_REGEX.test(receiptNumber);
  };

  test('validates format R-XXXX-NNNNNN strictly', () => {
    expect(validateReceiptNumberFormat('R-4K9Q-000001')).toBe(true);
    expect(validateReceiptNumberFormat('R-ABCD-123456')).toBe(true);
    expect(validateReceiptNumberFormat('R-zzzz-999999')).toBe(true);

    // Invalid formats
    expect(validateReceiptNumberFormat('OFFLINE-1234')).toBe(false);
    expect(validateReceiptNumberFormat('R-123-000001')).toBe(false); // only 3 chars in deviceId
    expect(validateReceiptNumberFormat('R-12345-000001')).toBe(false); // 5 chars in deviceId
    expect(validateReceiptNumberFormat('R-ABCD-12345')).toBe(false); // 5 digits counter
    expect(validateReceiptNumberFormat('R-ABCD-1234567')).toBe(false); // 7 digits counter
    expect(validateReceiptNumberFormat('random-string')).toBe(false);
  });

  describe('Duplicate receiptNumber check & Idempotent Replay simulation', () => {
    let mockSalesStore;

    beforeEach(() => {
      mockSalesStore = new Map(); // id -> sale
    });

    const simulateSaleSubmission = async ({ shopId, receiptNumber, idempotencyKey, payload }) => {
      if (receiptNumber && !RECEIPT_NUMBER_REGEX.test(receiptNumber)) {
        const err = new Error(`Invalid receiptNumber format '${receiptNumber}'. Expected format: R-XXXX-NNNNNN`);
        err.statusCode = 400;
        throw err;
      }

      // Check if existing sale matches idempotencyKey
      const existingByKey = Array.from(mockSalesStore.values()).find(
        s => s.shopId === shopId && s.idempotencyKey === idempotencyKey
      );
      if (existingByKey) {
        return { status: 200, sale: existingByKey, replayed: true };
      }

      // Check receiptNumber collision with different idempotency key
      if (receiptNumber) {
        const existingByReceipt = Array.from(mockSalesStore.values()).find(
          s => s.shopId === shopId && s.receiptNumber === receiptNumber
        );
        if (existingByReceipt) {
          if (existingByReceipt.idempotencyKey === idempotencyKey) {
            return { status: 200, sale: existingByReceipt, replayed: true };
          }
          const err = new Error(`Receipt number '${receiptNumber}' already exists for this shop with a different idempotency key.`);
          err.statusCode = 409;
          err.code = 'RECEIPT_NUMBER_ALREADY_EXISTS';
          throw err;
        }
      }

      // Create new sale
      const newSale = {
        id: mockSalesStore.size + 1,
        shopId,
        receiptNumber: receiptNumber || null,
        idempotencyKey,
        ...payload
      };
      mockSalesStore.set(newSale.id, newSale);
      return { status: 201, sale: newSale, replayed: false };
    };

    test('accepts sales arriving without receiptNumber (legacy client), storing null', async () => {
      const res = await simulateSaleSubmission({
        shopId: 1,
        receiptNumber: null, // omitted by legacy client
        idempotencyKey: 'legacy-idemp-1',
        payload: { total: 1200, invoiceNumber: '20261025-0012' }
      });
      expect(res.status).toBe(201);
      expect(res.sale.receiptNumber).toBeNull();
      expect(res.sale.invoiceNumber).toBe('20261025-0012');
    });

    test('returns existing sale on idempotent replay with matching idempotencyKey', async () => {
      const res1 = await simulateSaleSubmission({
        shopId: 1,
        receiptNumber: 'R-7K2X-000001',
        idempotencyKey: 'idemp-key-1',
        payload: { total: 500 }
      });
      expect(res1.status).toBe(201);
      expect(res1.replayed).toBe(false);

      // Re-submitting with identical receiptNumber and identical idempotencyKey
      const res2 = await simulateSaleSubmission({
        shopId: 1,
        receiptNumber: 'R-7K2X-000001',
        idempotencyKey: 'idemp-key-1',
        payload: { total: 500 }
      });
      expect(res2.status).toBe(200);
      expect(res2.replayed).toBe(true);
      expect(res2.sale.id).toBe(res1.sale.id);
    });

    test('rejects with 409 when receiptNumber exists with a different idempotencyKey', async () => {
      await simulateSaleSubmission({
        shopId: 1,
        receiptNumber: 'R-7K2X-000001',
        idempotencyKey: 'idemp-key-1',
        payload: { total: 500 }
      });

      // Attempting to reuse the same receiptNumber with a new/different idempotencyKey
      await expect(
        simulateSaleSubmission({
          shopId: 1,
          receiptNumber: 'R-7K2X-000001',
          idempotencyKey: 'idemp-key-2',
          payload: { total: 900 }
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'RECEIPT_NUMBER_ALREADY_EXISTS'
      });
    });

    test('allows the same receiptNumber across different shops', async () => {
      const resShop1 = await simulateSaleSubmission({
        shopId: 1,
        receiptNumber: 'R-7K2X-000001',
        idempotencyKey: 'idemp-shop1',
        payload: { total: 500 }
      });
      expect(resShop1.status).toBe(201);

      // Shop 2 can use the same receipt number without collision
      const resShop2 = await simulateSaleSubmission({
        shopId: 2,
        receiptNumber: 'R-7K2X-000001',
        idempotencyKey: 'idemp-shop2',
        payload: { total: 750 }
      });
      expect(resShop2.status).toBe(201);
      expect(resShop2.sale.shopId).toBe(2);
    });
  });
});
