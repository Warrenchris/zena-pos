'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const {
  User,
  Shop,
  Organization,
  OrganizationMembership
} = require('../src/models');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(
    { jti: crypto.randomUUID(), ...payload },
    privateKey,
    { algorithm: 'RS256', expiresIn: '2h' }
  );
}

describe('getProfile uses JWT shopId as the active branch', () => {
  let org;
  let homeShop;
  let otherShop;
  let user;

  beforeAll(async () => {
    const ts = Date.now();
    org = await Organization.create({
      name: `Active Shop Org ${ts}`,
      slug: `active-shop-org-${ts}`,
      status: 'active'
    });
    homeShop = await Shop.create({
      name: `Home Branch ${ts}`,
      organizationId: org.id,
      active: true
    });
    otherShop = await Shop.create({
      name: `Other Branch ${ts}`,
      organizationId: org.id,
      active: true
    });
    user = await User.create({
      name: 'Branch Switcher',
      email: `branch_switch_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: homeShop.id,
      active: true
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'owner',
      status: 'active'
    });
  });

  test('when JWT shopId differs from User.shopId, profile reports the JWT shop', async () => {
    expect(user.shopId).toBe(homeShop.id);
    expect(otherShop.id).not.toBe(homeShop.id);

    const token = tokenFor({
      id: user.id,
      role: 'admin',
      shopId: otherShop.id,
      organizationId: org.id,
      isEmployee: false
    });

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', token)
      .expect(200);

    expect(res.body.user.shopId).toBe(otherShop.id);
    expect(res.body.user.shop.id).toBe(otherShop.id);
    expect(res.body.user.shopId).toBe(res.body.user.shop.id);
    expect(res.body.shop.id).toBe(otherShop.id);
    expect(res.body.user.shop.name).toBe(otherShop.name);
  });
});
