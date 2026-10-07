const express = require('express');
const aiClient = require('../utils/aiClient');
const aiCacheService = require('../services/aiCacheService');
const { createDistributedRateLimiter } = require('../utils/distributedRateLimiter');
const getClientIp = require('../utils/getClientIp');
const logger = require('../utils/logger');
const router = express.Router();
const { auth } = require('../middleware/auth');
const authzContext = require('../middleware/authzContext');
const authorize = require('../middleware/authorize');
const requireOrgAdmin = require('../middleware/requireOrgAdmin');
const { requireActiveSubscription } = require('../middleware/subscriptionEnforcement');
const entitlementService = require('../services/entitlementService');
const { sendUpgradePrompt } = require('../utils/upgradePrompt');
require('dotenv').config();

const AI_SERVICE_URL = process.env.AI_SERVICE_BASE_URL || process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// Distributed Rate Limiter: 20 requests per 15 minutes, tenant-scoped, fail-open
const aiRateLimiter = createDistributedRateLimiter({
  namespace: 'ai',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'Too many AI requests. Please wait before requesting new forecasts.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  keyGenerator: (req) => {
    const isOrg = req.body?.isOrgForecast || req.query?.isOrgForecast === 'true' || req.query?.scope === 'organization';
    const orgId = req.organizationId || req.user?.organizationId;
    if (isOrg && orgId) {
      return `org:${orgId}`;
    }
    const shopId = req.shopId || req.user?.shopId;
    if (shopId) {
      return `shop:${shopId}`;
    }
    const clientIp = getClientIp(req);
    return `ip:${clientIp}`;
  }
});

const HEALTH_TTL = 30000; // 30 seconds – re-probe inline if cached result is stale
let lastHealth = { ok: null, timestamp: 0, details: null };
let probeIntervalMs = 5000;
let probeTimer = null;
let consecutiveFailures = 0;

async function probeHealth() {
  try {
    await aiClient.get('/openapi.json', { timeout: 3000, isPublic: true });
    lastHealth = { ok: true, timestamp: Date.now(), details: { upstream: AI_SERVICE_URL } };
    consecutiveFailures = 0;
    probeIntervalMs = 5000;
  } catch (err) {
    consecutiveFailures++;
    probeIntervalMs = Math.min(5000 * Math.pow(2, Math.min(consecutiveFailures - 1, 4)), 60000);
    lastHealth = { ok: false, timestamp: Date.now(), details: { error: err.message, upstream: AI_SERVICE_URL } };
  } finally {
    scheduleNextProbe();
  }
}

function scheduleNextProbe() {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    probeHealth().catch(() => {});
  }, probeIntervalMs);
  if (probeTimer.unref) probeTimer.unref();
}

function stopProbe() {
  if (probeTimer) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
}

// Don't start the background probe in test environments
if (process.env.NODE_ENV !== 'test') {
  scheduleNextProbe();
}

router.get('/status', async (req, res) => {
  try {
    if (!lastHealth || (Date.now() - lastHealth.timestamp) > HEALTH_TTL) {
      await probeHealth();
    }
    return res.json({
      ok: lastHealth.ok,
      status: lastHealth.ok ? 'operational' : 'degraded',
      timestamp: lastHealth.timestamp
    });
  } catch (err) {
    return res.status(502).json({
      success: false,
      ok: false,
      error: 'AI health probe failed',
      code: 'AI_HEALTH_PROBE_FAILED',
      requestId: req.requestId || req.id
    });
  }
});

router.use(auth);
router.use(authzContext);
router.use(requireActiveSubscription());

router.use('/forward/api/forecasting', aiRateLimiter);
router.use('/forward/api/insights', aiRateLimiter);
router.use('/forward/api/finance', aiRateLimiter);

router.delete('/cache/org/:organizationId',
  authorize({
    requireOrgAdmin: true,
    tenantMismatchMessage: 'Access denied: cannot clear cache for another organization'
  }),
  requireOrgAdmin,
  async (req, res) => {
    const { organizationId } = req.params;
    const targetOrgId = parseInt(organizationId, 10);
    if (targetOrgId !== req.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: cannot clear cache for another organization',
        code: 'FORBIDDEN_ORGANIZATION_ACCESS',
        requestId: req.requestId || req.id
      });
    }
    const keysCleared = await aiCacheService.invalidateOrgForecastCache(targetOrgId);
    return res.json({
      success: true,
      message: 'Organization forecast cache cleared',
      keysCleared,
      requestId: req.requestId || req.id
    });
  }
);

