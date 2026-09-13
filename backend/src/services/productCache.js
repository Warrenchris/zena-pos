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

/**
 * Invalidates the cached product catalogue for all shops belonging to an organization.
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
    logger.info(`Invalidated product catalogue caches for organization: ${organizationId} (${shops.length} shops)`);
  } catch (error) {
    logger.warn(`Error invalidating org product caches for org ${organizationId}:`, error);
  }
}

module.exports = {
  invalidateShopProductCache,
  invalidateOrgProductCaches
};
