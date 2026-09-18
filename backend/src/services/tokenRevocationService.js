'use strict';

const redisClient = require('../config/redis');
const logger = require('../utils/logger');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Organization = require('../models/Organization');

const STATUS_CACHE_TTL = 300; // 5 minutes for active status
const TOMBSTONE_CACHE_TTL = 86400; // 24 hours for inactive/suspended status
const inMemoryCutoffs = new Map();

const tokenRevocationService = {
  /**
   * Revoke a specific token JTI in Redis with TTL until token expiration.
   */
  async revokeToken(jti, exp = null) {
    if (!jti) return;
    try {
      if (redisClient && redisClient.status === 'ready') {
        let ttl = TOMBSTONE_CACHE_TTL;
        if (exp) {
          const nowSeconds = Math.floor(Date.now() / 1000);
          ttl = Math.max(1, exp - nowSeconds);
        }
        await redisClient.setex(`revoked_token:${jti}`, ttl, 'revoked');
        logger.info(`[AUTH-01] Token JTI ${jti} revoked in Redis (TTL: ${ttl}s).`);
      }
    } catch (err) {
      logger.warn(`[AUTH-01] Redis error revoking token ${jti}:`, err.message);
    }
  },

  /**
   * Check if a token JTI has been revoked.
   */
  async isTokenRevoked(jti) {
    if (!jti) return false;
    try {
      if (redisClient && redisClient.status === 'ready') {
        const val = await redisClient.get(`revoked_token:${jti}`);
        return val === 'revoked' || val === 'used';
      }
    } catch (err) {
      logger.warn(`[AUTH-01] Redis error checking revoked token ${jti}:`, err.message);
    }
    return false;
  },

  /**
   * Revoke all existing session tokens for a user or employee (AUTH-02, AUTH-03).
   * Sets a cutoff timestamp (in seconds). Any token issued at or before this cutoff is invalid.
   */
  async revokeAllUserTokens(id, isEmployee, cutoff = null) {
    if (!id) return;
    const cutoffSec = cutoff !== null ? Number(cutoff) : Math.floor(Date.now() / 1000);
    const key = `revoked_tokens_cutoff:${isEmployee ? 'employee' : 'user'}:${id}`;

    // In-memory cache for fallback & tests
    inMemoryCutoffs.set(key, cutoffSec);

    try {
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.setex(key, TOMBSTONE_CACHE_TTL, String(cutoffSec));
        logger.info(`[AUTH-02/03] All tokens for ${isEmployee ? 'employee' : 'user'} ${id} revoked before cutoff ${cutoffSec}.`);
      }
    } catch (err) {
      logger.warn(`[AUTH-02/03] Redis error revoking user tokens for ${id}:`, err.message);
    }
  },

  /**
   * Check if a token for a user/employee was issued before the revocation cutoff (AUTH-02, AUTH-03).
   */
  async isUserTokenRevoked(id, isEmployee, iat) {
    if (!id || iat === undefined || iat === null) return false;
    const key = `revoked_tokens_cutoff:${isEmployee ? 'employee' : 'user'}:${id}`;
    let cutoff = null;

    try {
      if (redisClient && redisClient.status === 'ready') {
        const val = await redisClient.get(key);
        if (val !== null && val !== undefined) {
          cutoff = Number(val);
        }
      }
    } catch (err) {
      logger.warn(`[AUTH-02/03] Redis error checking user token cutoff for ${id}:`, err.message);
    }

    // Fall back to in-memory cache if Redis didn't return a value
    if (cutoff === null && inMemoryCutoffs.has(key)) {
      cutoff = inMemoryCutoffs.get(key);
    }

    if (cutoff !== null) {
      return Number(iat) <= cutoff;
    }
    return false;
  },

  /**
   * Get the current revocation cutoff timestamp for a user/employee, if any.
   */
  async getUserTokenCutoff(id, isEmployee) {
    if (!id) return null;
    const key = `revoked_tokens_cutoff:${isEmployee ? 'employee' : 'user'}:${id}`;
    try {
      if (redisClient && redisClient.status === 'ready') {
        const val = await redisClient.get(key);
        if (val !== null && val !== undefined) return Number(val);
      }
    } catch (err) {
      logger.warn(`[AUTH-02/03] Redis error getting token cutoff for ${id}:`, err.message);
    }
    if (inMemoryCutoffs.has(key)) {
      return inMemoryCutoffs.get(key);
    }
    return null;
  },

  /**
   * Clear in-memory and Redis cutoff (primarily for testing cleanup).
   */
  async clearUserTokenCutoff(id, isEmployee) {
    if (!id) return;
    const key = `revoked_tokens_cutoff:${isEmployee ? 'employee' : 'user'}:${id}`;
    inMemoryCutoffs.delete(key);
    try {
      if (redisClient && redisClient.status === 'ready') {
        await redisClient.del(key);
      }
    } catch (err) {
      // ignore
    }
  },

  /**
   * Mark user/employee status in Redis immediately (e.g., on deactivation, termination, or reactivation).
   */
  async setUserStatus(id, isEmployee, status) {
    if (!id) return;
    try {
      if (redisClient && redisClient.status === 'ready') {
        const key = `auth_status:${isEmployee ? 'employee' : 'user'}:${id}`;
        const ttl = status === 'active' ? STATUS_CACHE_TTL : TOMBSTONE_CACHE_TTL;
        await redisClient.setex(key, ttl, status);
        logger.info(`[AUTH-01] Updated cached status for ${isEmployee ? 'employee' : 'user'} ${id} to '${status}'.`);
      }
    } catch (err) {
      logger.warn(`[AUTH-01] Redis error setting user status for ${id}:`, err.message);
    }
  },

  /**
   * Get active status for user or employee. Checks Redis first, then DB fallback.
   */
  async getUserStatus(id, isEmployee) {
    if (!id) return 'inactive';
    const key = `auth_status:${isEmployee ? 'employee' : 'user'}:${id}`;
    
    // 1. Check Redis
    try {
      if (redisClient && redisClient.status === 'ready') {
        const cached = await redisClient.get(key);
        if (cached) return cached;
      }
    } catch (err) {
      logger.warn(`[AUTH-01] Redis error getting user status for ${id}:`, err.message);
    }

    // 2. Query MySQL fallback
    try {
      let status = 'inactive';
      if (isEmployee) {
        const emp = await Employee.findByPk(id, { attributes: ['id', 'status'] });
        status = emp && emp.status === 'active' ? 'active' : 'inactive';
      } else {
        const user = await User.findByPk(id, { attributes: ['id', 'active'] });
        status = user && user.active ? 'active' : 'inactive';
      }

      // Cache authoritative DB result in Redis
      if (redisClient && redisClient.status === 'ready') {
        const ttl = status === 'active' ? STATUS_CACHE_TTL : TOMBSTONE_CACHE_TTL;
        await redisClient.setex(key, ttl, status);
      }

      return status;
    } catch (dbErr) {
      logger.error(`[AUTH-01] DB error checking status for ${id}:`, dbErr.message);
      // Fail closed if DB check fails for safety
      return 'inactive';
    }
  },

  /**
   * Mark organization status in Redis (e.g. trialing, active, suspended, canceled).
   */
  async setOrgStatus(orgId, status) {
    if (!orgId) return;
    try {
      if (redisClient && redisClient.status === 'ready') {
        const key = `auth_status:org:${orgId}`;
        const ttl = status === 'active' || status === 'trialing' ? STATUS_CACHE_TTL : TOMBSTONE_CACHE_TTL;
        await redisClient.setex(key, ttl, status);
        logger.info(`[AUTH-01] Updated cached status for org ${orgId} to '${status}'.`);
      }
    } catch (err) {
      logger.warn(`[AUTH-01] Redis error setting org status for ${orgId}:`, err.message);
    }
  },

  /**
   * Get organization status. Checks Redis first, then DB fallback.
   */
  async getOrgStatus(orgId) {
    if (!orgId) return null;
    const key = `auth_status:org:${orgId}`;

    try {
      if (redisClient && redisClient.status === 'ready') {
        const cached = await redisClient.get(key);
        if (cached) return cached;
      }
    } catch (err) {
      logger.warn(`[AUTH-01] Redis error getting org status for ${orgId}:`, err.message);
    }

    try {
      let status = 'active';
      const entitlementService = require('./entitlementService');
      const entitlements = await entitlementService.getOrganizationEntitlements(orgId);
      if (entitlements?.subscription) {
        status = entitlementService.getEffectiveSubscriptionStatus(entitlements.subscription);
      } else {
        const org = await Organization.findByPk(orgId, { attributes: ['id', 'status'] });
        status = org?.status || 'active';
      }

      if (redisClient && redisClient.status === 'ready') {
        const ttl = status === 'active' || status === 'trialing' ? STATUS_CACHE_TTL : TOMBSTONE_CACHE_TTL;
        await redisClient.setex(key, ttl, status);
      }

      return status;
    } catch (err) {
      logger.warn(`[AUTH-01] Error getting organization status for ${orgId}:`, err.message);
      return 'active';
    }
  }
};

module.exports = tokenRevocationService;
