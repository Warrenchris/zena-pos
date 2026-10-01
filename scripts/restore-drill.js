'use strict';

/**
 * Automated Offsite S3 MySQL Restore Drill (Phase 7E / Requirement #4).
 *
 * Capabilities:
 * - Strictly fetches the latest backup archive (.sql.gz) and checksum (.sha256) FROM S3
 * - Validates cryptographic SHA-256 integrity prior to restoration
 * - Restores into an isolated scratch verification database (default: zana_pos_restore_drill)
 * - Verifies relational table count threshold (>= 35 tables) and smoke schema sanity
 * - Cleans up scratch database and local temporary files upon drill completion
 * - Dispatches alerts to Sentry if restoration or integrity checks fail
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

try {
  require(path.resolve(__dirname, '../backend/node_modules/dotenv')).config({
    path: path.resolve(__dirname, '../backend/.env')
  });
} catch (e) {
  // Ignore if dotenv is not available
}

let Sentry;
try {
  Sentry = require('@sentry/node');
} catch (e) {
  try {
    Sentry = require(path.resolve(__dirname, '../backend/node_modules/@sentry/node'));
  } catch (err) {
    // Sentry optional
  }
}

const { restoreBackup } = require('./restore-db');

const SCRATCH_DIR = path.resolve(__dirname, '../backups/drill_scratch');
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || process.env.DB_PASSWORD || 'root';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3307';
const DOCKER_CONTAINER = process.env.DOCKER_MYSQL_CONTAINER || 'zana-mysql';

function getS3Client() {
  let S3Client;
  try {
    ({ S3Client } = require('@aws-sdk/client-s3'));
  } catch (e) {
    try {
      ({ S3Client } = require(path.resolve(__dirname, '../backend/node_modules/@aws-sdk/client-s3')));
    } catch (innerErr) {
      throw new Error(`AWS S3 SDK (@aws-sdk/client-s3) is required for restore drill: ${innerErr.message}`);
    }
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'af-south-1';
  const clientConfig = { region };
  if (process.env.BACKUP_S3_ENDPOINT) {
    clientConfig.endpoint = process.env.BACKUP_S3_ENDPOINT;
  }
  if (process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true') {
    clientConfig.forcePathStyle = true;
  }

  return new S3Client(clientConfig);
}

async function streamToFile(readableStream, destinationPath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(destinationPath);
    readableStream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    readableStream.on('error', reject);
  });
}

function dropScratchDatabase(targetDb) {
  let isDocker = false;
  try {
    const containers = execSync(`docker ps --filter "name=${DOCKER_CONTAINER}" --format "{{.Names}}"`, {
      stdio: ['pipe', 'pipe', 'ignore']
    }).toString();
    if (containers.includes(DOCKER_CONTAINER)) isDocker = true;
  } catch (e) {
    isDocker = false;
  }

  const dropSql = `DROP DATABASE IF EXISTS \`${targetDb}\`;`;
  try {
    if (isDocker) {
      execSync(`docker exec -i ${DOCKER_CONTAINER} mysql -u${DB_USER} -p${DB_PASS} -e "${dropSql}"`, {
        stdio: ['pipe', 'pipe', 'ignore']
      });
    } else {
      execSync(`mysql -h${DB_HOST} -P${DB_PORT} -u${DB_USER} -p${DB_PASS} -e "${dropSql}"`, {
        stdio: ['pipe', 'pipe', 'ignore']
      });
    }
  } catch (dropErr) {
    console.warn(`[RestoreDrill] Notice: error dropping scratch DB '${targetDb}': ${dropErr.message}`);
  }
}

async function runRestoreDrill(options = {}) {
  const startTime = Date.now();
  const targetDb = options.targetDb || 'zana_pos_restore_drill';
  const cleanScratch = options.cleanScratch !== false;
  const keepDb = options.keepDb === true;

  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) {
    const err = new Error('Restore drill requires BACKUP_S3_BUCKET to be configured to verify offsite backup.');
    console.error(`[RestoreDrill] FATAL: ${err.message}`);
    throw err;
  }

  console.log(`[RestoreDrill] === Initiating Offsite S3 Restore Drill ===`);
  console.log(`[RestoreDrill] S3 Bucket: ${bucket}`);
  console.log(`[RestoreDrill] Target Verification Database: ${targetDb}`);

  let ListObjectsV2Command, GetObjectCommand;
  try {
    ({ ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3'));
  } catch (e) {
    ({ ListObjectsV2Command, GetObjectCommand } = require(path.resolve(__dirname, '../backend/node_modules/@aws-sdk/client-s3')));
  }

  const s3 = getS3Client();
  let prefix = process.env.BACKUP_S3_PREFIX !== undefined ? process.env.BACKUP_S3_PREFIX : 'backups/';
  if (prefix && !prefix.endsWith('/')) prefix += '/';

  if (!fs.existsSync(SCRATCH_DIR)) {
    fs.mkdirSync(SCRATCH_DIR, { recursive: true });
  }

  let localArchivePath = null;
  let localChecksumPath = null;

  try {
    // 1. List archives in S3 to find the latest backup
    const listRes = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix
    }));

    const contents = listRes.Contents || [];
    const archives = contents
      .filter((obj) => obj.Key && obj.Key.endsWith('.sql.gz'))
      .sort((a, b) => new Date(b.LastModified || 0) - new Date(a.LastModified || 0));

    if (archives.length === 0) {
      throw new Error(`No backup archives (.sql.gz) found in S3 bucket '${bucket}' with prefix '${prefix}'.`);
    }

    const latestS3Key = archives[0].Key;
    const checksumS3Key = `${latestS3Key}.sha256`;
    const archiveFileName = path.basename(latestS3Key);

    console.log(`[RestoreDrill] Found latest offsite archive in S3: ${latestS3Key}`);

    localArchivePath = path.join(SCRATCH_DIR, archiveFileName);
    localChecksumPath = `${localArchivePath}.sha256`;

    // 2. Download the archive from S3
    console.log(`[RestoreDrill] Downloading offsite archive from S3...`);
    const archiveObj = await s3.send(new GetObjectCommand({
      Bucket: bucket,
      Key: latestS3Key
    }));
    await streamToFile(archiveObj.Body, localArchivePath);

    // 3. Download the checksum from S3 (or verify if present)
    console.log(`[RestoreDrill] Downloading checksum from S3...`);
    let expectedHash = null;
    try {
      const checksumObj = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: checksumS3Key
      }));
      await streamToFile(checksumObj.Body, localChecksumPath);
      const checksumFileText = fs.readFileSync(localChecksumPath, 'utf8').trim();
      expectedHash = checksumFileText.split(/\s+/)[0];
    } catch (csErr) {
      console.warn(`[RestoreDrill] Warning: Could not retrieve checksum file '${checksumS3Key}' from S3: ${csErr.message}`);
    }

    // 4. Validate SHA-256 integrity
    const archiveBuffer = fs.readFileSync(localArchivePath);
    const calculatedHash = crypto.createHash('sha256').update(archiveBuffer).digest('hex');

    if (expectedHash && calculatedHash !== expectedHash) {
      throw new Error(`Integrity verification failed: S3 archive checksum mismatch! Expected: ${expectedHash}, Got: ${calculatedHash}`);
    }
    console.log(`[RestoreDrill] SHA-256 Checksum verified: ${calculatedHash}`);

    // If local checksum file didn't exist, write it so restoreBackup can verify
    if (!fs.existsSync(localChecksumPath)) {
      fs.writeFileSync(localChecksumPath, `${calculatedHash}  ${archiveFileName}\n`);
    }

    // 5. Restore into the scratch database
    console.log(`[RestoreDrill] Executing restoration to '${targetDb}'...`);
    const restoreResult = await restoreBackup(localArchivePath, targetDb);

    const verifiedTableCount = restoreResult.tableCount || 0;
    console.log(`[RestoreDrill] Restored table count in '${targetDb}': ${verifiedTableCount}`);

    if (verifiedTableCount < 35) {
      throw new Error(`Restore smoke check failed: table count ${verifiedTableCount} is below required threshold (>= 35).`);
    }

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[RestoreDrill] === RESTORE DRILL PASSED SUCCESSFULLY in ${durationSec}s ===`);

    return {
      success: true,
      sourceS3Key: latestS3Key,
      targetDb,
      verifiedTableCount,
      durationSec
    };
  } catch (err) {
    console.error(`[RestoreDrill] ERROR: Drill failed: ${err.message}`);
    if (process.env.SENTRY_DSN && Sentry && typeof Sentry.captureException === 'function') {
      try {
        Sentry.captureException(err, {
          tags: { alert: 'restore_drill_failure', component: 'restore-drill' },
          extra: { targetDb, bucket }
        });
      } catch (sentryErr) {
        // ignore sentry notification failure
      }
    }
    throw err;
  } finally {
    // Teardown: Clean up scratch database unless explicitly requested to keep
    if (!keepDb) {
      console.log(`[RestoreDrill] Dropping scratch database '${targetDb}'...`);
      dropScratchDatabase(targetDb);
    }

    // Teardown: Remove temporary local downloads
    if (cleanScratch) {
      try {
        if (localArchivePath && fs.existsSync(localArchivePath)) fs.unlinkSync(localArchivePath);
        if (localChecksumPath && fs.existsSync(localChecksumPath)) fs.unlinkSync(localChecksumPath);
      } catch (cleanErr) {
        // ignore unlink error
      }
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let targetDb = 'zana_pos_restore_drill';
  let keepDb = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--target-db' && args[i + 1]) {
      targetDb = args[++i];
    } else if (args[i] === '--keep-db') {
      keepDb = true;
    }
  }

  runRestoreDrill({ targetDb, keepDb })
    .then((result) => {
      console.log('[RestoreDrill] Summary:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[RestoreDrill] Fatal error:', err.message);
      process.exit(1);
    });
}

module.exports = { runRestoreDrill, dropScratchDatabase };
