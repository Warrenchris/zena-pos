const { Writable } = require('stream');
const PDFDocument = require('pdfkit');
const { buildSubscriptionInvoicePdfDoc, getPlatformEmail } = require('../src/services/subscriptionInvoicePdfService');

const drainPdfDoc = (doc) => new Promise((resolve, reject) => {
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });
  stream.on('finish', () => resolve(Buffer.concat(chunks)));
  stream.on('error', reject);
  doc.on('error', reject);
  doc.pipe(stream);
  doc.end();
});

describe('Subscription invoice and payment receipt PDF', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.COMPANY_NAME;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_USER;
  });

  test('uses configured platform company name and sender email where available', async () => {
    process.env.COMPANY_NAME = 'Zana POS Platform';
    process.env.SMTP_FROM = 'Billing <billing@zanapos.example>';

    expect(getPlatformEmail()).toBe('billing@zanapos.example');
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    const doc = buildSubscriptionInvoicePdfDoc({
      id: 21,
      invoiceNumber: 'SUB-2026-00021',
      Organization: { name: 'Soko Safi Ltd', currency: 'KES' },
      Plan: { name: 'Growth' },
      Subscription: { billingCycle: 'monthly' },
      amount: '4500.00',
      currency: 'KES',
      paymentChannel: 'mpesa',
      gatewayReference: 'QW123RECEIPT',
      paymentReference: 'internal-checkout-123',
      status: 'paid',
      paidAt: '2026-11-01T08:00:00.000Z',
      createdAt: '2026-11-01T07:00:00.000Z',
      metadata: { billingCycle: 'yearly', callbackToken: 'must-never-appear-in-document' }
    });

    const pdf = await drainPdfDoc(doc);
    const renderedText = textSpy.mock.calls.map(([value]) => String(value)).join(' ');

    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(renderedText).toContain('Zana POS Platform');
    expect(renderedText).toContain('billing@zanapos.example');
    expect(renderedText).toContain('PAYMENT RECEIPT');
    expect(renderedText).toContain('Soko Safi Ltd');
    expect(renderedText).toContain('Growth');
    expect(renderedText).toContain('YEARLY');
    expect(renderedText).not.toContain('MONTHLY');
    expect(renderedText).toContain('M-PESA RECEIPT');
    expect(renderedText).toContain('QW123RECEIPT');
    expect(renderedText).not.toContain('internal-checkout-123');
    expect(renderedText).not.toContain('must-never-appear-in-document');
    expect(renderedText).not.toMatch(/KRA|VAT|TAX INVOICE/i);
  });

  test('uses neutral subscription invoice wording for pending payments and omits absent billing dates', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    const doc = buildSubscriptionInvoicePdfDoc({
      id: 22,
      invoiceNumber: 'SUB-2026-00022',
      organization: { name: 'North Branch Traders' },
      plan: { name: 'Starter' },
      subscription: { billingCycle: 'monthly' },
      amount: 1200,
      currency: 'KES',
      paymentChannel: 'card',
      paymentReference: 'checkout-ref-22',
      status: 'pending',
      createdAt: '2026-11-02T07:00:00.000Z',
      billingPeriodStart: null,
      billingPeriodEnd: null,
      metadata: { callbackToken: 'private-token' }
    });

    const pdf = await drainPdfDoc(doc);
    const renderedText = textSpy.mock.calls.map(([value]) => String(value)).join(' ');

    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
    expect(renderedText).toContain('SUBSCRIPTION INVOICE');
    expect(renderedText).toContain('North Branch Traders');
    expect(renderedText).toContain('Payment is pending and has not been recorded as completed.');
    expect(renderedText).toContain('PAYMENT REFERENCE');
    expect(renderedText).toContain('checkout-ref-22');
    expect(renderedText).not.toContain('Billing period');
    expect(renderedText).not.toContain('private-token');
    expect(renderedText).not.toMatch(/KRA|VAT|TAX INVOICE/i);
  });

  test('uses SMTP account email when an explicit sender address is absent', () => {
    process.env.SMTP_USER = 'billing-account@zanapos.example';
    expect(getPlatformEmail()).toBe('billing-account@zanapos.example');
  });

  test('does not invent a platform email when no sender address is configured', () => {
    expect(getPlatformEmail()).toBe('');
  });
});
