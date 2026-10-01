'use strict';

// Mock @sentry/node
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn()
}));

const Sentry = require('@sentry/node');
const { recordWebhookAuthFailure, FAILURE_THRESHOLD } = require('../src/utils/webhookAlerting');
const billingScheduler = require('../src/services/billingScheduler');
const backupScheduler = require('../../scripts/backup-scheduler');
const backupDb = require('../../scripts/backup-db');
const redisClient = require('../src/config/redis');

describe('Monitoring & Alerting Wiring (Phase 7E / Requirement #5)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      SENTRY_DSN: 'https://mock@sentry.io/123',
      NODE_ENV: 'production' // ensure billingScheduler doesn't early-return for test env
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Webhook 401 Signature Verification Spike Alerting', () => {
    test('logs warning for initial failures without Sentry alert', async () => {
      // Mock Redis incr to return 1
      const incrSpy = jest.spyOn(redisClient, 'incr').mockResolvedValue(1);
      const expireSpy = jest.spyOn(redisClient, 'expire').mockResolvedValue(1);

      await recordWebhookAuthFailure({
        provider: 'mpesa_billing',
        ip: '197.232.1.5',
        details: 'missing verification token'
      });

      expect(incrSpy).toHaveBeenCalled();
      expect(expireSpy).toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();

      incrSpy.mockRestore();
      expireSpy.mockRestore();
    });

    test('triggers Sentry alert when failure count reaches FAILURE_THRESHOLD (10 in 5m)', async () => {
      const incrSpy = jest.spyOn(redisClient, 'incr').mockResolvedValue(FAILURE_THRESHOLD);

      await recordWebhookAuthFailure({
        provider: 'flutterwave_billing',
        ip: '41.90.10.2',
        details: 'invalid verif-hash'
      });

      expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
      const [msg, context] = Sentry.captureMessage.mock.calls[0];
      expect(msg).toContain('Webhook 401 signature verification failure spike');
      expect(context.level).toBe('error');
      expect(context.tags).toEqual({ alert: 'webhook_auth_spike', provider: 'flutterwave_billing' });
      expect(context.extra.count).toBe(FAILURE_THRESHOLD);
      expect(context.extra.lastIp).toBe('41.90.10.2');

      incrSpy.mockRestore();
    });
  });

  describe('Billing Scheduler Failure Alerting', () => {
    test('captures exception to Sentry when billing transition check throws', async () => {
      const billingService = require('../src/services/billingService');
      const errorMsg = 'DB connection dropped during subscription transition pass';
      const transitionSpy = jest.spyOn(billingService, 'checkAndTransitionExpiredSubscriptions')
        .mockRejectedValue(new Error(errorMsg));

      await expect(billingScheduler.runSubscriptionTransitionJob())
        .rejects.toThrow(errorMsg);

      expect(Sentry.captureException).toHaveBeenCalled();
      const [capturedErr, context] = Sentry.captureException.mock.calls[0];
      expect(capturedErr.message).toBe(errorMsg);
      expect(context.tags).toEqual({
        alert: 'billing_scheduler_failure',
        component: 'billing-scheduler'
      });

      transitionSpy.mockRestore();
    });
  });

  describe('Backup Scheduler Failure Alerting', () => {
    test('captures exception to Sentry when scheduled backup pass fails', async () => {
      const errorMsg = 'mysqldump process exited with code 1: Access denied';
      const backupSpy = jest.spyOn(backupDb, 'createBackup')
        .mockRejectedValue(new Error(errorMsg));

      // Ensure lock file is cleaned up before testing
      backupScheduler.releaseLock();

      await expect(backupScheduler.runScheduledBackupPass())
        .rejects.toThrow(errorMsg);

      expect(Sentry.captureException).toHaveBeenCalled();
      const [capturedErr, context] = Sentry.captureException.mock.calls[0];
      expect(capturedErr.message).toBe(errorMsg);
      expect(context.tags).toEqual({
        alert: 'backup_scheduler_failure',
        component: 'backup-scheduler'
      });

      backupSpy.mockRestore();
      backupScheduler.releaseLock();
    });
  });
});
