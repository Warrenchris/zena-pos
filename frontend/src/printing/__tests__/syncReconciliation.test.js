import { saveSyncMapping, getServerInvoiceNumber } from '../../offline/syncMappings';
import { printStoredSale } from '../printStoredSale';

describe('Sync Reconciliation & Offline Reprint (Fix 8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('saves and retrieves receiptNumber -> serverInvoiceNumber mapping', async () => {
    const receiptNum = 'R-4K9Q-000001';
    const serverInvNum = '20261024-0005';

    expect(await getServerInvoiceNumber(receiptNum)).toBeNull();

    await saveSyncMapping(receiptNum, serverInvNum);

    const retrieved = await getServerInvoiceNumber(receiptNum);
    expect(retrieved).toBe(serverInvNum);
  });

  test('printStoredSale prefers mapped server invoice number over null/pending on reprint', async () => {
    const receiptNum = 'R-8A1Z-000003';
    const serverInvNum = '20261024-0012';

    // Stored sale that occurred offline
    const offlineSale = {
      id: 'offline-12345',
      receiptNumber: receiptNum,
      invoiceNumber: null,
      isOffline: true,
      items: [{ name: 'Bread', price: 65, quantity: 2 }],
      total: 130,
      paymentMethod: 'cash',
      paymentAmount: 150,
      change: 20
    };

    let printedReceiptData = null;
    const mockAdapter = {
      id: 'browser',
      isSupported: () => true,
      print: jest.fn(async (job) => {
        printedReceiptData = job.receipt;
        return { ok: true };
      })
    };

    const options = {
      profile: { connection: 'browser', paperWidth: 80 },
      adapters: { browser: mockAdapter }
    };

    // 1. Before sync: reprint shows pending invoice
    await printStoredSale(offlineSale, options);
    expect(printedReceiptData).not.toBeNull();
    expect(printedReceiptData.meta.invoiceNumber).toBeNull();
    expect(printedReceiptData.meta.receiptNumber).toBe(receiptNum);

    // 2. Offline sync succeeds and records mapping
    await saveSyncMapping(receiptNum, serverInvNum);

    // 3. After sync: reprint automatically resolves and displays the server invoice number
    await printStoredSale(offlineSale, options);
    expect(printedReceiptData.meta.invoiceNumber).toBe(serverInvNum);
    expect(printedReceiptData.meta.receiptNumber).toBe(receiptNum);
    expect(printedReceiptData.meta.isDuplicate).toBe(true);
  });
});
