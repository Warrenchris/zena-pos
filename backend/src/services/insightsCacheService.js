const redisClient = require('../config/redis');
const logger = require('../utils/logger');

const DEFAULT_TTL_SECONDS = 60;

function isInsightsCacheEnabled() {
  return process.env.INSIGHTS_CACHE_ENABLED === 'true';
}

function buildInsightsCacheKey(orgId, shopId) {
  if (!orgId || orgId === 'no-org' || !shopId || shopId === 'no-shop') {
    return null;
  }
  return `insights:org:${orgId}:shop:${shopId}`;
}

const shopOrgMap = new Map();

function clearOrgCache() {
  shopOrgMap.clear();
}

async function resolveOrgId(shopId) {
  if (!shopId) return null;
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
  return null;
}

async function resolveOrganizationId(source, shopId) {
  let orgId = null;

  if (source && typeof source === 'object') {
    if (source.authz?.scope?.organizationId) {
      orgId = source.authz.scope.organizationId;
    } else if (source.user?.organizationId) {
      orgId = source.user.organizationId;
    } else if (source.authz?.tenant?.organizationId) {
      orgId = source.authz.tenant.organizationId;
    } else if (source.organizationId) {
      orgId = source.organizationId;
    }
  } else if (source && source !== 'no-org') {
    orgId = source;
  }

  const targetShopId = shopId || (source && typeof source === 'object' ? (source.shopId || source.authz?.scope?.activeShopId || source.user?.shopId) : null);

  if (!orgId && targetShopId) {
    orgId = await resolveOrgId(targetShopId);
  }

  if (orgId && orgId !== 'no-org') {
    const numericShopId = Number(targetShopId);
    if (numericShopId && !shopOrgMap.has(numericShopId)) {
      shopOrgMap.set(numericShopId, orgId);
    }
    return orgId;
  }

  return null;
}

async function getInsightsCache(source, shopId) {
  if (!isInsightsCacheEnabled()) return null;
  if (!redisClient || redisClient.status !== 'ready') return null;

  const targetShopId = shopId || (source && typeof source === 'object' ? (source.shopId || source.authz?.scope?.activeShopId || source.user?.shopId) : null);
  const orgId = await resolveOrganizationId(source, targetShopId);
  if (!orgId || !targetShopId) return null;

  const key = buildInsightsCacheKey(orgId, targetShopId);
  if (!key) return null;

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

async function setInsightsCache(source, shopId, data, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!isInsightsCacheEnabled()) return false;
  if (!redisClient || redisClient.status !== 'ready') return false;

  const targetShopId = shopId || (source && typeof source === 'object' ? (source.shopId || source.authz?.scope?.activeShopId || source.user?.shopId) : null);
  const orgId = await resolveOrganizationId(source, targetShopId);
  if (!orgId || !targetShopId) return false;

  const key = buildInsightsCacheKey(orgId, targetShopId);
  if (!key) return false;

  try {
    await redisClient.setex(key, ttlSeconds, JSON.stringify(data));
    return true;
  } catch (err) {
    logger.warn(`[insightsCache] Redis set failed for ${key}: ${err.message}`);
    return false;
  }
}

async function invalidateShopInsightsCache(source, shopId) {
  if (!redisClient || redisClient.status !== 'ready') return 0;
  const targetShopId = shopId || (source && typeof source === 'object' ? (source.shopId || source.authz?.scope?.activeShopId || source.user?.shopId) : null);
  if (!targetShopId) return 0;

  try {
    const orgId = await resolveOrganizationId(source, targetShopId);
    if (!orgId) return 0;

    const key = buildInsightsCacheKey(orgId, targetShopId);
    if (!key) return 0;

    const res = await redisClient.del(key);
    return res;
  } catch (err) {
    logger.warn(`[insightsCache] Redis invalidation failed for shop ${targetShopId}: ${err.message}`);
    return 0;
  }
}

module.exports = {
  isInsightsCacheEnabled,
  buildInsightsCacheKey,
  resolveOrgId,
  resolveOrganizationId,
  clearOrgCache,
  getInsightsCache,
  setInsightsCache,
  invalidateShopInsightsCache,
  DEFAULT_TTL_SECONDS
};
