const { generateNextInvoiceNumber } = require('../src/utils/invoiceSequence');

describe('InvoiceSequence Pure-Logic Unit Tests (Fix 7)', () => {
  let mockStore;
  let mockSales;

  beforeEach(() => {
    mockStore = new Map(); // key: `${shopId}-${date}` -> { shopId, date, currentSequence }
    mockSales = [];
  });

  // Mock models that simulate Sequelize models in memory
  const createMockModels = () => {
    const InvoiceSequence = {
      findOne: jest.fn(async ({ where, transaction }) => {
        const key = `${where.shopId}-${where.date}`;
        const record = mockStore.get(key);
        if (!record) return null;
        return {
          ...record,
          save: jest.fn(async function () {
            mockStore.set(key, { ...this });
          })
        };
      }),
      create: jest.fn(async ({ shopId, date, currentSequence }, { transaction }) => {
        const key = `${shopId}-${date}`;
        if (mockStore.has(key)) {
          const err = new Error('Validation error: duplicate key');
          err.name = 'SequelizeUniqueConstraintError';
          throw err;
        }
        const record = {
          shopId,
          date,
          currentSequence,
          save: jest.fn(async function () {
            mockStore.set(key, { ...this });
          })
        };
        mockStore.set(key, record);
        return {
          ...record,
          save: jest.fn(async function () {
            mockStore.set(key, { ...this });
          })
        };
      })
    };

    const Sale = {
      findAll: jest.fn(async ({ where }) => {
        const matching = mockSales.filter(s => s.shopId === where.shopId && s.invoiceNumber.startsWith(where.invoiceNumber[Object.getOwnPropertySymbols(where.invoiceNumber)[0]] || ''));
        return matching.length ? [matching[matching.length - 1]] : [];
      })
    };

    return { InvoiceSequence, Sale };
  };

  test('generates sequential, zero-padded numbers starting from 0001', async () => {
    const models = createMockModels();
    const mockTx = { LOCK: { UPDATE: 'UPDATE' } };
    const fixedDate = new Date('2026-10-23T10:00:00Z');

    const inv1 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });
    expect(inv1).toBe('20261023-0001');

    const inv2 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });
    expect(inv2).toBe('20261023-0002');

    const inv3 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });
    expect(inv3).toBe('20261023-0003');
  });

  test('isolates sequence by shopId', async () => {
    const models = createMockModels();
    const mockTx = { LOCK: { UPDATE: 'UPDATE' } };
    const fixedDate = new Date('2026-10-23T10:00:00Z');

    const shop1Inv1 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });
    const shop2Inv1 = await generateNextInvoiceNumber({ shopId: 2, transaction: mockTx, date: fixedDate, models });
    const shop1Inv2 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });

    expect(shop1Inv1).toBe('20261023-0001');
    expect(shop2Inv1).toBe('20261023-0001');
    expect(shop1Inv2).toBe('20261023-0002');
  });

  test('isolates sequence by date', async () => {
    const models = createMockModels();
    const mockTx = { LOCK: { UPDATE: 'UPDATE' } };
    const day1 = new Date('2026-10-23T10:00:00Z');
    const day2 = new Date('2026-10-24T10:00:00Z');

    const day1Inv1 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: day1, models });
    const day2Inv1 = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: day2, models });

    expect(day1Inv1).toBe('20261023-0001');
    expect(day2Inv1).toBe('20261024-0001');
  });

  test('seeds from pre-existing Sale records if sequence record did not exist yet', async () => {
    const models = createMockModels();
    const mockTx = { LOCK: { UPDATE: 'UPDATE' } };
    const fixedDate = new Date('2026-10-23T10:00:00Z');

    // Simulate pre-existing sales today from before restart
    models.Sale.findAll = jest.fn().mockResolvedValue([{ invoiceNumber: '20261023-0042' }]);

    const nextInv = await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });
    expect(nextInv).toBe('20261023-0043');
  });

  test('simulates 20 concurrent parallel calls with row locking producing 20 unique gapless numbers', async () => {
    const models = createMockModels();
    const fixedDate = new Date('2026-10-23T10:00:00Z');

    // Mutex simulating SELECT ... FOR UPDATE database row locking
    let lock = Promise.resolve();
    const withLock = async (fn) => {
      const prev = lock;
      let release;
      lock = new Promise(r => { release = r; });
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    };

    const generateWithLockedTx = () => withLock(async () => {
      const mockTx = { LOCK: { UPDATE: 'UPDATE' } };
      return await generateNextInvoiceNumber({ shopId: 1, transaction: mockTx, date: fixedDate, models });
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () => generateWithLockedTx())
    );

    expect(results).toHaveLength(20);
    const unique = new Set(results);
    expect(unique.size).toBe(20);

    // Verify gapless sequence 0001..0020
    const numbers = results.map(r => parseInt(r.split('-')[1], 10)).sort((a, b) => a - b);
    for (let i = 0; i < 20; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });
});
