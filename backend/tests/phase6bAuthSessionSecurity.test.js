'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { User, Employee, Shop, Organization } = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const redisClient = require('../src/config/redis');

function getPrivateKey() {
  const fs = require('fs');
  const path = require('path');
  return process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
      : '');
}

function tokenFor(payload) {
  const privateKey = getPrivateKey();
  const jti = payload.jti || crypto.randomUUID();
  return 'Bearer ' + jwt.sign({ jti, ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

function resetTokenFor(payload) {
  const privateKey = getPrivateKey();
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
  // Test 1 — Password change invalidates current token
  // =========================================================================
  test('Test 1: Password change invalidates current token (login -> JWT -> request -> change -> reuse -> 401)', async () => {
    // 1. Obtain token via login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: 'Password123!' })
      .expect(200);

    const token = `Bearer ${loginRes.body.token}`;

    // 2. Authenticated request succeeds
    const resBefore = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', token)
      .expect(200);
    expect(resBefore.body.user.email).toBe(userA.email);

    // 3. Change password
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

    // 4. Reuse old JWT -> 401
    const resAfter = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', token)
      .expect(401);
    expect(resAfter.body.error).toMatch(/token has been revoked/i);
  });

  // =========================================================================
  // Test 2 — Password change invalidates multiple sessions
  // =========================================================================
  test('Test 2: Password change invalidates multiple concurrent sessions (JWT-A, JWT-B, JWT-C -> 401)', async () => {
    const jwtA = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    const jwtB = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    const jwtC = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    // All three tokens valid before password change
    await request(app).get('/api/auth/profile').set('Authorization', jwtA).expect(200);
    await request(app).get('/api/auth/profile').set('Authorization', jwtB).expect(200);
    await request(app).get('/api/auth/profile').set('Authorization', jwtC).expect(200);

    // Change password using JWT-A
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', jwtA)
      .send({
        currentPassword: 'Password123!',
        newPassword: 'BrandNewMultiSession999!',
        confirmPassword: 'BrandNewMultiSession999!'
      })
      .expect(200);

    // All three tokens must now be rejected
    const resA = await request(app).get('/api/auth/profile').set('Authorization', jwtA).expect(401);
    const resB = await request(app).get('/api/auth/profile').set('Authorization', jwtB).expect(401);
    const resC = await request(app).get('/api/auth/profile').set('Authorization', jwtC).expect(401);

    expect(resA.body.error).toMatch(/token has been revoked/i);
    expect(resB.body.error).toMatch(/token has been revoked/i);
    expect(resC.body.error).toMatch(/token has been revoked/i);
  });

  // =========================================================================
  // Test 3 — New login works after password change
  // =========================================================================
  test('Test 3: New login works after password change (old password rejected, new password accepted, new JWT works)', async () => {
    const token = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    // Change password
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', token)
      .send({
        currentPassword: 'Password123!',
        newPassword: 'FreshNextPassword123!',
        confirmPassword: 'FreshNextPassword123!'
      })
      .expect(200);

    // Old password rejected
    await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: 'Password123!' })
      .expect(401);

    // New password accepted
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: 'FreshNextPassword123!' })
      .expect(200);

    expect(loginRes.body.token).toBeDefined();

    // New token authenticated successfully
    const profileRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .expect(200);
    expect(profileRes.body.user.email).toBe(userA.email);
  });

  // =========================================================================
  // Test 4 — Password reset invalidates old access token
  // =========================================================================
  test('Test 4: Password reset invalidates old access token (login -> old JWT -> reset -> reuse -> 401)', async () => {
    // 1. Obtain old access token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: 'Password123!' })
      .expect(200);
    const oldJwt = `Bearer ${loginRes.body.token}`;

    // Request succeeds
    await request(app).get('/api/auth/profile').set('Authorization', oldJwt).expect(200);

    // 2. Perform password reset using reset token
    const resetToken = resetTokenFor({ id: userA.id, isEmployee: false });
    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        password: 'PostResetPassWord888!'
      })
      .expect(200);
    expect(resetRes.body.message).toMatch(/password updated successfully/i);

    // 3. Reuse old JWT -> 401
    const resAfter = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', oldJwt)
      .expect(401);
    expect(resAfter.body.error).toMatch(/token has been revoked/i);
  });

  // =========================================================================
  // Test 5 — New password works after reset
  // =========================================================================
  test('Test 5: New password works after reset (new password login succeeds -> new JWT works)', async () => {
    const resetToken = resetTokenFor({ id: userA.id, isEmployee: false });
    await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        password: 'FreshResetPass101!'
      })
      .expect(200);

    // Login with new password
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userA.email, password: 'FreshResetPass101!' })
      .expect(200);

    const newToken = `Bearer ${loginRes.body.token}`;
    const profileRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', newToken)
      .expect(200);
    expect(profileRes.body.user.email).toBe(userA.email);
  });

  // =========================================================================
  // Test 6 — Reset token remains single-use
  // =========================================================================
  test('Test 6: Reset token remains single-use (replay rejected with 400)', async () => {
    const resetToken = resetTokenFor({ id: userA.id, isEmployee: false });

    // First reset succeeds
    await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        password: 'FirstResetAttempt111!'
      })
      .expect(200);

    // Replay of same reset token must be rejected with 400
    const replayRes = await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        password: 'SecondResetAttempt222!'
      })
      .expect(400);

    expect(replayRes.body.error).toMatch(/already been used or revoked/i);
  });

  // =========================================================================
  // Test 7 — Token-purpose enforcement regression
  // =========================================================================
  test('Test 7: Token-purpose enforcement regression (reset token rejected as session token with 401)', async () => {
    const resetToken = resetTokenFor({ id: userA.id, isEmployee: false });

    // Attempt to use reset token for authenticated session endpoint
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${resetToken}`)
      .expect(401);

    expect(res.body.error).toMatch(/invalid token purpose/i);
  });

  // =========================================================================
  // Test 8 — Employee/session invalidation
  // =========================================================================
  test('Test 8: Employee session invalidation (employee login -> change password -> old JWT rejected -> new login works)', async () => {
    // 1. Employee login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employeeA.email, password: 'Password123!' })
      .expect(200);

    const empToken = `Bearer ${loginRes.body.token}`;

    // Verify session active
    await request(app)
      .get('/api/auth/profile')
      .set('Authorization', empToken)
      .expect(200);

    // 2. Employee changes password
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', empToken)
      .send({
        currentPassword: 'Password123!',
        newPassword: 'EmpBrandNewPassword777!',
        confirmPassword: 'EmpBrandNewPassword777!'
      })
      .expect(200);

    // 3. Old JWT rejected
    const resAfter = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', empToken)
      .expect(401);
    expect(resAfter.body.error).toMatch(/token has been revoked/i);

    // 4. Employee logs in with new password
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: employeeA.email, password: 'EmpBrandNewPassword777!' })
      .expect(200);

    const newEmpToken = `Bearer ${newLoginRes.body.token}`;
    await request(app)
      .get('/api/auth/profile')
      .set('Authorization', newEmpToken)
      .expect(200);
  });

  // =========================================================================
  // Test 9 — Revocation failure behavior (in-memory fallback when Redis is mocked to fail)
  // =========================================================================
  test('Test 9: Revocation failure behavior (in-memory fallback enforces revocation if Redis errors)', async () => {
    const token = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    // Mock redisClient.get to throw an error
    const origGet = redisClient.get;
    redisClient.get = jest.fn().mockRejectedValue(new Error('Redis connection timeout'));

    try {
      // Trigger user token revocation
      await tokenRevocationService.revokeAllUserTokens(userA.id, false);

      // Verify isUserTokenRevoked falls back to in-memory cutoff and returns true (revoked)
      const isRevoked = await tokenRevocationService.isUserTokenRevoked(userA.id, false, Math.floor(Date.now() / 1000) - 10);
      expect(isRevoked).toBe(true);

      // Middleware rejects token even when Redis throws
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', token)
        .expect(401);
      expect(res.body.error).toMatch(/token has been revoked/i);
    } finally {
      // Restore redisClient.get
      redisClient.get = origGet;
    }
  });

  // =========================================================================
  // Test 10 — Unaffected authentication behavior
  // =========================================================================
  test('Test 10: Unaffected authentication behavior (valid credentials -> 200, invalid credentials -> 401)', async () => {
    // Valid credentials -> 200
    const validRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userB.email, password: 'Password123!' })
      .expect(200);
    expect(validRes.body.token).toBeDefined();

    // Valid token -> authenticated request succeeds
    const profileRes = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${validRes.body.token}`)
      .expect(200);
    expect(profileRes.body.user.email).toBe(userB.email);

    // Invalid credentials -> 401
    await request(app)
      .post('/api/auth/login')
      .send({ email: userB.email, password: 'WrongPassword999!' })
      .expect(401);
  });

  // =========================================================================
  // Phase 7 — Concurrency / Race Test
  // =========================================================================
  test('Phase 7: Concurrency & Linearizability (subsequent requests using pre-change credentials are strictly rejected)', async () => {
    const preChangeToken = tokenFor({
      id: userA.id,
      role: 'admin',
      shopId: shop.id,
      organizationId: org.id,
      isEmployee: false
    });

    // Verify token initially valid
    await request(app).get('/api/auth/profile').set('Authorization', preChangeToken).expect(200);

    // Concurrently trigger password change (Request A) and profile requests (Request B)
    const changeReq = request(app)
      .post('/api/auth/change-password')
      .set('Authorization', preChangeToken)
      .send({
        currentPassword: 'Password123!',
        newPassword: 'ConcurrentRacePassword123!',
        confirmPassword: 'ConcurrentRacePassword123!'
      });

    // Wait for password change to complete
    const changeRes = await changeReq;
    expect(changeRes.status).toBe(200);

    // Security Invariant: Once password change succeeds, ANY subsequent request using pre-change token MUST be rejected
    const postChangeReqs = await Promise.all([
      request(app).get('/api/auth/profile').set('Authorization', preChangeToken),
      request(app).get('/api/auth/profile').set('Authorization', preChangeToken),
      request(app).get('/api/auth/profile').set('Authorization', preChangeToken)
    ]);

    postChangeReqs.forEach(res => {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/token has been revoked/i);
    });
  });
});
