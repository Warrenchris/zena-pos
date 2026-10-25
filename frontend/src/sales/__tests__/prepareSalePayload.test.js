import { prepareSalePayload } from '../prepareSalePayload';

describe('prepareSalePayload', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('generates complete canonical payload for CashierDashboard sale', async () => {
    const params = {
      items: [
        { id: 101, name: 'Tusker Lager', quantity: 2, price: 250 },
        { id: 102, name: 'Soda 500ml', quantity: 1, price: 80 }
      ],
      total: 580,
      subtotal: 580,
      paymentMethod: 'cash',
      paymentAmount: 1000,
      customer: { name: 'John Doe', phone: '0712345678' },
      customerId: 42,
      discount: 0,
      notes: 'Table 4',
      user: { id: 7, name: 'Alice Cashier' },
      shopSettings: { taxRate: 16, taxInclusive: false }
    };

    const { salePayload, meta } = await prepareSalePayload(params);

    // receiptNumber format: R-XXXX-NNNNNN
    expect(salePayload.receiptNumber).toMatch(/^R-[A-Z0-9]{4}-\d{6}$/);
    expect(meta.receiptNumber).toBe(salePayload.receiptNumber);

    // receiptToken format: 22 chars base64url
    expect(salePayload.receiptToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(meta.receiptToken).toBe(salePayload.receiptToken);

    // Cashier snapshot
    expect(salePayload.cashierName).toBe('Alice Cashier');
    expect(meta.cashierName).toBe('Alice Cashier');

    // Tax snapshot (exclusive: 580 * 0.16 = 92.8)
    expect(salePayload.taxRate).toBe(16);
    expect(salePayload.taxInclusive).toBe(false);
    expect(salePayload.taxAmount).toBe(92.8);
    expect(salePayload.tax).toBe(92.8);

    // Payment & Change snapshots (1000 - 580 = 420)
    expect(salePayload.paymentMethod).toBe('cash');
    expect(salePayload.paymentAmount).toBe(1000);
    expect(salePayload.changeAmount).toBe(420);
    expect(salePayload.change).toBe(420);

    // Idempotency key
    expect(salePayload.idempotencyKey).toBe(`idem-${salePayload.receiptNumber}`);

    // Items mapped
    expect(salePayload.items).toHaveLength(2);
    expect(salePayload.items[0]).toMatchObject({
      productId: 101,
      quantity: 2,
      price: 250
    });
  });

  test('generates canonical payload for POSModal quick sale with tax-inclusive pricing', async () => {
    const params = {
      items: [
        { productId: 201, name: 'Basmati Rice 2kg', quantity: 1, unitPrice: 400 }
      ],
      total: 400,
      paymentMethod: 'mobile',
      paymentAmount: 400,
      user: { username: 'cashier_bob' },
      shopSettings: { taxRate: 16, taxInclusive: true }
    };

    const { salePayload, meta } = await prepareSalePayload(params);

    expect(salePayload.receiptNumber).toMatch(/^R-[A-Z0-9]{4}-\d{6}$/);
    expect(salePayload.cashierName).toBe('cashier_bob');

    // Tax-inclusive: 400 * (16 / 116) = 55.17
    expect(salePayload.taxRate).toBe(16);
    expect(salePayload.taxInclusive).toBe(true);
    expect(salePayload.taxAmount).toBe(55.17);

    // Non-cash change must be 0
    expect(salePayload.paymentMethod).toBe('mobile');
    expect(salePayload.changeAmount).toBe(0);
    expect(salePayload.change).toBe(0);
  });

  test('generates canonical payload for PaymentModal split-payment sale', async () => {
    const params = {
      items: [
        { id: 301, quantity: 1, price: 1500 }
      ],
      total: 1500,
      paymentMethod: 'split',
      payments: [
        { paymentMethod: 'cash', amount: 500 },
        { paymentMethod: 'mpesa', amount: 1000, gatewayRef: 'QKX891' }
      ],
      user: { firstName: 'Grace', lastName: 'Hopper' },
      shopSettings: { taxRate: 0, taxInclusive: false }
    };

    const { salePayload, meta } = await prepareSalePayload(params);

    expect(salePayload.receiptNumber).toMatch(/^R-[A-Z0-9]{4}-\d{6}$/);
    expect(salePayload.cashierName).toBe('Grace Hopper');
    expect(salePayload.paymentMethod).toBe('split');
    expect(salePayload.payments).toHaveLength(2);
    expect(salePayload.changeAmount).toBe(0);
  });

  test('respects explicit overrides for offline queuing and retry collisions', async () => {
    const params = {
      items: [{ productId: 5, quantity: 1, price: 100 }],
      total: 100,
      receiptNumber: 'R-TEST-999999',
      receiptToken: 'custom-token-22-char-x',
      idempotencyKey: 'custom-idemp-key-12345',
      cashierName: 'Overridden Cashier',
      taxAmount: 16,
      user: { name: 'Ignored User' },
      shopSettings: { taxRate: 16 }
    };

    const { salePayload } = await prepareSalePayload(params);

    expect(salePayload.receiptNumber).toBe('R-TEST-999999');
    expect(salePayload.receiptToken).toBe('custom-token-22-char-x');
    expect(salePayload.idempotencyKey).toBe('custom-idemp-key-12345');
    expect(salePayload.cashierName).toBe('Overridden Cashier');
    expect(salePayload.taxAmount).toBe(16);
  });
});
