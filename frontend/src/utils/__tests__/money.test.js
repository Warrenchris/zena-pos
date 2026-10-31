import { coerceMoney, coerceMoneyFields, isPlainObject, MONEY_FIELD_NAMES } from '../money';
import { coerceMoney as apiCoerceMoney, coerceMoneyFields as apiCoerceMoneyFields } from '../../services/api';
import { printStoredSale } from '../../printing/printStoredSale';

describe('coerceMoney - Number() coercion helper at API boundary', () => {
  describe('Coercion of "50.00"-style DECIMAL inputs', () => {
    test('coerces "50.00" string to number 50', () => {
      const result = coerceMoney('50.00');
      expect(result).toBe(50);
      expect(typeof result).toBe('number');
    });

    test('coerces "0.00" to number 0', () => {
      expect(coerceMoney('0.00')).toBe(0);
    });

    test('coerces negative decimal "-50.00" to number -50', () => {
      expect(coerceMoney('-50.00')).toBe(-50);
    });

    test('coerces fractional decimal strings like "12.34"', () => {
      expect(coerceMoney('12.34')).toBe(12.34);
    });

    test('handles whitespace around decimal strings', () => {
      expect(coerceMoney('   50.00   ')).toBe(50);
    });

    test('handles numeric inputs without modification', () => {
      expect(coerceMoney(50)).toBe(50);
      expect(coerceMoney(0)).toBe(0);
      expect(coerceMoney(-25.5)).toBe(-25.5);
    });

    test('handles formatted currency strings (commas and currency signs)', () => {
      expect(coerceMoney('$50.00')).toBe(50);
      expect(coerceMoney('KSh 1,250.00')).toBe(1250);
      expect(coerceMoney('1,000.50')).toBe(1000.5);
    });
  });

  describe('Null, undefined, empty, and invalid inputs', () => {
    test('defaults to 0 for null', () => {
      expect(coerceMoney(null)).toBe(0);
    });

    test('defaults to 0 for undefined', () => {
      expect(coerceMoney(undefined)).toBe(0);
    });

    test('defaults to 0 for empty string or whitespace', () => {
      expect(coerceMoney('')).toBe(0);
      expect(coerceMoney('   ')).toBe(0);
    });

    test('defaults to 0 for non-numeric strings', () => {
      expect(coerceMoney('invalid')).toBe(0);
    });

    test('supports custom fallback value', () => {
      expect(coerceMoney(null, null)).toBe(null);
      expect(coerceMoney('invalid', -1)).toBe(-1);
    });
  });

  describe('Protection against .toFixed crashes and string concatenation bugs', () => {
    test('raw "50.00" string crashes .toFixed(2), but coerceMoney("50.00") succeeds', () => {
      const rawDecimal = '50.00';
      // Verifies the bug condition: strings do not possess a .toFixed method
      expect(typeof rawDecimal.toFixed).toBe('undefined');
      expect(() => rawDecimal.toFixed(2)).toThrow(TypeError);

      // Verifies the fix: coerceMoney returns a Number with .toFixed(2)
      const safeTotal = coerceMoney(rawDecimal);
      expect(typeof safeTotal.toFixed).toBe('function');
      expect(safeTotal.toFixed(2)).toBe('50.00');
    });

    test('prevents string concatenation when adding money values', () => {
      const rawPrice = '50.00';
      const rawTax = '8.00';

      // JavaScript '+' operator concatenates strings
      expect(rawPrice + rawTax).toBe('50.008.00');

      // coerceMoney ensures numeric addition
      const safeSum = coerceMoney(rawPrice) + coerceMoney(rawTax);
      expect(safeSum).toBe(58);
      expect(safeSum.toFixed(2)).toBe('58.00');
    });

    test('works seamlessly with Math.* functions', () => {
      expect(Math.abs(coerceMoney('-50.00'))).toBe(50);
      expect(Math.max(0, coerceMoney('50.00') - 30)).toBe(20);
      expect(Math.min(coerceMoney('50.00'), 100)).toBe(50);
      expect(Math.round(coerceMoney('50.55'))).toBe(51);
    });
  });

  describe('Non-plain objects and preservation of null/undefined in coerceMoneyFields', () => {
    test('passes Blob response through completely untouched', () => {
      const blob = new Blob(['%PDF-1.4 mock binary content'], { type: 'application/pdf' });
      const result = coerceMoneyFields(blob);
      expect(result).toBe(blob); // Exact same reference
      expect(result instanceof Blob).toBe(true);
      expect(result.size).toBe(blob.size);
      expect(result.type).toBe('application/pdf');
    });

    test('passes ArrayBuffer response through completely untouched', () => {
      const buffer = new ArrayBuffer(16);
      const result = coerceMoneyFields(buffer);
      expect(result).toBe(buffer);
      expect(result instanceof ArrayBuffer).toBe(true);
      expect(result.byteLength).toBe(16);
    });

    test('passes FormData through completely untouched', () => {
      const formData = new FormData();
      formData.append('total', '50.00');
      const result = coerceMoneyFields(formData);
      expect(result).toBe(formData);
      expect(result instanceof FormData).toBe(true);
    });

    test('passes Date instances through untouched both at root and nested', () => {
      const now = new Date('2026-10-31T12:00:00Z');
      expect(coerceMoneyFields(now)).toBe(now);

      const objWithDate = {
        total: '50.00',
        createdAt: now
      };
      const normalized = coerceMoneyFields(objWithDate);
      expect(normalized.total).toBe(50);
      expect(normalized.createdAt).toBe(now);
      expect(normalized.createdAt instanceof Date).toBe(true);
      expect(normalized.createdAt.toISOString()).toBe('2026-10-31T12:00:00.000Z');
    });

    test('preserves null and undefined at root and inside nested fields', () => {
      expect(coerceMoneyFields(null)).toBeNull();
      expect(coerceMoneyFields(undefined)).toBeUndefined();

      const payload = {
        total: '50.00',
        subtotal: null,
        taxAmount: null,
        changeAmount: undefined,
        notes: null
      };
      const normalized = coerceMoneyFields(payload);
      expect(normalized.total).toBe(50);
      expect(normalized.subtotal).toBeNull();
      expect(normalized.taxAmount).toBeNull();
      expect(normalized.changeAmount).toBeUndefined();
      expect(normalized.notes).toBeNull();
    });

    test('only coerces string values that parse as finite numbers (leaves non-numeric as-is)', () => {
      const payload = {
        total: '50.00',
        tax: 'EXEMPT',
        discount: 'N/A',
        change: '',
        status: 'completed',
        amount: 100 // already a number
      };
      const normalized = coerceMoneyFields(payload);
      expect(normalized.total).toBe(50);
      expect(normalized.tax).toBe('EXEMPT');
      expect(normalized.discount).toBe('N/A');
      expect(normalized.change).toBe('');
      expect(normalized.status).toBe('completed');
      expect(normalized.amount).toBe(100);
    });
  });

  describe('Legacy sale reprinting with null taxAmount/changeAmount/receiptNumber', () => {
    test('legacy sale normalizes without corrupting null fields and reprints successfully via printStoredSale', async () => {
      // Stored legacy sale from database where modern columns are NULL
      const legacyRawDbSale = {
        id: 42,
        invoiceNumber: '20261025-0042',
        receiptNumber: null,
        total: '50.00',
        subtotal: '50.00',
        tax: null,
        taxAmount: null,
        change: null,
        changeAmount: null,
        paymentAmount: '50.00',
        paymentMethod: 'cash',
        createdAt: '2026-10-25T14:30:00Z',
        items: [
          {
            id: 1,
            name: 'Mineral Water 500ml',
            price: '50.00',
            unitPrice: '50.00',
            quantity: 1,
            lineTotal: '50.00'
          }
        ]
      };

      // 1. Pass through coerceMoneyFields (as would occur in api interceptor)
      const normalizedSale = coerceMoneyFields(legacyRawDbSale);

      // Assert numeric money fields were coerced
      expect(normalizedSale.total).toBe(50);
      expect(normalizedSale.subtotal).toBe(50);
      expect(normalizedSale.items[0].price).toBe(50);
      expect(normalizedSale.items[0].lineTotal).toBe(50);

      // Assert null fields remained strictly null
      expect(normalizedSale.receiptNumber).toBeNull();
      expect(normalizedSale.tax).toBeNull();
      expect(normalizedSale.taxAmount).toBeNull();
      expect(normalizedSale.change).toBeNull();
      expect(normalizedSale.changeAmount).toBeNull();

      // 2. Assert printStoredSale reprints this legacy sale cleanly
      let capturedReceipt = null;
      const mockAdapter = {
        id: 'mock',
        isSupported: () => true,
        print: jest.fn().mockImplementation((job) => {
          capturedReceipt = job?.receipt || job;
          return Promise.resolve({ ok: true });
        })
      };

      const printResult = await printStoredSale(normalizedSale, {
        profile: { connection: 'browser' },
        adapters: { browser: mockAdapter },
        business: { name: 'Soko Safi Fresh' }
      });

      expect(printResult.ok).toBe(true);
      expect(capturedReceipt).not.toBeNull();
      // Receipt number cleanly falls back to invoiceNumber
      expect(capturedReceipt.meta.receiptNumber).toBe('20261025-0042');
      expect(capturedReceipt.meta.invoiceNumber).toBe('20261025-0042');
      expect(capturedReceipt.totals.total).toBe(50);
      expect(capturedReceipt.lines[0].name).toBe('Mineral Water 500ml');
    });
  });

  describe('Invoice PDF download path (blob) with API interceptor', () => {
    test('blob response from /api/invoices/:id/pdf passes through interceptor untouched', () => {
      const mockPdfBlob = new Blob(['%PDF-1.4 mock binary PDF content'], { type: 'application/pdf' });
      const apiResponse = {
        data: mockPdfBlob,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/pdf' }
      };

      // Apply the same transformation used in api.interceptors.response
      if (apiResponse && apiResponse.data) {
        apiResponse.data = coerceMoneyFields(apiResponse.data);
      }

      expect(apiResponse.data).toBe(mockPdfBlob);
      expect(apiResponse.data instanceof Blob).toBe(true);
      expect(apiResponse.data.type).toBe('application/pdf');
    });
  });

  describe('Deep API response normalization', () => {
    test('recursively coerces DECIMAL string fields in nested API responses', () => {
      const apiResponse = {
        success: true,
        data: {
          id: 101,
          invoiceNumber: 'INV-20261031-0001',
          total: '50.00',
          subtotal: '43.10',
          tax: '6.90',
          taxRate: '16.00',
          discount: '0.00',
          status: 'completed',
          items: [
            {
              id: 1,
              name: 'Organic Milk',
              price: '25.00',
              unitPrice: '25.00',
              quantity: 2,
              lineTotal: '50.00'
            }
          ],
          payments: [
            {
              id: 99,
              paymentAmount: '50.00',
              change: '0.00',
              method: 'cash'
            }
          ]
        }
      };

      const normalized = coerceMoneyFields(apiResponse);

      // Check top-level numeric fields
      expect(normalized.data.total).toBe(50);
      expect(normalized.data.subtotal).toBe(43.1);
      expect(normalized.data.tax).toBe(6.9);
      expect(normalized.data.taxRate).toBe(16);
      expect(normalized.data.discount).toBe(0);

      // Check non-money fields were untouched
      expect(normalized.data.id).toBe(101);
      expect(normalized.data.invoiceNumber).toBe('INV-20261031-0001');
      expect(normalized.data.status).toBe('completed');

      // Check nested item fields
      expect(normalized.data.items[0].price).toBe(25);
      expect(normalized.data.items[0].unitPrice).toBe(25);
      expect(normalized.data.items[0].lineTotal).toBe(50);
      expect(normalized.data.items[0].quantity).toBe(2);

      // Check nested payment fields
      expect(normalized.data.payments[0].paymentAmount).toBe(50);
      expect(normalized.data.payments[0].change).toBe(0);
      expect(normalized.data.payments[0].method).toBe('cash');

      // Verify .toFixed(2) can be safely called on every coerced property
      expect(normalized.data.total.toFixed(2)).toBe('50.00');
      expect(normalized.data.items[0].price.toFixed(2)).toBe('25.00');
    });

    test('handles array of sales records', () => {
      const salesList = [
        { id: 1, total: '50.00', tax: '8.00' },
        { id: 2, total: '120.50', tax: '19.28' }
      ];

      const normalized = coerceMoneyFields(salesList);
      expect(normalized[0].total).toBe(50);
      expect(normalized[0].tax).toBe(8);
      expect(normalized[1].total).toBe(120.5);
      expect(normalized[1].tax).toBe(19.28);
    });
  });

  describe('API boundary export verification', () => {
    test('coerceMoney and coerceMoneyFields are properly exported from services/api.js', () => {
      expect(typeof apiCoerceMoney).toBe('function');
      expect(typeof apiCoerceMoneyFields).toBe('function');
      expect(apiCoerceMoney('50.00')).toBe(50);
    });
  });
});
