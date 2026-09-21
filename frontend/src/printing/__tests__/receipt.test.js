import { buildReceipt } from '../receiptModel';
import { renderEscPos, renderHtml, renderPlainText } from '../renderers';

const money = (n) => `KSh ${Number(n).toFixed(2)}`;

const sale = (overrides = {}) => ({
  serverData: { invoiceNumber: 'INV-1001', createdAt: '2026-09-19T11:32:00' },
  items: [
    { id: 1, name: 'Sugar 1kg', price: 150, quantity: 2 },
    { id: 2, name: 'Extra long product name that must wrap onto more lines', price: '75.50', quantity: 1 },
  ],
  customer: { name: 'Jane' },
  total: 350.5,
  paymentMethod: 'cash',
  paymentAmount: 400,
  change: 49.5,
  notes: '',
  ...overrides,
});

const business = { name: 'Mama Njeri Supermarket', address: 'Moi Avenue, Nairobi', phone: '0700 000 000', kraPin: 'P000000000X' };

describe('buildReceipt', () => {
  it('computes subtotal, discount and cash tender', () => {
    const r = buildReceipt(sale(), { business });
    expect(r.totals.subtotal).toBeCloseTo(375.5);
    expect(r.totals.discount).toBeCloseTo(25);
    expect(r.totals.total).toBe(350.5);
    expect(r.totals.tendered).toBe(400);
    expect(r.totals.change).toBe(49.5);
    expect(r.meta.paymentLabel).toBe('Cash');
  });

  it('has no tender or change for non-cash payments', () => {
    const r = buildReceipt(sale({ paymentMethod: 'mpesa', paymentAmount: 350.5, change: 0 }));
    expect(r.totals.tendered).toBeNull();
    expect(r.meta.paymentLabel).toBe('M-Pesa');
  });

  it('falls back to safe defaults', () => {
    const r = buildReceipt({ items: [], serverData: null });
    expect(r.meta.invoiceNumber).toBe('N/A');
    expect(r.meta.customerName).toBe('Walk-in Customer');
    expect(r.lines).toEqual([]);
  });
});

describe.each([
  [58, 32],
  [80, 48],
])('%imm paper (%i columns)', (paperWidth, cols) => {
  const profile = { paperWidth };

  it('never lets a line exceed the paper width', () => {
    const text = renderPlainText(buildReceipt(sale(), { business }), profile, money);
    text.split('\n').forEach((line) => {
      expect(line.length).toBeLessThanOrEqual(cols);
    });
  });

  it('contains the key receipt facts', () => {
    const text = renderPlainText(buildReceipt(sale(), { business }), profile, money);
    expect(text).toContain('INV-1001');
    expect(text).toContain('2026-09-19 11:32');
    expect(text).toContain('Jane');
    expect(text).toContain('KRA PIN: P000000000X');
    expect(text).toContain('Discount');
    expect(text).toContain('KSh 350.50');
    expect(text).toContain('Change Due');
  });
});

describe('renderPlainText details', () => {
  it('omits discount when there is none', () => {
    const text = renderPlainText(buildReceipt(sale({ total: 375.5 })), { paperWidth: 58 }, money);
    expect(text).not.toContain('Discount');
  });

  it('flags offline sales as pending sync', () => {
    const text = renderPlainText(buildReceipt(sale({ isOffline: true })), { paperWidth: 58 }, money);
    expect(text).toContain('pending sync');
  });

  it('survives very large amounts by dropping double-size total instead of truncating', () => {
    const big = buildReceipt(sale({ total: 12345678.9 }));
    const lines = renderPlainText(big, { paperWidth: 58 }, money).split('\n');
    const totalLine = lines.find((l) => l.startsWith('TOTAL'));
    expect(totalLine).toBeDefined();
    expect(totalLine).toContain('12345678.90');
    expect(totalLine.length).toBeLessThanOrEqual(32);
  });
});

describe('renderEscPos', () => {
  const receipt = buildReceipt(sale(), { business });

  it('starts with init and ends with a partial cut by default', () => {
    const b = Array.from(renderEscPos(receipt, { paperWidth: 58 }, money));
    expect(b.slice(0, 2)).toEqual([0x1b, 0x40]);
    expect(b.slice(-3)).toEqual([0x1d, 0x56, 0x01]);
  });

  it('honours cut = none', () => {
    const b = Array.from(renderEscPos(receipt, { cut: 'none' }, money));
    const hasCut = b.some((v, i) => v === 0x1d && b[i + 1] === 0x56);
    expect(hasCut).toBe(false);
  });

  it('kicks the cash drawer before cutting when enabled', () => {
    const b = Array.from(renderEscPos(receipt, { openDrawer: true }, money));
    const kick = b.findIndex((v, i) => v === 0x1b && b[i + 1] === 0x70);
    const cut = b.findIndex((v, i) => v === 0x1d && b[i + 1] === 0x56);
    expect(kick).toBeGreaterThan(-1);
    expect(kick).toBeLessThan(cut);
  });

  it('resets bold/double before finishing so the next job starts clean', () => {
    const b = Array.from(renderEscPos(receipt, { paperWidth: 58 }, money));
    const lastDouble = b.map((v, i) => (v === 0x1d && b[i + 1] === 0x21 ? b[i + 2] : null)).filter((v) => v !== null).pop();
    expect(lastDouble).toBe(0x00);
  });

  it('emits only ASCII text bytes and control codes', () => {
    const r = buildReceipt(sale({ items: [{ id: 1, name: 'Café ☕ Crème', price: 10, quantity: 1 }] }));
    Array.from(renderEscPos(r, {}, money)).forEach((v) => expect(v).toBeLessThan(0x80));
  });
});

