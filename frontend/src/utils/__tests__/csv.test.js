import {
  escapeCSVField,
  generateCSVText,
  downloadCSV,
} from '../csv';

describe('CSV Utility (RFC 4180 & Enhanced Features)', () => {
  describe('escapeCSVField', () => {
    it('returns empty string for null and undefined', () => {
      expect(escapeCSVField(null)).toBe('');
      expect(escapeCSVField(undefined)).toBe('');
    });

    it('returns simple strings and numbers without quoting when not necessary', () => {
      expect(escapeCSVField('SimpleText')).toBe('SimpleText');
      expect(escapeCSVField(1234)).toBe('1234');
    });

    it('quotes strings containing commas', () => {
      expect(escapeCSVField('Nairobi, Kenya')).toBe('"Nairobi, Kenya"');
    });

    it('doubles quotes and wraps in quotes when string contains double quotes', () => {
      expect(escapeCSVField('He said "Hello"')).toBe('"He said ""Hello"""');
    });

    it('quotes strings containing newlines and carriage returns', () => {
      expect(escapeCSVField('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(escapeCSVField('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"');
    });

    it('quotes strings that start or end with whitespace', () => {
      expect(escapeCSVField(' leading')).toBe('" leading"');
      expect(escapeCSVField('trailing ')).toBe('"trailing "');
    });

    it('neutralizes spreadsheet formula injection by prepending a single quote', () => {
      expect(escapeCSVField('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(escapeCSVField('+1234567890')).toBe("'+1234567890");
      expect(escapeCSVField('-5+5')).toBe("'-5+5");
      expect(escapeCSVField('@echo off')).toBe("'@echo off");
    });

    it('respects preventInjection: false when explicitly configured', () => {
      expect(escapeCSVField('=SUM(A1:A10)', { preventInjection: false })).toBe('=SUM(A1:A10)');
    });
  });

  describe('generateCSVText', () => {
    it('prepends UTF-8 BOM by default', () => {
      const data = [{ item: 'Bread', price: 65 }];
      const csv = generateCSVText(data);
      expect(csv.startsWith('\uFEFF')).toBe(true);
    });

    it('can omit BOM when includeBom: false', () => {
      const data = [{ item: 'Bread', price: 65 }];
      const csv = generateCSVText(data, { includeBom: false });
      expect(csv.startsWith('\uFEFF')).toBe(false);
      expect(csv).toContain('item,price\r\nBread,65');
    });

    it('formats array of objects with correct headers and rows', () => {
      const data = [
        { name: 'Bread', price: 65, category: 'Bakery' },
        { name: 'Milk, 500ml', price: 60, category: 'Dairy' },
      ];
      const csv = generateCSVText(data, { includeBom: false });
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('name,price,category');
      expect(lines[1]).toBe('Bread,65,Bakery');
      expect(lines[2]).toBe('"Milk, 500ml",60,Dairy');
    });

    it('formats array of arrays (AOA) with custom headers', () => {
      const headers = ['SKU', 'Product', 'Stock'];
      const data = [
        ['SKU-001', 'Widget A', 10],
        ['SKU-002', 'Widget B', 25],
      ];
      const csv = generateCSVText(data, { headers, includeBom: false });
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('SKU,Product,Stock');
      expect(lines[1]).toBe('SKU-001,Widget A,10');
      expect(lines[2]).toBe('SKU-002,Widget B,25');
    });

    it('supports column filtering and custom labels with commas requiring quotes', () => {
      const data = [
        { id: 1, name: 'Item 1', internalCost: 40, retailPrice: 60 },
      ];
      const columns = [
        { key: 'name', header: 'Product Name' },
        { key: 'retailPrice', header: 'Price, KSh' },
      ];
      const csv = generateCSVText(data, { columns, includeBom: false });
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('Product Name,"Price, KSh"');
      expect(lines[1]).toBe('Item 1,60');
    });

    it('handles empty dataset gracefully without crashing', () => {
      expect(generateCSVText([], { includeBom: false })).toBe('');
      expect(generateCSVText(null, { includeBom: false })).toBe('');
    });

    it('handles large datasets (1000 rows) efficiently', () => {
      const largeData = [];
      for (let i = 0; i < 1000; i++) {
        largeData.push({
          id: i,
          code: `CODE-${i}`,
          description: `Product description with comma, row ${i}`,
          amount: (i * 12.5).toFixed(2),
        });
      }

      const startTime = Date.now();
      const csv = generateCSVText(largeData, { includeBom: false });
      const duration = Date.now() - startTime;

      const lines = csv.split('\r\n');
      expect(lines.length).toBe(1001); // 1 header + 1000 data rows
      expect(duration).toBeLessThan(1000); // Must be fast (< 1s)
    });
  });

  describe('downloadCSV backward compatibility', () => {
    it('executes without error with legacy signature (filename, rows)', () => {
      const rows = [
        { date: '2026-11-01', prediction: 5000 },
        { date: '2026-11-02', prediction: 5200 },
      ];

      // In browser/jsdom with mocked URL.createObjectURL, downloadCSV returns success
      const result = downloadCSV('sales-forecast.csv', rows);
      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(2);
    });

    it('returns success: false when given empty data', () => {
      const result = downloadCSV('empty.csv', []);
      expect(result.success).toBe(false);
      expect(result.rowCount).toBe(0);
    });
  });
});
