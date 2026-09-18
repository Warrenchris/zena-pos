import api, { authAPI } from '../services/api';

describe('ITEM 1 & ITEM 2: Auth Interceptor 401 Tolerance & Diagnostic Logging', () => {
  let originalLocalStorage;
  let mockStorage = {};
  let consoleErrorSpy;

  beforeEach(() => {
    // Mock localStorage cleanly
    mockStorage = {};
    originalLocalStorage = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key) => mockStorage[key] || null),
        setItem: jest.fn((key, val) => {
          mockStorage[key] = String(val);
        }),
        removeItem: jest.fn((key) => {
          delete mockStorage[key];
        }),
        clear: jest.fn(() => {
          mockStorage = {};
        }),
      },
      writable: true,
      configurable: true,
    });

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  // Helper to create a fake JWT with specified payload
  const createMockJwt = (payload) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.mockSignature`;
  };

  const createAxios401Error = (url, method = 'get', responseData = {}, headers = {}) => {
    const error = new Error('Request failed with status code 401');
    error.config = {
      url,
      method,
      headers,
      metadata: { startTime: new Date() },
    };
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      data: responseData,
      headers: {},
      config: error.config,
    };
    return error;
  };

  describe('Verification Requirement 1: Login & Register fail immediately (0-tolerance)', () => {
    test('POST /api/auth/login with 401 triggers immediate forced logout on the first attempt without retry tolerance', async () => {
      api.defaults.adapter = jest.fn().mockImplementation((config) => {
        return Promise.reject(
          createAxios401Error('/api/auth/login', 'post', { error: 'Invalid email or password' })
        );
      });

      await expect(authAPI.login({ email: 'bad@test.com', password: 'bad' })).rejects.toMatchObject({
        response: {
          status: 401,
          data: { error: 'Invalid email or password' },
        },
      });

      // Assert terminal auth behavior: removes token on strike 1
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
    });

    test('POST /api/auth/register with 401 triggers immediate forced logout on the first attempt', async () => {
      api.defaults.adapter = jest.fn().mockImplementation((config) => {
        return Promise.reject(
          createAxios401Error('/api/auth/register', 'post', { error: 'Registration rejected' })
        );
      });

      await expect(authAPI.register({ email: 'bad@test.com' })).rejects.toMatchObject({
        response: {
          status: 401,
          data: { error: 'Registration rejected' },
        },
      });

      expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
    });
  });

  describe('Verification Requirement 2: GET /api/auth/profile has 3-strikes tolerance', () => {
    test('profile 401 retries/tolerates up to 3 times before forcing logout', async () => {
      const mockToken = createMockJwt({ id: 99, role: 'admin', shopId: 1, jti: 'test-jti-profile' });
      mockStorage['token'] = mockToken;

      // Ensure 401 count is reset by simulating a 200 response first
      api.defaults.adapter = jest.fn().mockResolvedValue({
        status: 200,
        data: { success: true },
        headers: {},
        config: { url: '/api/reset-success-profile', method: 'post', metadata: { startTime: new Date() } },
      });
      await api.post('/api/reset-success-profile', {});

      // Now set up adapter to return 401 on /api/auth/profile
      api.defaults.adapter = jest.fn().mockImplementation((config) => {
        return Promise.reject(
          createAxios401Error(
            '/api/auth/profile',
            'get',
            { error: 'Account is deactivated or terminated.' },
            { Authorization: `Bearer ${mockToken}` }
          )
        );
      });

      // Strike 1 on profile: should NOT wipe token, should NOT force logout
      await expect(api.get('/api/auth/profile')).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(window.localStorage.removeItem).not.toHaveBeenCalled();
      expect(mockStorage['token']).toBe(mockToken);
      expect(mockStorage['sessionExpiredMessage']).toBeUndefined();

      // Strike 2 on profile: should NOT wipe token, should NOT force logout
      await expect(api.get('/api/auth/profile')).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(window.localStorage.removeItem).not.toHaveBeenCalled();
      expect(mockStorage['token']).toBe(mockToken);
      expect(mockStorage['sessionExpiredMessage']).toBeUndefined();

      // Strike 3 on profile: REACHES MAX_401_COUNT (3) -> now forces logout
      await expect(api.get('/api/auth/profile')).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(mockStorage['token']).toBeUndefined();
      expect(mockStorage['sessionExpiredMessage']).toBe('Your session expired — please log in again.');
    });
  });

  describe('Item 2 Diagnostic Logging: switch-shop and profile', () => {
    test('captures status, full response body, request URL, and decoded JTI on switch-shop 401', async () => {
      const preSwitchToken = createMockJwt({
        id: 42,
        shopId: 1,
        jti: 'jti-pre-switch-42',
      });
      mockStorage['token'] = preSwitchToken;

      // Reset count via successful POST (not cached by getCache)
      api.defaults.adapter = jest.fn().mockResolvedValue({
        status: 200,
        data: { ok: true },
        headers: {},
        config: { url: '/api/reset-success', method: 'post', metadata: { startTime: new Date() } },
      });
      await api.post('/api/reset-success', {});

      const switchShopError = createAxios401Error(
        '/api/auth/switch-shop',
        'post',
        {
          error: 'Token has been revoked due to password change. Please log in again.',
          code: 'TOKEN_REVOKED_CUTOFF',
        },
        { Authorization: `Bearer ${preSwitchToken}` }
      );

      api.defaults.adapter = jest.fn().mockRejectedValue(switchShopError);

      await expect(authAPI.switchShop(2)).rejects.toMatchObject({
        response: { status: 401 },
      });

      // Strike 1 should tolerate: token preserved
      expect(window.localStorage.removeItem).not.toHaveBeenCalled();
      expect(mockStorage['token']).toBe(preSwitchToken);

      // Verify diagnostic logging output
      const diagnosticCalls = consoleErrorSpy.mock.calls.filter(([msg]) =>
        typeof msg === 'string' && msg.includes('[Auth Diagnostic]')
      );
      expect(diagnosticCalls.length).toBeGreaterThanOrEqual(1);

      const [, diagnosticData] = diagnosticCalls[0];
      expect(diagnosticData).toMatchObject({
        status: 401,
        url: '/api/auth/switch-shop',
        responseBody: {
          error: 'Token has been revoked due to password change. Please log in again.',
          code: 'TOKEN_REVOKED_CUTOFF',
        },
        requestTokenJti: 'jti-pre-switch-42',
        storedTokenJti: 'jti-pre-switch-42',
        tokenRelation: 'matches_current_storage',
      });
    });
  });
});
