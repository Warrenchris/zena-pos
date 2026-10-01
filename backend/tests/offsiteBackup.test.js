'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Mock @sentry/node to spy on captureException
jest.mock('@sentry/node', () => ({
  captureException: jest.fn()
}));

// Mock @aws-sdk/client-s3
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation((config) => ({
      config,
      send: mockSend
    })),
    PutObjectCommand: jest.fn().mockImplementation((params) => {
      if (params.Body && typeof params.Body.close === 'function') {
        params.Body.close();
      }
      return {
        params,
        _type: 'PutObjectCommand'
      };
    })
  };
});

const Sentry = require('@sentry/node');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { uploadToS3 } = require('../../scripts/backup-db');

describe('Offsite Backup to S3 with Encryption & Failure Isolation (DR-01 / Phase 7E)', () => {
  const originalEnv = process.env;
  let testDir;
  let sampleBackupPath;
  let sampleChecksumPath;
  const sampleFileName = 'test_backup_2026-10-01.sql.gz';
  const sampleData = 'GZIP_MOCK_DATA_CONTENT_12345';
  let sampleHash;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    // Setup temporary directory with mock backup & checksum files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zana-backup-test-'));
    sampleBackupPath = path.join(testDir, sampleFileName);
    sampleChecksumPath = `${sampleBackupPath}.sha256`;

    fs.writeFileSync(sampleBackupPath, sampleData);
    sampleHash = crypto.createHash('sha256').update(sampleData).digest('hex');
    fs.writeFileSync(sampleChecksumPath, `${sampleHash}  ${sampleFileName}\n`);
  });

  afterEach(() => {
    process.env = originalEnv;
    try {
      if (fs.existsSync(sampleChecksumPath)) fs.unlinkSync(sampleChecksumPath);
      if (fs.existsSync(sampleBackupPath)) fs.unlinkSync(sampleBackupPath);
      if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
    } catch (e) {
      // ignore cleanup race
    }
  });

  describe('S3 Configuration and Skipping', () => {
    test('gracefully skips S3 upload when BACKUP_S3_BUCKET is unset', async () => {
      delete process.env.BACKUP_S3_BUCKET;

      const result = await uploadToS3({
        backupFilePath: sampleBackupPath,
        checksumFilePath: sampleChecksumPath,
        backupFileName: sampleFileName
      });

      expect(result).toEqual({ skipped: true, reason: 'BUCKET_NOT_CONFIGURED' });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('S3 Upload with SSE-KMS / SSE-S3 Encryption', () => {
    test('uploads archive and sha256 checksum with default SSE-KMS encryption', async () => {
      process.env.BACKUP_S3_BUCKET = 'zana-test-backups';
      process.env.BACKUP_S3_PREFIX = 'daily-backups/';
      process.env.AWS_REGION = 'af-south-1';
      mockSend.mockResolvedValue({ ETag: '"mock-etag-123"' });

      const result = await uploadToS3({
        backupFilePath: sampleBackupPath,
        checksumFilePath: sampleChecksumPath,
        backupFileName: sampleFileName
      });

      expect(result.uploaded).toBe(true);
      expect(result.bucket).toBe('zana-test-backups');
      expect(result.archiveKey).toBe('daily-backups/test_backup_2026-10-01.sql.gz');
      expect(result.checksumKey).toBe('daily-backups/test_backup_2026-10-01.sql.gz.sha256');
      expect(result.sse).toBe('aws:kms');

      // Verify two PutObject calls: one for archive, one for checksum
      expect(PutObjectCommand).toHaveBeenCalledTimes(2);

      // Check archive call params
      const archiveCall = PutObjectCommand.mock.calls[0][0];
      expect(archiveCall.Bucket).toBe('zana-test-backups');
      expect(archiveCall.Key).toBe('daily-backups/test_backup_2026-10-01.sql.gz');
      expect(archiveCall.ServerSideEncryption).toBe('aws:kms');
      expect(archiveCall.ContentType).toBe('application/gzip');

      // Check checksum call params
      const checksumCall = PutObjectCommand.mock.calls[1][0];
      expect(checksumCall.Bucket).toBe('zana-test-backups');
      expect(checksumCall.Key).toBe('daily-backups/test_backup_2026-10-01.sql.gz.sha256');
      expect(checksumCall.ServerSideEncryption).toBe('aws:kms');
      expect(checksumCall.ContentType).toBe('text/plain');
      expect(checksumCall.Body).toContain(sampleHash);
    });

    test('supports custom KMS Key ID when BACKUP_S3_KMS_KEY_ID is specified', async () => {
      process.env.BACKUP_S3_BUCKET = 'zana-test-backups';
      process.env.BACKUP_S3_KMS_KEY_ID = 'arn:aws:kms:af-south-1:123456789012:key/test-key-uuid';
      mockSend.mockResolvedValue({});

      await uploadToS3({
        backupFilePath: sampleBackupPath,
        checksumFilePath: sampleChecksumPath,
        backupFileName: sampleFileName
      });

      expect(PutObjectCommand).toHaveBeenCalledTimes(2);
      const archiveCall = PutObjectCommand.mock.calls[0][0];
      expect(archiveCall.ServerSideEncryption).toBe('aws:kms');
      expect(archiveCall.SSEKMSKeyId).toBe('arn:aws:kms:af-south-1:123456789012:key/test-key-uuid');
    });

    test('supports AES256 fallback if BACKUP_S3_SSE=AES256 is explicitly configured', async () => {
      process.env.BACKUP_S3_BUCKET = 'zana-test-backups';
      process.env.BACKUP_S3_SSE = 'AES256';
      mockSend.mockResolvedValue({});

      const result = await uploadToS3({
        backupFilePath: sampleBackupPath,
        checksumFilePath: sampleChecksumPath,
        backupFileName: sampleFileName
      });

      expect(result.sse).toBe('AES256');
      const archiveCall = PutObjectCommand.mock.calls[0][0];
      expect(archiveCall.ServerSideEncryption).toBe('AES256');
      expect(archiveCall.SSEKMSKeyId).toBeUndefined();
    });
  });

  describe('Failure Isolation Contract', () => {
    test('propagates error when uploadToS3 fails, allowing caller to isolate without deleting local file', async () => {
      process.env.BACKUP_S3_BUCKET = 'zana-test-backups';
      mockSend.mockRejectedValue(new Error('S3 Connection Timed Out: 504 Gateway Timeout'));

      await expect(uploadToS3({
        backupFilePath: sampleBackupPath,
        checksumFilePath: sampleChecksumPath,
        backupFileName: sampleFileName
      })).rejects.toThrow('S3 Connection Timed Out');

      // Local backup and checksum MUST remain intact on disk
      expect(fs.existsSync(sampleBackupPath)).toBe(true);
      expect(fs.existsSync(sampleChecksumPath)).toBe(true);
      expect(fs.readFileSync(sampleBackupPath, 'utf8')).toBe(sampleData);
    });
  });
});
