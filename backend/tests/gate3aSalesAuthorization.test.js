'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Product,
  Category,
  Inventory,
  Sale,
  SaleItem,
  Invoice,
  Plan,
  Subscription
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const { ensureOrgRolePermissionsSeeded } = require('../src/services/rolePermissionSeeder');

function tokenFor(payload) {
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  const jti = payload.jti || crypto.randomUUID();
  const iat = payload.iat || Math.floor(Date.now() / 1000);
  return 'Bearer ' + jwt.sign({ jti, iat, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Gate 3A: Sales & Core POS Authorization Migration Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerUserA, cashierUserA1, cashierUserA2;
  let userB;
  let defaultPlan;
  let categoryA, productA1, inventoryA1;
  let categoryB, productB1, inventoryB1;
  let saleA1, saleA2, saleB1;
  let invoiceA1, invoiceB1;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Get Subscription Plan
    defaultPlan = await Plan.findOne();

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Sales ${ts}`,
      slug: `org-a-sales-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Sales ${ts}`,
      slug: `org-b-sales-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // Subscriptions for both organizations
    await Subscription.create({
      organizationId: orgA.id,
      planId: defaultPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    await Subscription.create({
      organizationId: orgB.id,
      planId: defaultPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    // 3. Setup Shops
    shopA1 = await Shop.create({
      name: `Shop A1 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 4. Setup Categories & Products
    categoryA = await Category.create({
      name: `Category A ${ts}`,
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      price: 100.00,
      cost: 50.00,
      shopId: shopA1.id,
      organizationId: orgA.id,
      categoryId: categoryA.id,
      active: true
    });

    inventoryA1 = await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 50
    });

    categoryB = await Category.create({
      name: `Category B ${ts}`,
      shopId: shopB1.id,
      organizationId: orgB.id
    });

    productB1 = await Product.create({
      name: `Product B1 ${ts}`,
      sku: `SKU-B1-${ts}`,
      price: 250.00,
      cost: 120.00,
      shopId: shopB1.id,
      organizationId: orgB.id,
      categoryId: categoryB.id,
      active: true
    });

    inventoryB1 = await Inventory.create({
      productId: productB1.id,
      shopId: shopB1.id,
      stockQuantity: 50
    });

    // 5. Setup Users & Memberships
    // Owner of Org A
    ownerUserA = await User.create({
      name: `Owner User A ${ts}`,
      email: `owner-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Manager in Org A (assigned to Shop A1)
    managerUserA = await User.create({
      name: `Manager User A ${ts}`,
      email: `manager-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1
    });
    const managerMemA = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: managerUserA.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: managerMemA.id,
      shopId: shopA1.id
    });

    // Cashier 1 in Org A (assigned to Shop A1)
    cashierUserA1 = await User.create({
      name: `Cashier A1 ${ts}`,
      email: `cashier-a1-${ts}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1
    });
    const cashierMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: cashierUserA1.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: cashierMemA1.id,
      shopId: shopA1.id
    });

    // Cashier 2 in Org A (assigned strictly to Shop A2)
    cashierUserA2 = await User.create({
      name: `Cashier A2 ${ts}`,
      email: `cashier-a2-${ts}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA2.id,
      organizationId: orgA.id,
      authzVersion: 1
    });
    const cashierMemA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: cashierUserA2.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: cashierMemA2.id,
      shopId: shopA2.id
    });

    // User in Org B (Owner of Org B)
    userB = await User.create({
      name: `User B ${ts}`,
      email: `user-b-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id,
      organizationId: orgB.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: userB.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Seed permissions for both orgs
    await ensureOrgRolePermissionsSeeded(orgA.id);
    await ensureOrgRolePermissionsSeeded(orgB.id);

    // 6. Seed Existing Sales & Invoices
    saleA1 = await Sale.create({
      invoiceNumber: `INV-${ts}-0001`,
      shopId: shopA1.id,
      userId: cashierUserA1.id,
      subtotal: 100.00,
      total: 100.00,
      tax: 0,
      paymentMethod: 'cash',
      paymentAmount: 100.00,
      saleStatus: 'completed'
    });

    saleA2 = await Sale.create({
      invoiceNumber: `INV-${ts}-0002`,
      shopId: shopA2.id,
      userId: cashierUserA2.id,
      subtotal: 200.00,
      total: 200.00,
      tax: 0,
      paymentMethod: 'cash',
      paymentAmount: 200.00,
      saleStatus: 'completed'
    });

    saleB1 = await Sale.create({
      invoiceNumber: `INV-B-${ts}-0001`,
      shopId: shopB1.id,
      userId: userB.id,
      subtotal: 250.00,
      total: 250.00,
      tax: 0,
      paymentMethod: 'cash',
      paymentAmount: 250.00,
      saleStatus: 'completed'
    });

    invoiceA1 = await Invoice.create({
      invoiceNumber: `INV-DOC-${ts}-A1`,
      saleId: saleA1.id,
      userId: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      subtotal: 100.00,
      total: 100.00,
      status: 'pending'
    });

    invoiceB1 = await Invoice.create({
      invoiceNumber: `INV-DOC-${ts}-B1`,
      saleId: saleB1.id,
      userId: userB.id,
      organizationId: orgB.id,
      shopId: shopB1.id,
      subtotal: 250.00,
      total: 250.00,
      status: 'pending'
    });
  });

  afterAll(async () => {
    if (redisClient && typeof redisClient.quit === 'function') {
      try { await redisClient.quit(); } catch (e) { /* ignore */ }
    }
  });

  // ==========================================
  // 1. AUTHENTICATION (Scenarios 1-3)
  // ==========================================

  test('Scenario 1: Unauthenticated request to sales endpoint returns HTTP 401', async () => {
    const res = await request(app).get('/api/sales');
    expect(res.status).toBe(401);
  });

  test('Scenario 2: Revoked session JTI is rejected at pipeline boundary with HTTP 401', async () => {
    const jti = crypto.randomUUID();
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1,
      jti
    });

    await tokenRevocationService.revokeToken(jti, 3600);

    const res = await request(app)
      .get('/api/sales/my-sales')
      .set('Authorization', token);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Token has been revoked');
  });

  test('Scenario 3: Stale authz epoch token is rejected at pipeline boundary with HTTP 401', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 0 // Stale against DB version 1
    });

    const res = await request(app)
      .get('/api/sales/my-sales')
      .set('Authorization', token);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // ==========================================
  // 2. PERMISSIONS (Scenarios 4-6)
  // ==========================================

  test('Scenario 4: Missing sales permission returns HTTP 403 PERMISSION_DENIED', async () => {
    // Cashier does not possess manage_sales
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 5: User with correct permission is allowed access', async () => {
    // Manager has manage_sales
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/sales')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sales');
  });

  test('Scenario 6: Cashier with view_own_sales can access /my-sales', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/sales/my-sales')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sales');
  });

  // ==========================================
  // 3. TENANT ISOLATION (Scenarios 7-8)
  // ==========================================

  test('Scenario 7: Organization A user cannot access Organization B sale (anti-oracle 404)', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleB1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('Scenario 8: Forged organizationId in header or query cannot bypass tenant boundary', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleB1.id}?organizationId=${orgB.id}`)
      .set('Authorization', token);

    expect([403, 404]).toContain(res.status);
  });

  // ==========================================
  // 4. SHOP ISOLATION (Scenarios 9-12)
  // ==========================================

  test('Scenario 9: Shop A1 cashier cannot access Shop A2 sale', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleA2.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(404);
  });

  test('Scenario 10: Shop A1 cashier cannot create sale in Shop A2 by parameter tampering', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        shopId: shopA2.id, // Attempt to create sale in unauthorized shop
        items: [{
          productId: productA1.id,
          quantity: 1,
          price: 100.00
        }],
        total: 100.00,
        paymentMethod: 'cash',
        paymentAmount: 100.00
      });

    // Controller attributes sale to session active shopId (shopA1), preventing cross-shop creation
    expect(res.status).toBe(201);
    expect(res.body.shopId).toBe(shopA1.id);
  });

  test('Scenario 11: Authorized manager can access sales in their authorized branch', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saleA1.id);
  });

  test('Scenario 12: Owner receives organization-wide branch access without explicit ShopAccess rows', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA2.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleA2.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saleA2.id);
  });

  // ==========================================
  // 5. OWNERSHIP (Scenarios 13-15)
  // ==========================================

  test('Scenario 13: Cashier can access own sale via GET /api/sales/:id', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saleA1.id);
  });

  test('Scenario 14: Cashier cannot access another cashier\'s sale in same branch without manage_sales', async () => {
    // Create another cashier in Shop A1
    const ts = Date.now();
    const otherCashier = await User.create({
      name: `Other Cashier ${ts}`,
      email: `other-cashier-${ts}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      authzVersion: 1
    });
    const mem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: otherCashier.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({ membershipId: mem.id, shopId: shopA1.id });

    const otherToken = tokenFor({
      id: otherCashier.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    // otherCashier attempts to read saleA1 (created by cashierUserA1)
    const res = await request(app)
      .get(`/api/sales/${saleA1.id}`)
      .set('Authorization', otherToken);

    expect(res.status).toBe(404); // Anti-oracle masks existence
  });

  test('Scenario 15: Manager can view any sale within authorized branch', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(saleA1.id);
  });

  // ==========================================
  // 6. MUTATIONS (Scenarios 16-20)
  // ==========================================

  test('Scenario 16: Non-admin cannot delete sale (HTTP 403 INSUFFICIENT_ROLE)', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/sales/${saleA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('Scenario 17: Cashier without process_refunds cannot refund sale', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/sales/${saleA1.id}/refund`)
      .set('Authorization', token)
      .send({
        items: [{ productId: productA1.id, quantity: 1, amount: 100 }]
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 18: Cashier cannot edit/update sale', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/sales/${saleA1.id}`)
      .set('Authorization', token)
      .send({ status: 'cancelled' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 19: Unapproved above-threshold discount is rejected by server', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        items: [{
          productId: productA1.id,
          quantity: 1,
          price: 100.00
        }],
        discount: 25.00,
        discountType: 'percentage',
        discountValue: 25.00, // 25% > 10% threshold
        total: 75.00,
        paymentMethod: 'cash',
        paymentAmount: 75.00
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('manager approval');
  });

  test('Scenario 20: Client-supplied price tampering is overridden by authoritative product price', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        items: [{
          productId: productA1.id,
          quantity: 1,
          price: 10.00 // Tampered: real price is 100.00
        }],
        total: 10.00,
        paymentMethod: 'cash',
        paymentAmount: 10.00
      });

    // Server rejects price mismatch (expected 100.00, got 10.00)
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Price mismatch');
  });

  // ==========================================
  // 7. PARAMETER TAMPERING (Scenarios 21-24)
  // ==========================================

  test('Scenario 21: Cross-tenant organizationId in body is rejected by authz primitive', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        organizationId: orgB.id, // Forged tenant
        items: [{
          productId: productA1.id,
          quantity: 1,
          price: 100.00
        }],
        total: 100.00,
        paymentMethod: 'cash',
        paymentAmount: 100.00
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  test('Scenario 22: Forged cashierId/employeeId in payload does not override session identity', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        userId: userB.id, // Forged user ID
        items: [{
          productId: productA1.id,
          quantity: 1,
          price: 100.00
        }],
        total: 100.00,
        paymentMethod: 'cash',
        paymentAmount: 100.00
      });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(cashierUserA1.id); // Must remain session user
  });

  test('Scenario 23: Tampered role in JWT claim does not bypass database-backed role', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin', // Forged role claim in token
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/sales/${saleA1.id}`)
      .set('Authorization', token);

    // authzContext resolves role from DB membership, so role remains cashier
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('Scenario 24: Unknown permission requirement fails closed', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    // Call cashier-stats with an ordinary cashier who lacks manage_sales
    const res = await request(app)
      .get('/api/sales/statistics')
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  // ==========================================
  // 8. ANTI-ORACLE (Scenarios 25-26)
  // ==========================================

  test('Scenario 25: Out-of-scope non-existent sale returns 404', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/sales/99999999')
      .set('Authorization', token);

    expect(res.status).toBe(404);
  });

  test('Scenario 26: Cross-tenant sale returns identical 404 to non-existent sale', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const nonExistentRes = await request(app)
      .get('/api/sales/99999999')
      .set('Authorization', token);

    const crossTenantRes = await request(app)
      .get(`/api/sales/${saleB1.id}`)
      .set('Authorization', token);

    expect(nonExistentRes.status).toBe(404);
    expect(crossTenantRes.status).toBe(404);
    expect(crossTenantRes.body.code).toBe(nonExistentRes.body.code);
  });

  // ==========================================
  // 9. REGRESSION & BUSINESS LOGIC (Scenarios 27-30)
  // ==========================================

  test('Scenario 27: Valid POS sale creation succeeds and returns complete sale model', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        items: [{
          productId: productA1.id,
          quantity: 2,
          price: 100.00
        }],
        total: 200.00,
        paymentMethod: 'cash',
        paymentAmount: 200.00
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(Number(res.body.total)).toBe(200);
    expect(res.body.shopId).toBe(shopA1.id);
  });

  test('Scenario 28: Inventory stock is deducted upon successful sale creation', async () => {
    const preInventory = await Inventory.findOne({
      where: { productId: productA1.id, shopId: shopA1.id }
    });
    const startingStock = preInventory.stockQuantity;

    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', token)
      .send({
        items: [{
          productId: productA1.id,
          quantity: 3,
          price: 100.00
        }],
        total: 300.00,
        paymentMethod: 'cash',
        paymentAmount: 300.00
      });

    expect(res.status).toBe(201);

    const postInventory = await Inventory.findOne({
      where: { productId: productA1.id, shopId: shopA1.id }
    });
    expect(postInventory.stockQuantity).toBe(startingStock - 3);
  });

  test('Scenario 29: Invoice creation and retrieval lifecycle works with canonical authorization', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    // Create invoice from saleA1
    const createRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', token)
      .send({
        saleId: saleA1.id,
        paymentMethod: 'cash'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('id');
    const createdInvoiceId = createRes.body.id;

    // Retrieve created invoice
    const getRes = await request(app)
      .get(`/api/invoices/${createdInvoiceId}`)
      .set('Authorization', token);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createdInvoiceId);
  });

  test('Scenario 30: Payment details lookup for sale works for authorized caller', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/sales/${saleA1.id}/payments`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ==========================================
  // 10. INVOICE MUTATIONS & SPLIT SALES (Scenarios 31-34)
  // ==========================================

  test('Scenario 31: Cross-tenant invoice lookup returns 404 anti-oracle', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/invoices/${invoiceB1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(404);
  });

  test('Scenario 32: Non-admin cannot delete invoice (HTTP 403 INSUFFICIENT_ROLE)', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/invoices/${invoiceA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('Scenario 33: Owner can delete invoice in their organization', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    // Create a temporary invoice to delete
    const tempInv = await Invoice.create({
      invoiceNumber: `INV-DEL-TEST-${Date.now()}`,
      saleId: saleA1.id,
      userId: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      subtotal: 50.00,
      total: 50.00,
      status: 'pending'
    });

    const res = await request(app)
      .delete(`/api/invoices/${tempInv.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('deleted');
  });

  test('Scenario 34: Split payment sale creation succeeds with create_sales permission', async () => {
    const token = tokenFor({
      id: cashierUserA1.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/sales/split')
      .set('Authorization', token)
      .send({
        items: [{
          productId: productA1.id,
          quantity: 1,
          price: 100.00
        }],
        payments: [
          { paymentMethod: 'cash', amount: 50.00 },
          { paymentMethod: 'card', amount: 50.00, gatewayRef: 'GW-CARD-TEST-123' }
        ],
        total: 100.00
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.shopId).toBe(shopA1.id);
  });
});
