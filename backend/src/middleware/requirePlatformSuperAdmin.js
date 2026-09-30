'use strict';

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const tokenRevocationService = require('../services/tokenRevocationService');
const { createDistributedRateLimiter } = require('../utils/distributedRateLimiter');
const getClientIp = require('../utils/getClientIp');
const logger = require('../utils/logger');

// Local in-memory cache for verified super-admin IDs (never reverts)
const verifiedCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCachedVerification(userId) {
  const record = verifiedCache.get(userId);
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    verifiedCache.delete(userId);
    return null;
  }
  return record.verified;
}

function setCachedVerification(userId, verified) {
  if (verifiedCache.size > 5000) verifiedCache.clear();
  verifiedCache.set(userId, { verified, expiresAt: Date.now() + CACHE_TTL_MS });
}

function clearVerifiedCache() {
  verifiedCache.clear();
}

/**
 * Distributed rate limiter for platform operator endpoints.
 * 120 requests/minute per authenticated user (or IP if unauthenticated).
 */
const platformRateLimiter = createDistributedRateLimiter({
  namespace: 'platform',
  windowMs: 60 * 1000,
  max: 120,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => `${req.user?.id || getClientIp(req)}`,
  message: { error: 'Too many platform requests. Please try again later.' }
});

/**
 * Strict authentication & authorization middleware for /api/platform/* endpoints.
 * Enforces:
 * 1. Valid RS256 JWT
 * 2. Token not revoked (JTI + password reset cutoff)
 * 3. User role must be authoritatively 'super_admin'
 * 4. Account must be active
 * 5. Mandatory verified email (NO grace period for platform operator)
 * 6. Tenant isolation: explicitly strips req.shopId and req.organizationId
 */
async function requirePlatformSuperAdmin(req, res, next) {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    let decoded;
    try {
      decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired.' });
      }
      return res.status(401).json({ error: 'Invalid authentication token.' });
    }

    if (decoded.purpose === 'password_reset') {
      return res.status(401).json({ error: 'Invalid token purpose: reset tokens cannot be used for session authentication.' });
    }

    // 1. Token revocation check
    if (decoded.jti) {
      const isRevoked = await tokenRevocationService.isTokenRevoked(decoded.jti);
      if (isRevoked) {
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
      }
    }

    if (decoded.id && decoded.iat) {
      const isRevokedByCutoff = await tokenRevocationService.isUserTokenRevoked(
        decoded.id,
        !!decoded.isEmployee,
        decoded.iat
      );
      if (isRevokedByCutoff) {
        return res.status(401).json({ error: 'Token has been revoked due to password change. Please log in again.' });
      }
    }

    // 2. JWT Role pre-check
    if (decoded.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied: platform super-admin privileges required.' });
    }

    // 3. Database authoritative role, status, and email verification check
    const isCachedVerified = getCachedVerification(decoded.id);
    let user;

    if (!isCachedVerified) {
      user = await User.findByPk(decoded.id, {
        attributes: ['id', 'email', 'role', 'active', 'emailVerifiedAt']
      });

      if (!user) {
        return res.status(401).json({ error: 'User does not exist.' });
      }

      if (!user.active) {
        return res.status(401).json({ error: 'Account is deactivated.' });
      }

      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Access denied: platform super-admin privileges required.' });
      }

      // 4. Mandatory verified email (NO grace period)
      if (!user.emailVerifiedAt) {
        return res.status(403).json({
          error: 'Super-admin email must be verified before accessing platform operations.',
          code: 'EMAIL_VERIFICATION_REQUIRED'
        });
      }

      setCachedVerification(user.id, true);
    }

    // 5. Tenant context isolation: explicitly nullify tenant scoping
    req.user = decoded;
    req.shopId = null;
    req.organizationId = null;

    next();
  } catch (error) {
    logger.error('Error in requirePlatformSuperAdmin middleware:', error);
    return res.status(500).json({ error: 'Internal authorization error.' });
  }
}

module.exports = {
  requirePlatformSuperAdmin,
  platformRateLimiter,
  clearVerifiedCache
};
