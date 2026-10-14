'use strict';

const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Organization, Product, Sale, SaleItem,
  SaleRefund, Expense, User
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

function tokenFor(user) {
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
  return 'Bearer ' + jwt.sign(user, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
}

describe('Reports P&L Endpoint Tests (Profit & Loss Reconciliation & Refunds)', () => {
  const TEST_SHOP_ID = 805;
  const TEST_ORG_ID = 805;
  const ADMIN_USER_ID = 88501;

  let adminToken;
  let skuCounter = 1;

  const createProduct = async (attrs) => {
    return Product.create({
      sku: `SKU-PNL-${Date.now()}-${skuCounter++}`,
      shopId: TEST_SHOP_ID,
      organizationId: TEST_ORG_ID,
      active: true,
      ...attrs
    });
  };

  beforeAll(async () => {
    await sequelize.authenticate();

    await Organization.findOrCreate({
      where: { id: TEST_ORG_ID },
      defaults: {
        name: 'PNL Test Org',
        slug: 'pnl-test-org',
        status: 'active'
      }
    });

    await Shop.findOrCreate({
      where: { id: TEST_SHOP_ID },
      defaults: {
        name: 'PNL Test Shop',
        organizationId: TEST_ORG_ID
      }
    });

    await User.findOrCreate({
      where: { id: ADMIN_USER_ID },
      defaults: {
        name: 'PNL Admin',
        email: 'pnl_admin_88501@example.com',
        role: 'admin',
        shopId: TEST_SHOP_ID,
        organizationId: TEST_ORG_ID,
        password: 'Password123!'
      }
    });

    await tokenRevocationService.clearUserStatus(ADMIN_USER_ID, false);
    await tokenRevocationService.setUserStatus(ADMIN_USER_ID, false, 'active');
    await tokenRevocationService.clearUserTokenCutoff(ADMIN_USER_ID, false);

    adminToken = tokenFor({ id: ADMIN_USER_ID, role: 'admin', shopId: TEST_SHOP_ID, organizationId: TEST_ORG_ID });
  });

  beforeEach(async () => {
    // Clear sales, refunds, items and expenses for this test shop to guarantee pure isolation
    const sales = await Sale.findAll({ where: { shopId: TEST_SHOP_ID }, attributes: ['id'] });
    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
      const { SalePayment, StockMovement } = require('../src/models');
      await StockMovement.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
      await SalePayment.destroy({ where: { saleId: saleIds } }).catch(() => {});
      await SaleRefund.destroy({ where: { saleId: saleIds } }).catch(() => {});
      await SaleItem.destroy({ where: { saleId: saleIds } }).catch(() => {});
      await Sale.destroy({ where: { id: saleIds } }).catch(() => {});
    }
    await Expense.destroy({ where: { shopId: TEST_SHOP_ID } }).catch(() => {});
  });

  test('P&L reconciles: revenue = gross - discount - refunds, returns totalRefunds & returnedCogs, reduces COGS on restock, and excludes cancelled sales', async () => {
    const prodA = await createProduct({ name: 'Product A', price: 1000.00, cost: 600.00 });
    const prodB = await createProduct({ name: 'Product B', price: 500.00, cost: 300.00 });

    // Sale 1: Completed sale with discount
    // 2 x Product A: subtotal = 2000.00, discount = 200.00, total = 1800.00
    const sale1 = await Sale.create({
      invoiceNumber: `INV-PNL-1-${Date.now()}`,
      subtotal: 2000.00,
      discount: 200.00,
      tax: 0.00,
      total: 1800.00,
      paymentAmount: 1800.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale1.id,
      productId: prodA.id,
      quantity: 2,
      unitPrice: 1000.00,
      price: 1000.00,
      subtotal: 2000.00,
      discount: 200.00,
      shopId: TEST_SHOP_ID
    });

    // Processed partial refund on Sale 1: 1 unit of Product A returned and restocked (amount = 900.00)
    await SaleRefund.create({
      saleId: sale1.id,
      productId: prodA.id,
      quantity: 1,
      amount: 900.00,
      refundAmount: 900.00,
      status: 'processed',
      disposition: 'restock',
      refundMethod: 'cash',
      shopId: TEST_SHOP_ID
    });

    // Sale 2: CANCELLED sale (must be completely excluded from revenue and COGS)
    const sale2 = await Sale.create({
      invoiceNumber: `INV-PNL-2-${Date.now()}`,
      subtotal: 5000.00,
      discount: 500.00,
      tax: 0.00,
      total: 4500.00,
      paymentAmount: 4500.00,
      paymentMethod: 'cash',
      saleStatus: 'cancelled',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale2.id,
      productId: prodB.id,
      quantity: 10,
      unitPrice: 500.00,
      price: 500.00,
      subtotal: 5000.00,
      discount: 500.00,
      shopId: TEST_SHOP_ID
    });

    // Expense: 300.00 operating expense
    await Expense.create({
      description: 'Shop Electricity',
      amount: 300.00,
      category: 'utilities',
      paymentMethod: 'cash',
      shopId: TEST_SHOP_ID,
      userId: ADMIN_USER_ID,
      date: new Date()
    });

    const res = await request(app)
      .get('/api/reports/profit-loss')
      .set('Authorization', adminToken);

    expect(res.statusCode).toBe(200);

    // 1. Cancelled sale (5000 subtotal) is excluded: grossRevenue should be 2000, not 7000
    expect(res.body.grossRevenue).toBe(2000.00);

    // 2. Discount is 200.00 (from Sale 1 only)
    expect(res.body.totalDiscount).toBe(200.00);

    // 3. New additive fields: totalRefunds & returnedCogs MUST be returned in the response payload
    expect(res.body.totalRefunds).toBe(900.00);
    expect(res.body.returnedCogs).toBe(600.00);

    // 4. Revenue / Net Revenue must reconcile: gross (2000) - discount (200) - refunds (900) = 900
    expect(res.body.revenue).toBe(900.00);
    expect(res.body.netRevenue).toBe(900.00);

    // 5. COGS: Gross COGS (2 * 600 = 1200) minus restocked returned COGS (1 * 600 = 600) = 600
    expect(res.body.cogs).toBe(600.00);

    // 6. Gross Profit: Net Revenue (900) - Net COGS (600) = 300
    expect(res.body.grossProfit).toBe(300.00);

    // 7. Operating expenses & profit
    expect(res.body.operatingExpenses).toBe(300.00);
    expect(res.body.profit).toBe(0.00);
  });

  test('F-7 (1 & 2): Partial and full refunds on taxable sales subtract pre-tax net refund (100), not tax-inclusive gross refund (116), and deduct refunded tax', async () => {
    const prod = await createProduct({ name: 'Taxable Widget', price: 100.00, cost: 40.00, taxCategory: 'standard' });

    // Sale: 2 units @ 100 = 200 subtotal, 16% tax = 32, total = 232
    const sale = await Sale.create({
      invoiceNumber: `INV-PNL-F7-1-${Date.now()}`,
      subtotal: 200.00,
      discount: 0.00,
      tax: 32.00,
      taxRate: 16.00,
      total: 232.00,
      paymentAmount: 232.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      status: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 2,
      unitPrice: 100.00,
      price: 100.00,
      subtotal: 200.00,
      taxRate: 16.00,
      taxAmount: 32.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    // Step A: Partial refund of 1 unit via POST /api/sales/:id/refund (gross 116, net 100, tax 16)
    const refundRes1 = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({ items: [{ productId: prod.id, quantity: 1, disposition: 'restock', reasonCode: 'DEFECTIVE' }] });
    expect(refundRes1.statusCode).toBe(200);
    expect(refundRes1.body.totalRefundAmount).toBe(116.00);
    expect(refundRes1.body.totalTaxRefunded).toBe(16.00);

    const pnlAfterPartial = await request(app)
      .get('/api/reports/profit-loss')
      .set('Authorization', adminToken);
    expect(pnlAfterPartial.statusCode).toBe(200);
    // Pre-tax grossRevenue is 200, pre-tax totalRefunds is 100 (NOT 116!), so revenue = 100 (NOT 84!)
    expect(pnlAfterPartial.body.grossRevenue).toBe(200.00);
    expect(pnlAfterPartial.body.totalRefunds).toBe(100.00);
    expect(pnlAfterPartial.body.grossRefunds).toBe(116.00);
    expect(pnlAfterPartial.body.refundedTax).toBe(16.00);
    expect(pnlAfterPartial.body.revenue).toBe(100.00);
    expect(pnlAfterPartial.body.netRevenue).toBe(100.00);
    expect(pnlAfterPartial.body.totalTax).toBe(16.00);
    expect(pnlAfterPartial.body.cogs).toBe(40.00);
    expect(pnlAfterPartial.body.grossProfit).toBe(60.00);

    // Step B: Refund remaining 1 unit -> sale becomes 'refunded'
    const refundRes2 = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({ items: [{ productId: prod.id, quantity: 1, disposition: 'restock', reasonCode: 'DEFECTIVE' }] });
    expect(refundRes2.statusCode).toBe(200);
    expect(refundRes2.body.saleStatus).toBe('refunded');

    const pnlAfterFull = await request(app)
      .get('/api/reports/profit-loss')
      .set('Authorization', adminToken);
    expect(pnlAfterFull.statusCode).toBe(200);
    expect(pnlAfterFull.body.revenue).toBe(0.00);
    expect(pnlAfterFull.body.netRevenue).toBe(0.00);
    expect(pnlAfterFull.body.totalTax).toBe(0.00);
    expect(pnlAfterFull.body.cogs).toBe(0.00);
    expect(pnlAfterFull.body.grossProfit).toBe(0.00);
  });

  test('F-7 (3): Tax-inclusive shop P&L subtracts pre-tax net refund amount (100) rather than shelf price (116)', async () => {
    const prod = await createProduct({ name: 'Inclusive Widget', price: 116.00, cost: 50.00, taxCategory: 'standard' });

    // Tax-inclusive sale of 2 units @ 116 shelf price: pre-tax subtotal = 200, tax = 32, total = 232
    const sale = await Sale.create({
      invoiceNumber: `INV-PNL-F7-INC-${Date.now()}`,
      subtotal: 200.00,
      discount: 0.00,
      tax: 32.00,
      taxRate: 16.00,
      total: 232.00,
      paymentAmount: 232.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      status: 'completed',
      shopId: TEST_SHOP_ID,
      metadata: { taxInclusive: true }
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 2,
      unitPrice: 116.00,
      price: 116.00,
      subtotal: 232.00,
      taxRate: 16.00,
      taxAmount: 32.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    // Refund 1 unit via endpoint -> shelf refund 116, tax 16, pre-tax netAmount 100
    const refundRes = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({ items: [{ productId: prod.id, quantity: 1, disposition: 'restock', reasonCode: 'DEFECTIVE' }] });
    expect(refundRes.statusCode).toBe(200);
    expect(refundRes.body.refunds[0].metadata.netAmount).toBe(100.00);
    expect(refundRes.body.refunds[0].metadata.taxAmount).toBe(16.00);

    const pnlRes = await request(app)
      .get('/api/reports/profit-loss')
      .set('Authorization', adminToken);
    expect(pnlRes.statusCode).toBe(200);
    expect(pnlRes.body.grossRevenue).toBe(200.00);
    expect(pnlRes.body.totalRefunds).toBe(100.00);
    expect(pnlRes.body.revenue).toBe(100.00);
    expect(pnlRes.body.totalTax).toBe(16.00);
  });

  test('F-7 (4 & 5 & 6): Legacy refund without metadata on taxable sale uses proportional pre-tax fallback, cross-period refund clamps to 0, and fractional rounding reconciles cleanly', async () => {
    const prod = await createProduct({ name: 'Legacy Taxable Item', price: 100.00, cost: 40.00, taxCategory: 'standard' });

    // Sale: 2 units @ 100 = 200 subtotal, 32 tax, 232 total
    const sale = await Sale.create({
      invoiceNumber: `INV-PNL-F7-LEG-${Date.now()}`,
      subtotal: 200.00,
      discount: 0.00,
      tax: 32.00,
      taxRate: 16.00,
      total: 232.00,
      paymentAmount: 232.00,
      paymentMethod: 'cash',
      saleStatus: 'partial_refund',
      status: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 2,
      unitPrice: 100.00,
      price: 100.00,
      subtotal: 200.00,
      taxRate: 16.00,
      taxAmount: 32.00,
      shopId: TEST_SHOP_ID
    });

    // Legacy refund row with NO metadata (amount = 116.00)
    await SaleRefund.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      amount: 116.00,
      refundAmount: 116.00,
      status: 'processed',
      disposition: 'restock',
      refundMethod: 'cash',
      shopId: TEST_SHOP_ID,
      metadata: {}
    });

    const pnlLegacy = await request(app)
      .get('/api/reports/profit-loss')
      .set('Authorization', adminToken);
    expect(pnlLegacy.statusCode).toBe(200);
    expect(pnlLegacy.body.totalRefunds).toBe(100.00);
    expect(pnlLegacy.body.refundedTax).toBe(16.00);
    expect(pnlLegacy.body.revenue).toBe(100.00);
    expect(pnlLegacy.body.totalTax).toBe(16.00);

    // Cross-period refund clamping: move sale createdAt to 2020 while refund stays today; query today's P&L
    await sequelize.query('UPDATE Sales SET createdAt = ? WHERE id = ?', {
      replacements: [new Date('2020-01-15T10:00:00Z'), sale.id]
    });
    const todayStr = new Date().toISOString().slice(0, 10);
    const pnlCrossPeriod = await request(app)
      .get(`/api/reports/profit-loss?startDate=${todayStr}&endDate=${todayStr}`)
      .set('Authorization', adminToken);
    expect(pnlCrossPeriod.statusCode).toBe(200);
    expect(pnlCrossPeriod.body.grossRevenue).toBe(0.00);
    expect(pnlCrossPeriod.body.totalRefunds).toBe(100.00);
    // Revenue must clamp to 0, never negative
    expect(pnlCrossPeriod.body.revenue).toBe(0.00);
    expect(pnlCrossPeriod.body.netRevenue).toBe(0.00);
  });
});
