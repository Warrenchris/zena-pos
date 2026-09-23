const redisClient = require('../config/redis');
const logger = require('./logger');

// Lua script for atomic increment with sliding expiry initialization
const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, windowSeconds)
end

local ttl = redis.call('TTL', key)
if ttl < 0 then
  redis.call('EXPIRE', key, windowSeconds)
  ttl = windowSeconds
end

return { current, ttl }
`;

// In-memory fallback map for when Redis is unavailable (Fail-Open with local protection)
const localFallbackStore = new Map();
const LOCAL_CLEANUP_INTERVAL_MS = 60000;

// Periodic cleanup of expired local fallback keys
let cleanupTimer = null;
function startLocalCleanup() {
  if (cleanupTimer || process.env.NODE_ENV === 'test') return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of localFallbackStore.entries()) {
      if (record.resetAt <= now) {
        localFallbackStore.delete(key);
      }
    }
  }, LOCAL_CLEANUP_INTERVAL_MS);
  if (cleanupTimer.unref) cleanupTimer.unref();
}
startLocalCleanup();

// Throttled warning for Redis failures
let lastRedisWarnTime = 0;
const REDIS_WARN_THROTTLE_MS = 30000;

function warnRedisDown(err) {
  const now = Date.now();
  if (now - lastRedisWarnTime > REDIS_WARN_THROTTLE_MS) {
    logger.warn(`[distributedRateLimiter] Redis is unavailable (${err?.message || 'connection down'}). Falling back to safe local memory limiting.`);
    lastRedisWarnTime = now;
  }
}

/**
 * Increment and check rate limit for a key.
 * @param {string} fullKey - Fully namespaced Redis key
 * @param {number} max - Maximum requests allowed
 * @param {number} windowSeconds - Window in seconds
 * @returns {Promise<{ allowed: boolean, current: number, limit: number, ttl: number, source: 'redis'|'fallback' }>}
 */
async function incrementAndCheck(fullKey, max, windowSeconds) {
  if (redisClient && redisClient.status === 'ready') {
    try {
      const result = await redisClient.eval(RATE_LIMIT_LUA_SCRIPT, 1, fullKey, max, windowSeconds);
      const current = Number(result[0]);
      const ttl = Number(result[1]);
      return {
        allowed: current <= max,
        current,
        limit: max,
        ttl: ttl > 0 ? ttl : windowSeconds,
        source: 'redis'
      };
    } catch (err) {
      warnRedisDown(err);
    }
  }

  // Local fallback execution (fail-open to local memory tracking)
  const now = Date.now();
  let record = localFallbackStore.get(fullKey);
  if (!record || record.resetAt <= now) {
    record = { current: 1, resetAt: now + (windowSeconds * 1000) };
  } else {
    record.current += 1;
  }
  localFallbackStore.set(fullKey, record);

  const ttl = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  return {
    allowed: record.current <= max,
    current: record.current,
    limit: max,
    ttl,
    source: 'fallback'
  };
}

/**
 * Reset a rate limit key.
 * @param {string} fullKey
 */
async function resetRateLimitKey(fullKey) {
  localFallbackStore.delete(fullKey);
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.del(fullKey);
    } catch (err) {
      // Ignore reset failure on Redis error
    }
  }
}

/**
 * Create an Express middleware for distributed rate limiting.
 * @param {Object} options
 * @param {string} options.namespace - e.g. 'ai', 'auth', 'register'
 * @param {number} options.windowMs - Window in milliseconds (e.g. 15 * 60 * 1000)
 * @param {number} options.max - Maximum requests allowed per window
 * @param {Function} options.keyGenerator - (req) => string
 * @param {Object|string} [options.message] - Response payload when limit exceeded
 * @param {Function} [options.skip] - (req) => boolean
 * @param {boolean} [options.standardHeaders=true] - Send RateLimit-* headers
 * @param {boolean} [options.legacyHeaders=false] - Send X-RateLimit-* headers
 * @returns {Function} Express middleware
 */
function createDistributedRateLimiter(options) {
  const {
    namespace = 'general',
    windowMs = 15 * 60 * 1000,
    max = 100,
    keyGenerator,
    message = { error: 'Too many requests, please try again later.' },
    skip = () => false,
    standardHeaders = true,
    legacyHeaders = false,
  } = options;

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  return async function distributedRateLimitMiddleware(req, res, next) {
    if (skip(req)) {
      return next();
    }

    let id = 'global';
    if (typeof keyGenerator === 'function') {
      try {
        id = keyGenerator(req);
      } catch (err) {
        id = req.ip || 'unknown';
      }
    } else {
      id = req.ip || 'unknown';
    }

    const fullKey = `ratelimit:${namespace}:${id}`;

    try {
      const { allowed, current, limit, ttl } = await incrementAndCheck(fullKey, max, windowSeconds);

      const remaining = Math.max(0, limit - current);
      const resetTime = Math.ceil(Date.now() / 1000) + ttl;

      if (standardHeaders) {
        res.setHeader('RateLimit-Limit', limit);
        res.setHeader('RateLimit-Remaining', remaining);
        res.setHeader('RateLimit-Reset', resetTime);
      }

      if (legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);
      }

      if (!allowed) {
        res.setHeader('Retry-After', ttl);
        const responseBody = typeof message === 'string'
          ? { error: message, retryAfter: `${ttl} seconds` }
          : { ...message, retryAfter: `${ttl} seconds` };
        return res.status(429).json(responseBody);
      }

      next();
    } catch (err) {
      // Complete fail-open: never block request if unexpected error occurs in rate limiter
      logger.warn(`[distributedRateLimiter] Unexpected error, failing open: ${err.message}`);
      next();
    }
  };
}

module.exports = {
  createDistributedRateLimiter,
  incrementAndCheck,
  resetRateLimitKey,
  localFallbackStore,
};
