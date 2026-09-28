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
  Permission,
  Product,
  Inventory
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

  let cleanupOrgs = [];

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
    cleanupOrgs.push(orgA);

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
    cleanupOrgs.push(orgB);

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
    for (const o of cleanupOrgs) {
      try {
        await RolePermission.destroy({ where: { organizationId: o.id } });
        await OrganizationMembership.destroy({ where: { organizationId: o.id } });
        const shops = await Shop.findAll({ where: { organizationId: o.id } });
        for (const s of shops) {
          await Inventory.destroy({ where: { shopId: s.id } });
          await Product.destroy({ where: { shopId: s.id } });
          await User.destroy({ where: { shopId: s.id } });
          await Shop.destroy({ where: { id: s.id } });
        }
        await Organization.destroy({ where: { id: o.id } });
      } catch (err) {
        // ignore cleanup error
      }
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

      // Enforced permissions present in DEFAULT_PERMISSIONS must have enforced: true
      expect(enforcedMap['create_sales']).toBe(true);
      expect(enforcedMap['manage_settings']).toBe(true);
      expect(enforcedMap['process_refunds']).toBe(true);
      if (enforcedMap['view_own_sales'] !== undefined) {
        expect(enforcedMap['view_own_sales']).toBe(true);
      }

      // Other permissions must be enforced: false
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

  // =========================================================================
  // ON-ENFORCEMENT PATH LAZY SEEDING VERIFICATIONS (Phase B1 Follow-up)
  // =========================================================================
  describe('On-Enforcement Path Lazy Seeding', () => {
    let orgC;
    let shopC;
    let cashierUserC;
    let cashierTokenC;
    let managerUserC;
    let managerTokenC;
    let productC;

    beforeAll(async () => {
      const ts = Date.now() + 100;
      orgC = await Organization.create({
        name: `Org C Unseeded ${ts}`,
        slug: `org-c-unseeded-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgC);

      shopC = await Shop.create({
        name: `Shop C ${ts}`,
        organizationId: orgC.id,
        active: true
      });

      // Cashier in Org C
      cashierUserC = await User.create({
        name: `Cashier C ${ts}`,
        email: `cashier_c_${ts}@test.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopC.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgC.id,
        userId: cashierUserC.id,
        orgRole: 'member',
        status: 'active'
      });
      const loginResCashier = await request(app)
        .post('/api/auth/login')
        .send({ email: cashierUserC.email, password: 'Password123!' });
      cashierTokenC = `Bearer ${loginResCashier.body.token}`;

      // Manager in Org C
      managerUserC = await User.create({
        name: `Manager C ${ts}`,
        email: `manager_c_${ts}@test.com`,
        password: 'Password123!',
        role: 'manager',
        shopId: shopC.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgC.id,
        userId: managerUserC.id,
        orgRole: 'member',
        status: 'active'
      });
      const loginResManager = await request(app)
        .post('/api/auth/login')
        .send({ email: managerUserC.email, password: 'Password123!' });
      managerTokenC = `Bearer ${loginResManager.body.token}`;

      // Product and Inventory for Shop C
      productC = await Product.create({
        name: `Product C ${ts}`,
        sku: `SKU-C-${ts}`,
        price: 100,
        cost: 50,
        shopId: shopC.id,
        organizationId: orgC.id,
        active: true
      });
      await Inventory.create({
        productId: productC.id,
        shopId: shopC.id,
        stockQuantity: 50,
        reorderPoint: 5
      });
    });

    it('Test 1: Brand-new unseeded org: cashier POSTing /api/sales returns 201, seeding DB on enforcement path', async () => {
      // Confirm 0 RolePermission rows before request (has NEVER called GET /matrix)
      const countBefore = await RolePermission.count({ where: { organizationId: orgC.id } });
      expect(countBefore).toBe(0);

      const salePayload = {
        items: [{ productId: productC.id, quantity: 1, price: 100 }],
        total: 100,
        paymentAmount: 100,
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', cashierTokenC)
        .send(salePayload);

      // Must succeed with 201 (not 403!)
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();

      // Confirm RolePermission rows now exist in DB for orgC
      const countAfter = await RolePermission.count({ where: { organizationId: orgC.id } });
      expect(countAfter).toBeGreaterThan(0);
      console.log(`[Test 1] Org C RolePermission rows: before=${countBefore}, after=${countAfter}`);
    });

    it('Test 2: Same unseeded org: manager can access manage_settings (200) and cashier is denied (403)', async () => {
      // Manager should succeed on PUT /api/settings
      const managerRes = await request(app)
        .put('/api/settings')
        .set('Authorization', managerTokenC)
        .send({ taxRate: 16 });
      expect(managerRes.status).toBe(200);

      // Cashier should be denied with 403
      const cashierRes = await request(app)
        .put('/api/settings')
        .set('Authorization', cashierTokenC)
        .send({ taxRate: 18 });
      expect(cashierRes.status).toBe(403);
      expect(cashierRes.body.error).toBe('Permission denied');
      expect(cashierRes.body.details).toContain('manage_settings');
    });

    it('Test 3: Two concurrent first requests for the same unseeded org (Promise.all) produce no duplicate rows and no error', async () => {
      const ts = Date.now() + 200;
      const orgD = await Organization.create({
        name: `Org D Concurrent ${ts}`,
        slug: `org-d-concurrent-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgD);

      const shopD = await Shop.create({
        name: `Shop D ${ts}`,
        organizationId: orgD.id,
        active: true
      });

      const cashierUserD = await User.create({
        name: `Cashier D ${ts}`,
        email: `cashier_d_${ts}@test.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopD.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgD.id,
        userId: cashierUserD.id,
        orgRole: 'member',
        status: 'active'
      });
      const loginResD = await request(app)
        .post('/api/auth/login')
        .send({ email: cashierUserD.email, password: 'Password123!' });
      const cashierTokenD = `Bearer ${loginResD.body.token}`;

      const productD = await Product.create({
        name: `Product D ${ts}`,
        sku: `SKU-D-${ts}`,
        price: 50,
        cost: 20,
        shopId: shopD.id,
        organizationId: orgD.id,
        active: true
      });
      await Inventory.create({
        productId: productD.id,
        shopId: shopD.id,
        stockQuantity: 50,
        reorderPoint: 5
      });

      const countBeforeD = await RolePermission.count({ where: { organizationId: orgD.id } });
      expect(countBeforeD).toBe(0);

      // Fire two concurrent requests for unseeded orgD
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/sales')
          .set('Authorization', cashierTokenD)
          .set('Idempotency-Key', `idem-d1-${ts}`)
          .send({
            items: [{ productId: productD.id, quantity: 1, price: 50 }],
            total: 50,
            paymentAmount: 50,
            paymentMethod: 'cash'
          }),
        request(app)
          .post('/api/sales')
          .set('Authorization', cashierTokenD)
          .set('Idempotency-Key', `idem-d2-${ts}`)
          .send({
            items: [{ productId: productD.id, quantity: 1, price: 50 }],
            total: 50,
            paymentAmount: 50,
            paymentMethod: 'cash'
          })
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Verify no duplicate rows
      const rowsD = await RolePermission.findAll({ where: { organizationId: orgD.id } });
      const seen = new Set();
      let hasDuplicates = false;
      for (const r of rowsD) {
        const key = `${r.role}-${r.permissionId}`;
        if (seen.has(key)) {
          hasDuplicates = true;
          break;
        }
        seen.add(key);
      }
      expect(hasDuplicates).toBe(false);
      console.log(`[Test 3] Org D Concurrent Seeding: rows=${rowsD.length}, distinctKeys=${seen.size}`);
    });

    it('Test 4: Seeding one org does not create or alter rows for any other org', async () => {
      const ts = Date.now() + 300;
      const orgE = await Organization.create({
        name: `Org E Isolation ${ts}`,
        slug: `org-e-iso-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgE);

      const orgF = await Organization.create({
        name: `Org F Isolation ${ts}`,
        slug: `org-f-iso-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgF);

      // Both start with 0 rows
      const countEBefore = await RolePermission.count({ where: { organizationId: orgE.id } });
      const countFBefore = await RolePermission.count({ where: { organizationId: orgF.id } });
      expect(countEBefore).toBe(0);
      expect(countFBefore).toBe(0);

      // Trigger seeding for Org E by resolving cashier permissions
      const permsE = await permissionCache.getRolePermissions('cashier', orgE.id);
      expect(permsE.length).toBeGreaterThan(0);

      const countEAfter = await RolePermission.count({ where: { organizationId: orgE.id } });
      const countFAfter = await RolePermission.count({ where: { organizationId: orgF.id } });

      expect(countEAfter).toBeGreaterThan(0);
      // Org F must remain completely unseeded (0 rows)
      expect(countFAfter).toBe(0);
      console.log(`[Test 4] Tenant Isolation: Org E rows=${countEAfter}, Org F rows=${countFAfter}`);
    });
  });
});
