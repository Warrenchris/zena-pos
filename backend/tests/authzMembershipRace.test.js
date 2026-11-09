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
  Subscription,
  Plan
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

describe('OrganizationMembership findOrCreate Race Hardening in authzContext', () => {
  let org;
  let shop;
  let plan;
  const createdUserIds = [];

  beforeAll(async () => {
    await sequelize.authenticate();

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    [plan] = await Plan.findOrCreate({
      where: { code: 'growth' },
      defaults: {
        name: 'Growth Plan',
        code: 'growth',
        priceMonthly: 5000,
        currency: 'KES',
        maxShops: 5,
        maxUsers: 20,
        features: { analytics: true, ai_insights: true, org_insights: true },
        isActive: true
      }
    });

    org = await Organization.create({
      name: `Race Test Org ${suffix}`,
      slug: `race-test-org-${suffix}`,
      status: 'active',
      currency: 'KES',
      planCode: plan.code
    });

    await Subscription.create({
      organizationId: org.id,
      planId: plan.id,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000)
    });

    shop = await Shop.create({
      name: `Race Test Shop ${suffix}`,
      organizationId: org.id,
      active: true
    });
  });

  afterAll(async () => {
    if (org) {
      await OrganizationMembership.destroy({ where: { organizationId: org.id } });
      if (createdUserIds.length > 0) {
        await User.destroy({ where: { id: createdUserIds } });
      }
      await Shop.destroy({ where: { organizationId: org.id } });
      await Subscription.destroy({ where: { organizationId: org.id } });
      await Organization.destroy({ where: { id: org.id } });
    }
  });

  it('resolves concurrent requests without 500 and creates exactly 1 membership row', async () => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const testUser = await User.create({
      name: `Race User ${suffix}`,
      email: `race_user_${suffix}@test.local`,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      active: true,
      emailVerified: true,
      authzVersion: 1
    });
    createdUserIds.push(testUser.id);

    // Explicitly guarantee no membership row exists prior to request wave
    await OrganizationMembership.destroy({
      where: { userId: testUser.id }
    });

    const userToken = signToken({
      id: testUser.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Fire 10 parallel authenticated requests
    const requests = Array.from({ length: 10 }, () =>
      request(app)
        .get('/api/categories')
        .set('Authorization', userToken)
    );

    const responses = await Promise.all(requests);

    // All 10 requests must succeed with 200
    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });

    // Exactly one membership row must exist for this user and organization
    const memberships = await OrganizationMembership.findAll({
      where: {
        userId: testUser.id,
        organizationId: org.id
      }
    });

    expect(memberships).toHaveLength(1);
    expect(memberships[0].orgRole).toBe('owner');
    expect(memberships[0].status).toBe('active');
  });

  it('propagates unrelated errors and returns 500', async () => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const failUser = await User.create({
      name: `Fail User ${suffix}`,
      email: `fail_user_${suffix}@test.local`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shop.id,
      active: true,
      emailVerified: true,
      authzVersion: 1
    });
    createdUserIds.push(failUser.id);

    await OrganizationMembership.destroy({
      where: { userId: failUser.id }
    });

    const failToken = signToken({
      id: failUser.id,
      role: 'cashier',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    const spy = jest
      .spyOn(OrganizationMembership, 'findOrCreate')
      .mockRejectedValueOnce(new Error('Simulated unexpected database failure'));

    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', failToken);

    spy.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUTHORIZATION_CONTEXT_ERROR');
  });

  it('rethrows original error if findOne returns null after race error', async () => {
    const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

    const phantomUser = await User.create({
      name: `Phantom User ${suffix}`,
      email: `phantom_user_${suffix}@test.local`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shop.id,
      active: true,
      emailVerified: true,
      authzVersion: 1
    });
    createdUserIds.push(phantomUser.id);

    await OrganizationMembership.destroy({
      where: { userId: phantomUser.id }
    });

    const phantomToken = signToken({
      id: phantomUser.id,
      role: 'cashier',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    const raceError = new Error('Transaction cannot be committed because it has been finished with state: rollback');
    const spyFindOrCreate = jest
      .spyOn(OrganizationMembership, 'findOrCreate')
      .mockRejectedValueOnce(raceError);
    const spyFindOne = jest
      .spyOn(OrganizationMembership, 'findOne')
      .mockResolvedValueOnce(null);

    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', phantomToken);

    spyFindOrCreate.mockRestore();
    spyFindOne.mockRestore();

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUTHORIZATION_CONTEXT_ERROR');
  });
});
