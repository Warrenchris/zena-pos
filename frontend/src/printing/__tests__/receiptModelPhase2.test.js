import { buildReceipt, buildCreditNote } from '../receiptModel';

describe('Receipt Model Phase 2 (Data Model & Snapshots)', () => {
  const business = {
    name: 'Zana Supermarket',
    address: 'Kimathi Street, Nairobi',
    phone: '+254 700 123 456',
    kraPin: 'P051234567X',
  };

  const settings = {
    header: 'Welcome to Zana',
    footer: 'Thank you for your business!',
    showLogo: true,
    logoUrl: '/uploads/logo.png',
    branch: 'Nairobi CBD Branch',
    tagline: 'Better Products · Brighter Together',
    showPoweredBy: true,
    qrEnabled: true,
  };

  test('buildReceipt with a full new-format sale', () => {
    const sale = {
      receiptNumber: 'R-7A3K-000042',
      serverData: {
        id: 101,
        invoiceNumber: '20261024-0015',
        createdAt: '2026-10-24T10:30:00Z',
      },
      cashierName: 'Jane Mwangi',
      taxAmount: 160.00,
      taxRate: 16,
      taxInclusive: true,
      items: [
        { name: 'Maize Flour 2kg', price: 150, quantity: 2 },
        { name: 'Cooking Oil 1L', price: 350, quantity: 2 },
      ],
      total: 1000,
      paymentMethod: 'cash',
      paymentAmount: 1000,
      change: 0,
    };

    const model = buildReceipt(sale, { business, receiptSettings: settings });

    expect(model.documentType).toBe('SALES_RECEIPT');
    expect(model.isDuplicate).toBe(false);
    expect(model.meta.receiptNumber).toBe('R-7A3K-000042');
    expect(model.meta.invoiceNumber).toBe('20261024-0015');
    expect(model.meta.pendingSync).toBe(false);
    expect(model.meta.cashierName).toBe('Jane Mwangi');
    expect(model.meta.dateTime).toBe('2026-10-24T10:30:00Z');

    expect(model.business.branch).toBe('Nairobi CBD Branch');
    expect(model.business.tagline).toBe('Better Products · Brighter Together');
    expect(model.business.showPoweredBy).toBe(true);
    expect(model.business.qrEnabled).toBe(true);
    expect(model.business.qrPayload).toBeNull();

    expect(model.totals.tax).toEqual({
      amount: 160.00,
      rate: 16,
      inclusive: true,
    });
    expect(model.totals.total).toBe(1000);
    expect(model.totals.subtotal).toBe(1000);
    expect(model.totals.discount).toBe(0);
  });

  test('buildReceipt with a legacy sale missing every new field', () => {
    const legacySale = {
      serverData: {
        id: 42,
        invoiceNumber: 'INV-2025-001',
        createdAt: '2025-06-15T14:20:00Z',
      },
      items: [{ name: 'Sugar 1kg', price: 180, quantity: 1 }],
      total: 180,
      paymentMethod: 'cash',
      paymentAmount: 200,
      change: 20,
    };

    const model = buildReceipt(legacySale);

    expect(model.documentType).toBe('SALES_RECEIPT');
    // receiptNumber falls back to invoiceNumber
    expect(model.meta.receiptNumber).toBe('INV-2025-001');
    expect(model.meta.invoiceNumber).toBe('INV-2025-001');
    expect(model.meta.cashierName).toBeNull();
    expect(model.meta.pendingSync).toBe(false);
    expect(model.business.branch).toBe('');
    expect(model.business.tagline).toBe('');
    expect(model.business.showPoweredBy).toBe(true);
    expect(model.business.qrEnabled).toBe(false);
    expect(model.totals.tax).toEqual({ amount: 0, rate: 0, inclusive: false });
  });

  test('buildReceipt with an offline sale', () => {
    const offlineSale = {
      receiptNumber: 'R-8X9L-000001',
      serverData: {
        id: 'offline-1729780000000',
        invoiceNumber: null,
      },
      isOffline: true,
      items: [{ name: 'Milk 500ml', price: 60, quantity: 1 }],
      total: 60,
      paymentMethod: 'cash',
      paymentAmount: 100,
      change: 40,
    };

    const model = buildReceipt(offlineSale);

    expect(model.meta.receiptNumber).toBe('R-8X9L-000001');
    expect(model.meta.invoiceNumber).toBeNull();
    expect(model.meta.pendingSync).toBe(true);
    expect(model.meta.isOffline).toBe(true);
  });

  test('buildReceipt with tax-inclusive sale', () => {
    const sale = {
      total: 1160,
      taxAmount: 160,
      taxRate: 16,
      taxInclusive: true,
      items: [{ name: 'Standard Rated Item', price: 1160, quantity: 1 }],
    };
    const model = buildReceipt(sale);
    expect(model.totals.tax).toEqual({ amount: 160, rate: 16, inclusive: true });
  });

  test('buildReceipt with tax-exclusive sale', () => {
    const sale = {
      total: 1160,
      taxAmount: 160,
      taxRate: 16,
      taxInclusive: false,
      items: [{ name: 'Item', price: 1000, quantity: 1 }],
    };
    const model = buildReceipt(sale);
    expect(model.totals.tax).toEqual({ amount: 160, rate: 16, inclusive: false });
  });

  test('buildReceipt with zero-tax sale', () => {
    const sale = {
      total: 500,
      taxAmount: 0,
      taxRate: 0,
      taxInclusive: false,
      items: [{ name: 'Zero-rated Bread', price: 500, quantity: 1 }],
    };
    const model = buildReceipt(sale);
    expect(model.totals.tax).toEqual({ amount: 0, rate: 0, inclusive: false });
  });

  test('buildReceipt with discounted sale', () => {
    const sale = {
      total: 850,
      items: [{ name: 'Shirt', price: 1000, quantity: 1 }],
    };
    const model = buildReceipt(sale);
    expect(model.totals.subtotal).toBe(1000);
    expect(model.totals.discount).toBe(150);
    expect(model.totals.total).toBe(850);
  });

  test('buildCreditNote produces credit note shape with negative amounts', () => {
    const returnRecord = {
      creditNoteNumber: 'CN-20261024-0001',
      originalInvoiceNumber: '20261024-0001',
      issuedAt: '2026-10-24T12:00:00Z',
      customer: { name: 'John Kamau' },
      cashierName: 'Supervisor Jane',
      reason: 'Damaged packaging',
      items: [
        { productName: 'Rice 5kg', quantity: 1, amount: 800 },
        { productName: 'Soap 1pc', quantity: 2, amount: 200 },
      ],
      totalRefundAmount: 1000,
      totalTaxRefunded: 137.93,
      paymentMethod: 'cash',
    };

    const cn = buildCreditNote(returnRecord, { business, receiptSettings: settings });

    expect(cn.documentType).toBe('CREDIT_NOTE');
    expect(cn.meta.receiptNumber).toBe('CN-20261024-0001');
    expect(cn.meta.invoiceNumber).toBe('CN-20261024-0001');
    expect(cn.meta.originalInvoiceNumber).toBe('20261024-0001');
    expect(cn.meta.cashierName).toBe('Supervisor Jane');
    expect(cn.meta.customerName).toBe('John Kamau');

    // All line amounts are negative
    expect(cn.lines).toHaveLength(2);
    expect(cn.lines[0]).toEqual({
      name: 'Rice 5kg',
      quantity: -1,
      unitPrice: -800,
      lineTotal: -800,
    });
    expect(cn.lines[1]).toEqual({
      name: 'Soap 1pc',
      quantity: -2,
      unitPrice: -100,
      lineTotal: -200,
    });

    // Totals are negative
    expect(cn.totals.total).toBe(-1000);
    expect(cn.totals.subtotal).toBe(-1000);
    expect(cn.totals.tax.amount).toBe(-137.93);
    expect(cn.notes).toBe('Damaged packaging');
  });

  test('Snapshot behaviour: changing global tax settings does not alter rebuilt stored sale', () => {
    const saleAt16Percent = {
      total: 1160,
      taxAmount: 160,
      taxRate: 16,
      taxInclusive: true,
      items: [{ name: 'Goods', price: 1160, quantity: 1 }],
    };

    // Initial build with 16% settings
    const r1 = buildReceipt(saleAt16Percent);
    expect(r1.totals.tax.rate).toBe(16);
    expect(r1.totals.tax.amount).toBe(160);

    // Later rebuild when shop tax settings have been raised to 18%
    const r2 = buildReceipt(saleAt16Percent, {
      receiptSettings: { ...settings, taxRate: 18 }
    });
    // The rebuilt receipt still reflects the 16% snapshotted tax!
    expect(r2.totals.tax.rate).toBe(16);
    expect(r2.totals.tax.amount).toBe(160);
  });

  test('receiptNumber fallback for legacy sales without receiptNumber', () => {
    const saleOnlyWithId = {
      serverData: { id: 777 },
      items: [],
      total: 0,
    };
    expect(buildReceipt(saleOnlyWithId).meta.receiptNumber).toBe('777');

    const saleWithInvoiceOnly = {
      serverData: { id: 777, invoiceNumber: '20260101-0005' },
      items: [],
      total: 0,
    };
    expect(buildReceipt(saleWithInvoiceOnly).meta.receiptNumber).toBe('20260101-0005');
  });

  describe('Business settings resolution and preservation across paths', () => {
    const sampleShop = {
      name: 'SokoSafi Main',
      branch: 'CBD Branch',
      address: 'Moi Avenue, Nairobi',
      phone: '0712345678',
      kraPin: 'P051234567X',
      tagline: 'Fresh Every Day',
    };

    it('Path (a): preserves store name, branch, address, phone, and KRA PIN from business option', () => {
      const sale = {
        serverData: { id: 101, invoiceNumber: 'INV-101' },
        items: [{ name: 'Item A', price: 100, quantity: 1 }],
        total: 100,
      };

      const receipt = buildReceipt(sale, { business: sampleShop });
      expect(receipt.business.name).toBe('SokoSafi Main');
      expect(receipt.business.branch).toBe('CBD Branch');
      expect(receipt.business.address).toBe('Moi Avenue, Nairobi');
      expect(receipt.business.phone).toBe('0712345678');
      expect(receipt.business.kraPin).toBe('P051234567X');
      expect(receipt.business.tagline).toBe('Fresh Every Day');
    });

    it('Path (b): offline sale retains business settings from completedSale.business when options.business is empty', () => {
      const offlineSale = {
        serverData: { id: 'offline-1793000000', invoiceNumber: null },
        items: [{ name: 'Item B', price: 200, quantity: 1 }],
        total: 200,
        isOffline: true,
        business: sampleShop,
      };

      const receipt = buildReceipt(offlineSale, { business: {} });
      expect(receipt.business.name).toBe('SokoSafi Main');
      expect(receipt.business.branch).toBe('CBD Branch');
      expect(receipt.business.address).toBe('Moi Avenue, Nairobi');
      expect(receipt.business.phone).toBe('0712345678');
      expect(receipt.business.kraPin).toBe('P051234567X');
    });

    it('Store name equals "Zana POS": store name is not suppressed and renders properly', () => {
      const sale = {
        serverData: { id: 102, invoiceNumber: 'INV-102' },
        items: [{ name: 'Item C', price: 50, quantity: 1 }],
        total: 50,
      };

      const receipt = buildReceipt(sale, {
        business: {
          name: 'Zana POS',
          branch: 'Downtown',
          address: 'Kenyatta Ave',
          phone: '0700000000',
          kraPin: 'P012345678Z',
        },
      });

      expect(receipt.business.name).toBe('Zana POS');
      const { renderReceiptHtml } = require('../htmlReceipt');
      const html = renderReceiptHtml(receipt, { widthMm: 80 });
      expect(html).toContain('class="store-name">ZANA POS</div>');
    });
  });
});
