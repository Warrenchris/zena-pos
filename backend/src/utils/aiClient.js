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

const VALID_ROLES = new Set(['user', 'cashier', 'manager', 'admin', 'org_admin', 'super_admin']);

const stripExternalAuthHeaders = (headers = {}) => {
  const sanitized = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization') {
        continue;
      }
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Resolves verified caller context for AI service authentication.
 * Never defaults or escalates to privileged roles ('admin', 'super_admin', 'org_admin', 'manager').
 * Context must be derived exclusively from trusted session (user object)
 * or explicit caller parameters with unprivileged defaults.
 */
const resolveCallerContext = (contextOrUserId, secondArg = 1) => {
  let user = null;
  let userId = null;
  let shopId = typeof secondArg === 'number' ? secondArg : 1;
  let organizationId = null;
  let isEmployee = false;
  let role = 'user'; // Safe unprivileged default: NEVER 'admin'

  if (contextOrUserId && typeof contextOrUserId === 'object' && !Array.isArray(contextOrUserId)) {
    // If a nested trusted user object is provided (e.g. { user: req.user, shopId: 1 })
    if (contextOrUserId.user && typeof contextOrUserId.user === 'object') {
      user = contextOrUserId.user;
    } else if (contextOrUserId.id !== undefined) {
      // User object was passed directly as context
      user = contextOrUserId;
    }

    if (user) {
      userId = user.id;
      // Derive role strictly from trusted user object; default to 'user' if not a recognized role
      const rawRole = typeof user.role === 'string' ? user.role : 'user';
      role = VALID_ROLES.has(rawRole) ? rawRole : 'user';

      // Employee accounts can never hold platform super_admin privileges
      if (user.isEmployee && role === 'super_admin') {
        role = 'user';
      }

      // Tenant and shop isolation:
      // If user is a cashier, employee (non-manager), or unprivileged role, strictly preserve their assigned shopId
      const requestedShopId = contextOrUserId.shopId;
      if (user.isEmployee && role !== 'manager') {
        shopId = user.shopId !== undefined && user.shopId !== null ? user.shopId : (requestedShopId || 1);
      } else if (role === 'cashier' || !['admin', 'org_admin', 'manager', 'super_admin'].includes(role)) {
        shopId = user.shopId !== undefined && user.shopId !== null ? user.shopId : (requestedShopId || 1);
      } else if (requestedShopId !== undefined && requestedShopId !== null) {
        // Verify multi-shop access if scope validator or accessibleShopIds list is present
        if (contextOrUserId.authz?.scope?.hasShopAccess && typeof contextOrUserId.authz.scope.hasShopAccess === 'function') {
          shopId = contextOrUserId.authz.scope.hasShopAccess(requestedShopId)
            ? requestedShopId
            : (user.shopId !== undefined && user.shopId !== null ? user.shopId : 1);
        } else if (Array.isArray(user.accessibleShopIds) && !user.isOwner && !['org_admin', 'super_admin'].includes(role)) {
          const allowedShops = user.accessibleShopIds.map(Number);
          shopId = allowedShops.includes(Number(requestedShopId))
            ? requestedShopId
            : (user.shopId !== undefined && user.shopId !== null ? user.shopId : 1);
        } else {
          shopId = requestedShopId;
        }
      } else {
        shopId = user.shopId !== undefined && user.shopId !== null ? user.shopId : 1;
      }

      // Lock organizationId to the trusted user session whenever present (prevent cross-org override)
      if (user.organizationId !== undefined && user.organizationId !== null) {
        organizationId = user.organizationId;
      } else if (role === 'super_admin') {
        organizationId = contextOrUserId.organizationId || null;
      } else {
        organizationId = null;
      }

      isEmployee = Boolean(user.isEmployee !== undefined ? user.isEmployee : contextOrUserId.isEmployee);
    } else {
      // Unnested config object without a trusted user object:
      // Never derive privileged roles ('admin', 'super_admin', 'org_admin', 'manager') from unverified config
      userId = contextOrUserId.userId;
      role = 'user';
      shopId = contextOrUserId.shopId !== undefined && contextOrUserId.shopId !== null
        ? contextOrUserId.shopId
        : (typeof secondArg === 'number' ? secondArg : 1);
      organizationId = contextOrUserId.organizationId || null;
      isEmployee = Boolean(contextOrUserId.isEmployee);
    }
  } else if (typeof contextOrUserId === 'number' || typeof contextOrUserId === 'string') {
    // Positional signature: userId passed directly
    userId = contextOrUserId;
    shopId = typeof secondArg === 'number' ? secondArg : 1;
    role = 'user';
    isEmployee = false;
  }

  return {
    userId,
    role,
    shopId,
    organizationId,
    isEmployee
  };
};

