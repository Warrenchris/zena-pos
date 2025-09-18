const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Ensure shopId is present for multi-tenant isolation
    if (!decoded.shopId) {
      return res.status(401).json({ error: 'Invalid token: missing shop context.' });
    }
    
    req.user = decoded;
    req.shopId = decoded.shopId; // Make shopId easily accessible
    next();
  } catch (error) {
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
