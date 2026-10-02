'use strict';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');
const redisClient = require('../src/config/redis');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const staffCreationService = require('../src/services/staffCreationService');
const userController = require('../src/controllers/userController');
const employeeController = require('../src/controllers/employeeController');
const shopController = require('../src/controllers/shopController');
const { auth, authzContext, checkRole } = require('../src/middleware/auth');

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

describe('Gate 2B: Authorization Epoch Mutation Wiring', () => {
  let app;
  let org;
  let shop1, shop2;
  let ownerUser;

  beforeAll(async () => {
    await sequelize.authenticate();

    app = express();
    app.use(express.json());

    // Protected dummy endpoint using auth + authzContext
    app.get('/test/protected', auth, (req, res) => {
      res.json({
        success: true,
        authzVersion: req.authz.session.authzVersion,
        role: req.authz.role.effectiveRole
      });
    });

    // Controllers under test
    app.put('/api/users/:id/role', auth, userController.updateRole);
    app.put('/api/employees/:id', auth, employeeController.updateEmployee);
    app.post('/api/shops', auth, shopController.createShop);
    app.post('/api/shops/:id/access', auth, shopController.grantShopAccess);
    app.delete('/api/shops/:id/access/:membershipId', auth, shopController.revokeShopAccess);

    // Seed base test organization and shops
    const uniqueSuffix = Date.now();
    org = await Organization.create({
      name: `Epoch Test Org ${uniqueSuffix}`,
      slug: `epoch-test-${uniqueSuffix}`,
      status: 'active',
      currency: 'KES'
    });

    shop1 = await Shop.create({
      name: `Epoch Shop 1 ${uniqueSuffix}`,
      organizationId: org.id,
      active: true
    });

    shop2 = await Shop.create({
      name: `Epoch Shop 2 ${uniqueSuffix}`,
      organizationId: org.id,
      active: true
    });

    ownerUser = await User.create({
      name: 'Epoch Org Owner',
      email: `owner_${uniqueSuffix}@example.com`,
      password: 'Password123!',
      role: 'admin',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: 1, // Will be resolved dynamically
      shopId: shop1.id,
      isDefault: true
    }).catch(() => {});
  });

  afterAll(async () => {
    // Teardown cleanup
  });

  // Helper to generate owner token
  function getOwnerToken() {
    return tokenFor({
      id: ownerUser.id,
      role: 'admin',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      orgRole: 'owner',
      authzVersion: 1
    });
  }

  // 1. User role demotion
  it('Scenario 1: demoting user role increments authzVersion and invalidates existing session', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Admin To Demote',
      email: `demote_${uid}@example.com`,
      password: 'Password123!',
      role: 'admin',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'admin',
      status: 'active'
    });

    const userTokenV1 = tokenFor({
      id: user.id,
      role: 'admin',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Session v1 succeeds initially
    const resPre = await request(app)
      .get('/test/protected')
      .set('Authorization', userTokenV1);
    expect(resPre.status).toBe(200);

    // Demote role to manager
    const updateRes = await request(app)
      .put(`/api/users/${user.id}/role`)
      .set('Authorization', getOwnerToken())
      .send({ role: 'manager' });
    expect(updateRes.status).toBe(200);

    // Verify DB epoch bumped
    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.role).toBe('manager');
    expect(refreshedUser.authzVersion).toBe(2);

    // Session v1 MUST be rejected with HTTP 401 AUTHZ_VERSION_STALE
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', userTokenV1);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');

    // Fresh token with v2 succeeds
    const userTokenV2 = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 2
    });
    const resV2 = await request(app)
      .get('/test/protected')
      .set('Authorization', userTokenV2);
    expect(resV2.status).toBe(200);
    expect(resV2.body.authzVersion).toBe(2);
  });

  // 2. User role promotion
  it('Scenario 2: promoting user role increments authzVersion and invalidates old session', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Manager To Promote',
      email: `promote_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'active'
    });

    const tokenV1 = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Promote to admin
    const updateRes = await request(app)
      .put(`/api/users/${user.id}/role`)
      .set('Authorization', getOwnerToken())
      .send({ role: 'admin' });
    expect(updateRes.status).toBe(200);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.role).toBe('admin');
    expect(refreshedUser.authzVersion).toBe(2);

    // Old token rejected
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', tokenV1);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // 3. Employee role change
  it('Scenario 3: employee position change increments authzVersion and invalidates previous session', async () => {
    const uid = Date.now();
    const employee = await Employee.create({
      firstName: 'Jane',
      lastName: 'Manager',
      email: `emp_pos_${uid}@example.com`,
      password: 'Password123!',
      position: 'manager',
      status: 'active',
      salary: 30000,
      shopId: shop1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      employeeId: employee.id,
      orgRole: 'member',
      status: 'active'
    });

    const empTokenV1 = tokenFor({
      id: employee.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: true,
      authzVersion: 1
    });

    // Change position via updateEmployee
    const updateRes = await request(app)
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', getOwnerToken())
      .send({ position: 'cashier' });
    expect(updateRes.status).toBe(200);

    const refreshedEmp = await Employee.findByPk(employee.id);
    expect(refreshedEmp.position).toBe('cashier');
    expect(refreshedEmp.authzVersion).toBe(2);

    // Old token rejected
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', empTokenV1);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // 4. Organization role change
  it('Scenario 4: organization role change increments authzVersion and invalidates session', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Member To Admin',
      email: `org_role_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });
    const membership = await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'active'
    });

    const userTokenV1 = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Update orgRole to admin via updateRole
    const updateRes = await request(app)
      .put(`/api/users/${user.id}/role`)
      .set('Authorization', getOwnerToken())
      .send({ orgRole: 'admin' });
    expect(updateRes.status).toBe(200);

    const refreshedUser = await User.findByPk(user.id);
    const refreshedMem = await OrganizationMembership.findByPk(membership.id);
    expect(refreshedMem.orgRole).toBe('admin');
    expect(refreshedUser.authzVersion).toBe(2);

    // Old token rejected
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', userTokenV1);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // 5. Membership suspension
  it('Scenario 5: membership suspension increments authzVersion and rejects existing token', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'User To Suspend',
      email: `suspend_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'active'
    });

    const tokenV1 = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Suspend user
    const resSuspend = await request(app)
      .put(`/api/users/${user.id}/role`)
      .set('Authorization', getOwnerToken())
      .send({ active: false });
    expect(resSuspend.status).toBe(200);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.active).toBe(false);
    expect(refreshedUser.authzVersion).toBe(2);

    // Token rejected
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', tokenV1);
    expect([401, 403]).toContain(resPost.status);
  });

  // 6. Membership reactivation
  it('Scenario 6: membership reactivation increments authzVersion preventing reuse of old suspended tokens', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'User To Reactivate',
      email: `reactivate_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: false,
      shopId: shop1.id,
      authzVersion: 2
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'suspended'
    });

    // Token minted during or before suspension
    const oldSuspendedToken = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 2
    });

    // Reactivate user
    const resReactivate = await request(app)
      .put(`/api/users/${user.id}/role`)
      .set('Authorization', getOwnerToken())
      .send({ active: true });
    expect(resReactivate.status).toBe(200);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.active).toBe(true);
    expect(refreshedUser.authzVersion).toBe(3);

    // Old token with v2 must be rejected with 401 AUTHZ_VERSION_STALE
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', oldSuspendedToken);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');

    // Fresh token with v3 succeeds
    const freshToken = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 3
    });
    const resFresh = await request(app)
      .get('/test/protected')
      .set('Authorization', freshToken);
    expect(resFresh.status).toBe(200);
  });

  // 7. ShopAccess grant
  it('Scenario 7: ShopAccess grant increments target actor authzVersion and invalidates old session', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Target Grant User',
      email: `grant_sa_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });
    const membership = await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'active'
    });

    const userTokenV1 = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Grant access to shop2
    const resGrant = await request(app)
      .post(`/api/shops/${shop2.id}/access`)
      .set('Authorization', getOwnerToken())
      .send({ membershipId: membership.id });
    expect(resGrant.status).toBe(201);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.authzVersion).toBe(2);

    // Old token rejected
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', userTokenV1);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // 8. ShopAccess revoke
  it('Scenario 8: ShopAccess revoke increments target actor authzVersion and invalidates old session', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Target Revoke User',
      email: `revoke_sa_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });
    const membership = await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: membership.id,
      shopId: shop2.id,
      isDefault: false
    });

    const userTokenV1 = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 1
    });

    // Revoke access to shop2
    const resRevoke = await request(app)
      .delete(`/api/shops/${shop2.id}/access/${membership.id}`)
      .set('Authorization', getOwnerToken());
    expect(resRevoke.status).toBe(200);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.authzVersion).toBe(2);

    // Old token rejected
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', userTokenV1);
    expect(resPost.status).toBe(401);
    expect(resPost.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // 9. Unrelated profile update
  it('Scenario 9: unrelated profile update does NOT increment authzVersion and session remains valid', async () => {
    const uid = Date.now();
    const employee = await Employee.create({
      firstName: 'Alice',
      lastName: 'Profile',
      email: `profile_${uid}@example.com`,
      password: 'Password123!',
      position: 'cashier',
      status: 'active',
      salary: 30000,
      shopId: shop1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      employeeId: employee.id,
      orgRole: 'member',
      status: 'active'
    });

    const tokenV1 = tokenFor({
      id: employee.id,
      role: 'cashier',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: true,
      authzVersion: 1
    });

    // Update non-authorization fields: firstName and salary
    const updateRes = await request(app)
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', getOwnerToken())
      .send({ firstName: 'Alicia', salary: 35000 });
    expect(updateRes.status).toBe(200);

    const refreshedEmp = await Employee.findByPk(employee.id);
    expect(refreshedEmp.firstName).toBe('Alicia');
    expect(refreshedEmp.authzVersion).toBe(1); // Epoch unchanged!

    // Session v1 remains valid and accepted
    const resPost = await request(app)
      .get('/test/protected')
      .set('Authorization', tokenV1);
    expect(resPost.status).toBe(200);
    expect(resPost.body.authzVersion).toBe(1);
  });

  // 10. Transaction rollback
  it('Scenario 10: transaction rollback preserves original authzVersion without cache contamination', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Rollback User',
      email: `rollback_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });

    // Set cached version to 1
    await tokenRevocationService.setAuthzVersion(user.id, false, 1);

    // Simulate failed transaction that attempts increment
    try {
      await sequelize.transaction(async (t) => {
        await tokenRevocationService.incrementAuthzVersion(user.id, false, t);
        throw new Error('Simulated database write error inducing transaction rollback');
      });
    } catch (e) {
      expect(e.message).toContain('Simulated database write error');
    }

    // Verify DB version was rolled back to 1
    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.authzVersion).toBe(1);

    // Verify cache was NOT updated to 2
    const cachedVersion = await tokenRevocationService.getAuthzVersion(user.id, false);
    expect(cachedVersion).toBe(1);
  });

  // 11. Redis failure tolerance
  it('Scenario 11: database transaction commits safely and fallback works even if Redis fails', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Redis Fallback User',
      email: `redis_fail_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });

    // Mock redis client to throw during setex
    const origSetex = redisClient.setex;
    redisClient.setex = jest.fn().mockRejectedValue(new Error('Redis connection refused: mock failure'));

    try {
      // Increment must succeed at DB layer without throwing
      const updated = await tokenRevocationService.incrementAuthzVersion(user.id, false);
      expect(updated).toBe(2);

      const refreshedUser = await User.findByPk(user.id);
      expect(refreshedUser.authzVersion).toBe(2);

      // Subsequent getAuthzVersion falls back to DB
      const version = await tokenRevocationService.getAuthzVersion(user.id, false);
      expect(version).toBe(2);
    } finally {
      redisClient.setex = origSetex;
    }
  });

  // 12. Stale Redis cache (DB authoritative)
  it('Scenario 12: stale Redis cache cannot bypass newer database authzVersion', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Stale Redis User',
      email: `stale_redis_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 7 // DB is at 7
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: user.id,
      orgRole: 'member',
      status: 'active'
    });

    // Force Redis cache to stale version 6
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.setex(`authz_version:user:${user.id}`, 300, '6');
    }

    // Client presents token matching stale Redis cache (version 6)
    const staleToken = tokenFor({
      id: user.id,
      role: 'manager',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: false,
      authzVersion: 6
    });

    // Request MUST fail with 401 AUTHZ_VERSION_STALE because DB authority (7) wins
    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', staleToken);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');

    // Verify cache has been healed to 7
    const healedVersion = await tokenRevocationService.getAuthzVersion(user.id, false);
    expect(healedVersion).toBe(7);
  });

  // 13. Concurrent version increments
  it('Scenario 13: concurrent increments execute atomically without lost updates', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Concurrent User',
      email: `concurrent_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });

    // Two concurrent version increments
    await Promise.all([
      tokenRevocationService.incrementAuthzVersion(user.id, false),
      tokenRevocationService.incrementAuthzVersion(user.id, false)
    ]);

    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.authzVersion).toBe(3); // Exactly baseline + 2
  });

  // 14. Token revocation independence
  it('Scenario 14: password change revocation cutoff is independent of authzVersion', async () => {
    const uid = Date.now();
    const user = await User.create({
      name: 'Independence User',
      email: `indep_${uid}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shop1.id,
      authzVersion: 1
    });

    // Revoking user tokens via cutoff timestamp
    const nowSec = Math.floor(Date.now() / 1000);
    await tokenRevocationService.revokeAllUserTokens(user.id, false, nowSec);

    // authzVersion must remain 1
    const refreshedUser = await User.findByPk(user.id);
    expect(refreshedUser.authzVersion).toBe(1);

    const isCutoffRevoked = await tokenRevocationService.isUserTokenRevoked(user.id, false, nowSec - 10);
    expect(isCutoffRevoked).toBe(true);
  });

  // 15. Newly created employee
  it('Scenario 15: newly created employee initializes authzVersion to 1 with independent epoch', async () => {
    const uid = Date.now();
    const { employee } = await staffCreationService.createStaffMember({
      actor: {
        id: ownerUser.id,
        role: 'admin',
        organizationId: org.id,
        shopId: shop1.id,
        isEmployee: false
      },
      body: {
        firstName: 'New',
        lastName: 'Staff',
        email: `new_staff_${uid}@example.com`,
        password: 'Password123!',
        position: 'cashier',
        shopId: shop1.id
      },
      reqOrgId: org.id
    });

    expect(employee.authzVersion).toBe(1);

    // Incrementing employee epoch does not affect owner
    await tokenRevocationService.incrementAuthzVersion(employee.id, true);
    const empRefreshed = await Employee.findByPk(employee.id);
    const ownerRefreshed = await User.findByPk(ownerUser.id);

    expect(empRefreshed.authzVersion).toBe(2);
    expect(ownerRefreshed.authzVersion).toBe(1);
  });

  // 16. Platform boundary
  it('Scenario 16: updating organization role or position cannot grant or imply super_admin', async () => {
    const uid = Date.now();
    const employee = await Employee.create({
      firstName: 'Attempted',
      lastName: 'Escalation',
      email: `escalate_${uid}@example.com`,
      password: 'Password123!',
      position: 'cashier',
      status: 'active',
      salary: 30000,
      shopId: shop1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      employeeId: employee.id,
      orgRole: 'member',
      status: 'active'
    });

    // Attempt to update position to 'admin'
    await request(app)
      .put(`/api/employees/${employee.id}`)
      .set('Authorization', getOwnerToken())
      .send({ position: 'admin' });

    const token = tokenFor({
      id: employee.id,
      role: 'admin',
      shopId: shop1.id,
      organizationId: org.id,
      isEmployee: true,
      authzVersion: 2
    });

    const res = await request(app)
      .get('/test/protected')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    // Effective role can be org_admin or admin, but NEVER super_admin
    expect(res.body.role).not.toBe('super_admin');
  });
});
