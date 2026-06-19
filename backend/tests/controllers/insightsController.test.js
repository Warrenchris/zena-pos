const request = require('supertest');
const app = require('../../src/app');
const { Sale, Product, Expense, SaleItem, Shop } = require('../../src/models');
const sequelize = require('../../src/config/database');

describe('Insights Controller', () => {
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
    await Expense.destroy({ where: { shopId: 1 } });
    await Product.destroy({ where: { shopId: 1 } });

    await Shop.findOrCreate({
      where: { id: 1 },
      defaults: { name: 'Test Shop', active: true }
    });
  }, 30000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/insights', () => {
    it('should return insights with trends, recommendations, and alerts', async () => {
      await Product.create({
        name: 'Test Product',
        sku: 'TEST123',
        price: 100,
        cost: 60,
        stockQuantity: 5,
        reorderPoint: 10,
        shopId: 1
      });

      await Sale.create({
        total: 500,
        paymentAmount: 500,
        shopId: 1,
        customerId: null
      });

      await Expense.create({
        category: 'other',
        amount: 6000,
        description: 'Test expense',
        paymentMethod: 'cash',
        shopId: 1
      });

      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trends');
      expect(response.body).toHaveProperty('recommendations');
      expect(response.body).toHaveProperty('alerts');

      expect(response.body.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'INVENTORY',
            priority: 'HIGH'
          })
        ])
      );

      expect(response.body.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'INVENTORY',
            severity: 'HIGH'
          })
        ])
      );
    });

    it('should handle errors gracefully', async () => {
      jest.spyOn(Sale, 'findAll').mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/insights');

      expect(response.status).toBe(401);
    });
  });
});
