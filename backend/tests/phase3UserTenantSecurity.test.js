'use strict';

const request = require('supertest');
const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const {
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Plan,
  Subscription,
  ActivityLog
} = require('../src/models');
const entitlementService = require('../src/services/entitlementService');

function tokenFor(payload) {
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return 'Bearer ' + jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '2h'
  });
}

describe('Phase 3: User Creation, Tenant Membership & Quota Integrity', () => {
  let starterPlan;
  let growthPlan;

  let orgA, orgB;
  let shopA1, shopA2, shopB1;
  let userA1, userB1;
  let tokenA1, tokenB1;

  beforeAll(async () => {
    await sequelize.authenticate();

    // Ensure Starter and Growth plans exist
    [starterPlan] = await Plan.findOrCreate({
      where: { code: 'starter' },
      defaults: {
        name: 'Starter',
        price: 2500,
        billingCycle: 'monthly',
        maxShops: 1,
        maxUsers: 2,
        features: JSON.stringify({ multi_shop: false, org_insights: false }),
        status: 'active'
      }
    });

    [growthPlan] = await Plan.findOrCreate({
      where: { code: 'growth' },
      defaults: {
        name: 'Growth',
        price: 6500,
        billingCycle: 'monthly',
        maxShops: 3,
        maxUsers: 10,
        features: JSON.stringify({ multi_shop: true, org_insights: true }),
        status: 'active'
      }
    });
  }, 30000);

  beforeEach(async () => {
    const ts = Date.now();

    // 1. Setup Tenant A on Starter plan (maxUsers = 2)
    orgA = await Organization.create({
      name: `Tenant A ${ts}`,
      slug: `tenant-a-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopA1 = await Shop.create({
      name: `Shop A1 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    userA1 = await User.create({
      name: 'Admin A1',
      email: `admin-a1-${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopA1.id
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: userA1.id,
      orgRole: 'owner',
      status: 'active'
    });

    await Subscription.create({
      organizationId: orgA.id,
      planId: starterPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      cancelAtPeriodEnd: false
    });

    tokenA1 = tokenFor({
      id: userA1.id,
      role: 'admin',
      shopId: shopA1.id,
      organizationId: orgA.id,
      isEmployee: false
    });

    // 2. Setup Tenant B on Growth plan (maxUsers = 10)
    orgB = await Organization.create({
      name: `Tenant B ${ts}`,
      slug: `tenant-b-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    shopB1 = await Shop.create({
      name: `Shop B1 ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    userB1 = await User.create({
      name: 'Admin B1',
      email: `admin-b1-${ts}@test.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shopB1.id
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: userB1.id,
      orgRole: 'owner',
      status: 'active'
    });

    await Subscription.create({
      organizationId: orgB.id,
      planId: growthPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      cancelAtPeriodEnd: false
    });

    tokenB1 = tokenFor({
      id: userB1.id,
      role: 'admin',
      shopId: shopB1.id,
      organizationId: orgB.id,
      isEmployee: false
    });

    await entitlementService.invalidateOrgEntitlements(orgA.id);
    await entitlementService.invalidateOrgEntitlements(orgB.id);
  });

  afterEach(async () => {
    if (orgA && orgB) {
      const orgIds = [orgA.id, orgB.id];
      const shops = await Shop.findAll({ where: { organizationId: { [Op.in]: orgIds } } });
      const shopIds = shops.map(s => s.id);

      await ActivityLog.destroy({ where: { shopId: { [Op.in]: shopIds } } }).catch(() => {});
      await ShopAccess.destroy({ where: { shopId: { [Op.in]: shopIds } } }).catch(() => {});
      await OrganizationMembership.destroy({ where: { organizationId: { [Op.in]: orgIds } } }).catch(() => {});
      await Employee.destroy({ where: { shopId: { [Op.in]: shopIds } } }).catch(() => {});
      await User.destroy({ where: { shopId: { [Op.in]: shopIds } } }).catch(() => {});
      await Subscription.destroy({ where: { organizationId: { [Op.in]: orgIds } } }).catch(() => {});
      await Shop.destroy({ where: { id: { [Op.in]: shopIds } } }).catch(() => {});
      await Organization.destroy({ where: { id: { [Op.in]: orgIds } } }).catch(() => {});
    }
  });

  // =========================================================================
  // 1. AUT-01: SELF-SIGNUP ROLE COHERENCE
  // =========================================================================
  describe('AUT-01: Self-Signup Role Coherence', () => {
    test('Self-signup ignores client-supplied role=cashier and forces role=admin and orgRole=owner', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Coherent Owner',
          email: `coherent_owner_${ts}@test.com`,
          password: 'Password123!',
          role: 'cashier', // Attacker / client attempts to request cashier
          shop: { name: `Coherent Org ${ts}` }
        })
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('admin'); // Server authoritatively sets admin

      // Verify in database
      const createdUser = await User.findOne({ where: { email: `coherent_owner_${ts}@test.com` } });
      expect(createdUser.role).toBe('admin');

      const membership = await OrganizationMembership.findOne({ where: { userId: createdUser.id } });
      expect(membership).toBeDefined();
      expect(membership.orgRole).toBe('owner');
      expect(membership.status).toBe('active');

      // Teardown
      await OrganizationMembership.destroy({ where: { id: membership.id } });
      await Subscription.destroy({ where: { organizationId: membership.organizationId } });
      await User.destroy({ where: { id: createdUser.id } });
      await Shop.destroy({ where: { id: createdUser.shopId } });
      await Organization.destroy({ where: { id: membership.organizationId } });
    });

    test('Self-signup without role defaults to admin role and owner orgRole', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Default Owner',
          email: `default_owner_${ts}@test.com`,
          password: 'Password123!',
          shop: { name: `Default Org ${ts}` }
        })
        .expect(201);

      expect(res.body.user.role).toBe('admin');

      const createdUser = await User.findOne({ where: { email: `default_owner_${ts}@test.com` } });
      expect(createdUser.role).toBe('admin');

      const membership = await OrganizationMembership.findOne({ where: { userId: createdUser.id } });
      expect(membership.orgRole).toBe('owner');

      // Teardown
      await OrganizationMembership.destroy({ where: { id: membership.id } });
      await Subscription.destroy({ where: { organizationId: membership.organizationId } });
      await User.destroy({ where: { id: createdUser.id } });
      await Shop.destroy({ where: { id: createdUser.shopId } });
      await Organization.destroy({ where: { id: membership.organizationId } });
    });
  });

  // =========================================================================
  // 2. ISO-01: USER QUOTA ENFORCEMENT & MEMBERSHIP INTEGRITY
  // =========================================================================
  describe('ISO-01: User Quota & Membership Integrity', () => {
    test('Staff creation below quota succeeds and creates OrganizationMembership and ShopAccess', async () => {
      const ts = Date.now();
      // Tenant A currently has 1 user (userA1, owner). Starter limit is 2.
      // Adding 1 employee should succeed (total becomes 2 of 2).
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Alice',
          lastName: 'Staff',
          email: `alice_staff_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 12000
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(`alice_staff_${ts}@test.com`);
      expect(res.body.shopId).toBe(shopA1.id);

      // Verify Employee row
      const emp = await Employee.findByPk(res.body.id);
      expect(emp).toBeDefined();
      expect(emp.status).toBe('active');

      // Verify OrganizationMembership was created
      const membership = await OrganizationMembership.findOne({
        where: { employeeId: emp.id, organizationId: orgA.id }
      });
      expect(membership).toBeDefined();
      expect(membership.orgRole).toBe('member');
      expect(membership.status).toBe('active');

      // Verify ShopAccess was created
      const access = await ShopAccess.findOne({
        where: { membershipId: membership.id, shopId: shopA1.id }
      });
      expect(access).toBeDefined();
      expect(access.isDefault).toBe(true);
    });

    test('Staff creation at quota limit fails with structured 403 QUOTA_EXCEEDED error', async () => {
      const ts = Date.now();
      // 1. Create first employee to reach limit (total active = 2 of 2)
      await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'First',
          lastName: 'Staff',
          email: `first_staff_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(201);

      // 2. Attempt to create second employee (total would become 3 of 2) -> BLOCKED
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Second',
          lastName: 'Staff',
          email: `second_staff_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(403);

      expect(res.body.code).toBe('QUOTA_EXCEEDED');
      expect(res.body.quota).toBe('maxUsers');
      expect(res.body.limit).toBe(2);
      expect(res.body.current).toBe(2);
      expect(res.body.requiredPlan).toBe('growth');

      // Confirm no orphan was created in Employees or OrganizationMemberships
      const orphanEmp = await Employee.findOne({ where: { email: `second_staff_${ts}@test.com` } });
      expect(orphanEmp).toBeNull();
    });

    test('Legacy POST /api/users CANNOT bypass maxUsers quota', async () => {
      const ts = Date.now();
      // Reach quota limit on Tenant A (2 of 2)
      await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'First',
          lastName: 'Staff',
          email: `quota_fill_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(201);

      // Attempt quota bypass using legacy /api/users endpoint
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', tokenA1)
        .send({
          name: 'Bypass Attacker',
          email: `bypass_attempt_${ts}@test.com`,
          password: 'Password123!',
          role: 'cashier'
        })
        .expect(403);

      expect(res.body.code).toBe('QUOTA_EXCEEDED');
      expect(res.body.quota).toBe('maxUsers');
      expect(res.body.limit).toBe(2);

      // Confirm bypass row was not created in Users or Employees
      const orphanUser = await User.findOne({ where: { email: `bypass_attempt_${ts}@test.com` } });
      const orphanEmp = await Employee.findOne({ where: { email: `bypass_attempt_${ts}@test.com` } });
      expect(orphanUser).toBeNull();
      expect(orphanEmp).toBeNull();
    });

    test('Legacy POST /api/users creates OrganizationMembership when below quota', async () => {
      const ts = Date.now();
      // Tenant A is at 1 of 2. Create staff through /api/users
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', tokenA1)
        .send({
          name: 'Legacy Staff',
          email: `legacy_staff_${ts}@test.com`,
          password: 'Password123!',
          role: 'cashier'
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.email).toBe(`legacy_staff_${ts}@test.com`);

      // Verify membership was created
      const membership = await OrganizationMembership.findOne({
        where: { employeeId: res.body.id, organizationId: orgA.id }
      });
      expect(membership).toBeDefined();
      expect(membership.status).toBe('active');
    });
  });

  // =========================================================================
  // 3. ORGANIZATION & BRANCH ISOLATION (ADVERSARIAL TESTS)
  // =========================================================================
  describe('Organization & Branch Isolation', () => {
    test('Tenant A administrator cannot create user assigned to Tenant B shop (SHOP_ACCESS_DENIED)', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Adversary',
          lastName: 'CrossTenant',
          email: `cross_tenant_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000,
          shopId: shopB1.id // Foreign shop in Tenant B
        })
        .expect(403);

      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');

      // Verify no employee was created in Shop B1
      const orphan = await Employee.findOne({ where: { email: `cross_tenant_${ts}@test.com` } });
      expect(orphan).toBeNull();
    });

    test('Tenant A owner can assign employee to another branch within Tenant A (Shop A2)', async () => {
      const ts = Date.now();
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Branch2',
          lastName: 'Staff',
          email: `branch2_staff_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000,
          shopId: shopA2.id // Valid secondary shop belonging to Tenant A
        })
        .expect(201);

      expect(res.body.shopId).toBe(shopA2.id);

      // Verify membership and shop access
      const emp = await Employee.findByPk(res.body.id);
      expect(emp.shopId).toBe(shopA2.id);

      const access = await ShopAccess.findOne({
        where: { shopId: shopA2.id }
      });
      expect(access).toBeDefined();
    });

    test('Manipulating organization context via headers or body does not allow cross-tenant creation', async () => {
      const ts = Date.now();
      // Attacker from Tenant A sends organizationId of Tenant B in body
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Tamper',
          lastName: 'Org',
          email: `tamper_org_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000,
          organizationId: orgB.id, // Tampered orgId
          shopId: shopB1.id
        })
        .expect(403);

      expect(res.body.code).toBe('SHOP_ACCESS_DENIED');
      const orphan = await Employee.findOne({ where: { email: `tamper_org_${ts}@test.com` } });
      expect(orphan).toBeNull();
    });
  });

  // =========================================================================
  // 4. DUPLICATE EMAIL & NORMALIZATION
  // =========================================================================
  describe('Duplicate Email & Normalization', () => {
    test('Case-insensitive duplicate email across User and Employee is rejected', async () => {
      const ts = Date.now();
      // 1. Create employee with lowercase email
      await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Base',
          lastName: 'Employee',
          email: `unique_check_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(201);

      // 2. Attempt to create user with uppercase/mixed case and whitespace variations
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Duplicate',
          lastName: 'Casing',
          email: `  Unique_Check_${ts}@test.com  `,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(400);

      expect(res.body.code).toBe('DUPLICATE_EMAIL');
    });

    test('Duplicate email across different tenants is rejected (global unique identity)', async () => {
      const ts = Date.now();
      // Tenant A creates staff
      await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'TenantA',
          lastName: 'User',
          email: `global_identity_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(201);

      // Tenant B tries to create staff with the same email
      const res = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenB1)
        .send({
          firstName: 'TenantB',
          lastName: 'User',
          email: `global_identity_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        })
        .expect(400);

      expect(res.body.code).toBe('DUPLICATE_EMAIL');
    });
  });

  // =========================================================================
  // 5. CONCURRENCY: CREATION AT QUOTA BOUNDARY
  // =========================================================================
  describe('Concurrency Safety at Quota Boundary', () => {
    test('Simultaneous requests at quota limit cannot exceed maxUsers', async () => {
      const ts = Date.now();
      // Tenant A is at 1 of 2. Exactly ONE slot remaining.
      // Launch two concurrent requests.
      const req1 = request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Race1',
          lastName: 'Worker',
          email: `race1_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        });

      const req2 = request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Race2',
          lastName: 'Worker',
          email: `race2_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 10000
        });

      const [res1, res2] = await Promise.all([req1, req2]);

      const statuses = [res1.status, res2.status].sort();
      // Expected: exactly one 201 (success) and exactly one 403 (QUOTA_EXCEEDED)
      expect(statuses).toEqual([201, 403]);

      const failedRes = res1.status === 403 ? res1 : res2;
      expect(failedRes.body.code).toBe('QUOTA_EXCEEDED');

      // Assert total active members in Tenant A is exactly 2
      const activeMembers = await OrganizationMembership.count({
        where: { organizationId: orgA.id, status: 'active' }
      });
      expect(activeMembers).toBe(2);
    });
  });

  // =========================================================================
  // 6. POS AUTHENTICATION & EMPLOYEE ROLE RESOLUTION
  // =========================================================================
  describe('POS Authentication & Employee Role Resolution', () => {
    test('Employee login and profile retrieval correctly exposes role and orgRole', async () => {
      const ts = Date.now();
      // 1. Create employee via canonical path
      const createRes = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Cashier',
          lastName: 'POS',
          email: `cashier_pos_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 12000
        })
        .expect(201);

      // 2. Login as the newly created employee
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: `cashier_pos_${ts}@test.com`,
          password: 'Password123!'
        })
        .expect(200);

      expect(loginRes.body.token).toBeDefined();
      expect(loginRes.body.user.role).toBe('employee');
      expect(loginRes.body.user.orgRole).toBe('member');

      // 3. Retrieve profile using the employee token
      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .expect(200);

      expect(profileRes.body.user.role).toBe('employee');
      expect(profileRes.body.user.orgRole).toBe('member');
      expect(profileRes.body.shop).toBeDefined();
      expect(profileRes.body.shop.id).toBe(shopA1.id);
    });

    test('Deactivated employee cannot log in', async () => {
      const ts = Date.now();
      const createRes = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'Inactive',
          lastName: 'Worker',
          email: `inactive_worker_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 12000
        })
        .expect(201);

      // Deactivate employee
      await request(app)
        .put(`/api/employees/${createRes.body.id}`)
        .set('Authorization', tokenA1)
        .send({ status: 'inactive' })
        .expect(200);

      // Login should fail
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: `inactive_worker_${ts}@test.com`,
          password: 'Password123!'
        })
        .expect(401);

      expect(loginRes.body.error).toBeDefined();
    });

    test('Deleted employee has membership and shop access cleaned up', async () => {
      const ts = Date.now();
      const createRes = await request(app)
        .post('/api/employees')
        .set('Authorization', tokenA1)
        .send({
          firstName: 'ToDelete',
          lastName: 'Worker',
          email: `to_delete_${ts}@test.com`,
          position: 'cashier',
          status: 'active',
          password: 'Password123!',
          salary: 12000
        })
        .expect(201);

      const empId = createRes.body.id;

      // Delete employee
      await request(app)
        .delete(`/api/employees/${empId}`)
        .set('Authorization', tokenA1)
        .expect(204);

      // Confirm Employee row deleted
      const emp = await Employee.findByPk(empId);
      expect(emp).toBeNull();

      // Confirm OrganizationMembership cleaned up
      const membership = await OrganizationMembership.findOne({ where: { employeeId: empId } });
      expect(membership).toBeNull();
    });
  });
});
