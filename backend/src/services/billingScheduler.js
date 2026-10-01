'use strict';

const billingService = require('./billingService');
const billingNotificationService = require('./billingNotificationService');
const { Subscription, Plan } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

const crypto = require('crypto');
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
  const jobRunId = crypto.randomUUID();
  const lockKey = 'lock:billing_scheduler_job';
  const lockTtl = 300; // 5 minutes lock
  let acquiredLock = false;

  if (redisClient && redisClient.status === 'ready') {
    try {
      const acquired = await redisClient.set(lockKey, '1', 'NX', 'EX', lockTtl);
      if (!acquired) {
        logger.info(`[BillingScheduler] (jobRunId=${jobRunId}) Another replica is currently running or recently completed the transition job. Skipping execution.`, { jobRunId });
        return { transitionedToPastDue: 0, transitionedToSuspended: 0, skipped: true };
      }
      acquiredLock = true;
    } catch (lockErr) {
      logger.warn(`[BillingScheduler] (jobRunId=${jobRunId}) Failed to acquire distributed lock in Redis, proceeding with cautious local execution: ${lockErr.message}`, { jobRunId });
    }
  }

  const startTime = new Date();
  logger.info(`[BillingScheduler] (jobRunId=${jobRunId}) Starting subscription transition check at ${startTime.toISOString()} (asOf: ${asOfDate.toISOString()})...`, {
    jobRunId,
    asOfDate: asOfDate.toISOString()
  });

  try {
    const transitionResult = await billingService.checkAndTransitionExpiredSubscriptions(asOfDate);
    let reminderResult = { trialEnding5d: 0, trialEnding1d: 0, renewalDue7d: 0, renewalDue1d: 0 };
    try {
      reminderResult = await checkAndSendBillingReminders(asOfDate);
    } catch (reminderErr) {
      logger.error(`[BillingScheduler] (jobRunId=${jobRunId}) Error checking billing reminders: ${reminderErr.message}`);
    }

    const durationMs = Date.now() - startTime.getTime();
    const result = {
      ...transitionResult,
      reminders: reminderResult
    };

    lastRunAt = startTime;
    lastRunResult = result;

    logger.info(`[BillingScheduler] (jobRunId=${jobRunId}) Completed subscription transition and reminder check in ${durationMs}ms:`, {
      jobRunId,
      transitionedToPastDue: result.transitionedToPastDue,
      transitionedToSuspended: result.transitionedToSuspended,
      reminders: result.reminders,
      completedAt: new Date().toISOString()
    });

    return result;
  } catch (error) {
    logger.error(`[BillingScheduler] (jobRunId=${jobRunId}) Error during subscription transition check: ${error.message}`, {
      jobRunId,
      error: error.message
    });
    try {
      const Sentry = require('@sentry/node');
      if (process.env.SENTRY_DSN && Sentry && typeof Sentry.captureException === 'function') {
        Sentry.captureException(error, {
          tags: { alert: 'billing_scheduler_failure', component: 'billing-scheduler' },
          extra: { jobRunId }
        });
      }
    } catch (sentryErr) {
      // Ignore Sentry dispatch error
    }
    throw error;
  } finally {
    if (acquiredLock && redisClient && redisClient.status === 'ready') {
      try {
        await redisClient.del(lockKey);
      } catch (err) {
        logger.warn(`[BillingScheduler] (jobRunId=${jobRunId}) Failed to release distributed lock: ${err.message}`, { jobRunId });
      }
    }
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

/**
 * Evaluates subscriptions approaching trial expiration (5d, 1d)
 * or active period renewal (7d, 1d) and dispatches reminder notifications.
 *
 * @param {Date} [asOfDate] - Cutoff reference date (defaults to current date)
 * @returns {Promise<{ trialEnding5d: number, trialEnding1d: number, renewalDue7d: number, renewalDue1d: number }>}
 */
async function checkAndSendBillingReminders(asOfDate = new Date()) {
  const currentDate = new Date(asOfDate);
  const results = {
    trialEnding5d: 0,
    trialEnding1d: 0,
    renewalDue7d: 0,
    renewalDue1d: 0
  };

  function getCalendarDaysDiff(targetDate, baseDate) {
    if (!targetDate || !baseDate) return null;
    const t = new Date(targetDate);
    const b = new Date(baseDate);
    const tUtc = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
    const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
    return Math.round((tUtc - bUtc) / (24 * 60 * 60 * 1000));
  }

  // 1. Trial ending reminders (5 days, 1 day)
  const trialingSubscriptions = await Subscription.findAll({
    where: {
      status: 'trialing',
      trialEndsAt: { [Op.ne]: null }
    },
    include: [{ model: Plan, where: { code: { [Op.ne]: 'grandfathered' } } }]
  });

  for (const sub of trialingSubscriptions) {
    const diffDays = getCalendarDaysDiff(sub.trialEndsAt, currentDate);
    if (diffDays === 5 || diffDays === 1) {
      try {
        const res = await billingNotificationService.notifyTrialEnding({
          organizationId: sub.organizationId,
          daysRemaining: diffDays,
          subscription: sub
        });
        if (res.success && !res.skipped) {
          if (diffDays === 5) results.trialEnding5d++;
          else results.trialEnding1d++;
        }
      } catch (err) {
        logger.error(`[BillingScheduler] Error sending trial reminder for org ${sub.organizationId}:`, err);
      }
    }
  }

  // 2. Renewal due reminders (7 days, 1 day)
  const activeSubscriptions = await Subscription.findAll({
    where: {
      status: 'active',
      currentPeriodEnd: {
        [Op.lte]: new Date('2090-01-01')
      }
    },
    include: [{ model: Plan, where: { code: { [Op.ne]: 'grandfathered' } } }]
  });

  for (const sub of activeSubscriptions) {
    const diffDays = getCalendarDaysDiff(sub.currentPeriodEnd, currentDate);
    if (diffDays === 7 || diffDays === 1) {
      try {
        const res = await billingNotificationService.notifyRenewalDue({
          organizationId: sub.organizationId,
          daysRemaining: diffDays,
          subscription: sub
        });
        if (res.success && !res.skipped) {
          if (diffDays === 7) results.renewalDue7d++;
          else results.renewalDue1d++;
        }
      } catch (err) {
        logger.error(`[BillingScheduler] Error sending renewal reminder for org ${sub.organizationId}:`, err);
      }
    }
  }

  return results;
}

module.exports = {
  runSubscriptionTransitionJob,
  checkAndSendBillingReminders,
  startBillingScheduler,
  stopBillingScheduler,
  getSchedulerStatus
};
