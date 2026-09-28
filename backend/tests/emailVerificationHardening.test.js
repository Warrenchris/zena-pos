/**
 * Hardening fixes for email verification (follow-up to emailVerification.test.js).
 *
 * These are pure unit tests: models, mailer and logger are mocked, so they need
 * no database or Redis.
 *
 * 1. FRONTEND_URL: helper + production startup validation (no dead localhost links)
 * 2. verify-email rate limiter is keyed by IP only (not IP + submitted token)
 * 3. 7-day gate / action gate: verified users cached, no needless queries
 * 4. exempt paths match regardless of trailing slash / repeated slashes / case
 */

const mockUserFindByPk = jest.fn();
const mockMembershipFindOne = jest.fn();
const mockIsEmailConfigured = jest.fn(() => true);

jest.mock('../src/models', () => ({
  User: { findByPk: (...args) => mockUserFindByPk(...args) },
  OrganizationMembership: { findOne: (...args) => mockMembershipFindOne(...args) }
}));

jest.mock('../src/services/emailService', () => ({
  isEmailConfigured: (...args) => mockIsEmailConfigured(...args)
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const {
  requireVerifiedEmail,
  emailVerification7DayGate,
  normalizePath,
  __resetCachesForTests
} = require('../src/middleware/requireVerifiedEmail');
const { getFrontendUrl, getFrontendUrlProblems } = require('../src/utils/frontendUrl');

const DAY_MS = 24 * 60 * 60 * 1000;

function makeReq(overrides = {}) {
  return {
    user: { id: 1, orgRole: 'owner' },
    originalUrl: '/api/products',
    baseUrl: '',
    path: '/api/products',
    header: () => undefined,
    ...overrides
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  mockUserFindByPk.mockReset();
  mockMembershipFindOne.mockReset();
  mockIsEmailConfigured.mockReset();
  mockIsEmailConfigured.mockReturnValue(true);
  __resetCachesForTests();
});

// ---------------------------------------------------------------------------
// 1. FRONTEND_URL
// ---------------------------------------------------------------------------
describe('FRONTEND_URL handling', () => {
  test('development falls back to the Vite dev server and strips trailing slashes', () => {
    expect(getFrontendUrl({ NODE_ENV: 'development' })).toBe('http://localhost:5173');
    expect(getFrontendUrl({ NODE_ENV: 'test', FRONTEND_URL: 'http://localhost:3000///' })).toBe('http://localhost:3000');
  });

  test('production: missing FRONTEND_URL is a problem and getFrontendUrl throws', () => {
    const env = { NODE_ENV: 'production' };
    expect(getFrontendUrlProblems(env)).toEqual(['FRONTEND_URL is not set']);
    expect(() => getFrontendUrl(env)).toThrow(/FRONTEND_URL is not set/);
  });

  test.each([
    ['http://localhost:5173'],
    ['https://127.0.0.1'],
    ['http://0.0.0.0:3000']
  ])('production: %s is rejected as a localhost URL', (url) => {
    const problems = getFrontendUrlProblems({ NODE_ENV: 'production', FRONTEND_URL: url });
    expect(problems.join(' ')).toMatch(/localhost/);
    expect(() => getFrontendUrl({ NODE_ENV: 'production', FRONTEND_URL: url })).toThrow();
  });

  test('production: garbage and non-http schemes are rejected', () => {
    expect(getFrontendUrlProblems({ NODE_ENV: 'production', FRONTEND_URL: 'not a url' }))
      .toEqual(['FRONTEND_URL is not a valid URL']);
    expect(getFrontendUrlProblems({ NODE_ENV: 'production', FRONTEND_URL: 'ftp://app.example.com' }).join(' '))
      .toMatch(/http/);
  });

  test('production: a real https URL is accepted and normalised', () => {
    const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://app.example.com/' };
    expect(getFrontendUrlProblems(env)).toEqual([]);
    expect(getFrontendUrl(env)).toBe('https://app.example.com');
  });

  describe('validateStartup in production', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    function setProdEnv(frontendUrl) {
      process.env.NODE_ENV = 'production';
      process.env.DB_NAME = process.env.DB_NAME || 'x';
      process.env.DB_USER = process.env.DB_USER || 'x';
      process.env.DB_PASS = process.env.DB_PASS || 'x';
      if (frontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = frontendUrl;
    }

    test('refuses to boot without FRONTEND_URL', () => {
      setProdEnv(undefined);
      const { validateStartup } = require('../src/utils/startupValidation');
      expect(() => validateStartup()).toThrow(/Invalid FRONTEND_URL/);
    });

    test('refuses to boot with a localhost FRONTEND_URL', () => {
      setProdEnv('http://localhost:5173');
      const { validateStartup } = require('../src/utils/startupValidation');
      expect(() => validateStartup()).toThrow(/localhost/);
    });

    test('boots with a public https FRONTEND_URL', () => {
      setProdEnv('https://app.example.com');
      const { validateStartup } = require('../src/utils/startupValidation');
      expect(() => validateStartup()).not.toThrow();
    });

    test('non-production is never blocked by FRONTEND_URL', () => {
      setProdEnv(undefined);
      process.env.NODE_ENV = 'development';
      const { validateStartup } = require('../src/utils/startupValidation');
      expect(() => validateStartup()).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. verify-email limiter key
// ---------------------------------------------------------------------------
describe('verify-email rate limiter key', () => {
  test('is keyed by client IP only, so guessing different tokens shares one bucket', () => {
    let captured;
    jest.isolateModules(() => {
      jest.doMock('../src/utils/distributedRateLimiter', () => ({
        createDistributedRateLimiter: (config) => {
          if (config.namespace === 'verify-email') captured = config;
          return (req, res, next) => next();
        }
      }));
      jest.doMock('../src/controllers/authController', () => new Proxy({}, { get: () => jest.fn() }));
      jest.doMock('../src/middleware/auth', () => ({ auth: jest.fn() }));
      require('../src/routes/auth');
    });

    expect(captured).toBeDefined();
    const key = captured.keyGenerator;
    const a = key({ ip: '203.0.113.9', headers: {}, body: { token: 'aaaa' } });
    const b = key({ ip: '203.0.113.9', headers: {}, body: { token: 'bbbb' } });
    const c = key({ ip: '198.51.100.4', headers: {}, body: { token: 'aaaa' } });

    expect(a).toBe(b);
    expect(a).toBe('203.0.113.9');
    expect(c).not.toBe(a);
    expect(a).not.toMatch(/aaaa|bbbb/);
  });
});

// ---------------------------------------------------------------------------
// 4. exempt path normalisation
// ---------------------------------------------------------------------------
describe('normalizePath', () => {
  test.each([
    ['/api/auth/profile/', '/api/auth/profile'],
    ['/API/Auth/Profile', '/api/auth/profile'],
    ['//api//auth///me//', '/api/auth/me'],
    ['/api/auth/verify-email?token=abc', '/api/auth/verify-email'],
    ['/', '/'],
    ['', '/'],
    [undefined, '/']
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('7-day gate exemptions', () => {
  const eightDaysAgo = () => new Date(Date.now() - 8 * DAY_MS);

  test.each([
    '/api/auth/profile',
    '/api/auth/profile/',
    '/api/auth/me/',
    '//api/auth//logout/',
    '/API/AUTH/VERIFY-EMAIL/',
    '/api/auth/resend-verification/?x=1',
    '/health/'
  ])('an expired unverified owner can still reach %s', async (url) => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: null, createdAt: eightDaysAgo() });
    const req = makeReq({ originalUrl: url, path: url });
    const res = makeRes();
    const next = jest.fn();

    await emailVerification7DayGate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(mockUserFindByPk).not.toHaveBeenCalled();
  });

  test('a non-exempt route is still blocked after 7 days, even with a trailing slash', async () => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: null, createdAt: eightDaysAgo() });
    const req = makeReq({ originalUrl: '/api/products/', path: '/api/products/' });
    const res = makeRes();
    const next = jest.fn();

    await emailVerification7DayGate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMAIL_VERIFICATION_REQUIRED' }));
  });

  test('a path that merely starts with an exempt prefix is NOT exempt', async () => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: null, createdAt: eightDaysAgo() });
    const req = makeReq({ originalUrl: '/api/auth/profile/extra', path: '/api/auth/profile/extra' });
    const res = makeRes();
    const next = jest.fn();

    await emailVerification7DayGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ---------------------------------------------------------------------------
// 3. caching / query reduction
// ---------------------------------------------------------------------------
describe('7-day gate query cost', () => {
  test('verified owner: one lookup, then served from cache', async () => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 30 * DAY_MS) });

    for (let i = 0; i < 5; i++) {
      const next = jest.fn();
      await emailVerification7DayGate(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(mockUserFindByPk).toHaveBeenCalledTimes(1);
  });

  test('unverified owner is never cached: verifying takes effect on the next request', async () => {
    const unverified = { id: 1, emailVerifiedAt: null, createdAt: new Date(Date.now() - 8 * DAY_MS) };
    const verified = { id: 1, emailVerifiedAt: new Date(), createdAt: unverified.createdAt };

    mockUserFindByPk.mockResolvedValueOnce(unverified);
    const res1 = makeRes();
    const next1 = jest.fn();
    await emailVerification7DayGate(makeReq(), res1, next1);
    expect(res1.status).toHaveBeenCalledWith(403);
    expect(next1).not.toHaveBeenCalled();

    mockUserFindByPk.mockResolvedValueOnce(verified);
    const res2 = makeRes();
    const next2 = jest.fn();
    await emailVerification7DayGate(makeReq(), res2, next2);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(res2.status).not.toHaveBeenCalled();
    expect(mockUserFindByPk).toHaveBeenCalledTimes(2);
  });

  test('owner still inside the 7-day window is allowed through', async () => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: null, createdAt: new Date(Date.now() - 2 * DAY_MS) });
    const next = jest.fn();
    await emailVerification7DayGate(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test.each(['admin', 'member', 'billing_admin'])(
    'a token with orgRole "%s" needs no database queries at all',
    async (orgRole) => {
      const next = jest.fn();
      await emailVerification7DayGate(makeReq({ user: { id: 7, orgRole } }), makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockMembershipFindOne).not.toHaveBeenCalled();
      expect(mockUserFindByPk).not.toHaveBeenCalled();
    }
  );

  test('employees are never queried or blocked', async () => {
    const next = jest.fn();
    await emailVerification7DayGate(makeReq({ user: { id: 9, isEmployee: true, orgRole: 'owner' } }), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockMembershipFindOne).not.toHaveBeenCalled();
    expect(mockUserFindByPk).not.toHaveBeenCalled();
  });

  test('legacy token without an orgRole claim: membership looked up once, then cached', async () => {
    mockMembershipFindOne.mockResolvedValue(null);
    for (let i = 0; i < 4; i++) {
      const next = jest.fn();
      await emailVerification7DayGate(makeReq({ user: { id: 11 } }), makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(mockMembershipFindOne).toHaveBeenCalledTimes(1);
    expect(mockUserFindByPk).not.toHaveBeenCalled();
  });

  test('legacy token whose membership says owner is still gated after 7 days', async () => {
    mockMembershipFindOne.mockResolvedValue({ id: 5, orgRole: 'owner' });
    mockUserFindByPk.mockResolvedValue({ id: 12, emailVerifiedAt: null, createdAt: new Date(Date.now() - 9 * DAY_MS) });
    const res = makeRes();
    const next = jest.fn();
    await emailVerification7DayGate(makeReq({ user: { id: 12 } }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('fails open (no queries) when email is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const next = jest.fn();
    await emailVerification7DayGate(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockUserFindByPk).not.toHaveBeenCalled();
  });
});

describe('requireVerifiedEmail (action gate)', () => {
  test('unverified owner gets EMAIL_NOT_VERIFIED', async () => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: null });
    const res = makeRes();
    const next = jest.fn();
    await requireVerifiedEmail(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }));
  });

  test('missing user row is treated as unverified', async () => {
    mockUserFindByPk.mockResolvedValue(null);
    const res = makeRes();
    await requireVerifiedEmail(makeReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('verified owner passes and is then served from cache', async () => {
    mockUserFindByPk.mockResolvedValue({ id: 1, emailVerifiedAt: new Date() });
    for (let i = 0; i < 3; i++) {
      const next = jest.fn();
      await requireVerifiedEmail(makeReq(), makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
    expect(mockUserFindByPk).toHaveBeenCalledTimes(1);
  });

  test('unverified is not cached: verifying takes effect immediately', async () => {
    mockUserFindByPk.mockResolvedValueOnce({ id: 1, emailVerifiedAt: null });
    const res1 = makeRes();
    await requireVerifiedEmail(makeReq(), res1, jest.fn());
    expect(res1.status).toHaveBeenCalledWith(403);

    mockUserFindByPk.mockResolvedValueOnce({ id: 1, emailVerifiedAt: new Date() });
    const next2 = jest.fn();
    await requireVerifiedEmail(makeReq(), makeRes(), next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  test('non-owners and employees pass without queries', async () => {
    const next1 = jest.fn();
    await requireVerifiedEmail(makeReq({ user: { id: 2, orgRole: 'admin' } }), makeRes(), next1);
    const next2 = jest.fn();
    await requireVerifiedEmail(makeReq({ user: { id: 3, isEmployee: true } }), makeRes(), next2);
    expect(next1).toHaveBeenCalledTimes(1);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(mockUserFindByPk).not.toHaveBeenCalled();
    expect(mockMembershipFindOne).not.toHaveBeenCalled();
  });

  test('a database error returns 500 rather than letting the action through', async () => {
    mockUserFindByPk.mockRejectedValue(new Error('db down'));
    const res = makeRes();
    const next = jest.fn();
    await requireVerifiedEmail(makeReq(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
