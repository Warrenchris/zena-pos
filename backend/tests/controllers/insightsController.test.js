const request = require('supertest');
const app = require('../../src/app');
const { Sale, Product, Expense } = require('../../src/models');
const { sequelize } = require('../../src/config/database');

describe('Insights Controller', () => {
  let token;

  beforeAll(async () => {
    // Create test user and get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    token = response.body.token;
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });
  });

  describe('GET /api/insights', () => {
    it('should return insights with trends, recommendations, and alerts', async () => {
      // Create test data
      await Product.create({
        name: 'Test Product',
        sku: 'TEST123',
        price: 100,
        stockQuantity: 5,
        reorderPoint: 10
      });

      await Sale.create({
        totalAmount: 500,
        customerId: 1,
        items: [{
          productId: 1,
          quantity: 2,
          price: 100
        }]
      });

      await Expense.create({
        category: 'Supplies',
        amount: 6000,
        description: 'Test expense'
      });

      const response = await request(app)
        .get('/api/insights')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trends');
      expect(response.body).toHaveProperty('recommendations');
      expect(response.body).toHaveProperty('alerts');

      // Check recommendations
      expect(response.body.recommendations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'INVENTORY',
            priority: 'HIGH'
          })
        ])
      );

      // Check alerts
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
      // Mock a database error
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