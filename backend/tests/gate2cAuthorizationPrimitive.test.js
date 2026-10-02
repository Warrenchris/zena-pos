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
const { auth, authzContext, checkRole, authorize } = require('../src/middleware/auth');
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

describe('Gate 2C: Central Authorization Primitive & Adversarial Security Verification', () => {
  let app;
  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let ownerUserA;
  let managerUserA;
  let cashierUserA1, cashierUserA2;
  let orgAdminEmployeeA;
  let superAdminUser;

  // Mock in-memory held cart resources for ownership tests
  const mockHeldCarts = new Map();

  beforeAll(async () => {
    await sequelize.authenticate();

    app = express();
    app.use(express.json());

    // --- Test Routes Configured with authorize() ---

    // 1. Direct authorize without auth (Missing context test)
    app.get('/test/missing-context', authorize({ permission: 'view_sales' }), (req, res) => {
      res.json({ success: true });
    });

    // 2. Permission based endpoints
    app.get('/test/perm-create-sales', auth, authorize({ permission: 'create_sales' }), (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/perm-process-refunds', auth, authorize({ permission: 'process_refunds' }), (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/perm-unknown', auth, authorize({ permission: 'completely_unknown_perm' }), (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/perm-any', auth, authorize({ permissions: { any: ['process_refunds', 'create_sales'] } }), (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/perm-all', auth, authorize({ permissions: { all: ['access_pos', 'create_sales'] } }), (req, res) => {
      res.json({ success: true });
    });

    // 3. Role based endpoints
    app.get('/test/role-manager', auth, authorize({ roles: ['manager', 'admin'] }), (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/role-org-admin', auth, authorize({ roles: ['org_admin', 'manager'] }), (req, res) => {
      res.json({ success: true });
    });

    // 4. Governance role endpoints
    app.get('/test/require-owner', auth, authorize({ requireOrgOwner: true }), (req, res) => {
      res.json({ success: true });
    });

    app.get('/test/require-org-admin', auth, authorize({ requireOrgAdmin: true }), (req, res) => {
      res.json({ success: true });
    });

    // 5. Tenant injection & mismatch test endpoint
    app.post('/test/tenant-isolation/:organizationId', auth, authorize({ permission: 'create_sales' }), (req, res) => {
      res.json({ success: true, orgId: req.authz.tenant.organizationId });
    });

    // 6. Shop scope endpoints
    app.get('/test/shop-scope-current', auth, authorize({ shopScope: 'current' }), (req, res) => {
      res.json({ success: true, shopId: req.authz.scope.activeShopId });
    });

    app.get('/test/shop-scope/:shopId', auth, authorize({ shopScope: 'param' }), (req, res) => {
      res.json({ success: true, targetShopId: req.params.shopId });
    });

    app.get('/test/shop-scope-anti-oracle/:shopId', auth, authorize({ shopScope: 'param', antiOracle: true }), (req, res) => {
      res.json({ success: true, targetShopId: req.params.shopId });
    });

    // 7. Ownership & Resource scope endpoints
    app.get('/test/carts/:id', auth, authorize({
      ownership: {
        getResource: (req) => mockHeldCarts.get(req.params.id) || null,
        ownerPermission: 'view_own_sales',
        managerPermission: 'manage_sales',
        antiOracle: true
      }
    }), (req, res) => {
      res.json({ success: true, cart: mockHeldCarts.get(req.params.id) });
    });

    // Ownership test with custom throwing evaluator
    app.get('/test/ownership-error/:id', auth, authorize({
      ownership: () => {
        throw new Error('Database cluster failed during ownership check');
      }
    }), (req, res) => {
      res.json({ success: true });
    });

    // 8. Platform super-admin endpoint
    app.get('/test/platform-only', auth, authorize({ platformOnly: true }), (req, res) => {
      res.json({ success: true, platform: true });
    });

    // 9. Legacy checkRole compatibility
    app.get('/test/legacy-check-role', auth, checkRole(['manager', 'admin']), (req, res) => {
      res.json({ success: true, legacyRole: req.user.role });
    });

    app.get('/test/legacy-check-role-missing-context', checkRole(['admin']), (req, res) => {
      res.json({ success: true });
    });

    // --- Seed Organizations, Shops, Users ---
    const suffix = Date.now();

    orgA = await Organization.create({
      name: `Primitive Org A ${suffix}`,
      slug: `prim-org-a-${suffix}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Primitive Org B ${suffix}`,
      slug: `prim-org-b-${suffix}`,
      status: 'active',
      currency: 'KES'
    });

    shopA1 = await Shop.create({
      name: `Shop A1 ${suffix}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 ${suffix}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 ${suffix}`,
      organizationId: orgB.id,
      active: true
    });

    // Owner of Org A
    ownerUserA = await User.create({
      name: 'Owner User A',
      email: `owner_a_${suffix}@example.com`,
      password: 'Password123!',
      role: 'admin',
      active: true,
      shopId: shopA1.id,
      authzVersion: 1
    });
    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Manager in Org A (Shop A1)
    managerUserA = await User.create({
      name: 'Manager User A',
      email: `manager_a_${suffix}@example.com`,
      password: 'Password123!',
      role: 'manager',
      active: true,
      shopId: shopA1.id,
      authzVersion: 1
    });
    const managerMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: managerUserA.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: managerMem.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Cashier 1 in Org A (Shop A1)
    cashierUserA1 = await User.create({
      name: 'Cashier 1 Org A',
      email: `cashier1_a_${suffix}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      active: true,
      shopId: shopA1.id,
      authzVersion: 1
    });
    const cashier1Mem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: cashierUserA1.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: cashier1Mem.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Cashier 2 in Org A (Shop A1)
    cashierUserA2 = await User.create({
      name: 'Cashier 2 Org A',
      email: `cashier2_a_${suffix}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      active: true,
      shopId: shopA1.id,
      authzVersion: 1
    });
    const cashier2Mem = await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: cashierUserA2.id,
      orgRole: 'member',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: cashier2Mem.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Delegated Org Admin in Org A (Employee with position: admin, orgRole: admin)
    orgAdminEmployeeA = await Employee.create({
      firstName: 'Delegated',
      lastName: 'OrgAdmin',
      email: `orgadmin_a_${suffix}@example.com`,
      password: 'Password123!',
      position: 'admin',
      status: 'active',
      salary: 50000,
      shopId: shopA1.id,
      authzVersion: 1
    });
    const orgAdminMem = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: orgAdminEmployeeA.id,
      orgRole: 'admin',
      status: 'active'
    });
    await ShopAccess.create({
      membershipId: orgAdminMem.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Platform Super Admin
    superAdminUser = await User.create({
      name: 'Platform Super Admin',
      email: `superadmin_${suffix}@example.com`,
      password: 'Password123!',
      role: 'super_admin',
      active: true,
      authzVersion: 1
    });

    // Seed mock held carts
    mockHeldCarts.set('cart-cashier-1', {
      id: 'cart-cashier-1',
      shopId: shopA1.id,
      organizationId: orgA.id,
      cashierId: cashierUserA1.id,
      total: 1500
    });
    mockHeldCarts.set('cart-cashier-2', {
      id: 'cart-cashier-2',
      shopId: shopA1.id,
      organizationId: orgA.id,
      cashierId: cashierUserA2.id,
      total: 2500
    });
    mockHeldCarts.set('cart-org-b', {
      id: 'cart-org-b',
      shopId: shopB1.id,
      organizationId: orgB.id,
      cashierId: 999999,
      total: 5000
    });
  });

  // Tokens
  const tokenOwner = () => tokenFor({
    id: ownerUserA.id,
    role: 'admin',
    shopId: shopA1.id,
    organizationId: orgA.id,
    isEmployee: false,
    orgRole: 'owner',
    authzVersion: 1
  });

  const tokenManager = () => tokenFor({
    id: managerUserA.id,
    role: 'manager',
    shopId: shopA1.id,
    organizationId: orgA.id,
    isEmployee: false,
    authzVersion: 1
  });

  const tokenCashier1 = () => tokenFor({
    id: cashierUserA1.id,
    role: 'cashier',
    shopId: shopA1.id,
    organizationId: orgA.id,
    isEmployee: false,
    authzVersion: 1
  });

  const tokenCashier2 = () => tokenFor({
    id: cashierUserA2.id,
    role: 'cashier',
    shopId: shopA1.id,
    organizationId: orgA.id,
    isEmployee: false,
    authzVersion: 1
  });

  const tokenOrgAdmin = () => tokenFor({
    id: orgAdminEmployeeA.id,
    role: 'org_admin',
    shopId: shopA1.id,
    organizationId: orgA.id,
    isEmployee: true,
    orgRole: 'admin',
    authzVersion: 1
  });

  const tokenSuperAdmin = () => tokenFor({
    id: superAdminUser.id,
    role: 'super_admin',
    isEmployee: false,
    authzVersion: 1
  });

  // ==========================================
  // 1. Context Integrity
  // ==========================================
  it('Scenario 1: Missing req.authz fails closed with HTTP 500 AUTHORIZATION_CONTEXT_MISSING', async () => {
    const res = await request(app).get('/test/missing-context');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUTHORIZATION_CONTEXT_MISSING');
  });

  it('Scenario 2: req.authz cannot be replaced or bypassed by mutating req.user.role', async () => {
    // Middleware modifying req.user.role before authorize()
    const tamperingApp = express();
    tamperingApp.use(express.json());
    tamperingApp.get('/test/tamper',
      auth,
      (req, res, next) => {
        // Attacker attempts to mutate req.user.role to admin
        req.user.role = 'admin';
        next();
      },
      authorize({ roles: ['admin'] }),
      (req, res) => res.json({ success: true })
    );

    const res = await request(tamperingApp)
      .get('/test/tamper')
      .set('Authorization', tokenCashier1());

    // Fails closed with 403 because req.authz.role.effectiveRole is cashier and frozen
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  it('Scenario 3: Stale authzVersion is rejected at pipeline boundary with HTTP 401 AUTHZ_VERSION_STALE', async () => {
    const staleToken = tokenFor({
      id: cashierUserA1.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 0 // Stale version
    });

    const res = await request(app)
      .get('/test/perm-create-sales')
      .set('Authorization', staleToken);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  it('Scenario 4: Revoked session JTI is rejected at pipeline boundary with HTTP 401', async () => {
    const revokedJti = crypto.randomUUID();
    await tokenRevocationService.revokeToken(revokedJti);

    const revokedToken = tokenFor({
      jti: revokedJti,
      id: cashierUserA1.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 1
    });

    const res = await request(app)
      .get('/test/perm-create-sales')
      .set('Authorization', revokedToken);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Token has been revoked');
  });

  // ==========================================
  // 2. Tenant Isolation
  // ==========================================
  it('Scenario 5: User in Organization A cannot access Organization B resource', async () => {
    const res = await request(app)
      .get('/test/carts/cart-org-b')
      .set('Authorization', tokenManager());

    // Organization B cart is out of tenant scope, returns 404 (anti-oracle)
    expect(res.status).toBe(404);
  });

  it('Scenario 6: Forged organizationId in request params cannot override canonical tenant context', async () => {
    // Attacker from Org A attempts to supply Org B ID in route params
    const res = await request(app)
      .post(`/test/tenant-isolation/${orgB.id}`)
      .set('Authorization', tokenManager())
      .send({ organizationId: orgB.id });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('Scenario 7: Forged shopId cannot override canonical branch scope', async () => {
    // Cashier in Shop A1 attempts to access Shop B1
    const res = await request(app)
      .get(`/test/shop-scope/${shopB1.id}`)
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
  });

  // ==========================================
  // 3. Shop Scope
  // ==========================================
  it('Scenario 8: Authorized Shop A1 access succeeds', async () => {
    const res = await request(app)
      .get(`/test/shop-scope/${shopA1.id}`)
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Scenario 9: Unauthorized Shop A2 access fails with HTTP 403 SHOP_ACCESS_DENIED', async () => {
    // Cashier 1 only has ShopAccess to Shop A1, not Shop A2
    const res = await request(app)
      .get(`/test/shop-scope/${shopA2.id}`)
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
  });

  it('Scenario 10: Organization owner receives organization-wide branch scope without explicit ShopAccess rows', async () => {
    // Owner can access both Shop A1 and Shop A2
    const resA1 = await request(app)
      .get(`/test/shop-scope/${shopA1.id}`)
      .set('Authorization', tokenOwner());
    expect(resA1.status).toBe(200);

    const resA2 = await request(app)
      .get(`/test/shop-scope/${shopA2.id}`)
      .set('Authorization', tokenOwner());
    expect(resA2.status).toBe(200);
  });

  it('Scenario 11: Ordinary member without ShopAccess is denied branch access', async () => {
    const res = await request(app)
      .get(`/test/shop-scope/${shopA2.id}`)
      .set('Authorization', tokenManager());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
  });

  // ==========================================
  // 4. Permissions
  // ==========================================
  it('Scenario 12: Required permission allows access (permission: create_sales)', async () => {
    const res = await request(app)
      .get('/test/perm-create-sales')
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Scenario 13: Missing permission returns HTTP 403 PERMISSION_DENIED', async () => {
    // Cashier does not have process_refunds
    const res = await request(app)
      .get('/test/perm-process-refunds')
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('Scenario 14: Unknown permission fails closed with HTTP 403', async () => {
    const res = await request(app)
      .get('/test/perm-unknown')
      .set('Authorization', tokenManager());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('Scenario 15: Missing or corrupted permissions object fails closed with HTTP 500', async () => {
    const corruptedApp = express();
    corruptedApp.use(express.json());
    corruptedApp.get('/test/corrupted-perms',
      auth,
      (req, res, next) => {
        // Simulating corrupted permissions helper
        req.authz = { ...req.authz, permissions: null };
        next();
      },
      authorize({ permission: 'create_sales' }),
      (req, res) => res.json({ success: true })
    );

    const res = await request(corruptedApp)
      .get('/test/corrupted-perms')
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('PERMISSIONS_CONTEXT_INVALID');
  });

  // ==========================================
  // 5. Roles
  // ==========================================
  it('Scenario 16: Supported role check succeeds (roles: [manager, admin])', async () => {
    const res = await request(app)
      .get('/test/role-manager')
      .set('Authorization', tokenManager());

    expect(res.status).toBe(200);
  });

  it('Scenario 17: Unsupported role fails closed with HTTP 403 INSUFFICIENT_ROLE', async () => {
    const res = await request(app)
      .get('/test/role-manager')
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  it('Scenario 18: org_admin operational compatibility matches manager-equivalent permissions and role check', async () => {
    const resRole = await request(app)
      .get('/test/role-org-admin')
      .set('Authorization', tokenOrgAdmin());
    expect(resRole.status).toBe(200);

    // org_admin has manage_products / process_refunds
    const resPerm = await request(app)
      .get('/test/perm-process-refunds')
      .set('Authorization', tokenOrgAdmin());
    expect(resPerm.status).toBe(200);
  });

  it('Scenario 19: org_admin is not treated as governance owner (requireOrgOwner rejects org_admin)', async () => {
    const res = await request(app)
      .get('/test/require-owner')
      .set('Authorization', tokenOrgAdmin());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORG_OWNER_REQUIRED');
  });

  it('Scenario 20: super_admin remains distinct from tenant operational roles and fails ordinary role check', async () => {
    const res = await request(app)
      .get('/test/role-manager')
      .set('Authorization', tokenSuperAdmin());

    // Platform super_admin is not 'manager' or 'admin'
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  // ==========================================
  // 6. Ownership & Resource Scope
  // ==========================================
  it('Scenario 21: Resource owner can access own resource when permitted', async () => {
    // Cashier 1 viewing their own held cart
    const res = await request(app)
      .get('/test/carts/cart-cashier-1')
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(200);
    expect(res.body.cart.id).toBe('cart-cashier-1');
  });

  it('Scenario 22: Non-owner cannot access ownership-scoped permission without ownership or manager override', async () => {
    // Cashier 2 attempting to view Cashier 1's held cart
    const res = await request(app)
      .get('/test/carts/cart-cashier-1')
      .set('Authorization', tokenCashier2());

    // Anti-oracle returns 404
    expect(res.status).toBe(404);
  });

  it('Scenario 23: Manager branch-wide access succeeds via canManage fallback permission', async () => {
    // Manager viewing Cashier 1's held cart
    const res = await request(app)
      .get('/test/carts/cart-cashier-1')
      .set('Authorization', tokenManager());

    expect(res.status).toBe(200);
    expect(res.body.cart.id).toBe('cart-cashier-1');
  });

  it('Scenario 24: Ownership evaluator failure fails closed with HTTP 403 OWNERSHIP_EVALUATION_FAILED', async () => {
    const res = await request(app)
      .get('/test/ownership-error/cart-cashier-1')
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNERSHIP_EVALUATION_FAILED');
  });

  // ==========================================
  // 7. Anti-Oracle
  // ==========================================
  it('Scenario 25: Out-of-scope resource returns HTTP 404 with antiOracle enabled', async () => {
    const res = await request(app)
      .get(`/test/shop-scope-anti-oracle/${shopA2.id}`)
      .set('Authorization', tokenCashier1());

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('Scenario 26: Caller cannot distinguish cross-tenant resource from nonexistent resource', async () => {
    // Querying completely non-existent cart
    const resNonExistent = await request(app)
      .get('/test/carts/cart-does-not-exist')
      .set('Authorization', tokenCashier1());
    expect(resNonExistent.status).toBe(404);

    // Querying cross-tenant cart (belongs to Org B)
    const resCrossTenant = await request(app)
      .get('/test/carts/cart-org-b')
      .set('Authorization', tokenCashier1());
    expect(resCrossTenant.status).toBe(404);

    // Identical status code and response payload shape
    expect(resNonExistent.body).toEqual(resCrossTenant.body);
  });

  // ==========================================
  // 8. Cache / Epoch
  // ==========================================
  it('Scenario 27: Redis stale version cannot bypass newer database authzVersion', async () => {
    // User with DB version = 9
    const testUser = await User.create({
      name: 'Stale Cache User',
      email: `stale_cache_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'cashier',
      active: true,
      shopId: shopA1.id,
      authzVersion: 9
    });
    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: testUser.id,
      orgRole: 'member',
      status: 'active'
    });

    // Force stale Redis cache to 8
    if (redisClient && redisClient.status === 'ready') {
      await redisClient.setex(`authz_version:user:${testUser.id}`, 300, '8');
    }

    // Token presenting stale version 8
    const staleToken = tokenFor({
      id: testUser.id,
      role: 'cashier',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false,
      authzVersion: 8
    });

    const res = await request(app)
      .get('/test/perm-create-sales')
      .set('Authorization', staleToken);

    // DB wins: rejected 401
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  it('Scenario 28: Redis failure cannot weaken authorization', async () => {
    const origSetex = redisClient.setex;
    redisClient.setex = jest.fn().mockRejectedValue(new Error('Redis connection down'));

    try {
      const res = await request(app)
        .get('/test/perm-create-sales')
        .set('Authorization', tokenCashier1());

      expect(res.status).toBe(200); // Falls back safely to DB
    } finally {
      redisClient.setex = origSetex;
    }
  });

  it('Scenario 29: DB remains authoritative when cache conflicts', async () => {
    const version = await tokenRevocationService.getAuthzVersion(cashierUserA1.id, false);
    expect(version).toBe(1);
  });

  // ==========================================
  // 9. Legacy Compatibility
  // ==========================================
  it('Scenario 30: Existing checkRole() still works as a compatibility adapter', async () => {
    const resAllowed = await request(app)
      .get('/test/legacy-check-role')
      .set('Authorization', tokenManager());
    expect(resAllowed.status).toBe(200);

    const resDenied = await request(app)
      .get('/test/legacy-check-role')
      .set('Authorization', tokenCashier1());
    expect(resDenied.status).toBe(403);
  });

  it('Scenario 31: checkRole() does not bypass canonical authz context', async () => {
    const res = await request(app).get('/test/legacy-check-role-missing-context');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('AUTHORIZATION_CONTEXT_MISSING');
  });

  it('Scenario 32: Existing request compatibility fields remain available', async () => {
    let capturedReq = null;
    const compatApp = express();
    compatApp.use(express.json());
    compatApp.get('/test/compat',
      auth,
      authorize({ permission: 'create_sales' }),
      (req, res) => {
        capturedReq = req;
        res.json({ success: true });
      }
    );

    await request(compatApp)
      .get('/test/compat')
      .set('Authorization', tokenCashier1());

    expect(capturedReq.user).toBeDefined();
    expect(capturedReq.shopId).toBe(shopA1.id);
    expect(capturedReq.organizationId).toBe(orgA.id);
    expect(capturedReq.membership).toBeDefined();
  });

  // ==========================================
  // 10. Platform Boundary
  // ==========================================
  it('Scenario 33: Tenant owner cannot invoke platform-super-admin-only operation', async () => {
    const res = await request(app)
      .get('/test/platform-only')
      .set('Authorization', tokenOwner());

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLATFORM_SUPER_ADMIN_REQUIRED');
  });

  it('Scenario 34: Platform super-admin operates outside tenant scope with universal privileges', async () => {
    const resPlatform = await request(app)
      .get('/test/platform-only')
      .set('Authorization', tokenSuperAdmin());
    expect(resPlatform.status).toBe(200);
    expect(resPlatform.body.platform).toBe(true);

    const resPerm = await request(app)
      .get('/test/perm-create-sales')
      .set('Authorization', tokenSuperAdmin());
    expect(resPerm.status).toBe(200);
  });
});
