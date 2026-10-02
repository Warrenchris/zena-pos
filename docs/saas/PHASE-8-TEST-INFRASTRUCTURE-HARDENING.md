# Phase 8: Test Infrastructure Hardening Walkthrough

**Sub-phase:** Phase 8 — Test Infrastructure Hardening  
**Date:** 2026-10-02  
**Status:** COMPLETE / VERIFIED  
**Preceding Commits:**
- `7dcbb9c` — `feat(test-infra): enforce Redis DB 1 isolation and automated Seed Baseline DB cleanup with model coverage check`
- `a366302` — `refactor(tests): remove redundant tokenRevocationService workarounds and premature sequelize.close calls`
- `ba0e471` — `fix(tests): isolate transfer idempotency test with explicit subscription and membership`

---

## 1. Executive Summary & Root Cause Analysis

During Phase 7 SaaS hardening, three distinct classes of shared-state test failures surfaced when running the comprehensive backend suite:

1. **Redis Tombstone Leaks:** User deactivation / password revocation tests (`tokenRevocationService.revokeAllUserTokens`) wrote Redis keys with 24-hour TTLs (e.g. `user:revoked:<id>`). When subsequent suites ran tests using the same user IDs (e.g. user ID `1` or `2`), requests were rejected with `401 TOKEN_REVOKED_CUTOFF` unless suites manually patched Redis.
2. **Hardcoded Test-ID Collisions Across Suites:** Ephemeral test runs repeatedly inserted and left behind rows with low-numbered IDs (`101`, `102`, `201`, `999`, etc.) across 6+ suites (`phase2.test.js`, `phase3.test.js`, `phase4.test.js`, `purchases-and-orders.test.js`, `mpesaSecurity.test.js`, `mysql-salepayments.test.js`), causing cumulative table bloat (e.g. thousands of rows in `Sales`, `Shops`, `Organizations`, `Subscriptions`) and non-deterministic foreign key collisions.
3. **Date / Scheduler Timestamp Collisions:** Tests asserting subscription trial countdowns or renewal dates (e.g. `billingNotifications.test.js`) evaluated real-time `Date.now()` against active 14-day trials seeded during the run, colliding when running on the boundary of real-world dates.
4. **Premature `sequelize.close()` in Suites:** Individual suites (`phase3.test.js`, `phase4.test.js`) called `sequelize.close()` in local `afterAll` blocks. When running `--runInBand`, this severed Sequelize's connection pool mid-process, causing downstream suites to fail with `ConnectionManager.getConnection was called after closed`.

Phase 8 systematically eradicates these failure classes at the infrastructure layer through **Redis DB index isolation**, **Automated Seed Baseline DB reset per test file**, **Schema drift coverage enforcement**, and **connection lifecycle unification**.

---

## 2. Technical Architecture & Implementation

### 2.1 Redis DB 1 Isolation

Instead of repeatedly flushing the shared Redis DB 0 (which hosts local dev data or CI primary processes), tests are strictly isolated to Redis database index **1**:

- **Environment Configuration:** [`backend/jestSetupEnv.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/jestSetupEnv.js) injects `process.env.REDIS_DB = process.env.REDIS_DB || '1'`.
- **Client Configuration:** [`backend/src/config/redis.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/config/redis.js) parses `process.env.REDIS_DB` (defaulting to 0 for dev/production) and passes `db: Number(process.env.REDIS_DB)` to `ioredis`.
- **CI Pipeline:** [`.github/workflows/backend-ci.yml`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/.github/workflows/backend-ci.yml) sets `REDIS_DB: 1` in test step environment variables.
- **Per-Suite Teardown Hook:** [`backend/tests/setupAfterEnv.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/tests/setupAfterEnv.js) executes `flushdb()` on DB 1 in `beforeAll` and `afterAll` hooks for every test file.

Flushing is safe, instantaneous, and strictly confined to DB 1 without risking any outside state.

### 2.2 Automated Seed Baseline DB Reset & Model Partitioning

All 37 models registered in [`backend/src/models/index.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/index.js) are explicitly categorized into a two-set disjoint partition:

#### Preserved Baseline Models (8 Models)
Models whose foundational seed records must survive across test files:
1. `Plan`
2. `Permission`
3. `RolePermission`
4. `Organization` (Baseline rows: IDs `1`, `2`)
5. `Shop` (Baseline rows: IDs `1`, `2`)
6. `User` (Baseline rows: IDs `1`, `2`)
7. `Subscription` (Grandfathered plans for Orgs `1`, `2`)
8. `OrganizationMembership` (Owner memberships for Users `1`, `2` in Orgs `1`, `2`)

#### Ephemeral Purged Models (29 Models)
Models whose rows are created dynamically during test execution and purged after every test file:
1. `Category`
2. `Product`
3. `Customer`
4. `Sale`
5. `SaleItem`
6. `Expense`
7. `Store`
8. `ActivityLog`
9. `Employee`
10. `SystemSettings`
11. `Invoice`
12. `InvoiceItem`
13. `PendingPayment`
14. `SaleRefund`
15. `HeldCart`
16. `SalePayment`
17. `Coupon`
18. `DiscountRule`
19. `Purchase`
20. `PurchaseOrder`
21. `Supplier`
22. `StockMovement`
23. `PurchaseItem`
24. `PurchaseOrderItem`
25. `ShopAccess`
26. `Inventory`
27. `SubscriptionInvoice`
28. `StockTransfer`
29. `BillingNotificationLog`

> [!NOTE]
> **Dynamic Table Name Resolution Note:**
> Table names in the ephemeral cleanup list are derived dynamically via `sequelize.models[name].getTableName()` in `setupAfterEnv.js` (`ephemeralTableNames`). If the baseline-scoped cleanup list is edited again in the future, table names should always be derived via `sequelize.models[name].getTableName()` to avoid drift if a model's `tableName` option ever changes.

