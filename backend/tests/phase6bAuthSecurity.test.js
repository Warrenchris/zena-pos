'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { User, Employee, Shop, Organization } = require('../models');
const tokenRevocationService = require('../src/services/tokenRevocationService');

function tokenFor(payload) {
  const fs = require('fs');
  const path = require('path');
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

function resetTokenFor(payload) {
  const fs = require('fs');
  const path = require('path');
  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');

  const jti = payload.jti || crypto.randomUUID();
  return jwt.sign({ jti, purpose: 'password_reset', ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '15m'
  });
}

describe('Phase 6B-02: Authentication & Session Invalidation Hardening (AUTH-02 & AUTH-03)', () => {
  let org;
  let shop;
  let userA, userB;
  let employeeA;

  beforeAll(async () => {
    await sequelize.authenticate();
  }, 30000);

  beforeEach(async () => {
    const ts = Date.now() + '-' + Math.floor(Math.random() * 100000);

    org = await Organization.create({
      name: `Auth Org ${ts}`,
      slug: `auth-org-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shop = await Shop.create({
      name: `Auth Shop ${ts}`,
      organizationId: org.id,
      active: true
    });

    userA = await User.create({
      name: `User A ${ts}`,
      email: `user-a-${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id
    });

    userB = await User.create({
      name: `User B ${ts}`,
      email: `user-b-${ts}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shop.id,
      organizationId: org.id
    });

    employeeA = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Emp',
      lastName: `A ${ts}`,
      email: `emp-a-${ts}@example.com`,
      password: 'Password123!',
      position: 'cashier',
      role: 'cashier',
      salary: 30000,
      status: 'active',
      shopId: shop.id
    });
  });

  afterEach(async () => {
    if (userA) await tokenRevocationService.clearUserTokenCutoff(userA.id, false);
    if (userB) await tokenRevocationService.clearUserTokenCutoff(userB.id, false);
    if (employeeA) await tokenRevocationService.clearUserTokenCutoff(employeeA.id, true);
  });

  // =========================================================================
  // AUTH-02: Password Change Session Invalidation
  // =========================================================================
  describe('AUTH-02: Password change session invalidation', () => {
    test('User password change immediately invalidates the active session token (401)', async () => {
      const token = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      // 1. Initial request succeeds
      const resBefore = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token)
        .expect(200);
      expect(resBefore.body.user.email).toBe(userA.email);

      // 2. Change password
      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', token)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewSecurePassword456!',
          confirmPassword: 'NewSecurePassword456!'
        })
        .expect(200);
      expect(changeRes.body.success).toBe(true);

      // 3. Subsequent request with previous token must be rejected with 401
      const resAfter = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token)
        .expect(401);
      expect(resAfter.body.error).toMatch(/token has been revoked/i);
    });

    test('Employee password change immediately invalidates the active session token (401)', async () => {
      const token = tokenFor({
        id: employeeA.id,
        role: 'cashier',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: true
      });

      // 1. Initial request succeeds
      const resBefore = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token)
        .expect(200);
      expect(resBefore.body.user.email).toBe(employeeA.email);

      // 2. Employee changes password
      const changeRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', token)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'EmpNewPassword789!',
          confirmPassword: 'EmpNewPassword789!'
        })
        .expect(200);
      expect(changeRes.body.success).toBe(true);

      // 3. Subsequent request with previous token must be rejected with 401
      const resAfter = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token)
        .expect(401);
      expect(resAfter.body.error).toMatch(/token has been revoked/i);
    });

    test('Password change invalidates multiple concurrent session tokens for the same user', async () => {
      // Device 1 (e.g. mobile)
      const tokenDevice1 = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      // Device 2 (e.g. desktop/laptop)
      const tokenDevice2 = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      // Both devices active before password change
      await request(app).get('/api/auth/profile').set('Authorization', tokenDevice1).expect(200);
      await request(app).get('/api/auth/profile').set('Authorization', tokenDevice2).expect(200);

      // Device 1 changes password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', tokenDevice1)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'BrandNewPassword999!',
          confirmPassword: 'BrandNewPassword999!'
        })
        .expect(200);

      // Both Device 1 AND Device 2 tokens must now be rejected
      const resDev1 = await request(app).get('/api/auth/profile').set('Authorization', tokenDevice1).expect(401);
      const resDev2 = await request(app).get('/api/auth/profile').set('Authorization', tokenDevice2).expect(401);

      expect(resDev1.body.error).toMatch(/token has been revoked/i);
      expect(resDev2.body.error).toMatch(/token has been revoked/i);
    });

    test('User can immediately log in with new password and the new session is valid', async () => {
      const tokenOld = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', tokenOld)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NextLoginPassword101!',
          confirmPassword: 'NextLoginPassword101!'
        })
        .expect(200);

      // Attempt login with old password -> 401
      await request(app)
        .post('/api/auth/login')
        .send({ email: userA.email, password: 'Password123!' })
        .expect(401);

      // Login with new password -> 200
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: userA.email, password: 'NextLoginPassword101!' })
        .expect(200);

      expect(loginRes.body.token).toBeDefined();

      // Newly issued token must succeed on authenticated routes
      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(200);

      expect(profileRes.body.user.email).toBe(userA.email);
    });
  });

  // =========================================================================
  // AUTH-03: Password Reset Session Invalidation
  // =========================================================================
  describe('AUTH-03: Password reset session invalidation', () => {
    test('Password reset immediately invalidates existing active sessions for that account', async () => {
      // Active session existing prior to password reset
      const preResetSession = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      // Verified active prior to reset
      await request(app)
        .get('/api/auth/profile')
        .set('Authorization', preResetSession)
        .expect(200);

      // Perform password reset using reset token
      const resetToken = resetTokenFor({ id: userA.id, isEmployee: false });
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'PostResetPassword202!'
        })
        .expect(200);

      expect(resetRes.body.message).toMatch(/password updated successfully/i);

      // Pre-reset session token MUST now be rejected
      const sessionAfter = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', preResetSession)
        .expect(401);

      expect(sessionAfter.body.error).toMatch(/token has been revoked/i);

      // Login with newly reset password works
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: userA.email, password: 'PostResetPassword202!' })
        .expect(200);

      expect(loginRes.body.token).toBeDefined();
    });

    test('Password reset token is single-use and cannot be used again', async () => {
      const resetToken = resetTokenFor({ id: userA.id, isEmployee: false });

      // First reset succeeds
      await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'FirstResetPass303!'
        })
        .expect(200);

      // Replay of same reset token must be rejected with 400
      const replayRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          password: 'SecondResetPass404!'
        })
        .expect(400);

      expect(replayRes.body.error).toMatch(/already been used or revoked/i);
    });
  });

  // =========================================================================
  // Tenant & Account Isolation
  // =========================================================================
  describe('Account isolation & resilience', () => {
    test("User A's password change does NOT invalidate User B's active session", async () => {
      const tokenA = tokenFor({
        id: userA.id,
        role: 'admin',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      const tokenB = tokenFor({
        id: userB.id,
        role: 'cashier',
        shopId: shop.id,
        organizationId: org.id,
        isEmployee: false
      });

      // Both active
      await request(app).get('/api/auth/profile').set('Authorization', tokenA).expect(200);
      await request(app).get('/api/auth/profile').set('Authorization', tokenB).expect(200);

      // User A changes password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', tokenA)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'UserANewPass505!',
          confirmPassword: 'UserANewPass505!'
        })
        .expect(200);

      // User A token is revoked (401)
      await request(app).get('/api/auth/profile').set('Authorization', tokenA).expect(401);

      // User B token MUST remain active (200)
      const resB = await request(app).get('/api/auth/profile').set('Authorization', tokenB).expect(200);
      expect(resB.body.user.email).toBe(userB.email);
    });
  });
});
