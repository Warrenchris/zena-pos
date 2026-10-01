'use strict';

const request = require('supertest');
const app = require('../src/app');
const jwt = require('jsonwebtoken');
const {
  User,
  Shop,
  Organization,
  OrganizationMembership,
  Product,
  Customer,
  Sale,
  SaleItem,
  SubscriptionInvoice,
  ActivityLog,
  ShopAccess
} = require('../src/models');

function generateToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return jwt.sign(
    { ...payload, jti: `jti_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

describe('Phase 7D: Organization Data Export (Owner-Only, Rate-Limited, Audited)', () => {
  let testOrg1;
  let testShop1;
  let ownerUser1;
  let ownerToken1;

  let adminUser1;
  let adminToken1;

  let testOrg2;
  let testShop2;
  let ownerUser2;
  let ownerToken2;

  let prodOrg1;
  let custOrg1;
  let saleOrg1;

  let prodOrg2;

  beforeAll(async () => {
    const ts = Date.now();

    // 1. Setup Org 1
    testOrg1 = await Organization.create({
      name: `ExportOrg1_${ts}`,
      slug: `export-org-1-${ts}`,
      status: 'active'
    });
    testShop1 = await Shop.create({
      organizationId: testOrg1.id,
      name: `ExportShop1_${ts}`,
      active: true
    });
    ownerUser1 = await User.create({
      name: 'Owner Org1',
      email: `owner_org1_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: testShop1.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    await OrganizationMembership.create({
      organizationId: testOrg1.id,
      userId: ownerUser1.id,
      orgRole: 'owner',
      status: 'active'
    });
    ownerToken1 = generateToken({
      id: ownerUser1.id,
      shopId: testShop1.id,
      organizationId: testOrg1.id,
      role: 'admin',
      orgRole: 'owner'
    });

    // Create an admin (non-owner) in Org 1
    adminUser1 = await User.create({
      name: 'Admin Org1',
      email: `admin_org1_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: testShop1.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    await OrganizationMembership.create({
      organizationId: testOrg1.id,
      userId: adminUser1.id,
      orgRole: 'admin',
      status: 'active'
    });
    adminToken1 = generateToken({
      id: adminUser1.id,
      shopId: testShop1.id,
      organizationId: testOrg1.id,
      role: 'admin',
      orgRole: 'admin'
    });

    // Seed sample data for Org 1
    prodOrg1 = await Product.create({
      name: `Product Org1 ${ts}`,
      sku: `SKU-O1-${ts}`,
      price: 1500,
      cost: 1000,
      taxCategory: 'standard',
      organizationId: testOrg1.id,
      shopId: testShop1.id,
      active: true
    });
    custOrg1 = await Customer.create({
      name: `Customer Org1 ${ts}`,
      email: `cust1_${ts}@example.com`,
      phone: '+254711000001',
      organizationId: testOrg1.id,
      shopId: testShop1.id
    });
    saleOrg1 = await Sale.create({
      invoiceNumber: `INV-O1-${ts}`,
      subtotal: 1500,
      tax: 240,
      total: 1740,
      paymentAmount: 1740,
      paymentMethod: 'cash',
      saleStatus: 'completed',
      shopId: testShop1.id,
      customerId: custOrg1.id,
      userId: ownerUser1.id
    });
    await SaleItem.create({
      saleId: saleOrg1.id,
      shopId: testShop1.id,
      productId: prodOrg1.id,
      quantity: 1,
      unitPrice: 1500,
      price: 1500,
      subtotal: 1500,
      taxRate: 16.00,
      taxAmount: 240,
      taxCategory: 'standard'
    });

    // 2. Setup Org 2 (for tenant isolation check)
    testOrg2 = await Organization.create({
      name: `ExportOrg2_${ts}`,
      slug: `export-org-2-${ts}`,
      status: 'active'
    });
    testShop2 = await Shop.create({
      organizationId: testOrg2.id,
      name: `ExportShop2_${ts}`,
      active: true
    });
    ownerUser2 = await User.create({
      name: 'Owner Org2',
      email: `owner_org2_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: testShop2.id,
      active: true,
      emailVerifiedAt: new Date()
    });
    await OrganizationMembership.create({
      organizationId: testOrg2.id,
      userId: ownerUser2.id,
      orgRole: 'owner',
      status: 'active'
    });
    ownerToken2 = generateToken({
      id: ownerUser2.id,
      shopId: testShop2.id,
      organizationId: testOrg2.id,
      role: 'admin',
      orgRole: 'owner'
    });
    prodOrg2 = await Product.create({
      name: `Secret Org2 Product ${ts}`,
      sku: `SKU-O2-${ts}`,
      price: 9999,
      cost: 8000,
      organizationId: testOrg2.id,
      shopId: testShop2.id,
      active: true
    });
  });

  afterAll(async () => {
    // Cleanup Org 1
    if (saleOrg1) await SaleItem.destroy({ where: { saleId: saleOrg1.id } });
    if (saleOrg1) await Sale.destroy({ where: { id: saleOrg1.id } });
    if (prodOrg1) await Product.destroy({ where: { id: prodOrg1.id } });
    if (custOrg1) await Customer.destroy({ where: { id: custOrg1.id } });
    if (testOrg1) {
      await ActivityLog.destroy({ where: { shopId: testShop1.id } });
      await ShopAccess.destroy({ where: { shopId: testShop1.id } });
      await OrganizationMembership.destroy({ where: { organizationId: testOrg1.id } });
      await Shop.destroy({ where: { organizationId: testOrg1.id } });
      await Organization.destroy({ where: { id: testOrg1.id } });
    }
    if (ownerUser1) await User.destroy({ where: { id: ownerUser1.id } });
    if (adminUser1) await User.destroy({ where: { id: adminUser1.id } });

    // Cleanup Org 2
    if (prodOrg2) await Product.destroy({ where: { id: prodOrg2.id } });
    if (testOrg2) {
      await ActivityLog.destroy({ where: { shopId: testShop2.id } });
      await ShopAccess.destroy({ where: { shopId: testShop2.id } });
      await OrganizationMembership.destroy({ where: { organizationId: testOrg2.id } });
      await Shop.destroy({ where: { organizationId: testOrg2.id } });
      await Organization.destroy({ where: { id: testOrg2.id } });
    }
    if (ownerUser2) await User.destroy({ where: { id: ownerUser2.id } });
  });

  describe('1. Role Authorization', () => {
    it('should reject unauthenticated export requests with 401', async () => {
      const res = await request(app).get('/api/organizations/export');
      expect(res.status).toBe(401);
    });

    it('should reject non-owner (admin) export requests with 403', async () => {
      const res = await request(app)
        .get('/api/organizations/export')
        .set('Authorization', `Bearer ${adminToken1}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only organization owners can export/i);
    });
  });

  describe('2. Owner Data Export Delivery & Tenant Isolation', () => {
    it('should deliver a valid zip file for owner containing tenant-isolated CSVs', async () => {
      const res = await request(app)
        .get('/api/organizations/export')
        .set('Authorization', `Bearer ${ownerToken1}`)
        .buffer(true)
        .parse((res, callback) => {
          const bufs = [];
          res.on('data', chunk => bufs.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(bufs)));
        })
        .expect(200);

      expect(res.headers['content-type']).toMatch(/application\/zip/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename=.*\.zip/);

      // Verify Zip archive magic bytes: PK (0x50, 0x4B, 0x03, 0x04)
      const buffer = res.body;
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(50);
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
      expect(buffer[2]).toBe(0x03);
      expect(buffer[3]).toBe(0x04);

      // Verify zip contains expected CSV files and tenant-isolated data
      const JSZip = require('jszip');
      const zip = await JSZip.loadAsync(buffer);
      const fileNames = Object.keys(zip.files);
      expect(fileNames).toContain('shops.csv');
      expect(fileNames).toContain('products.csv');
      expect(fileNames).toContain('customers.csv');
      expect(fileNames).toContain('sales.csv');
      expect(fileNames).toContain('sale_items.csv');
      expect(fileNames).toContain('subscription_invoices.csv');

      const productsCsv = await zip.file('products.csv').async('string');
      expect(productsCsv).toContain(prodOrg1.sku);
      expect(productsCsv).not.toContain(prodOrg2.sku);

      const customersCsv = await zip.file('customers.csv').async('string');
      expect(customersCsv).toContain(custOrg1.email);
    });

    it('should write an ActivityLog entry recording ORGANIZATION_DATA_EXPORTED', async () => {
      const log = await ActivityLog.findOne({
        where: {
          action: 'ORGANIZATION_DATA_EXPORTED',
          userId: ownerUser1.id
        }
      });
      expect(log).not.toBeNull();
      expect(log.details).toContain(testOrg1.name);
    });
  });

  describe('3. Rate Limiting on Export Endpoint', () => {
    it('should enforce data export rate limiter (max 2 per hour per org)', async () => {
      const testIp = '198.51.100.99';

      // 1st export: allowed
      const res1 = await request(app)
        .get('/api/organizations/export')
        .set('Authorization', `Bearer ${ownerToken1}`)
        .set('x-forwarded-for', testIp);
      expect(res1.status).toBe(200);

      // 2nd export: allowed
      const res2 = await request(app)
        .get('/api/organizations/export')
        .set('Authorization', `Bearer ${ownerToken1}`)
        .set('x-forwarded-for', testIp);
      expect(res2.status).toBe(200);

      // 3rd export within the same hour window must return 429:
      const res3 = await request(app)
        .get('/api/organizations/export')
        .set('Authorization', `Bearer ${ownerToken1}`)
        .set('x-forwarded-for', testIp);

      expect(res3.status).toBe(429);
      expect(res3.body.error).toMatch(/too many export requests/i);
    });
  });
});
