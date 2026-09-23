const redisClient = require('../config/redis');
const logger = require('../utils/logger');
const { invalidateShopForecastCache, invalidateOrgForecastCache } = require('./aiCacheService');

/**
 * Invalidates the cached product catalogue and AI forecast cache for a specific shop.
 * @param {number|string} shopId - The ID of the shop to invalidate.
 */
async function invalidateShopProductCache(shopId) {
  if (!shopId) return;
  const cacheKey = `products:shop:${shopId}`;
  try {
    if (redisClient.status === 'ready') {
      await redisClient.del(cacheKey);
      const pageKeys = await redisClient.keys(`products:shop:${shopId}:*`);
      if (pageKeys && pageKeys.length > 0) {
        await redisClient.del(...pageKeys);
      }
      logger.info(`Invalidated product catalogue cache in Redis for shop: ${shopId}`);
    }
  } catch (error) {
    logger.warn(`Redis error invalidating product cache for shop ${shopId}:`, error);
  }

  // Also invalidate distributed AI forecast cache for this shop post-mutation
  try {
    await invalidateShopForecastCache(null, shopId);
  } catch (err) {
    logger.warn(`Failed to invalidate AI forecast cache for shop ${shopId}:`, err.message);
  }
}

/**
 * Invalidates the cached product catalogue and AI forecast cache for all shops belonging to an organization.
 * Used when catalog-level definitions (name, price, sku, category) are edited or deleted.
 * @param {number|string} organizationId - The organization ID whose branches should be invalidated.
 */
async function invalidateOrgProductCaches(organizationId) {
  if (!organizationId) return;
  try {
    const { Shop } = require('../models');
    const shops = await Shop.findAll({
      where: { organizationId },
      attributes: ['id']
    });
    for (const shop of shops) {
      await invalidateShopProductCache(shop.id);
    }
    // Also invalidate organization-level AI forecast cache
    await invalidateOrgForecastCache(organizationId);
    logger.info(`Invalidated product catalogue caches for organization: ${organizationId} (${shops.length} shops)`);
  } catch (error) {
    logger.warn(`Error invalidating org product caches for org ${organizationId}:`, error);
  }
}

module.exports = {
  invalidateShopProductCache,
  invalidateOrgProductCaches
};
