const request = require('supertest');
const app = require('../src/app');
const { User, Shop, Organization, OrganizationMembership } = require('../src/models');

describe('ITEM 2: Registration Rate-Limiter Keying (partial SEC-02 mitigation)', () => {
  const simulatedIp = '198.51.100.42';
  const createdUserEmails = [];

  afterAll(async () => {
    // Cleanup any successfully created users/shops
    for (const email of createdUserEmails) {
      const u = await User.findOne({ where: { email } });
      if (u) {
        await OrganizationMembership.destroy({ where: { userId: u.id } }).catch(() => {});
        if (u.shopId) {
          await Shop.destroy({ where: { id: u.shopId } }).catch(() => {});
        }
        await User.destroy({ where: { id: u.id } }).catch(() => {});
      }
    }
  });

  test('6 registration attempts with 6 different emails from the same IP get rate-limited at 5', async () => {
    const responses = [];

    for (let i = 1; i <= 6; i++) {
      const email = `ratelimit_reg_${Date.now()}_${i}@example.com`;
      createdUserEmails.push(email);

      const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', simulatedIp)
        .send({
          name: `User ${i}`,
          email,
          password: 'Password123!',
          shop: { name: `Shop ${i}` }
        });

      responses.push(res);
    }

    // First 5 attempts may succeed (201) or validate
    for (let i = 0; i < 5; i++) {
      expect(responses[i].status).not.toBe(429);
    }

    // The 6th attempt MUST be 429 Too Many Requests
    expect(responses[5].status).toBe(429);
    expect(responses[5].body.error).toContain('Too many registration attempts');
  });

  test('/login behavior remains keyed by IP:email, not blocked by registration limiter', async () => {
    // Attempting login with another email from the same IP should not hit 429
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', simulatedIp)
      .send({
        email: 'unrelated_login@example.com',
        password: 'WrongPassword123!'
      });

    // Should return 401 (invalid credentials), NOT 429
    expect(res.status).toBe(401);
  });
});
