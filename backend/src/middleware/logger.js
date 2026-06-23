const ActivityLog = require('../models/ActivityLog');

// Standardized activity logger helper
async function logActivity({ shopId, performedBy, performedByType, action, entity, entityId, details }, transaction = null) {
  try {
    if (!shopId) {
      console.error('[logActivity] shopId is missing');
      return;
    }
    const logData = {
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      details: details || null,
      shopId
    };

    if (performedByType === 'employee') {
      logData.performedByEmployee = performedBy;
      logData.userId = null;
    } else {
      logData.userId = performedBy;
      logData.performedByEmployee = null;
    }

    const options = {};
    if (transaction) {
      options.transaction = transaction;
    }

    await ActivityLog.create(logData, options);
  } catch (e) {
    console.error('[logActivity] Failed to write log activity:', e);
  }
}

module.exports = { logActivity };