router.delete('/cache/:shopId',
  authorize({
    roles: ['admin', 'manager', 'org_admin'],
    shopScope: { param: 'shopId' }
  }),
  async (req, res) => {
    const { shopId } = req.params;
    const targetShopId = parseInt(shopId, 10);
    const userOrgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;

    const keysCleared = await aiCacheService.invalidateShopForecastCache(userOrgId, targetShopId);
    return res.json({
      success: true,
      message: 'Forecast cache cleared',
      keysCleared,
      requestId: req.requestId || req.id
    });
  }
);

const forecastAuthzPolicy = authorize({
  permission: 'view_reports',
  custom: (req, authz) => {
    const isOrg = req.body?.isOrgForecast || req.query?.isOrgForecast === 'true' || req.query?.scope === 'organization';
    if (isOrg) {
      if (!authz.tenant.isOrgAdmin) {
        return {
          allowed: false,
          status: 403,
          code: 'ORG_ADMIN_REQUIRED',
          message: 'Access denied: Organization admin or owner privileges required for organization-wide forecasting.'
        };
      }
    } else {
      const shopId = req.shopId || req.user?.shopId;
      if (!shopId) {
        return {
          allowed: false,
          status: 403,
          code: 'SHOP_CONTEXT_REQUIRED',
          message: 'Shop context required for branch forecasting.'
        };
      }
      if (!authz.scope.hasShopAccess(shopId)) {
        return {
          allowed: false,
          status: 403,
          code: 'SHOP_ACCESS_DENIED',
          message: 'Access denied: You do not have access to this branch.'
        };
      }
    }
    return { allowed: true };
  }
});

router.post('/forward/api/forecasting/forecast', forecastAuthzPolicy, async (req, res, next) => {
  try {
    const isOrg = req.body?.isOrgForecast || req.query?.isOrgForecast === 'true' || req.query?.scope === 'organization';
    const orgId = req.organizationId || req.user?.organizationId;
    const shopId = req.shopId || req.user?.shopId;

    if (isOrg && orgId) {
      const featRes = await entitlementService.canUseFeature(orgId, 'org_insights');
      if (!featRes.allowed) {
        const { plan } = await entitlementService.getOrganizationEntitlements(orgId);
        return sendUpgradePrompt(res, {
          type: 'feature',
          key: 'org_insights',
          currentPlan: plan,
          requiredPlan: 'growth',
          reason: featRes.reason || 'Organization-level forecasting requires Growth or Pro plan.'
        });
      }
    }

    const periods = req.query.periods || req.body.periods || 30;
    const cacheKey = (isOrg && orgId)
      ? aiCacheService.buildOrgForecastCacheKey(orgId, req.body, periods, 'prophet')
      : aiCacheService.buildForecastCacheKey(orgId, shopId, req.body, periods, 'prophet');

    const cached = await aiCacheService.getForecast(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, cache_hit: true });
    }

    const forwardHeaders = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];
    if (req.requestId) {
      forwardHeaders['x-request-id'] = req.requestId;
    }

    const resp = await aiClient.request({
      method: 'POST',
      url: `/api/forecasting/forecast?periods=${periods}`,
      data: req.body,
      headers: forwardHeaders,
      timeout: 30000,
      validateStatus: () => true,
      shopId,
      userId: req.user?.id
    });

    if (resp.status >= 200 && resp.status < 300) {
      const responseData = typeof resp.data === 'object' && resp.data !== null
        ? { ...resp.data, cached: false }
        : { data: resp.data, cached: false };
      await aiCacheService.setForecast(cacheKey, responseData);
      return res.status(resp.status).json(responseData);
    }

    // Upstream returned non-2xx
    logger.warn(`[aiProxy:forecast] Upstream returned status ${resp.status}`, {
      requestId: req.requestId || req.id,
      shopId,
      orgId
    });
    return res.status(resp.status).json(resp.data);
  } catch (err) {
    const status = err.response?.status || 503;
    logger.error(`[aiProxy:forecast] Upstream AI failure (status=${status}): ${err.message}`, {
      requestId: req.requestId || req.id,
      url: req.originalUrl,
      error: err.message
    });
    return res.status(status).json({
      success: false,
      error: 'AI service temporarily unavailable',
      code: 'AI_SERVICE_UNAVAILABLE',
      requestId: req.requestId || req.id
    });
  }
});

