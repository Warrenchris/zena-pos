'use strict';

const { checkAndTransitionExpiredSubscriptions } = require('./billingService');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let schedulerTimer = null;
let warmupTimer = null;
let lastRunAt = null;
let lastRunResult = null;

/**
 * Executes a single subscription expiration & transition run with structured audit logging.
 *
 * In multi-replica deployments, acquires a distributed lock in Redis to ensure
 * that only one replica runs the transition job per interval.
 *
 * @param {Date} [asOfDate] - The reference cutoff timestamp (defaults to new Date())
 * @returns {Promise<{ transitionedToPastDue: number, transitionedToSuspended: number, skipped?: boolean }>}
 */
async function runSubscriptionTransitionJob(asOfDate = new Date()) {
  const lockKey = 'lock:billing_scheduler_job';
  const lockTtl = 300; // 5 minutes lock
  let acquiredLock = false;

  if (redisClient && redisClient.status === 'ready') {
    try {
      const acquired = await redisClient.set(lockKey, '1', 'NX', 'EX', lockTtl);
      if (!acquired) {
        logger.info('[BillingScheduler] Another replica is currently running or recently completed the transition job. Skipping execution.');
        return { transitionedToPastDue: 0, transitionedToSuspended: 0, skipped: true };
      }
      acquiredLock = true;
    } catch (lockErr) {
      logger.warn('[BillingScheduler] Failed to acquire distributed lock in Redis, proceeding with cautious local execution:', lockErr.message);
    }
  }

  const startTime = new Date();
  logger.info(`[BillingScheduler] Starting subscription transition check at ${startTime.toISOString()} (asOf: ${asOfDate.toISOString()})...`);

  try {
    const result = await checkAndTransitionExpiredSubscriptions(asOfDate);
    const durationMs = Date.now() - startTime.getTime();

    lastRunAt = startTime;
    lastRunResult = result;

    logger.info(`[BillingScheduler] Completed subscription transition check in ${durationMs}ms:`, {
      transitionedToPastDue: result.transitionedToPastDue,
      transitionedToSuspended: result.transitionedToSuspended,
      completedAt: new Date().toISOString()
    });

    return result;
  } catch (error) {
    logger.error('[BillingScheduler] Error during subscription transition check:', error);
    throw error;
  }
}

/**
 * Initializes and starts the recurring subscription transition scheduler.
 *
 * Safety Invariants:
 * 1. Bypassed entirely when process.env.NODE_ENV === 'test' to prevent interfering with test isolation.
 * 2. Timer is unreferenced (.unref()) so it does not block Node process exit or graceful shutdown.
 * 3. Idempotent: returns existing timer if already running.
 *
 * @param {Object} [options]
 * @param {number} [options.intervalMs] - Recurring period in ms (default: 24 hours)
 * @param {number} [options.warmupDelayMs] - Initial run delay after startup in ms (default: 5000ms; 0 to skip initial run)
 * @returns {NodeJS.Timeout|null}
 */
function startBillingScheduler(options = {}) {
  if (process.env.NODE_ENV === 'test') {
    logger.debug('[BillingScheduler] Skipping scheduler start in test environment.');
    return null;
  }

  if (schedulerTimer) {
    logger.warn('[BillingScheduler] Scheduler is already active.');
    return schedulerTimer;
  }

  const intervalMs = options.intervalMs || TWENTY_FOUR_HOURS_MS;
  const warmupDelayMs = options.warmupDelayMs !== undefined ? options.warmupDelayMs : 5000;

  logger.info(`[BillingScheduler] Starting recurring billing scheduler (interval: ${intervalMs}ms, warmup: ${warmupDelayMs}ms)`);

  // Optional warm-up run shortly after startup
  if (warmupDelayMs > 0) {
    warmupTimer = setTimeout(() => {
      runSubscriptionTransitionJob().catch(err => {
        logger.error('[BillingScheduler] Warmup subscription transition check failed:', err);
      });
      warmupTimer = null;
    }, warmupDelayMs);

    if (warmupTimer.unref) {
      warmupTimer.unref();
    }
  }

  // Recurring schedule
  schedulerTimer = setInterval(() => {
    runSubscriptionTransitionJob().catch(err => {
      logger.error('[BillingScheduler] Recurring subscription transition check failed:', err);
    });
  }, intervalMs);

  if (schedulerTimer.unref) {
    schedulerTimer.unref();
  }

  return schedulerTimer;
}

/**
 * Stops the recurring subscription transition scheduler if active.
 */
function stopBillingScheduler() {
  if (warmupTimer) {
    clearTimeout(warmupTimer);
    warmupTimer = null;
  }
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info('[BillingScheduler] Billing scheduler stopped successfully.');
  }
}

/**
 * Returns current scheduler operational status.
 */
function getSchedulerStatus() {
  return {
    isRunning: schedulerTimer !== null,
    lastRunAt,
    lastRunResult
  };
}

module.exports = {
  runSubscriptionTransitionJob,
  startBillingScheduler,
  stopBillingScheduler,
  getSchedulerStatus
};
