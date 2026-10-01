const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const Shop = require('../models/Shop');
const { Op } = require('sequelize');

// GET /api/activity?limit=50&userId=&shopId=
exports.list = async (req, res) => {
  try {
    const { limit = 50, userId, shopId: queryShopId } = req.query;
    const where = {};
    const callerShopId = req.shopId || req.user?.shopId;
    let organizationId = req.organizationId || req.user?.organizationId;

    if (!organizationId && callerShopId) {
      const shop = await Shop.findByPk(callerShopId, { attributes: ['organizationId'] });
      organizationId = shop?.organizationId;
    }

    const isOrgAdmin = req.user?.role === 'org_admin' || req.user?.orgRole === 'admin' || (req.user?.role === 'admin' && !callerShopId);

    if (queryShopId) {
      const targetShopId = parseInt(queryShopId, 10);
      if (organizationId) {
        const targetShop = await Shop.findOne({
          where: { id: targetShopId, organizationId }
        });
        if (!targetShop) {
          return res.status(403).json({ error: 'Shop does not belong to your organization' });
        }
      } else if (callerShopId && targetShopId !== callerShopId) {
        return res.status(403).json({ error: 'Cross-tenant shop access denied' });
      }
      where.shopId = targetShopId;
    } else if (isOrgAdmin && organizationId) {
      const orgShops = await Shop.findAll({
        where: { organizationId },
        attributes: ['id']
      });
      const shopIds = orgShops.map(s => s.id);
      where.shopId = { [Op.in]: shopIds };
    } else if (callerShopId) {
      where.shopId = callerShopId;
    } else if (organizationId) {
      const orgShops = await Shop.findAll({
        where: { organizationId },
        attributes: ['id']
      });
      const shopIds = orgShops.map(s => s.id);
      where.shopId = { [Op.in]: shopIds };
    } else if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Tenant context required' });
    }

    if (userId) where.userId = userId;

    const rows = await ActivityLog.findAll({
      where,
      include: [{ model: User, attributes: ['id', 'name', 'email'] }],
      order: [['createdAt', 'DESC']],
      limit: Number(limit),
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
};


