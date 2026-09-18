'use strict';

/**
 * Automated Production MySQL Backup Utility (DR-01).
 *
 * Capabilities:
 * - Online non-blocking logical backup using mysqldump with --single-transaction
 * - Transparent gzip compression
 * - SHA-256 integrity checksum generation
 * - Automated retention management (removes backups older than RETENTION_DAYS)
 * - Compatible with Dockerized MySQL and bare-metal environments
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
try {
  require(path.resolve(__dirname, '../backend/node_modules/dotenv')).config({ path: path.resolve(__dirname, '../backend/.env') });
} catch (e) {
  // Ignore if dotenv is not available
}

const BACKUP_DIR = process.env.BACKUP_DIR || path.resolve(__dirname, '../backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const DB_NAME = process.env.DB_NAME || 'zana_pos';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || process.env.DB_PASSWORD || 'root';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '3307';
const DOCKER_CONTAINER = process.env.DOCKER_MYSQL_CONTAINER || 'zana-mysql';

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function createBackup() {
  const timestamp = getTimestamp();
  const backupFileName = `${DB_NAME}_backup_${timestamp}.sql.gz`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  const checksumFilePath = `${backupFilePath}.sha256`;

  console.log(`[DR-01 Backup] Initiating backup for database '${DB_NAME}'...`);
  console.log(`[DR-01 Backup] Destination: ${backupFilePath}`);

  // Determine whether to use docker exec or local mysqldump
  let isDocker = false;
  try {
    const containers = execSync(`docker ps --filter "name=${DOCKER_CONTAINER}" --format "{{.Names}}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    if (containers.includes(DOCKER_CONTAINER)) {
      isDocker = true;
    }
  } catch (e) {
    isDocker = false;
  }

  let dumpCmd = '';
  let dumpArgs = [];

  const dumpFlags = [
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--hex-blob',
    '--default-character-set=utf8mb4'
  ];

  if (isDocker) {
    console.log(`[DR-01 Backup] Using Docker container '${DOCKER_CONTAINER}' for mysqldump.`);
    dumpCmd = 'docker';
    dumpArgs = [
      'exec',
      DOCKER_CONTAINER,
      'mysqldump',
      `-u${DB_USER}`,
      `-p${DB_PASS}`,
      ...dumpFlags,
      DB_NAME
    ];
  } else {
    console.log(`[DR-01 Backup] Using host mysqldump command on ${DB_HOST}:${DB_PORT}.`);
    dumpCmd = 'mysqldump';
    dumpArgs = [
      `-h${DB_HOST}`,
      `-P${DB_PORT}`,
      `-u${DB_USER}`,
      `-p${DB_PASS}`,
      ...dumpFlags,
      DB_NAME
    ];
  }

  return new Promise((resolve, reject) => {
    const dumpProcess = spawn(dumpCmd, dumpArgs);
    const gzipStream = zlib.createGzip({ level: 9 });
    const fileStream = fs.createWriteStream(backupFilePath);
    dumpProcess.stdout
      .pipe(gzipStream)
      .pipe(fileStream);

    let stderrData = '';
    dumpProcess.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    fileStream.on('finish', () => {
      // Check if file is non-empty
      const stats = fs.statSync(backupFilePath);
      if (stats.size === 0) {
        fs.unlinkSync(backupFilePath);
        return reject(new Error(`Backup produced empty file. Error output: ${stderrData}`));
      }

      const fileBuffer = fs.readFileSync(backupFilePath);
      const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      fs.writeFileSync(checksumFilePath, `${sha256}  ${backupFileName}\n`);

      console.log(`[DR-01 Backup] SUCCESS! Backup created:`);
      console.log(`  File: ${backupFileName} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
      console.log(`  SHA256: ${sha256}`);

      // Apply retention policy
      pruneOldBackups();
      resolve({ backupFilePath, checksumFilePath, sha256, sizeBytes: stats.size });
    });

    dumpProcess.on('error', (err) => {
      reject(new Error(`mysqldump process failed to start: ${err.message}`));
    });

    dumpProcess.on('close', (code) => {
      if (code !== 0 && !stderrData.includes('Warning: Using a password')) {
        reject(new Error(`mysqldump failed with exit code ${code}: ${stderrData}`));
      }
    });
  });
}

function pruneOldBackups() {
  console.log(`[DR-01 Backup] Applying retention policy (${RETENTION_DAYS} days)...`);
  const now = Date.now();
  const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (file.endsWith('.sql.gz') || file.endsWith('.sha256')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[DR-01 Backup] Pruned expired backup file: ${file}`);
        }
      }
    }
  } catch (err) {
    console.warn(`[DR-01 Backup] Warning during retention pruning:`, err.message);
  }
}

if (require.main === module) {
  createBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[DR-01 Backup] Backup failed:', err);
      process.exit(1);
    });
}

module.exports = { createBackup, pruneOldBackups };
