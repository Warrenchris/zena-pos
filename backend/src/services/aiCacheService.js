const NodeCache = require('node-cache');
const crypto = require('crypto');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

const DEFAULT_TTL_SECONDS = 3600;

// L1 in-memory process-local cache (optimization only; Redis is authoritative)
const l1Cache = new NodeCache({ stdTTL: DEFAULT_TTL_SECONDS, checkperiod: 600 });

/**
 * Generate a SHA-256 fingerprint for time-series forecast inputs.
 */
function hashForecastPayload(requestBody, periods, model) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      dates: requestBody?.dates || [],
      values: requestBody?.values || [],
      periods: periods ?? requestBody?.periods,
      model
    }))
    .digest('hex')
    .substring(0, 16);
}

/**
 * Build shop-scoped distributed forecast cache key.
 */
function buildForecastCacheKey(orgId, shopId, requestBody, periods, model = 'prophet') {
  const safeOrgId = orgId || 'no-org';
  const safeShopId = shopId || 'no-shop';
  const dataHash = hashForecastPayload(requestBody, periods, model);
  return `ai:forecast:org:${safeOrgId}:shop:${safeShopId}:${model}:${periods}:${dataHash}`;
}

/**
 * Build organization-scoped distributed forecast cache key.
 */
function buildOrgForecastCacheKey(orgId, requestBody, periods, model = 'prophet') {
  const safeOrgId = orgId || 'no-org';
  const dataHash = hashForecastPayload(requestBody, periods, model);
  return `ai:forecast:org:${safeOrgId}:${model}:${periods}:${dataHash}`;
}

/**
 * Retrieve forecast from authoritative distributed cache (with L1 memory check).
 * Fail-open: returns null on Redis outage or error so request falls back to upstream AI compute.
 */
async function getForecast(key) {
  // 1. Check L1 local cache
  const localVal = l1Cache.get(key);
  if (localVal) {
    return localVal;
  }

  // 2. Check authoritative Redis cache
  if (redisClient && redisClient.status === 'ready') {
    try {
      const raw = await redisClient.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Hydrate L1 cache with remaining TTL or default
        l1Cache.set(key, parsed);
        return parsed;
      }
    } catch (err) {
      logger.warn(`[aiCacheService] Redis get failed for ${key}, failing open: ${err.message}`);
    }
  }

  return null;
}

/**
 * Store forecast in authoritative distributed cache (and L1 memory).
 * Fail-open: logs warning on Redis failure without interrupting response.
 */
async function setForecast(key, data, ttlSeconds = DEFAULT_TTL_SECONDS) {
  // Always update L1 cache
  l1Cache.set(key, data, ttlSeconds);

  // Update authoritative Redis
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(data));
    } catch (err) {
      logger.warn(`[aiCacheService] Redis setex failed for ${key}: ${err.message}`);
    }
  }
}

/**
 * Non-blocking cursor-based SCAN and delete for matching Redis keys.
 */
async function scanAndDeleteRedisKeys(pattern) {
  if (!redisClient || redisClient.status !== 'ready') return 0;

  let cursor = '0';
  let totalDeleted = 0;

  try {
    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys && keys.length > 0) {
        await redisClient.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.warn(`[aiCacheService] Redis scanAndDelete failed for ${pattern}: ${err.message}`);
  }

  return totalDeleted;
}

/**
 * Invalidate all forecast caches for an organization across all replicas.
 */
async function invalidateOrgForecastCache(orgId) {
  const safeOrgId = parseInt(orgId, 10);
  if (!safeOrgId) return 0;

  // 1. Invalidate L1 keys matching org
  const l1Keys = l1Cache.keys().filter(k => k.startsWith(`ai:forecast:org:${safeOrgId}:`) || k.startsWith(`forecast:org:${safeOrgId}:`));
  l1Keys.forEach(k => l1Cache.del(k));

  // 2. Invalidate Redis keys across replicas using SCAN
  const pattern = `ai:forecast:org:${safeOrgId}:*`;
  const redisDeleted = await scanAndDeleteRedisKeys(pattern);

  return Math.max(l1Keys.length, redisDeleted);
}

/**
 * Invalidate all forecast caches for a shop within an organization.
 */
async function invalidateShopForecastCache(orgId, shopId) {
  const safeOrgId = parseInt(orgId, 10);
  const safeShopId = parseInt(shopId, 10);
  if (!safeShopId) return 0;

  // 1. Invalidate L1 keys
  const l1Keys = l1Cache.keys().filter(k => {
    if (safeOrgId) {
      return (k.startsWith(`ai:forecast:org:${safeOrgId}:shop:${safeShopId}:`) || k.startsWith(`forecast:org:${safeOrgId}:shop:${safeShopId}:`));
    }
    return k.includes(`:shop:${safeShopId}:`);
  });
  l1Keys.forEach(k => l1Cache.del(k));

  // 2. Invalidate Redis keys
  const pattern = safeOrgId
    ? `ai:forecast:org:${safeOrgId}:shop:${safeShopId}:*`
    : `ai:forecast:org:*:shop:${safeShopId}:*`;

  const redisDeleted = await scanAndDeleteRedisKeys(pattern);
  return Math.max(l1Keys.length, redisDeleted);
}

module.exports = {
  getForecast,
  setForecast,
  buildForecastCacheKey,
  buildOrgForecastCacheKey,
  invalidateOrgForecastCache,
  invalidateShopForecastCache,
  l1Cache,
};
