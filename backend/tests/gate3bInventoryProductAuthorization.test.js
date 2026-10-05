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
  StockTransfer,
  StockMovement,
  Brand,
  Unit,
  Plan,
  Subscription
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');

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

describe('Gate 3B: Inventory & Product Domain Authorization Migration Verification', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerEmployeeA1, cashierEmployeeA1, managerEmployeeA2, customerUserA;
  let userB;
  let defaultPlan;
  let categoryA1, productA1, inventoryA1_Shop1, inventoryA1_Shop2;
  let categoryB1, productB1, inventoryB1;
  let brandA1, unitA1;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    // 1. Get Subscription Plan
    defaultPlan = await Plan.findOne();

    // 2. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Inventory ${ts}`,
      slug: `org-a-inv-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Inventory ${ts}`,
      slug: `org-b-inv-${ts}`,
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
      name: `Shop A1 Inv ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Inv ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 Inv ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 4. Setup Categories, Products, and Inventories
    categoryA1 = await Category.create({
      name: `Category A1 ${ts}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    productA1 = await Product.create({
      name: `Product A1 ${ts}`,
      sku: `SKU-A1-${ts}`,
      barcode: `BAR-A1-${ts}`,
      price: 150.00,
      cost: 75.00,
      shopId: shopA1.id,
      organizationId: orgA.id,
      categoryId: categoryA1.id,
      active: true
    });

    inventoryA1_Shop1 = await Inventory.create({
      productId: productA1.id,
      shopId: shopA1.id,
      stockQuantity: 100,
      reorderPoint: 10
    });

    inventoryA1_Shop2 = await Inventory.create({
      productId: productA1.id,
      shopId: shopA2.id,
      stockQuantity: 20,
      reorderPoint: 5
    });

    categoryB1 = await Category.create({
      name: `Category B1 ${ts}`,
      shopId: shopB1.id,
      organizationId: orgB.id,
      active: true
    });

    productB1 = await Product.create({
      name: `Product B1 ${ts}`,
      sku: `SKU-B1-${ts}`,
      barcode: `BAR-B1-${ts}`,
      price: 200.00,
      cost: 100.00,
      shopId: shopB1.id,
      organizationId: orgB.id,
      categoryId: categoryB1.id,
      active: true
    });

    inventoryB1 = await Inventory.create({
      productId: productB1.id,
      shopId: shopB1.id,
      stockQuantity: 40,
      reorderPoint: 10
    });

    brandA1 = await Brand.create({
      name: `Brand A1 ${ts}`,
      shopId: shopA1.id
    });

    unitA1 = await Unit.create({
      name: `Unit A1 ${ts}`,
      abbreviation: 'u1',
      shopId: shopA1.id
    });

    // 5. Setup Users & Memberships
    // Owner User A
    ownerUserA = await User.create({
      name: `Owner A ${ts}`,
      email: `owner.inv.${ts}@example.com`,
      password: 'hashedpassword',
      role: 'admin',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1
    });

    const ownerMembership = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Manager Employee A1 (assigned only to shopA1)
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `mgr.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 50000,
      position: 'Manager',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const mgrMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA1.id,
      shopId: shopA1.id,
      role: 'manager'
    });

    // Manager Employee A2 (assigned only to shopA2)
    managerEmployeeA2 = await Employee.create({
      firstName: 'Manager',
      lastName: `A2 ${ts}`,
      email: `mgr.a2.${ts}@example.com`,
      password: 'Password123!',
      salary: 50000,
      position: 'Manager',
      status: 'active',
      shopId: shopA2.id,
      authzVersion: 1
    });

    const mgrMemA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA2.id,
      shopId: shopA2.id,
      role: 'manager'
    });

    // Cashier Employee A1 (assigned only to shopA1)
    cashierEmployeeA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A1 ${ts}`,
      email: `cashier.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 30000,
      position: 'Cashier',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const cashierMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierMemA1.id,
      shopId: shopA1.id,
      role: 'cashier'
    });

    // Customer User A (member role, unprivileged)
    customerUserA = await User.create({
      name: `Customer A ${ts}`,
      email: `customer.a.inv.${ts}@example.com`,
      password: 'hashedpassword',
      role: 'cashier',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1
    });

    const customerMemA = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: customerUserA.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: customerMemA.id,
      shopId: shopA1.id,
      role: 'customer'
    });

    // Tenant B Owner User
    userB = await User.create({
      name: `User B ${ts}`,
      email: `user.b.inv.${ts}@example.com`,
      password: 'hashedpassword',
      role: 'admin',
      shopId: shopB1.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: userB.id,
      orgRole: 'owner',
      status: 'active'
    });
  });

  // ==========================================
  // Baseline Authentication & Session
  // ==========================================
  test('Scenario 1: Unauthenticated request to inventory/product endpoint returns HTTP 401', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  test('Scenario 2: Revoked session JTI is rejected at pipeline boundary with HTTP 401', async () => {
    const revokedJti = crypto.randomUUID();
    await tokenRevocationService.revokeToken(revokedJti, 7200);

    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1,
      jti: revokedJti
    });

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', token);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Token has been revoked');
  });

  // ==========================================
  // Products Authorization & CRUD
  // ==========================================
  test('Scenario 3: Authorized product read returns product details', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/products/${productA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(productA1.id);
    expect(res.body.name).toBe(productA1.name);
    expect(parseFloat(res.body.price)).toBe(150.00);
  });

  test('Scenario 4: User lacking view_products permission cannot read products', async () => {
    // Customer role lacks view_products
    const token = tokenFor({
      id: customerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'customer',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 5: Authorized product creation succeeds and sets branch inventory', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', token)
      .send({
        name: 'Manager Created Product',
        price: 99.99,
        cost: 45.00,
        stockQuantity: 25,
        reorderPoint: 5,
        categoryId: categoryA1.id
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Manager Created Product');
    expect(res.body.stockQuantity).toBe(25);
  });

  test('Scenario 6: Cashier lacking manage_products cannot create product', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', token)
      .send({
        name: 'Malicious Cashier Product',
        price: 10.00,
        cost: 5.00,
        categoryId: categoryA1.id
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 7: Authorized product update succeeds', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/products/${productA1.id}`)
      .set('Authorization', token)
      .send({
        name: 'Product A1 Updated Name',
        price: 175.00,
        cost: 80.00,
        categoryId: categoryA1.id
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Product A1 Updated Name');
    expect(parseFloat(res.body.price)).toBe(175.00);
  });

  test('Scenario 8: Cashier lacking manage_products cannot update product', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/products/${productA1.id}`)
      .set('Authorization', token)
      .send({
        name: 'Hacked Product Name',
        price: 1.00,
        cost: 1.00,
        categoryId: categoryA1.id
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 9: Authorized product branch deletion removes branch inventory row', async () => {
    // Create temporary product
    const tempProd = await Product.create({
      name: 'Temp Delete Product',
      sku: `SKU-TEMP-${Date.now()}`,
      price: 50.00,
      cost: 25.00,
      shopId: shopA1.id,
      organizationId: orgA.id,
      categoryId: categoryA1.id,
      active: true
    });
    await Inventory.create({
      productId: tempProd.id,
      shopId: shopA1.id,
      stockQuantity: 10
    });

    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/products/${tempProd.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Product removed from this branch/i);

    const inv = await Inventory.findOne({ where: { productId: tempProd.id, shopId: shopA1.id } });
    expect(inv).toBeNull();
  });

  test('Scenario 10: Cashier lacking manage_products cannot delete product', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/products/${productA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 11: Authorized admin can deactivate product org-wide', async () => {
    const tempProd = await Product.create({
      name: 'Temp Deactivate Product',
      sku: `SKU-DEACT-${Date.now()}`,
      price: 50.00,
      cost: 25.00,
      shopId: shopA1.id,
      organizationId: orgA.id,
      categoryId: categoryA1.id,
      active: true
    });

    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/products/${tempProd.id}/deactivate`)
      .set('Authorization', token)
      .send({ confirm: true });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Product deactivated across all branches/i);

    const reloaded = await Product.findByPk(tempProd.id);
    expect(reloaded.active).toBe(false);
  });

  test('Scenario 12: Manager without admin role cannot deactivate product org-wide', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/products/${productA1.id}/deactivate`)
      .set('Authorization', token)
      .send({ confirm: true });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  // ==========================================
  // Categories Authorization & CRUD
  // ==========================================
  test('Scenario 13: Authorized category read succeeds', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some(c => c.id === categoryA1.id)).toBe(true);
  });

  test('Scenario 14: Authorized category creation succeeds', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', token)
      .send({
        name: `Snacks ${Date.now()}`,
        description: 'Snacks category'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.organizationId).toBe(orgA.id);
  });

  test('Scenario 15: Cashier lacking manage_categories cannot create category', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', token)
      .send({
        name: `Illegal Category ${Date.now()}`
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 16: Authorized category update succeeds', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/categories/${categoryA1.id}`)
      .set('Authorization', token)
      .send({
        name: `Category A1 Updated ${Date.now()}`
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  test('Scenario 17: Manager cannot delete category (requires admin or org_admin role)', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/categories/${categoryA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('Scenario 18: Admin can delete category', async () => {
    const tempCat = await Category.create({
      name: `Delete Cat ${Date.now()}`,
      shopId: shopA1.id,
      organizationId: orgA.id,
      active: true
    });

    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/categories/${tempCat.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });

  test('Scenario 19: Cross-tenant category access is denied via anti-oracle 404', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    // Attempt to access Category B1 belonging to Org B
    const res = await request(app)
      .get(`/api/categories/${categoryB1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Category not found/i);
  });

  // ==========================================
  // Inventory & Stock Adjustments
  // ==========================================
  test('Scenario 20: Authorized stock adjustment updates inventory quantity', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .patch(`/api/products/${productA1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: 15 });

    expect(res.status).toBe(200);
    expect(res.body.stockQuantity).toBe(115);

    const inv = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA1.id } });
    expect(parseFloat(inv.stockQuantity)).toBe(115);
  });

  test('Scenario 21: Stock adjustment with negative stock result is rejected with HTTP 400', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .patch(`/api/products/${productA1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: -99999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Insufficient stock/i);
  });

  test('Scenario 22: User lacking both manage_products and access_pos cannot adjust stock', async () => {
    const token = tokenFor({
      id: customerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'customer',
      authzVersion: 1
    });

    const res = await request(app)
      .patch(`/api/products/${productA1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: 5 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 23: Cashier with access_pos can perform quick stock adjustment in active branch', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .patch(`/api/products/${productA1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: 5 });

    expect(res.status).toBe(200);
    expect(res.body.stockQuantity).toBe(120);
  });

  test('Scenario 24: Cross-tenant product stock adjustment returns HTTP 404 (anti-oracle)', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    // Try to adjust stock on Product B1 (Org B)
    const res = await request(app)
      .patch(`/api/products/${productB1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: 10 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Product not found/i);
  });

  test('Scenario 25: Unauthorized branch inventory adjustment (caller lacks ShopAccess) is denied with HTTP 403', async () => {
    // managerEmployeeA1 has access only to shopA1, tries to adjust stock in shopA2 via X-Shop-Id or token
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA2.id, // shopA2 not accessible to managerEmployeeA1
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .patch(`/api/products/${productA1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: 5 });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
  });

  // ==========================================
  // Stock Transfers Authorization & Scope
  // ==========================================
  test('Scenario 26: Authorized stock transfer between branches succeeds', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: productA1.id,
        quantity: 10,
        notes: 'Transfer 10 units'
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.sourceNewStock).toBe(110);
    expect(res.body.destinationNewStock).toBe(30);

    const srcInv = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA1.id } });
    const dstInv = await Inventory.findOne({ where: { productId: productA1.id, shopId: shopA2.id } });
    expect(parseFloat(srcInv.stockQuantity)).toBe(110);
    expect(parseFloat(dstInv.stockQuantity)).toBe(30);
  });

  test('Scenario 27: Transfer from unauthorized source shop is rejected with HTTP 403', async () => {
    // managerEmployeeA2 has access only to shopA2, not shopA1. Tries to transfer OUT of shopA1.
    const token = tokenFor({
      id: managerEmployeeA2.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA2.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopA1.id, // Not authorized for managerEmployeeA2
        destinationShopId: shopA2.id,
        productId: productA1.id,
        quantity: 5
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong to your organization/i);
  });

  test('Scenario 28: Transfer to unauthorized destination shop is rejected with HTTP 403', async () => {
    // managerEmployeeA1 has access only to shopA1, not shopA2. Tries to transfer INTO shopA2.
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id, // Not authorized for managerEmployeeA1
        productId: productA1.id,
        quantity: 5
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong to your organization/i);
  });

  test('Scenario 29: Cross-tenant destination shop transfer attempt is rejected with HTTP 403', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    // Attempt transfer from Org A (shopA1) to Org B (shopB1)
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopB1.id,
        productId: productA1.id,
        quantity: 5
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong to your organization/i);
  });

  test('Scenario 30: Cross-tenant source shop transfer attempt is rejected with HTTP 403', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    // Attempt transfer from Org B (shopB1) to Org A (shopA1)
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopB1.id,
        destinationShopId: shopA1.id,
        productId: productA1.id,
        quantity: 5
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/does not belong to your organization/i);
  });

  test('Scenario 31: Transfer with cross-tenant product returns HTTP 404', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    // Product B1 belongs to Org B
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA2.id,
        productId: productB1.id,
        quantity: 5
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Product not found/i);
  });

  test('Scenario 32: Transfer with identical source and destination shops is rejected with HTTP 400', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', token)
      .send({
        sourceShopId: shopA1.id,
        destinationShopId: shopA1.id,
        productId: productA1.id,
        quantity: 5
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Source and destination shops must be different/i);
  });

  // ==========================================
  // Tenant Tampering & Anti-Oracle
  // ==========================================
  test('Scenario 33: Forged organizationId in request body is rejected with HTTP 403 TENANT_MISMATCH', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', token)
      .send({
        organizationId: orgB.id, // Forged tenant!
        name: 'Forged Org Product',
        price: 100,
        cost: 50,
        categoryId: categoryA1.id
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  test('Scenario 34: Forged organizationId in query params is rejected with HTTP 403 TENANT_MISMATCH', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/products?organizationId=${orgB.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  test('Scenario 35: Cross-tenant product lookup returns HTTP 404 identical to non-existent product', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    // 1. Cross-tenant product
    const crossRes = await request(app)
      .get(`/api/products/${productB1.id}`)
      .set('Authorization', token);

    // 2. Non-existent product
    const nonExistRes = await request(app)
      .get('/api/products/99999999')
      .set('Authorization', token);

    expect(crossRes.status).toBe(404);
    expect(nonExistRes.status).toBe(404);
    expect(crossRes.body).toEqual(nonExistRes.body);
  });

  test('Scenario 36: Cross-tenant category lookup returns HTTP 404 identical to non-existent category', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const crossRes = await request(app)
      .get(`/api/categories/${categoryB1.id}`)
      .set('Authorization', token);

    const nonExistRes = await request(app)
      .get('/api/categories/99999999')
      .set('Authorization', token);

    expect(crossRes.status).toBe(404);
    expect(nonExistRes.status).toBe(404);
    expect(crossRes.body).toEqual(nonExistRes.body);
  });

  test('Scenario 37: Tampered role in JWT claim does not bypass database-backed role', async () => {
    // Cashier sends token forged with role: 'admin'
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin', // FORGED CLAIM
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/products')
      .set('Authorization', token)
      .send({
        name: 'Forged Role Product',
        price: 100,
        cost: 50,
        categoryId: categoryA1.id
      });

    // authzContext resolves authoritative database role ('cashier'), denying access
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  // ==========================================
  // Cache & Session Security
  // ==========================================
  test('Scenario 38: Stale authz epoch token is rejected at pipeline boundary with HTTP 401', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 0 // Stale! DB is at 1
    });

    const res = await request(app)
      .get('/api/products')
      .set('Authorization', token);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  test('Scenario 39: Product catalogue batch retrieval scopes to organization', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/products/batch?ids=${productA1.id},${productB1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Only productA1 should be returned, NOT productB1
    expect(res.body.some(p => p.id === productA1.id)).toBe(true);
    expect(res.body.some(p => p.id === productB1.id)).toBe(false);
  });

  test('Scenario 40: Product catalogue cache invalidation occurs upon stock mutation', async () => {
    // Populate Redis cache for shopA1
    const cacheKey = `products:shop:${shopA1.id}`;
    if (redisClient.status === 'ready') {
      await redisClient.set(cacheKey, JSON.stringify({ count: 1, rows: [productA1.toJSON()] }));
    }

    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    // Mutate stock
    const res = await request(app)
      .patch(`/api/products/${productA1.id}/stock`)
      .set('Authorization', token)
      .send({ quantity: 5 });

    expect(res.status).toBe(200);

    // Verify cache key was purged
    if (redisClient.status === 'ready') {
      const cached = await redisClient.get(cacheKey);
      expect(cached).toBeNull();
    }
  });

  // ==========================================
  // Brands & Units
  // ==========================================
  test('Scenario 41: Authorized brand listing and creation succeed', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    // List brands
    const listRes = await request(app)
      .get('/api/brands')
      .set('Authorization', token);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    // Create brand
    const createRes = await request(app)
      .post('/api/brands')
      .set('Authorization', token)
      .send({
        name: `Brand Created ${Date.now()}`,
        description: 'Quality Brand'
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('id');
  });

  test('Scenario 42: Cashier without manage_products cannot create brand', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/brands')
      .set('Authorization', token)
      .send({
        name: 'Unauthorized Brand'
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  test('Scenario 43: Authorized unit listing and creation succeed', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    // List units
    const listRes = await request(app)
      .get('/api/units')
      .set('Authorization', token);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);

    // Create unit
    const createRes = await request(app)
      .post('/api/units')
      .set('Authorization', token)
      .send({
        name: `kg-${Date.now()}`,
        abbreviation: 'kg'
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('id');
  });

  test('Scenario 44: Cashier without manage_products cannot create unit', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/units')
      .set('Authorization', token)
      .send({
        name: 'Unauthorized Unit'
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });
});
