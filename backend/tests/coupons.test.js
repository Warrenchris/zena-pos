const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const { Coupon, DiscountRule, Shop } = require('../src/models');

function tokenFor(user) {
  const jwt = require('jsonwebtoken');
  const fs = require('fs');
  const path = require('path');

  const privateKey = process.env.JWT_PRIVATE_KEY
    ? process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n')
    : (fs.existsSync(path.join(__dirname, '../jwt_private_key.pem'))
      ? fs.readFileSync(path.join(__dirname, '../jwt_private_key.pem'), 'utf8')
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

describe('Coupons and Discounts API Integration Tests', () => {
  const adminToken = tokenFor({ id: 101, role: 'admin', shopId: 1 });
  let createdCouponId;
  let createdDiscountId;

  beforeAll(async () => {
    // Ensure Shop 1 exists
    await Shop.findOrCreate({
      where: { id: 1 },
      defaults: { name: 'Test Shop 1' }
    });
  });

  describe('Coupons Endpoints', () => {
    it('POST /api/coupons — should create a new coupon code', async () => {
      const res = await request(app)
        .post('/api/coupons')
        .set('Authorization', adminToken)
        .send({
          code: 'TESTPROMO20',
          title: '20% Off Test Promo',
          discountType: 'percentage',
          discountValue: 20,
          minSpend: 500,
          usageLimit: 50,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('TESTPROMO20');
      expect(parseFloat(res.body.discountValue)).toBe(20);
      createdCouponId = res.body.id;
    });

    it('GET /api/coupons — should retrieve list of coupons', async () => {
      const res = await request(app)
        .get('/api/coupons')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(c => c.code === 'TESTPROMO20')).toBe(true);
    });

    it('POST /api/coupons/validate — should validate valid coupon code', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', adminToken)
        .send({
          code: 'TESTPROMO20',
          cartAmount: 1000
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.coupon.computedDiscount).toBe(200); // 20% of 1000
    });

    it('POST /api/coupons/validate — should reject code if cart amount is below minSpend', async () => {
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', adminToken)
        .send({
          code: 'TESTPROMO20',
          cartAmount: 300 // minSpend is 500
        });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('Minimum spend');
    });

    it('PUT /api/coupons/:id — should update coupon attributes', async () => {
      const res = await request(app)
        .put(`/api/coupons/${createdCouponId}`)
        .set('Authorization', adminToken)
        .send({
          discountValue: 25,
          title: '25% Off Test Promo Updated'
        });

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.discountValue)).toBe(25);
      expect(res.body.title).toBe('25% Off Test Promo Updated');
    });

    it('DELETE /api/coupons/:id — should delete coupon code', async () => {
      const res = await request(app)
        .delete(`/api/coupons/${createdCouponId}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });

  describe('Discount Rules Endpoints', () => {
    it('POST /api/discounts — should create a new discount rule', async () => {
      const res = await request(app)
        .post('/api/discounts')
        .set('Authorization', adminToken)
        .send({
          name: 'Flash Weekend Clearance',
          ruleType: 'percentage',
          discountValue: 15,
          scope: 'storewide',
          targetName: 'All Products',
          minAmount: 1000,
          isActive: true
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Flash Weekend Clearance');
      expect(parseFloat(res.body.discountValue)).toBe(15);
      createdDiscountId = res.body.id;
    });

    it('GET /api/discounts — should retrieve list of discount rules', async () => {
      const res = await request(app)
        .get('/api/discounts')
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(d => d.name === 'Flash Weekend Clearance')).toBe(true);
    });

    it('PUT /api/discounts/:id — should update discount rule', async () => {
      const res = await request(app)
        .put(`/api/discounts/${createdDiscountId}`)
        .set('Authorization', adminToken)
        .send({
          discountValue: 18,
          isActive: false
        });

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.discountValue)).toBe(18);
      expect(res.body.isActive).toBe(false);
    });

    it('DELETE /api/discounts/:id — should delete discount rule', async () => {
      const res = await request(app)
        .delete(`/api/discounts/${createdDiscountId}`)
        .set('Authorization', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });
});
