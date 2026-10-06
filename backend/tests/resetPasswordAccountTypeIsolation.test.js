'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { User, Employee, Shop, Organization } = require('../src/models');
const tokenRevocationService = require('../src/services/tokenRevocationService');

const privateKey = process.env.JWT_PRIVATE_KEY
  ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
  : fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8');

function resetTokenFor(payload) {
  return jwt.sign({ jti: crypto.randomUUID(), purpose: 'password_reset', ...payload }, privateKey, {
    algorithm: 'RS256',
    expiresIn: '15m'
  });
}

describe('password reset account type isolation', () => {
  let user;
  let employee;
  let employeeToken;

  beforeAll(async () => sequelize.authenticate());

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const organization = await Organization.create({
      name: `Reset isolation ${suffix}`,
      slug: `reset-isolation-${suffix}`,
      status: 'active',
      currency: 'KES'
    });
    const shop = await Shop.create({
      name: `Reset isolation ${suffix}`,
      organizationId: organization.id,
      active: true
    });
    user = await User.create({
      name: `Reset User ${suffix}`,
      email: `reset-user-${suffix}@example.com`,
      password: 'OriginalPassword123!',
      role: 'admin',
      shopId: shop.id
    });
    employee = await Employee.create({
      firstName: 'Reset',
      lastName: `Employee ${suffix}`,
      email: `reset-employee-${suffix}@example.com`,
      password: 'OriginalPassword123!',
      position: 'cashier',
      salary: 30000,
      status: 'active',
      shopId: shop.id
    });
    employeeToken = resetTokenFor({ id: employee.id, isEmployee: true });
  });

  afterEach(async () => {
    if (user) await tokenRevocationService.clearUserTokenCutoff(user.id, false);
    if (employee) await tokenRevocationService.clearUserTokenCutoff(employee.id, true);
  });

  test('a user reset token cannot fall back to an employee account', async () => {
    const response = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetTokenFor({ id: employee.id, isEmployee: false }), password: 'ChangedPassword123!' })
      .expect(400);

    expect(response.body.error).toMatch(/invalid token/i);
    await employee.reload();
    expect(await employee.validatePassword('OriginalPassword123!')).toBe(true);
  });

  test('an employee reset token still resets the employee account', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: employeeToken, password: 'ChangedPassword123!' })
      .expect(200);

    await employee.reload();
    expect(await employee.validatePassword('ChangedPassword123!')).toBe(true);
    await user.reload();
    expect(await user.validatePassword('OriginalPassword123!')).toBe(true);
  });

  test('a user reset token still resets the user account', async () => {
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: resetTokenFor({ id: user.id, isEmployee: false }), password: 'ChangedPassword123!' })
      .expect(200);

    await user.reload();
    expect(await user.validatePassword('ChangedPassword123!')).toBe(true);
    await employee.reload();
    expect(await employee.validatePassword('OriginalPassword123!')).toBe(true);
  });
});