### 2.3 Dangling-FK Resolution & Baseline Re-Seeding

To prevent foreign-key reference corruption:
- Purging of `Users` preserves baseline Users `1` and `2` (`DELETE FROM Users WHERE id NOT IN (1, 2)`).
- Purging of `OrganizationMemberships` preserves baseline memberships for Users `1` and `2` (`DELETE FROM OrganizationMemberships WHERE id NOT IN ('1', '2') OR userId NOT IN (1, 2)`).
- Purging of `Subscriptions` preserves baseline grandfathered records (`00000000-0000-0000-0000-000000000001` and `...0002`).
- Immediately following table deletion, `resetDatabaseToBaselineSnapshot()` executes atomic `INSERT ... ON DUPLICATE KEY UPDATE` statements to guarantee that baseline Orgs 1/2, Shops 1/2, Users 1/2, Memberships 1/2, and grandfathered Subscriptions 1/2 are healthy, complete, and free of dangling pointers.

### 2.4 Schema Drift Coverage Enforcement

To prevent the model partition from silently drifting as new entities are added to the codebase:
- [`backend/tests/setupAfterEnv.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/tests/setupAfterEnv.js) runs an assertion on startup that compares `Object.keys(models)` against the union of `PRESERVED_BASELINE_MODELS` and `DELETED_EPHEMERAL_MODELS`. If any registered model is missing from both sets, it throws a fatal error immediately.
- [`backend/tests/testInfraCoverage.test.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/tests/testInfraCoverage.test.js) validates:
  1. All 37+ registered models are partitioned (zero unhandled models).
  2. Preserved and ephemeral sets are strictly disjoint.
  3. Redis client is connected to DB index `1`.
  4. Baseline snapshot executes with zero dangling foreign keys and leaves ephemeral tables completely empty.

### 2.5 Lifecycle Teardown Unification

All premature `sequelize.close()` invocations in test suites (`phase3.test.js`, `phase4.test.js`) were removed. Database and Redis connections remain open throughout in-band execution and are cleanly terminated once in global [`backend/tests/teardown.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/tests/teardown.js).

---

## 3. Verification Gate Evidence

### 3.1 Dual Back-to-Back Backend Regression

The complete backend regression suite was executed twice consecutively without any cache or manual intervention:

#### Backend Run 1:
```text
Test Suites: 69 passed, 69 total
Tests:       696 passed, 696 total
Snapshots:   0 total
Time:        340.76 s
Ran all test suites.
[Test Teardown] Database connection closed.
[Test Teardown] Redis connection closed.
```

#### Backend Run 2:
```text
Test Suites: 69 passed, 69 total
Tests:       696 passed, 696 total
Snapshots:   0 total
Time:        341.879 s
Ran all test suites.
[Test Teardown] Database connection closed.
[Test Teardown] Redis connection closed.
```

**Flaky failures across both runs:** **0 (Zero)**

---

### 3.2 Tier 2 — Frontend Unit & Integration Tests

```text
Test Suites: 48 passed, 48 total
Tests:       372 passed, 372 total
Snapshots:   0 total
Time:        61.264 s, estimated 118 s
Ran all test suites.
```

---

### 3.3 Tier 3 — Frontend Production Build

```text
✓ built in 56.89s
PWA v1.3.0
mode      generateSW
precache  100 entries (4344.86 KiB)
files generated
  dist/sw.js.map
  dist/sw.js
  dist/workbox-5d06b500.js.map
  dist/workbox-5d06b500.js
```

---

### 3.4 Tier 4 — AI Microservice Regression

```bash
docker exec -i zana-ai-service pytest tests/
```
```text
============================= test session starts ==============================
platform linux -- Python 3.9.25, pytest-8.4.2, pluggy-1.6.0
rootdir: /app
configfile: pyproject.toml
plugins: anyio-4.12.1
collected 12 items

tests/test_forecasting_rf.py ............                                [100%]
======================= 12 passed, 14 warnings in 18.79s =======================
```

---

### 3.5 Database Migration Status

```bash
npx sequelize-cli db:migrate:status
```
```text
Loaded configuration file "src\config\sequelize.js".
Using environment "development".
up 20250101000000-create-initial-schema.js
...
up 20261001120000-add-deleted-at-and-purge-to-organizations.js
```
**Status:** **98 UP, 0 DOWN, 0 Pending.**

---

## 4. Phase 8 Final Determination

```text
================================================================================
           ZANA POS — PHASE 8 TEST INFRASTRUCTURE SCORECARD
================================================================================
Redis Database Isolation:             PASS (Dedicated DB 1 per worker/suite)
Seed Baseline Snapshot Reset:         PASS (Automated teardown per test file)
Schema Drift Assertion:               PASS (37/37 models partitioned & covered)
Dangling Foreign Key Resolution:      PASS (Baseline Users/Shops/Orgs/Subs aligned)
Connection Lifecycle:                 PASS (Centralized in global teardown)
Backend Regression Run 1:             PASS (69/69 suites, 696/696 tests)
Backend Regression Run 2:             PASS (69/69 suites, 696/696 tests)
Frontend Tests:                       PASS (48/48 suites, 372/372 tests)
Frontend Production Build:            PASS (Clean Vite bundle, PWA precache verified)
AI Service Regression:                PASS (12/12 pytest tests passed)
Database Migrations:                  PASS (98 UP, 0 DOWN, 0 pending)
================================================================================

PHASE 8 TEST INFRASTRUCTURE HARDENING: PASS
STATUS: COMPLETE & PRODUCTION READY
================================================================================
```
