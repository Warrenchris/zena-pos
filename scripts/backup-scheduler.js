'use strict';

/**
 * Automated Production MySQL Backup Scheduler Daemon (OPS-P2-01).
 *
 * Operational Safeguards:
 * - Recurring execution on configured interval (default: 24h for daily full backup RPO).
 * - Process mutex locking via filesystem lock (backups/.backup.lock) to strictly prevent overlapping backups.
 * - Non-zero exit code on unhandled failure for container orchestrator monitoring.
 * - Structured logging: start, finish, duration, archive size, checksum, and retention pruning.
 * - Non-blocking execution compatible with Docker Compose and bare-metal service managers.
 * - Supports CLI flag '--once' for one-shot manual/test execution.
 */

const fs = require('fs');
const path = require('path');
const { createBackup, pruneOldBackups } = require('./backup-db');

try {
  require(path.resolve(__dirname, '../backend/node_modules/dotenv')).config({ path: path.resolve(__dirname, '../backend/.env') });
} catch (e) {
  // Ignore if dotenv is not available
}

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, '../backups');
const LOCK_FILE = path.join(BACKUP_DIR, '.backup.lock');
const INTERVAL_HOURS = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '24');
const INTERVAL_MS = Math.max(1, INTERVAL_HOURS) * 60 * 60 * 1000;

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lockData = fs.readFileSync(LOCK_FILE, 'utf8').trim();
      const lockObj = JSON.parse(lockData);
      const lockAgeMinutes = (Date.now() - lockObj.timestamp) / (1000 * 60);

      // Stale lock detection: if lock older than 180 minutes, consider process dead and break lock
      if (lockAgeMinutes > 180) {
        console.warn(`[BackupScheduler] Stale lock detected (age: ${lockAgeMinutes.toFixed(1)} mins). Breaking lock.`);
        fs.unlinkSync(LOCK_FILE);
      } else {
        return false;
      }
    } catch (err) {
      fs.unlinkSync(LOCK_FILE);
    }
  }

  const payload = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
  fs.writeFileSync(LOCK_FILE, payload, { flag: 'wx' });
  return true;
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch (err) {
      // ignore unlink race
    }
  }
}

async function runScheduledBackupPass() {
  const startTime = Date.now();
  console.log(`[BackupScheduler] === Initiating Scheduled Backup Pass at ${new Date().toISOString()} ===`);

  if (!acquireLock()) {
    console.warn('[BackupScheduler] WARNING: Another backup operation is currently active. Skipping overlapping execution.');
    return { skipped: true, reason: 'OVERLAPPING_LOCK' };
  }

  try {
    const result = await createBackup();
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    const s3Status = result.s3?.uploaded
      ? `s3=s3://${result.s3.bucket}/${result.s3.archiveKey}`
      : (result.s3?.skipped ? 's3=skipped' : `s3=failed(${result.s3?.error})`);
    console.log(`[BackupScheduler] === Backup Pass Successfully Completed in ${durationSec}s ===`);
    console.log(`[BackupScheduler] Details: file=${path.basename(result.backupFilePath)}, size=${(result.sizeBytes / (1024 * 1024)).toFixed(2)}MB, sha256=${result.sha256}, ${s3Status}`);
    return { success: true, result, durationSec };
  } catch (err) {
    console.error(`[BackupScheduler] ERROR: Scheduled backup failed: ${err.message}`);
    throw err;
  } finally {
    releaseLock();
  }
}

function startSchedulerDaemon() {
  console.log(`[BackupScheduler] Starting production daemon. Interval: ${INTERVAL_HOURS} hours (${INTERVAL_MS} ms).`);
  console.log(`[BackupScheduler] Destination directory: ${BACKUP_DIR}`);

  // Run initial pass on startup after brief 5-second warmup
  setTimeout(() => {
    runScheduledBackupPass().catch(err => {
      console.error('[BackupScheduler] Initial backup pass error:', err.message);
    });
  }, 5000);

  // Set recurring interval
  const timer = setInterval(() => {
    runScheduledBackupPass().catch(err => {
      console.error('[BackupScheduler] Recurring backup pass error:', err.message);
    });
  }, INTERVAL_MS);

  // Graceful shutdown handling
  const shutdown = () => {
    console.log('[BackupScheduler] Received termination signal. Cleaning up locks and shutting down...');
    clearInterval(timer);
    releaseLock();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  const isOnce = process.argv.includes('--once');
  if (isOnce) {
    runScheduledBackupPass()
      .then((res) => {
        if (res && res.skipped) {
          process.exit(2);
        }
        process.exit(0);
      })
      .catch((err) => {
        console.error('[BackupScheduler] Fatal error in --once run:', err);
        process.exit(1);
      });
  } else {
    startSchedulerDaemon();
  }
}

module.exports = {
  runScheduledBackupPass,
  acquireLock,
  releaseLock,
  LOCK_FILE
};
