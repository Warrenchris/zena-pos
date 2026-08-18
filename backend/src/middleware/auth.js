const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required.' });
    }

    const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    req.user = decoded;
    req.shopId = decoded.shopId;

    // If token is expired, return 401
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      return res.status(401).json({ error: 'Token expired.' });
    }

    // For routes that require shop context, ensure shopId exists
    const shopRequiredPaths = ['/api/sales', '/api/products', '/api/customers', '/api/employees'];
    if (shopRequiredPaths.some(path => req.path.startsWith(path)) && !req.shopId) {
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
