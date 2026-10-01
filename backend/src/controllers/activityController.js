const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');

// GET /api/activity?limit=50&userId=
exports.list = async (req, res) => {
  try {
    const { limit = 50, userId } = req.query;
    const where = {};
    const shopId = req.shopId || req.user?.shopId;
    if (shopId) {
      where.shopId = shopId;
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


