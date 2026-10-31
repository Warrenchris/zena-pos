import { coerceMoney, coerceMoneyFields, MONEY_FIELD_NAMES } from '../money';
import { coerceMoney as apiCoerceMoney, coerceMoneyFields as apiCoerceMoneyFields } from '../../services/api';

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

  describe('coerceMoneyFields - deep API response normalization', () => {
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

    test('returns non-object and null values unchanged', () => {
      expect(coerceMoneyFields(null)).toBe(null);
      expect(coerceMoneyFields(undefined)).toBe(undefined);
      expect(coerceMoneyFields('hello')).toBe('hello');
      expect(coerceMoneyFields(123)).toBe(123);
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
