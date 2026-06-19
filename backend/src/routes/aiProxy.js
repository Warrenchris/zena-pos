const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;
const NodeCache = require('node-cache');
const router = express.Router();
const { auth, checkRole } = require('../middleware/auth');
require('dotenv').config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const forecastCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

function buildForecastCacheKey(shopId, requestBody, periods) {
  const dataHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      dates: requestBody.dates,
      values: requestBody.values,
      periods: periods ?? requestBody.periods
    }))
    .digest('hex')
    .substring(0, 16);
  return `forecast:${shopId}:${dataHash}`;
}

const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many AI requests. Please wait before requesting new forecasts.',
    retryAfter: '15 minutes'
  },
  keyGenerator: (req) => req.shopId || ipKeyGenerator(req),
});

let lastHealth = { ok: null, timestamp: 0, details: null };
const HEALTH_TTL = 5000;

async function probeHealth() {
  try {
    const resp = await axios.get(`${AI_SERVICE_URL}/openapi.json`, { timeout: 3000 });
    lastHealth = { ok: true, timestamp: Date.now(), details: { upstream: AI_SERVICE_URL } };
  } catch (err) {
    lastHealth = { ok: false, timestamp: Date.now(), details: { error: err.message, upstream: AI_SERVICE_URL } };
  }
}

setInterval(() => {
  probeHealth().catch((err) => {
    console.error('[aiProxy] Health probe failed:', err.message);
  });
}, HEALTH_TTL).unref?.();

router.get('/status', async (req, res) => {
  try {
    if (!lastHealth || (Date.now() - lastHealth.timestamp) > HEALTH_TTL) {
      await probeHealth();
    }
    return res.json(lastHealth);
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'AI health probe failed', details: err.message });
  }
});

router.use(auth);

router.use('/forward/api/forecasting', aiRateLimiter);
router.use('/forward/api/insights', aiRateLimiter);
router.use('/forward/api/finance', aiRateLimiter);

router.delete('/cache/:shopId', checkRole(['admin']), (req, res) => {
  const { shopId } = req.params;
  const keys = forecastCache.keys().filter((key) => key.startsWith(`forecast:${shopId}:`));
  keys.forEach((key) => forecastCache.del(key));
  return res.json({ message: 'Forecast cache cleared', keysCleared: keys.length });
});

router.post('/forward/api/forecasting/forecast', async (req, res, next) => {
  try {
    const shopId = req.shopId || req.user?.shopId;
    const periods = req.query.periods || req.body.periods || 30;
    const cacheKey = buildForecastCacheKey(shopId, req.body, periods);
    const cached = forecastCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, cache_hit: true });
    }

    const url = `${AI_SERVICE_URL}/api/forecasting/forecast?periods=${periods}`;

    const forwardHeaders = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];

    const resp = await axios({
      method: 'POST',
      url,
      data: req.body,
      headers: forwardHeaders,
      timeout: 30000,
      validateStatus: () => true,
    });

    if (resp.status >= 200 && resp.status < 300) {
      const responseData = typeof resp.data === 'object' && resp.data !== null
        ? { ...resp.data, cached: false }
        : { data: resp.data, cached: false };
      forecastCache.set(cacheKey, responseData);
      return res.status(resp.status).json(responseData);
    }

    return res.status(resp.status).json(resp.data);
  } catch (err) {
    const status = err.response?.status || 503;
    const data = err.response?.data || {
      error: 'Upstream AI service unreachable',
      details: err.message,
      upstream: AI_SERVICE_URL,
    };
    return res.status(status).json(data);
  }
});

router.use(async (req, res, next) => {
  try {
    const orig = req.originalUrl || req.url || '';
    const m = orig.match(/\/forward\/?(.*)$/);
    if (!m) return next();
    const path = m[1] || '';
    const url = `${AI_SERVICE_URL}/${path}`;

    const forwardHeaders = { ...req.headers };
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];

    const axiosConfig = {
      headers: forwardHeaders,
      timeout: 30000,
      validateStatus: () => true,
    };

    let resp;
    if (req.method === 'GET' || req.method === 'DELETE') {
      resp = await axios({ method: req.method, url, params: req.query, ...axiosConfig });
    } else {
      resp = await axios({ method: req.method, url, data: req.body, params: req.query, ...axiosConfig });
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
    const data = err.response?.data || {
      error: 'Upstream AI service unreachable',
      details: err.message,
      upstream: AI_SERVICE_URL,
    };
    return res.status(status).json(data);
  }
});

module.exports = router;
module.exports.forecastCache = forecastCache;