const getAuthHeader = (contextOrUserId, secondArg = 1, thirdArg = {}, fourthArg = false) => {
  let isPublic = false;

  if (typeof secondArg === 'number' || (typeof secondArg === 'string' && !isNaN(parseInt(secondArg, 10)))) {
    // Positional signature: (userId, shopId, existingHeaders, isPublic)
    isPublic = Boolean(fourthArg);
  } else if (typeof secondArg === 'object' && secondArg !== null) {
    // Signature: (contextObject, existingHeaders, isPublic)
    isPublic = Boolean(thirdArg);
  } else if (typeof secondArg === 'boolean') {
    // Signature: (contextObject, isPublic)
    isPublic = secondArg;
  }

  // Public endpoints (e.g. health probes) do not carry authentication headers
  if (isPublic) {
    return {};
  }

  // Internal AI service authentication strictly requires RS256 dynamic JWT signing.
  // Fail closed if JWT_PRIVATE_KEY is missing or empty.
  const privateKey = (process.env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!privateKey) {
    throw new Error('[aiClient] Cannot sign dynamic JWT token: JWT_PRIVATE_KEY is not configured.');
  }

  const callerContext = resolveCallerContext(contextOrUserId, secondArg);
  if (!callerContext.userId) {
    throw new Error('[aiClient] Cannot sign dynamic JWT token: userId is missing or invalid.');
  }

  try {
    const payload = {
      id: callerContext.userId,
      role: callerContext.role,
      shopId: callerContext.shopId,
      isEmployee: callerContext.isEmployee,
      ...(callerContext.organizationId !== null && callerContext.organizationId !== undefined ? { organizationId: callerContext.organizationId } : {})
    };

    const token = jwt.sign(
      payload,
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: '15m',
        issuer: 'zana-backend',
        audience: 'ai-service'
      }
    );
    return { Authorization: `Bearer ${token}` };
  } catch (err) {
    console.error('[aiClient] Error generating dynamic JWT token:', err.message);
    throw err;
  }
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
    const isPublic = config.isPublic || false;
    const sanitizedHeaders = stripExternalAuthHeaders(config.headers);
    const authHeader = getAuthHeader(config, sanitizedHeaders, isPublic);

    const mergedConfig = {
      ...config,
      headers: {
        ...sanitizedHeaders,
        ...authHeader
      }
    };
    // Clean helper properties
    delete mergedConfig.shopId;
    delete mergedConfig.userId;
    delete mergedConfig.user;
    delete mergedConfig.authz;
    delete mergedConfig.role;
    delete mergedConfig.organizationId;
    delete mergedConfig.isEmployee;
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
    const isPublic = config.isPublic || false;
    const sanitizedHeaders = stripExternalAuthHeaders(config.headers);
    const authHeader = getAuthHeader(config, sanitizedHeaders, isPublic);

    const mergedConfig = {
      ...config,
      headers: {
        ...sanitizedHeaders,
        ...authHeader
      }
    };
    delete mergedConfig.shopId;
    delete mergedConfig.userId;
    delete mergedConfig.user;
    delete mergedConfig.authz;
    delete mergedConfig.role;
    delete mergedConfig.organizationId;
    delete mergedConfig.isEmployee;
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
    const isPublic = config.isPublic || false;
    const sanitizedHeaders = stripExternalAuthHeaders(config.headers);
    const authHeader = getAuthHeader(config, sanitizedHeaders, isPublic);

    const mergedConfig = {
      ...config,
      url,
      headers: {
        ...sanitizedHeaders,
        ...authHeader
      }
    };
    delete mergedConfig.shopId;
    delete mergedConfig.userId;
    delete mergedConfig.user;
    delete mergedConfig.authz;
    delete mergedConfig.role;
    delete mergedConfig.organizationId;
    delete mergedConfig.isEmployee;
    delete mergedConfig.isPublic;

    try {
      const response = await axios(mergedConfig);
      return response;
    } catch (error) {
      handleAiError(error, url, isPublic);
    }
  },

  resolveCallerContext,
  getAuthHeader,
  stripExternalAuthHeaders
};

module.exports = aiClient;
