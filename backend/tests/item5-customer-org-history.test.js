const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const {
  Organization,
  Shop,
  User,
  Customer,
  Product,
  Sale,
  SaleItem,
  OrganizationMembership
} = require('../src/models');
const { getPrivateKey } = require('../src/controllers/authController');

describe('ITEM 5: Aggregate customer history across organization (ISO-03)', () => {
  let org;
  let shopA;
  let shopB;
  let userA;
  let userB;
  let tokenA;
  let tokenB;
  let customer;
  let product1;
  let product2;
  let saleA;
  let saleB;

  beforeAll(async () => {
    const timestamp = Date.now();
    const privateKey = getPrivateKey();

    org = await Organization.create({
      name: `Org CustTest ${timestamp}`,
      slug: `org-cust-${timestamp}`,
      status: 'active'
    });

    shopA = await Shop.create({
      name: `Shop A ${timestamp}`,
      organizationId: org.id,
      active: true
    });

    shopB = await Shop.create({
      name: `Shop B ${timestamp}`,
      organizationId: org.id,
      active: true
    });

    userA = await User.create({
      name: 'User Branch A',
      email: `userA_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id,
      active: true
    });

    userB = await User.create({
      name: 'User Branch B',
      email: `userB_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: userA.id,
      orgRole: 'admin',
      status: 'active'
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: userB.id,
      orgRole: 'admin',
      status: 'active'
    });

    tokenA = jwt.sign(
      { id: userA.id, role: userA.role, shopId: shopA.id, organizationId: org.id, isEmployee: false, jti: crypto.randomUUID() },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    tokenB = jwt.sign(
      { id: userB.id, role: userB.role, shopId: shopB.id, organizationId: org.id, isEmployee: false, jti: crypto.randomUUID() },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );

    customer = await Customer.create({
      name: `Customer MultiShop ${timestamp}`,
      email: `customer_${timestamp}@example.com`,
      phone: `0700${Math.floor(100000 + Math.random() * 900000)}`,
      organizationId: org.id,
      shopId: shopA.id,
      active: true
    });

    product1 = await Product.create({
      name: `Product 1 ${timestamp}`,
      sku: `SKU1_${timestamp}`,
      price: 500,
      cost: 250,
      shopId: shopA.id,
      organizationId: org.id
    });

    product2 = await Product.create({
      name: `Product 2 ${timestamp}`,
      sku: `SKU2_${timestamp}`,
      price: 1500,
      cost: 800,
      shopId: shopB.id,
      organizationId: org.id
    });

    // Sale in Shop A: 2x Product 1 (total: 1000)
    saleA = await Sale.create({
      shopId: shopA.id,
      userId: userA.id,
      customerId: customer.id,
      total: 1000,
      paymentAmount: 1000,
      paymentMethod: 'cash',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleA.id,
      productId: product1.id,
      quantity: 2,
      price: 500,
      subtotal: 1000
    });

    // Sale in Shop B: 3x Product 1, 1x Product 2 (total: 3000)
    saleB = await Sale.create({
      shopId: shopB.id,
      userId: userB.id,
      customerId: customer.id,
      total: 3000,
      paymentAmount: 3000,
      paymentMethod: 'mpesa',
      saleStatus: 'completed'
    });

    await SaleItem.create({
      saleId: saleB.id,
      productId: product1.id,
      quantity: 3,
      price: 500,
      subtotal: 1500
    });

    await SaleItem.create({
      saleId: saleB.id,
      productId: product2.id,
      quantity: 1,
      price: 1500,
      subtotal: 1500
    });
  });

  afterAll(async () => {
    if (saleA) {
      await SaleItem.destroy({ where: { saleId: [saleA.id, saleB.id] } }).catch(() => {});
      await Sale.destroy({ where: { id: [saleA.id, saleB.id] } }).catch(() => {});
    }
    if (product1) await Product.destroy({ where: { id: [product1.id, product2.id] } }).catch(() => {});
    if (customer) await Customer.destroy({ where: { id: customer.id } }).catch(() => {});
    if (userA) {
      await OrganizationMembership.destroy({ where: { userId: [userA.id, userB.id] } }).catch(() => {});
      await User.destroy({ where: { id: [userA.id, userB.id] } }).catch(() => {});
    }
    if (shopA) await Shop.destroy({ where: { id: [shopA.id, shopB.id] } }).catch(() => {});
    if (org) await Organization.destroy({ where: { id: org.id } }).catch(() => {});
  });

  test('Branch A staff sees combined org-wide orders and spend for customer', async () => {
    const res = await request(app)
      .get(`/api/customers/${customer.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.totalOrders).toBe(2);
    expect(res.body.stats.totalSpend).toBe(4000);
    expect(res.body.orderHistory.length).toBe(2);

    // Favorites should reflect Product 1 (5 bought total across shops) as top favorite
    expect(res.body.favorites.length).toBeGreaterThan(0);
    expect(res.body.favorites[0].productId).toBe(product1.id);
    expect(res.body.favorites[0].totalQuantity).toBe(5);
  });

  test('Branch B staff sees the exact same combined org-wide history for the customer', async () => {
    const res = await request(app)
      .get(`/api/customers/${customer.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.totalOrders).toBe(2);
    expect(res.body.stats.totalSpend).toBe(4000);
    expect(res.body.orderHistory.length).toBe(2);

    expect(res.body.favorites.length).toBeGreaterThan(0);
    expect(res.body.favorites[0].productId).toBe(product1.id);
    expect(res.body.favorites[0].totalQuantity).toBe(5);
  });
});
