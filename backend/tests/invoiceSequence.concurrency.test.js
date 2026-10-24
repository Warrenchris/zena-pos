/**
 * Concurrency Test for Invoice Number Generation (Fix 7)
 *
 * NOTE: THIS TEST REQUIRES A RUNNING MYSQL DATABASE AND MIGRATED SCHEMA.
 * If MySQL is not running (e.g. CI without MySQL container or local offline dev),
 * the test gracefully detects connection failure and skips execution.
 */

const sequelize = require('../src/config/database');
const { generateNextInvoiceNumber } = require('../src/utils/invoiceSequence');
const { Shop, InvoiceSequence, Sale } = require('../src/models');

describe('InvoiceSequence Database Concurrency Test (Fix 7) [REQUIRES LIVE MYSQL DB]', () => {
  let dbAvailable = false;
  let testShopId = null;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      dbAvailable = true;
      // Sync or ensure InvoiceSequence table exists
      await InvoiceSequence.sync();

      // Find or create a test shop
      let shop = await Shop.findOne();
      if (!shop) {
        shop = await Shop.create({
          name: 'Concurrency Test Shop',
          currency: 'KES',
          status: 'active'
        });
      }
      testShopId = shop.id;
    } catch (err) {
      console.warn('Live MySQL database not available. Skipping live DB concurrency test:', err.message);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await sequelize.close();
    }
  });

  test('20 parallel concurrent creates yield unique, gapless invoice numbers', async () => {
    if (!dbAvailable) {
      console.log('SKIPPING: Live MySQL DB required for concurrency test');
      return;
    }

    const testDate = new Date();
    const dateStr = testDate.toISOString().slice(0, 10).replace(/-/g, '');

    // Reset sequence for today in test shop
    await InvoiceSequence.destroy({
      where: { shopId: testShopId, date: dateStr }
    });

    // Execute 20 concurrent transactions, each calling generateNextInvoiceNumber
    const runSaleTransaction = async () => {
      const t = await sequelize.transaction();
      try {
        const invNum = await generateNextInvoiceNumber({
          shopId: testShopId,
          transaction: t,
          date: testDate
        });
        await t.commit();
        return invNum;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => runSaleTransaction())
    );

    expect(results).toHaveLength(20);
    const unique = new Set(results);
    expect(unique.size).toBe(20);

    // Verify sequence is gapless from 0001 to 0020
    const sequenceNums = results.map(r => parseInt(r.split('-')[1], 10)).sort((a, b) => a - b);
    for (let i = 0; i < 20; i++) {
      expect(sequenceNums[i]).toBe(i + 1);
    }
  });
});
