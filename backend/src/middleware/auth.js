const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const tokenRevocationService = require('../services/tokenRevocationService');
const authzContext = require('./authzContext');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    // Reject tokens with non-session purpose (SEC-03 completion)
    if (decoded.purpose === 'password_reset') {
      return res.status(401).json({ error: 'Invalid token purpose: reset tokens cannot be used for session authentication.' });
    }

    // 1. Check if token JTI has been explicitly revoked (AUTH-01)
    if (decoded.jti) {
      const isRevoked = await tokenRevocationService.isTokenRevoked(decoded.jti);
      if (isRevoked) {
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
      }
    }

    // 1b. Check if token was issued prior to password change/reset cutoff (AUTH-02, AUTH-03)
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

    // 2. Check active user/employee status (AUTH-01)
    if (decoded.id) {
      const userStatus = await tokenRevocationService.getUserStatus(decoded.id, !!decoded.isEmployee);
      if (userStatus === 'inactive') {
        return res.status(401).json({ error: 'Account is deactivated or terminated.' });
      }
    }

    req.user = decoded;
    req.shopId = decoded.shopId;

    if (decoded.organizationId !== undefined) {
      req.organizationId = decoded.organizationId;
    } else if (decoded.shopId) {
      try {
        const { Shop } = require('../models');
        const shop = await Shop.findByPk(decoded.shopId, { attributes: ['organizationId'] });
        req.organizationId = shop?.organizationId || null;
      } catch (lookupErr) {
        req.organizationId = null;
      }
    } else {
      req.organizationId = null;
    }

    // Note: tenant/user context for Sentry is deliberately NOT set here.
    // Sentry.setUser()/setTag() write to Node's ambient async-context scope,
    // which has documented cross-request leakage reports under concurrent
    // load (see getsentry/sentry-javascript#13205) — in a multi-tenant app
    // that risks attaching Shop A's identifiers to an error actually caused
    // by Shop B. errorHandler.js attaches shopId/organizationId/requestId
    // safely instead, via an explicit Sentry.withScope() wrapped around the
    // single captureException call, which is inherently request-local.

    // 3. Check organization suspension status (AUTH-01)
    if (req.organizationId) {
      const orgStatus = await tokenRevocationService.getOrgStatus(req.organizationId);
      if (orgStatus === 'deleted') {
        return res.status(403).json({
          error: 'Organization has been deactivated or deleted.',
          code: 'ORGANIZATION_DELETED',
          isDeleted: true
        });
      }
      if (orgStatus === 'suspended' || orgStatus === 'canceled') {
        const isEmployeeOrMember = decoded.isEmployee || (decoded.role !== 'admin' && decoded.orgRole !== 'owner');
        if (isEmployeeOrMember) {
          return res.status(403).json({
            error: 'Organization subscription is suspended. Contact the organization owner for renewal.',
            code: 'ORGANIZATION_SUSPENDED',
            isSuspended: true
          });
        }
      }
    }

    // If token is expired, return 401
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ error: 'Token expired.' });
    }

    // For routes that require shop context, ensure shopId exists
    const shopRequiredPaths = ['/api/sales', '/api/products', '/api/customers', '/api/employees', '/api/purchases', '/api/purchase-orders', '/api/suppliers'];
    const currentFullPath = ((req.baseUrl || '') + (req.path || '')).toLowerCase();
    const origUrl = (req.originalUrl || '').split('?')[0].toLowerCase();
    const isShopRequired = shopRequiredPaths.some(p => currentFullPath.startsWith(p) || origUrl.startsWith(p));

    if (isShopRequired && !req.shopId) {
      return res.status(403).json({ error: 'Shop context required for this operation.' });
    }

    return authzContext(req, res, next);
  } catch (error) {
    next(error);
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    // FAIL-CLOSED INVARIANT (Section 6.2):
    if (!req.authz) {
      logger.error('[SECURITY INVARIANT VIOLATION] req.authz is missing in checkRole', {
        url: req.originalUrl,
        method: req.method,
        requestId: req.requestId || req.id
      });
      return res.status(500).json({
        error: 'Internal authorization error: authorization context uninitialized.',
        code: 'AUTHORIZATION_CONTEXT_MISSING'
      });
    }

    const currentRole = req.authz.role.effectiveRole;
    if (!roles.includes(currentRole)) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    next();
  };
};

// Middleware to ensure shop isolation - adds shopId to query conditions
const ensureShopIsolation = (req, res, next) => {
  // Skip shop isolation for super admins
  if (req.user && req.user.role === 'super_admin') {
    return next();
  }
  
  if (!req.shopId) {
    return res.status(401).json({ error: 'Shop context required.' });
  }
  
  // Add shopId to any existing where conditions
  if (req.body && typeof req.body === 'object') {
    req.body.shopId = req.shopId;
  }
  
  next();
};

const authorize = require('./authorize');

module.exports = { auth, checkRole, ensureShopIsolation, authzContext, authorize };
