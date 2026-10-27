/**
 * DB-Backed Test for Credit Note Sequential Numbering
 *
 * Covers:
 * 1. Two partial refunds on one sale get different sequential numbers (e.g. CN-YYYYMMDD-0001, CN-YYYYMMDD-0002).
 * 2. 20 parallel refunds are unique and gapless.
 * 3. Legacy credit notes without creditNoteNumber keep their old derived number (CN-${sale.invoiceNumber || sale.id}).
 */

const sequelize = require('../src/config/database');
const { generateNextCreditNoteNumber } = require('../src/utils/creditNoteSequence');
const saleController = require('../src/controllers/saleController');
const {
  Shop,
  Organization,
  User,
  Product,
  Sale,
  SaleItem,
  SaleRefund,
  CreditNote,
  CreditNoteSequence
} = require('../src/models');

describe('Credit Note Sequence DB Tests [REQUIRES LIVE MYSQL DB]', () => {
  let dbAvailable = false;
  let testOrg = null;
  let testShop = null;
  let testUser = null;

  beforeAll(async () => {
    try {
      await sequelize.authenticate();
      dbAvailable = true;

      await CreditNoteSequence.sync();
      await CreditNote.sync();
      await SaleRefund.sync();

      // Find or create test org & shop
      testOrg = await Organization.findOne();
      if (!testOrg) {
        testOrg = await Organization.create({
          name: 'CN Test Org',
          slug: 'cn-test-org-' + Date.now(),
          currency: 'KES',
          status: 'active'
        });
      }

      testShop = await Shop.findOne({ where: { organizationId: testOrg.id } });
      if (!testShop) {
        testShop = await Shop.create({
          name: 'CN Test Shop',
          organizationId: testOrg.id,
          currency: 'KES',
          status: 'active'
        });
      }

      testUser = await User.findOne({ where: { shopId: testShop.id } });
      if (!testUser) {
        testUser = await User.create({
          name: 'CN Test Admin',
          email: `cn_admin_${Date.now()}@example.com`,
          password: 'Password123!',
          role: 'admin',
          shopId: testShop.id,
          organizationId: testOrg.id
        });
      }
    } catch (err) {
      console.warn('Live MySQL DB not available, skipping live DB tests:', err.message);
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    // Teardown handled by Jest global setup/teardown and setupAfterEnv
  });

  test('1. Two partial refunds on one sale get different sequential numbers', async () => {
    if (!dbAvailable) return;

    const prodA = await Product.create({
      name: 'Item Alpha',
      sku: 'SKU-ALPHA-' + Date.now(),
      price: 500.00,
      cost: 250.00,
      shopId: testShop.id,
      organizationId: testOrg.id,
      active: true
    });

    const prodB = await Product.create({
      name: 'Item Beta',
      sku: 'SKU-BETA-' + Date.now(),
      price: 700.00,
      cost: 350.00,
      shopId: testShop.id,
      organizationId: testOrg.id,
      active: true
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-CN-TEST-' + Date.now(),
      shopId: testShop.id,
      organizationId: testOrg.id,
      userId: testUser.id,
      subtotal: 1200.00,
      total: 1200.00,
      paymentAmount: 1200.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      status: 'completed'
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodA.id,
      quantity: 1,
      unitPrice: 500.00,
      price: 500.00,
      subtotal: 500.00,
      shopId: testShop.id
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodB.id,
      quantity: 1,
      unitPrice: 700.00,
      price: 700.00,
      subtotal: 700.00,
      shopId: testShop.id
    });

    // Partial refund 1: return prodA
    const req1 = {
      params: { saleId: String(sale.id) },
      body: {
        items: [{ productId: prodA.id, quantity: 1, disposition: 'restock', reasonCode: 'DEFECTIVE' }]
      },
      user: { id: testUser.id, role: 'admin', shopId: testShop.id, organizationId: testOrg.id },
      shopId: testShop.id,
      organizationId: testOrg.id
    };
    let res1Data = null;
    const res1 = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((payload) => { res1Data = payload; })
    };

    await saleController.processRefund(req1, res1);
    expect(res1Data).not.toBeNull();
    const cnNumber1 = res1Data.creditNoteNumber;
    expect(cnNumber1).toMatch(/^CN-\d{8}-\d{4}$/);

    // Partial refund 2: return prodB
    const req2 = {
      params: { saleId: String(sale.id) },
      body: {
        items: [{ productId: prodB.id, quantity: 1, disposition: 'restock', reasonCode: 'WRONG_ITEM' }]
      },
      user: { id: testUser.id, role: 'admin', shopId: testShop.id, organizationId: testOrg.id },
      shopId: testShop.id,
      organizationId: testOrg.id
    };
    let res2Data = null;
    const res2 = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((payload) => { res2Data = payload; })
    };

    await saleController.processRefund(req2, res2);
    expect(res2Data).not.toBeNull();
    const cnNumber2 = res2Data.creditNoteNumber;
    expect(cnNumber2).toMatch(/^CN-\d{8}-\d{4}$/);

    // Verify distinct numbers
    expect(cnNumber1).not.toBe(cnNumber2);

    // Verify sequential progression
    const seq1 = parseInt(cnNumber1.split('-')[2], 10);
    const seq2 = parseInt(cnNumber2.split('-')[2], 10);
    expect(seq2).toBe(seq1 + 1);

    // Verify getCreditNote returns the specific credit note when queried
    let getCnData1 = null;
    await saleController.getCreditNote({
      params: { saleId: String(sale.id) },
      query: { creditNoteNumber: cnNumber1 },
      user: { id: testUser.id, shopId: testShop.id },
      shopId: testShop.id
    }, {
      json: jest.fn((d) => { getCnData1 = d; }),
      status: jest.fn().mockReturnThis()
    });
    expect(getCnData1.creditNoteNumber).toBe(cnNumber1);
    expect(getCnData1.totalRefundAmount).toBe(500.00);

    let getCnData2 = null;
    await saleController.getCreditNote({
      params: { saleId: String(sale.id) },
      query: { creditNoteNumber: cnNumber2 },
      user: { id: testUser.id, shopId: testShop.id },
      shopId: testShop.id
    }, {
      json: jest.fn((d) => { getCnData2 = d; }),
      status: jest.fn().mockReturnThis()
    });
    expect(getCnData2.creditNoteNumber).toBe(cnNumber2);
    expect(getCnData2.totalRefundAmount).toBe(700.00);
  });

  test('2. 20 parallel refunds are unique and gapless', async () => {
    if (!dbAvailable) return;

    const testDate = new Date();
    const dateStr = testDate.toISOString().slice(0, 10).replace(/-/g, '');

    // Execute 20 concurrent transactions, each calling generateNextCreditNoteNumber
    const runRefundTransaction = async () => {
      const t = await sequelize.transaction();
      try {
        const cnNum = await generateNextCreditNoteNumber({
          shopId: testShop.id,
          transaction: t,
          date: testDate
        });
        await t.commit();
        return cnNum;
      } catch (err) {
        await t.rollback();
        throw err;
      }
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => runRefundTransaction())
    );

    expect(results).toHaveLength(20);
    const unique = new Set(results);
    expect(unique.size).toBe(20);

    // Verify sequence is gapless
    const sequenceNums = results.map(r => parseInt(r.split('-')[2], 10)).sort((a, b) => a - b);
    const baseSeq = sequenceNums[0];
    for (let i = 0; i < 20; i++) {
      expect(sequenceNums[i]).toBe(baseSeq + i);
    }
  });

  test('3. Legacy credit notes keep their old numbers (CN-${sale.invoiceNumber || sale.id})', async () => {
    if (!dbAvailable) return;

    const legacyInvNum = '20261020-' + Math.floor(1000 + Math.random() * 9000);
    const legacySale = await Sale.create({
      invoiceNumber: legacyInvNum,
      shopId: testShop.id,
      organizationId: testOrg.id,
      userId: testUser.id,
      subtotal: 1000.00,
      total: 1000.00,
      paymentAmount: 1000.00,
      paymentMethod: 'cash',
      saleStatus: 'refunded',
      status: 'completed'
    });

    const legacyProd = await Product.create({
      name: 'Legacy Product',
      sku: 'SKU-LEGACY-' + Date.now(),
      price: 1000.00,
      cost: 500.00,
      shopId: testShop.id,
      organizationId: testOrg.id,
      active: true
    });

    // Create a legacy refund row with creditNoteNumber = null
    await SaleRefund.create({
      saleId: legacySale.id,
      productId: legacyProd.id,
      quantity: 1,
      amount: 1000.00,
      refundAmount: 1000.00,
      reason: 'Legacy return',
      reasonCode: 'OTHER',
      disposition: 'restock',
      refundMethod: 'cash',
      status: 'processed',
      shopId: testShop.id,
      creditNoteNumber: null,
      refundedAt: new Date()
    });

    let creditNoteData = null;
    const res = {
      json: jest.fn((d) => { creditNoteData = d; }),
      status: jest.fn().mockReturnThis()
    };

    await saleController.getCreditNote({
      params: { saleId: String(legacySale.id) },
      query: {},
      user: { id: testUser.id, shopId: testShop.id },
      shopId: testShop.id
    }, res);

    expect(creditNoteData).not.toBeNull();
    expect(creditNoteData.creditNoteNumber).toBe('CN-' + legacyInvNum);
    expect(creditNoteData.totalRefundAmount).toBe(1000.00);
  });
});
