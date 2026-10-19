const redisClient = require('../config/redis');
const logger = require('../utils/logger');

const DEFAULT_TTL_SECONDS = 60;

function isInsightsCacheEnabled() {
  return process.env.INSIGHTS_CACHE_ENABLED === 'true';
}

function buildInsightsCacheKey(orgId, shopId) {
  const safeOrgId = orgId || 'no-org';
  const safeShopId = shopId || 'no-shop';
  return `insights:org:${safeOrgId}:shop:${safeShopId}`;
}

async function getInsightsCache(orgId, shopId) {
  if (!isInsightsCacheEnabled()) return null;
  if (!redisClient || redisClient.status !== 'ready') return null;

  const key = buildInsightsCacheKey(orgId, shopId);
  try {
    const raw = await redisClient.get(key);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    logger.warn(`[insightsCache] Redis get failed for ${key}, failing open: ${err.message}`);
  }
  return null;
}

async function setInsightsCache(orgId, shopId, data, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!isInsightsCacheEnabled()) return false;
  if (!redisClient || redisClient.status !== 'ready') return false;

  const key = buildInsightsCacheKey(orgId, shopId);
  try {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (err) {
    logger.warn(`[insightsCache] Redis set failed for ${key}: ${err.message}`);
    return false;
  }
}

const shopOrgMap = new Map();

async function resolveOrgId(shopId) {
  const numericShopId = Number(shopId);
  if (shopOrgMap.has(numericShopId)) {
    return shopOrgMap.get(numericShopId);
  }
  try {
    const { Shop } = require('../models');
    const shop = await Shop.findByPk(shopId, { attributes: ['organizationId'], raw: true });
    if (shop && shop.organizationId) {
      shopOrgMap.set(numericShopId, shop.organizationId);
      return shop.organizationId;
    }
  } catch (err) {
    logger.warn(`[insightsCache] Failed to lookup organizationId for shop ${shopId}: ${err.message}`);
  }
  return 'no-org';
}

async function invalidateShopInsightsCache(orgId, shopId) {
  if (!redisClient || redisClient.status !== 'ready') return 0;
  if (!shopId) return 0;

  try {
    const numericShopId = Number(shopId);
    if (orgId && !shopOrgMap.has(numericShopId)) {
      shopOrgMap.set(numericShopId, orgId);
    }
    const resolvedOrgId = orgId || await resolveOrgId(shopId);
    const key = buildInsightsCacheKey(resolvedOrgId, shopId);
    const res = await redisClient.del(key);
    return res;
  } catch (err) {
    logger.warn(`[insightsCache] Redis invalidation failed for shop ${shopId}: ${err.message}`);
    return 0;
  }
}

module.exports = {
  isInsightsCacheEnabled,
  buildInsightsCacheKey,
  getInsightsCache,
  setInsightsCache,
  invalidateShopInsightsCache,
  DEFAULT_TTL_SECONDS
};
