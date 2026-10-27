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
  OrganizationMembership,
  ShopAccess
} = require('../src/models');

function signToken(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const jti = payload.jti || crypto.randomUUID();
  const iat = payload.iat || Math.floor(Date.now() / 1000);
  return 'Bearer ' + jwt.sign({ jti, iat, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Security: PUT /api/shops/me must not toggle shop.active', () => {
  let testOrg;
  let testShop;
  let inactiveShop;
  let ownerUser;
  let managerUser;
  let inactiveShopManager;
  let ownerToken;
  let managerToken;
  let inactiveShopManagerToken;

  beforeAll(async () => {
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    testOrg = await Organization.create({
      name: `Security Test Org ${suffix}`,
      slug: `sec-org-${suffix}`,
      status: 'active',
      currency: 'KES'
    });

    testShop = await Shop.create({
      name: `Initial Shop Name ${suffix}`,
      address: '100 Nairobi Highway',
      phone: '+254700111222',
      organizationId: testOrg.id,
      active: true
    });

    inactiveShop = await Shop.create({
      name: `Inactive Branch ${suffix}`,
      address: '200 Mombasa Road',
      phone: '+254700333444',
      organizationId: testOrg.id,
      active: false
    });

    ownerUser = await User.create({
      name: 'Test Owner',
      email: `owner_${suffix}@sec-test.local`,
      password: 'Password123!',
      role: 'admin',
      shopId: testShop.id,
      organizationId: testOrg.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    managerUser = await User.create({
      name: 'Test Manager',
      email: `manager_${suffix}@sec-test.local`,
      password: 'Password123!',
      role: 'manager',
      shopId: testShop.id,
      organizationId: testOrg.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    const managerMem = await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: managerUser.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: managerMem.id,
      shopId: testShop.id,
      isDefault: true
    });

    inactiveShopManager = await User.create({
      name: 'Inactive Shop Manager',
      email: `inact_mgr_${suffix}@sec-test.local`,
      password: 'Password123!',
      role: 'manager',
      shopId: inactiveShop.id,
      organizationId: testOrg.id,
      active: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    const inactMem = await OrganizationMembership.create({
      organizationId: testOrg.id,
      userId: inactiveShopManager.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: inactMem.id,
      shopId: inactiveShop.id,
      isDefault: true
    });

    ownerToken = signToken({
      id: ownerUser.id,
      role: 'admin',
      orgRole: 'owner',
      shopId: testShop.id,
      organizationId: testOrg.id,
      isEmployee: false,
      authzVersion: 1
    });

    managerToken = signToken({
      id: managerUser.id,
      role: 'manager',
      orgRole: 'member',
      shopId: testShop.id,
      organizationId: testOrg.id,
      isEmployee: false,
      authzVersion: 1
    });

    inactiveShopManagerToken = signToken({
      id: inactiveShopManager.id,
      role: 'manager',
      orgRole: 'member',
      shopId: inactiveShop.id,
      organizationId: testOrg.id,
      isEmployee: false,
      authzVersion: 1
    });
  });

  afterAll(async () => {
    // Teardown created test entities
    if (inactiveShopManager) await User.destroy({ where: { id: inactiveShopManager.id } }).catch(() => {});
    if (managerUser) await User.destroy({ where: { id: managerUser.id } }).catch(() => {});
    if (ownerUser) await User.destroy({ where: { id: ownerUser.id } }).catch(() => {});
    if (inactiveShop) await Shop.destroy({ where: { id: inactiveShop.id } }).catch(() => {});
    if (testShop) await Shop.destroy({ where: { id: testShop.id } }).catch(() => {});
    if (testOrg) await Organization.destroy({ where: { id: testOrg.id } }).catch(() => {});
  });

  beforeEach(async () => {
    // Reset testShop to active: true
    await Shop.update({ active: true }, { where: { id: testShop.id } });
    // Reset inactiveShop to active: false
    await Shop.update({ active: false }, { where: { id: inactiveShop.id } });
  });

  test('a. manager PUT /api/shops/me {"active":false} => response 200, DB shop.active stays true', async () => {
    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(Boolean(reloaded.active)).toBe(true);
  });

  test('b. org owner/admin-role user PUT /api/shops/me {"active":false} => stays true (the endpoint is for profile fields only)', async () => {
    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', ownerToken)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(Boolean(reloaded.active)).toBe(true);
  });

  test('c. manager PUT /api/shops/me {"name":"New Name","active":false} => name updates, active stays true', async () => {
    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ name: 'Renamed Branch Safely', active: false });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Branch Safely');
    expect(res.body.active).toBe(true);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.name).toBe('Renamed Branch Safely');
    expect(Boolean(reloaded.active)).toBe(true);
  });

  test('d. manager PUT /api/shops/me {"active":true} on an inactive shop => rejected 403 SHOP_INACTIVE and stays inactive', async () => {
    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', inactiveShopManagerToken)
      .send({ active: true });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHOP_INACTIVE');

    const reloaded = await Shop.findByPk(inactiveShop.id);
    expect(Boolean(reloaded.active)).toBe(false);
  });

  test('e. address and phone still update normally', async () => {
    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({
        address: '789 Updated Avenue',
        phone: '+254799887766'
      });

    expect(res.status).toBe(200);
    expect(res.body.address).toBe('789 Updated Avenue');
    expect(res.body.phone).toBe('+254799887766');

    const reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.address).toBe('789 Updated Avenue');
    expect(reloaded.phone).toBe('+254799887766');
  });
});
