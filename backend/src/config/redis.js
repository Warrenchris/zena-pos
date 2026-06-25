const Redis = require('ioredis');
const logger = require('../utils/logger');

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;

const redisClient = new Redis({
  host: redisHost,
  port: redisPort,
  retryStrategy(times) {
    // Graceful retry strategy: retry every 2 seconds maximum
    const delay = Math.min(times * 100, 2000);
    return delay;
  }
});

redisClient.on('connect', () => {
  logger.info(`Redis connection established successfully at ${redisHost}:${redisPort}`);
});

redisClient.on('error', (error) => {
  logger.error('Redis error occurred:', error);
});

module.exports = redisClient;
