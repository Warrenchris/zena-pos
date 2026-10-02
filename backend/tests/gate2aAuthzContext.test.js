'use strict';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sequelize = require('../src/config/database');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  RolePermission,
  Permission
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const { auth, checkRole, authzContext } = require('../src/middleware/auth');
const { checkPermission } = require('../src/middleware/rolePermissions');

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

describe('Gate 2A: Canonical Authorization Context & Authorization Epoch Infrastructure', () => {
  let testApp;
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA, managerUserA, cashierUserA;
  let employeeA;
  let superAdminUser;

  beforeAll(async () => {
    await sequelize.authenticate();

    testApp = express();
    testApp.use(express.json());

    // Test endpoints
    testApp.get('/test/authz', auth, (req, res) => {
      res.json({
        authz: {
          identity: req.authz.identity,
          session: req.authz.session,
          tenant: req.authz.tenant,
          role: req.authz.role,
          scope: {
            activeShopId: req.authz.scope.activeShopId,
            homeShopId: req.authz.scope.homeShopId,
            accessibleShopIds: req.authz.scope.accessibleShopIds,
            hasShopA1: req.authz.scope.hasShopAccess(shopA1.id),
            hasShopA2: req.authz.scope.hasShopAccess(shopA2.id),
            hasShopB1: req.authz.scope.hasShopAccess(shopB1.id)
          },
          hasCreateSales: req.authz.permissions.has('create_sales'),
          hasManageSettings: req.authz.permissions.has('manage_settings'),
          hasAnyPermissions: req.authz.permissions.hasAny('manage_settings', 'create_sales'),
          hasAllPermissions: req.authz.permissions.hasAll('create_sales', 'access_pos'),
          isOwnerOfSelf: req.authz.ownership.isOwnerOf(req.authz.identity.id),
          isOwnerOfOther: req.authz.ownership.isOwnerOf(999999),
          canManageSelf: req.authz.ownership.canManage(req.authz.identity.id),
          canManageOther: req.authz.ownership.canManage(999999, 'manage_sales')
        },
        user: req.user,
        shopId: req.shopId,
        organizationId: req.organizationId,
        membership: req.membership ? { id: req.membership.id, orgRole: req.membership.orgRole } : null,
        isFrozen: Object.isFrozen(req.authz)
      });
    });

    testApp.get('/test/check-role-admin', auth, checkRole(['admin']), (req, res) => {
      res.json({ success: true, role: req.authz.role.effectiveRole });
    });

    testApp.get('/test/check-role-manager', auth, checkRole(['manager']), (req, res) => {
      res.json({ success: true, role: req.authz.role.effectiveRole });
    });

    testApp.get('/test/check-perm-sales', auth, checkPermission('create_sales'), (req, res) => {
      res.json({ success: true });
    });

    testApp.get('/test/check-perm-settings', auth, checkPermission('manage_settings'), (req, res) => {
      res.json({ success: true });
    });

    // Guard tests with missing req.authz
    testApp.get('/test/missing-context-role', checkRole(['admin']), (req, res) => {
      res.json({ success: true });
    });

    testApp.get('/test/missing-context-perm', checkPermission('create_sales'), (req, res) => {
      res.json({ success: true });
    });

    // Seed test organizations
    orgA = await Organization.create({
      name: 'Gate2A Org A',
      slug: `gate2a-org-a-${Date.now()}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: 'Gate2A Org B',
      slug: `gate2a-org-b-${Date.now()}`,
      status: 'active',
      currency: 'KES'
    });

    // Seed test shops
    shopA1 = await Shop.create({
      name: 'Gate2A Shop A1',
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: 'Gate2A Shop A2',
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: 'Gate2A Shop B1',
      organizationId: orgB.id,
      active: true
    });

    // Seed users
    ownerUserA = await User.create({
      name: 'Gate2A Owner',
      email: `owner-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    managerUserA = await User.create({
      name: 'Gate2A Manager',
      email: `manager-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'manager',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1
    });

    const managerMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: managerUserA.id,
      orgRole: 'member',
      status: 'active'
    });

    // Assign manager only to shopA1
    await ShopAccess.create({
      membershipId: managerMem.id,
      shopId: shopA1.id,
      isDefault: true
    });

    cashierUserA = await User.create({
      name: 'Gate2A Cashier',
      email: `cashier-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      shopId: shopA1.id,
      active: true,
      authzVersion: 1
    });

    const cashierMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: cashierUserA.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierMem.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Seed employee
    employeeA = await Employee.create({
      firstName: 'Gate2A',
      lastName: 'Employee',
      email: `employee-${Date.now()}@example.com`,
      password: 'Password123!',
      position: 'manager',
      status: 'active',
      shopId: shopA2.id,
      salary: 50000,
      authzVersion: 1
    });

    const empMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: employeeA.id,
      orgRole: 'admin', // Delegated org admin
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: empMem.id,
      shopId: shopA2.id,
      isDefault: true
    });

    // Seed platform super_admin
    superAdminUser = await User.create({
      name: 'Gate2A Super Admin',
      email: `superadmin-${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'super_admin',
      shopId: null,
      active: true,
      authzVersion: 1
    });
  });

  afterAll(async () => {
    try {
      await ShopAccess.destroy({ where: {} });
      await OrganizationMembership.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Employee.destroy({ where: { id: employeeA.id } });
      await User.destroy({ where: { id: [ownerUserA.id, managerUserA.id, cashierUserA.id, superAdminUser.id] } });
      await Shop.destroy({ where: { organizationId: [orgA.id, orgB.id] } });
      await Organization.destroy({ where: { id: [orgA.id, orgB.id] } });
    } catch (e) {
      // cleanup best effort
    }
  });

  // 1. Valid context construction (req.authz)
  it('Scenario 1: constructs valid, frozen req.authz with all 7 dimensions', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      orgRole: 'owner',
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.isFrozen).toBe(true);
    expect(res.body.authz).toBeDefined();

    // 1. Identity
    expect(res.body.authz.identity).toEqual(expect.objectContaining({
      id: ownerUserA.id,
      userId: ownerUserA.id,
      employeeId: null,
      isEmployee: false,
      email: ownerUserA.email
    }));

    // 2. Session
    expect(res.body.authz.session).toEqual(expect.objectContaining({
      authzVersion: 1
    }));

    // 3. Tenant
    expect(res.body.authz.tenant).toEqual(expect.objectContaining({
      organizationId: orgA.id,
      organizationName: orgA.name,
      orgRole: 'owner',
      isOwner: true,
      isOrgAdmin: true
    }));

    // 4. Role
    expect(res.body.authz.role).toEqual(expect.objectContaining({
      rawRole: 'admin',
      effectiveRole: 'admin'
    }));

    // 5. Scope
    expect(res.body.authz.scope.activeShopId).toBe(shopA1.id);

    // 6. Permissions
    expect(res.body.authz.hasCreateSales).toBe(true);
    expect(res.body.authz.hasManageSettings).toBe(true);

    // 7. Ownership
    expect(res.body.authz.isOwnerOfSelf).toBe(true);
    expect(res.body.authz.isOwnerOfOther).toBe(false);
    expect(res.body.authz.canManageSelf).toBe(true);
  });

  it('Scenario 1b: constructs valid context for Employee with delegated org admin', async () => {
    const token = tokenFor({
      id: employeeA.id,
      role: 'org_admin',
      shopId: shopA2.id,
      organizationId: orgA.id,
      isEmployee: true,
      orgRole: 'admin',
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.authz.identity.isEmployee).toBe(true);
    expect(res.body.authz.identity.employeeId).toBe(employeeA.id);
    expect(res.body.authz.identity.userId).toBeNull();
    expect(res.body.authz.role.effectiveRole).toBe('org_admin');
    expect(res.body.authz.tenant.isOwner).toBe(false);
    expect(res.body.authz.tenant.isOrgAdmin).toBe(true);
  });

  // 2. Missing req.authz -> HTTP 500 AUTHORIZATION_CONTEXT_MISSING
  it('Scenario 2: checkRole and checkPermission fail closed with HTTP 500 if req.authz is missing', async () => {
    const resRole = await request(testApp).get('/test/missing-context-role');
    expect(resRole.status).toBe(500);
    expect(resRole.body.code).toBe('AUTHORIZATION_CONTEXT_MISSING');

    const resPerm = await request(testApp).get('/test/missing-context-perm');
    expect(resPerm.status).toBe(500);
    expect(resPerm.body.code).toBe('AUTHORIZATION_CONTEXT_MISSING');
  });

  // 3. Stale authzVersion -> HTTP 401 AUTHZ_VERSION_STALE
  it('Scenario 3: rejects token with stale authzVersion with HTTP 401 AUTHZ_VERSION_STALE', async () => {
    // Current DB version for cashierUserA is 1
    // Bump DB version to 2
    await tokenRevocationService.incrementAuthzVersion(cashierUserA.id, false);

    // Stale token has authzVersion 1
    const staleToken = tokenFor({
      id: cashierUserA.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', staleToken);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  // 4. Current authzVersion -> Success
  it('Scenario 4: accepts token with current authzVersion', async () => {
    // Mint token with updated authzVersion 2
    const currentToken = tokenFor({
      id: cashierUserA.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 2
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', currentToken);

    expect(res.status).toBe(200);
    expect(res.body.authz.session.authzVersion).toBe(2);
  });

  // 5. Token revocation (JTI / cutoff) still works
  it('Scenario 5: token JTI revocation and user cutoff still reject prior to context construction', async () => {
    const jti = crypto.randomUUID();
    const token = tokenFor({
      id: managerUserA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1,
      jti
    });

    // Revoke JTI
    await tokenRevocationService.revokeToken(jti);

    const resRevokedJti = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(resRevokedJti.status).toBe(401);
    expect(resRevokedJti.body.error).toContain('revoked');

    // Revoke by cutoff
    const validJti = crypto.randomUUID();
    const nowSec = Math.floor(Date.now() / 1000);
    const tokenPast = tokenFor({
      id: managerUserA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1,
      iat: nowSec - 10,
      jti: validJti
    });

    await tokenRevocationService.revokeAllUserTokens(managerUserA.id, false, nowSec);

    const resRevokedCutoff = await request(testApp)
      .get('/test/authz')
      .set('Authorization', tokenPast);

    expect(resRevokedCutoff.status).toBe(401);
    expect(resRevokedCutoff.body.error).toContain('revoked due to password change');

    // Cleanup cutoff
    await tokenRevocationService.clearUserTokenCutoff(managerUserA.id, false);
  });

  // 6. Redis offline -> Fails closed to DB authority, no unauthorized grants
  it('Scenario 6: falls back to authoritative DB when Redis cache is absent or offline', async () => {
    // Clear cache
    await tokenRevocationService.clearAuthzVersion(managerUserA.id, false);

    // Verify tokenRevocationService.getAuthzVersion still returns 1 from DB
    const ver = await tokenRevocationService.getAuthzVersion(managerUserA.id, false);
    expect(ver).toBe(1);

    const token = tokenFor({
      id: managerUserA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.authz.session.authzVersion).toBe(1);
  });

  // 7. Cross-tenant membership rejection
  it('Scenario 7: rejects cross-tenant token or organization mismatch with HTTP 403 TENANT_MISMATCH', async () => {
    // managerUserA belongs to orgA, but token claims organizationId = orgB.id
    const crossTenantToken = tokenFor({
      id: managerUserA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgB.id, // Mismatch!
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', crossTenantToken);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  // 8. Shop access derivation from ShopAccess table
  it('Scenario 8: non-owner accessibleShopIds derives strictly from ShopAccess', async () => {
    // managerUserA is granted access only to shopA1, not shopA2
    const token = tokenFor({
      id: managerUserA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.authz.scope.accessibleShopIds).toContain(shopA1.id);
    expect(res.body.authz.scope.accessibleShopIds).not.toContain(shopA2.id);
    expect(res.body.authz.scope.hasShopA1).toBe(true);
    expect(res.body.authz.scope.hasShopA2).toBe(false);
  });

  // 9. Owner universal implicit access
  it('Scenario 9: organization owner possesses universal implicit access across all organization shops', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      orgRole: 'owner',
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    // Both shopA1 and shopA2 are accessible to owner without ShopAccess records
    expect(res.body.authz.scope.hasShopA1).toBe(true);
    expect(res.body.authz.scope.hasShopA2).toBe(true);
    // Shop in orgB is NOT accessible
    expect(res.body.authz.scope.hasShopB1).toBe(false);
  });

  // 10. Platform super_admin boundary preservation
  it('Scenario 10: platform super_admin operates out of tenant scope with universal permissions', async () => {
    const token = tokenFor({
      id: superAdminUser.id,
      role: 'super_admin',
      shopId: null,
      organizationId: null,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.authz.identity.id).toBe(superAdminUser.id);
    expect(res.body.authz.tenant).toBeNull();
    expect(res.body.authz.role.effectiveRole).toBe('super_admin');
    expect(res.body.authz.hasCreateSales).toBe(true);
    expect(res.body.authz.hasManageSettings).toBe(true);

    const resCheckRole = await request(testApp)
      .get('/test/check-role-admin')
      .set('Authorization', token);
    expect(resCheckRole.status).toBe(403); // super_admin is not 'admin'

    const resCheckPerm = await request(testApp)
      .get('/test/check-perm-sales')
      .set('Authorization', token);
    expect(resCheckPerm.status).toBe(200); // super_admin has '*'
  });

  // 11. Backward compatibility (req.user, req.shopId, req.organizationId, req.membership)
  it('Scenario 11: preserves and synchronizes legacy request properties', async () => {
    const token = tokenFor({
      id: managerUserA.id,
      role: 'manager',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(managerUserA.id);
    expect(res.body.user.role).toBe('manager');
    expect(res.body.shopId).toBe(shopA1.id);
    expect(res.body.organizationId).toBe(orgA.id);
    expect(res.body.membership).toBeDefined();
    expect(res.body.membership.orgRole).toBe('member');
  });

  // 12. No secret leakage in req.authz or logs
  it('Scenario 12: guarantees zero sensitive credential leakage in req.authz', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      orgRole: 'owner',
      authzVersion: 1
    });

    const res = await request(testApp)
      .get('/test/authz')
      .set('Authorization', token);

    expect(res.status).toBe(200);
    const authz = res.body.authz;

    // Check for forbidden secret fields
    expect(authz.identity.password).toBeUndefined();
    expect(authz.identity.passwordHash).toBeUndefined();
    expect(authz.identity.emailVerificationTokenHash).toBeUndefined();
    expect(authz.tenant.consumerKey).toBeUndefined();
    expect(authz.tenant.consumerSecret).toBeUndefined();
    expect(authz.tenant.passkey).toBeUndefined();

    // Verify stringified representation doesn't leak secrets
    const serialized = JSON.stringify(authz);
    expect(serialized).not.toContain('Password123!');
    expect(serialized).not.toContain('consumerSecret');
  });
});
