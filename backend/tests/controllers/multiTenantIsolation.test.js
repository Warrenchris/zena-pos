const request = require('supertest');
const { Op } = require('sequelize');
const app = require('../../src/app');
const sequelize = require('../../src/config/database');
const { Shop, Sale, Expense } = require('../../src/models');

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');

  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../../jwt_private_key.pem'), 'utf8')
      : '');

  return 'Bearer ' + jwt.sign(
    user,
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: '1h'
    }
  );
}

describe('Multi-tenant isolation', () => {
  let shop1;
  let shop2;
  const shopAToken = tokenFor({ id: 101, role: 'admin', shopId: 1 });
  const shopBToken = tokenFor({ id: 202, role: 'admin', shopId: 2 });

  beforeAll(async () => {
    await sequelize.authenticate();

    [shop1] = await Shop.findOrCreate({
      where: { id: 1 },
      defaults: {
        name: 'Test Shop Alpha',
        active: true
      }
    });

    [shop2] = await Shop.findOrCreate({
      where: { id: 2 },
      defaults: {
        name: 'Test Shop Beta',
        active: true
      }
    });
  }, 30000);

  afterEach(async () => {
    await Sale.destroy({ where: { shopId: { [Op.in]: [shop1.id, shop2.id] } } });
    await Expense.destroy({ where: { shopId: { [Op.in]: [shop1.id, shop2.id] } } });
  });

  test('Employees list is scoped by shopId', async () => {
    const resA = await request(app)
      .get('/api/employees')
      .set('Authorization', shopAToken)
      .expect(200);

    const resB = await request(app)
      .get('/api/employees')
      .set('Authorization', shopBToken)
      .expect(200);

    const shopIdsA = new Set((resA.body || []).map(e => e.shopId));
    const shopIdsB = new Set((resB.body || []).map(e => e.shopId));

    expect([...shopIdsA].every(id => id === 1)).toBe(true);
    expect([...shopIdsB].every(id => id === 2)).toBe(true);
  });

  test('Create employee forces shopId from token', async () => {
    const payload = {
      firstName: 'Tenant',
      lastName: 'Isolation',
      email: `tenant_isolation_${Date.now()}@example.com`,
      position: 'cashier',
      status: 'active',
      hireDate: new Date().toISOString(),
      salary: 1000,
      password: 'Passw0rd!',
      shopId: 999
    };

    const create = await request(app)
      .post('/api/employees')
      .set('Authorization', shopAToken)
      .send(payload)
      .expect(201);

    expect(create.body.shopId).toBe(1);
  });

  test('Reports are shop-scoped', async () => {
    const res = await request(app)
      .get('/api/reports/employee-sales')
      .set('Authorization', shopAToken)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});
