'use strict';

const logger = require('./logger');
const redisClient = require('../config/redis');

let Sentry;
try {
  Sentry = require('@sentry/node');
} catch (e) {
  // Sentry optional
}

const FAILURE_WINDOW_SECONDS = 300; // 5 minutes
const FAILURE_THRESHOLD = 10; // 10 failures in 5m triggers alert

/**
 * Records a webhook authentication / signature verification failure.
 * Tracks failure frequency in Redis and raises a Sentry alert when a spike is detected.
 */
async function recordWebhookAuthFailure({ provider, ip, details = '' }) {
  logger.warn(`[SECURITY ALERT] Webhook signature verification failed for ${provider}`, {
    provider,
    ip,
    details
  });

  try {
    if (redisClient && (redisClient.status === 'ready' || typeof redisClient.incr === 'function')) {
      const bucket = Math.floor(Date.now() / (FAILURE_WINDOW_SECONDS * 1000));
      const key = `webhook_auth_failures:${provider}:${bucket}`;

      const count = await redisClient.incr(key);
      if (count === 1) {
        await redisClient.expire(key, FAILURE_WINDOW_SECONDS);
      }

      if (count >= FAILURE_THRESHOLD) {
        logger.error(`[SECURITY ALERT] Webhook 401 failure spike threshold reached for ${provider} (${count} failures in 5m window)`, {
          provider,
          count,
          lastIp: ip
        });

        if (process.env.SENTRY_DSN && Sentry && typeof Sentry.captureMessage === 'function') {
          Sentry.captureMessage(
            `[SECURITY ALERT] Webhook 401 signature verification failure spike: ${provider} reached ${count} failures in 5m`,
            {
              level: 'error',
              tags: { alert: 'webhook_auth_spike', provider },
              extra: { count, provider, lastIp: ip, details }
            }
          );
        }
      }
    }
  } catch (err) {
    logger.warn(`[WebhookAlerting] Failed to update Redis failure counter: ${err.message}`);
  }
}

module.exports = {
  recordWebhookAuthFailure,
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_SECONDS
};
