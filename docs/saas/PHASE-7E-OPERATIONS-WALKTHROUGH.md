# Phase 7E Operations Walkthrough: Offsite Backups, Disaster Recovery & Production Hardening

## Overview
Phase 7E establishes automated offsite backups, cloud disaster recovery drills, production secret hardening, dependency security upgrades, and proactive monitoring/alerting across the Zana POS platform.

---

## 1. Commit Log & Implementation Evidence

| Commit Hash | Type | Summary | Key Files Modified |
| :--- | :--- | :--- | :--- |
| `3b0bb5b` | `docs` | Add activityController tenant isolation gap to 7F risk list | `docs/saas/PHASE-7-SAAS-COMPLETION-PLAN.md` |
| `3bad57b` | `feat` | Add offsite S3 backup upload with KMS encryption and failure isolation | `backend/package.json`, `scripts/backup-db.js`, `scripts/backup-scheduler.js`, `backend/tests/offsiteBackup.test.js` |
| `d053a31` | `feat` | Add automated offsite S3 restore drill with integrity check and sandbox cleanup | `scripts/restore-drill.js`, `backend/tests/restoreDrill.test.js` |
| `c889125` | `fix` | Require explicit REDIS_PASSWORD without fallback in production docker-compose | `docker-compose.prod.yml` |
| `544cf80` | `chore` | Upgrade multer to ^2.4.0 and nodemailer to ^6.10.1 | `backend/package.json`, `package-lock.json` |
| `1a8d6e1` | `feat` | Wire monitoring alerts for backup failure, billing scheduler failure, and webhook 401 spike | `backend/src/utils/webhookAlerting.js`, `backend/src/routes/billingRoutes.js`, `backend/src/routes/mpesaRoutes.js`, `backend/src/services/billingScheduler.js`, `scripts/backup-scheduler.js`, `backend/tests/schedulerAlerting.test.js` |
| `1ba9d9e` | `fix` | Scope activityController queries to caller shopId for tenant isolation | `backend/src/controllers/activityController.js`, `backend/src/routes/activity.js` |

---

## 2. Technical Decisions & Findings Resolutions

### 1. Offsite S3 Backup Upload & Failure Isolation (`scripts/backup-db.js`)
- **Plugin Hook:** `uploadToS3(archivePath, checksumPath)` triggers immediately following successful local `.sql.gz` dump and SHA-256 calculation.
- **Strict Failure Isolation:** S3 upload errors are caught, logged, and captured via Sentry (`Sentry.captureException`), but **never roll back, truncate, or delete local backups**. The local 7-day retention lifecycle remains completely uninterrupted even during AWS outages or credential rotation failures.
- **Streaming Pipeline:** Implemented using Node `fs.createReadStream()` piped into `@aws-sdk/client-s3`'s `PutObjectCommand`. Errors on both the file stream and the S3 network transfer are explicitly handled.

