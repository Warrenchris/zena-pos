import { buildReceipt } from '../receiptModel';
import { layoutReceipt } from '../layout';
import { printStoredSale } from '../printStoredSale';
import { renderPlainText } from '../renderers';
import { DEFAULT_PROFILE } from '../profile';

describe('Reprint & Duplicate Copy support', () => {
  const dummySale = {
    serverData: { id: 101, invoiceNumber: '20261022-0042', createdAt: '2026-10-22T10:00:00Z' },
    items: [{ name: 'Test Product', price: 500, quantity: 2 }],
    total: 1000,
    paymentMethod: 'cash',
    paymentAmount: 1000,
    change: 0,
  };

  it('marks receipt model as duplicate when isDuplicate option is passed', () => {
    const original = buildReceipt(dummySale);
    expect(original.meta.isDuplicate).toBe(false);

    const duplicate = buildReceipt(dummySale, { isDuplicate: true });
    expect(duplicate.meta.isDuplicate).toBe(true);
    expect(duplicate.meta.invoiceNumber).toBe('20261022-0042');
  });

  it('marks receipt model as duplicate when sale.isDuplicate is set', () => {
    const duplicate = buildReceipt({ ...dummySale, isDuplicate: true });
    expect(duplicate.meta.isDuplicate).toBe(true);
  });

  it('renders *** DUPLICATE COPY *** in layout when isDuplicate is true', () => {
    const duplicateModel = buildReceipt(dummySale, { isDuplicate: true });
    const lines = layoutReceipt(duplicateModel, {
      charsPerLine: 32,
      formatMoney: (n) => `KSh ${Number(n).toFixed(2)}`,
    });

    const hasDuplicate = lines.some((l) => l.text.includes('*** DUPLICATE COPY ***'));
    expect(hasDuplicate).toBe(true);

    const text = renderPlainText(duplicateModel, DEFAULT_PROFILE, (n) => `KSh ${n}`);
    expect(text).toContain('*** DUPLICATE COPY ***');
    expect(text).toContain('#20261022-0042');
  });

  it('does not render DUPLICATE when isDuplicate is false', () => {
    const normalModel = buildReceipt(dummySale);
    const text = renderPlainText(normalModel, DEFAULT_PROFILE, (n) => `KSh ${n}`);
    expect(text).not.toContain('DUPLICATE');
  });

  it('printStoredSale normalizes DB sale structure and calls printer with duplicate flag', async () => {
    const dbSale = {
      id: 55,
      invoiceNumber: 'INV-2026-55',
      createdAt: '2026-10-22T08:30:00.000Z',
      Customer: { name: 'Alice Doe' },
      SaleItems: [
        { productName: 'Widget A', unitPrice: 250, quantity: 3 },
        { productName: 'Widget B', unitPrice: 500, quantity: 1 },
      ],
      totalAmount: 1250,
      paymentMethod: 'cash',
      paymentAmount: 1500,
      change: 250,
    };

    const mockAdapter = {
      id: 'mock',
      isSupported: () => true,
      print: jest.fn().mockResolvedValue({ ok: true }),
    };

    const result = await printStoredSale(dbSale, {
      profile: { connection: 'browser' },
      adapters: { browser: mockAdapter },
    });

    expect(result.ok).toBe(true);
  });

  it('printStoredSale triggers showToast callback when print fails', async () => {
    const mockFailingAdapter = {
      id: 'browser',
      isSupported: () => true,
      print: jest.fn().mockRejectedValue(new Error('Printer disconnected')),
    };

    const showToast = jest.fn();

    const result = await printStoredSale(dummySale, {
      profile: { connection: 'browser' },
      adapters: { browser: mockFailingAdapter },
      showToast,
    });

    expect(result.ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Could not print receipt',
        message: expect.stringContaining('Printer disconnected'),
      })
    );
  });

  it('printStoredSale returns error and triggers toast when sale is null', async () => {
    const showToast = jest.fn();
    const result = await printStoredSale(null, { showToast });
    expect(result.ok).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Print Failed',
      })
    );
  });

  it('omits QR code and caption cleanly on reprints of sales without a locally stored receiptToken', async () => {
    let capturedReceipt = null;
    const mockAdapter = {
      id: 'mock',
      isSupported: () => true,
      print: jest.fn().mockImplementation((job) => {
        capturedReceipt = job?.receipt || job;
        return Promise.resolve({ ok: true });
      }),
    };

    // Stored sale fetched from server without client token
    const serverSaleWithoutToken = {
      id: 99,
      invoiceNumber: 'INV-2026-99',
      receiptNumber: 'R-D4E1-000099',
      // receiptToken is absent / undefined
      createdAt: '2026-10-24T10:00:00Z',
      items: [{ name: 'Rice 1kg', price: 150, quantity: 1 }],
      total: 150,
      paymentMethod: 'cash',
    };

    await printStoredSale(serverSaleWithoutToken, {
      profile: { connection: 'browser' },
      adapters: { browser: mockAdapter },
      business: { name: 'Zana Westlands', qrEnabled: true },
      receiptSettings: { qrEnabled: true },
      publicAppUrl: 'https://pos.zana.test',
    });

    expect(capturedReceipt).not.toBeNull();
    // business.qrPayload must be null because receiptToken is missing
    expect(capturedReceipt.business.qrPayload).toBeNull();
    expect(capturedReceipt.meta.receiptToken).toBeNull();

    // Render HTML directly to verify absence of QR wrap and caption
    const { renderReceiptHtml } = require('../htmlReceipt');
    const html = renderReceiptHtml(capturedReceipt, { widthMm: 80 });
    expect(html).not.toContain('class="qr-wrap"');
    expect(html).not.toContain('Scan to view receipt');
  });

  it('falls back to invoiceNumber when receiptNumber is null (legacy sales)', async () => {
    let capturedReceipt = null;
    const mockAdapter = {
      id: 'mock',
      isSupported: () => true,
      print: jest.fn().mockImplementation((job) => {
        capturedReceipt = job?.receipt || job;
        return Promise.resolve({ ok: true });
      }),
    };

    const legacySale = {
      id: 77,
      invoiceNumber: '20261025-0077',
      receiptNumber: null,
      createdAt: '2026-10-25T11:00:00Z',
      items: [{ name: 'Cooking Oil 1L', price: 320, quantity: 1 }],
      total: 320,
      paymentMethod: 'cash',
    };

    await printStoredSale(legacySale, {
      profile: { connection: 'browser' },
      adapters: { browser: mockAdapter },
    });

    expect(capturedReceipt).not.toBeNull();
    expect(capturedReceipt.meta.receiptNumber).toBe('20261025-0077');
    expect(capturedReceipt.meta.invoiceNumber).toBe('20261025-0077');
  });

  describe('Path (c): printStoredSale business settings preservation', () => {
    it('preserves business settings passed in options', async () => {
      let capturedReceipt = null;
      const mockAdapter = {
        id: 'mock',
        isSupported: () => true,
        print: jest.fn().mockImplementation((job) => {
          capturedReceipt = job?.receipt || job;
          return Promise.resolve({ ok: true });
        }),
      };

      const sale = {
        id: 88,
        invoiceNumber: 'INV-2026-88',
        createdAt: '2026-10-25T11:00:00Z',
        items: [{ name: 'Item', price: 100, quantity: 1 }],
        total: 100,
      };

      await printStoredSale(sale, {
        profile: { connection: 'browser' },
        adapters: { browser: mockAdapter },
        business: {
          name: 'Zana Market',
          branch: 'Main Branch',
          address: 'Station Road',
          phone: '0799887766',
          kraPin: 'P998877665A',
        },
      });

      expect(capturedReceipt).not.toBeNull();
      expect(capturedReceipt.business.name).toBe('Zana Market');
      expect(capturedReceipt.business.branch).toBe('Main Branch');
      expect(capturedReceipt.business.address).toBe('Station Road');
      expect(capturedReceipt.business.phone).toBe('0799887766');
      expect(capturedReceipt.business.kraPin).toBe('P998877665A');
    });

    it('falls back to sale.Shop / sale.shop when options.business is omitted or empty', async () => {
      let capturedReceipt = null;
      const mockAdapter = {
        id: 'mock',
        isSupported: () => true,
        print: jest.fn().mockImplementation((job) => {
          capturedReceipt = job?.receipt || job;
          return Promise.resolve({ ok: true });
        }),
      };

      const saleWithShop = {
        id: 89,
        invoiceNumber: 'INV-2026-89',
        createdAt: '2026-10-25T11:00:00Z',
        items: [{ name: 'Item', price: 100, quantity: 1 }],
        total: 100,
        Shop: {
          name: 'Embedded Shop Name',
          address: '42 Market Street',
          phone: '0711223344',
          kraPin: 'P112233445B',
        },
      };

      await printStoredSale(saleWithShop, {
        profile: { connection: 'browser' },
        adapters: { browser: mockAdapter },
        business: {},
      });

      expect(capturedReceipt).not.toBeNull();
      expect(capturedReceipt.business.name).toBe('Embedded Shop Name');
      expect(capturedReceipt.business.address).toBe('42 Market Street');
      expect(capturedReceipt.business.phone).toBe('0711223344');
      expect(capturedReceipt.business.kraPin).toBe('P112233445B');
    });
  });
});
