const express = require('express');
const axios = require('axios');
const router = express.Router();
const { testConnection } = require('../config/database');
require('dotenv').config();

const AI_PROXY = process.env.AI_PROXY_URL || 'http://localhost:3000/api/ai/status';

router.get('/', async (req, res) => {
  const results = {
    ai: { ok: null },
    db: { ok: null }
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

    const ok = results.ai.ok && results.db.ok;
    return res.status(ok ? 200 : 503).json({ ok, results });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
