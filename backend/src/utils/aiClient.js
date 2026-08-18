const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const AI_SERVICE_BASE_URL = process.env.AI_SERVICE_BASE_URL || process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const normalizeUrl = (base, path) => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  const relativePath = path.startsWith('/') ? path.slice(1) : path;
  return new URL(relativePath, baseUrl).toString();
};

const getAuthHeader = (userId, shopId = 1, existingHeaders = {}, isPublic = false) => {
  // Check if Authorization header is already present (case-insensitive)
  const hasAuth = Object.keys(existingHeaders).some(
    k => k.toLowerCase() === 'authorization'
  );
  if (hasAuth) {
    return {};
  }

  // If public endpoint, don't sign a dynamic token (only inject API key if present)
  if (isPublic) {
    if (process.env.AI_SERVICE_API_KEY) {
      const token = process.env.AI_SERVICE_API_KEY.startsWith('Bearer ')
        ? process.env.AI_SERVICE_API_KEY
        : `Bearer ${process.env.AI_SERVICE_API_KEY}`;
      return { Authorization: token };
    }
    return {};
  }

  // 1. If AI_SERVICE_API_KEY is configured in env, use it
  if (process.env.AI_SERVICE_API_KEY) {
    const token = process.env.AI_SERVICE_API_KEY.startsWith('Bearer ')
      ? process.env.AI_SERVICE_API_KEY
      : `Bearer ${process.env.AI_SERVICE_API_KEY}`;
    return { Authorization: token };
  }

  // 2. Otherwise, generate a JWT token dynamically using the private key
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (privateKey) {
    if (!userId) {
      throw new Error('[aiClient] Cannot sign dynamic JWT token: userId is missing or invalid.');
    }
    try {
      const token = jwt.sign(
        { id: userId, role: 'admin', shopId: shopId, isEmployee: false },
        privateKey,
        { algorithm: 'RS256', expiresIn: '1h' }
      );
      return { Authorization: `Bearer ${token}` };
    } catch (err) {
      console.error('[aiClient] Error generating dynamic JWT token:', err.message);
      throw err;
    }
  }

  return {};
};

const handleAiError = (error, url, isPublic = false) => {
  const status = error.response?.status;
  const responseData = error.response?.data;

  // Don't spam full error logs if a background health probe failed due to connection refused
  if (!isPublic) {
    console.error(`[aiClient] Error requesting AI service endpoint ${url}:`, {
      message: error.message,
      status,
      responseData
    });
  }

  if (status === 401) {
    const newError = new Error('AI service authentication failed — check server configuration');
    newError.status = 503;
    newError.details = responseData;
    throw newError;
  }

  throw error;
};

const aiClient = {
  post: async (path, data, config = {}) => {
    const url = normalizeUrl(AI_SERVICE_BASE_URL, path);
    const shopId = config.shopId || 1;
    const userId = config.userId;
    const isPublic = config.isPublic || false;
    const authHeader = getAuthHeader(userId, shopId, config.headers || {}, isPublic);

    const mergedConfig = {
      ...config,
      headers: {
        ...authHeader,
        ...(config.headers || {})
      }
    };
    // Clean helper properties
    delete mergedConfig.shopId;
    delete mergedConfig.userId;
    delete mergedConfig.isPublic;

    try {
      const response = await axios.post(url, data, mergedConfig);
      return response;
    } catch (error) {
      handleAiError(error, url, isPublic);
    }
  },

  get: async (path, config = {}) => {
    const url = normalizeUrl(AI_SERVICE_BASE_URL, path);
    const shopId = config.shopId || 1;
    const userId = config.userId;
    const isPublic = config.isPublic || false;
    const authHeader = getAuthHeader(userId, shopId, config.headers || {}, isPublic);

    const mergedConfig = {
      ...config,
      headers: {
        ...authHeader,
        ...(config.headers || {})
      }
    };
    delete mergedConfig.shopId;
    delete mergedConfig.userId;
    delete mergedConfig.isPublic;

    try {
      const response = await axios.get(url, mergedConfig);
      return response;
    } catch (error) {
      handleAiError(error, url, isPublic);
    }
  },

  request: async (config = {}) => {
    const path = config.url || config.path || '';
    const url = normalizeUrl(AI_SERVICE_BASE_URL, path);
    const shopId = config.shopId || 1;
    const userId = config.userId;
    const isPublic = config.isPublic || false;
    const authHeader = getAuthHeader(userId, shopId, config.headers || {}, isPublic);

    const mergedConfig = {
      ...config,
      url,
      headers: {
        ...authHeader,
        ...(config.headers || {})
      }
    };
    delete mergedConfig.shopId;
    delete mergedConfig.userId;
    delete mergedConfig.isPublic;

    try {
      const response = await axios(mergedConfig);
      return response;
    } catch (error) {
      handleAiError(error, url, isPublic);
    }
  }
};

module.exports = aiClient;
