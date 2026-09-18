# Disaster Recovery & Backup Runbook (DR-01)

## Overview
This runbook defines the disaster recovery policy, logical backup pipeline, integrity verification, and emergency restoration runbooks for the Zana POS multi-tenant SaaS platform.

---

## 1. RPO & RTO Objectives

| Metric | Target | Description |
|---|---|---|
| **RPO (Recovery Point Objective)** | **< 1 hour** (Scheduled) / **< 5 minutes** (with Binary Log PITR) | Maximum acceptable data loss duration in a catastrophic infrastructure failure. |
| **RTO (Recovery Time Objective)** | **< 30 minutes** | Maximum allowable downtime to reconstruct operational SaaS database services. |

---

## 2. Backup Strategy

### 2.1 Logical Backups
- **Engine**: MySQL 8.0 `mysqldump`.
- **Options**:
  - `--single-transaction`: Consistent snapshot without locking database tables or interrupting POS checkout operations.
  - `--quick`: Streams rows directly rather than caching entire tables in client memory.
  - `--routines --triggers`: Backs up stored procedures and automated database triggers.
  - `--hex-blob`: Safely handles binary columns (such as UUIDs, tokens, and encrypted credentials).
  - `--default-character-set=utf8mb4`: Prevents Unicode text truncation.
- **Compression**: Level 9 `gzip` compression applied directly to standard output stream.
- **Integrity**: Every backup produces an accompanying `.sha256` checksum archive hash.

### 2.2 Schedule & Retention Policy
- **Automated Frequency**:
  - Full logical backup every 6 hours (production cron / worker).
  - Continuous binary log archiving for Point-In-Time-Recovery (PITR).
- **Retention Schedule**:
  - Hourly/Daily snapshots: Retained for 30 days.
  - Weekly snapshots: Retained for 90 days.
  - Monthly snapshots: Retained for 365 days.
- **Automated Pruning**: `scripts/backup-db.js` prunes archives older than `BACKUP_RETENTION_DAYS` (default 30 days).

### 2.3 Offsite Storage & Encryption
- In production, backup archives must be synced to encrypted object storage (e.g. AWS S3 with SSE-KMS or Cloudflare R2).
- Bucket versioning enabled; immutability (WORM / Object Lock) configured for 30 days to defend against ransomware.

---

## 3. Automated Scripts

### 3.1 Generating a Backup
To generate a timestamped compressed backup with checksum:
```bash
node scripts/backup-db.js
```
Output:
- `backups/zana_pos_backup_<timestamp>.sql.gz`
- `backups/zana_pos_backup_<timestamp>.sql.gz.sha256`

### 3.2 Restoring from a Backup
To restore and verify against a designated target database:
```bash
node scripts/restore-db.js [path/to/backup.sql.gz] [target_database_name]
```
If no arguments are supplied, the script automatically selects the latest valid `.sql.gz` in `backups/`, verifies its SHA-256 checksum, streams gunzip into the database, and validates table counts.

---

## 4. Disaster Recovery Procedures

### Scenario A: Accidental Tenant Deletion / Human Error
1. Locate the closest backup timestamp prior to the incident in the offsite backup repository.
2. Spin up a restore verification database:
   ```bash
   node scripts/restore-db.js backups/zana_pos_backup_2026-09-18T06-05-37-035Z.sql.gz zana_pos_recovery
   ```
3. Extract the affected tenant records scoped by `organizationId`:
   ```sql
   INSERT INTO zana_pos.Organizations SELECT * FROM zana_pos_recovery.Organizations WHERE id = <TARGET_ORG_ID>;
   INSERT INTO zana_pos.Shops SELECT * FROM zana_pos_recovery.Shops WHERE organizationId = <TARGET_ORG_ID>;
   ...
   ```
4. Verify tenant integrity and purge temporary recovery database `zana_pos_recovery`.

### Scenario B: Complete Host / Primary Infrastructure Outage
1. Provision a new MySQL 8.0 instance (or activate standby replica).
2. Retrieve the latest verified backup and SHA256 checksum from offsite storage.
3. Validate checksum:
   ```bash
   sha256sum -c backups/zana_pos_backup_<timestamp>.sql.gz.sha256
   ```
4. Restore into the primary production database:
   ```bash
   node scripts/restore-db.js backups/zana_pos_backup_<timestamp>.sql.gz zana_pos
   ```
5. Apply point-in-time binary logs from the time of backup until disaster moment:
   ```bash
   mysqlbinlog --start-datetime="<BACKUP_TIME>" /var/log/mysql/binlog.* | mysql -uroot -p zana_pos
   ```
6. Run database migrations to guarantee schema alignment:
   ```bash
   npx sequelize-cli db:migrate
   ```
7. Run healthcheck endpoint to confirm system availability:
   ```bash
   curl -I http://localhost:5000/health
   ```

---

## 5. Verification & Testing Evidence
- **Automated Restore Verification**: Verified on 2026-09-18. Restored clean snapshot into `zana_pos_restore_test` with complete schema and table verification.
