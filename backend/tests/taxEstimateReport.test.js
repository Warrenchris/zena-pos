'use strict';

const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Organization, Category, Product, Sale, SaleItem,
  SaleRefund, User, SystemSettings
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

describe('Tax Estimate Report Breakdown Tests (Phase 7C Commit 4)', () => {
  const TEST_SHOP_ID = 804;
  const TEST_ORG_ID = 804;
  const ADMIN_USER_ID = 88401;

  let adminToken;
  let adminUser;
  let skuCounter = 1;

  const createProduct = async (attrs) => {
    return Product.create({
      sku: `SKU-TAXREP-${Date.now()}-${skuCounter++}`,
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
        name: 'Tax Estimate Org',
        slug: 'tax-estimate-org',
        status: 'active'
      }
    });

    await Shop.findOrCreate({
      where: { id: TEST_SHOP_ID },
      defaults: {
        name: 'Tax Estimate Shop',
        organizationId: TEST_ORG_ID
      }
    });

    [adminUser] = await User.findOrCreate({
      where: { id: ADMIN_USER_ID },
      defaults: {
        name: 'Tax Estimate Admin',
        email: 'tax_estimate_admin_88401@example.com',
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

    await SystemSettings.findOrCreate({
      where: { shopId: TEST_SHOP_ID },
      defaults: {
        taxRate: 16.00,
        taxInclusive: false
      }
    });
    await SystemSettings.update(
      { taxRate: 16.00, taxInclusive: false },
      { where: { shopId: TEST_SHOP_ID } }
    );
  });

  beforeEach(async () => {
    // Clear sales and items for this test shop to guarantee pure isolation per test
    const sales = await Sale.findAll({ where: { shopId: TEST_SHOP_ID }, attributes: ['id'] });
    const saleIds = sales.map(s => s.id);
    if (saleIds.length > 0) {
      await SaleRefund.destroy({ where: { saleId: saleIds } }).catch(() => {});
      await SaleItem.destroy({ where: { saleId: saleIds } }).catch(() => {});
      await Sale.destroy({ where: { id: saleIds } }).catch(() => {});
    }
  });

  // Test 1: Pure Zero-Rated Sales — report returns 0 estimated tax instead of 16% guess
  test('Test 1: Zero-Rated goods report 0 tax instead of 16% flat multiplication', async () => {
    const prod = await createProduct({
      name: 'Maize Flour',
      price: 1000.00,
      cost: 700.00,
      taxCategory: 'zero_rated'
    });

    // Sale of 1000 KSh zero-rated flour
    const sale = await Sale.create({
      invoiceNumber: `INV-TAX-ZR-${Date.now()}`,
      subtotal: 1000.00,
      tax: 0.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 1000.00,
      paymentAmount: 1000.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 1000.00,
      price: 1000.00,
      subtotal: 1000.00,
      taxRate: 0.00,
      taxAmount: 0.00,
      metadata: { taxCategory: 'zero_rated' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .get('/api/reports/tax-estimate')
      .set('Authorization', adminToken);

    expect(res.statusCode).toBe(200);
    // Old implementation would have returned 160.00 (1000 * 0.16)
    // New implementation must return 0.00 because recorded tax is 0.00
    expect(res.body.estimatedTax).toBe(0.00);
    expect(res.body.totalTax).toBe(0.00);
    expect(res.body.categories.zero_rated.taxableAmount).toBe(1000.00);
    expect(res.body.categories.zero_rated.taxAmount).toBe(0.00);
    expect(res.body.categories.standard.taxAmount).toBe(0.00);
  });

  // Test 2: Pure Exempt Sales — report returns 0 estimated tax
  test('Test 2: Exempt goods report 0 tax and categorizes under exempt', async () => {
    const prod = await createProduct({
      name: 'Antibiotics',
      price: 500.00,
      cost: 250.00,
      taxCategory: 'exempt'
    });

    const sale = await Sale.create({
      invoiceNumber: `INV-TAX-EX-${Date.now()}`,
      subtotal: 500.00,
      tax: 0.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 500.00,
      paymentAmount: 500.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 500.00,
      price: 500.00,
      subtotal: 500.00,
      taxRate: 0.00,
      taxAmount: 0.00,
      metadata: { taxCategory: 'exempt' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .get('/api/reports/tax-estimate')
      .set('Authorization', adminToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.estimatedTax).toBe(0.00);
    expect(res.body.categories.exempt.taxableAmount).toBe(500.00);
    expect(res.body.categories.exempt.taxAmount).toBe(0.00);
  });

  // Test 3: Mixed Sales — breakdown accurately groups standard, zero-rated and exempt
  test('Test 3: Mixed cart report equals sum of recorded taxes grouped by category', async () => {
    const prodStd = await createProduct({ name: 'Juice', price: 1000.00, cost: 500.00, taxCategory: 'standard' });
    const prodZero = await createProduct({ name: 'Milk', price: 500.00, cost: 300.00, taxCategory: 'zero_rated' });
    const prodExempt = await createProduct({ name: 'Panadol', price: 300.00, cost: 150.00, taxCategory: 'exempt' });

    // Sale: Std 1000 (tax 160) + Zero 500 (tax 0) + Exempt 300 (tax 0) = Subtotal 1800, Tax 160, Total 1960
    const sale = await Sale.create({
      invoiceNumber: `INV-TAX-MIX-${Date.now()}`,
      subtotal: 1800.00,
      tax: 160.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 1960.00,
      paymentAmount: 1960.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodStd.id,
      quantity: 1,
      unitPrice: 1000.00,
      price: 1000.00,
      subtotal: 1000.00,
      taxRate: 16.00,
      taxAmount: 160.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodZero.id,
      quantity: 1,
      unitPrice: 500.00,
      price: 500.00,
      subtotal: 500.00,
      taxRate: 0.00,
      taxAmount: 0.00,
      metadata: { taxCategory: 'zero_rated' },
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodExempt.id,
      quantity: 1,
      unitPrice: 300.00,
      price: 300.00,
      subtotal: 300.00,
      taxRate: 0.00,
      taxAmount: 0.00,
      metadata: { taxCategory: 'exempt' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .get('/api/reports/tax-estimate')
      .set('Authorization', adminToken);

    expect(res.statusCode).toBe(200);
    // Total estimated tax is recorded tax (160.00), NOT 1800 * 0.16 = 288.00!
    expect(res.body.estimatedTax).toBe(160.00);
    expect(res.body.totalTax).toBe(160.00);
    expect(res.body.taxableRevenue).toBe(1800.00);

    // Check categories breakdown
    expect(res.body.categories.standard.taxableAmount).toBe(1000.00);
    expect(res.body.categories.standard.taxAmount).toBe(160.00);
    expect(res.body.categories.zero_rated.taxableAmount).toBe(500.00);
    expect(res.body.categories.zero_rated.taxAmount).toBe(0.00);
    expect(res.body.categories.exempt.taxableAmount).toBe(300.00);
    expect(res.body.categories.exempt.taxAmount).toBe(0.00);

    // Check breakdown array format
    expect(res.body.breakdown).toHaveLength(3);
    const stdRow = res.body.breakdown.find(b => b.category === 'standard');
    expect(stdRow.taxAmount).toBe(160.00);
    expect(stdRow.taxableAmount).toBe(1000.00);
  });

  // Test 4: Refund Reduction — processed refunds deduct from recorded tax and revenue
  test('Test 4: Processed refunds deduct from category tax and net taxable revenue', async () => {
    const prodStd = await createProduct({ name: 'Refundable Widget', price: 1000.00, cost: 500.00, taxCategory: 'standard' });

    const sale = await Sale.create({
      invoiceNumber: `INV-TAX-REF-${Date.now()}`,
      subtotal: 1000.00,
      tax: 160.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 1160.00,
      paymentAmount: 1160.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodStd.id,
      quantity: 1,
      unitPrice: 1000.00,
      price: 1000.00,
      subtotal: 1000.00,
      taxRate: 16.00,
      taxAmount: 160.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    // Create a processed refund record backing out the item and tax
    await SaleRefund.create({
      saleId: sale.id,
      productId: prodStd.id,
      quantity: 1,
      amount: 1160.00,
      refundAmount: 1160.00,
      status: 'processed',
      refundMethod: 'cash',
      shopId: TEST_SHOP_ID,
      metadata: {
        taxAmount: 160.00,
        netAmount: 1000.00,
        taxCategory: 'standard',
        taxRate: 16.00
      }
    });

    const res = await request(app)
      .get('/api/reports/tax-estimate')
      .set('Authorization', adminToken);

    expect(res.statusCode).toBe(200);
    // After refund of the entire sale, net taxable revenue and net tax should be 0
    expect(res.body.estimatedTax).toBe(0.00);
    expect(res.body.categories.standard.taxAmount).toBe(0.00);
    expect(res.body.categories.standard.taxableAmount).toBe(0.00);
  });

  // Test 5: Fallback behavior for legacy sales without SaleItem rows
  test('Test 5: Fallback gracefully uses Sale.tax when SaleItem rows are absent', async () => {
    // Sale with recorded tax directly on Sale record, but no SaleItem rows
    await Sale.create({
      invoiceNumber: `INV-TAX-LEGACY-${Date.now()}`,
      subtotal: 2000.00,
      tax: 320.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 2320.00,
      paymentAmount: 2320.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .get('/api/reports/tax-estimate')
      .set('Authorization', adminToken);

    expect(res.statusCode).toBe(200);
    expect(res.body.estimatedTax).toBe(320.00);
    expect(res.body.taxableRevenue).toBe(2000.00);
    expect(res.body.categories.standard.taxAmount).toBe(320.00);
  });
});
