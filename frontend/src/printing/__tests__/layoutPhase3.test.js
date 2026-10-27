import { buildReceipt, buildCreditNote } from '../receiptModel';
import { layoutReceipt } from '../layout';
import { renderPlainText, renderHtml, renderEscPos } from '../renderers';

const formatMoney = (n) => {
  const num = Number(n);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num).toFixed(2);
  const parts = abs.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}KSh ${parts.join('.')}`;
};

describe('Phase 3 — Receipt Layout Redesign (layout.js)', () => {
  const business = {
    name: 'Soko Safi Supermarket',
    branch: 'Westlands, Nairobi',
    phone: '0712 345 678',
    kraPin: 'P051234567X',
    tagline: 'Better Products · Brighter Together',
    showPoweredBy: true,
    qrEnabled: true,
  };

  const sampleSale = {
    receiptNumber: 'R-7A3K-000042',
    serverData: {
      id: 101,
      invoiceNumber: '20261022-0015',
      createdAt: '2026-10-22T13:06:00Z',
    },
    cashierName: 'Jane Mwangi',
    customer: { name: 'Jian Laok' },
    paymentMethod: 'cash',
    paymentAmount: 6000,
    change: 400,
    taxAmount: 772.41,
    taxRate: 16,
    taxInclusive: true,
    items: [
      { name: 'Prestige Margarine 500g', price: 290, quantity: 3 },
      { name: 'Fresh Fri Cooking Oil 1L', price: 340, quantity: 3 },
      { name: 'Omo Multipurpose Washing Powder 1kg', price: 320, quantity: 3 },
    ],
    total: 2850,
  };

  test('80mm layout (48 columns) matches target receipt design', () => {
    const receipt = buildReceipt(sampleSale, { business });
    const profile = { paperWidth: 80 };
    const text = renderPlainText(receipt, profile, formatMoney);
    const lines = text.split('\n').filter((l) => l.length > 0);

    // 1. Column limits
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(48);
    });

    // 2. Header elements
    expect(text).toContain('ZANA POS');
    expect(text).toContain('SOKO SAFI SUPERMARKET');
    expect(text).toContain('WESTLANDS, NAIROBI');
    expect(text).toContain('Tel: 0712 345 678 | PIN: P051234567X');

    // 3. Title
    expect(text).toContain('SALES RECEIPT');

    // 4. Meta block
    expect(text).toContain('Invoice: #20261022-0015');
    expect(text).toContain('Date: 2026-10-22 16:06'); // Nairobi UTC+3
    expect(text).toContain('Cashier: Jane Mwangi');
    expect(text).toContain('Customer: Jian Laok');
    expect(text).toContain('Payment: Cash');

    // 5. 80mm table header
    expect(text).toContain('ITEM                     QTY UNIT PRICE    TOTAL');

    // 6. Item lines with right-aligned unit price & total, and sub-line
    expect(text).toContain('Prestige Margarine 500g    3     290.00   870.00');
    expect(text).toContain('  3 x KSh 290.00');
    expect(text).toContain('Fresh Fri Cooking Oil 1L   3     340.00 1,020.00');
    expect(text).toContain('  3 x KSh 340.00');
    expect(text).toContain('Omo Multipurpose Washing   3     320.00   960.00');
    expect(text).toContain('Powder 1kg');
    expect(text).toContain('  3 x KSh 320.00');

    // 7. Totals
    expect(text).toContain('Subtotal                            KSh 2,850.00');
    expect(text).toContain('Tax (16% incl.)                       KSh 772.41');
    expect(text).toContain('TOTAL       KSh 2,850.00');
    expect(text).toContain('Amount Received                     KSh 6,000.00');
    expect(text).toContain('Change Due                            KSh 400.00');

    // 8. Footer
    expect(text).toContain('Thank you for your business!');
    expect(text).toContain('Better Products');
    expect(text).toContain('Brighter Together');
    expect(text).toContain('Receipt No: R-7A3K-000042');
    expect(text).toContain('Powered by Zana POS');
    expect(text).not.toContain('[ QR CODE ]');
  });

  test('58mm layout (32 columns) wraps cleanly and never overflows', () => {
    const receipt = buildReceipt(sampleSale, { business });
    const profile = { paperWidth: 58 };
    const text = renderPlainText(receipt, profile, formatMoney);
    const lines = text.split('\n').filter((l) => l.length > 0);

    // 1. Column limits: strictly <= 32 cols
    lines.forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(32);
    });

    // 2. Header
    expect(text).toContain('ZANA POS');
    expect(text).toContain('SOKO SAFI');
    expect(text).toContain('SUPERMARKET');
    expect(text).toContain('WESTLANDS, NAIROBI');
    // On 32 columns, Tel and PIN exceed 32 chars so they wrap onto separate lines
    expect(text).toContain('Tel: 0712 345 678');
    expect(text).toContain('PIN: P051234567X');

    // 3. Title & Meta
    expect(text).toContain('SALES RECEIPT');
    expect(text).toContain('Invoice: #20261022-0015');

    // 4. 58mm table: 2-line layout per item (no 4-col header)
    expect(text).not.toContain('UNIT PRICE');
    expect(text).toContain('Prestige Margarine 500g');
    expect(text).toContain('  3 x 290.00          KSh 870.00');

    // 5. Totals
    expect(text).toContain('Subtotal            KSh 2,850.00');
    expect(text).toContain('Tax (16% incl.)       KSh 772.41');
    expect(text).toContain('Amount Received     KSh 6,000.00');
    expect(text).toContain('Change Due            KSh 400.00');

    // 6. Footer
    expect(text).toContain('Thank you for your business!');
    expect(text).toContain('Better Products');
    expect(text).toContain('Brighter');
    expect(text).toContain('Together');
    expect(text).toContain('Receipt No: R-7A3K-000042');
    expect(text).toContain('Powered by Zana POS');
  });

  test('Status banner appears when pendingSync or offline', () => {
    const offlineSale = {
      receiptNumber: 'R-7A3K-000099',
      isOffline: true,
      pendingSync: true,
      items: [{ name: 'Bread', price: 60, quantity: 1 }],
      total: 60,
    };
    const receipt = buildReceipt(offlineSale, { business });
    const text80 = renderPlainText(receipt, { paperWidth: 80 }, formatMoney);
    const text58 = renderPlainText(receipt, { paperWidth: 58 }, formatMoney);

    // 80mm banner
    expect(text80).toContain('+----------------------------------------------+');
    expect(text80).toContain('|         OFFLINE SALE * PENDING SYNC          |');
    expect(text80).toContain('Invoice: Pending');

    // 58mm banner
    expect(text58).toContain('+------------------------------+');
    expect(text58).toContain('| OFFLINE SALE * PENDING SYNC  |');
    expect(text58).toContain('Invoice: Pending');
  });

  test('Duplicate copy renders *** DUPLICATE COPY *** underneath title', () => {
    const receipt = buildReceipt(sampleSale, { business, isDuplicate: true });
    const text = renderPlainText(receipt, { paperWidth: 80 }, formatMoney);
    const lines = text.split('\n');

    const titleIdx = lines.findIndex((l) => l.includes('SALES RECEIPT'));
    const dupIdx = lines.findIndex((l) => l.includes('*** DUPLICATE COPY ***'));

    expect(titleIdx).toBeGreaterThan(-1);
    expect(dupIdx).toBe(titleIdx + 1);
  });

  test('Credit Note renders CREDIT NOTE, original invoice, and negative amounts', () => {
    const returnRecord = {
      creditNoteNumber: 'CN-20261022-0001',
      originalInvoiceNumber: '20261022-0015',
      issuedAt: '2026-10-22T14:00:00Z',
      customer: { name: 'Jian Laok' },
      cashierName: 'Supervisor Mark',
      reason: 'Damaged item packaging',
      items: [
        { productName: 'Fresh Fri Cooking Oil 1L', quantity: 1, amount: 340 },
      ],
      totalRefundAmount: 340,
      totalTaxRefunded: 46.90,
      paymentMethod: 'cash',
    };

    const cn = buildCreditNote(returnRecord, { business });
    const text = renderPlainText(cn, { paperWidth: 80 }, formatMoney);

    // Title
    expect(text).toContain('CREDIT NOTE');
    expect(text).not.toContain('SALES RECEIPT');

    // Meta
    expect(text).toContain('Invoice: #CN-20261022-0001');
    expect(text).toContain('Original Invoice: #20261022-0015');
    expect(text).toContain('Reason: Damaged item packaging');

    // Negative amounts
    expect(text).toContain('  -1    -340.00  -340.00');
    expect(text).toContain('Subtotal                             -KSh 340.00');
    expect(text).toContain('Tax                                   -KSh 46.90');
    expect(text).toContain('TOTAL        -KSh 340.00');
  });

  test('Tax exclusive breakdown formatting', () => {
    const exclusiveTaxSale = {
      ...sampleSale,
      taxInclusive: false,
      taxAmount: 456,
      taxRate: 16,
    };
    const receipt = buildReceipt(exclusiveTaxSale, { business });
    const text = renderPlainText(receipt, { paperWidth: 80 }, formatMoney);

    expect(text).toContain('Tax (16%)                             KSh 456.00');
  });

  test('Zero tax sale omits tax line', () => {
    const zeroTaxSale = {
      ...sampleSale,
      taxAmount: 0,
      taxRate: 0,
    };
    const receipt = buildReceipt(zeroTaxSale, { business });
    const text = renderPlainText(receipt, { paperWidth: 80 }, formatMoney);

    expect(text).not.toContain('Tax');
  });

  test('showPoweredBy = false hides ZANA POS wordmark and footer', () => {
    const whiteLabelBusiness = {
      ...business,
      showPoweredBy: false,
    };
    const receipt = buildReceipt(sampleSale, { business: whiteLabelBusiness });
    const text = renderPlainText(receipt, { paperWidth: 80 }, formatMoney);

    expect(text).not.toContain('ZANA POS');
    expect(text).not.toContain('Powered by Zana POS');
  });

  test('renderHtml produces styled markup using the dedicated HTML receipt renderer', () => {
    const receipt = buildReceipt(sampleSale, { business });
    const html = renderHtml(receipt, { paperWidth: 80 }, formatMoney);

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('ZANA POS');
    expect(html).toContain('SOKO SAFI SUPERMARKET');
    expect(html).toContain('TOTAL');
    expect(html).toContain('KSh 2,850.00');
    expect(html).toContain('-webkit-print-color-adjust: exact');
  });

  test('renderEscPos builds ASCII bytes from the exact same layout structure', () => {
    const receipt = buildReceipt(sampleSale, { business });
    const bytes = Array.from(renderEscPos(receipt, { paperWidth: 80 }, formatMoney));

    // Verify valid ESC/POS byte sequence
    expect(bytes[0]).toBe(0x1b); // ESC
    expect(bytes[1]).toBe(0x40); // @ (init)
    expect(bytes[bytes.length - 3]).toBe(0x1d); // GS
    expect(bytes[bytes.length - 2]).toBe(0x56); // V (cut)

    // All emitted bytes are valid printable ASCII or printer control codes (< 0x80)
    bytes.forEach((b) => {
      expect(b).toBeLessThan(0x80);
    });
  });
});
