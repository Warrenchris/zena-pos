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
 * Helper to determine if a user has orgRole === 'owner'.
 */
async function resolveIsOwner(userPayload) {
  if (!userPayload || userPayload.isEmployee) {
    return false;
  }
  if (userPayload.orgRole === 'owner') {
    return true;
  }
  // If orgRole is not on payload, check OrganizationMembership
  if (userPayload.id) {
    const membership = await OrganizationMembership.findOne({
      where: {
        userId: userPayload.id,
        orgRole: 'owner',
        status: 'active'
      }
    });
    if (membership) {
      userPayload.orgRole = 'owner';
      return true;
    }
  }
  return false;
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

    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'emailVerifiedAt']
    });

    if (!user || !user.emailVerifiedAt) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Email verification required. Please verify your email address to perform this action.'
      });
    }

    next();
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
    const origUrl = (req.originalUrl || '').split('?')[0].toLowerCase();
    const fullPath = (((req.baseUrl || '') + (req.path || '')) || '').toLowerCase();

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

    // Query User by PK
    const user = await User.findByPk(userPayload.id, {
      attributes: ['id', 'emailVerifiedAt', 'createdAt']
    });

    if (!user) {
      return next();
    }

    // If verified (or grandfathered), never blocked
    if (user.emailVerifiedAt) {
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
  emailVerification7DayGate
};
