import {
  calculateColumnWidths,
  buildWorksheet,
  generateExcel,
} from '../excelGenerator';

describe('Excel Generation Utility (SheetJS CE)', () => {
  let xlsx;

  beforeAll(async () => {
    const mod = await import('xlsx');
    xlsx = mod.default || mod;
  });

  describe('calculateColumnWidths', () => {
    it('calculates width based on longest cell content with padding', () => {
      const data = [
        ['Product', 'Qty'],
        ['Super Loaf Premium Bread 400g', 2],
      ];
      const widths = calculateColumnWidths(data);
      expect(widths[0].wch).toBe('Super Loaf Premium Bread 400g'.length + 3);
      expect(widths[1].wch).toBe(12); // minimum width clamp is 12
    });

    it('respects manual column width overrides', () => {
      const data = [['Name', 'Price']];
      const columnDefs = [{ width: 35 }, { width: 15 }];
      const widths = calculateColumnWidths(data, columnDefs);
      expect(widths[0].wch).toBe(35);
      expect(widths[1].wch).toBe(15);
    });
  });

  describe('buildWorksheet', () => {
    it('builds a worksheet with business headers, column headers, and data', () => {
      const options = {
        identity: {
          displayName: 'SokoSafi Supermarket',
          address: 'Kenyatta Ave, Nairobi',
          phone: '+254711223344',
          kraPin: 'P051234567Z',
          currencySymbol: 'KSh',
        },
        title: 'SALES REPORT',
        subtitle: 'October 2026',
        meta: [{ label: 'Cashier', value: 'Jane' }],
        columns: [
          { header: 'Product', key: 'product', type: 'string' },
          { header: 'Quantity', key: 'qty', type: 'quantity' },
          { header: 'Unit Price', key: 'price', type: 'currency' },
          { header: 'Total', key: 'total', type: 'currency' },
        ],
        rows: [
          { product: 'Bread', qty: 2, price: 65, total: 130 },
          { product: 'Milk', qty: 3, price: 60, total: 180 },
        ],
        summaryRow: ['TOTAL', 5, '', 310],
      };

      const { ws, headerRowCount } = buildWorksheet(xlsx, options);

      expect(ws).toBeDefined();
      expect(headerRowCount).toBeGreaterThan(0);

      // Check freeze pane was set
      expect(ws['!views']).toBeDefined();
      expect(ws['!views'][0].state).toBe('frozen');
      expect(ws['!views'][0].ySplit).toBe(headerRowCount);

      // Column widths were generated
      expect(ws['!cols']).toBeDefined();
      expect(ws['!cols'].length).toBe(4);

      // Verify that numeric cells have type 'n' and formatting string
      // Let's find row with Bread (qty is col B, price is col C, total is col D)
      const totalCell = ws['D8'] || ws['D7']; // Depending on header row count
      expect(totalCell).toBeDefined();
      expect(totalCell.t).toBe('n');
      expect(totalCell.v).toBe(130);
      expect(totalCell.z).toBe('"KSh" #,##0.00');
    });

    it('handles negative numeric values and formatted numeric strings with commas', () => {
      const options = {
        title: 'PROFIT & LOSS',
        columns: [
          { header: 'Item', key: 'item', type: 'string' },
          { header: 'Amount', key: 'amount', type: 'currency' },
        ],
        rows: [
          { item: 'Net Loss', amount: -1500.50 },
          { item: 'Formatted Loss', amount: '-2,450.75' },
        ],
      };

      const { ws } = buildWorksheet(xlsx, options);

      // Find cell for Net Loss (-1500.50)
      const netLossCell = ws['B6'] || ws['B7'] || ws['B8'];
      expect(netLossCell).toBeDefined();
      expect(netLossCell.t).toBe('n');
      expect(netLossCell.v).toBe(-1500.50);

      // Find cell for Formatted Loss (should be parsed into -2450.75, not truncated to -2)
      const formattedLossCell = ws['B7'] || ws['B8'] || ws['B9'];
      expect(formattedLossCell).toBeDefined();
      expect(formattedLossCell.t).toBe('n');
      expect(formattedLossCell.v).toBe(-2450.75);
    });
  });

  describe('generateExcel', () => {
    it('generates a valid single-sheet Excel workbook with buffer output', async () => {
      const result = await generateExcel({
        title: 'INVENTORY VALUATION',
        columns: [
          { header: 'SKU', key: 'sku', type: 'string' },
          { header: 'Name', key: 'name', type: 'string' },
          { header: 'Stock', key: 'stock', type: 'quantity' },
          { header: 'Cost', key: 'cost', type: 'currency' },
        ],
        rows: [
          { sku: 'SKU-1', name: 'Item 1', stock: 10, cost: 250 },
          { sku: 'SKU-2', name: 'Item 2', stock: 20, cost: 500 },
        ],
        save: false,
      });

      expect(result.success).toBe(true);
      expect(result.workbook).toBeDefined();
      expect(result.workbook.SheetNames).toContain('Report');
      expect(result.buffer).toBeDefined();
      expect(result.buffer.byteLength).toBeGreaterThan(1000);
    });

    it('supports multi-sheet workbook generation', async () => {
      const result = await generateExcel({
        fileName: 'financial-summary.xlsx',
        sheets: [
          {
            sheetName: 'Revenue',
            title: 'REVENUE BREAKDOWN',
            columns: [{ header: 'Month', key: 'm' }, { header: 'Revenue', key: 'r', type: 'currency' }],
            rows: [{ m: 'Oct', r: 50000 }, { m: 'Nov', r: 65000 }],
          },
          {
            sheetName: 'Expenses',
            title: 'EXPENSE BREAKDOWN',
            columns: [{ header: 'Category', key: 'c' }, { header: 'Amount', key: 'a', type: 'currency' }],
            rows: [{ c: 'Rent', a: 20000 }, { c: 'Supplies', a: 15000 }],
          },
        ],
        save: false,
      });

      expect(result.success).toBe(true);
      expect(result.workbook.SheetNames).toEqual(['Revenue', 'Expenses']);
    });

    it('handles empty dataset gracefully without crashing', async () => {
      const result = await generateExcel({
        title: 'EMPTY REPORT',
        columns: [{ header: 'Col 1', key: 'c1' }],
        rows: [],
        save: false,
      });

      expect(result.success).toBe(true);
      expect(result.workbook).toBeDefined();
    });

    it('handles large dataset (500 rows) within reasonable memory and time', async () => {
      const largeRows = [];
      for (let i = 0; i < 500; i++) {
        largeRows.push({
          id: i,
          code: `SKU-${i}`,
          description: `Product description item ${i}`,
          qty: i % 20,
          price: (i * 15.75).toFixed(2),
        });
      }

      const startTime = Date.now();
      const result = await generateExcel({
        title: 'LARGE REPORT',
        columns: [
          { header: 'ID', key: 'id', type: 'number' },
          { header: 'SKU', key: 'code', type: 'string' },
          { header: 'Description', key: 'description', type: 'string' },
          { header: 'Qty', key: 'qty', type: 'quantity' },
          { header: 'Price', key: 'price', type: 'currency' },
        ],
        rows: largeRows,
        save: false,
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(2000);
      expect(result.buffer.byteLength).toBeGreaterThan(10000);
    });
  });
});
