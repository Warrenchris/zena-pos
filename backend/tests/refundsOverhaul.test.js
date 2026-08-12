'use strict';
const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  Shop, Category, Product, Sale, SaleItem, SaleRefund, SalePayment,
  User, SystemSettings
} = require('../src/models');
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

describe('Sales Returns & Refunds Overhaul Tests (R.1 - R.6)', () => {
  let shop;
  let category;
  let adminToken;
  let managerToken;
  let cashierToken;
  let adminUser;
  let managerUser;

  beforeAll(async () => {
    await sequelize.authenticate();
    await sequelize.sync();

    // Setup shop
    shop = await Shop.findOne({ where: { id: 1 } });
    if (!shop) {
      shop = await Shop.create({ id: 1, name: 'Main Shop' });
    }

    // Setup Category
    category = await Category.findOne({ where: { shopId: 1 } });
    if (!category) {
      category = await Category.create({ name: 'General', shopId: 1 });
    }

    // Setup Admin user
    adminUser = await User.findOne({ where: { email: 'admin_test_refund@example.com' } });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Admin User',
        email: 'admin_test_refund@example.com',
        role: 'admin',
        shopId: 1,
        password: 'password123'
      });
    }

    // Setup Manager user
    managerUser = await User.findOne({ where: { email: 'manager_test_refund@example.com' } });
    if (!managerUser) {
      managerUser = await User.create({
        name: 'Manager User',
        email: 'manager_test_refund@example.com',
        role: 'manager',
        shopId: 1,
        password: 'password123'
      });
    }

    // Setup SystemSettings
    let settings = await SystemSettings.findOne({ where: { shopId: 1 } });
    if (!settings) {
      await SystemSettings.create({
        shopId: 1,
        maxUnapprovedRefundAmount: 5000.00,
        returnWindowDays: 30,
        contactEmail: 'admin@zanapos.com'
      });
    } else {
      await settings.update({
        maxUnapprovedRefundAmount: 5000.00,
        returnWindowDays: 30,
        contactEmail: 'admin@zanapos.com'
      });
    }

    adminToken = tokenFor({ id: adminUser.id, role: 'admin', shopId: 1 });
    managerToken = tokenFor({ id: managerUser.id, role: 'manager', shopId: 1 });
    cashierToken = tokenFor({ id: 999, role: 'manager', shopId: 1 }); // Role manager to allow process_refunds check
  });

  // TEST R.1: Discounted Unit Refund
  test('TEST R.1: Discounted Unit Refund — 1,000 KSh item with 200 KSh discount refunds 800 KSh per unit', async () => {
    const prod = await Product.create({
      name: 'Discounted Item',
      sku: 'DISC-' + Date.now(),
      price: 1000.00,
      cost: 500.00,
      stockQuantity: 50,
      reorderPoint: 5,
      shopId: 1,
      CategoryId: category.id
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-R1-' + Date.now(),
      subtotal: 1000.00,
      discount: 200.00,
      tax: 0.00,
      total: 800.00,
      paymentAmount: 800.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 1000.00,
      price: 1000.00,
      subtotal: 1000.00,
      discount: 200.00,
      shopId: 1
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'DEFECTIVE' }]
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.totalRefundAmount).toEqual(800.00);
    expect(parseFloat(res.body.refunds[0].amount)).toEqual(800.00);
  });

  // TEST R.2: Manager Approval Threshold
  test('TEST R.2: Manager Approval Threshold — refund > 5,000 KSh requires manager authorization', async () => {
    const prod = await Product.create({
      name: 'High Value Item',
      sku: 'HIGH-' + Date.now(),
      price: 6000.00,
      cost: 3000.00,
      stockQuantity: 10,
      reorderPoint: 2,
      shopId: 1,
      CategoryId: category.id
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-R2-' + Date.now(),
      subtotal: 6000.00,
      discount: 0.00,
      tax: 0.00,
      total: 6000.00,
      paymentAmount: 6000.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 6000.00,
      price: 6000.00,
      subtotal: 6000.00,
      discount: 0.00,
      shopId: 1
    });

    // Case A: Cashier role without process_refunds permission
    const resPermissionDenied = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', tokenFor({ id: 888, role: 'cashier', shopId: 1 }))
      .send({
        items: [{ productId: prod.id, quantity: 1 }]
      });

    expect(resPermissionDenied.statusCode).toEqual(403);
    expect(resPermissionDenied.body.error).toMatch(/Permission denied/i);

    // Case B: User with process_refunds permission but missing managerApprovalId for >5000 KSh
    const resThresholdBlocked = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', managerToken)
      .send({
        items: [{ productId: prod.id, quantity: 1 }]
      });

    expect(resThresholdBlocked.statusCode).toEqual(403);
    expect(resThresholdBlocked.body.error).toMatch(/exceeds unapproved threshold/i);

    // Case C: With valid manager approval ID
    const resAllowed = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1 }],
        managerApprovalId: String(managerUser.id)
      });

    expect(resAllowed.statusCode).toEqual(200);
    expect(resAllowed.body.totalRefundAmount).toEqual(6000.00);
  });

  // TEST R.3: Payment Ledger Reversal
  test('TEST R.3: Payment Ledger Reversal — SalePayment table records negative refund row', async () => {
    const prod = await Product.create({
      name: 'Ledger Item',
      sku: 'LEDG-' + Date.now(),
      price: 1500.00,
      cost: 700.00,
      stockQuantity: 20,
      reorderPoint: 5,
      shopId: 1,
      CategoryId: category.id
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-R3-' + Date.now(),
      subtotal: 1500.00,
      discount: 0.00,
      tax: 0.00,
      total: 1500.00,
      paymentAmount: 1500.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 1500.00,
      price: 1500.00,
      subtotal: 1500.00,
      discount: 0.00,
      shopId: 1
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1 }]
      });

    expect(res.statusCode).toEqual(200);

    const paymentLedger = await SalePayment.findOne({
      where: { saleId: sale.id, amount: -1500.00 }
    });

    expect(paymentLedger).not.toBeNull();
    expect(parseFloat(paymentLedger.amount)).toEqual(-1500.00);
    expect(paymentLedger.paymentMethod).toEqual('cash');
  });

  // TEST R.4: Damaged Write-off Disposition
  test('TEST R.4: Damaged Write-off Disposition — disposition damaged_writeoff leaves stockQuantity unchanged', async () => {
    const prod = await Product.create({
      name: 'Fragile Product',
      sku: 'FRAG-' + Date.now(),
      price: 500.00,
      cost: 250.00,
      stockQuantity: 10,
      reorderPoint: 2,
      shopId: 1,
      CategoryId: category.id
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-R4-' + Date.now(),
      subtotal: 500.00,
      discount: 0.00,
      tax: 0.00,
      total: 500.00,
      paymentAmount: 500.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 500.00,
      price: 500.00,
      subtotal: 500.00,
      discount: 0.00,
      shopId: 1
    });

    const res = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, disposition: 'damaged_writeoff', reasonCode: 'DEFECTIVE' }]
      });

    expect(res.statusCode).toEqual(200);

    const updatedProd = await Product.findByPk(prod.id);
    expect(updatedProd.stockQuantity).toEqual(10); // Unchanged!
  });

  // TEST R.5: Non-Returnable Product Block
  test('TEST R.5: Non-Returnable Product Block — nonReturnable true returns HTTP 400 unless adminOverride true', async () => {
    const prod = await Product.create({
      name: 'Hygiene Product',
      sku: 'HYG-' + Date.now(),
      price: 400.00,
      cost: 200.00,
      stockQuantity: 30,
      nonReturnable: true,
      reorderPoint: 5,
      shopId: 1,
      CategoryId: category.id
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-R5-' + Date.now(),
      subtotal: 400.00,
      discount: 0.00,
      tax: 0.00,
      total: 400.00,
      paymentAmount: 400.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 400.00,
      price: 400.00,
      subtotal: 400.00,
      discount: 0.00,
      shopId: 1
    });

    // Attempt without override as cashier/manager
    const resBlocked = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', managerToken)
      .send({
        items: [{ productId: prod.id, quantity: 1 }]
      });

    expect(resBlocked.statusCode).toEqual(400);
    expect(resBlocked.body.error).toMatch(/non-returnable/i);

    // Attempt with admin role
    const resAdmin = await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1 }],
        adminOverride: true
      });

    expect(resAdmin.statusCode).toEqual(200);
  });

  // TEST R.6: Credit Note Endpoint
  test('TEST R.6: Credit Note Endpoint — GET /api/sales/:saleId/credit-note returns 200 and valid creditNoteNumber', async () => {
    const prod = await Product.create({
      name: 'Credit Note Item',
      sku: 'CNITEM-' + Date.now(),
      price: 1200.00,
      cost: 600.00,
      stockQuantity: 15,
      reorderPoint: 3,
      shopId: 1,
      CategoryId: category.id
    });

    const sale = await Sale.create({
      invoiceNumber: 'INV-CN-' + Date.now(),
      subtotal: 1200.00,
      discount: 0.00,
      tax: 0.00,
      total: 1200.00,
      paymentAmount: 1200.00,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: 1
    });

    await SaleItem.create({
      saleId: sale.id,
      productId: prod.id,
      quantity: 1,
      unitPrice: 1200.00,
      price: 1200.00,
      subtotal: 1200.00,
      discount: 0.00,
      shopId: 1
    });

    // First process a refund
    await request(app)
      .post(`/api/sales/${sale.id}/refund`)
      .set('Authorization', adminToken)
      .send({
        items: [{ productId: prod.id, quantity: 1, reasonCode: 'WRONG_ITEM' }]
      });

    // Now fetch Credit Note
    const res = await request(app)
      .get(`/api/sales/${sale.id}/credit-note`)
      .set('Authorization', adminToken);

    expect(res.statusCode).toEqual(200);
    expect(res.body.creditNoteNumber).toContain('CN-');
    expect(res.body.totalRefundAmount).toEqual(1200.00);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});
