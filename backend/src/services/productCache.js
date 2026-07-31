const redisClient = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Invalidates the cached product catalogue for a specific shop.
 * @param {number|string} shopId - The ID of the shop to invalidate.
 */
async function invalidateShopProductCache(shopId) {
  if (!shopId) return;
  const cacheKey = `products:shop:${shopId}`;
  try {
    if (redisClient.status !== 'ready') return;
    await redisClient.del(cacheKey);
    logger.info(`Invalidated product catalogue cache in Redis for shop: ${shopId}`);
  } catch (error) {
    logger.warn(`Redis error invalidating product cache for shop ${shopId}:`, error);
  }
}

module.exports = {
  invalidateShopProductCache
};
