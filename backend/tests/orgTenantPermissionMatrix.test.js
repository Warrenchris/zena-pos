'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
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
        const shopIds = (await Shop.findAll({ where: { organizationId: o.id }, attributes: ['id'] })).map(s => s.id);
        if (shopIds.length > 0) {
          await Inventory.destroy({ where: { shopId: shopIds } });
          await Product.destroy({ where: { shopId: shopIds } });
          await User.destroy({ where: { shopId: shopIds } });
          await Employee.destroy({ where: { shopId: shopIds } });
          await Shop.destroy({ where: { id: shopIds } });
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

      // 4 permissions must be unconditionally enforced: true
      expect(enforcedMap['create_sales']).toBe(true);
      expect(enforcedMap['manage_settings']).toBe(true);
      expect(enforcedMap['process_refunds']).toBe(true);
      expect(enforcedMap['view_own_sales']).toBe(true);

      // In a freshly seeded org, cashier has view_own_sales enabled by default
      expect(res.body.matrix.cashier.view_own_sales).toBe(true);

      // Other permissions must be enforced: false
      const nonEnforced = [
        'manage_users', 'manage_products', 'manage_categories', 'view_reports',
        'access_pos', 'manage_sales', 'manage_expenses', 'view_customers',
        'manage_customers', 'manage_employees', 'view_dashboard', 'view_products'
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
  // ON-ENFORCEMENT PATH LAZY SEEDING VERIFICATIONS
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

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();

      const countAfter = await RolePermission.count({ where: { organizationId: orgC.id } });
      expect(countAfter).toBeGreaterThan(0);
      console.log(`[Test 1] Org C RolePermission rows: before=${countBefore}, after=${countAfter}`);
    });

    it('Test 2: Same unseeded org: manager can access manage_settings (200) and cashier is denied (403)', async () => {
      const managerRes = await request(app)
        .put('/api/settings')
        .set('Authorization', managerTokenC)
        .send({ taxRate: 16 });
      expect(managerRes.status).toBe(200);

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

      const countEBefore = await RolePermission.count({ where: { organizationId: orgE.id } });
      const countFBefore = await RolePermission.count({ where: { organizationId: orgF.id } });
      expect(countEBefore).toBe(0);
      expect(countFBefore).toBe(0);

      const permsE = await permissionCache.getRolePermissions('cashier', orgE.id);
      expect(permsE.length).toBeGreaterThan(0);

      const countEAfter = await RolePermission.count({ where: { organizationId: orgE.id } });
      const countFAfter = await RolePermission.count({ where: { organizationId: orgF.id } });

      expect(countEAfter).toBeGreaterThan(0);
      expect(countFAfter).toBe(0);
      console.log(`[Test 4] Tenant Isolation: Org E rows=${countEAfter}, Org F rows=${countFAfter}`);
    });

    // =========================================================================
    // NEW INVARIANTS: view_own_sales & role normalization (employee / org_admin)
    // =========================================================================
    it('Test 5: Cashier GET /api/sales/my-sales -> 200 in a fresh unseeded org', async () => {
      const ts = Date.now() + 400;
      const orgG = await Organization.create({
        name: `Org G Fresh MySales ${ts}`,
        slug: `org-g-fresh-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgG);

      const shopG = await Shop.create({
        name: `Shop G ${ts}`,
        organizationId: orgG.id,
        active: true
      });

      const cashierG = await User.create({
        name: `Cashier G ${ts}`,
        email: `cashier_g_${ts}@test.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopG.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgG.id,
        userId: cashierG.id,
        orgRole: 'member',
        status: 'active'
      });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: cashierG.email, password: 'Password123!' });
      const tokenG = `Bearer ${loginRes.body.token}`;

      // Org G has 0 rows before this call
      const countBefore = await RolePermission.count({ where: { organizationId: orgG.id } });
      expect(countBefore).toBe(0);

      // GET /api/sales/my-sales is gated by checkPermission('view_own_sales', { useCache: true })
      const res = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', tokenG);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.sales)).toBe(true);

      const countAfter = await RolePermission.count({ where: { organizationId: orgG.id } });
      expect(countAfter).toBeGreaterThan(0);
      console.log(`[Test 5] Fresh org cashier /api/sales/my-sales: 200 OK. Org G rows: before=${countBefore}, after=${countAfter}`);
    });

    it('Test 6: Employee (JWT role employee) POST /api/sales -> 201, GET /my-sales -> 200, PUT /settings -> 403', async () => {
      const ts = Date.now() + 500;
      const orgH = await Organization.create({
        name: `Org H Employee ${ts}`,
        slug: `org-h-emp-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgH);

      const shopH = await Shop.create({
        name: `Shop H ${ts}`,
        organizationId: orgH.id,
        active: true
      });

      // Create employee directly with hashed password to avoid nodemailer/SMTP timeout
      const hashedPassword = await bcrypt.hash('Password123!', 8);
      const employee = await Employee.create({
        firstName: 'General',
        lastName: 'Employee',
        email: `employee_h_${ts}@test.com`,
        password: hashedPassword,
        position: 'clerk',
        salary: 1000,
        hireDate: new Date(),
        shopId: shopH.id,
        status: 'active'
      });
      await OrganizationMembership.create({
        organizationId: orgH.id,
        employeeId: employee.id,
        orgRole: 'member',
        status: 'active'
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: employee.email, password: 'Password123!' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.role).toBe('employee');
      const empToken = `Bearer ${loginRes.body.token}`;

      const prodH = await Product.create({
        name: `Product H ${ts}`,
        sku: `SKU-H-${ts}`,
        price: 80,
        cost: 40,
        shopId: shopH.id,
        organizationId: orgH.id,
        active: true
      });
      await Inventory.create({
        productId: prodH.id,
        shopId: shopH.id,
        stockQuantity: 50,
        reorderPoint: 5
      });

      // 1. Employee POST /api/sales -> 201 (normalized to cashier create_sales)
      const saleRes = await request(app)
        .post('/api/sales')
        .set('Authorization', empToken)
        .send({
          items: [{ productId: prodH.id, quantity: 1, price: 80 }],
          total: 80,
          paymentAmount: 80,
          paymentMethod: 'cash'
        });
      expect(saleRes.status).toBe(201);

      // 2. Employee GET /api/sales/my-sales -> 200 (normalized to cashier view_own_sales)
      const mySalesRes = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', empToken);
      expect(mySalesRes.status).toBe(200);

      // 3. Employee PUT /api/settings -> 403 (employee/cashier does NOT have manage_settings)
      const settingsRes = await request(app)
        .put('/api/settings')
        .set('Authorization', empToken)
        .send({ taxRate: 16 });
      expect(settingsRes.status).toBe(403);
      expect(settingsRes.body.error).toBe('Permission denied');
      console.log('[Test 6] Employee role normalized to cashier: sales=201, my-sales=200, settings=403');
    });

    it('Test 7: Delegated org_admin PUT /settings -> 200, and POST refund route is not blocked by checkPermission', async () => {
      const ts = Date.now() + 600;
      const orgI = await Organization.create({
        name: `Org I Admin ${ts}`,
        slug: `org-i-admin-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgI);

      const shopI = await Shop.create({
        name: `Shop I ${ts}`,
        organizationId: orgI.id,
        active: true
      });

      // Delegated Org Admin: Employee with position 'admin' and OrganizationMembership with orgRole 'admin'
      const hashedPassword = await bcrypt.hash('Password123!', 8);
      const adminUserI = await User.create({
        name: `Delegated Admin User ${ts}`,
        email: `admin_user_i_${ts}@test.com`,
        password: hashedPassword,
        role: 'manager',
        shopId: shopI.id,
        active: true
      });

      const adminEmp = await Employee.create({
        id: String(adminUserI.id),
        firstName: 'Delegated',
        lastName: 'Admin',
        email: `admin_i_${ts}@test.com`,
        password: hashedPassword,
        position: 'admin',
        salary: 2000,
        hireDate: new Date(),
        shopId: shopI.id,
        status: 'active'
      });
      await OrganizationMembership.create({
        organizationId: orgI.id,
        employeeId: adminEmp.id,
        orgRole: 'admin',
        status: 'active'
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: adminEmp.email, password: 'Password123!' });
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.user.role).toBe('org_admin');
      const orgAdminToken = `Bearer ${loginRes.body.token}`;

      // 1. org_admin PUT /api/settings -> 200 (normalized to manager manage_settings)
      const settingsRes = await request(app)
        .put('/api/settings')
        .set('Authorization', orgAdminToken)
        .send({ taxRate: 15 });
      expect(settingsRes.status).toBe(200);

      // 2. org_admin POST /api/sales/:saleId/refund (checkPermission('process_refunds', { useCache: true }))
      // Using dummy sale ID 999999 verifies checkPermission does NOT block with 403
      const refundRes = await request(app)
        .post('/api/sales/999999/refund')
        .set('Authorization', orgAdminToken)
        .send({ items: [], reason: 'Test' });
      // Must not be blocked by permission check
      expect(refundRes.status).not.toBe(403);
      console.log(`[Test 7] org_admin role normalized to manager: settings=200, refund route passed checkPermission (status=${refundRes.status})`);
    });

    it('Test 8: Owner disables view_own_sales for cashier via PUT /matrix -> cashier gets 403 on /my-sales and STAYS 403 after cache flush', async () => {
      const ts = Date.now() + 700;
      const orgJ = await Organization.create({
        name: `Org J Disable ${ts}`,
        slug: `org-j-disable-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgJ);

      const shopJ = await Shop.create({
        name: `Shop J ${ts}`,
        organizationId: orgJ.id,
        active: true
      });

      const ownerJ = await User.create({
        name: `Owner J ${ts}`,
        email: `owner_j_${ts}@test.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopJ.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgJ.id,
        userId: ownerJ.id,
        orgRole: 'owner',
        status: 'active'
      });
      const ownerLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: ownerJ.email, password: 'Password123!' });
      const ownerTokenJ = `Bearer ${ownerLogin.body.token}`;

      const cashierJ = await User.create({
        name: `Cashier J ${ts}`,
        email: `cashier_j_${ts}@test.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopJ.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgJ.id,
        userId: cashierJ.id,
        orgRole: 'member',
        status: 'active'
      });
      const cashierLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: cashierJ.email, password: 'Password123!' });
      const cashierTokenJ = `Bearer ${cashierLogin.body.token}`;

      // 1. Initial access: fresh org seeds and cashier gets 200
      const initRes = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', cashierTokenJ);
      expect(initRes.status).toBe(200);

      // 2. Owner disables view_own_sales for cashier
      const updateRes = await request(app)
        .put('/api/permissions/matrix')
        .set('Authorization', ownerTokenJ)
        .send({
          updates: [
            { role: 'cashier', permissionName: 'view_own_sales', enabled: false }
          ]
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.matrix.cashier.view_own_sales).toBe(false);

      // 3. Cashier now gets 403 on /my-sales
      const deniedRes1 = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', cashierTokenJ);
      expect(deniedRes1.status).toBe(403);
      expect(deniedRes1.body.error).toBe('Permission denied');

      // 4. Flush cache and make a second request -> must STAY 403 (proves no re-grant because org is already seeded)
      await permissionCache.clearAllCaches();
      const deniedRes2 = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', cashierTokenJ);
      expect(deniedRes2.status).toBe(403);
      expect(deniedRes2.body.error).toBe('Permission denied');
      console.log('[Test 8] Disabling view_own_sales: first attempt=403, post-cache-flush attempt=403 (no re-grant)');
    });

    it('Test 9: After migration backfill on an org with rows but missing view_own_sales, cashier gets 200 on /my-sales', async () => {
      const ts = Date.now() + 800;
      const orgK = await Organization.create({
        name: `Org K Backfill ${ts}`,
        slug: `org-k-backfill-${ts}`,
        status: 'active'
      });
      cleanupOrgs.push(orgK);

      const shopK = await Shop.create({
        name: `Shop K ${ts}`,
        organizationId: orgK.id,
        active: true
      });

      const cashierK = await User.create({
        name: `Cashier K ${ts}`,
        email: `cashier_k_${ts}@test.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopK.id,
        active: true
      });
      await OrganizationMembership.create({
        organizationId: orgK.id,
        userId: cashierK.id,
        orgRole: 'member',
        status: 'active'
      });
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: cashierK.email, password: 'Password123!' });
      const cashierTokenK = `Bearer ${loginRes.body.token}`;

      // Simulate an org seeded under the prior schema (has rows for other permissions, but NOT view_own_sales)
      const otherPerms = await Permission.findAll({
        where: { name: ['create_sales', 'manage_settings'] }
      });
      for (const p of otherPerms) {
        await RolePermission.create({
          organizationId: orgK.id,
          role: 'cashier',
          permissionId: p.id
        });
        await RolePermission.create({
          organizationId: orgK.id,
          role: 'admin',
          permissionId: p.id
        });
      }

      // Without view_own_sales in RolePermission, cashier gets 403 on /my-sales
      await permissionCache.clearAllCaches();
      const preBackfillRes = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', cashierTokenK);
      expect(preBackfillRes.status).toBe(403);

      // Now apply migration backfill logic for view_own_sales on orgK
      const viewOwnSalesPerm = await Permission.findOne({ where: { name: 'view_own_sales' } });
      await RolePermission.create({
        organizationId: orgK.id,
        role: 'cashier',
        permissionId: viewOwnSalesPerm.id
      });
      await RolePermission.create({
        organizationId: orgK.id,
        role: 'admin',
        permissionId: viewOwnSalesPerm.id
      });
      await permissionCache.clearAllCaches();

      // Now cashier gets 200 on /my-sales
      const postBackfillRes = await request(app)
        .get('/api/sales/my-sales')
        .set('Authorization', cashierTokenK);
      expect(postBackfillRes.status).toBe(200);
      console.log('[Test 9] Backfilled org: pre-backfill=403, post-backfill=200 OK');
    });
  });
});
