const express = require('express');
const axios = require('axios');
const router = express.Router();
const { testConnection } = require('../config/database');
const { auth, checkRole } = require('../middleware/auth');
const permissionCache = require('../services/permissionCache');
require('dotenv').config();

const AI_PROXY = process.env.AI_PROXY_URL || 'http://localhost:3000/api/ai/status';

router.get('/', async (req, res) => {
  const results = {
    ai: { ok: null },
    db: { ok: null },
    permissionCache: { ok: null }
  };
  try {
    // AI via proxy
    try {
      const aiResp = await axios.get(AI_PROXY, { timeout: 3000 });
      results.ai = { ok: true, details: aiResp.data };
    } catch (err) {
      results.ai = { ok: false, details: err.response?.data || err.message };
    }

    // DB connection
    try {
      await testConnection();
      results.db = { ok: true };
    } catch (err) {
      results.db = { ok: false, details: err.message };
    }

    // Permission cache stats
    try {
      const cacheStats = permissionCache.getCacheStats();
      results.permissionCache = { ok: true, stats: cacheStats };
    } catch (err) {
      results.permissionCache = { ok: false, details: err.message };
    }

    const ok = results.ai.ok && results.db.ok;
    return res.status(ok ? 200 : 503).json({ ok, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin-only route to get detailed cache stats
router.get('/cache-stats', auth, checkRole(['admin']), (req, res) => {
  try {
    const stats = permissionCache.getCacheStats();
    res.json({
      success: true,
      cache: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
