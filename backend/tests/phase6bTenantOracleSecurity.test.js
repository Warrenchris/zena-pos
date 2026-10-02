'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Shop,
  Organization,
  Category,
  Product,
  Inventory,
  Sale,
  SaleItem,
  Invoice,
  InvoiceItem
} = require('../src/models');

function getPrivateKey() {
  const fs = require('fs');
  const path = require('path');
  return process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
}

function tokenFor(payload) {
  const privateKey = getPrivateKey();
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 6B-05: Cross-Tenant ID-Oracle Normalization (ORAC-01)', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB;
  let adminA, managerA, cashierA, customerA, adminB, superAdmin;
  let tokenAdminA, tokenManagerA, tokenCashierA, tokenCustomerA, tokenAdminB, tokenSuperAdmin;
  let productA1, saleA1, invoiceA1;
  let productB, saleB, invoiceB;

  beforeAll(async () => {
    await sequelize.authenticate();
  }, 30000);

  beforeEach(async () => {
    const ts = Date.now() + '-' + Math.floor(Math.random() * 100000);

    // Organization A
    orgA = await Organization.create({
      name: `Org A ${ts}`,
      slug: `org-a-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // Shop A1 (Branch 1)
    shopA1 = await Shop.create({
      name: `Shop A1 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    // Shop A2 (Branch 2 in same org)
    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    // Organization B (Tenant B)
    orgB = await Organization.create({
      name: `Org B ${ts}`,
      slug: `org-b-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // Shop B in Org B
    shopB = await Shop.create({
      name: `Shop B ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // Users in Shop A1
    adminA = await User.create({
      name: `Admin A ${ts}`,
      email: `admin-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    managerA = await User.create({
      name: `Manager A ${ts}`,
      email: `manager-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    cashierA = await User.create({
      name: `Cashier A ${ts}`,
      email: `cashier-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    const customerUserA = await User.create({
      name: `Customer A ${ts}`,
      email: `customer-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    // User in Shop B
    adminB = await User.create({
      name: `Admin B ${ts}`,
      email: `admin-b-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id
    });

    // Tokens
    tokenAdminA = tokenFor({
      id: adminA.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenManagerA = tokenFor({
      id: managerA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenCashierA = tokenFor({
      id: cashierA.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenCustomerA = tokenFor({
      id: customerUserA.id,
      role: 'customer',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    tokenAdminB = tokenFor({
      id: adminB.id,
      role: 'admin',
      shopId: shopB.id,
      organizationId: orgB.id,
      isEmployee: false
    });

    tokenSuperAdmin = tokenFor({
      id: adminA.id,
      role: 'super_admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    // Products & Inventory for Shop A1
    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      price: 150,
      cost: 75,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 100,
      reorderPoint: 10
    });

    // Products & Inventory for Shop B
    productB = await Product.create({
      name: `Product B ${ts}`,
      sku: `SKU-B-${ts}`,
      price: 250,
      cost: 125,
      shopId: shopB.id,
      organizationId: orgB.id,
      active: true
    });

    await Inventory.create({
      productId: productB.id,
      shopId: shopB.id,
      stockQuantity: 50,
      reorderPoint: 5
    });

    // Sale & SaleItem in Shop A1
    saleA1 = await Sale.create({
      shopId: shopA1.id,
      organizationId: orgA.id,
      userId: cashierA.id,
      invoiceNumber: `INV-A1-${ts}`,
      subtotal: 150,
      total: 150,
      paymentAmount: 150,
      paymentMethod: 'cash',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleA1.id,
      shopId: shopA1.id,
      productId: productA1.id,
      quantity: 1,
      unitPrice: 150,
      price: 150,
      subtotal: 150
    });

    // Invoice in Shop A1
    invoiceA1 = await Invoice.create({
      shopId: shopA1.id,
      userId: adminA.id,
      invoiceNumber: `DOC-A1-${ts}`,
      saleId: saleA1.id,
      status: 'pending',
      subtotal: 150,
      total: 150,
      discount: 0,
      tax: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    // Sale & SaleItem in Shop B
    saleB = await Sale.create({
      shopId: shopB.id,
      organizationId: orgB.id,
      userId: adminB.id,
      invoiceNumber: `INV-B-${ts}`,
      subtotal: 250,
      total: 250,
      paymentAmount: 250,
      paymentMethod: 'cash',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleB.id,
      shopId: shopB.id,
      productId: productB.id,
      quantity: 1,
      unitPrice: 250,
      price: 250,
      subtotal: 250
    });

    // Invoice in Shop B
    invoiceB = await Invoice.create({
      shopId: shopB.id,
      userId: adminB.id,
      invoiceNumber: `DOC-B-${ts}`,
      saleId: saleB.id,
      status: 'pending',
      subtotal: 250,
      total: 250,
      discount: 0,
      tax: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  });

  describe('1. Sale Refund Oracle Elimination (processRefund)', () => {
    const nonexistentSaleId = 999999999;

    test('1.1: Non-existent sale refund returns 404 with standard error body', async () => {
      const res = await request(app)
        .post(`/api/sales/${nonexistentSaleId}/refund`)
        .set('Authorization', tokenAdminA)
        .send({
          items: [{ productId: productA1.id, quantity: 1 }]
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('1.2: Cross-shop / cross-tenant sale refund returns 404 (indistinguishable from non-existent)', async () => {
      // Admin A attempts to refund a sale belonging to Shop B
      const res = await request(app)
        .post(`/api/sales/${saleB.id}/refund`)
        .set('Authorization', tokenAdminA)
        .send({
          items: [{ productId: productA1.id, quantity: 1 }]
        });

      // Crucial: Must return 404, NOT 403
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('1.3: Non-existent vs Cross-shop refund responses have identical status code and payload structure', async () => {
      const resNonexistent = await request(app)
        .post(`/api/sales/${nonexistentSaleId}/refund`)
        .set('Authorization', tokenAdminA)
        .send({ items: [{ productId: productA1.id, quantity: 1 }] });

      const resCrossShop = await request(app)
        .post(`/api/sales/${saleB.id}/refund`)
        .set('Authorization', tokenAdminA)
        .send({ items: [{ productId: productA1.id, quantity: 1 }] });

      expect(resNonexistent.status).toBe(404);
      expect(resCrossShop.status).toBe(404);
      expect(resNonexistent.body).toEqual(resCrossShop.body);
    });

    test('1.4: Same-shop refund passes ownership validation and processes successfully', async () => {
      const res = await request(app)
        .post(`/api/sales/${saleA1.id}/refund`)
        .set('Authorization', tokenAdminA)
        .send({
          items: [{ productId: productA1.id, quantity: 1, reasonNotes: 'Customer return' }]
        });

      expect(res.status).toBe(200);
      expect(res.body.totalRefundAmount).toBe(150);
      expect(Array.isArray(res.body.refunds)).toBe(true);
      expect(res.body.refunds.length).toBe(1);
    });
  });

  describe('2. Invoice PDF Oracle Elimination (generatePDF)', () => {
    const nonexistentInvoiceId = 999999999;

    test('2.1: Non-existent invoice PDF returns 404', async () => {
      const res = await request(app)
        .get(`/api/invoices/${nonexistentInvoiceId}/pdf`)
        .set('Authorization', tokenAdminA);

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('2.2: Cross-shop / cross-tenant invoice PDF returns 404 (indistinguishable from non-existent)', async () => {
      // Admin A attempts to generate PDF for an invoice in Shop B
      const res = await request(app)
        .get(`/api/invoices/${invoiceB.id}/pdf`)
        .set('Authorization', tokenAdminA);

      // Crucial: Must return 404, NOT 403
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    test('2.3: Non-existent vs Cross-shop invoice PDF responses have identical status and body', async () => {
      const resNonexistent = await request(app)
        .get(`/api/invoices/${nonexistentInvoiceId}/pdf`)
        .set('Authorization', tokenAdminA);

      const resCrossShop = await request(app)
        .get(`/api/invoices/${invoiceB.id}/pdf`)
        .set('Authorization', tokenAdminA);

      expect(resNonexistent.status).toBe(404);
      expect(resCrossShop.status).toBe(404);
      expect(resNonexistent.body).toEqual(resCrossShop.body);
    });

    test('2.4: Same-shop invoice PDF succeeds with application/pdf Content-Type', async () => {
      const res = await request(app)
        .get(`/api/invoices/${invoiceA1.id}/pdf`)
        .set('Authorization', tokenAdminA);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    test('2.5: Super-admin can generate invoice PDF across shops', async () => {
      const res = await request(app)
        .get(`/api/invoices/${invoiceB.id}/pdf`)
        .set('Authorization', tokenSuperAdmin);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('3. Sale Single Lookup Oracle Elimination (GET /sales/:id)', () => {
    const nonexistentSaleId = 999999999;

    test('3.1: Non-existent sale returns 404 for admin, manager, and cashier', async () => {
      const resAdmin = await request(app)
        .get(`/api/sales/${nonexistentSaleId}`)
        .set('Authorization', tokenAdminA);

      const resManager = await request(app)
        .get(`/api/sales/${nonexistentSaleId}`)
        .set('Authorization', tokenManagerA);

      const resCashier = await request(app)
        .get(`/api/sales/${nonexistentSaleId}`)
        .set('Authorization', tokenCashierA);

      expect(resAdmin.status).toBe(404);
      expect(resAdmin.body.error).toMatch(/not found/i);

      expect(resManager.status).toBe(404);
      expect(resManager.body.error).toMatch(/not found/i);

      // Previously returned 403 for cashiers due to faulty scoping middleware; now returns uniform 404
      expect(resCashier.status).toBe(404);
      expect(resCashier.body.error).toMatch(/not found/i);
    });

    test('3.2: Cross-shop sale returns 404 for admin, manager, and cashier', async () => {
      const resAdmin = await request(app)
        .get(`/api/sales/${saleB.id}`)
        .set('Authorization', tokenAdminA);

      const resManager = await request(app)
        .get(`/api/sales/${saleB.id}`)
        .set('Authorization', tokenManagerA);

      const resCashier = await request(app)
        .get(`/api/sales/${saleB.id}`)
        .set('Authorization', tokenCashierA);

      expect(resAdmin.status).toBe(404);
      expect(resAdmin.body.error).toMatch(/not found/i);

      expect(resManager.status).toBe(404);
      expect(resManager.body.error).toMatch(/not found/i);

      expect(resCashier.status).toBe(404);
      expect(resCashier.body.error).toMatch(/not found/i);
    });

    test('3.3: Same-shop sale returns 200 for admin, manager, and cashier', async () => {
      const resAdmin = await request(app)
        .get(`/api/sales/${saleA1.id}`)
        .set('Authorization', tokenAdminA);

      const resManager = await request(app)
        .get(`/api/sales/${saleA1.id}`)
        .set('Authorization', tokenManagerA);

      const resCashier = await request(app)
        .get(`/api/sales/${saleA1.id}`)
        .set('Authorization', tokenCashierA);

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.id).toBe(saleA1.id);

      expect(resManager.status).toBe(200);
      expect(resManager.body.id).toBe(saleA1.id);

      expect(resCashier.status).toBe(200);
      expect(resCashier.body.id).toBe(saleA1.id);
    });

    test('3.4: Unauthorized role (customer) gets 403 Access Denied or 404 (RBAC preservation)', async () => {
      // Regardless of whether sale exists in own shop, other shop, or does not exist
      const resOwn = await request(app)
        .get(`/api/sales/${saleA1.id}`)
        .set('Authorization', tokenCustomerA);

      const resCross = await request(app)
        .get(`/api/sales/${saleB.id}`)
        .set('Authorization', tokenCustomerA);

      const resNonexistent = await request(app)
        .get(`/api/sales/${nonexistentSaleId}`)
        .set('Authorization', tokenCustomerA);

      expect([403, 404]).toContain(resOwn.status);
      expect([403, 404]).toContain(resCross.status);
      expect([403, 404]).toContain(resNonexistent.status);
    });
  });

  describe('4. Comprehensive Tenant Isolation and Error Hygiene', () => {
    test('4.1: Cross-tenant operations leak zero tenant/shop metadata in response payloads', async () => {
      const [resRefund, resPdf, resSale] = await Promise.all([
        request(app)
          .post(`/api/sales/${saleB.id}/refund`)
          .set('Authorization', tokenAdminA)
          .send({ items: [{ productId: productA1.id, quantity: 1 }] }),
        request(app)
          .get(`/api/invoices/${invoiceB.id}/pdf`)
          .set('Authorization', tokenAdminA),
        request(app)
          .get(`/api/sales/${saleB.id}`)
          .set('Authorization', tokenAdminA)
      ]);

      for (const res of [resRefund, resPdf, resSale]) {
        expect(res.status).toBe(404);
        const bodyStr = JSON.stringify(res.body);
        expect(bodyStr).not.toContain('Shop B');
        expect(bodyStr).not.toContain(String(shopB.id));
        expect(bodyStr).not.toContain(String(orgB.id));
        expect(bodyStr).not.toContain('cross-shop');
        expect(bodyStr).not.toContain('denied');
      }
    });
  });
});
