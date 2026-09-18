const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const tokenRevocationService = require('../services/tokenRevocationService');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

    // 1. Check if token JTI has been explicitly revoked (AUTH-01)
    if (decoded.jti) {
      const isRevoked = await tokenRevocationService.isTokenRevoked(decoded.jti);
      if (isRevoked) {
        return res.status(401).json({ error: 'Token has been revoked. Please log in again.' });
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

    // 3. Check organization suspension status (AUTH-01)
    if (req.organizationId) {
      const orgStatus = await tokenRevocationService.getOrgStatus(req.organizationId);
      if (orgStatus === 'suspended' || orgStatus === 'canceled') {
        const fullPath = ((req.baseUrl || '') + (req.path || '')).toLowerCase();
        const origUrl = (req.originalUrl || '').split('?')[0].toLowerCase();
        const isBillingRecovery = fullPath.startsWith('/api/billing') || 
                                  origUrl.startsWith('/api/billing') ||
                                  fullPath.startsWith('/api/organizations') ||
                                  origUrl.startsWith('/api/organizations') ||
                                  fullPath.startsWith('/api/auth/logout') ||
                                  origUrl.startsWith('/api/auth/logout') ||
                                  fullPath.startsWith('/api/auth/profile') ||
                                  origUrl.startsWith('/api/auth/profile');

        // Only allow owner/admin to access billing recovery endpoints when organization is suspended
        if (!isBillingRecovery || (decoded.role !== 'admin' && decoded.orgRole !== 'owner')) {
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

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    res.status(401).json({ error: 'Please authenticate.' });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
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

module.exports = { auth, checkRole, ensureShopIsolation };
