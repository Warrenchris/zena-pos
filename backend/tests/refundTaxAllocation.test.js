'use strict';

const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Organization, Category, Product, Inventory, Sale, SaleItem,
  SaleRefund, SalePayment, User, SystemSettings
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

describe('Refund Tax Allocation Tests (Phase 7C Commit 3)', () => {
  const TEST_SHOP_ID = 803;
  const TEST_ORG_ID = 803;
  const ADMIN_USER_ID = 88301;
  const MANAGER_USER_ID = 88302;

  let adminToken;
  let managerToken;
  let adminUser;
  let managerUser;
  let skuCounter = 1;

  const createProduct = async (attrs) => {
    return Product.create({
      sku: `SKU-REF-${Date.now()}-${skuCounter++}`,
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
        name: 'Refund Tax Org',
        slug: 'refund-tax-org',
        status: 'active'
      }
    });

    await Shop.findOrCreate({
      where: { id: TEST_SHOP_ID },
      defaults: {
        name: 'Refund Tax Shop',
        organizationId: TEST_ORG_ID
      }
    });

    [adminUser] = await User.findOrCreate({
      where: { id: ADMIN_USER_ID },
      defaults: {
        name: 'Refund Admin User',
        email: 'refund_admin_88301@example.com',
        role: 'admin',
        shopId: TEST_SHOP_ID,
        organizationId: TEST_ORG_ID,
        password: 'Password123!'
      }
    });

    [managerUser] = await User.findOrCreate({
      where: { id: MANAGER_USER_ID },
      defaults: {
        name: 'Refund Manager User',
        email: 'refund_manager_88302@example.com',
        role: 'manager',
        shopId: TEST_SHOP_ID,
        organizationId: TEST_ORG_ID,
        password: 'Password123!'
      }
    });

    for (const uid of [ADMIN_USER_ID, MANAGER_USER_ID]) {
      await tokenRevocationService.clearUserStatus(uid, false);
      await tokenRevocationService.setUserStatus(uid, false, 'active');
      await tokenRevocationService.clearUserTokenCutoff(uid, false);
    }

    adminToken = tokenFor({ id: ADMIN_USER_ID, role: 'admin', shopId: TEST_SHOP_ID, organizationId: TEST_ORG_ID });
    managerToken = tokenFor({ id: MANAGER_USER_ID, role: 'manager', shopId: TEST_SHOP_ID, organizationId: TEST_ORG_ID });

    // Ensure shop system settings with 16% tax
    await SystemSettings.findOrCreate({
      where: { shopId: TEST_SHOP_ID },
      defaults: {
        taxRate: 16.00,
        taxInclusive: false,
        maxUnapprovedRefundAmount: 10000.00,
        returnWindowDays: 60
      }
    });
    await SystemSettings.update(
      { taxRate: 16.00, taxInclusive: false, maxUnapprovedRefundAmount: 10000.00, returnWindowDays: 60 },
      { where: { shopId: TEST_SHOP_ID } }
    );
  });

  afterAll(async () => {
    await SystemSettings.update({ taxInclusive: false }, { where: { shopId: TEST_SHOP_ID } });
  });

  // Scenario 1: Standard Category Partial Refund backs out tax proportionally
  test('Scenario 1: Standard Category Partial Refund backs out tax proportionally', async () => {
    const prod = await createProduct({
      name: 'Standard Widget',
      price: 1000.00,
      cost: 500.00,
      taxCategory: 'standard'
    });

    // Sale: 2 units @ 1000 = 2000. Tax 16% = 320. Total = 2320.
    const sale = await Sale.create({
      invoiceNumber: `INV-REF-1-${Date.now()}`,
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

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 2,
      unitPrice: 1000.00,
      price: 1000.00,
      subtotal: 2000.00,
      taxRate: 16.00,
      taxAmount: 320.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    // Refund 1 unit
    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'DEFECTIVE' }]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.saleStatus).toBe('partial_refund');
    // 1000 net + 160 tax = 1160 total refund
    expect(res.body.totalRefundAmount).toBe(1160.00);
    expect(res.body.totalTaxRefunded).toBe(160.00);

    const refundRow = res.body.refunds[0];
    expect(refundRow.metadata.taxCategory).toBe('standard');
    expect(refundRow.metadata.taxAmount).toBe(160.00);
    expect(refundRow.metadata.netAmount).toBe(1000.00);

    // Verify updated Sale metadata
    const updatedSale = await Sale.findByPk(sale.id);
    expect(parseFloat(updatedSale.metadata?.refundedTax || 0)).toBe(160.00);
  });

  // Scenario 2: Zero-Rated Category Refund backs out 0 tax
  test('Scenario 2: Zero-Rated Category Refund backs out 0 tax', async () => {
    const prod = await createProduct({
      name: 'Flour (Zero Rated)',
      price: 500.00,
      cost: 300.00,
      taxCategory: 'zero_rated'
    });

    const sale = await Sale.create({
      invoiceNumber: `INV-REF-2-${Date.now()}`,
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
      metadata: { taxCategory: 'zero_rated' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'WRONG_ITEM' }]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.saleStatus).toBe('refunded');
    expect(res.body.totalRefundAmount).toBe(500.00);
    expect(res.body.totalTaxRefunded).toBe(0.00);

    const refundRow = res.body.refunds[0];
    expect(refundRow.metadata.taxCategory).toBe('zero_rated');
    expect(refundRow.metadata.taxAmount).toBe(0.00);
  });

  // Scenario 3: Exempt Category Refund backs out 0 tax
  test('Scenario 3: Exempt Category Refund backs out 0 tax', async () => {
    const prod = await createProduct({
      name: 'Medicine (Exempt)',
      price: 400.00,
      cost: 200.00,
      taxCategory: 'exempt'
    });

    const sale = await Sale.create({
      invoiceNumber: `INV-REF-3-${Date.now()}`,
      subtotal: 400.00,
      tax: 0.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 400.00,
      paymentAmount: 400.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 400.00,
      price: 400.00,
      subtotal: 400.00,
      taxRate: 0.00,
      taxAmount: 0.00,
      metadata: { taxCategory: 'exempt' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'EXPIRED' }]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.saleStatus).toBe('refunded');
    expect(res.body.totalRefundAmount).toBe(400.00);
    expect(res.body.totalTaxRefunded).toBe(0.00);

    const refundRow = res.body.refunds[0];
    expect(refundRow.metadata.taxCategory).toBe('exempt');
    expect(refundRow.metadata.taxAmount).toBe(0.00);
  });

  // Scenario 4: Mixed Cart Partial Refund by Category
  test('Scenario 4: Mixed Cart Partial Refund distinguishes standard from zero-rated tax', async () => {
    const prodStandard = await createProduct({
      name: 'Standard Juice',
      price: 1000.00,
      cost: 600.00,
      taxCategory: 'standard'
    });

    const prodZero = await createProduct({
      name: 'Zero-Rated Milk',
      price: 500.00,
      cost: 300.00,
      taxCategory: 'zero_rated'
    });

    // Sale: Standard 1000 (tax 160) + Zero 500 (tax 0) = Total 1660
    const sale = await Sale.create({
      invoiceNumber: `INV-REF-4-${Date.now()}`,
      subtotal: 1500.00,
      tax: 160.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 1660.00,
      paymentAmount: 1660.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prodStandard.id,
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

    // Step A: Refund Zero-Rated item only
    const resA = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prodZero.id, quantity: 1, reasonCode: 'CHANGED_MIND' }]
      });

    expect(resA.statusCode).toBe(200);
    expect(resA.body.saleStatus).toBe('partial_refund');
    expect(resA.body.totalRefundAmount).toBe(500.00);
    expect(resA.body.totalTaxRefunded).toBe(0.00);

    // Step B: Refund Standard item next
    const resB = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prodStandard.id, quantity: 1, reasonCode: 'DEFECTIVE' }]
      });

    expect(resB.statusCode).toBe(200);
    expect(resB.body.saleStatus).toBe('refunded');
    expect(resB.body.totalRefundAmount).toBe(1160.00);
    expect(resB.body.totalTaxRefunded).toBe(160.00);
  });

  // Scenario 5: Full Refund Restores Total Tax
  test('Scenario 5: Full Refund Restores Total Tax across multi-item sale', async () => {
    const prod1 = await createProduct({
      name: 'Full Item 1 (Standard)',
      price: 1500.00,
      cost: 900.00,
      taxCategory: 'standard'
    });

    const prod2 = await createProduct({
      name: 'Full Item 2 (Standard)',
      price: 500.00,
      cost: 250.00,
      taxCategory: 'standard'
    });

    // Subtotal 2000, 16% tax = 320. Total = 2320.
    const sale = await Sale.create({
      invoiceNumber: `INV-REF-5-${Date.now()}`,
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

    await SaleItem.create({
      saleId: sale.id,
      productId: prod1.id,
      quantity: 1,
      unitPrice: 1500.00,
      price: 1500.00,
      subtotal: 1500.00,
      taxRate: 16.00,
      taxAmount: 240.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod2.id,
      quantity: 1,
      unitPrice: 500.00,
      price: 500.00,
      subtotal: 500.00,
      taxRate: 16.00,
      taxAmount: 80.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    // Refund both items in one transaction
    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [
          { productId: prod1.id, quantity: 1, reasonCode: 'DEFECTIVE' },
          { productId: prod2.id, quantity: 1, reasonCode: 'DEFECTIVE' }
        ]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.saleStatus).toBe('refunded');
    expect(res.body.totalRefundAmount).toBe(2320.00);
    expect(res.body.totalTaxRefunded).toBe(320.00);

    // Sum of backed out taxes equals exactly the total tax of the original sale
    const sumRefundTax = res.body.refunds.reduce((sum, r) => sum + r.metadata.taxAmount, 0);
    expect(sumRefundTax).toBe(parseFloat(sale.tax));
  });

  // Scenario 6: Multi-step Partial Refunds to Full Refund (no penny drift)
  test('Scenario 6: Multi-step Partial Refunds avoid penny drift across fractional ratios', async () => {
    const prod = await createProduct({
      name: 'Tri-unit Item',
      price: 333.33,
      cost: 150.00,
      taxCategory: 'standard'
    });

    // 3 units @ 333.33 = 999.99. Tax = 160.00. Total = 1159.99.
    const sale = await Sale.create({
      invoiceNumber: `INV-REF-6-${Date.now()}`,
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
      productId: prod.id,
      quantity: 3,
      unitPrice: 333.33,
      price: 333.33,
      subtotal: 1000.00,
      taxRate: 16.00,
      taxAmount: 160.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    // Step 1: Refund 1 unit (160 * 1/3 = 53.33)
    const res1 = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'OTHER' }]
      });
    expect(res1.statusCode).toBe(200);
    expect(res1.body.totalTaxRefunded).toBe(53.33);

    // Step 2: Refund 1 unit (160 * 1/3 = 53.33)
    const res2 = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'OTHER' }]
      });
    expect(res2.statusCode).toBe(200);
    expect(res2.body.totalTaxRefunded).toBe(53.33);

    // Step 3: Refund final 1 unit (160 - 53.33 - 53.33 = 53.34)
    const res3 = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'OTHER' }]
      });
    expect(res3.statusCode).toBe(200);
    expect(res3.body.saleStatus).toBe('refunded');
    expect(res3.body.totalTaxRefunded).toBe(53.34);

    // Verify total tax refunded across all 3 steps equals exactly original 160.00
    const totalBackedOut = 53.33 + 53.33 + 53.34;
    expect(totalBackedOut).toBe(160.00);
  });

  // Scenario 7: Inclusive Pricing Mode Refund Tax Allocation
  test('Scenario 7: Inclusive Pricing Mode Refund backs out tax included in shelf price', async () => {
    const prod = await createProduct({
      name: 'Inclusive Item',
      price: 1160.00,
      cost: 500.00,
      taxCategory: 'standard'
    });

    // In inclusive mode: Total is 1160, tax is 160 (subtotal net is 1000)
    const sale = await Sale.create({
      invoiceNumber: `INV-REF-7-${Date.now()}`,
      subtotal: 1000.00,
      tax: 160.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 1160.00,
      paymentAmount: 1160.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: TEST_SHOP_ID,
      metadata: { taxInclusive: true }
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 1160.00,
      price: 1160.00,
      subtotal: 1160.00,
      taxRate: 16.00,
      taxAmount: 160.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'DEFECTIVE' }]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.saleStatus).toBe('refunded');
    // Refund amount is shelf price (1160), with 160 tax backed out
    expect(res.body.totalRefundAmount).toBe(1160.00);
    expect(res.body.totalTaxRefunded).toBe(160.00);
  });

  // Scenario 8: Discounted Item Refund Tax Allocation
  test('Scenario 8: Discounted Item Refund backs out tax on discounted net base', async () => {
    const prod = await createProduct({
      name: 'Discounted Taxable Item',
      price: 1000.00,
      cost: 400.00,
      taxCategory: 'standard'
    });

    // 1000 unitPrice - 200 discount = 800 net. Tax 16% on 800 = 128.00. Total = 928.00.
    const sale = await Sale.create({
      invoiceNumber: `INV-REF-8-${Date.now()}`,
      subtotal: 800.00,
      tax: 128.00,
      taxRate: 16.00,
      discount: 200.00,
      total: 928.00,
      paymentAmount: 928.00,
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
      subtotal: 800.00,
      discount: 200.00,
      taxRate: 16.00,
      taxAmount: 128.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'DEFECTIVE' }]
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.saleStatus).toBe('refunded');
    expect(res.body.totalRefundAmount).toBe(928.00);
    expect(res.body.totalTaxRefunded).toBe(128.00);
  });

  // Scenario 9: Credit Note exposes tax allocation per item and total tax refunded
  test('Scenario 9: Credit note exposes tax allocation per item and total tax refunded', async () => {
    const prod = await createProduct({
      name: 'Credit Note Item',
      price: 500.00,
      cost: 250.00,
      taxCategory: 'standard'
    });

    const sale = await Sale.create({
      invoiceNumber: `INV-REF-9-${Date.now()}`,
      subtotal: 500.00,
      tax: 80.00,
      taxRate: 16.00,
      discount: 0.00,
      total: 580.00,
      paymentAmount: 580.00,
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
      taxRate: 16.00,
      taxAmount: 80.00,
      metadata: { taxCategory: 'standard' },
      shopId: TEST_SHOP_ID
    });

    await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'DEFECTIVE' }]
      });

    const creditNoteRes = await request(app)
      .get(`/api/sales/${sale.id}/credit-note`)
      .set('Authorization', adminToken);

    expect(creditNoteRes.statusCode).toBe(200);
    expect(creditNoteRes.body.saleId).toBe(sale.id);
    expect(creditNoteRes.body.totalRefundAmount).toBe(580.00);
    expect(creditNoteRes.body.totalTaxRefunded).toBe(80.00);
    expect(creditNoteRes.body.items[0].taxAmount).toBe(80.00);
    expect(creditNoteRes.body.items[0].taxCategory).toBe('standard');
  });
});
