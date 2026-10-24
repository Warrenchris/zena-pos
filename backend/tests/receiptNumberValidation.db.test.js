/**
 * Backend Database Integration Test: Receipt Number Duplicate Handling & Idempotency (Phase 2)
 *
 * NOTE: THIS TEST REQUIRES A LIVE MYSQL DATABASE CONNECTION AND MIGRATED SCHEMA.
 * If MySQL is offline, it skips execution gracefully.
 */

const sequelize = require('../src/config/database');
const { Shop, Sale } = require('../src/models');

describe('Backend DB Receipt Number Validation [REQUIRES LIVE MYSQL DB]', () => {
  let dbAvailable = false;
  let testShop = null;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      dbAvailable = true;

      // Ensure test shop exists
      testShop = await Shop.findOne();
      if (!testShop) {
        testShop = await Shop.create({
          name: 'Phase 2 Test Shop',
          currency: 'KES',
          status: 'active'
        });
      }
    } catch (err) {
      console.warn('MySQL database unavailable. Skipping live DB test:', err.message);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await sequelize.close();
    }
  });

  test('enforces unique (shopId, receiptNumber) constraint in database', async () => {
    if (!dbAvailable) {
      console.log('SKIPPING: Live MySQL DB required for receiptNumber DB test');
      return;
    }

    const testReceiptNumber = `R-TEST-${Math.floor(100000 + Math.random() * 900000)}`;

    // Create first sale with receiptNumber
    const sale1 = await Sale.create({
      shopId: testShop.id,
      receiptNumber: testReceiptNumber,
      idempotencyKey: `idemp-${Date.now()}-1`,
      total: 500,
      paymentMethod: 'cash',
      paymentAmount: 500,
      change: 0
    });
    expect(sale1.id).toBeDefined();

    // Attempting to insert duplicate receiptNumber for the same shop must reject with UniqueConstraintError
    await expect(
      Sale.create({
        shopId: testShop.id,
        receiptNumber: testReceiptNumber,
        idempotencyKey: `idemp-${Date.now()}-2`,
        total: 700,
        paymentMethod: 'cash',
        paymentAmount: 700,
        change: 0
      })
    ).rejects.toThrow();

    // Clean up
    await sale1.destroy();
  });
});
