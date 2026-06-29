const request = require('supertest');
const app = require('../../src/app');
const { Sale, Product, SaleItem, Shop } = require('../../src/models');
const sequelize = require('../../src/config/database');

describe('Dashboard Controller', () => {
  let token;

  beforeAll(async () => {
    await sequelize.authenticate();

    const jwt = require('jsonwebtoken');
    const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    token = jwt.sign(
      { id: 101, role: 'admin', shopId: 1 },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: '1h'
      }
    );
  });

  beforeEach(async () => {
    await SaleItem.destroy({ where: { shopId: 1 } });
    await Sale.destroy({ where: { shopId: 1 } });
    await Product.destroy({ where: { shopId: 1 } });

    await Shop.findOrCreate({
      where: { id: 1 },
      defaults: { name: 'Test Shop', active: true }
    });
  }, 30000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/dashboard/stats', () => {
    it('should return dashboard statistics successfully', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalIncome');
      expect(response.body).toHaveProperty('totalSales');
      expect(response.body).toHaveProperty('totalCustomers');
    });

    it('should accept custom valid start and end dates', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats?startDate=2026-06-01&endDate=2026-06-20')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should return 400 Bad Request if invalid startDate is provided', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats?startDate=invalid-date')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error || response.body.details).toContain('Invalid date');
    });

    it('should return 400 Bad Request if invalid endDate is provided', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats?endDate=not-a-date')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error || response.body.details).toContain('Invalid date');
    });
  });
});
