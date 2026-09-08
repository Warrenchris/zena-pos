const NodeCache = require('node-cache');

// Create cache with 60-second default TTL
const analyticsCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

/**
 * Cache wrapper for analytics queries
 * Prevents redundant database queries within TTL
 */
function getCacheKey(userId, endpoint, params) {
  return `analytics:${userId}:${endpoint}:${JSON.stringify(params || {})}`;
}

function getCachedAnalytics(shopId, endpoint, params) {
  const key = getCacheKey(shopId, endpoint, params);
  return analyticsCache.get(key);
}

function setCachedAnalytics(shopId, endpoint, params, data) {
  const key = getCacheKey(shopId, endpoint, params);
  analyticsCache.set(key, data);
  return data;
}

function invalidateAnalyticsCache(shopId) {
  if (!shopId) return;
  // Clear all analytics cache for this shop
  const prefix = `analytics:${shopId}:`;
  const keys = analyticsCache.keys();
  keys.forEach(key => {
    if (key.startsWith(prefix)) {
      analyticsCache.del(key);
    }
  });
}

module.exports = {
  analyticsCache,
  getCacheKey,
  getCachedAnalytics,
  setCachedAnalytics,
  invalidateAnalyticsCache
};
