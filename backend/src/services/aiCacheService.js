const NodeCache = require('node-cache');
const crypto = require('crypto');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

const DEFAULT_TTL_SECONDS = 3600;
const INVALIDATION_CHANNEL = 'ai:cache:invalidate';

// L1 in-memory process-local cache (optimization layer; Redis L2 is authoritative)
const l1Cache = new NodeCache({ stdTTL: DEFAULT_TTL_SECONDS, checkperiod: 600 });

let subscriberClient = null;

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
 * Evict L1 entries for an organization from this process's local cache.
 * Strictly tenant-scoped: only keys matching the provided organizationId are deleted.
 */
function evictLocalL1Org(orgId, cacheInstance = l1Cache) {
  const safeOrgId = parseInt(orgId, 10);
  if (!safeOrgId) return 0;

  const l1Keys = cacheInstance.keys().filter(k =>
    k.startsWith(`ai:forecast:org:${safeOrgId}:`) ||
    k.startsWith(`forecast:org:${safeOrgId}:`)
  );
  l1Keys.forEach(k => cacheInstance.del(k));
  return l1Keys.length;
}

/**
 * Evict L1 entries for a shop from this process's local cache.
 * Strictly tenant-scoped: only keys matching the provided shop and organization are deleted.
 */
function evictLocalL1Shop(orgId, shopId, cacheInstance = l1Cache) {
  const safeOrgId = parseInt(orgId, 10);
  const safeShopId = parseInt(shopId, 10);
  if (!safeShopId) return 0;

  const l1Keys = cacheInstance.keys().filter(k => {
    if (safeOrgId) {
      return (
        k.startsWith(`ai:forecast:org:${safeOrgId}:shop:${safeShopId}:`) ||
        k.startsWith(`forecast:org:${safeOrgId}:shop:${safeShopId}:`)
      );
    }
    return k.includes(`:shop:${safeShopId}:`);
  });
  l1Keys.forEach(k => cacheInstance.del(k));
  return l1Keys.length;
}

/**
 * Handle incoming distributed invalidation pub/sub event.
 */
function handleDistributedInvalidation(message, cacheInstance = l1Cache) {
  try {
    const payload = typeof message === 'string' ? JSON.parse(message) : message;
    if (!payload) return;

    if (payload.type === 'shop' && payload.shopId) {
      evictLocalL1Shop(payload.organizationId, payload.shopId, cacheInstance);
    } else if (payload.type === 'organization' && payload.organizationId) {
      evictLocalL1Org(payload.organizationId, cacheInstance);
    }
  } catch (err) {
    logger.warn(`[aiCacheService] Failed to process distributed invalidation message: ${err.message}`);
  }
}

/**
 * Initialize Redis Pub/Sub subscriber connection for multi-replica L1 invalidation.
 */
function initSubscriber() {
  if (!redisClient || typeof redisClient.duplicate !== 'function') return;
  // In tests, avoid automatic unhandled subscription unless explicitly enabled
  if (process.env.NODE_ENV === 'test' && !process.env.ENABLE_AI_PUBSUB_IN_TEST) {
    return;
  }

  try {
    subscriberClient = redisClient.duplicate();

    subscriberClient.on('error', (err) => {
      logger.warn(`[aiCacheService] Redis pub/sub subscriber issue: ${err.message}`);
    });

    subscriberClient.subscribe(INVALIDATION_CHANNEL, (err) => {
      if (err) {
        logger.warn(`[aiCacheService] Failed to subscribe to ${INVALIDATION_CHANNEL}: ${err.message}`);
      } else {
        logger.info(`[aiCacheService] Subscribed to distributed invalidation channel: ${INVALIDATION_CHANNEL}`);
      }
    });

    subscriberClient.on('message', (channel, message) => {
      if (channel === INVALIDATION_CHANNEL) {
        handleDistributedInvalidation(message);
      }
    });
  } catch (err) {
    logger.warn(`[aiCacheService] Error initializing Redis pub/sub subscriber: ${err.message}`);
  }
}

/**
 * Close subscriber connection (for graceful shutdown / tests).
 */
async function closeSubscriber() {
  if (subscriberClient) {
    try {
      await subscriberClient.unsubscribe(INVALIDATION_CHANNEL);
      await subscriberClient.quit();
    } catch (e) {
      // ignore cleanup errors
    }
    subscriberClient = null;
  }
}

// Auto-initialize subscriber in non-test runtimes
initSubscriber();

/**
 * Invalidate all forecast caches for an organization across all replicas.
 */
async function invalidateOrgForecastCache(orgId) {
  const safeOrgId = parseInt(orgId, 10);
  if (!safeOrgId) return 0;

  // 1. Invalidate local process L1 keys
  const localEvicted = evictLocalL1Org(safeOrgId);

  // 2. Invalidate Redis keys across replicas using SCAN
  const pattern = `ai:forecast:org:${safeOrgId}:*`;
  const redisDeleted = await scanAndDeleteRedisKeys(pattern);

  // 3. Broadcast invalidation event to all backend replicas via Redis Pub/Sub (RISK-01)
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.publish(INVALIDATION_CHANNEL, JSON.stringify({
        type: 'organization',
        organizationId: safeOrgId,
        timestamp: Date.now()
      }));
    } catch (pubErr) {
      logger.warn(`[aiCacheService] Failed to publish org invalidation event: ${pubErr.message}`);
    }
  }

  return Math.max(localEvicted, redisDeleted);
}

/**
 * Invalidate all forecast caches for a shop within an organization.
 */
async function invalidateShopForecastCache(orgId, shopId) {
  const safeOrgId = parseInt(orgId, 10);
  const safeShopId = parseInt(shopId, 10);
  if (!safeShopId) return 0;

  // 1. Invalidate local process L1 keys
  const localEvicted = evictLocalL1Shop(safeOrgId, safeShopId);

  // 2. Invalidate Redis keys across replicas using SCAN
  const pattern = safeOrgId
    ? `ai:forecast:org:${safeOrgId}:shop:${safeShopId}:*`
    : `ai:forecast:org:*:shop:${safeShopId}:*`;

  const redisDeleted = await scanAndDeleteRedisKeys(pattern);

  // 3. Broadcast invalidation event to all backend replicas via Redis Pub/Sub (RISK-01)
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.publish(INVALIDATION_CHANNEL, JSON.stringify({
        type: 'shop',
        organizationId: safeOrgId,
        shopId: safeShopId,
        timestamp: Date.now()
      }));
    } catch (pubErr) {
      logger.warn(`[aiCacheService] Failed to publish shop invalidation event: ${pubErr.message}`);
    }
  }

  return Math.max(localEvicted, redisDeleted);
}

module.exports = {
  getForecast,
  setForecast,
  buildForecastCacheKey,
  buildOrgForecastCacheKey,
  invalidateOrgForecastCache,
  invalidateShopForecastCache,
  evictLocalL1Org,
  evictLocalL1Shop,
  handleDistributedInvalidation,
  initSubscriber,
  closeSubscriber,
  INVALIDATION_CHANNEL,
  l1Cache,
};
