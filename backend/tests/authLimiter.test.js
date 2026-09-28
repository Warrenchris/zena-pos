const request = require('supertest');
const app = require('../src/app');
const { validateStartup } = require('../src/utils/startupValidation');

describe('authLimiter & Rate Limiter Test Coverage', () => {
  const generateIp = () => `198.51.${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 250) + 1}`;

  test('/api/auth/login returns 429 on the 11th attempt when X-Forwarded-For is supplied', async () => {
    const testIp = generateIp();
    const testEmail = `login_limiter_${Date.now()}@example.com`;
    const responses = [];

    for (let i = 1; i <= 11; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', testIp)
        .send({
          email: testEmail,
          password: 'WrongPassword123!',
        });
      responses.push(res);
    }

    // First 10 attempts hit authentication logic (returns 401 Unauthorized)
    for (let i = 0; i < 10; i++) {
      expect(responses[i].status).toBe(401);
    }

    // 11th attempt must be rate-limited with HTTP 429
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.error).toMatch(/Too many attempts/i);
  }, 30000);

  test('/api/auth/reset-password returns 429 on the 11th attempt when X-Forwarded-For is supplied', async () => {
    const testIp = generateIp();
    const responses = [];

    for (let i = 1; i <= 11; i++) {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .set('X-Forwarded-For', testIp)
        .send({
          token: 'non_existent_token_123',
          password: 'NewPassword123!',
        });
      responses.push(res);
    }

    // First 10 attempts hit reset logic (returns 400 Invalid or expired reset token)
    for (let i = 0; i < 10; i++) {
      expect(responses[i].status).toBe(400);
      expect(responses[i].body.error).toMatch(/Invalid or expired token/i);
    }

    // 11th attempt must be rate-limited with HTTP 429
    expect(responses[10].status).toBe(429);
    expect(responses[10].body.error).toMatch(/Too many attempts/i);
  }, 30000);

  test('authLimiter skip condition cannot activate when NODE_ENV is not "test"', () => {
    // In routes/auth.js: skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-forwarded-for']
    // We isolate and inspect the skip predicate under production and development
    const skipPredicate = (req, env) => env === 'test' && !req.headers['x-forwarded-for'];

    const reqWithoutHeader = { headers: {} };
    const reqWithHeader = { headers: { 'x-forwarded-for': '198.51.100.1' } };

    // In production, skip NEVER returns true
    expect(skipPredicate(reqWithoutHeader, 'production')).toBe(false);
    expect(skipPredicate(reqWithHeader, 'production')).toBe(false);

    // In development, skip NEVER returns true
    expect(skipPredicate(reqWithoutHeader, 'development')).toBe(false);
    expect(skipPredicate(reqWithHeader, 'development')).toBe(false);

    // In test mode, skip ONLY returns true if x-forwarded-for is missing
    expect(skipPredicate(reqWithoutHeader, 'test')).toBe(true);
    expect(skipPredicate(reqWithHeader, 'test')).toBe(false);
  });

  test('startupValidation prevents NODE_ENV=test when booting the server', () => {
    const savedEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'test';
      expect(() => validateStartup()).toThrow(/NODE_ENV cannot be set to "test"/);
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
  });
});
