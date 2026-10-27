import { buildReceipt } from '../receiptModel';
import { renderReceiptHtml } from '../htmlReceipt';
import { renderPlainText } from '../renderers';
import {
  getNextReceiptNumber,
  bumpAndGetNextReceiptNumber,
  bumpReceiptCounter,
} from '../../offline/offlineNumbering';

const formatMoney = (n) => `KSh ${Number(n || 0).toFixed(2)}`;

describe('CashierDashboard 409 collision retry - receipt number verification', () => {
  it('proves the receipt that is printed carries the post-retry receiptNumber, not the rejected one', async () => {
    const fakeStorage = () => {
      const store = {};
      return {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      };
    };

    const storage = fakeStorage();
    const options = { deviceId: 'RETR', storage };

    // 1. Initial attempt gets first receipt number
    const initialReceiptNumber = await getNextReceiptNumber(options);
    expect(initialReceiptNumber).toBe('R-RETR-000001');

    // 2. Simulated 409 collision from backend API:
    // When the server rejects R-RETR-000001 with 409 RECEIPT_NUMBER_ALREADY_EXISTS,
    // CashierDashboard invokes bumpAndGetNextReceiptNumber() to skip past collision.
    const postRetryReceiptNumber = await bumpAndGetNextReceiptNumber(options);
    expect(postRetryReceiptNumber).not.toBe(initialReceiptNumber);
    expect(postRetryReceiptNumber).toBe('R-RETR-000003'); // bumped + incremented

    // 3. Simulated retried POST succeeds; completedSale is snapshotted with postRetryReceiptNumber
    const completedSale = {
      serverData: {
        id: 999,
        invoiceNumber: 'INV-2026-0999',
        receiptNumber: postRetryReceiptNumber,
      },
      receiptNumber: postRetryReceiptNumber,
      invoiceNumber: 'INV-2026-0999',
      cashierName: 'Grace Hopper',
      items: [
        { id: 1, name: 'Sample Item', quantity: 2, price: 150, total: 300 },
      ],
      total: 300,
      paymentMethod: 'cash',
      paymentAmount: 500,
      change: 200,
    };

    const receipt = buildReceipt(completedSale, {
      business: { name: 'Zana Test Shop' },
    });

    // 4. Verify HTML rendered receipt
    const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });
    expect(html).toContain('Receipt No: R-RETR-000003');
    expect(html).not.toContain('R-RETR-000001');

    // 5. Verify plain text / ESC/POS rendered receipt
    const text = renderPlainText(receipt, { paperWidth: 80 }, formatMoney);
    expect(text).toContain('Receipt No: R-RETR-000003');
    expect(text).not.toContain('R-RETR-000001');
  });
});
