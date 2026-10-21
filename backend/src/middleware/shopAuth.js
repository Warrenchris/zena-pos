const { Shop } = require('../models');

const shopAuth = async (req, res, next) => {
  const shopId = req.shopId || req.user?.shopId;
  
  if (!shopId) {
    return res.status(403).json({ error: 'Access Denied: Shop context required.' });
  }
  
  req.shopId = shopId;
  req.shop = { id: shopId };

  const isOwner = req.authz?.tenant?.isOwner || req.user?.orgRole === 'owner';
  if (!isOwner) {
    if (req.authz?.scope?.hasShopAccess) {
      if (!req.authz.scope.hasShopAccess(shopId)) {
        if (req.authz.scope.isInactiveAccessibleShop && req.authz.scope.isInactiveAccessibleShop(shopId)) {
          return res.status(403).json({ error: 'Shop is inactive', code: 'SHOP_INACTIVE' });
        }
        return res.status(403).json({ error: 'Access denied: You do not have access to this branch.', code: 'SHOP_ACCESS_DENIED' });
      }
    } else {
      try {
        const shop = await Shop.findByPk(shopId, { attributes: ['id', 'active'] });
        if (shop && !shop.active) {
          return res.status(403).json({ error: 'Shop is inactive', code: 'SHOP_INACTIVE' });
        }
      } catch (_err) {
        return res.status(500).json({ error: 'Failed to verify shop status' });
      }
    }
  }
  
  next();
};

module.exports = shopAuth;
