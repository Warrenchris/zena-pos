const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');

jest.mock('axios');

// Spy on jsonwebtoken.sign while keeping the real RS256 implementation
const signSpy = jest.spyOn(jwt, 'sign');

// Generate a real 2048-bit RSA keypair for cryptographic RS256 verification
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const aiClient = require('../src/utils/aiClient');

describe('Stage 2B: AI Authentication & Authorization Regression Suite', () => {
  let prevApiKey;
  let prevPrivateKey;

  beforeAll(() => {
    prevApiKey = process.env.AI_SERVICE_API_KEY;
    prevPrivateKey = process.env.JWT_PRIVATE_KEY;
  });

  afterAll(() => {
    if (prevApiKey === undefined) {
      delete process.env.AI_SERVICE_API_KEY;
    } else {
      process.env.AI_SERVICE_API_KEY = prevApiKey;
    }
    if (prevPrivateKey === undefined) {
      delete process.env.JWT_PRIVATE_KEY;
    } else {
      process.env.JWT_PRIVATE_KEY = prevPrivateKey;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AI_SERVICE_API_KEY;
    process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY;
    axios.post.mockResolvedValue({ status: 200, data: { success: true }, headers: {} });
    axios.get.mockResolvedValue({ status: 200, data: { success: true }, headers: {} });
    axios.mockResolvedValue({ status: 200, data: { success: true }, headers: {} });
  });

  describe('1. Real RSA Keypair RS256 Signing & Claim Contract', () => {
    it('mints a cryptographically valid RS256 JWT with issuer, audience, 15m expiry, and caller claims', async () => {
      await aiClient.post('/api/test', { data: 123 }, { shopId: 5, userId: 101 });

      expect(axios.post).toHaveBeenCalledTimes(1);
      const calledConfig = axios.post.mock.calls[0][2];
      const authHeader = calledConfig.headers.Authorization;
      expect(authHeader).toMatch(/^Bearer eyJ/);

      const token = authHeader.slice('Bearer '.length);
      const decodedHeader = jwt.decode(token, { complete: true }).header;
      expect(decodedHeader.alg).toBe('RS256');

      const verified = jwt.verify(token, TEST_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'zana-backend',
        audience: 'ai-service'
      });

      expect(verified).toMatchObject({
        id: 101,
        role: 'user',
        shopId: 5,
        isEmployee: false,
        iss: 'zana-backend',
        aud: 'ai-service'
      });
      expect(verified.exp - verified.iat).toBe(15 * 60);
    });

    it('ignores static AI_SERVICE_API_KEY env var and always uses RS256 dynamic JWT signing', async () => {
      process.env.AI_SERVICE_API_KEY = 'legacy-static-api-key';

      await aiClient.post('/api/test', { data: 123 }, { shopId: 5, userId: 101 });

      const calledConfig = axios.post.mock.calls[0][2];
      const authHeader = calledConfig.headers.Authorization;
      expect(authHeader).not.toBe('Bearer legacy-static-api-key');

      const token = authHeader.slice('Bearer '.length);
      const verified = jwt.verify(token, TEST_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'zana-backend',
        audience: 'ai-service'
      });
      expect(verified.id).toBe(101);
      expect(verified.shopId).toBe(5);
    });

    it('fails closed when JWT_PRIVATE_KEY is missing or empty', async () => {
      delete process.env.JWT_PRIVATE_KEY;

      await expect(
        aiClient.post('/api/test', { data: 1 }, { shopId: 1, userId: 101 })
      ).rejects.toThrow('[aiClient] Cannot sign dynamic JWT token: JWT_PRIVATE_KEY is not configured.');

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('fails closed when JWT_PRIVATE_KEY is invalid/corrupted PEM', async () => {
      process.env.JWT_PRIVATE_KEY = 'not-a-valid-rsa-private-key';

      await expect(
        aiClient.post('/api/test', { data: 1 }, { shopId: 1, userId: 101 })
      ).rejects.toThrow();

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('fails closed when userId is missing', async () => {
      await expect(aiClient.post('/api/test', {})).rejects.toThrow(
        '[aiClient] Cannot sign dynamic JWT token: userId is missing or invalid.'
      );
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('maps upstream 401 error to a 503 error', async () => {
      const mockError = new Error('Request failed with status code 401');
      mockError.response = { status: 401, data: { detail: 'Unauthorized' } };
      axios.post.mockRejectedValueOnce(mockError);

      await expect(
        aiClient.post('/api/test', {}, { userId: 101, shopId: 1 })
      ).rejects.toThrow('AI service authentication failed — check server configuration');
    });
  });

  describe('2. External Bearer-Token Stripping & Replacement', () => {
    it('strips external Authorization header (Title-Case) and replaces it with an internal RS256 JWT', async () => {
      await aiClient.post('/api/test', { data: 1 }, {
        headers: { Authorization: 'Bearer incoming-external-user-token', 'X-Custom': 'keep' },
        user: { id: 201, role: 'cashier', shopId: 2, isEmployee: true }
      });

      expect(signSpy).toHaveBeenCalledTimes(1);
      const calledHeaders = axios.post.mock.calls[0][2].headers;
      expect(calledHeaders['X-Custom']).toBe('keep');
      expect(calledHeaders.Authorization).not.toBe('Bearer incoming-external-user-token');

      const verified = jwt.verify(calledHeaders.Authorization.slice('Bearer '.length), TEST_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'zana-backend',
        audience: 'ai-service'
      });
      expect(verified.id).toBe(201);
      expect(verified.role).toBe('cashier');
      expect(verified.shopId).toBe(2);
    });

    it('strips external authorization header (lowercase) and replaces it with an internal RS256 JWT', async () => {
      await aiClient.request({
        method: 'POST',
        url: '/api/insights/analyze',
        data: { revenue: [100] },
        headers: { authorization: 'Bearer external-lowercase-token' },
        user: { id: 305, role: 'manager', shopId: 4, isEmployee: true }
      });

      const calledHeaders = axios.mock.calls[0][0].headers;
      expect(calledHeaders.authorization).toBeUndefined();
      expect(calledHeaders.Authorization).toMatch(/^Bearer eyJ/);

      const verified = jwt.verify(calledHeaders.Authorization.slice('Bearer '.length), TEST_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'zana-backend',
        audience: 'ai-service'
      });
      expect(verified.id).toBe(305);
      expect(verified.role).toBe('manager');
    });

    it('does not sign or forward Authorization headers for public endpoints', async () => {
      process.env.AI_SERVICE_API_KEY = 'should-not-be-injected';
      await aiClient.get('/openapi.json', {
        isPublic: true,
        headers: { Authorization: 'Bearer external-token' }
      });

      expect(signSpy).not.toHaveBeenCalled();
      const calledHeaders = axios.get.mock.calls[0][1].headers;
      expect(calledHeaders.Authorization).toBeUndefined();
      expect(calledHeaders.authorization).toBeUndefined();
    });
  });

  describe('3. Privilege Escalation & Tenant/Shop Isolation Hardening', () => {
    it.each(['admin', 'super_admin', 'org_admin', 'manager'])(
      'blocks unauthenticated caller from claiming privileged role "%s" when user session is absent',
      async (attemptedRole) => {
        await aiClient.post('/api/test', { data: 1 }, { userId: 300, role: attemptedRole, shopId: 1 });

        expect(signSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 300,
            role: 'user'
          }),
          expect.any(String),
          expect.any(Object)
        );
      }
    );

    it.each(['admin', 'super_admin', 'org_admin', 'manager'])(
      'prevents privilege escalation when untrusted config attempts role "%s" alongside a cashier user session',
      async (attemptedRole) => {
        const cashierUser = { id: 201, role: 'cashier', shopId: 2, isEmployee: true };

        await aiClient.post('/api/test', { data: 1 }, { user: cashierUser, role: attemptedRole });

        expect(signSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 201,
            role: 'cashier'
          }),
          expect.any(String),
          expect.any(Object)
        );
      }
    );

    it('downgrades employee account claiming super_admin role to unprivileged user role', async () => {
      const spoofedEmployee = { id: 202, role: 'super_admin', shopId: 2, isEmployee: true };

      await aiClient.post('/api/test', { data: 1 }, { user: spoofedEmployee });

      expect(signSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 202,
          role: 'user',
          shopId: 2
        }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('enforces shop isolation for cashier against untrusted shopId override', async () => {
      const cashierUser = { id: 201, role: 'cashier', shopId: 2, isEmployee: true };

      await aiClient.post('/api/test', { data: 1 }, { user: cashierUser, shopId: 999 });

      expect(signSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 201,
          shopId: 2
        }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('enforces shop isolation for manager when requested shopId is outside accessibleShopIds or authz.scope', async () => {
      const managerUser = { id: 105, role: 'manager', shopId: 4, isEmployee: true, accessibleShopIds: [4, 5] };

      // Allowed override to shop 5
      await aiClient.post('/api/test', { data: 1 }, { user: managerUser, shopId: 5 });
      expect(signSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 105, shopId: 5 }),
        expect.any(String),
        expect.any(Object)
      );

      // Rejected override to shop 999 -> falls back to manager's assigned shop 4
      await aiClient.post('/api/test', { data: 1 }, { user: managerUser, shopId: 999 });
      expect(signSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 105, shopId: 4 }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('locks organizationId to trusted user session and blocks cross-organization override', async () => {
      const orgUser = { id: 50, role: 'manager', shopId: 3, organizationId: 77 };

      await aiClient.post('/api/test', { data: 1 }, { user: orgUser, organizationId: 999 });

      expect(signSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 50,
          role: 'manager',
          organizationId: 77
        }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('strips internal helper properties from outgoing axios configuration', async () => {
      await aiClient.post('/api/test', { data: 1 }, {
        user: { id: 201, role: 'cashier', shopId: 2 },
        authz: { scope: { hasShopAccess: () => true } },
        userId: 201,
        shopId: 2,
        role: 'cashier',
        organizationId: 10,
        isEmployee: true,
        isPublic: false
      });

      const calledConfig = axios.post.mock.calls[0][2];
      expect(calledConfig).not.toHaveProperty('user');
      expect(calledConfig).not.toHaveProperty('authz');
      expect(calledConfig).not.toHaveProperty('userId');
      expect(calledConfig).not.toHaveProperty('shopId');
      expect(calledConfig).not.toHaveProperty('role');
      expect(calledConfig).not.toHaveProperty('organizationId');
      expect(calledConfig).not.toHaveProperty('isEmployee');
      expect(calledConfig).not.toHaveProperty('isPublic');
    });
  });

  describe('4. insightsController.getInsights Internal AI Client Routing & Shop Scope', () => {
    const Sale = require('../src/models/Sale');
    const Product = require('../src/models/Product');
    const Inventory = require('../src/models/Inventory');
    const Expense = require('../src/models/Expense');
    const SaleItem = require('../src/models/SaleItem');
    const SystemSettings = require('../src/models/SystemSettings');
    const insightsController = require('../src/controllers/insightsController');

    it('routes /api/insights/analyze through aiClient.post with internal RS256 token instead of forwarding external bearer token', async () => {
      jest.spyOn(Sale, 'findAll').mockResolvedValue([]);
      jest.spyOn(Sale, 'sum').mockResolvedValue(0);
      jest.spyOn(SystemSettings, 'findOne').mockResolvedValue({ lowStockThreshold: 10 });
      jest.spyOn(Inventory, 'findAll').mockResolvedValue([]);
      jest.spyOn(Expense, 'findAll').mockResolvedValue([]);
      jest.spyOn(SaleItem, 'findAll').mockResolvedValue([]);
      jest.spyOn(Product, 'findAll').mockResolvedValue([]);

      axios.post.mockImplementation(async (url) => {
        if (url.includes('/api/insights/analyze')) {
          return {
            status: 200,
            data: [{ insight_type: 'REVENUE', description: 'AI growth insight', recommendations: ['Expand SKUs'] }]
          };
        }
        return { status: 200, data: { anomalies: [], alerts: [] } };
      });

      const fetchSpy = jest.fn();
      const origFetch = global.fetch;
      global.fetch = fetchSpy;

      try {
        const req = {
          headers: { authorization: 'Bearer external-browser-login-jwt' },
          query: {},
          shopId: 7,
          user: { id: 44, role: 'manager', shopId: 7, organizationId: 12, isEmployee: true },
          authz: {
            scope: {
              activeShopId: 7,
              hasShopAccess: (id) => Number(id) === 7
            }
          }
        };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };

        await insightsController.getInsights(req, res);

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            recommendations: expect.arrayContaining([
              expect.objectContaining({
                type: 'REVENUE',
                message: 'AI growth insight',
                details: ['Expand SKUs']
              })
            ])
          })
        );

        const analyzeCall = axios.post.mock.calls.find(([url]) => url.includes('/api/insights/analyze'));
        expect(analyzeCall).toBeDefined();
        const sentHeaders = analyzeCall[2].headers;
        expect(sentHeaders.Authorization).not.toBe('Bearer external-browser-login-jwt');

        const verified = jwt.verify(sentHeaders.Authorization.slice('Bearer '.length), TEST_PUBLIC_KEY, {
          algorithms: ['RS256'],
          issuer: 'zana-backend',
          audience: 'ai-service'
        });
        expect(verified).toMatchObject({
          id: 44,
          role: 'manager',
          shopId: 7,
          organizationId: 12,
          iss: 'zana-backend',
          aud: 'ai-service'
        });
      } finally {
        global.fetch = origFetch;
        jest.restoreAllMocks();
      }
    });

    it('rejects unauthorized query.shopId override in getAuthorizedShopId', () => {
      const reqWithAuthz = {
        query: { shopId: '99' },
        shopId: 3,
        user: { id: 10, role: 'manager', shopId: 3 },
        authz: {
          scope: {
            activeShopId: 3,
            hasShopAccess: (id) => Number(id) === 3
          }
        }
      };
      expect(insightsController.getAuthorizedShopId(reqWithAuthz)).toBeNull();

      const reqAllowed = {
        ...reqWithAuthz,
        query: { shopId: '3' }
      };
      expect(insightsController.getAuthorizedShopId(reqAllowed)).toBe(3);
    });
  });

  describe('5. aiProxy Route Authorization, Header Stripping & Scope Sanitization', () => {
    const aiProxy = require('../src/routes/aiProxy');

    afterAll(() => {
      if (typeof aiProxy.stopProbe === 'function') {
        aiProxy.stopProbe();
      }
    });

    it('buildForwardHeaders strips Authorization/authorization/host/content-length case-insensitively', () => {
      const headers = aiProxy.buildForwardHeaders({
        requestId: 'req-123',
        headers: {
          Host: 'localhost:3000',
          'Content-Length': '45',
          Authorization: 'Bearer external-token-1',
          authorization: 'Bearer external-token-2',
          'content-type': 'application/json'
        }
      });

      expect(headers.Host).toBeUndefined();
      expect(headers.host).toBeUndefined();
      expect(headers['Content-Length']).toBeUndefined();
      expect(headers['content-length']).toBeUndefined();
      expect(headers.Authorization).toBeUndefined();
      expect(headers.authorization).toBeUndefined();
      expect(headers['x-request-id']).toBe('req-123');
      expect(headers['content-type']).toBe('application/json');
    });

    it('sanitizeForwardPayload pins shop_id, shopId, organization_id, and organizationId to server-verified context', () => {
      const tampered = {
        dates: ['2026-01-01'],
        values: [100],
        shop_id: '999',
        shopId: 999,
        organization_id: 888,
        organizationId: 888
      };

      const sanitizedBranch = aiProxy.sanitizeForwardPayload(tampered, { shopId: 4, orgId: 12, isOrg: false });
      expect(sanitizedBranch).toEqual({
        dates: ['2026-01-01'],
        values: [100],
        shop_id: '4',
        shopId: 4,
        organization_id: 12,
        organizationId: 12
      });

      const sanitizedOrg = aiProxy.sanitizeForwardPayload(tampered, { shopId: 4, orgId: 12, isOrg: true });
      expect(sanitizedOrg.shop_id).toBe('org_12');
      expect(sanitizedOrg.shopId).toBeUndefined();
      expect(sanitizedOrg.organization_id).toBe(12);
      expect(sanitizedOrg.organizationId).toBe(12);
    });

    describe('Express Proxy Route Enforcement (Forecast vs Non-Forecast)', () => {
      const authorize = require('../src/middleware/authorize');

      const createProxyTestApp = (mockUser, mockAuthz) => {
        const testApp = express();
        testApp.use(express.json());
        testApp.use((req, _res, next) => {
          req.user = mockUser;
          req.shopId = mockAuthz.scope.activeShopId;
          req.organizationId = mockAuthz.tenant.organizationId;
          req.authz = mockAuthz;
          next();
        });

        // Mount endpoints mirroring aiProxy's forecastAuthzPolicy and forwardAuthzPolicy
        const forecastPolicy = authorize({
          permission: 'view_reports',
          custom: (req, authz) => {
            const isOrg = req.body?.isOrgForecast || req.query?.isOrgForecast === 'true' || req.query?.scope === 'organization';
            if (isOrg && !authz.tenant.isOrgAdmin) {
              return { allowed: false, status: 403, code: 'ORG_ADMIN_REQUIRED', message: 'Org admin required' };
            }
            const suppliedShopId = req.query?.shopId ?? req.query?.shop_id ?? req.body?.shopId ?? req.body?.shop_id;
            if (!isOrg && suppliedShopId !== undefined && !authz.scope.hasShopAccess(Number(suppliedShopId))) {
              return { allowed: false, status: 403, code: 'SHOP_ACCESS_DENIED', message: 'Shop access denied' };
            }
            return { allowed: true };
          }
        });

        const forwardPolicy = authorize({
          permission: 'view_reports',
          shopScope: 'current',
          custom: (req, authz) => {
            const suppliedShopId = req.query?.shopId ?? req.query?.shop_id ?? req.body?.shopId ?? req.body?.shop_id;
            if (suppliedShopId !== undefined && !authz.scope.hasShopAccess(Number(suppliedShopId))) {
              return { allowed: false, status: 403, code: 'SHOP_ACCESS_DENIED', message: 'Shop access denied' };
            }
            const untrustedOrgId = req.body?.organization_id ?? req.body?.organizationId ?? req.query?.organization_id ?? req.query?.organizationId;
            if (untrustedOrgId !== undefined && Number(untrustedOrgId) !== Number(authz.tenant.organizationId)) {
              return { allowed: false, status: 403, code: 'TENANT_MISMATCH', message: 'Cross-tenant access forbidden.' };
            }
            return { allowed: true };
          }
        });

        testApp.post('/forward/api/forecasting/rf-forecast', forecastPolicy, async (req, res) => {
          const sanitizedBody = aiProxy.sanitizeForwardPayload(req.body, {
            shopId: req.shopId,
            orgId: req.organizationId,
            isOrg: Boolean(req.body?.isOrgForecast)
          });
          const resp = await aiClient.request({
            method: 'POST',
            url: '/api/forecasting/rf-forecast',
            data: sanitizedBody,
            headers: aiProxy.buildForwardHeaders(req),
            shopId: req.shopId,
            userId: req.user.id,
            user: req.user,
            authz: req.authz
          });
          res.status(resp.status).json(resp.data);
        });

        testApp.post('/forward/api/insights/analyze', forwardPolicy, async (req, res) => {
          const sanitizedBody = aiProxy.sanitizeForwardPayload(req.body, {
            shopId: req.shopId,
            orgId: req.organizationId,
            isOrg: false
          });
          const resp = await aiClient.request({
            method: 'POST',
            url: '/api/insights/analyze',
            data: sanitizedBody,
            headers: aiProxy.buildForwardHeaders(req),
            shopId: req.shopId,
            userId: req.user.id,
            user: req.user,
            authz: req.authz
          });
          res.status(resp.status).json(resp.data);
        });

        return testApp;
      };

      const branchManagerUser = { id: 77, role: 'manager', shopId: 10, organizationId: 5, isEmployee: true };
      const branchManagerAuthz = {
        role: { effectiveRole: 'manager' },
        tenant: { organizationId: 5, membershipStatus: 'active', isOwner: false, isOrgAdmin: false },
        scope: {
          activeShopId: 10,
          hasShopAccess: (id) => Number(id) === 10
        },
        permissions: {
          has: (p) => p === 'view_reports'
        }
      };

      it('allows branch manager on non-forecast AI route (/forward/api/insights/analyze) and mints internal RS256 token', async () => {
        const testApp = createProxyTestApp(branchManagerUser, branchManagerAuthz);

        const res = await request(testApp)
          .post('/forward/api/insights/analyze')
          .set('Authorization', 'Bearer external-client-jwt')
          .send({ revenue: [100, 200], costs: [50, 80] });

        expect(res.status).toBe(200);
        expect(axios).toHaveBeenCalledTimes(1);
        const sentHeaders = axios.mock.calls[0][0].headers;
        expect(sentHeaders.Authorization).not.toBe('Bearer external-client-jwt');

        const verified = jwt.verify(sentHeaders.Authorization.slice('Bearer '.length), TEST_PUBLIC_KEY, {
          algorithms: ['RS256'],
          issuer: 'zana-backend',
          audience: 'ai-service'
        });
        expect(verified).toMatchObject({
          id: 77,
          role: 'manager',
          shopId: 10,
          organizationId: 5
        });
      });

      it('blocks cross-shop body.shop_id tampering onboth forecast and non-forecast proxy routes with 403 SHOP_ACCESS_DENIED', async () => {
        const testApp = createProxyTestApp(branchManagerUser, branchManagerAuthz);

        const forecastRes = await request(testApp)
          .post('/forward/api/forecasting/rf-forecast')
          .set('Authorization', 'Bearer external-client-jwt')
          .send({ dates: ['2026-01-01'], values: [100], shop_id: '999' });
        expect(forecastRes.status).toBe(403);
        expect(forecastRes.body.code).toBe('SHOP_ACCESS_DENIED');

        const analyzeRes = await request(testApp)
          .post('/forward/api/insights/analyze')
          .set('Authorization', 'Bearer external-client-jwt')
          .send({ revenue: [100], shopId: 999 });
        expect(analyzeRes.status).toBe(403);
        expect(analyzeRes.body.code).toBe('SHOP_ACCESS_DENIED');
      });

      it('blocks cross-organization body.organization_id tampering on proxy routes with 403 TENANT_MISMATCH', async () => {
        const testApp = createProxyTestApp(branchManagerUser, branchManagerAuthz);

        const res = await request(testApp)
          .post('/forward/api/insights/analyze')
          .set('Authorization', 'Bearer external-client-jwt')
          .send({ revenue: [100], organization_id: 999 });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('TENANT_MISMATCH');
      });

      it('blocks non-org-admin from requesting organization-wide forecast (isOrgForecast: true) with 403 ORG_ADMIN_REQUIRED', async () => {
        const testApp = createProxyTestApp(branchManagerUser, branchManagerAuthz);

        const res = await request(testApp)
          .post('/forward/api/forecasting/rf-forecast')
          .set('Authorization', 'Bearer external-client-jwt')
          .send({ isOrgForecast: true, dates: ['2026-01-01'], values: [100] });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ORG_ADMIN_REQUIRED');
      });
    });
  });
});
