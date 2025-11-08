const express = require('express');
const axios = require('axios');
const router = express.Router();
const { auth } = require('../middleware/auth');
require('dotenv').config();

// Prefer explicit loopback address to avoid potential IPv6/host name resolution issues on Windows
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// Simple in-memory cache for health status
let lastHealth = { ok: null, timestamp: 0, details: null };
const HEALTH_TTL = 5000; // ms

async function probeHealth() {
  try {
    // /openapi.json is lightweight and reliable for health checks
    const resp = await axios.get(`${AI_SERVICE_URL}/openapi.json`, { timeout: 3000 });
    lastHealth = { ok: true, timestamp: Date.now(), details: { upstream: AI_SERVICE_URL } };
  } catch (err) {
    lastHealth = { ok: false, timestamp: Date.now(), details: { error: err.message, upstream: AI_SERVICE_URL } };
  }
}

// Kick off periodic health probe (non-blocking)
setInterval(() => {
  probeHealth().catch(() => {});
}, HEALTH_TTL).unref?.();

// GET health (cached)
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

// All AI proxy routes require authentication
router.use(auth);

// Generic forwarder for GET/POST/DELETE to AI service.
// We avoid complex path-to-regexp patterns here by using a middleware that
// extracts the forwarded path from req.originalUrl (looks for '/forward/').
router.use(async (req, res, next) => {
  try {
    const orig = req.originalUrl || req.url || '';
    const m = orig.match(/\/forward\/?(.*)$/);
    if (!m) return next(); // not a forward request
    const path = m[1] || '';
    const url = `${AI_SERVICE_URL}/${path}`;

    const forwardHeaders = { ...req.headers };
    // Remove hop-by-hop headers
    delete forwardHeaders['host'];
    delete forwardHeaders['content-length'];

    const axiosConfig = {
      headers: forwardHeaders,
      // raise timeout slightly to account for heavier ML endpoints during dev
      timeout: 30000,
      validateStatus: () => true,
    };

    let resp;
    if (req.method === 'GET' || req.method === 'DELETE') {
      resp = await axios({ method: req.method, url, params: req.query, ...axiosConfig });
    } else {
      resp = await axios({ method: req.method, url, data: req.body, params: req.query, ...axiosConfig });
    }

    // Proxy response status and data
    // Copy relevant headers (avoid setting 'transfer-encoding' etc.)
    const responseHeaders = { ...resp.headers };
    delete responseHeaders['transfer-encoding'];
    res.status(resp.status).set(responseHeaders).send(resp.data);
  } catch (err) {
    // Provide a clear error for upstream connection/timeouts so frontend can display
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
