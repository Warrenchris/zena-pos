const shopAuth = (req, res, next) => {
  const shopId = req.shopId || req.user?.shopId;
  
  if (!shopId) {
    return res.status(403).json({ error: 'Access Denied: Shop context required.' });
  }
  
  req.shopId = shopId;
  req.shop = { id: shopId };
  
  next();
};

module.exports = shopAuth;
