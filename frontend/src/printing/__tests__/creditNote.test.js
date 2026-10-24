import { buildCreditNote } from '../receiptModel';
import { renderReceiptHtml } from '../htmlReceipt';

describe('Credit Note / Sales Return Printing (Phase 6)', () => {
  const formatMoney = (n) => {
    const num = Number(n) || 0;
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    return `${sign}KSh ${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const mockShop = {
    name: 'Zana Westlands',
    branch: 'Westlands Branch',
    address: 'Ring Road, Nairobi',
    phone: '+254712345678',
    kraPin: 'P051234567X',
  };

  const sampleReturnRecord = {
    creditNoteNumber: 'CN-INV-2026-0042',
    originalInvoiceNumber: 'INV-2026-0042',
    saleId: 42,
    issuedAt: '2026-10-24T15:30:00.000Z',
    customer: { name: 'Peter Karanja' },
    refundMethod: 'cash',
    refundedBy: 'Jane Mwangi',
    reason: 'Damaged item packaging upon inspection',
    items: [
      {
        productName: 'Maize Flour 2kg',
        quantity: 2,
        price: 290,
        amount: 580,
        taxAmount: 80,
        disposition: 'restock',
      },
    ],
    totalRefundAmount: 580,
    totalTaxRefunded: 80,
    taxRate: 16,
    taxInclusive: true,
  };

  describe('Full refund', () => {
    it('builds credit note model with CREDIT_NOTE documentType, negative line totals, and duplicate flag on reprint', () => {
      const model = buildCreditNote(sampleReturnRecord, {
        business: mockShop,
        isDuplicate: true,
      });

      expect(model.documentType).toBe('CREDIT_NOTE');
      expect(model.isDuplicate).toBe(true);
      expect(model.meta.invoiceNumber).toBe('CN-INV-2026-0042');
      expect(model.meta.originalInvoiceNumber).toBe('INV-2026-0042');
      expect(model.meta.paymentLabel).toBe('Cash Refund');
      expect(model.meta.cashierName).toBe('Jane Mwangi');
      expect(model.notes).toBe('Damaged item packaging upon inspection');

      // Negative quantities, unit prices, and line totals
      expect(model.lines).toHaveLength(1);
      expect(model.lines[0].quantity).toBe(-2);
      expect(model.lines[0].unitPrice).toBe(-290);
      expect(model.lines[0].lineTotal).toBe(-580);

      // Negative total refund
      expect(model.totals.total).toBe(-580);
      expect(model.totals.subtotal).toBe(-580);
      expect(model.totals.change).toBeNull();
      expect(model.totals.tendered).toBeNull();
    });
  });

  describe('Partial refund', () => {
    it('correctly models returning 1 item from a multi-item purchase', () => {
      const partialReturn = {
        creditNoteNumber: 'CN-INV-2026-0099',
        originalInvoiceNumber: 'INV-2026-0099',
        saleId: 99,
        customer: { name: 'Mary Wanjiku' },
        refundMethod: 'mobile_money',
        items: [
          {
            productName: 'Sugar 1kg',
            quantity: 1,
            price: 165,
            amount: 165,
            disposition: 'damaged_writeoff',
          },
        ],
        totalRefundAmount: 165,
      };

      const model = buildCreditNote(partialReturn, { business: mockShop });

      expect(model.meta.originalInvoiceNumber).toBe('INV-2026-0099');
      expect(model.meta.paymentLabel).toBe('Mobile Money Refund');
      expect(model.lines[0].quantity).toBe(-1);
      expect(model.lines[0].lineTotal).toBe(-165);
      expect(model.totals.total).toBe(-165);
      expect(model.lines[0].note).toContain('Disposition: damaged_writeoff');
    });
  });

  describe('Tax refund', () => {
    it('captures negative tax refund and preserves taxRate and taxInclusive settings', () => {
      const taxReturn = {
        ...sampleReturnRecord,
        totalTaxRefunded: 92.80,
        taxRate: 16,
        taxInclusive: false,
      };

      const model = buildCreditNote(taxReturn, { business: mockShop });

      expect(model.totals.tax.amount).toBe(-92.80);
      expect(model.totals.tax.rate).toBe(16);
      expect(model.totals.tax.inclusive).toBe(false);

      const html = renderReceiptHtml(model, { widthMm: 80, formatMoney });
      expect(html).toContain('Tax (16%)');
      expect(html).toContain('-KSh 92.80');
    });

    it('falls back to summing item taxAmounts if totalTaxRefunded is not explicitly passed', () => {
      const itemTaxReturn = {
        ...sampleReturnRecord,
        totalTaxRefunded: null,
        taxRate: 16,
        items: [
          { productName: 'Item A', quantity: 1, price: 100, amount: 100, taxAmount: 16 },
          { productName: 'Item B', quantity: 1, price: 200, amount: 200, taxAmount: 32 },
        ],
      };

      const model = buildCreditNote(itemTaxReturn, { business: mockShop });
      expect(model.totals.tax.amount).toBe(-48);
    });
  });

  describe('Legacy return record', () => {
    it('handles legacy return without creditNoteNumber, shop metadata, or customer object', () => {
      const legacyReturn = {
        saleId: 105,
        sale: { invoiceNumber: 'INV-OLD-105' },
        amount: 350,
        // No creditNoteNumber, no customer, no shop, no refundMethod
        items: [
          { name: 'Cooking Oil 1L', quantity: 1, price: 350, amount: 350 },
        ],
      };

      const model = buildCreditNote(legacyReturn);

      expect(model.documentType).toBe('CREDIT_NOTE');
      expect(model.meta.invoiceNumber).toBe('CN-INV-OLD-105');
      expect(model.meta.originalInvoiceNumber).toBe('INV-OLD-105');
      expect(model.meta.customerName).toBe('Walk-in Customer');
      expect(model.meta.paymentLabel).toBe('Cash Refund');
      expect(model.totals.total).toBe(-350);
    });
  });

  describe('Roll layout rendering: 80mm vs 58mm', () => {
    it('renders 80mm credit note with 4-column table, CREDIT NOTE title, and negative refund total', () => {
      const model = buildCreditNote(sampleReturnRecord, {
        business: mockShop,
        isDuplicate: true,
      });

      const html80 = renderReceiptHtml(model, { widthMm: 80, formatMoney });

      // Title & duplicate badge
      expect(html80).toContain('class="doc-title">CREDIT NOTE</div>');
      expect(html80).toContain('class="duplicate-badge">DUPLICATE COPY</span>');

      // Original invoice & Reason in meta block
      expect(html80).toContain('Original Invoice:</span><span class="meta-val">#INV-2026-0042');
      expect(html80).toContain('Reason:</span><span class="meta-val">Damaged item packaging upon inspection');
      expect(html80).toContain('Payment:</span><span class="meta-val">Cash Refund');

      // 4-column table structure on 80mm
      expect(html80).toContain('<table class="items-table">');
      expect(html80).toContain('Maize Flour 2kg');
      expect(html80).toContain('-2');
      expect(html80).toContain('-KSh 290.00');
      expect(html80).toContain('-KSh 580.00');

      // Grand total refund row
      expect(html80).toContain('class="grand-total-label">TOTAL</span>');
      expect(html80).toContain('-KSh 580.00');
    });

    it('renders 58mm credit note with 2-line item layout and without table', () => {
      const model = buildCreditNote(sampleReturnRecord, {
        business: mockShop,
        isDuplicate: false,
      });

      const html58 = renderReceiptHtml(model, { widthMm: 58, formatMoney });

      expect(html58).toContain('width: 58mm');
      expect(html58).not.toContain('<table class="items-table">');
      expect(html58).toContain('class="items-list-58"');
      expect(html58).toContain('class="item-name-58">Maize Flour 2kg</div>');
      expect(html58).toContain('-2 &times; -KSh 290.00');
      expect(html58).toContain('-KSh 580.00');
    });
  });

  describe('No QR Code on Credit Notes', () => {
    it('never emits a QR payload or renders a QR code block on credit notes even if qrEnabled is true', () => {
      const model = buildCreditNote(sampleReturnRecord, {
        business: { ...mockShop, qrEnabled: true },
        receiptSettings: { qrEnabled: true },
        publicAppUrl: 'https://pos.zana.test',
      });

      expect(model.business.qrPayload).toBeNull();

      const html = renderReceiptHtml(model, { widthMm: 80, formatMoney });
      expect(html).not.toContain('class="qr-wrap"');
      expect(html).not.toContain('Scan to view receipt');
    });
  });
});
