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

describe('PUT /api/shops/me tax fields (kraPin & registrationNumber)', () => {
  let testOrg;
  let testShop;
  let managerUser;
  let managerToken;

  beforeAll(async () => {
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    testOrg = await Organization.create({
      name: `Tax Fields Test Org ${suffix}`,
      slug: `tax-org-${suffix}`,
      status: 'active',
      currency: 'KES'
    });

    testShop = await Shop.create({
      name: `Initial Shop ${suffix}`,
      address: '123 Market Street',
      phone: '+254700000000',
      kraPin: 'INITIALPIN',
      registrationNumber: 'REG/INIT/001',
      organizationId: testOrg.id,
      active: true
    });

    managerUser = await User.create({
      name: 'Tax Test Manager',
      email: `mgr_${suffix}@tax-test.local`,
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

    managerToken = signToken({
      id: managerUser.id,
      role: 'manager',
      orgRole: 'member',
      shopId: testShop.id,
      organizationId: testOrg.id,
      isEmployee: false,
      authzVersion: 1
    });
  });

  afterAll(async () => {
    if (managerUser) await User.destroy({ where: { id: managerUser.id } }).catch(() => {});
    if (testShop) await Shop.destroy({ where: { id: testShop.id } }).catch(() => {});
    if (testOrg) await Organization.destroy({ where: { id: testOrg.id } }).catch(() => {});
  });

  beforeEach(async () => {
    await Shop.update({
      name: 'Initial Shop',
      address: '123 Market Street',
      phone: '+254700000000',
      kraPin: 'INITIALPIN',
      registrationNumber: 'REG/INIT/001',
      active: true
    }, { where: { id: testShop.id } });
  });

  test('a. manager PUT /api/shops/me {"kraPin":" A012345678Z ","registrationNumber":"CPR/2023/12345"} => 200; DB has kraPin "A012345678Z" (trimmed) and the registrationNumber; GET /api/shop/me returns both', async () => {
    const putRes = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({
        kraPin: ' A012345678Z ',
        registrationNumber: 'CPR/2023/12345'
      });

    expect(putRes.status).toBe(200);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.kraPin).toBe('A012345678Z');
    expect(reloaded.registrationNumber).toBe('CPR/2023/12345');

    const getRes = await request(app)
      .get('/api/shop/me')
      .set('Authorization', managerToken);

    expect(getRes.status).toBe(200);
    expect(getRes.body.kraPin).toBe('A012345678Z');
    expect(getRes.body.registrationNumber).toBe('CPR/2023/12345');
  });

  test('b. PUT {"kraPin":""} and {"kraPin":"   "} => DB value is NULL', async () => {
    const emptyRes = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ kraPin: '' });

    expect(emptyRes.status).toBe(200);
    let reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.kraPin).toBeNull();

    await Shop.update({ kraPin: 'INITIALPIN' }, { where: { id: testShop.id } });

    const spacesRes = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ kraPin: '   ' });

    expect(spacesRes.status).toBe(200);
    reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.kraPin).toBeNull();
  });

  test('c. PUT {"name":"New Name"} only => name changes, kraPin and registrationNumber are UNCHANGED', async () => {
    await Shop.update({
      kraPin: 'STABLE_PIN',
      registrationNumber: 'STABLE_REG'
    }, { where: { id: testShop.id } });

    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');

    const reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.name).toBe('New Name');
    expect(reloaded.kraPin).toBe('STABLE_PIN');
    expect(reloaded.registrationNumber).toBe('STABLE_REG');
  });

  test('d. PUT {"kraPin":"x".repeat(256),"name":"Should Not Save"} => 400 and NOTHING changed (name included)', async () => {
    await Shop.update({
      name: 'Initial Shop',
      kraPin: 'STABLE_PIN'
    }, { where: { id: testShop.id } });

    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({
        kraPin: 'x'.repeat(256),
        name: 'Should Not Save'
      });

    expect(res.status).toBe(400);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.name).toBe('Initial Shop');
    expect(reloaded.kraPin).toBe('STABLE_PIN');
  });

  test('e. PUT {"kraPin":123} and {"registrationNumber":{}} => 400, no crash, no change', async () => {
    await Shop.update({
      name: 'Initial Shop',
      kraPin: 'STABLE_PIN',
      registrationNumber: 'STABLE_REG'
    }, { where: { id: testShop.id } });

    const resNum = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({
        kraPin: 123,
        name: 'Changed Name'
      });

    expect(resNum.status).toBe(400);

    let reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.name).toBe('Initial Shop');
    expect(reloaded.kraPin).toBe('STABLE_PIN');

    const resObj = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({
        registrationNumber: {},
        name: 'Changed Name'
      });

    expect(resObj.status).toBe(400);

    reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.name).toBe('Initial Shop');
    expect(reloaded.registrationNumber).toBe('STABLE_REG');
  });

  test('f. PUT {"kraPin":null} => DB NULL (explicit clear)', async () => {
    await Shop.update({ kraPin: 'INITIALPIN' }, { where: { id: testShop.id } });

    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ kraPin: null });

    expect(res.status).toBe(200);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(reloaded.kraPin).toBeNull();
  });

  test('g. regression: {"active":false} still ignored (existing behavior)', async () => {
    const res = await request(app)
      .put('/api/shops/me')
      .set('Authorization', managerToken)
      .send({ active: false });

    expect(res.status).toBe(200);
    expect(res.body.active).toBe(true);

    const reloaded = await Shop.findByPk(testShop.id);
    expect(Boolean(reloaded.active)).toBe(true);
  });
});
