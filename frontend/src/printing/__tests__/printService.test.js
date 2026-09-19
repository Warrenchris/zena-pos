import { printReceipt, printTestReceipt, createPrintJob } from '../printService';
import { buildReceipt } from '../receiptModel';

const money = (n) => `KSh ${Number(n).toFixed(2)}`;
const sale = {
  serverData: { invoiceNumber: 'INV-1' },
  items: [{ id: 1, name: 'Item', price: 10, quantity: 1 }],
  total: 10,
  paymentMethod: 'cash',
  paymentAmount: 10,
  change: 0,
};

const adapter = (id, { supported = true, error = null } = {}) => ({
  id,
  label: id,
  isSupported: () => supported,
  print: jest.fn(async () => {
    if (error) throw error;
  }),
});

describe('printReceipt fallback chain', () => {
  it('uses the profile adapter when it works', async () => {
    const bt = adapter('bluetooth');
    const browser = adapter('browser');
    const res = await printReceipt(sale, {
      formatMoney: money,
      profile: { connection: 'bluetooth' },
      adapters: { bluetooth: bt, browser },
    });
    expect(res).toEqual({ ok: true, adapterId: 'bluetooth', fellBack: false });
    expect(browser.print).not.toHaveBeenCalled();
  });

  it('falls back to the browser when the profile adapter throws', async () => {
    const bt = adapter('bluetooth', { error: new Error('Printer not paired') });
    const browser = adapter('browser');
    const res = await printReceipt(sale, {
      formatMoney: money,
      profile: { connection: 'bluetooth' },
      adapters: { bluetooth: bt, browser },
    });
    expect(res).toMatchObject({ ok: true, adapterId: 'browser', fellBack: true, error: 'Printer not paired' });
    expect(browser.print).toHaveBeenCalledTimes(1);
  });

  it('falls back when the adapter is unsupported or not registered', async () => {
    const browser = adapter('browser');
    const unsupported = adapter('usb', { supported: false });

    const a = await printReceipt(sale, { profile: { connection: 'usb' }, adapters: { usb: unsupported, browser } });
    expect(a).toMatchObject({ ok: true, adapterId: 'browser', fellBack: true });

    const b = await printReceipt(sale, { profile: { connection: 'network' }, adapters: { browser } });
    expect(b).toMatchObject({ ok: true, adapterId: 'browser', fellBack: true });
  });

  it('does not retry the browser adapter when it is the configured one', async () => {
    const browser = adapter('browser', { error: new Error('popup blocked') });
    const res = await printReceipt(sale, { profile: { connection: 'browser' }, adapters: { browser } });
    expect(res).toMatchObject({ ok: false, error: 'popup blocked' });
    expect(browser.print).toHaveBeenCalledTimes(1);
  });

  it('reports failure without throwing when everything fails', async () => {
    const bt = adapter('bluetooth', { error: new Error('no device') });
    const browser = adapter('browser', { error: new Error('no print dialog') });
    const res = await printReceipt(sale, { profile: { connection: 'bluetooth' }, adapters: { bluetooth: bt, browser } });
    expect(res).toMatchObject({ ok: false, error: 'no print dialog' });
  });

  it('never throws even if formatting fails', async () => {
    const browser = adapter('browser');
    browser.print = jest.fn(async (job) => job.html());
    const res = await printReceipt(sale, {
      formatMoney: () => {
        throw new Error('bad format');
      },
      profile: { connection: 'browser' },
      adapters: { browser },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('bad format');
  });
});

describe('createPrintJob', () => {
  it('renders each format lazily and only once', () => {
    const fmt = jest.fn(money);
    const job = createPrintJob(buildReceipt(sale), { paperWidth: 58 }, fmt);
    expect(fmt).not.toHaveBeenCalled();
    const first = job.escpos();
    const calls = fmt.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(job.escpos()).toBe(first);
    expect(fmt.mock.calls.length).toBe(calls);
  });
});

describe('printTestReceipt', () => {
  it('prints a sample receipt through the same pipeline', async () => {
    const browser = adapter('browser');
    browser.print = jest.fn(async (job) => {
      expect(job.text()).toContain('TEST-0001');
    });
    const res = await printTestReceipt({ formatMoney: money, profile: { connection: 'browser' }, adapters: { browser } });
    expect(res.ok).toBe(true);
    expect(browser.print).toHaveBeenCalled();
  });
});
