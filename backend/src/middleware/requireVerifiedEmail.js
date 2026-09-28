'use strict';

const jwt = require('jsonwebtoken');
const { User, OrganizationMembership } = require('../models');
const { isEmailConfigured } = require('../services/emailService');
const logger = require('../utils/logger');

// Startup warning logged once if email is not configured
let warnedOnce = false;
if (!isEmailConfigured()) {
  logger.warn('[emailVerification] SMTP_HOST/SMTP_PORT not configured — email verification 7-day hard gate will fail open.');
  warnedOnce = true;
}

/**
 * Tiny in-process TTL cache (bounded). Used only for facts that are safe to
 * remember briefly:
 *  - "user X has verified their email": this never reverts, so a positive
 *    result can be cached; negative results are always re-read from the DB so
 *    verifying takes effect on the very next request.
 *  - "user X is/is not an org owner" for tokens that lack an orgRole claim.
 * Per-process only; a miss just costs one primary-key query.
 */
function createTtlCache(ttlMs, maxEntries) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= maxEntries) store.clear();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    }
  };
}

const VERIFIED_CACHE_TTL_MS = 10 * 60 * 1000;
const OWNER_LOOKUP_CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 10000;

const verifiedCache = createTtlCache(VERIFIED_CACHE_TTL_MS, CACHE_MAX_ENTRIES);
const ownerLookupCache = createTtlCache(OWNER_LOOKUP_CACHE_TTL_MS, CACHE_MAX_ENTRIES);

/**
 * Normalise a request path for exemption matching: strip query/hash, lowercase,
 * collapse repeated slashes and drop trailing slashes so "/api/auth/profile/"
 * matches "/api/auth/profile". Exemptions are exact-match only.
 */
function normalizePath(rawPath) {
  let p = String(rawPath || '').split('?')[0].split('#')[0].toLowerCase();
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/**
 * Helper to determine if a user has orgRole === 'owner'.
 *
 * The JWT carries an orgRole claim, so a definite non-owner value (e.g.
 * 'admin', 'member') answers without touching the database. Only tokens that
 * lack the claim fall back to an OrganizationMembership lookup, cached briefly.
 */
async function resolveIsOwner(userPayload) {
  if (!userPayload || userPayload.isEmployee) {
    return false;
  }
  if (userPayload.orgRole === 'owner') {
    return true;
  }
  if (typeof userPayload.orgRole === 'string' && userPayload.orgRole) {
    return false;
  }
  if (!userPayload.id) {
    return false;
  }

  const cached = ownerLookupCache.get(userPayload.id);
  if (cached !== undefined) {
    if (cached) userPayload.orgRole = 'owner';
    return cached;
  }

  const membership = await OrganizationMembership.findOne({
    where: {
      userId: userPayload.id,
      orgRole: 'owner',
      status: 'active'
    }
  });
  const isOwner = Boolean(membership);
  ownerLookupCache.set(userPayload.id, isOwner);
  if (isOwner) {
    userPayload.orgRole = 'owner';
  }
  return isOwner;
}

/**
 * Action-level gate: applies ONLY when req.user.orgRole === 'owner'.
 * Reads emailVerifiedAt from DB by PK (not JWT, so verification takes effect without re-login).
 * If unverified -> 403 { code: 'EMAIL_NOT_VERIFIED', error: '...' }.
 */
async function requireVerifiedEmail(req, res, next) {
  try {
    if (!req.user) {
      return next();
    }

    const isOwner = await resolveIsOwner(req.user);
    if (!isOwner) {
      return next();
    }

    if (verifiedCache.get(req.user.id)) {
      return next();
    }

    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'emailVerifiedAt']
    });

    if (user && user.emailVerifiedAt) {
      verifiedCache.set(req.user.id, true);
      return next();
    }

    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      error: 'Email verification required. Please verify your email address to perform this action.'
    });
  } catch (error) {
    logger.error('Error in requireVerifiedEmail middleware:', error);
    return res.status(500).json({ error: 'Internal server error verifying email status.' });
  }
}

/**
 * App-level 7-day hard gate:
 * For owner accounts with emailVerifiedAt null and createdAt older than 7 days,
 * returns 403 { code: 'EMAIL_VERIFICATION_REQUIRED' } on all authenticated routes
 * EXCEPT: verify-email, resend-verification, logout, profile/me, and health.
 * FAILS OPEN when isEmailConfigured() is false.
 */
async function emailVerification7DayGate(req, res, next) {
  try {
    // 1. Fail open if email is not configured
    if (!isEmailConfigured()) {
      if (!warnedOnce) {
        logger.warn('[emailVerification] SMTP_HOST/SMTP_PORT not configured — email verification 7-day hard gate will fail open.');
        warnedOnce = true;
      }
      return next();
    }

    // 2. Route exemptions: two verification routes, logout, auth profile/me, and health
    const origUrl = normalizePath(req.originalUrl);
    const fullPath = normalizePath((req.baseUrl || '') + (req.path || ''));

    const exemptExact = new Set([
      '/',
      '/health',
      '/api/system/health',
      '/api/auth/verify-email',
      '/api/auth/resend-verification',
      '/api/auth/logout',
      '/api/auth/profile',
      '/api/auth/me'
    ]);

    if (exemptExact.has(origUrl) || exemptExact.has(fullPath)) {
      return next();
    }

    // 3. Resolve user identity from req.user or Authorization header
    let userPayload = req.user;
    if (!userPayload) {
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
          userPayload = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
        } catch (e) {
          // Token is invalid/expired; let downstream auth middleware return standard 401
          return next();
        }
      }
    }

    if (!userPayload) {
      // Unauthenticated request (e.g. login, register, public plans)
      return next();
    }

    // Employees and non-owners are never blocked
    const isOwner = await resolveIsOwner(userPayload);
    if (!isOwner) {
      return next();
    }

    // Verified users are remembered briefly so the common case costs no query
    if (verifiedCache.get(userPayload.id)) {
      return next();
    }

    // Query User by PK
    const user = await User.findByPk(userPayload.id, {
      attributes: ['id', 'emailVerifiedAt', 'createdAt']
    });

    if (!user) {
      return next();
    }

    // If verified (or grandfathered), never blocked
    if (user.emailVerifiedAt) {
      verifiedCache.set(userPayload.id, true);
      return next();
    }

    // Check if account createdAt is older than 7 days
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const createdAtMs = new Date(user.createdAt).getTime();
    const isOlderThan7Days = (Date.now() - createdAtMs) > SEVEN_DAYS_MS;

    if (isOlderThan7Days) {
      return res.status(403).json({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        error: 'Email verification required. Your 7-day grace period has expired. Please verify your email address to continue using Zana POS.'
      });
    }

    return next();
  } catch (error) {
    logger.error('Error in emailVerification7DayGate:', error);
    // On unexpected error, fail safe to avoid blocking the whole app
    return next();
  }
}

module.exports = {
  requireVerifiedEmail,
  emailVerification7DayGate,
  // Exposed for unit tests only
  normalizePath,
  __resetCachesForTests: () => {
    verifiedCache.clear();
    ownerLookupCache.clear();
  }
};
