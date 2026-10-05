'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const {
  sequelize,
  User,
  Employee,
  Shop,
  Organization,
  OrganizationMembership,
  ShopAccess,
  Subscription,
  Plan
} = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');
const staffCreationService = require('../src/services/staffCreationService');

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

describe('Gate 3C: Employees, Staff Administration & Branch Access Delegation Authorization', () => {
  let orgA, orgB;
  let shopA1, shopA2, shopA3, shopB1;
  let ownerUserA, orgAdminEmployeeA1, managerEmployeeA1, cashierEmployeeA1, cashierStaffA1, employeeA2;
  let ownerUserB, employeeB1;
  let cashierMemA1, cashierStaffMemA1, employeeMemA2, employeeMemB1;
  let defaultPlan;

  beforeAll(async () => {
    await sequelize.authenticate();

    const ts = Date.now() + '_' + Math.floor(Math.random() * 100000);

    defaultPlan = await Plan.create({
      name: `Enterprise Plan ${ts}`,
      code: `enterprise_staff_${ts}`,
      priceMonthly: 9999,
      currency: 'KES',
      maxShops: 100,
      maxUsers: 1000,
      features: {},
      isActive: true
    });

    // 1. Setup Organizations
    orgA = await Organization.create({
      name: `Org A Staff ${ts}`,
      slug: `org-a-staff-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    orgB = await Organization.create({
      name: `Org B Staff ${ts}`,
      slug: `org-b-staff-${ts}`,
      status: 'active',
      currency: 'KES'
    });

    // 2. Setup Subscriptions
    await Subscription.create({
      organizationId: orgA.id,
      planId: defaultPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    await Subscription.create({
      organizationId: orgB.id,
      planId: defaultPlan.id,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2099-12-31 23:59:59'),
      cancelAtPeriodEnd: false
    });

    // 3. Setup Shops
    shopA1 = await Shop.create({
      name: `Shop A1 Staff ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA2 = await Shop.create({
      name: `Shop A2 Staff ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopA3 = await Shop.create({
      name: `Shop A3 Staff ${ts}`,
      organizationId: orgA.id,
      active: true
    });

    shopB1 = await Shop.create({
      name: `Shop B1 Staff ${ts}`,
      organizationId: orgB.id,
      active: true
    });

    // 4. Setup Users & Employees for Org A

    // Owner of Org A (User.role = 'admin', OrganizationMembership.orgRole = 'owner')
    ownerUserA = await User.create({
      name: `Owner A ${ts}`,
      email: `owner.a.staff.${ts}@example.com`,
      password: 'hashedpassword',
      role: 'admin',
      shopId: shopA1.id,
      active: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgA.id,
      userId: ownerUserA.id,
      orgRole: 'owner',
      status: 'active'
    });

    // Delegated Org Admin (Employee, orgRole = 'admin', ShopAccess to shopA1)
    orgAdminEmployeeA1 = await Employee.create({
      firstName: 'OrgAdmin',
      lastName: `A1 ${ts}`,
      email: `orgadmin.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 60000,
      position: 'Admin',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const orgAdminMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: orgAdminEmployeeA1.id,
      orgRole: 'admin',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: orgAdminMemA1.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Branch Manager (Employee, position = 'Manager', orgRole = 'member', ShopAccess to shopA1)
    managerEmployeeA1 = await Employee.create({
      firstName: 'Manager',
      lastName: `A1 ${ts}`,
      email: `mgr.a1.staff.${ts}@example.com`,
      password: 'Password123!',
      salary: 45000,
      position: 'Manager',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    const mgrMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: managerEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: mgrMemA1.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Cashier in Shop A1 (Employee, position = 'Cashier', orgRole = 'member')
    cashierEmployeeA1 = await Employee.create({
      firstName: 'Cashier',
      lastName: `A1 ${ts}`,
      email: `cashier.a1.staff.${ts}@example.com`,
      password: 'Password123!',
      salary: 25000,
      position: 'Cashier',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    cashierMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierEmployeeA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierMemA1.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Dedicated unmutated Cashier in Shop A1
    cashierStaffA1 = await Employee.create({
      firstName: 'CashierStaff',
      lastName: `A1 ${ts}`,
      email: `cashierstaff.a1.${ts}@example.com`,
      password: 'Password123!',
      salary: 25000,
      position: 'Cashier',
      status: 'active',
      shopId: shopA1.id,
      authzVersion: 1
    });

    cashierStaffMemA1 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: cashierStaffA1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: cashierStaffMemA1.id,
      shopId: shopA1.id,
      isDefault: true
    });

    // Employee in Shop A2 (position = 'Cashier', assigned only to shopA2)
    employeeA2 = await Employee.create({
      firstName: 'Staff',
      lastName: `A2 ${ts}`,
      email: `staff.a2.${ts}@example.com`,
      password: 'Password123!',
      salary: 28000,
      position: 'Cashier',
      status: 'active',
      shopId: shopA2.id,
      authzVersion: 1
    });

    employeeMemA2 = await OrganizationMembership.create({
      organizationId: orgA.id,
      employeeId: employeeA2.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: employeeMemA2.id,
      shopId: shopA2.id,
      isDefault: true
    });

    // 5. Setup Org B Users & Employees

    ownerUserB = await User.create({
      name: `Owner B ${ts}`,
      email: `owner.b.staff.${ts}@example.com`,
      password: 'hashedpassword',
      role: 'admin',
      shopId: shopB1.id,
      active: true,
      emailVerifiedAt: new Date(),
      authzVersion: 1
    });

    await OrganizationMembership.create({
      organizationId: orgB.id,
      userId: ownerUserB.id,
      orgRole: 'owner',
      status: 'active'
    });

    employeeB1 = await Employee.create({
      firstName: 'Employee',
      lastName: `B1 ${ts}`,
      email: `emp.b1.${ts}@example.com`,
      password: 'Password123!',
      salary: 30000,
      position: 'Cashier',
      status: 'active',
      shopId: shopB1.id,
      authzVersion: 1
    });

    employeeMemB1 = await OrganizationMembership.create({
      organizationId: orgB.id,
      employeeId: employeeB1.id,
      orgRole: 'member',
      status: 'active'
    });

    await ShopAccess.create({
      membershipId: employeeMemB1.id,
      shopId: shopB1.id,
      isDefault: true
    });
  });

  // ==========================================
  // 1. Authentication (Scenarios 1-4)
  // ==========================================

  test('Scenario 1: Unauthenticated employee listing denied with HTTP 401', async () => {
    const res = await request(app).get('/api/employees');
    expect(res.status).toBe(401);
  });

  test('Scenario 2: Unauthenticated employee creation denied with HTTP 401', async () => {
    const res = await request(app)
      .post('/api/employees')
      .send({ firstName: 'Test', lastName: 'Staff', email: 'test@example.com' });
    expect(res.status).toBe(401);
  });

  test('Scenario 3: Unauthenticated role update denied with HTTP 401', async () => {
    const res = await request(app)
      .put(`/api/users/${cashierEmployeeA1.id}/role`)
      .send({ role: 'manager' });
    expect(res.status).toBe(401);
  });

  test('Scenario 4: Unauthenticated ShopAccess mutation denied with HTTP 401', async () => {
    const res = await request(app)
      .post(`/api/shops/${shopA1.id}/access`)
      .send({ membershipId: cashierMemA1.id });
    expect(res.status).toBe(401);
  });

  // ==========================================
  // 2. Tenant Isolation (Scenarios 5-9)
  // ==========================================

  test('Scenario 5: Employee from Tenant A cannot be read by Tenant B (HTTP 404 anti-oracle)', async () => {
    const tokenB = tokenFor({
      id: ownerUserB.id,
      organizationId: orgB.id,
      shopId: shopB1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', tokenB);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Resource not found|Employee not found/i);
  });

  test('Scenario 6: Employee from Tenant A cannot be modified by Tenant B (HTTP 404 anti-oracle)', async () => {
    const tokenB = tokenFor({
      id: ownerUserB.id,
      organizationId: orgB.id,
      shopId: shopB1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', tokenB)
      .send({ salary: 999999 });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Employee not found/i);
  });

  test('Scenario 7: Tenant A cannot grant branch access to Tenant B employee (HTTP 404 anti-oracle)', async () => {
    const tokenA = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/shops/${shopA1.id}/access`)
      .set('Authorization', tokenA)
      .send({ membershipId: employeeMemB1.id });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Membership not found/i);
  });

  test('Scenario 8: Tenant A cannot grant branch access on Tenant B shop (HTTP 404 anti-oracle)', async () => {
    const tokenA = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/shops/${shopB1.id}/access`)
      .set('Authorization', tokenA)
      .send({ membershipId: cashierMemA1.id });

    expect(res.status).toBe(404);
  });

  test('Scenario 9: Cross-tenant ShopAccess lookup is anti-oracle protected (HTTP 404)', async () => {
    const tokenB = tokenFor({
      id: ownerUserB.id,
      organizationId: orgB.id,
      shopId: shopB1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/shops/${shopA1.id}/access`)
      .set('Authorization', tokenB);

    expect(res.status).toBe(404);
  });

  // ==========================================
  // 3. Role Escalation & Self-Promotion (Scenarios 10-14)
  // ==========================================

  test('Scenario 10: Cashier cannot promote self or modify own position via PUT /api/employees/:id (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', token)
      .send({ position: 'Manager' });

    expect(res.status).toBe(403);
  });

  test('Scenario 11: Cashier cannot promote another employee via PUT /api/employees/:id (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${employeeA2.id}`)
      .set('Authorization', token)
      .send({ position: 'Manager' });

    expect(res.status).toBe(403);
  });

  test('Scenario 12: Manager cannot manufacture owner access (HTTP 403)', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', token)
      .send({ orgRole: 'owner' });

    expect(res.status).toBe(403);
  });

  test('Scenario 13: Member / unprivileged caller cannot grant admin/org_admin access (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierStaffA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/users/${employeeA2.id}/role`)
      .set('Authorization', token)
      .send({ role: 'admin', orgRole: 'admin' });

    expect(res.status).toBe(403);
  });

  test('Scenario 14: Employee cannot modify their own authorization role via PUT /api/users/:id/role (HTTP 403)', async () => {
    const token = tokenFor({
      id: orgAdminEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'org_admin',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/users/${orgAdminEmployeeA1.id}/role`)
      .set('Authorization', token)
      .send({ role: 'admin', orgRole: 'owner' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot modify their own/i);
  });

  // ==========================================
  // 4. Branch Scope Isolation (Scenarios 15-18)
  // ==========================================

  test('Scenario 15: Manager in Shop A1 cannot lookup employee in Shop A2 (HTTP 404 anti-oracle)', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    // employeeA2 is scoped strictly to shopA2
    const res = await request(app)
      .get(`/api/employees/${employeeA2.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(404);
  });

  test('Scenario 16: Manager in Shop A1 cannot mutate employee in Shop A2 (HTTP 403 / 404)', async () => {
    const token = tokenFor({
      id: managerEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${employeeA2.id}`)
      .set('Authorization', token)
      .send({ salary: 35000 });

    expect([403, 404]).toContain(res.status);
  });

  test('Scenario 17: Employee cannot reassign another employee to unauthorized branch (HTTP 403 / 404)', async () => {
    // orgAdminEmployeeA1 has access only to shopA1
    const token = tokenFor({
      id: orgAdminEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'org_admin',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', token)
      .send({ shopId: shopA2.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/do not have access to the target branch/i);
  });

  test('Scenario 18: Employee cannot grant ShopAccess to unauthorized branch (HTTP 403 / 404)', async () => {
    // orgAdminEmployeeA1 has access only to shopA1, attempts grant on shopA2
    const token = tokenFor({
      id: orgAdminEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'org_admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/shops/${shopA2.id}/access`)
      .set('Authorization', token)
      .send({ membershipId: cashierMemA1.id });

    expect([403, 404]).toContain(res.status);
  });

  // ==========================================
  // 5. ShopAccess Delegation (Scenarios 19-24)
  // ==========================================

  test('Scenario 19: Authorized owner can grant branch access (HTTP 201)', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/shops/${shopA2.id}/access`)
      .set('Authorization', token)
      .send({ membershipId: cashierMemA1.id, isDefault: false });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Branch access granted/i);

    // Verify ShopAccess row was created
    const sa = await ShopAccess.findOne({
      where: { membershipId: cashierMemA1.id, shopId: shopA2.id }
    });
    expect(sa).not.toBeNull();
  });

  test('Scenario 20: Unauthorized employee cannot grant branch access (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierStaffA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/shops/${shopA1.id}/access`)
      .set('Authorization', token)
      .send({ membershipId: employeeMemA2.id });

    expect(res.status).toBe(403);
  });

  test('Scenario 21: Authorized owner can revoke branch access (HTTP 200)', async () => {
    const token = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/shops/${shopA2.id}/access/${cashierMemA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/Shop access revoked/i);

    const sa = await ShopAccess.findOne({
      where: { membershipId: cashierMemA1.id, shopId: shopA2.id }
    });
    expect(sa).toBeNull();
  });

  test('Scenario 22: Unauthorized employee cannot revoke branch access (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierStaffA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/shops/${shopA1.id}/access/${employeeMemA2.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
  });

  test('Scenario 23: Access-list endpoint denies unauthorized callers (cashier) (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierStaffA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/shops/${shopA1.id}/access`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  test('Scenario 24: Cross-tenant access-list request does not leak employee data (HTTP 404)', async () => {
    const tokenB = tokenFor({
      id: ownerUserB.id,
      organizationId: orgB.id,
      shopId: shopB1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .get(`/api/shops/${shopA1.id}/access`)
      .set('Authorization', tokenB);

    expect(res.status).toBe(404);
    expect(res.body.accesses).toBeUndefined();
  });

  // ==========================================
  // 6. Authorization Epoch (Scenarios 25-34)
  // ==========================================

  test('Scenario 25: Employee role change increments authzVersion and invalidates stale session', async () => {
    const currentEmp = await Employee.findByPk(cashierEmployeeA1.id);
    const initialEpoch = Number(currentEmp.authzVersion || 1);

    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    // Update employee position from Cashier to Manager
    const res = await request(app)
      .put(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', tokenOwner)
      .send({ position: 'Manager' });

    expect(res.status).toBe(200);

    const updatedEmp = await Employee.findByPk(cashierEmployeeA1.id);
    expect(Number(updatedEmp.authzVersion)).toBe(initialEpoch + 1);

    // Old token with initialEpoch should now be rejected as stale
    const staleCashierToken = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: initialEpoch
    });

    const staleRes = await request(app)
      .get(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', staleCashierToken);

    expect(staleRes.status).toBe(401);
    expect(staleRes.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  test('Scenario 26: OrgRole change via updateRole invalidates stale authorization', async () => {
    const currentEmp = await Employee.findByPk(cashierEmployeeA1.id);
    const currentEpoch = Number(currentEmp.authzVersion);

    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/users/${cashierEmployeeA1.id}/role`)
      .set('Authorization', tokenOwner)
      .send({ orgRole: 'admin', role: 'admin' });

    expect(res.status).toBe(200);

    const updatedEmp = await Employee.findByPk(cashierEmployeeA1.id);
    expect(Number(updatedEmp.authzVersion)).toBe(currentEpoch + 1);

    // Stale token rejected
    const staleToken = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'manager',
      authzVersion: currentEpoch
    });

    const staleRes = await request(app)
      .get(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', staleToken);

    expect(staleRes.status).toBe(401);
  });

  test('Scenario 27: Employee deactivation invalidates stale authorization', async () => {
    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${employeeA2.id}`)
      .set('Authorization', tokenOwner)
      .send({ status: 'inactive', salary: 28000 });

    expect(res.status).toBe(200);

    const deactivatedToken = tokenFor({
      id: employeeA2.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA2.id,
      role: 'cashier',
      authzVersion: 999
    });

    try {
      const checkRes = await request(app)
        .get(`/api/employees/${employeeA2.id}`)
        .set('Authorization', deactivatedToken);

      expect(checkRes.status).toBe(401);
      expect(checkRes.body.error).toMatch(/Account is deactivated or terminated/i);
    } finally {
      // Reactivate for further tests
      await request(app)
        .put(`/api/employees/${employeeA2.id}`)
        .set('Authorization', tokenOwner)
        .send({ status: 'active', salary: 28000 });
    }
  });

  test('Scenario 28: Branch assignment change invalidates stale authorization epoch', async () => {
    const currentEmp = await Employee.findByPk(employeeA2.id);
    const beforeEpoch = Number(currentEmp.authzVersion);

    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    // Owner reassigns employeeA2 to shopA1
    const res = await request(app)
      .put(`/api/employees/${employeeA2.id}`)
      .set('Authorization', tokenOwner)
      .send({ shopId: shopA1.id, salary: 28000 });

    expect(res.status).toBe(200);

    const afterEmp = await Employee.findByPk(employeeA2.id);
    expect(Number(afterEmp.authzVersion)).toBe(beforeEpoch + 1);
    expect(Number(afterEmp.shopId)).toBe(shopA1.id);
  });

  test('Scenario 29: ShopAccess grant invalidates target actor authorization epoch', async () => {
    const currentEmp = await Employee.findByPk(employeeA2.id);
    const beforeEpoch = Number(currentEmp.authzVersion);

    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post(`/api/shops/${shopA3.id}/access`)
      .set('Authorization', tokenOwner)
      .send({ membershipId: employeeMemA2.id });

    expect(res.status).toBe(201);

    const afterEmp = await Employee.findByPk(employeeA2.id);
    expect(Number(afterEmp.authzVersion)).toBe(beforeEpoch + 1);
  });

  test('Scenario 30: ShopAccess revoke invalidates target actor authorization epoch', async () => {
    const currentEmp = await Employee.findByPk(employeeA2.id);
    const beforeEpoch = Number(currentEmp.authzVersion);

    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/shops/${shopA3.id}/access/${employeeMemA2.id}`)
      .set('Authorization', tokenOwner);

    expect(res.status).toBe(200);

    const afterEmp = await Employee.findByPk(employeeA2.id);
    expect(Number(afterEmp.authzVersion)).toBe(beforeEpoch + 1);
  });

  test('Scenario 31: Membership suspension invalidates authorization', async () => {
    const targetMem = await OrganizationMembership.findByPk(cashierMemA1.id);
    targetMem.status = 'suspended';
    await targetMem.save();

    const emp = await Employee.findByPk(cashierEmployeeA1.id);
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: Number(emp.authzVersion)
    });

    const res = await request(app)
      .get(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MEMBERSHIP_SUSPENDED');

    // Restore membership
    targetMem.status = 'active';
    await targetMem.save();
  });

  test('Scenario 32: Rollback during mutation does not advance epoch', async () => {
    const currentEmp = await Employee.findByPk(employeeA2.id);
    const epochBefore = Number(currentEmp.authzVersion);

    try {
      await sequelize.transaction(async (t) => {
        await tokenRevocationService.incrementAuthzVersion(employeeA2.id, true, t);
        throw new Error('Intentional transaction abort');
      });
    } catch (_) {
      // expected error
    }

    const afterEmp = await Employee.findByPk(employeeA2.id);
    expect(Number(afterEmp.authzVersion)).toBe(epochBefore);
  });

  test('Scenario 33: Stale Redis cache cannot bypass newer DB epoch', async () => {
    const emp = await Employee.findByPk(employeeA2.id);
    const trueDbEpoch = Number(emp.authzVersion);

    // Stale Redis cache set to previous epoch
    await tokenRevocationService.setAuthzVersion(employeeA2.id, true, trueDbEpoch - 1);

    // Client presents token matching stale cache
    const staleToken = tokenFor({
      id: employeeA2.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: trueDbEpoch - 1
    });

    const res = await request(app)
      .get(`/api/employees/${employeeA2.id}`)
      .set('Authorization', staleToken);

    // Pipeline must detect mismatch against DB and reject
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTHZ_VERSION_STALE');
  });

  test('Scenario 34: Concurrent authorization mutations preserve increments atomically', async () => {
    const emp = await Employee.findByPk(employeeA2.id);
    const startEpoch = Number(emp.authzVersion);

    // Run 3 concurrent mutations
    await Promise.all([
      sequelize.transaction(async (t) => tokenRevocationService.incrementAuthzVersion(employeeA2.id, true, t)),
      sequelize.transaction(async (t) => tokenRevocationService.incrementAuthzVersion(employeeA2.id, true, t)),
      sequelize.transaction(async (t) => tokenRevocationService.incrementAuthzVersion(employeeA2.id, true, t))
    ]);

    const endEmp = await Employee.findByPk(employeeA2.id);
    expect(Number(endEmp.authzVersion)).toBe(startEpoch + 3);
  });

  // ==========================================
  // 7. Owner Protection (Scenarios 35-37)
  // ==========================================

  test('Scenario 35: Ordinary admin cannot manufacture owner via POST /api/employees (HTTP 403)', async () => {
    const tokenAdmin = tokenFor({
      id: orgAdminEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'org_admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', tokenAdmin)
      .send({
        firstName: 'Hacker',
        lastName: 'Owner',
        email: `hacker.owner.${Date.now()}@example.com`,
        password: 'Password123!',
        position: 'Admin',
        role: 'admin',
        orgRole: 'owner',
        salary: 50000,
        shopId: shopA1.id
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only organization owners can grant/i);
  });

  test('Scenario 36: Employee cannot self-promote to owner (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierStaffA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .put(`/api/employees/${cashierStaffA1.id}`)
      .set('Authorization', token)
      .send({ orgRole: 'owner', position: 'admin' });

    expect(res.status).toBe(403);
  });

  test('Scenario 37: Ordinary staff endpoint cannot accidentally delete organization owner (HTTP 403)', async () => {
    const tokenAdmin = tokenFor({
      id: orgAdminEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'org_admin',
      authzVersion: 1
    });

    const res = await request(app)
      .delete(`/api/employees/${ownerUserA.id}`)
      .set('Authorization', tokenAdmin);

    expect([403, 404]).toContain(res.status);
  });

  // ==========================================
  // 8. Canonical Staff Creation (Scenarios 38-40)
  // ==========================================

  test('Scenario 38: Employee creation uses canonical staffCreationService with quota and membership', async () => {
    const ts = Date.now();
    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', tokenOwner)
      .send({
        firstName: 'Canonical',
        lastName: `Staff ${ts}`,
        email: `canonical.staff.${ts}@example.com`,
        password: 'Password123!',
        position: 'Cashier',
        salary: 32000,
        shopId: shopA1.id
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(`canonical.staff.${ts}@example.com`);

    // Verify OrganizationMembership and ShopAccess were created
    const mem = await OrganizationMembership.findOne({
      where: { employeeId: res.body.id, organizationId: orgA.id }
    });
    expect(mem).not.toBeNull();
    expect(mem.orgRole).toBe('member');

    const sa = await ShopAccess.findOne({
      where: { membershipId: mem.id, shopId: shopA1.id }
    });
    expect(sa).not.toBeNull();
  });

  test('Scenario 39: Legacy user creation via POST /api/users uses canonical service', async () => {
    const ts = Date.now();
    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', tokenOwner)
      .send({
        name: `Legacy User ${ts}`,
        email: `legacy.user.${ts}@example.com`,
        password: 'Password123!',
        role: 'cashier',
        shopId: shopA1.id
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(`legacy.user.${ts}@example.com`);

    // Verify membership was initialized
    const mem = await OrganizationMembership.findOne({
      where: { employeeId: res.body.id, organizationId: orgA.id }
    });
    expect(mem).not.toBeNull();
  });

  test('Scenario 40: Duplicate employee creation with same email is rejected with HTTP 400 DUPLICATE_EMAIL', async () => {
    const tokenOwner = tokenFor({
      id: ownerUserA.id,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'admin',
      authzVersion: 1
    });

    const uniqueEmail = `duplicate.email.${Date.now()}_${Math.floor(Math.random() * 10000)}@example.com`;

    const res1 = await request(app)
      .post('/api/employees')
      .set('Authorization', tokenOwner)
      .send({
        firstName: 'Duplicate',
        lastName: 'One',
        email: uniqueEmail,
        password: 'Password123!',
        position: 'Cashier',
        salary: 25000,
        shopId: shopA1.id
      });

    expect(res1.status).toBe(201);

    // Exact email match attempt
    const res2 = await request(app)
      .post('/api/employees')
      .set('Authorization', tokenOwner)
      .send({
        firstName: 'Duplicate',
        lastName: 'Two',
        email: uniqueEmail,
        password: 'Password123!',
        position: 'Cashier',
        salary: 25000,
        shopId: shopA1.id
      });

    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/Email already exists/i);
  });

  // ==========================================
  // 9. Employee Listing & Self-Lookup (Scenarios 41-42)
  // ==========================================

  test('Scenario 41: Cashier with view access can view their own profile via GET /api/employees/:id', async () => {
    const emp = await Employee.findByPk(cashierEmployeeA1.id);
    const token = tokenFor({
      id: cashierEmployeeA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: Number(emp.authzVersion)
    });

    const res = await request(app)
      .get(`/api/employees/${cashierEmployeeA1.id}`)
      .set('Authorization', token);

    expect(res.status).toBe(200);
    expect(res.body.employee.id).toBe(cashierEmployeeA1.id);
  });

  test('Scenario 42: Cashier cannot list all employees via GET /api/employees (HTTP 403)', async () => {
    const token = tokenFor({
      id: cashierStaffA1.id,
      isEmployee: true,
      organizationId: orgA.id,
      shopId: shopA1.id,
      role: 'cashier',
      authzVersion: 1
    });

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', token);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });
});
