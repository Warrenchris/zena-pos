const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;
let lastErrorMessage = '';
let lastErrorTime = 0;

if (process.env.REDIS_URL) {
  const redisOptions = {
    family: Number(process.env.REDIS_FAMILY || 4),
    enableOfflineQueue: false,
    tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    retryStrategy: (times) => {
      if (process.env.NODE_ENV === 'test' && times > 5) return null;
      return Math.min(times * 100, 3000);
    },
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
  };
  if (process.env.REDIS_PASSWORD) {
    redisOptions.password = process.env.REDIS_PASSWORD;
  }
  redisClient = new Redis(process.env.REDIS_URL, redisOptions);
} else {
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
  const isTls = process.env.REDIS_TLS === 'true' || (redisPort !== 6379 && process.env.REDIS_PORT !== undefined);

  redisClient = new Redis({
    host: redisHost,
    port: redisPort,
    family: Number(process.env.REDIS_FAMILY || 4),
    enableOfflineQueue: false,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: isTls ? {} : undefined,
    retryStrategy: (times) => {
      if (process.env.NODE_ENV === 'test' && times > 5) return null;
      return Math.min(times * 100, 3000);
    },
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
  });
}

redisClient.on('connect', () => {
  logger.info('Redis connection established successfully');
  lastErrorMessage = '';
});

redisClient.on('error', (error) => {
  const now = Date.now();
  // Only log if the error message changed or more than 30 seconds have passed since last log
  if (error.message !== lastErrorMessage || (now - lastErrorTime > 30000)) {
    logger.warn(`Redis connection issue: ${error.message} (retrying in background...)`);
    lastErrorMessage = error.message;
    lastErrorTime = now;
  }
});

module.exports = redisClient;
