const ActivityLog = require('../models/ActivityLog');

// Minimal activity logger helper
async function logActivity(req, action, entity, entityId, metadata) {
  try {
    if (!req?.user?.id) return;
    await ActivityLog.create({
      userId: req.user.id,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      metadata: metadata || null,
    });
  } catch (e) {
    // silent
  }
}

module.exports = { logActivity };


