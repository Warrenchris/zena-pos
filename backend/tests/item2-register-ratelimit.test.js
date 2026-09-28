const request = require('supertest');
const app = require('../src/app');
const { User, Shop, Organization, OrganizationMembership } = require('../src/models');

describe('ITEM 2: Registration Rate-Limiter Keying (partial SEC-02 mitigation)', () => {
  const simulatedIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 250) + 1}`;
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

  test('registerLimiter cannot be bypassed by rotating leading spoofed X-Forwarded-For IP when trailing real IP is unchanged', async () => {
    const trailingRealIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 250) + 1}`;
    const responses = [];

    for (let i = 1; i <= 6; i++) {
      const email = `ratelimit_spoof_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}@example.com`;
      createdUserEmails.push(email);

      const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', `${i}.${i}.${i}.${i}, ${trailingRealIp}`)
        .send({
          name: `User Spoof ${i}`,
          email,
          password: 'Password123!',
          shop: { name: `Shop Spoof ${i}` }
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
  }, 30000);

  test('authLimiter cannot be bypassed by rotating leading spoofed X-Forwarded-For IP for the same email', async () => {
    const authRealIp = `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 250) + 1}`;
    const targetEmail = `victim_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
    const responses = [];

    for (let i = 1; i <= 11; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `${i}.${i}.${i}.${i}, ${authRealIp}`)
        .send({
          email: targetEmail,
          password: 'WrongPassword123!'
        });

      responses.push(res);
    }

    for (let i = 0; i < 10; i++) {
      expect(responses[i].status).not.toBe(429);
      expect(responses[i].status).toBe(401);
    }

    // The 11th attempt MUST be 429 Too Many Requests
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.error).toContain('Too many attempts');
  }, 30000);

  test('two requests with different real trailing IPs do not share a bucket even with identical spoofed leading IP', async () => {
    const spoofedPrefix = '203.0.113.99';
    const trailingIpA = `198.51.${Math.floor(Math.random() * 100) + 10}.${Math.floor(Math.random() * 250) + 1}`;
    const trailingIpB = `198.51.${Math.floor(Math.random() * 100) + 110}.${Math.floor(Math.random() * 250) + 1}`;

    // Exhaust bucket for trailingIpA (5 attempts)
    for (let i = 1; i <= 5; i++) {
      const emailA = `bucket_a_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}@example.com`;
      createdUserEmails.push(emailA);

      const res = await request(app)
        .post('/api/auth/register')
        .set('X-Forwarded-For', `${spoofedPrefix}, ${trailingIpA}`)
        .send({
          name: `User A ${i}`,
          email: emailA,
          password: 'Password123!',
          shop: { name: `Shop A ${i}` }
        });
      expect(res.status).not.toBe(429);
    }

    // 6th attempt from trailingIpA must be 429
    const emailA6 = `bucket_a_${Date.now()}_6_${Math.random().toString(36).substring(7)}@example.com`;
    createdUserEmails.push(emailA6);
    const resA6 = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', `${spoofedPrefix}, ${trailingIpA}`)
      .send({
        name: 'User A 6',
        email: emailA6,
        password: 'Password123!',
        shop: 'Shop A 6' ? { name: 'Shop A 6' } : undefined
      });
    expect(resA6.status).toBe(429);

    // Request from trailingIpB with identical spoofed prefix must NOT be rate limited (fresh bucket)
    const emailB = `bucket_b_${Date.now()}_1_${Math.random().toString(36).substring(7)}@example.com`;
    createdUserEmails.push(emailB);
    const resB = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', `${spoofedPrefix}, ${trailingIpB}`)
      .send({
        name: 'User B 1',
        email: emailB,
        password: 'Password123!',
        shop: { name: 'Shop B 1' }
      });
    expect(resB.status).not.toBe(429);
  }, 30000);
});
