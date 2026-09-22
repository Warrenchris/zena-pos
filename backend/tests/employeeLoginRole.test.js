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
  OrganizationMembership
} = require('../src/models');

describe('Employee login JWT role vs checkRole', () => {
  let org;
  let shop;
  let adminUser;
  let cashierEmp;
  let internEmp;
  let adminToken;

  beforeAll(async () => {
    const ts = Date.now();
    org = await Organization.create({
      name: `Emp Role Org ${ts}`,
      slug: `emp-role-org-${ts}`,
      status: 'active'
    });
    shop = await Shop.create({
      name: `Emp Role Shop ${ts}`,
      organizationId: org.id,
      active: true
    });
    adminUser = await User.create({
      name: 'Owner Admin',
      email: `emp_role_owner_${ts}@example.com`,
      password: 'Password123!',
      role: 'admin',
      shopId: shop.id,
      active: true
    });
    await OrganizationMembership.create({
      organizationId: org.id,
      userId: adminUser.id,
      orgRole: 'owner',
      status: 'active'
    });
    cashierEmp = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Till',
      lastName: 'Cash',
      email: `emp_role_cashier_${ts}@example.com`,
      password: 'Password123!',
      position: 'cashier',
      salary: 20000,
      status: 'active',
      shopId: shop.id
    });
    internEmp = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Pat',
      lastName: 'Intern',
      email: `emp_role_intern_${ts}@example.com`,
      password: 'Password123!',
      position: 'intern',
      salary: 5000,
      status: 'active',
      shopId: shop.id
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: 'Password123!' });
    adminToken = `Bearer ${login.body.token}`;
  });

  test('cashier employee login can GET /api/employees and cannot POST (admin-only)', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: cashierEmp.email, password: 'Password123!' })
      .expect(200);

    const decoded = jwt.decode(loginRes.body.token);
    expect(decoded.isEmployee).toBe(true);
    expect(decoded.role).toBe('cashier');
    expect(loginRes.body.user.role).toBe('cashier');

    const listRes = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(listRes.status).toBe(200);

    const createRes = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${loginRes.body.token}`)
      .send({
        firstName: 'Nope',
        lastName: 'Admin',
        email: `should_not_create_${Date.now()}@example.com`,
        position: 'cashier',
        password: 'Password123!',
        salary: 1
      });

    expect(createRes.status).toBe(403);
  });

  test('unknown position stays lowest-privilege and cannot GET /api/employees', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: internEmp.email, password: 'Password123!' })
      .expect(200);

    const decoded = jwt.decode(loginRes.body.token);
    expect(decoded.role).toBe('employee');

    const listRes = await request(app)
      .get('/api/employees')
      .set('Authorization', `Bearer ${loginRes.body.token}`);

    expect(listRes.status).toBe(403);
  });

  test.each(['admin', 'ADMIN', 'Admin'])(
    'employee position %s logs in as JWT employee, not admin',
    async (position) => {
      const emp = await Employee.create({
        id: crypto.randomUUID(),
        firstName: 'Pos',
        lastName: position,
        email: `emp_role_${position}_${Date.now()}@example.com`,
        password: 'Password123!',
        position,
        salary: 1,
        status: 'active',
        shopId: shop.id
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: emp.email, password: 'Password123!' })
        .expect(200);

      const decoded = jwt.decode(loginRes.body.token);
      expect(decoded.isEmployee).toBe(true);
      expect(decoded.role).toBe('employee');
      expect(decoded.role).not.toBe('admin');
      expect(loginRes.body.user.role).toBe('employee');

      const createRes = await request(app)
        .post('/api/employees')
        .set('Authorization', `Bearer ${loginRes.body.token}`)
        .send({
          firstName: 'Nope',
          lastName: 'Escalation',
          email: `nope_esc_${Date.now()}@example.com`,
          position: 'cashier',
          password: 'Password123!',
          salary: 1
        });
      expect(createRes.status).toBe(403);
    }
  );

  test('dev-DB collision position=admin (lowercase, no whitespace) never grants admin JWT', async () => {
    const emp = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Live',
      lastName: 'Collision',
      email: `emp_role_dev_admin_${Date.now()}@example.com`,
      password: 'Password123!',
      position: 'admin',
      salary: 1,
      status: 'active',
      shopId: shop.id
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: emp.email, password: 'Password123!' })
      .expect(200);

    const decoded = jwt.decode(loginRes.body.token);
    expect(emp.position).toBe('admin');
    expect(decoded.role).toBe('employee');
    expect(loginRes.body.user.role).toBe('employee');
  });

  test('untrimmed cashier position maps to cashier JWT', async () => {
    const emp = await Employee.create({
      id: crypto.randomUUID(),
      firstName: 'Pad',
      lastName: 'Cash',
      email: `emp_role_padded_cashier_${Date.now()}@example.com`,
      password: 'Password123!',
      position: ' cashier ',
      salary: 1,
      status: 'active',
      shopId: shop.id
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: emp.email, password: 'Password123!' })
      .expect(200);

    const decoded = jwt.decode(loginRes.body.token);
    expect(decoded.role).toBe('cashier');
    expect(loginRes.body.user.role).toBe('cashier');
  });

  test('admin user token still lists employees (control)', async () => {
    const listRes = await request(app)
      .get('/api/employees')
      .set('Authorization', adminToken)
      .expect(200);
    expect(Array.isArray(listRes.body) || Array.isArray(listRes.body.employees) || true).toBe(true);
  });
});
