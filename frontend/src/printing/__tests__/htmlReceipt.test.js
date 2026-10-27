import { renderReceiptHtml, escapeHtml } from '../htmlReceipt';
import { buildReceipt } from '../receiptModel';

const formatMoney = (n) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}KSh ${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fullSaleData = {
  id: 101,
  receiptNumber: 'R-D4E1-000042',
  invoiceNumber: 'INV-2026-0042',
  createdAt: '2026-10-24T14:30:00.000Z',
  cashierName: 'Jane Mwangi',
  customer: { name: 'Peter Karanja' },
  paymentMethod: 'cash',
  paymentAmount: 2000,
  change: 150,
  taxRate: 16,
  taxInclusive: true,
  taxAmount: 255.17,
  subtotal: 1850,
  discount: 50,
  total: 1850,
  notes: 'Customer requested quick packaging',
  items: [
    { id: 1, name: 'Maize Flour 2kg', quantity: 3, price: 290, total: 870 },
    { id: 2, name: 'Cooking Oil 1L', quantity: 2, price: 350, total: 700 },
    { id: 3, name: 'Sugar 1kg', quantity: 2, price: 165, total: 330, discount: 50 },
  ],
};

const fullBusiness = {
  name: 'Zana Supermarket',
  branch: 'Westlands Branch',
  address: 'Ring Road Parklands',
  phone: '0712 345 678',
  kraPin: 'P051234567X',
  tagline: 'Better Products · Brighter Together',
  showPoweredBy: true,
  logoUrl: 'https://cdn.zana.test/logo.png',
};

describe('htmlReceipt - renderReceiptHtml', () => {
  describe('Full sale rendering', () => {
    it('renders a complete 80mm sales receipt with all fields populated', () => {
      const receipt = buildReceipt(fullSaleData, {
        business: fullBusiness,
        receiptSettings: {
          showLogo: true,
          logoUrl: fullBusiness.logoUrl,
          header: 'Karibu Zana!\nOpen Mon-Sun 8am-9pm',
          footer: 'Goods once sold cannot be returned without receipt.',
        },
      });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      // Page size and light theme
      expect(html).toContain('size: 80mm auto');
      expect(html).toContain('color-scheme: light');
      expect(html).toContain('width: 80mm');

      // Header branding
      expect(html).toContain('class="header-wordmark">ZANA POS</span>');
      expect(html).toContain('src="https://cdn.zana.test/logo.png"');
      expect(html).toContain('ZANA SUPERMARKET');
      expect(html).toContain('Westlands Branch');
      expect(html).toContain('Ring Road Parklands');
      expect(html).toContain('Tel: 0712 345 678 | PIN: P051234567X');
      expect(html).toContain('Karibu Zana!');
      expect(html).toContain('Open Mon-Sun 8am-9pm');

      // Title & duplicate
      expect(html).toContain('SALES RECEIPT');
      expect(html).not.toContain('*** DUPLICATE COPY ***');

      // Meta block
      expect(html).toContain('Invoice:</span><span class="meta-val">#INV-2026-0042');
      expect(html).toContain('Cashier:</span><span class="meta-val">Jane Mwangi');
      expect(html).toContain('Customer:</span><span class="meta-val">Peter Karanja');
      expect(html).toContain('Payment:</span><span class="meta-val">Cash');

      // 80mm 4-column Table
      expect(html).toContain('<table class="items-table">');
      expect(html).toContain('<th class="col-item">ITEM</th>');
      expect(html).toContain('Maize Flour 2kg');
      expect(html).toContain('3 &times; KSh 290.00');
      expect(html).toContain('Cooking Oil 1L');
      expect(html).toContain('2 &times; KSh 350.00');

      // Totals
      expect(html).toContain('Subtotal</span>');
      expect(html).toContain('Discount</span>');
      expect(html).toContain('Tax (16% incl.)');
      expect(html).toContain('TOTAL</span>');
      expect(html).toContain('KSh 1,850.00');
      expect(html).toContain('Amount Received');
      expect(html).toContain('KSh 2,000.00');
      expect(html).toContain('Change Due');
      expect(html).toContain('KSh 150.00');

      // Notes
      expect(html).toContain('Customer requested quick packaging');

      // Footer
      expect(html).toContain('class="thank-you-row"');
      expect(html).toContain('class="thank-you-rule"');
      expect(html).toContain('Goods once sold cannot be returned without receipt.');
      expect(html).toContain('Better Products · Brighter Together');
      expect(html).toContain('Receipt No: R-D4E1-000042');
      expect(html).toContain('Powered by Zana POS');
    });

    it('renders a complete 58mm sales receipt with 2-line layout', () => {
      const receipt = buildReceipt(fullSaleData, { business: fullBusiness });
      const html = renderReceiptHtml(receipt, { widthMm: 58, formatMoney });

      expect(html).toContain('size: 58mm auto');
      expect(html).toContain('width: 58mm');
      expect(html).not.toContain('<table class="items-table">');
      expect(html).toContain('class="items-list-58"');
      expect(html).toContain('class="item-name-58">Maize Flour 2kg</div>');
      expect(html).toContain('3 &times; KSh 290.00');
      expect(html).toContain('KSh 870.00');

      // 58mm footer: receipt number is rendered on its own full-width line with nowrap style to prevent line splitting
      expect(html).toContain('class="receipt-no receipt-no-full"');
      expect(html).toMatch(/class="receipt-no receipt-no-full"[^>]*white-space:\s*nowrap/);
      expect(html).toContain('Receipt No: R-D4E1-000042');
    });
  });

  describe('Legacy sale rendering', () => {
    it('falls back to invoiceNumber when receiptNumber is missing and handles missing cashier/customer', () => {
      const legacySale = {
        invoiceNumber: 'INV-OLD-9999',
        createdAt: '2025-01-10T10:00:00.000Z',
        total: 500,
        items: [{ id: 1, name: 'Item A', quantity: 1, price: 500, total: 500 }],
        paymentMethod: 'cash',
        // cashierName missing, customer missing, receiptNumber missing
      };
      const receipt = buildReceipt(legacySale, { business: { name: 'Old Store' } });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      // Invoice in meta
      expect(html).toContain('#INV-OLD-9999');
      // Missing cashier and customer rows are not rendered
      expect(html).not.toContain('Cashier:');
      expect(html).not.toContain('Customer:');
      // Footer receipt number falls back cleanly to invoiceNumber
      expect(html).toContain('Receipt No: INV-OLD-9999');
    });
  });

  describe('Offline sale', () => {
    it('shows offline status banner with inline SVG and Invoice: Pending', () => {
      const offlineSale = {
        receiptNumber: 'R-77A1-000005',
        invoiceNumber: null,
        createdAt: '2026-10-24T12:00:00.000Z',
        isOffline: true,
        pendingSync: true,
        total: 300,
        items: [{ id: 1, name: 'Bread', quantity: 1, price: 300, total: 300 }],
      };
      const receipt = buildReceipt(offlineSale, { business: { name: 'Corner Kiosk' } });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).toContain('Invoice:</span><span class="meta-val">Pending');
      expect(html).not.toContain('#Pending');
      expect(html).toContain('class="offline-banner"');
      expect(html).toContain('OFFLINE SALE &middot; PENDING SYNC');
      expect(html).toContain('<svg class="offline-icon"');
      expect(html).toContain('Receipt No: R-77A1-000005');
    });
  });

  describe('Duplicate copy', () => {
    it('shows DUPLICATE COPY badge without asterisks when marked as duplicate', () => {
      const receipt = buildReceipt(fullSaleData, { business: fullBusiness });
      receipt.isDuplicate = true;
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).toContain('class="duplicate-badge">DUPLICATE COPY</span>');
      expect(html).not.toContain('*** DUPLICATE COPY ***');
      expect(html).toContain('SALES RECEIPT');
    });

    it('does not show duplicate badge when not duplicate', () => {
      const receipt = buildReceipt(fullSaleData, { business: fullBusiness });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).not.toContain('DUPLICATE COPY');
    });
  });

  describe('Credit note', () => {
    it('renders CREDIT NOTE title, original invoice, reason, and negative refund totals', () => {
      const creditNoteReceipt = {
        documentType: 'CREDIT_NOTE',
        business: fullBusiness,
        meta: {
          receiptNumber: 'R-D4E1-000088',
          invoiceNumber: 'CN-2026-0001',
          originalInvoiceNumber: 'INV-2026-0042',
          dateTime: '2026-10-24T16:00:00.000Z',
          cashierName: 'Jane Mwangi',
          paymentLabel: 'Cash Refund',
        },
        lines: [
          { name: 'Maize Flour 2kg (Returned)', quantity: -1, unitPrice: 290, lineTotal: -290 },
        ],
        totals: {
          subtotal: -290,
          total: -290,
          tendered: null,
          change: null,
        },
        notes: 'Damaged packaging upon opening',
      };

      const html = renderReceiptHtml(creditNoteReceipt, { widthMm: 80, formatMoney });

      expect(html).toContain('class="doc-title">CREDIT NOTE</div>');
      expect(html).toContain('Original Invoice:</span><span class="meta-val">#INV-2026-0042');
      expect(html).toContain('Reason:</span><span class="meta-val">Damaged packaging upon opening');
      expect(html).toContain('-KSh 290.00');
      // Credit note reason is in meta, not repeated as bottom notes block
      expect(html).not.toContain('class="general-notes"');
    });
  });

  describe('58mm vs 80mm column layouts', () => {
    it('uses 4-column table on 80mm and 2-line layout on 58mm', () => {
      const receipt = buildReceipt(fullSaleData, { business: fullBusiness });

      const html80 = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });
      expect(html80).toContain('<table class="items-table">');
      expect(html80).toContain('<th class="col-item">ITEM</th>');
      expect(html80).toContain('<th class="col-qty">QTY</th>');
      expect(html80).toContain('<th class="col-price">UNIT PRICE</th>');
      expect(html80).toContain('<th class="col-total">TOTAL</th>');
      expect(html80).not.toContain('class="items-list-58"');

      const html58 = renderReceiptHtml(receipt, { widthMm: 58, formatMoney });
      expect(html58).not.toContain('<table class="items-table">');
      expect(html58).toContain('<div class="items-list-58">');
      expect(html58).toContain('<div class="item-block-58">');
      expect(html58).toContain('<div class="item-row-58">');
    });
  });

  describe('Long product names', () => {
    it('wraps gracefully with table-layout: fixed without breaking table structure', () => {
      const longName = 'Extra_Super_Long_Product_Name_Without_Any_Spaces_That_Could_Cause_Overflow_Issues_In_Thermal_Receipt_Layouts_1234567890';
      const sale = {
        ...fullSaleData,
        items: [{ id: 1, name: longName, quantity: 1, price: 100, total: 100 }],
      };
      const receipt = buildReceipt(sale, { business: fullBusiness });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).toContain('table-layout: fixed');
      expect(html).toContain('word-break: break-word');
      expect(html).toContain(longName);
    });
  });

  describe('100 items rendering performance', () => {
    it('renders 100 items without errors and with complete line item output', () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Grocery Item #${i + 1}`,
        quantity: 1,
        price: 10 + i,
        total: 10 + i,
      }));
      const largeSale = {
        ...fullSaleData,
        items,
        total: items.reduce((acc, it) => acc + it.total, 0),
      };
      const receipt = buildReceipt(largeSale, { business: fullBusiness });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      // Verify all 100 item rows were rendered into the table
      const rowMatches = html.match(/class="item-name">Grocery Item #\d+<\/div>/g) || [];
      expect(rowMatches).toHaveLength(100);
      expect(html).toContain('Grocery Item #1');
      expect(html).toContain('Grocery Item #50');
      expect(html).toContain('Grocery Item #100');
    });
  });

  describe('No customer / Walk-in Customer', () => {
    it('omits customer row when customer is null, empty or Walk-in Customer', () => {
      const saleWalkIn = {
        ...fullSaleData,
        customer: { name: 'Walk-in Customer' },
      };
      const r1 = buildReceipt(saleWalkIn, { business: fullBusiness });
      const html1 = renderReceiptHtml(r1, { widthMm: 80, formatMoney });
      expect(html1).not.toContain('Customer:');

      const saleNoCust = {
        ...fullSaleData,
        customer: null,
      };
      const r2 = buildReceipt(saleNoCust, { business: fullBusiness });
      const html2 = renderReceiptHtml(r2, { widthMm: 80, formatMoney });
      expect(html2).not.toContain('Customer:');
    });
  });

  describe('Tax-inclusive vs tax-exclusive', () => {
    it('displays "Tax (16% incl.)" when tax is inclusive', () => {
      const receipt = buildReceipt({
        ...fullSaleData,
        taxInclusive: true,
        taxRate: 16,
        taxAmount: 137.93,
        total: 1000,
      }, { business: fullBusiness });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });
      expect(html).toContain('Tax (16% incl.)');
    });

    it('displays "Tax (16%)" when tax is exclusive', () => {
      const receipt = buildReceipt({
        ...fullSaleData,
        taxInclusive: false,
        taxRate: 16,
        taxAmount: 160.00,
        total: 1160,
      }, { business: fullBusiness });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });
      expect(html).toContain('Tax (16%)');
      expect(html).not.toContain('Tax (16% incl.)');
    });

    it('omits tax row when taxAmount is zero or not set', () => {
      const receipt = buildReceipt({
        ...fullSaleData,
        taxAmount: 0,
        taxRate: 0,
      }, { business: fullBusiness });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });
      expect(html).not.toContain('Tax (');
    });
  });

  describe('showPoweredBy: false', () => {
    it('hides the header wordmark and footer powered-by line when false', () => {
      const receipt = buildReceipt(fullSaleData, {
        business: { ...fullBusiness, showPoweredBy: false },
      });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).not.toContain('class="header-wordmark"');
      expect(html).not.toContain('Powered by Zana POS');
    });

    it('shows header wordmark and footer powered-by line by default or when true', () => {
      const receipt = buildReceipt(fullSaleData, {
        business: { ...fullBusiness, showPoweredBy: true },
      });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).toContain('class="header-wordmark">ZANA POS</span>');
      expect(html).toContain('Powered by Zana POS');
    });
  });

  describe('XSS escaping', () => {
    it('escapes user input in item name, notes, customer name, business name, and branch', () => {
      const maliciousSale = {
        ...fullSaleData,
        customer: { name: '<script>alert("xss-customer")</script>' },
        notes: '<img src=x onerror=alert("xss-note")>',
        items: [
          {
            id: 1,
            name: '<script>alert("xss-item")</script>',
            quantity: 1,
            price: 10,
            total: 10,
          },
        ],
      };
      const maliciousBusiness = {
        ...fullBusiness,
        name: '<script>alert("xss-biz")</script>',
        branch: '<style>body{display:none}</style>',
      };

      const receipt = buildReceipt(maliciousSale, { business: maliciousBusiness });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss-customer&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(&quot;xss-note&quot;)&gt;');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss-item&quot;)&lt;/script&gt;');
      expect(html).toContain('&lt;SCRIPT&gt;ALERT(&quot;XSS-BIZ&quot;)&lt;/SCRIPT&gt;');
      expect(html).toContain('&lt;style&gt;body{display:none}&lt;/style&gt;');
    });
  });

  describe('Zero external URLs or fonts', () => {
    it('contains no external font links, scripts, stylesheets, or remote asset dependencies', () => {
      // With local or data URI logo
      const receipt = buildReceipt(fullSaleData, {
        business: fullBusiness,
        receiptSettings: { showLogo: true, logoUrl: '/uploads/logos/logo.png' },
      });
      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      // No external font stylesheets (Google fonts, Adobe fonts)
      expect(html).not.toMatch(/fonts\.googleapis\.com/i);
      expect(html).not.toMatch(/fonts\.gstatic\.com/i);
      // No external stylesheets or scripts
      expect(html).not.toMatch(/<link\b/i);
      expect(html).not.toMatch(/<script\b/i);
      // Only system fonts in CSS
      expect(html).toContain('system-ui');
    });
  });

  describe('Public Receipt QR Code (Phase 5)', () => {
    it('renders inline SVG QR code and caption when qrEnabled is true and qrPayload is present', () => {
      const receipt = buildReceipt({
        ...fullSaleData,
        receiptToken: 'aB3_dE9-gH1_jK2-mN3_pQ',
      }, {
        business: { ...fullBusiness, qrEnabled: true },
        publicAppUrl: 'https://pos.zana.test',
      });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).toContain('class="qr-wrap"');
      expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(html).toContain('shape-rendering="crispEdges"');
      expect(html).toContain('width="22mm"');
      expect(html).toContain('Scan to view receipt');
    });

    it('renders 18mm SVG QR code on 58mm paper', () => {
      const receipt = buildReceipt({
        ...fullSaleData,
        receiptToken: 'aB3_dE9-gH1_jK2-mN3_pQ',
      }, {
        business: { ...fullBusiness, qrEnabled: true },
        publicAppUrl: 'https://pos.zana.test',
      });

      const html = renderReceiptHtml(receipt, { widthMm: 58, formatMoney });

      expect(html).toContain('width="18mm"');
      expect(html).toContain('Scan to view receipt');
    });

    it('renders no QR code when qrEnabled is false', () => {
      const receipt = buildReceipt({
        ...fullSaleData,
        receiptToken: 'aB3_dE9-gH1_jK2-mN3_pQ',
      }, {
        business: { ...fullBusiness, qrEnabled: false },
        publicAppUrl: 'https://pos.zana.test',
      });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).not.toContain('class="qr-wrap"');
      expect(html).not.toContain('Scan to view receipt');
    });

    it('renders no QR code when qrPayload is null (e.g. credit note or missing token)', () => {
      const receipt = buildReceipt(fullSaleData, {
        business: { ...fullBusiness, qrEnabled: true },
      });

      const html = renderReceiptHtml(receipt, { widthMm: 80, formatMoney });

      expect(html).not.toContain('class="qr-wrap"');
      expect(html).not.toContain('Scan to view receipt');
    });
  });
});
