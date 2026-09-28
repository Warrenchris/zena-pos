'use strict';

const request = require('supertest');
const app = require('../src/app');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  RolePermission,
  Permission
} = require('../src/models');
const staffCreationService = require('../src/services/staffCreationService');
const permissionCache = require('../src/services/permissionCache');

describe('Tenant-Scoped Role Permission Matrix & Enforcement', () => {
  let orgA;
  let shopA;
  let ownerUserA;
  let ownerTokenA;
  let nonOwnerAdminA;
  let nonOwnerAdminTokenA;
  let managerUserA;
  let managerTokenA;

  let orgB;
  let shopB;
  let ownerUserB;
  let ownerTokenB;
  let managerUserB;
  let managerTokenB;

  beforeAll(async () => {
    const ts = Date.now();

    // Clean cache
    if (permissionCache.clearAllCaches) {
      await permissionCache.clearAllCaches();
    }

    // --- Organization A ---
    orgA = await Organization.create({
      name: `Org A Matrix ${ts}`,
      slug: `org-a-matrix-${ts}`,
      status: 'active'
    });

    shopA = await Shop.create({
      name: `Shop A ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    ownerUserA = await User.create({
      name: 'Owner A',
      email: `owner_a_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    const loginResA = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerUserA.email, password: 'Password123!' });
    ownerTokenA = `Bearer ${loginResA.body.token}`;

    // Non-owner shop admin in Org A
    nonOwnerAdminA = await User.create({
      name: 'NonOwner Admin A',
      email: `nonowner_admin_a_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id,
      active: true
    });
    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: nonOwnerAdminA.id,
      orgRole: 'admin',
      status: 'active'
    });
    const nonOwnerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: nonOwnerAdminA.email, password: 'Password123!' });
    nonOwnerAdminTokenA = `Bearer ${nonOwnerLogin.body.token}`;

    // Manager in Org A
    managerUserA = await User.create({
      name: 'Manager A',
      email: `manager_a_${ts}@test.com`,
      password: 'Password123!',
      role: 'manager',
      shopId: shopA.id,
      active: true
    });
    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: managerUserA.id,
      orgRole: 'member',
      status: 'active'
    });
    const managerLoginA = await request(app)
      .post('/api/auth/login')
      .send({ email: managerUserA.email, password: 'Password123!' });
    managerTokenA = `Bearer ${managerLoginA.body.token}`;

    // --- Organization B ---
    orgB = await Organization.create({
      name: `Org B Matrix ${ts}`,
      slug: `org-b-matrix-${ts}`,
      status: 'active'
    });

    shopB = await Shop.create({
      name: `Shop B ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    ownerUserB = await User.create({
      name: 'Owner B',
      email: `owner_b_${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      orgRole: 'owner',
      status: 'active'
    });

    const loginResB = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerUserB.email, password: 'Password123!' });
    ownerTokenB = `Bearer ${loginResB.body.token}`;

    managerUserB = await User.create({
      name: 'Manager B',
      email: `manager_b_${ts}@test.com`,
      password: 'Password123!',
      role: 'manager',
      shopId: shopB.id,
      active: true
    });
    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: managerUserB.id,
      orgRole: 'member',
      status: 'active'
    });
    const managerLoginB = await request(app)
      .post('/api/auth/login')
      .send({ email: managerUserB.email, password: 'Password123!' });
    managerTokenB = `Bearer ${managerLoginB.body.token}`;
  });

  afterAll(async () => {
    // Teardown test orgs
    if (orgA) {
      await RolePermission.destroy({ where: { organizationId: orgA.id } });
      await OrganizationMembership.destroy({ where: { organizationId: orgA.id } });
      await User.destroy({ where: { shopId: shopA?.id } });
      await Shop.destroy({ where: { id: shopA?.id } });
      await Organization.destroy({ where: { id: orgA.id } });
    }
    if (orgB) {
      await RolePermission.destroy({ where: { organizationId: orgB.id } });
      await OrganizationMembership.destroy({ where: { organizationId: orgB.id } });
      await User.destroy({ where: { shopId: shopB?.id } });
      await Shop.destroy({ where: { id: shopB?.id } });
      await Organization.destroy({ where: { id: orgB.id } });
    }
  });

  describe('Step 5 & Verification 1: Matrix Scoping & Enforced Flags', () => {
    it('GET /api/permissions/matrix lazily seeds RolePermissions for organization and returns enforced flags', async () => {
      const res = await request(app)
        .get('/api/permissions/matrix')
        .set('Authorization', ownerTokenA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.permissions)).toBe(true);

      const enforcedMap = {};
      res.body.permissions.forEach(p => {
        enforcedMap[p.name] = p.enforced;
      });

      // 4 permissions must be enforced: true
      expect(enforcedMap['create_sales']).toBe(true);
      expect(enforcedMap['manage_settings']).toBe(true);
      expect(enforcedMap['view_own_sales']).toBe(true);
      expect(enforcedMap['process_refunds']).toBe(true);

      // Other 10 permissions must be enforced: false
      const nonEnforced = [
        'manage_users', 'manage_products', 'manage_categories', 'view_reports',
        'access_pos', 'manage_sales', 'manage_expenses', 'view_customers',
        'manage_customers', 'manage_employees', 'view_dashboard'
      ];
      nonEnforced.forEach(name => {
        if (enforcedMap[name] !== undefined) {
          expect(enforcedMap[name]).toBe(false);
        }
      });

      // RolePermissions in DB should be scoped to orgA
      const rowsA = await RolePermission.findAll({ where: { organizationId: orgA.id } });
      expect(rowsA.length).toBeGreaterThan(0);
      for (const r of rowsA) {
        expect(r.organizationId).toBe(orgA.id);
      }
    });
  });

  describe('Verification 3: Non-Owner Shop-Admin Rejected on PUT /matrix', () => {
    it('As a non-owner shop-admin: attempt PUT /api/permissions/matrix returns 403 and leaves DB unchanged', async () => {
      const beforeCount = await RolePermission.count({ where: { organizationId: orgA.id } });
      const beforeRows = await RolePermission.findAll({
        where: { organizationId: orgA.id },
        raw: true
      });

      const res = await request(app)
        .put('/api/permissions/matrix')
        .set('Authorization', nonOwnerAdminTokenA)
        .send({
          updates: [
            { role: 'manager', permissionName: 'manage_settings', enabled: false }
          ]
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Permission denied');

      const afterCount = await RolePermission.count({ where: { organizationId: orgA.id } });
      expect(afterCount).toBe(beforeCount);

      const afterRows = await RolePermission.findAll({
        where: { organizationId: orgA.id },
        raw: true
      });
      expect(afterRows).toEqual(beforeRows);
    });
  });

  describe('Verification 2: Org Owner Toggles Enforced Permission & Enforces 403 on Route', () => {
    it('As org owner: toggle manage_settings off for manager -> 200, manager gets 403 on /api/settings', async () => {
      // 1. Org owner updates matrix to disable manage_settings for manager
      const updateRes = await request(app)
        .put('/api/permissions/matrix')
        .set('Authorization', ownerTokenA)
        .send({
          updates: [
            { role: 'manager', permissionName: 'manage_settings', enabled: false }
          ]
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.matrix.manager.manage_settings).toBe(false);

      // Verify DB row was removed for orgA manager manage_settings
      const settingsPerm = await Permission.findOne({ where: { name: 'manage_settings' } });
      const permRow = await RolePermission.findOne({
        where: {
          organizationId: orgA.id,
          role: 'manager',
          permissionId: settingsPerm.id
        }
      });
      expect(permRow).toBeNull();

      // 2. Manager user attempts to update settings via PUT /api/settings (gated by checkPermission('manage_settings', { useCache: true }))
      const settingsRes = await request(app)
        .put('/api/settings')
        .set('Authorization', managerTokenA)
        .send({ taxRate: 16 });

      expect(settingsRes.status).toBe(403);
      expect(settingsRes.body.error).toBe('Permission denied');
      expect(settingsRes.body.details).toContain('manage_settings');
    });
  });

  describe('Verification 4: Multi-Tenant Isolation', () => {
    it('Org B matrix and actual route enforcement are completely unaffected by Org A changes', async () => {
      // 1. Seed Org B matrix
      const matrixB = await request(app)
        .get('/api/permissions/matrix')
        .set('Authorization', ownerTokenB);

      expect(matrixB.status).toBe(200);
      // Manager in Org B still has manage_settings enabled by default
      expect(matrixB.body.matrix.manager.manage_settings).toBe(true);

      // Verify Org B has its own DB row for manage_settings
      const settingsPerm = await Permission.findOne({ where: { name: 'manage_settings' } });
      const permRowB = await RolePermission.findOne({
        where: {
          organizationId: orgB.id,
          role: 'manager',
          permissionId: settingsPerm.id
        }
      });
      expect(permRowB).not.toBeNull();

      // 2. Manager in Org B attempts to update settings via PUT /api/settings -> should NOT receive 403 Permission denied
      const settingsResB = await request(app)
        .put('/api/settings')
        .set('Authorization', managerTokenB)
        .send({ taxRate: 14 });

      // Manager in Org B has manage_settings permission, so checkPermission passes (returns 200 or validation status)
      expect(settingsResB.status).not.toBe(403);
      expect(settingsResB.status).toBe(200);
    });
  });
});