### 2. AWS SDK & IAM Permissions
- **SDK Selection:** Modern `@aws-sdk/client-s3` (`^3.1144.0`) modular SDK installed directly in `backend/package.json`.
- **Environment Variables:** Credentials are authenticated via `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, and `BACKUP_KMS_KEY_ARN`.
- **IAM Policy:** Principle of least privilege enforced. The application IAM role requires `s3:PutObject` on `arn:aws:s3:::<BACKUP_S3_BUCKET>/<BACKUP_S3_PREFIX>/*`. Destructive actions (`s3:DeleteObject`, `s3:DeleteBucket`) are denied to the POS runtime role.

### 3. Server-Side Encryption: SSE-KMS Justification
Under Section 23 of the Kenya Tax Procedures Act, 2015, registered businesses must retain books of accounts and records for a minimum statutory period of 5 years.
- **SSE-KMS (`ServerSideEncryption: 'aws:kms'`)** was chosen over generic `AES256` for three regulatory and security reasons:
  1. **Immutable CloudTrail Audit Trail:** Every single encryption (`kms:GenerateDataKey`) and decryption (`kms:Decrypt`) event is logged into AWS CloudTrail with caller ARN, timestamp, source IP, and key ID, ensuring full cryptographic auditability for financial records.
  2. **Dual-Layer Authorization:** An attacker or rogue IAM entity possessing S3 object read access cannot decrypt backup data without distinct KMS key decrypt permissions.
  3. **Centralized Key Lifecycle & Rotation:** AWS KMS handles automated annual key rotation while retaining older key material to ensure 5-year-old backups remain restorable on demand.

### 4. Automated Offsite S3 Restore Drill (`scripts/restore-drill.js`)
- **Strictly Pulls From S3:** Does not test against local cached files. Proves that the remote offsite backup is genuinely restorable.
- **Automated Workflow:**
  1. Lists remote objects with prefix via `ListObjectsV2Command` and identifies latest `.sql.gz` and `.sha256`.
  2. Downloads both artifacts via `GetObjectCommand` into a temporary scratch directory.
  3. Recomputes SHA-256 checksum locally and verifies against `.sha256` string.
  4. Decompresses `.sql.gz` and creates a scratch sandbox database (`zana_pos_restore_drill`).
  5. Executes MySQL import via CLI stream.
  6. Verifies database schema integrity by querying `SHOW TABLES` (asserting $\ge 35$ tables).
  7. Drops `zana_pos_restore_drill` sandbox database and deletes local temporary drill files.
  8. Emits structured JSON summary and triggers Sentry alert if any stage fails.

### 5. Redis Password Fail-Fast (`docker-compose.prod.yml`)
- Replaced fallback default syntax `${REDIS_PASSWORD:-zana_secure_redis_pwd}` with strict interpolation `${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env.prod}` across lines 41, 47, and 89.
- Verified: Attempting to launch production compose without `REDIS_PASSWORD` set in `.env.prod` immediately halts execution with an error rather than silently defaulting to a known password.

### 6. Dependency Security Upgrades
- **`multer` upgraded to `^2.4.0`:** Eliminates all 5 reported GHSA advisories while preserving full API backward compatibility for POS multipart file uploads.
- **`nodemailer` upgraded to `^6.10.1`:** Evaluated against `nodemailer@10.x`. `nodemailer@10.0.13` strictly requires Node `>=20.0.0` (`engines: { node: '>=20.0.0' }`), whereas the production base image (`Dockerfile` and `Dockerfile.prod`) is pinned to `node:18-alpine`. Upgrading to `6.10.1` ensures complete stability and zero engine mismatch risks on Node 18. The Node 20 engine bump is scheduled for Phase 7F.

### 7. Proactive Monitoring & Webhook Alerting
- Authored `backend/src/utils/webhookAlerting.js` using Redis counters with a 5-minute sliding TTL.
- Triggers high-priority Sentry alert upon reaching $\ge 10$ webhook signature/auth failures within 5 minutes.
- Wired into:
  - M-Pesa STK push callback (`backend/src/routes/billingRoutes.js`)
  - Flutterwave card subscription webhook (`backend/src/routes/billingRoutes.js`)
  - POS M-Pesa transaction callback (`backend/src/routes/mpesaRoutes.js`)
- Wired Sentry capture handlers into `billingScheduler.js` and `backup-scheduler.js`.

### 8. Tenant Isolation Remediation (`activityController.js`)
- Resolved tenant-isolation leak in `backend/src/controllers/activityController.js` by scoping `where.shopId = req.shopId || req.user?.shopId`.
- Added `org_admin` to role authorization middleware in `backend/src/routes/activity.js`.
- Verified via `phase3UserTenantSecurity.test.js`: all 17 integration tests pass.

---

## 3. Four-Tier Regression Verification Results

### Tier 1: Backend Full Test Suite
- **Command:** `npm test -- --runInBand --forceExit`
- **Result:** **67 passed, 67 total suites** (100% pass rate)
- **Tests:** **680 passed, 680 total tests** (0 failed, 0 skipped)
- **Execution Time:** 591.961 s

### Tier 2: Frontend Test Suite
- **Command:** `npm test -- --watchAll=false --runInBand`
- **Result:** **48 passed, 48 total suites** (100% pass rate)
- **Tests:** **372 passed, 372 total tests** (0 failed, 0 skipped)
- **Execution Time:** 373.961 s

### Tier 3: Frontend Production Build
- **Command:** `npm run build`
- **Result:** **Success (0 errors)**
- **Output:** Clean Vite build, PWA Service Worker generated (precache 100 entries, 4344.86 KiB).

### Tier 4: AI Service Test Suite
- **Command:** `.venv\Scripts\python -m pytest`
- **Result:** **12 passed, 12 total tests** (100% pass rate)
- **Execution Time:** 85.14 s

### Database Migrations Check
- **Command:** `npx sequelize-cli db:migrate:status`
- **Database:** `zana_pos` on localhost:3307
- **Result:** **98 UP, 0 DOWN** (All migrations applied and verified)

---

## 4. Conclusion
Phase 7E is fully completed and verified. The platform now possesses automated offsite disaster recovery capabilities with KMS encryption, automated restore verification, fail-fast production secrets, secure dependencies, and active webhook alert telemetry.
