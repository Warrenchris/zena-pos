/**
 * Unit Tests for Backend A4 Invoice PDF Generator (Phase 6)
 *
 * Verifies that the PDF generator runs without throwing:
 * 1. For a sale/invoice with all optional fields (branch, customer, cashier, tax, discount, notes).
 * 2. For a minimal sale/invoice without any optional fields.
 * 3. Produces a valid PDF document with %PDF- header.
 */

const { Writable } = require('stream');
const PDFDocument = require('pdfkit');
const { buildInvoicePdfDoc } = require('../src/controllers/invoiceController');

describe('Backend A4 Invoice PDF Generator (Unit Tests)', () => {
  const drainPdfDoc = (doc) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const stream = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      stream.on('finish', () => {
        resolve(Buffer.concat(chunks));
      });
      stream.on('error', reject);
      doc.on('error', reject);

      doc.pipe(stream);
      doc.end();
    });
  };

  test('generates valid A4 PDF without throwing for an invoice with all optional fields', async () => {
    const fullInvoice = {
      id: 101,
      invoiceNumber: 'INV-2026-000101',
      createdAt: '2026-10-24T12:00:00.000Z',
      status: 'paid',
      paymentMethod: 'mpesa',
      subtotal: 3500.00,
      tax: 482.76,
      discount: 200.00,
      total: 3300.00,
      shop: {
        name: 'Zana Supermarket Westlands',
        address: 'Westlands Square, Ring Road',
        phone: '+254711223344',
        kraPin: 'P051234567X',
        branch: 'Westlands Flagship',
      },
      sale: {
        id: 42,
        receiptNumber: 'R-77A1-000042',
        cashierName: 'Grace Muthoni',
        taxRate: 16,
        taxInclusive: true,
        Customer: {
          name: 'David Kimani',
        },
      },
      employee: {
        firstName: 'Supervisor',
        lastName: 'Otieno',
      },
      items: [
        {
          name: 'Maize Flour 2kg',
          quantity: 3,
          price: 290.00,
          total: 870.00,
        },
        {
          name: 'Cooking Oil 2L',
          quantity: 2,
          price: 650.00,
          total: 1300.00,
        },
      ],
    };

    const settings = {
      branch: 'Westlands Flagship',
      tagline: 'Better Products · Brighter Together',
      showPoweredBy: true,
      taxRate: 16,
      taxInclusive: true,
    };

    const doc = buildInvoicePdfDoc(fullInvoice, settings);
    expect(doc).toBeDefined();

    const pdfBuffer = await drainPdfDoc(doc);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(100);

    // Standard PDF signature
    const headerString = pdfBuffer.slice(0, 5).toString('ascii');
    expect(headerString).toBe('%PDF-');
  });

  test('generates valid A4 PDF without throwing for a minimal invoice without optional fields', async () => {
    const minimalInvoice = {
      id: 5,
      invoiceNumber: 'INV-MINIMAL-005',
      // No status, no paymentMethod, no subtotal, no tax, no discount
      total: 500.00,
      // Minimal shop
      shop: {
        name: 'Simple Store',
      },
      // No sale, no employee, no user
      items: [
        {
          name: 'General Commodity',
          quantity: 1,
          price: 500.00,
        },
      ],
    };

    // Invalid persisted logo paths must be ignored rather than read from disk.
    const emptySettings = { businessLogo: '/uploads/logos/../../.env' };

    const doc = buildInvoicePdfDoc(minimalInvoice, emptySettings);
    expect(doc).toBeDefined();

    const pdfBuffer = await drainPdfDoc(doc);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(100);

    // Standard PDF signature
    const headerString = pdfBuffer.slice(0, 5).toString('ascii');
    expect(headerString).toBe('%PDF-');
  });

  test('correctly handles zero items and empty invoice gracefully', async () => {
    const emptyInvoice = {
      invoiceNumber: 'INV-EMPTY',
      total: 0,
      items: [],
    };

    const doc = buildInvoicePdfDoc(emptyInvoice, { showPoweredBy: false });
    expect(doc).toBeDefined();

    const pdfBuffer = await drainPdfDoc(doc);
    expect(pdfBuffer.length).toBeGreaterThan(100);
    expect(pdfBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('renders "TAX INVOICE" only when shop has a VAT PIN AND vatRegistered is true', async () => {
    const PDFDocument = require('pdfkit');
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');

    const taxInvoice = {
      invoiceNumber: 'INV-TAX-01',
      total: 1160,
      shop: { name: 'KRA Store', kraPin: 'P051234567X' },
      items: [{ name: 'Item A', quantity: 1, price: 1160, total: 1160 }],
    };

    // 1. Both PIN and vatRegistered = true -> renders "TAX INVOICE"
    textSpy.mockClear();
    const docTax = buildInvoicePdfDoc(taxInvoice, { vatRegistered: true });
    await drainPdfDoc(docTax);
    const calledTextsTax = textSpy.mock.calls.map((c) => c[0]);
    expect(calledTextsTax).toContain('TAX INVOICE');
    expect(calledTextsTax).not.toContain('INVOICE');

    // 2. Has PIN but vatRegistered = false -> renders "INVOICE"
    textSpy.mockClear();
    const docRegular1 = buildInvoicePdfDoc(taxInvoice, { vatRegistered: false });
    await drainPdfDoc(docRegular1);
    const calledTextsReg1 = textSpy.mock.calls.map((c) => c[0]);
    expect(calledTextsReg1).toContain('INVOICE');
    expect(calledTextsReg1).not.toContain('TAX INVOICE');

    // 3. vatRegistered = true but NO PIN -> renders "INVOICE"
    textSpy.mockClear();
    const noPinInvoice = {
      invoiceNumber: 'INV-NOPIN-02',
      total: 500,
      shop: { name: 'No PIN Store', kraPin: '' },
      items: [{ name: 'Item B', quantity: 1, price: 500, total: 500 }],
    };
    const docRegular2 = buildInvoicePdfDoc(noPinInvoice, { vatRegistered: true });
    await drainPdfDoc(docRegular2);
    const calledTextsReg2 = textSpy.mock.calls.map((c) => c[0]);
    expect(calledTextsReg2).toContain('INVOICE');
    expect(calledTextsReg2).not.toContain('TAX INVOICE');

    textSpy.mockRestore();
  });

  test('paginates long invoices and repeats the item table header', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    const items = Array.from({ length: 65 }, (_, index) => ({
      name: `Long product name ${index + 1} with a description that wraps across the available item column width`,
      quantity: 2,
      price: 125,
      total: 250,
    }));
    const doc = buildInvoicePdfDoc({
      invoiceNumber: 'INV-MULTIPAGE-65',
      createdAt: '2026-11-04T08:00:00.000Z',
      status: 'paid',
      subtotal: 16250,
      total: 16250,
      items,
      shop: { name: 'Pagination Test Shop' },
    }, { currencySymbol: 'USD', showPoweredBy: false });

    expect(doc.bufferedPageRange().count).toBeGreaterThan(1);
    const pdfBuffer = await drainPdfDoc(doc);
    const renderedText = textSpy.mock.calls.map(([value]) => String(value)).join(' ');

    expect(pdfBuffer.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(renderedText).toContain('ITEM');
    expect(renderedText).toContain('UNIT PRICE');
    expect(renderedText).toContain('Page 1 of');
    expect(renderedText).toContain('USD 125.00');
    expect(renderedText).toContain('USD 16,250.00');
    expect(textSpy.mock.calls.filter(([value]) => value === 'ITEM').length).toBeGreaterThan(1);
    textSpy.mockRestore();
  });

  test('does not print malformed or unverified shop PINs as tax identity', async () => {
    const PDFDocument = require('pdfkit');
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    const doc = buildInvoicePdfDoc({
      invoiceNumber: 'INV-PIN-CHECK',
      total: 100,
      shop: { name: 'PIN Check Shop', kraPin: 'not-a-valid-pin' },
      items: [],
    }, { vatRegistered: true });

    await drainPdfDoc(doc);
    const renderedText = textSpy.mock.calls.map(([value]) => String(value)).join(' ');
    expect(renderedText).toContain('INVOICE');
    expect(renderedText).not.toContain('TAX INVOICE');
    expect(renderedText).not.toContain('not-a-valid-pin');
    textSpy.mockRestore();
  });
});
