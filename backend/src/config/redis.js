const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient;

if (process.env.REDIS_URL) {
  const redisOptions = {
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
  const redisHost = process.env.REDIS_HOST || 'redis';
  const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
  const isTls = process.env.REDIS_TLS === 'true' || redisPort !== 6379;

  redisClient = new Redis({
    host: redisHost,
    port: redisPort,
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
});

redisClient.on('error', (error) => {
  logger.error('Redis error occurred:', error.message);
});

module.exports = redisClient;
