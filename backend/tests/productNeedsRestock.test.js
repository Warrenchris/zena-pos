'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Category,
  Product,
  Inventory,
  Plan,
  Subscription
} = require('../src/models');

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

describe('Product Catalog: availability=needs_restock', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let userA1, userB1;
  let tokenA1;
  let prodZero, prodLow1, prodLow2, prodHealthy, prodNoInv, prodShopA2Low, prodOrgBLow, prodInactive;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    const plan = await Plan.findOne();

    // Org A with Shop A1 (primary) and Shop A2 (secondary branch)
    orgA = await Organization.create({
      name: `Org A Restock ${ts}`,
      slug: `org-a-restock-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    if (plan) {
      await Subscription.create({
        organizationId: orgA.id,
        planId: plan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31 23:59:59'),
        cancelAtPeriodEnd: false
      });
    }

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

    userA1 = await User.create({
      name: 'Owner A1',
      email: `owner_a1_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      active: true
    });

    const memA = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: userA1.id,
      orgRole: 'owner',
      status: 'active'
    });

    await ShopAccess.create({ membershipId: memA.id, shopId: shopA1.id });
    await ShopAccess.create({ membershipId: memA.id, shopId: shopA2.id });

    tokenA1 = tokenFor({
      id: userA1.id,
      email: userA1.email,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    // Org B with Shop B1 (isolated tenant)
    orgB = await Organization.create({
      name: `Org B Restock ${ts}`,
      slug: `org-b-restock-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    if (plan) {
      await Subscription.create({
        organizationId: orgB.id,
        planId: plan.id,
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date('2099-12-31 23:59:59'),
        cancelAtPeriodEnd: false
      });
    }

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    userB1 = await User.create({
      name: 'Owner B1',
      email: `owner_b1_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id,
      active: true
    });

    const memB = await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: userB1.id,
      orgRole: 'owner',
      status: 'active'
    });

    await ShopAccess.create({ membershipId: memB.id, shopId: shopB1.id });

    // Seed test products with required cost
    // (a) stock-0 item
    prodZero = await Product.create({
      name: 'A-Product Zero Stock',
      sku: `SKU-ZERO-${ts}`,
      price: 100,
      cost: 50,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    await Inventory.create({
      productId: prodZero.id,
      shopId: shopA1.id,
      stockQuantity: 0,
      reorderPoint: 5
    });

    // (a) stock < reorder item
    prodLow1 = await Product.create({
      name: 'B-Product Low Stock One',
      sku: `SKU-LOW1-${ts}`,
      price: 150,
      cost: 75,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    await Inventory.create({
      productId: prodLow1.id,
      shopId: shopA1.id,
      stockQuantity: 2,
      reorderPoint: 10
    });

    // (a) stock == reorder item
    prodLow2 = await Product.create({
      name: 'C-Product Low Stock Equal Reorder',
      sku: `SKU-LOW2-${ts}`,
      price: 200,
      cost: 100,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    await Inventory.create({
      productId: prodLow2.id,
      shopId: shopA1.id,
      stockQuantity: 5,
      reorderPoint: 5
    });

    // (b) healthy item (stock > reorderPoint)
    prodHealthy = await Product.create({
      name: 'D-Product Healthy Stock',
      sku: `SKU-HEALTHY-${ts}`,
      price: 300,
      cost: 150,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    await Inventory.create({
      productId: prodHealthy.id,
      shopId: shopA1.id,
      stockQuantity: 50,
      reorderPoint: 10
    });

    // (c) product with NO inventory row in shopA1
    prodNoInv = await Product.create({
      name: 'E-Product No Inventory In Shop',
      sku: `SKU-NOINV-${ts}`,
      price: 400,
      cost: 200,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });

    // (d) product that is low in ANOTHER shop (Shop A2), but healthy in Shop A1
    prodShopA2Low = await Product.create({
      name: 'F-Product Low In Shop A2 Only',
      sku: `SKU-A2LOW-${ts}`,
      price: 250,
      cost: 120,
      active: true,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    await Inventory.create({
      productId: prodShopA2Low.id,
      shopId: shopA1.id,
      stockQuantity: 80,
      reorderPoint: 10
    });
    await Inventory.create({
      productId: prodShopA2Low.id,
      shopId: shopA2.id,
      stockQuantity: 1,
      reorderPoint: 10
    });

    // (d) product low in ANOTHER organization (Org B, Shop B1)
    prodOrgBLow = await Product.create({
      name: 'G-Product Low In Org B',
      sku: `SKU-ORGB-${ts}`,
      price: 500,
      cost: 250,
      active: true,
      shopId: shopB1.id,
      organizationId: orgB.id
    });
    await Inventory.create({
      productId: prodOrgBLow.id,
      shopId: shopB1.id,
      stockQuantity: 0,
      reorderPoint: 10
    });

    // (f) inactive product with stock <= reorderPoint
    prodInactive = await Product.create({
      name: 'H-Product Inactive Low Stock',
      sku: `SKU-INACTIVE-${ts}`,
      price: 120,
      cost: 60,
      active: false,
      shopId: shopA1.id,
      organizationId: orgA.id
    });
    await Inventory.create({
      productId: prodInactive.id,
      shopId: shopA1.id,
      stockQuantity: 1,
      reorderPoint: 10
    });
  }, 30000);

  it('(a) returns stock <= reorder and stock = 0 items, ordered most urgent first', async () => {
    const res = await request(app)
      .get('/api/products?availability=needs_restock&pageSize=50')
      .set('Authorization', tokenA1);

    expect(res.status).toBe(200);
    expect(res.body.availability).toBe('needs_restock');

    const ids = res.body.products.map(p => p.id);
    expect(ids).toContain(prodZero.id);
    expect(ids).toContain(prodLow1.id);
    expect(ids).toContain(prodLow2.id);

    // Order: most urgent first (stockQuantity ASC, then name ASC)
    const returnedZero = res.body.products.find(p => p.id === prodZero.id);
    const returnedLow1 = res.body.products.find(p => p.id === prodLow1.id);
    const returnedLow2 = res.body.products.find(p => p.id === prodLow2.id);

    expect(returnedZero.stockQuantity).toBe(0);
    expect(returnedLow1.stockQuantity).toBe(2);
    expect(returnedLow2.stockQuantity).toBe(5);

    const zeroIndex = ids.indexOf(prodZero.id);
    const low1Index = ids.indexOf(prodLow1.id);
    const low2Index = ids.indexOf(prodLow2.id);

    expect(zeroIndex).toBeLessThan(low1Index);
    expect(low1Index).toBeLessThan(low2Index);
  });

  it('(b) excludes healthy stock items (stockQuantity > reorderPoint)', async () => {
    const res = await request(app)
      .get('/api/products?availability=needs_restock&pageSize=50')
      .set('Authorization', tokenA1);

    expect(res.status).toBe(200);
    const ids = res.body.products.map(p => p.id);
    expect(ids).not.toContain(prodHealthy.id);
  });

  it('(c) excludes products with no inventory row for the active shop', async () => {
    const res = await request(app)
      .get('/api/products?availability=needs_restock&pageSize=50')
      .set('Authorization', tokenA1);

    expect(res.status).toBe(200);
    const ids = res.body.products.map(p => p.id);
    expect(ids).not.toContain(prodNoInv.id);
  });

  it('(d) excludes items that are low in another shop or organization', async () => {
    const res = await request(app)
      .get('/api/products?availability=needs_restock&pageSize=50')
      .set('Authorization', tokenA1);

    expect(res.status).toBe(200);
    const ids = res.body.products.map(p => p.id);
    expect(ids).not.toContain(prodShopA2Low.id);
    expect(ids).not.toContain(prodOrgBLow.id);
  });

  it('(e) counts all matches in pagination.total while pageSize=2 returns 2 rows', async () => {
    const resPage1 = await request(app)
      .get('/api/products?availability=needs_restock&page=1&pageSize=2')
      .set('Authorization', tokenA1);

    expect(resPage1.status).toBe(200);
    expect(resPage1.body.availability).toBe('needs_restock');
    expect(resPage1.body.pagination.total).toBe(3);
    expect(resPage1.body.pagination.totalPages).toBe(2);
    expect(resPage1.body.pagination.currentPage).toBe(1);
    expect(resPage1.body.products.length).toBe(2);

    expect(resPage1.body.products[0].id).toBe(prodZero.id);
    expect(resPage1.body.products[1].id).toBe(prodLow1.id);

    const resPage2 = await request(app)
      .get('/api/products?availability=needs_restock&page=2&pageSize=2')
      .set('Authorization', tokenA1);

    expect(resPage2.status).toBe(200);
    expect(resPage2.body.pagination.total).toBe(3);
    expect(resPage2.body.pagination.currentPage).toBe(2);
    expect(resPage2.body.products.length).toBe(1);
    expect(resPage2.body.products[0].id).toBe(prodLow2.id);
  });

  it('(f) excludes inactive products even when stock <= reorderPoint', async () => {
    const res = await request(app)
      .get('/api/products?availability=needs_restock&pageSize=50')
      .set('Authorization', tokenA1);

    expect(res.status).toBe(200);
    const ids = res.body.products.map(p => p.id);
    expect(ids).not.toContain(prodInactive.id);
  });
});
