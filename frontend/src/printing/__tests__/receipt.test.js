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