router.post('/forward/api/forecasting/rf-forecast', forecastAuthzPolicy, async (req, res, next) => {
  const startTime = Date.now();
  const isOrg = req.body?.isOrgForecast || req.query?.isOrgForecast === 'true' || req.query?.scope === 'organization';
  const shopId = req.shopId || req.user?.shopId || 'unknown';
  const periods = req.body.periods || 30;
  const datesCount = Array.isArray(req.body.dates) ? req.body.dates.length : 0;

  try {
    const orgId = req.organizationId || req.user?.organizationId;
    if (isOrg && orgId) {
      const featRes = await entitlementService.canUseFeature(orgId, 'org_insights');
      if (!featRes.allowed) {
        const { plan } = await entitlementService.getOrganizationEntitlements(orgId);
        return sendUpgradePrompt(res, {
          type: 'feature',
          key: 'org_insights',
          currentPlan: plan,
          requiredPlan: 'growth',
          reason: featRes.reason || 'Organization-level forecasting requires Growth or Pro plan.'
        });
      }
    }

    const cacheKey = (isOrg && orgId)
      ? aiCacheService.buildOrgForecastCacheKey(orgId, req.body, periods, 'rf')
      : aiCacheService.buildForecastCacheKey(orgId, shopId, req.body, periods, 'rf');

    const cached = await aiCacheService.getForecast(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, cache_hit: true });
    }

    const forwardHeaders = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];
    if (req.requestId) {
      forwardHeaders['x-request-id'] = req.requestId;
    }

    const resp = await aiClient.request({
      method: 'POST',
      url: '/api/forecasting/rf-forecast',
      data: req.body,
      headers: forwardHeaders,
      timeout: 30000,
      validateStatus: () => true,
      shopId,
      userId: req.user?.id
    });

    const duration = Date.now() - startTime;

    if (resp.status >= 200 && resp.status < 300) {
      const responseData = typeof resp.data === 'object' && resp.data !== null
        ? { ...resp.data, cached: false }
        : { data: resp.data, cached: false };
      await aiCacheService.setForecast(cacheKey, responseData);
      return res.status(resp.status).json(responseData);
    }

    // Safe diagnostic log on upstream error (no secrets or sensitive data)
    const errField = resp.data?.field || 'unknown';
    const errMsg = resp.data?.message || resp.data?.detail || JSON.stringify(resp.data);
    logger.warn(`[aiProxy:rf-forecast] Upstream error status=${resp.status} (${duration}ms, dates=${datesCount}): field=${errField}, message=${errMsg}`, {
      requestId: req.requestId || req.id
    });

    return res.status(resp.status).json(resp.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    const status = err.response?.status || 503;
    logger.error(`[aiProxy:rf-forecast] Proxy failure (${duration}ms): ${err.message}`, {
      requestId: req.requestId || req.id,
      url: req.originalUrl,
      error: err.message
    });
    return res.status(status).json({
      success: false,
      error: 'AI service temporarily unavailable',
      code: 'AI_SERVICE_UNAVAILABLE',
      requestId: req.requestId || req.id
    });
  }
});

router.use(authorize({ permission: 'view_reports' }), async (req, res, next) => {
  try {
    const orig = req.originalUrl || req.url || '';
    const m = orig.match(/\/forward\/?(.*)$/);
    if (!m) return next();
    const path = m[1] || '';
    const forwardHeaders = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];
    if (req.requestId) {
      forwardHeaders['x-request-id'] = req.requestId;
    }

    const axiosConfig = {
      headers: forwardHeaders,
      timeout: 30000,
      validateStatus: () => true,
    };

    const shopId = req.shopId || req.user?.shopId;
    const userId = req.user?.id;
    let resp;
    if (req.method === 'GET' || req.method === 'DELETE') {
      resp = await aiClient.request({ method: req.method, url: path, params: req.query, shopId, userId, ...axiosConfig });
    } else {
      resp = await aiClient.request({ method: req.method, url: path, data: req.body, params: req.query, shopId, userId, ...axiosConfig });
    }

    const responseHeaders = { ...resp.headers };
    delete responseHeaders['transfer-encoding'];

    let responseData = resp.data;
    if (typeof responseData === 'object' && responseData !== null && req.method !== 'GET') {
      responseData = { ...responseData, cached: false };
    }

    res.status(resp.status).set(responseHeaders).send(responseData);
  } catch (err) {
    const status = err.response?.status || 503;
    logger.error(`[aiProxy:forward] Upstream AI failure (status=${status}): ${err.message}`, {
      requestId: req.requestId || req.id,
      url: req.originalUrl,
      error: err.message
    });
    return res.status(status).json({
      success: false,
      error: 'AI service temporarily unavailable',
      code: 'AI_SERVICE_UNAVAILABLE',
      requestId: req.requestId || req.id
    });
  }
});

module.exports = router;
module.exports.forecastCache = aiCacheService.l1Cache;
module.exports.buildForecastCacheKey = aiCacheService.buildForecastCacheKey;
module.exports.buildOrgForecastCacheKey = aiCacheService.buildOrgForecastCacheKey;
module.exports.stopProbe = stopProbe;
