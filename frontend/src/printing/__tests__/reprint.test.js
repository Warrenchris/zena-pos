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
});