describe('renderHtml', () => {
  it('sizes the page to the configured paper', () => {
    const r = buildReceipt(sale());
    expect(renderHtml(r, { paperWidth: 58 }, money)).toContain('size: 58mm auto');
    expect(renderHtml(r, { paperWidth: 80 }, money)).toContain('size: 80mm auto');
  });

  it('escapes HTML in user-controlled fields', () => {
    const r = buildReceipt(sale({ items: [{ id: 1, name: '<script>alert(1)</script>', price: 1, quantity: 1 }] }), {
      business: { name: 'A & B <Shop>' },
    });
    const html = renderHtml(r, {}, money);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;Shop&gt;');
  });
});

describe('receipt header, footer and logo', () => {
  const settings = {
    header: 'Welcome to Mama Njeri!\nOpen daily 8am - 8pm',
    footer: 'Goods once sold are not refundable.\nPlease come again!',
    showLogo: true,
    logoUrl: 'http://localhost:3000/uploads/logos/a.png',
  };
  const build = (receiptSettings, overrides) => buildReceipt(sale(overrides), { business, receiptSettings });

  it('prints the header under the shop details and before the RECEIPT title', () => {
    const lines = renderPlainText(build(settings), { paperWidth: 80 }, money).split('\n');
    const kra = lines.findIndex((l) => l.includes('KRA PIN'));
    const welcome = lines.findIndex((l) => l.includes('Welcome to Mama Njeri!'));
    const hours = lines.findIndex((l) => l.includes('Open daily 8am - 8pm'));
    const title = lines.findIndex((l) => l.includes('RECEIPT'));
    expect(kra).toBeLessThan(welcome);
    expect(welcome + 1).toBe(hours); // the line break in the textarea is kept
    expect(hours).toBeLessThan(title);
    expect(lines[welcome].startsWith(' ')).toBe(true); // centered
  });

  it('replaces the default thank-you with the custom footer', () => {
    const text = renderPlainText(build(settings), { paperWidth: 58 }, money);
    expect(text).toContain('Please come again!');
    expect(text).not.toContain('Thank you for your business!');
  });

  it('falls back to the default footer and no header when none is set', () => {
    [{}, { footer: '   ', header: '' }, undefined].forEach((rs) => {
      const text = renderPlainText(build(rs), { paperWidth: 58 }, money);
      expect(text).toContain('Thank you for your business!');
      expect(text).not.toContain('Welcome');
    });
  });

  it.each([58, 80])('never exceeds %imm even with long header/footer lines', (paperWidth) => {
    const long = build({
      header: 'A very long welcome message that has to wrap over several lines on narrow paper',
      footer: 'Extra_long_unbroken_word_that_cannot_be_wrapped_on_spaces_at_all_1234567890 and more',
    });
    const cols = paperWidth === 58 ? 32 : 48;
    renderPlainText(long, { paperWidth }, money)
      .split('\n')
      .forEach((l) => expect(l.length).toBeLessThanOrEqual(cols));
  });

  it('includes header and footer in ESC/POS output but no image data', () => {
    const b = Array.from(renderEscPos(build(settings), { paperWidth: 58 }, money));
    const ascii = String.fromCharCode(...b.filter((v) => v >= 0x20 && v < 0x7f));
    expect(ascii).toContain('Welcome to Mama Njeri!');
    expect(ascii).toContain('Please come again!');
    const hasRasterCommand = b.some((v, i) => v === 0x1d && b[i + 1] === 0x76 && b[i + 2] === 0x30);
    expect(hasRasterCommand).toBe(false);
  });

  describe('logo', () => {
    it('is only in the model when enabled and a usable URL exists', () => {
      expect(build(settings).logoUrl).toBe(settings.logoUrl);
      expect(build({ ...settings, showLogo: false }).logoUrl).toBeNull();
      expect(build({ ...settings, logoUrl: null }).logoUrl).toBeNull();
      expect(build(undefined).logoUrl).toBeNull();
    });

    it('is printed as an image at the top of the HTML receipt', () => {
      const html = renderHtml(build(settings), { paperWidth: 58 }, money);
      expect(html).toContain(`<img src="${settings.logoUrl}"`);
      expect(html.indexOf('<img')).toBeLessThan(html.indexOf('Mama Njeri'));
    });

    it('escapes the logo URL so it cannot break out of the attribute', () => {
      const html = renderHtml(build({ ...settings, logoUrl: 'https://x.test/a.png" onerror="alert(1)' }), {}, money);
      expect(html).not.toContain('" onerror="');
      expect(html).toContain('&quot; onerror=&quot;');
    });

    it('adds no image when there is no logo', () => {
      expect(renderHtml(build({ ...settings, showLogo: false }), {}, money)).not.toContain('<img');
    });
  });
});
