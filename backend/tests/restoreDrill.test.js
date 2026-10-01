'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Readable } = require('stream');

// Mock @sentry/node
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
    ListObjectsV2Command: jest.fn().mockImplementation((params) => ({
      params,
      _type: 'ListObjectsV2Command'
    })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({
      params,
      _type: 'GetObjectCommand'
    }))
  };
});

// Mock restoreBackup from restore-db so unit test doesn't execute raw child_process mysqldump on test runner
jest.mock('../../scripts/restore-db', () => ({
  restoreBackup: jest.fn().mockResolvedValue({
    targetDb: 'zana_pos_restore_drill',
    tableCount: 42,
    status: 'VERIFIED'
  }),
  verifyChecksum: jest.fn().mockReturnValue(true)
}));

const Sentry = require('@sentry/node');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { restoreBackup } = require('../../scripts/restore-db');
const { runRestoreDrill } = require('../../scripts/restore-drill');

describe('Automated S3 Restore Drill (Phase 7E / Requirement #4)', () => {
  const originalEnv = process.env;
  const mockBucket = 'zana-offsite-backups';
  const mockPrefix = 'backups/';
  const mockArchiveName = 'zana_pos_backup_2026-10-01T12-00-00-000Z.sql.gz';
  const mockArchiveContent = 'GZIP_MOCK_SQL_DATABASE_DUMP_CONTENT';
  const mockHash = crypto.createHash('sha256').update(mockArchiveContent).digest('hex');
  const mockChecksumContent = `${mockHash}  ${mockArchiveName}\n`;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      BACKUP_S3_BUCKET: mockBucket,
      BACKUP_S3_PREFIX: mockPrefix,
      AWS_REGION: 'af-south-1'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('fails fast when BACKUP_S3_BUCKET is unset (drill must prove offsite copy)', async () => {
    delete process.env.BACKUP_S3_BUCKET;

    await expect(runRestoreDrill({ targetDb: 'zana_pos_restore_drill' }))
      .rejects.toThrow('Restore drill requires BACKUP_S3_BUCKET to be configured');

    expect(mockSend).not.toHaveBeenCalled();
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  test('fails fast when no backup archives are found in S3', async () => {
    mockSend.mockImplementation(async (command) => {
      if (command._type === 'ListObjectsV2Command') {
        return { Contents: [] };
      }
      return {};
    });

    await expect(runRestoreDrill({ targetDb: 'zana_pos_restore_drill' }))
      .rejects.toThrow('No backup archives (.sql.gz) found in S3 bucket');

    expect(restoreBackup).not.toHaveBeenCalled();
  });

  test('downloads archive & checksum strictly from S3, verifies integrity, restores, and verifies table count', async () => {
    mockSend.mockImplementation(async (command) => {
      if (command._type === 'ListObjectsV2Command') {
        return {
          Contents: [
            { Key: `${mockPrefix}zana_pos_backup_2026-09-25.sql.gz`, LastModified: new Date('2026-09-25') },
            { Key: `${mockPrefix}${mockArchiveName}`, LastModified: new Date('2026-10-01') },
            { Key: `${mockPrefix}${mockArchiveName}.sha256`, LastModified: new Date('2026-10-01') }
          ]
        };
      }
      if (command._type === 'GetObjectCommand') {
        if (command.params.Key.endsWith('.sha256')) {
          return {
            Body: Readable.from(Buffer.from(mockChecksumContent))
          };
        }
        return {
          Body: Readable.from(Buffer.from(mockArchiveContent))
        };
      }
      return {};
    });

    const result = await runRestoreDrill({
      targetDb: 'zana_pos_restore_drill',
      cleanScratch: true
    });

    expect(result.success).toBe(true);
    expect(result.sourceS3Key).toBe(`${mockPrefix}${mockArchiveName}`);
    expect(result.targetDb).toBe('zana_pos_restore_drill');
    expect(result.verifiedTableCount).toBe(42);

    // Verify restoreBackup was called with downloaded archive
    expect(restoreBackup).toHaveBeenCalledTimes(1);
    const [restoredFile, restoredTarget] = restoreBackup.mock.calls[0];
    expect(restoredFile).toMatch(/zana_pos_backup_2026-10-01/);
    expect(restoredTarget).toBe('zana_pos_restore_drill');
  });

  test('aborts restore and alerts Sentry if downloaded S3 checksum does not match S3 archive', async () => {
    const badChecksum = `0000000000000000000000000000000000000000000000000000000000000000  ${mockArchiveName}\n`;
    process.env.SENTRY_DSN = 'https://fake@sentry.io/123';

    mockSend.mockImplementation(async (command) => {
      if (command._type === 'ListObjectsV2Command') {
        return {
          Contents: [
            { Key: `${mockPrefix}${mockArchiveName}`, LastModified: new Date('2026-10-01') },
            { Key: `${mockPrefix}${mockArchiveName}.sha256`, LastModified: new Date('2026-10-01') }
          ]
        };
      }
      if (command._type === 'GetObjectCommand') {
        if (command.params.Key.endsWith('.sha256')) {
          return { Body: Readable.from(Buffer.from(badChecksum)) };
        }
        return { Body: Readable.from(Buffer.from(mockArchiveContent)) };
      }
      return {};
    });

    await expect(runRestoreDrill({ targetDb: 'zana_pos_restore_drill' }))
      .rejects.toThrow('Integrity verification failed');

    // restoreBackup must NOT be called if checksum fails
    expect(restoreBackup).not.toHaveBeenCalled();

    // Sentry alert should be captured
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
