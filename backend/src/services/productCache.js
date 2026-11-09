const redisClient = require('../config/redis');
const logger = require('../utils/logger');
const { invalidateShopForecastCache, invalidateOrgForecastCache } = require('./aiCacheService');

/**
 * Gets the current product catalogue cache version for a shop.
 * Incremented on stock/product mutations to invalidate without blocking KEYS scans.
 * @param {number|string} shopId
 * @returns {Promise<number>}
 */
async function getShopProductVersion(shopId) {
  if (!shopId) return 1;
  try {
    if (redisClient && redisClient.status === 'ready') {
      const ver = await redisClient.get(`products:ver:${shopId}`);
      if (ver) return parseInt(ver, 10);
      await redisClient.set(`products:ver:${shopId}`, '1');
      return 1;
    }
  } catch (err) {
    logger.warn(`Redis error fetching product cache version for shop ${shopId}:`, err);
  }
  return 1;
}

/**
 * Invalidates the cached product catalogue and AI forecast cache for a specific shop.
 * Uses atomic INCR on the version counter (O(1)) instead of scanning KEYS.
 * @param {number|string} shopId - The ID of the shop to invalidate.
 */
async function invalidateShopProductCache(shopId) {
  if (!shopId) return;
  try {
    if (redisClient && redisClient.status === 'ready') {
      await Promise.all([
        redisClient.incr(`products:ver:${shopId}`),
        redisClient.del(`products:shop:${shopId}`)
      ]);
      logger.info(`Incremented product catalogue cache version and cleared direct key for shop: ${shopId}`);
    }
  } catch (error) {
    logger.warn(`Redis error incrementing product cache version for shop ${shopId}:`, error);
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
  getShopProductVersion,
  invalidateShopProductCache,
  invalidateOrgProductCaches
};
