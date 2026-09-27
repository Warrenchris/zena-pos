'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const app = require('../src/app');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Product,
  Category
} = require('../src/models');
const { resolveAuthRole, buildAuthPayload } = require('../src/utils/serializeAuthResponse');
const staffCreationService = require('../src/services/staffCreationService');

describe('Org Admin Access Control & Security Invariants', () => {
  let org;
  let shopA;
  let shopB;
  let categoryA;
  let ownerUser;
  let ownerToken;
  let orgAdminEmp;
  let orgAdminToken;
  let cashierEmp;
  let cashierToken;

  beforeAll(async () => {
    const ts = Date.now();

    // 1. Organization & Shops
    org = await Organization.create({
      name: `OrgAdmin Test Org ${ts}`,
      slug: `orgadmin-test-${ts}`,
      status: 'active'
    });

    shopA = await Shop.create({
      name: `Shop A ${ts}`,
      organizationId: org.id,
      active: true
    });

    shopB = await Shop.create({
      name: `Shop B ${ts}`,
      organizationId: org.id,
      active: true
    });

    categoryA = await Category.create({
      name: `Cat A ${ts}`,
      shopId: shopA.id
    });

    // 2. Owner user
    ownerUser = await User.create({
      name: 'Test Owner',
      email: `owner_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA.id,
      active: true
    });

    await OrganizationMembership.create({
      organizationId: org.id,
      userId: ownerUser.id,
      orgRole: 'owner',
      status: 'active'
    });

    const ownerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: ownerUser.email, password: 'Password123!' });
    ownerToken = `Bearer ${ownerLogin.body.token}`;

    // 3. Delegated Org Admin Employee (created via staffCreationService with position='admin')
    const { employee: adminCreated } = await staffCreationService.createStaffMember({
      actor: ownerUser,
      body: {
        name: 'Delegated Admin',
        email: `org_admin_${ts}@example.com`,
        password: 'Password123!',
        position: 'admin',
        shopId: shopA.id
      },
      reqOrgId: org.id
    });
    orgAdminEmp = adminCreated;

    // 4. Cashier Employee
    const { employee: cashierCreated } = await staffCreationService.createStaffMember({
      actor: ownerUser,
      body: {
        name: 'Store Cashier',
        email: `cashier_${ts}@example.com`,
        password: 'Password123!',
        position: 'cashier',
        shopId: shopA.id
      },
      reqOrgId: org.id
    });
    cashierEmp = cashierCreated;

    // Log in both
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: orgAdminEmp.email, password: 'Password123!' });
    orgAdminToken = `Bearer ${adminLogin.body.token}`;

    const cashierLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: cashierEmp.email, password: 'Password123!' });
    cashierToken = `Bearer ${cashierLogin.body.token}`;
  });

  describe('Invariant 1: Employee JWT role is NEVER literally "admin"', () => {
    test('resolveAuthRole maps position="admin" with orgRole="admin" to "org_admin", never "admin"', () => {
      expect(resolveAuthRole('admin', 'admin')).toBe('org_admin');
      expect(resolveAuthRole('admin', 'admin')).not.toBe('admin');
      expect(resolveAuthRole('ADMIN', 'admin')).toBe('org_admin');
    });

    test('resolveAuthRole without orgRole="admin" fails closed to "employee"', () => {
      expect(resolveAuthRole('admin', 'member')).toBe('employee');
      expect(resolveAuthRole('admin', null)).toBe('employee');
    });

    test('login token for delegated admin employee has role="org_admin" and isEmployee=true', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: orgAdminEmp.email, password: 'Password123!' })
        .expect(200);

      const decoded = jwt.decode(loginRes.body.token);
      expect(decoded.isEmployee).toBe(true);
      expect(decoded.role).toBe('org_admin');
      expect(decoded.role).not.toBe('admin');
      expect(loginRes.body.user.role).toBe('org_admin');
      expect(loginRes.body.user.orgRole).toBe('admin');
    });
  });

  describe('Invariant 2: Only orgRole="owner" can access requireOrgOwner-gated billing routes', () => {
    test('orgRole="admin" is rejected from billing renewal routes with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', orgAdminToken)
        .send({ paymentMethod: 'card' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/organization owner privileges/i);
    });

    test('orgRole="admin" is rejected from billing invoices with 403', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', orgAdminToken);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/organization owner privileges/i);
    });

    test('cashier is rejected from billing renewal routes with 403', async () => {
      const res = await request(app)
        .post('/api/billing/subscription/renew')
        .set('Authorization', cashierToken)
        .send({ paymentMethod: 'card' });

      expect(res.status).toBe(403);
    });

    test('orgRole="owner" is permitted past requireOrgOwner middleware', async () => {
      const res = await request(app)
        .get('/api/billing/invoices')
        .set('Authorization', ownerToken);

      // Should not be 403 owner privilege error
      expect(res.status).not.toBe(403);
    });
  });

  describe('Invariant 3: orgRole="admin" scoped to shop A cannot access shop B without ShopAccess', () => {
    test('switchShop to Shop B is rejected with 403 when ShopAccess is lacking', async () => {
      const res = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', orgAdminToken)
        .send({ shopId: shopB.id });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access denied to target shop/i);
    });

    test('org_admin CAN perform manager-level actions in granted Shop A', async () => {
      // 1. Can list employees in Shop A
      const empRes = await request(app)
        .get('/api/employees')
        .set('Authorization', orgAdminToken);
      expect(empRes.status).toBe(200);

      // 2. Can create a product in Shop A
      const prodRes = await request(app)
        .post('/api/products')
        .set('Authorization', orgAdminToken)
        .send({
          name: `Admin Test Product ${Date.now()}`,
          sku: `SKU-${Date.now()}`,
          price: 150,
          cost: 100,
          categoryId: categoryA.id,
          stockQuantity: 20
        });
      // Accept either 201 or 403 if subscription inactive, but NOT 403 'Access denied.' from checkRole
      if (prodRes.status === 403) {
        expect(prodRes.body.error).not.toBe('Access denied.');
      } else {
        expect(prodRes.status).toBe(201);
      }
    });

    test('switchShop preserves org_admin role when switching to an authorized shop', async () => {
      // Grant orgAdminEmp access to Shop B
      const membership = await OrganizationMembership.findOne({
        where: { employeeId: orgAdminEmp.id }
      });

      await ShopAccess.create({
        membershipId: membership.id,
        shopId: shopB.id,
        isDefault: false
      });

      const switchRes = await request(app)
        .post('/api/auth/switch-shop')
        .set('Authorization', orgAdminToken)
        .send({ shopId: shopB.id });

      expect(switchRes.status).toBe(200);
      const decoded = jwt.decode(switchRes.body.token);
      expect(decoded.role).toBe('org_admin');
      expect(decoded.role).not.toBe('admin');
      expect(decoded.shopId).toBe(shopB.id);
      expect(switchRes.body.user.role).toBe('org_admin');
    });
  });

  describe('Invariant 4: Only User.role="admin" (owner) can grant Administrator position', () => {
    test('org_admin cannot create another employee with position="admin"', async () => {
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', orgAdminToken)
        .send({
          firstName: 'Illegal',
          lastName: 'Promotion',
          email: `illegal_promo_${Date.now()}@example.com`,
          password: 'Password123!',
          position: 'admin',
          salary: 1
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only organization owners can grant the Administrator position/i);
    });
  });

  describe('Invariant 5: Shop-level admin (User.role="admin") cannot create admin accounts or modify owner account', () => {
    let shopAdminUser;
    let shopAdminToken;

    beforeAll(async () => {
      const ts = Date.now();
      shopAdminUser = await User.create({
        name: 'Shop Admin Non-Owner',
        email: `shop_admin_${ts}@example.com`,
        password: 'Password123!',
        role: 'admin',
        shopId: shopA.id,
        active: true
      });

      await OrganizationMembership.create({
        organizationId: org.id,
        userId: shopAdminUser.id,
        orgRole: 'admin',
        status: 'active'
      });

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: shopAdminUser.email, password: 'Password123!' });
      shopAdminToken = `Bearer ${login.body.token}`;
    });

    test('non-owner shop admin attempting POST /api/users with role="admin" receives 403', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', shopAdminToken)
        .send({
          name: 'Unauthorized Admin',
          email: `unauth_admin_${Date.now()}@example.com`,
          password: 'Password123!',
          role: 'admin'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Only the organization owner can create admin accounts.');
    });

    test('non-owner shop admin attempting POST /api/users with role="cashier" or "manager" succeeds', async () => {
      const cashierRes = await request(app)
        .post('/api/users')
        .set('Authorization', shopAdminToken)
        .send({
          name: 'Allowed Cashier',
          email: `allowed_cashier_${Date.now()}@example.com`,
          password: 'Password123!',
          role: 'cashier'
        });

      expect(cashierRes.status).toBe(201);
      expect(cashierRes.body.role).toBe('cashier');

      const managerRes = await request(app)
        .post('/api/users')
        .set('Authorization', shopAdminToken)
        .send({
          name: 'Allowed Manager',
          email: `allowed_manager_${Date.now()}@example.com`,
          password: 'Password123!',
          role: 'manager'
        });

      expect(managerRes.status).toBe(201);
      expect(managerRes.body.role).toBe('manager');
    });

    test('non-owner shop admin attempting PUT /api/users/:ownerId/role receives 403 and leaves DB unchanged', async () => {
      // Attempt to demote and deactivate the organization owner
      const res = await request(app)
        .put(`/api/users/${ownerUser.id}/role`)
        .set('Authorization', shopAdminToken)
        .send({
          role: 'cashier',
          active: false
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Cannot modify the organization owner's account.");

      // Verify owner row in User table is unchanged
      const ownerInDb = await User.findByPk(ownerUser.id);
      expect(ownerInDb.role).toBe('admin');
      expect(ownerInDb.active).toBe(true);

      // Verify owner membership in OrganizationMembership is unchanged
      const membershipInDb = await OrganizationMembership.findOne({
        where: { userId: ownerUser.id }
      });
      expect(membershipInDb.orgRole).toBe('owner');
      expect(membershipInDb.status).toBe('active');
    });

    test('actual organization owner can still create admin accounts via POST /api/users', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', ownerToken)
        .send({
          name: 'Owner Created Admin',
          email: `owner_created_admin_${Date.now()}@example.com`,
          password: 'Password123!',
          role: 'admin'
        });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('admin');
    });

    test('actual organization owner can edit any user in their shop including themselves', async () => {
      // Owner edits another user
      const editOtherRes = await request(app)
        .put(`/api/users/${shopAdminUser.id}/role`)
        .set('Authorization', ownerToken)
        .send({
          role: 'manager',
          active: true
        });

      expect(editOtherRes.status).toBe(200);
      expect(editOtherRes.body.role).toBe('manager');

      // Owner edits themselves (no regression)
      const editSelfRes = await request(app)
        .put(`/api/users/${ownerUser.id}/role`)
        .set('Authorization', ownerToken)
        .send({
          role: 'admin',
          active: true
        });

      expect(editSelfRes.status).toBe(200);
    });
  });
});
