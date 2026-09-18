const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const { User, Shop, Organization, OrganizationMembership } = require('../src/models');
const { getPrivateKey } = require('../src/controllers/authController');

describe('ITEM 1: Token Purpose Enforcement in Auth Middleware (SEC-03 completion)', () => {
  let org;
  let shop;
  let user;
  let resetToken;
  let sessionToken;

  beforeAll(async () => {
    const timestamp = Date.now();
    org = await Organization.create({
      name: `Org Token ${timestamp}`,
      slug: `org-token-${timestamp}`,
      status: 'active'
    });

    shop = await Shop.create({
      name: `Shop Token ${timestamp}`,
      organizationId: org.id,
      active: true
    });

    const testEmail = `tokenpurpose_${timestamp}@example.com`;
    user = await User.create({
      name: 'Token Purpose Test User',
      email: testEmail,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'owner',
      status: 'active'
    });

    const privateKey = getPrivateKey();

    // Mint genuine reset token (as forgotPassword does)
    const resetJti = crypto.randomUUID();
    resetToken = jwt.sign(
      { id: user.id, purpose: 'password_reset', jti: resetJti },
      privateKey,
      { algorithm: 'RS256', expiresIn: '15m' }
    );

    // Mint normal session token (without purpose)
    const sessionJti = crypto.randomUUID();
    sessionToken = jwt.sign(
      {
        id: user.id,
        role: user.role,
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false,
        jti: sessionJti
      },
      privateKey,
      { algorithm: 'RS256', expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    if (user) {
      await OrganizationMembership.destroy({ where: { userId: user.id } }).catch(() => {});
      await User.destroy({ where: { id: user.id } }).catch(() => {});
    }
    if (shop) {
      await Shop.destroy({ where: { id: shop.id } }).catch(() => {});
    }
    if (org) {
      await Organization.destroy({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('GET /api/auth/profile rejects genuine password_reset token with 401', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${resetToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid token purpose');
  });

  test('GET /api/auth/profile allows normal session token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(user.id);
  });

  test('POST /api/auth/reset-password continues to accept the reset token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        password: 'NewPassword123!'
      });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated successfully');
  });
});
