import { generatePDF } from '../documentGenerator';

describe('PDF Document Generator (jsPDF + AutoTable)', () => {
  it('generates a standard PDF document with header, table, and running footer', async () => {
    const result = await generatePDF({
      title: 'SALES SUMMARY',
      subtitle: 'October 2026',
      documentNumber: 'DOC-2026-001',
      identity: {
        displayName: 'SokoSafi Supermarket',
        address: 'Kenyatta Ave, Nairobi',
        phone: '+254711223344',
        email: 'info@sokosafi.co.ke',
        kraPin: 'P051234567Z',
        showPoweredBy: true,
        printedBy: 'Admin Operator',
      },
      meta: [{ label: 'Payment Method', value: 'All' }],
      columns: [
        { header: '#', dataKey: 'idx', align: 'center', width: 10 },
        { header: 'Product', dataKey: 'name', align: 'left' },
        { header: 'Qty', dataKey: 'qty', align: 'center', width: 15 },
        { header: 'Amount (KSh)', dataKey: 'amount', align: 'right', width: 30 },
      ],
      rows: [
        { idx: 1, name: 'Super Loaf 400g', qty: 2, amount: '130.00' },
        { idx: 2, name: 'Fresh Milk 500ml', qty: 4, amount: '240.00' },
      ],
      summaryRow: ['', 'TOTAL', '6', '370.00'],
      save: false,
    });

    expect(result.success).toBe(true);
    expect(result.doc).toBeDefined();
    expect(result.buffer).toBeDefined();
    expect(result.buffer.byteLength).toBeGreaterThan(1000);
    expect(result.pageCount).toBe(1);
  });

  it('renders summary metric cards when provided', async () => {
    const result = await generatePDF({
      title: 'FINANCIAL REPORT',
      summaryCards: [
        { label: 'Gross Revenue', value: 'KSh 120,500' },
        { label: 'Total Discounts', value: 'KSh 5,200' },
        { label: 'Net Profit', value: 'KSh 45,800' },
      ],
      columns: [{ header: 'Category', dataKey: 'cat' }, { header: 'Total', dataKey: 'tot' }],
      rows: [{ cat: 'Retail', tot: '100,000' }],
      save: false,
    });

    expect(result.success).toBe(true);
    expect(result.buffer.byteLength).toBeGreaterThan(1000);
  });

  it('supports landscape orientation', async () => {
    const result = await generatePDF({
      title: 'WIDE SPREADSHEET AUDIT',
      orientation: 'landscape',
      columns: [
        { header: 'Col 1', dataKey: 'c1' },
        { header: 'Col 2', dataKey: 'c2' },
        { header: 'Col 3', dataKey: 'c3' },
        { header: 'Col 4', dataKey: 'c4' },
      ],
      rows: [{ c1: 'A', c2: 'B', c3: 'C', c4: 'D' }],
      save: false,
    });

    expect(result.success).toBe(true);
    // Landscape A4 width is ~297mm (allowing floating point conversion)
    expect(result.doc.internal.pageSize.getWidth()).toBeCloseTo(297, 0);
    expect(result.doc.internal.pageSize.getHeight()).toBeCloseTo(210, 0);
  });

  it('handles empty dataset cleanly with a formatted notice', async () => {
    const result = await generatePDF({
      title: 'CUSTOMER STATEMENT',
      columns: [{ header: 'Date', dataKey: 'd' }, { header: 'Ref', dataKey: 'r' }],
      rows: [],
      save: false,
    });

    expect(result.success).toBe(true);
    expect(result.pageCount).toBe(1);
    expect(result.buffer.byteLength).toBeGreaterThan(500);
  });

  it('handles multi-page pagination with repeated table headers and dynamic footers', async () => {
    // Generate 120 rows to force multiple pages
    const multiPageRows = [];
    for (let i = 1; i <= 120; i++) {
      multiPageRows.push({
        num: i,
        desc: `Inventory Line Item Transaction #${i}`,
        category: i % 2 === 0 ? 'Beverages' : 'Grains',
        qty: (i * 3) % 50,
        rate: (i * 45.5).toFixed(2),
        total: (i * 3 * 45.5).toFixed(2),
      });
    }

    const result = await generatePDF({
      title: 'ANNUAL AUDIT REPORT',
      identity: {
        organizationName: 'Zana Enterprise Corp',
        showPoweredBy: true,
      },
      columns: [
        { header: '#', dataKey: 'num', align: 'center', width: 10 },
        { header: 'Description', dataKey: 'desc', align: 'left' },
        { header: 'Category', dataKey: 'category', align: 'left', width: 25 },
        { header: 'Qty', dataKey: 'qty', align: 'center', width: 15 },
        { header: 'Rate', dataKey: 'rate', align: 'right', width: 25 },
        { header: 'Total (KSh)', dataKey: 'total', align: 'right', width: 30 },
      ],
      rows: multiPageRows,
      save: false,
    });

    expect(result.success).toBe(true);
    expect(result.pageCount).toBeGreaterThan(1); // Must paginate across 2+ pages
    expect(result.buffer.byteLength).toBeGreaterThan(10000);
  });

  it('handles large datasets (500 rows) safely and efficiently', async () => {
    const largeRows = [];
    for (let i = 1; i <= 500; i++) {
      largeRows.push({
        num: i,
        desc: `Bulk item ${i}`,
        price: (i * 10).toFixed(2),
      });
    }

    const startTime = Date.now();
    const result = await generatePDF({
      title: 'MASS TRANSACTION ARCHIVE',
      columns: [
        { header: 'ID', dataKey: 'num' },
        { header: 'Desc', dataKey: 'desc' },
        { header: 'Price', dataKey: 'price' },
      ],
      rows: largeRows,
      save: false,
    });
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(result.pageCount).toBeGreaterThan(5);
    expect(duration).toBeLessThan(5000);
  });
});
