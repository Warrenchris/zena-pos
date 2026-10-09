# Backend Test Baseline & Failing-Test Classification Audit

**Date:** 2026-10-08  
**Repository:** Warrenchris/zena-pos  
**Target Branch:** master at HEAD (`6ddb834`)  
**Baseline Commit:** `1f45448` (Pre-Gate Authorization Baseline)  
**Status:** PHASE 2 COMPLETE — Implemented & Verified on review branch `fix/test-baseline-phase2` (commit `69910c6`)

---

## 1. Executive Summary & Suite Metrics

A comprehensive, deterministic backend test suite execution was performed across both the current branch HEAD (`6ddb834`) and the pre-authorization baseline commit (`1f45448`) under strictly isolated environments.

### 1.1 Test Suite Metrics Comparison

| Metric | HEAD (`6ddb834`) | Baseline (`1f45448`) | Delta / Notes |
| :--- | :--- | :--- | :--- |
| **Total Test Suites** | 84 | 69 | +15 new test suites at HEAD |
| **Passed Test Suites** | 74 | 67 | +7 passing suites |
| **Failed Test Suites** | **10** | **2** | +8 failing suites at HEAD |
| **Total Tests** | 1,162 | 696 | +466 individual tests |
| **Passed Tests** | 1,148 | 694 | +454 passing tests |
| **Failed Tests** | **14** | **2** | +12 failing test assertions |
| **Skipped Tests** | **0** (`.skip`, `xit`: 0) | **0** (`.skip`, `xit`: 0) | 100% test execution rate |
| **Execution Wall Time** | 784.958s (~13.1 min) | 971.678s (~16.2 min) | Full suite `--runInBand` |

### 1.2 Baseline (`1f45448`) Failures
Baseline exhibited exactly 2 failed tests:
1. `tests/controllers/insightsController.test.js`: Expected 200, got 500 (pre-existing external AI service mock dependency).
2. `tests/testInfraCoverage.test.js`: Expected Redis DB 1, received DB 2 (test artifact caused by intentional Redis database index isolation for the baseline run).

All 8 failing test suites at HEAD that already existed at baseline **passed cleanly at baseline**.

---

## 2. Reproducible Environment & Execution Methodology

### 2.1 Runtime & Environment Specs
- **Operating System:** Windows 11 Pro (10.0.26100)
- **Node.js Version:** `v24.11.1`
- **Jest Version:** `30.1.2`
- **Sequelize CLI:** `6.6.5` / Sequelize ORM: `6.37.7`
- **Database Engine:** MySQL 8.0.40 running on Docker container `test-mysql` (Port `3307`)
- **Cache Engine:** Redis 7-alpine running on Docker container `test-redis` (Port `6379`)

### 2.2 Strict Database & Cache Isolation
To guarantee absolute safety of production and developer data:
- **Developer Database (`zana_pos`):** Completely untouched. Contains 1 user record, verified intact.
- **HEAD Test Run Database:** `zana_test_head` (100 migrations applied).
- **Baseline Test Run Database:** `zana_test_baseline` (99 migrations applied).
- **Redis Flushing:**
  - `zana_pos` (Dev): Redis DB `0` (untouched).
  - HEAD Run: Redis DB `1` flushed via `redis-cli -n 1 flushdb`.
  - Baseline Run: Redis DB `2` flushed via `redis-cli -n 2 flushdb`.

### 2.3 Exact Commands Used
- **HEAD Full Run:**
  ```bash
  cd backend && npx jest --runInBand --forceExit --json --outputFile="<scratch>/head.json"
  ```
- **Baseline Worktree Setup & Run:**
  ```bash
  git worktree add ../zana-baseline 1f45448
  # Dependencies symlinked via junction
  cd ../zana-baseline/backend && npx sequelize-cli db:migrate --env test
  npx jest --runInBand --forceExit --json --outputFile="<scratch>/baseline.json"
  ```

---

## 3. Master Classification Summary Table

Every test that fails at HEAD has been classified into exactly one bucket:
- **A. Pre-Existing:** Also fails at baseline `1f45448` for the same reason.
- **B. Test Drift:** Passes at baseline, fails at HEAD because behavior changed intentionally by an approved Gate.
- **C. Regression:** Passes at baseline, fails at HEAD, and behavior is undocumented, unintended, or contradicts design invariants.
- **D. Flaky / Order-Dependent:** Passes when run alone or fails due to cross-test DB/state contamination.
- **E. Broken Test:** Faulty fixture, missing test environment fallback, or accidental stray test file.

| # | Test File | Test Name | Assertion / Error | Bucket | Introduced By (Commit & Gate) | Proposed Action |
| :- | :--- | :--- | :--- | :---: | :--- | :--- |
| 1 | `tests/employeeLoginRole.test.js` | `cashier employee login can GET /api/employees and cannot POST` | Expected: `200`<br>Received: `403` | **B (Test Drift)** | `bfa4d7e`<br>(Gate 3D) | **Update Test:** Change expected status on `GET /api/employees` to `403` citing Gate 3D (`manage_employees`). |
| 2 | `tests/phase6aReleaseBlockers.test.js` | `Employee creates expense with UUID employeeId without column truncation` | Expected: `201`<br>Received: `403` | **B (Test Drift)** | `8de4016`<br>(Gate 3E) | **Update Test Fixture:** Assign manager role (or grant `manage_expenses`) to test employee fixture for UUID verification. |
| 3 | `tests/phase2.test.js` | `TEST 2.14c — RBAC blocks non-admin user from viewing another employee profile` | Expected: `403`<br>Received: `404` | **B (Test Drift)** | `bfa4d7e`<br>(Gate 3D) | **Update Test:** Change expected status from `403` to `404` citing Gate 3D anti-oracle enumeration policy. |
| 4 | `tests/phase3UserTenantSecurity.test.js` | `Manipulating organization context via headers or body does not allow cross-tenant creation` | Expected: `"SHOP_ACCESS_DENIED"`<br>Received: `"TENANT_MISMATCH"` | **B (Test Drift)** | `fae41af`<br>(Gate 2B) | **Update Test:** Change expected error code to canonical `"TENANT_MISMATCH"`. |
| 5 | `tests/phase3UserTenantSecurity.test.js` | `GET /api/activity tenant isolation org_admin in Organization A receives zero cross-tenant rows and 403` | Expected regex mismatch (`/Shop does not belong.../`)<br>Received: `"Access denied: You do not have access to this branch."` | **B (Test Drift)** | `6e2841f`<br>(Gate 3H) | **Update Test:** Align regex pattern to match canonical central authorization message. |
| 6 | `tests/orgAdminAccessControl.test.js` | `actual organization owner can edit any user in their shop including themselves` | Expected: `200`<br>Received: `403` | **C (Regression)** | `bfa4d7e`<br>(Gate 3D) | **Fix Code:** In `src/controllers/userController.js`, permit no-op self-updates while continuing to reject changes to `role`, `active`, or `orgRole` (403) for all callers. |
| 7 | `tests/orgTenantPermissionMatrix.test.js` | `Verification 2: As org owner: toggle manage_settings off for manager -> 200, manager gets 403 on /api/settings` | `matrix.manager.manage_settings`<br>Expected: `false`<br>Received: `true` | **C (Regression)** | `725ee43`<br>(Gate 3F) | **Fix Code + Migration:** 1. Add idempotent migration `20261008120000-backfill-gate3-default-role-permissions.js` backfilling Gate 3 defaults for all existing orgs.<br>2. Update `rolePermissionSeeder.js` to seed per-org permissions only when `existingCount === 0`. |
| 8 | `tests/orgTenantPermissionMatrix.test.js` | `Test 8: Owner disables view_own_sales for cashier via PUT /matrix -> cashier gets 403 on /my-sales` | `matrix.cashier.view_own_sales`<br>Expected: `false`<br>Received: `true` | **C (Regression)** | `725ee43`<br>(Gate 3F) | **Fix Code + Migration:** Resolved by the same `rolePermissionSeeder.js` and migration fix. |
| 9 | `tests/orgTenantPermissionMatrix.test.js` | `Test 9: After migration backfill on an org with rows but missing view_own_sales, cashier gets 200 on /my-sales` | Pre-backfill status<br>Expected: `403`<br>Received: `200` | **C (Regression)** | `725ee43`<br>(Gate 3F) | **Fix Code + Migration:** Resolved by the same `rolePermissionSeeder.js` and migration fix. |
| 10 | `tests/billingEndpoints.test.js` | `GET /api/billing/plans returns exactly the 3 active public tiers (Starter, Growth, Pro)` | Expected: `3`<br>Received: `14` (suite) / `9` (solo) | **D (Order-Dependent / Isolation Failure)** | `27301fa`<br>(Setup baseline reset) | **Fix Test Isolation:** In `tests/setupAfterEnv.js`, add `DELETE FROM Plans WHERE code NOT IN ('starter', 'growth', 'pro', 'grandfathered')` and a hard safety check requiring "test" in database name. |
| 11 | `tests/gate3iBillingPaymentsAuthorization.test.js` | `5.1: GET /api/billing/plans is public and returns exactly 3 active public tiers` | Expected: `3`<br>Received: `14` (suite) / `9` (solo) | **D (Order-Dependent / Isolation Failure)** | `27301fa`<br>(Setup baseline reset) | **Fix Test Isolation:** Resolved by `setupAfterEnv.js` baseline snapshot cleanup. |
| 12 | `tests/settingsAllowlist.test.js` | `does NOT overwrite stored encrypted M-Pesa secrets when masked placeholder is sent` | `ENCRYPTION_SECRET environment variable is missing.` | **A (Pre-Existing)** | Pre-existing (`1f45448` and prior) | **Fix Test Fixture:** Provide default test fallback in `tests/setupAfterEnv.js` strictly when `NODE_ENV === 'test'`. Never in application code or `.env.example`. |
| 13 | `tests/settingsAllowlist.test.js` | `redacts consumerKey in ActivityLog metadata but still records it in updatedFields` | Expected: `200`<br>Received: `500` (Cascade) | **A (Pre-Existing)** | Pre-existing (`1f45448` and prior) | **Fix Test Fixture:** Resolved by the same test-only `ENCRYPTION_SECRET` fixture fallback. |
| 14 | `tests/resetPasswordAccountTypeIsolation.test.js` | `a user reset token cannot fall back to an employee account` | Expected: `400`<br>Received: `200` | **C (Regression / Isolation Bug)** | `afb2a57`<br>(Accidental hotfix commit) | **Fix Code (Actual Outcome):** User -> Employee fallback in `authController.resetPassword` was REMOVED and test was KEPT (it now passes). `forgotPassword` always issues `isEmployee: true` for employees, so fallback had no legitimate use. |

---

## 4. Deep-Dive Failure Evidence & Root Cause Analysis

### 4.1 `tests/employeeLoginRole.test.js`
- **Test:** `Employee login JWT role vs checkRole cashier employee login can GET /api/employees and cannot POST (admin-only)`
- **Assertion:** `expect(listRes.status).toBe(200); Received: 403`
- **Bucket:** **B (Test Drift)**
- **Evidence:**
  - Full Suite at HEAD: Failed (`403` vs `200`).
  - Baseline `1f45448`: **Passed**.
  - Solo Re-run 1: Failed (`403` vs `200`).
  - Solo Re-run 2: Failed (`403` vs `200`).
- **Introducing Commit:** `bfa4d7e` (*feat(security): migrate employee and staff authorization to central policy*, Gate 3D).
- **Root Cause:** Prior to Gate 3D, `GET /api/employees` used legacy middleware `checkRole(['admin', 'manager', 'org_admin', 'cashier'])`, allowing cashiers to view the complete staff roster and salaries. Gate 3D migrated the route to `authorize({ permissions: { any: ['manage_employees'] } })`. Standard permission seeding grants `manage_employees` to admins and managers, but explicitly denies it to cashiers.
- **Proposed Action:** Update assertion at `tests/employeeLoginRole.test.js:93` to `expect(listRes.status).toBe(403);` with a comment citing Gate 3D.

### 4.2 `tests/phase6aReleaseBlockers.test.js`
- **Test:** `Phase 6A: Release Blocker Remediation Verification Suite DATA-01: Invoices and Expenses Dual Identity Attribution Employee creates expense with UUID employeeId without column truncation`
- **Assertion:** `expect(res.status).toBe(201); Received: 403`
- **Bucket:** **B (Test Drift)**
- **Evidence:**
  - Full Suite at HEAD: Failed (`403` vs `201`).
  - Baseline `1f45448`: **Passed**.
  - Solo Re-run 1: Failed (`403` vs `201`).
  - Solo Re-run 2: Failed (`403` vs `201`).
- **Introducing Commit:** `8de4016` (*feat(security): migrate expenses and financial authorization to central policy*, Gate 3E).
- **Root Cause:** The test verifies that creating an expense with an employee identity correctly populates the UUID `employeeId` column without truncation. The test fixture created `employeeA` with `role: 'cashier'`. Gate 3E secured `POST /api/expenses` with `authorize({ permissions: { any: ['manage_expenses'] } })`. In accordance with product design, cashiers do not have `manage_expenses`, so the cashier token receives 403.
- **Proposed Action:** Update the test fixture in `tests/phase6aReleaseBlockers.test.js` so `employeeA` has `role: 'manager'` (which holds `manage_expenses`), preserving the exact UUID schema and database attribution assertions.

### 4.3 `tests/phase2.test.js`
- **Test:** `Phase 2 Remediation Tests TEST 2.14c — RBAC blocks non-admin user from viewing another employee profile`
- **Assertion:** `expected 403 "Forbidden", got 404 "Not Found"`
- **Bucket:** **B (Test Drift)**
- **Evidence:**
  - Full Suite at HEAD: Failed (`404` vs `403`).
  - Baseline `1f45448`: **Passed**.
  - Solo Re-run 1: Failed (`404` vs `403`).
  - Solo Re-run 2: Failed (`404` vs `403`).
- **Introducing Commit:** `bfa4d7e` (*feat(security): migrate employee and staff authorization to central policy*, Gate 3D).
- **Root Cause:** Gate 3D implemented anti-oracle masking on `GET /api/employees/:id` via `antiOracle: true`. When an unauthorized non-admin attempts to view another employee's profile, the policy returns 404 instead of 403 to prevent employee ID enumeration and timing attacks.
- **Proposed Action:** Update assertion at `tests/phase2.test.js:852` to expect `404` with comment citing Gate 3D anti-oracle policy.

### 4.4 `tests/phase3UserTenantSecurity.test.js`
- **Test 1:** `Manipulating organization context via headers or body does not allow cross-tenant creation`
  - **Assertion:** `Expected: "SHOP_ACCESS_DENIED", Received: "TENANT_MISMATCH"`
  - **Bucket:** **B (Test Drift)**
  - **Introducing Commit:** `fae41af` (*feat(security): add central authorization primitive*, Gate 2B).
  - **Root Cause:** The central authorization middleware validates canonical organization context prior to shop membership. Cross-tenant tampering triggers `TENANT_MISMATCH` (HTTP 403) before the route layer evaluates shop access.
  - **Proposed Action:** Update assertion to expect `"TENANT_MISMATCH"`.
- **Test 2:** `GET /api/activity tenant isolation org_admin in Organization A receives zero cross-tenant rows and 403 when querying Organization B activity`
  - **Assertion:** `Expected pattern: /Shop does not belong to your organization|Cross-tenant/i, Received: "Access denied: You do not have access to this branch."`
  - **Bucket:** **B (Test Drift)**
  - **Introducing Commit:** `6e2841f` (*feat(security): migrate customers and activity authorization to central policy*, Gate 3H).
  - **Root Cause:** Gate 3H migrated activity routes to `authorize({ shopScope: 'current' })`. Central authorization unifies branch rejection messages to `"Access denied: You do not have access to this branch."`
  - **Proposed Action:** Update assertion regex to include the canonical error string.

### 4.5 `tests/orgAdminAccessControl.test.js`
- **Test:** `Org Admin Access Control & Security Invariants Invariant 5: Shop-level admin (User.role="admin") cannot create admin accounts or modify owner account actual organization owner can edit any user in their shop including themselves`
- **Assertion:** `expect(received).toBe(expected) Expected: 200, Received: 403`
- **Bucket:** **C (Regression)**
- **Evidence:**
  - Full Suite at HEAD: Failed (`403` vs `200`).
  - Baseline `1f45448`: **Passed**.
  - Solo Re-run 1: Failed (`403` vs `200`).
  - Solo Re-run 2: Failed (`403` vs `200`).
- **Introducing Commit:** `bfa4d7e` (*feat(security): migrate employee and staff authorization to central policy*, Gate 3D).
- **Root Cause:** In `src/controllers/userController.js` (lines 174-182), a self-modification guard was added to block staff from escalating their privileges:
  ```javascript
  const callerId = req.authz?.identity?.id || req.user?.id;
  const callerIsEmployee = Boolean(req.authz?.identity?.isEmployee !== undefined ? req.authz.identity.isEmployee : req.user?.isEmployee);
  if (String(callerId) === String(id) && callerIsEmployee === isUuid) {
    if (role || active !== undefined || orgRole) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: users cannot modify their own privileges or status.' });
    }
  }
  ```
  `userController.js` defines `isOwnerCaller` on line 171, but the self-modification guard omitted `!isOwnerCaller`. As a result, the organization owner is blocked from modifying their own account via `PUT /api/users/:id/role`.
- **Proposed Action:** Add `!isOwnerCaller` condition:
  ```javascript
  if (!isOwnerCaller && String(callerId) === String(id) && callerIsEmployee === isUuid)
  ```

### 4.6 `tests/orgTenantPermissionMatrix.test.js`
- **Tests Failing:**
  1. *Verification 2:* `As org owner: toggle manage_settings off for manager -> 200, manager gets 403 on /api/settings` (`matrix.manager.manage_settings`: Expected `false`, got `true`).
  2. *Test 8:* `Owner disables view_own_sales for cashier via PUT /matrix -> cashier gets 403 on /my-sales` (`matrix.cashier.view_own_sales`: Expected `false`, got `true`).
  3. *Test 9:* `After migration backfill on an org with rows but missing view_own_sales, cashier gets 200 on /my-sales` (Pre-backfill: Expected `403`, got `200`).
- **Bucket:** **C (Regression)**
- **Evidence:**
  - Full Suite at HEAD: 3 failed tests.
  - Baseline `1f45448`: **Passed**.
  - Solo Re-run 1: 3 failed tests.
  - Solo Re-run 2: 3 failed tests.
- **Introducing Commit:** `725ee43` (*feat(security): migrate coupons discounts and held carts authorization*, Gate 3F).
- **Root Cause:** Gate 3F altered `ensureOrgRolePermissionsSeeded` in `src/services/rolePermissionSeeder.js`. Previously, seeding only occurred if `RolePermission.count({ where: { organizationId } }) === 0`. Gate 3F replaced this with logic that computes `missingRolePerms = allDesired.filter(dp => !existingPairs.has(...))` and re-creates them via `bulkCreate`. Because `getPermissionMatrix` calls `ensureOrgRolePermissionsSeeded` on every request, whenever an org owner deletes a permission via `PUT /api/permissions/matrix`, `getPermissionMatrix` immediately re-creates the deleted row upon returning the matrix. This makes it impossible for an organization owner to revoke any default permission.
- **Proposed Action:** Restore the check in `src/services/rolePermissionSeeder.js` so default permissions are only seeded once when an organization has 0 role permissions.

### 4.7 `tests/billingEndpoints.test.js` & `tests/gate3iBillingPaymentsAuthorization.test.js`
- **Test:** `GET /api/billing/plans returns exactly the 3 active public tiers (Starter, Growth, Pro) and excludes grandfathered`
- **Assertion:** `expect(received).toBe(expected) Expected: 3, Received: 14` (in full suite) / `Received: 9` (alone after tests ran).
- **Bucket:** **D (Order-Dependent / Test Isolation Failure)**
- **Evidence:**
  - Full Suite at HEAD: Failed (`14` vs `3`).
  - Baseline `1f45448`: **Passed**.
  - Solo Re-run against clean seed: **Passes** (`3` vs `3`).
  - Solo Re-run after suite execution: Failed (`9` or `14` vs `3`).
- **Introducing Commit:** `27301fa` (*test: add suite-level teardown and baseline reset snapshot*).
- **Root Cause:** In `backend/tests/setupAfterEnv.js`, `Plan` is included in `PRESERVED_BASELINE_MODELS`. The function `resetDatabaseToBaselineSnapshot()` prunes `Subscriptions`, `OrganizationMemberships`, `Users`, `Shops`, and `Organizations`, but completely omits `Plans`. Several test suites (`authRegister`, `emailVerification`, `gate3c`, `authzContextSmoke`) insert ephemeral test plans. These accumulated plans remain in the `Plans` table, causing subsequent tests expecting 3 active commercial tiers to fail.
- **Proposed Action:** In `backend/tests/setupAfterEnv.js`, add plan pruning to `resetDatabaseToBaselineSnapshot()`:
  ```javascript
  await sequelize.query("DELETE FROM `Plans` WHERE `code` NOT IN ('starter', 'growth', 'pro', 'grandfathered');");
  ```

### 4.8 `tests/settingsAllowlist.test.js`
- **Tests Failing:**
  1. `does NOT overwrite stored encrypted M-Pesa secrets when masked placeholder is sent`
  2. `redacts consumerKey in ActivityLog metadata but still records it in updatedFields`
- **Assertion:** `Error: ENCRYPTION_SECRET environment variable is missing.`
- **Bucket:** **E (Broken Test / Environment Gap)**
- **Evidence:**
  - Full Suite at HEAD: Failed.
  - Baseline `1f45448`: **Passed** (when run under CI env).
  - Solo Re-run without env var: Failed.
  - Solo Re-run with `ENCRYPTION_SECRET` set: **Passed (7/7 tests passed)**.
- **Introducing Commit:** Pre-existing configuration gap.
- **Root Cause:** GitHub Actions CI (`.github/workflows/backend-ci.yml:73`) explicitly exports `ENCRYPTION_SECRET: "e7b4198c61fa2d75a02482310bf8b975e5330e2fbd08544c4897f1f415ef414a"`. However, local `backend/.env` and `tests/setupAfterEnv.js` lack this fallback.
- **Proposed Action:** Add a default fallback in `tests/setupAfterEnv.js`:
  ```javascript
  process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'e7b4198c61fa2d75a02482310bf8b975e5330e2fbd08544c4897f1f415ef414a';
  ```

### 4.9 `tests/resetPasswordAccountTypeIsolation.test.js`
- **Test:** `a user reset token cannot fall back to an employee account`
- **Assertion:** `expected 400 "Bad Request", got 200 "OK"`
- **Bucket:** **E (Broken / Stray Test)**
- **Evidence:**
  - Full Suite at HEAD: Failed (`200` vs `400`).
  - Baseline `1f45448`: Did not exist in baseline.
  - Solo Re-run 1: Failed (`200` vs `400`).
  - Solo Re-run 2: Failed (`200` vs `400`).
- **Introducing Commit:** `afb2a57` (*fix: resolve effectiveRole hotfix, held cart scoping, pnl balance*).
- **Root Cause:** Committed accidentally during the hotfix commit. `src/controllers/authController.js` (lines 436-439) explicitly implements an intentional fallback where a token issued without `isEmployee: true` falls back to `Employee.findByPk(decoded.id)`. The stray test asserted that this fallback must be rejected with 400, directly contradicting the existing implementation.
- **Proposed Action (Actual Outcome):** The User -> Employee fallback in `authController.resetPassword` was REMOVED and the test was KEPT (it now passes). `forgotPassword` always issues `isEmployee: true` for employee accounts, so the fallback had no legitimate use.

---

## 5. Explicit Findings on Special Attention Questions

### 5.1 `employeeLoginRole`: Can a cashier employee still log in and operate normal POS? Is 403 a real regression?
**Conclusion: No regression to live POS terminals. Cashier workflow is 100% operational.**
- **Real Middleware Chain Verification:**
  - `POST /api/auth/login`: `200 OK` (token contains `isEmployee: true`, `role: "cashier"`).
  - `GET /api/employees/me` / `/api/auth/me`: `200 OK` (reads own profile).
  - `GET /api/products`: `200 OK` (cashier has `view_products`).
  - `GET /api/sales/my-sales`: `200 OK` (cashier has `view_own_sales`).
  - `POST /api/sales`: Passes authorization (cashier has `create_sales`).
  - `GET /api/employees`: `403 Forbidden` (cashier lacks `manage_employees`).
- **Analysis:** Cashiers are not allowed to enumerate other employees' salaries and PII. The 403 on staff roster listing is the intended Gate 3D behavior. The test title and assertion were asserting legacy, overly broad permissions.

### 5.2 `orgAdminAccessControl`: Can an organization owner edit their own profile/user record? Is 403 intended?
**Conclusion: 403 is an unintended regression (Bucket C).**
- **Analysis:** `src/controllers/userController.js` lines 174-182 introduced a self-modification block intended to prevent non-owner staff from self-escalating privileges. The implementation defined `isOwnerCaller` but forgot to exempt it from the check:
  `if (String(callerId) === String(id) && callerIsEmployee === isUuid)`
  An organization owner is the tenant root administrator and must be permitted to manage all users including their own profile.

### 5.3 `phase6aReleaseBlockers`: Is "employee cannot create expenses" intended after Gate 3E?
**Conclusion: Yes, intended product rule (Bucket B Drift).**
- **Analysis:** Under Gate 3E and standard role-permission seeding (`rolePermissionSeeder.js`), `manage_expenses` is granted exclusively to `admin`, `org_admin`, and `manager`. Cashiers do not have financial expense privileges. The test `DATA-01` was designed to verify UUID attribution on the `expenses` table, but inadvertently used a cashier token. Updating the fixture to a manager preserves the integrity of the test and respects the authorization matrix.

### 5.4 `phase2`: Is 404-instead-of-403 the intended anti-enumeration policy?
**Conclusion: Yes, intended anti-oracle security policy (Bucket B Drift).**
- **Analysis:** Gate 3D explicitly configured `antiOracle: true` on `GET /api/employees/:id` in `backend/src/routes/employees.js:68`. When an unauthorized caller attempts to view an unowned profile, returning 404 prevents employee ID enumeration.

### 5.5 `billingEndpoints`: Why 14 plans vs 3? Stale test or DB pollution?
**Conclusion: Database pollution caused by test isolation omission (Bucket D).**
- **Analysis:** In a clean baseline, the database contains 4 seeded plans (Starter, Growth, Pro, Grandfathered), of which 3 are active public commercial plans (`GET /api/billing/plans` filters `isActive = 1`). Other test suites (`authRegister`, `gate3c`, `authzContextSmoke`) insert test plans with `isActive: 1`. Because `setupAfterEnv.js` preserves `Plans` without pruning between suites, the table accumulated 14 plans during full-suite runs.

### 5.6 `phase3UserTenantSecurity`: What exact code/status differs and which is correct?
**Conclusion: Both failures reflect intentional security architecture improvements (Bucket B Drift).**
- **Status Difference 1:** Cross-tenant payload manipulation now returns `"TENANT_MISMATCH"` (HTTP 403) from central authorization before reaching shop validation (`"SHOP_ACCESS_DENIED"`). `"TENANT_MISMATCH"` is correct per Gate 2B.
- **Status Difference 2:** Activity query cross-branch rejection now returns `"Access denied: You do not have access to this branch."` from central authorization instead of legacy shop-controller error text. Canonical central text is correct per Gate 3H.

### 5.7 The 8th and Remaining Failing Test Files Identified
The audit identified all 10 failing test suites at HEAD:
1. `tests/billingEndpoints.test.js`
2. `tests/gate3iBillingPaymentsAuthorization.test.js`
3. `tests/employeeLoginRole.test.js`
4. `tests/phase6aReleaseBlockers.test.js`
5. `tests/phase2.test.js`
6. `tests/phase3UserTenantSecurity.test.js`
7. `tests/orgAdminAccessControl.test.js`
8. `tests/orgTenantPermissionMatrix.test.js` *(previously unidentified regression in Gate 3F reseeding)*
9. `tests/settingsAllowlist.test.js`
10. `tests/resetPasswordAccountTypeIsolation.test.js`

---

## 6. Proposed Action Plan for Phase 2

Upon user review and explicit approval, the following minimal, surgical remediation actions are proposed:

### 6.1 Regressions (Bucket C)
1. **`src/controllers/userController.js` (Owner Self-Edit):**
   - Exempt `isOwnerCaller` from self-modification block:
     ```javascript
     if (!isOwnerCaller && String(callerId) === String(id) && callerIsEmployee === isUuid)
     ```
   - Regression test in `tests/orgAdminAccessControl.test.js` will verify owner self-edit passes while non-owner self-escalation remains blocked with 403.
2. **`src/services/rolePermissionSeeder.js` (Permission Matrix Reseeding):**
   - Only seed default permissions when an organization has 0 existing role permissions (`existingCount === 0`).
   - Regression test in `tests/orgTenantPermissionMatrix.test.js` will verify owner can toggle off `manage_settings` and `view_own_sales` without automatic resurrection.

### 6.2 Test Drift (Bucket B)
1. **`tests/employeeLoginRole.test.js`:** Update assertion on `GET /api/employees` to expect 403, with comment citing Gate 3D (`manage_employees`).
2. **`tests/phase6aReleaseBlockers.test.js`:** Change test employee role from `cashier` to `manager` for the UUID expense attribution test, citing Gate 3E (`manage_expenses`).
3. **`tests/phase2.test.js`:** Update assertion on `GET /api/employees/:id` from 403 to 404, citing Gate 3D anti-oracle policy.
4. **`tests/phase3UserTenantSecurity.test.js`:** Update error code expectation to `"TENANT_MISMATCH"` and branch rejection regex to match canonical central authorization text.

### 6.3 Test Isolation & Environment (Buckets D & E)
1. **`tests/setupAfterEnv.js` (Plan Cleanup):** In `resetDatabaseToBaselineSnapshot()`, prune test-created plans:
   ```javascript
   await sequelize.query("DELETE FROM `Plans` WHERE `code` NOT IN ('starter', 'growth', 'pro', 'grandfathered');");
   ```
2. **`tests/setupAfterEnv.js` (Encryption Secret Fallback):**
   ```javascript
   process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'e7b4198c61fa2d75a02482310bf8b975e5330e2fbd08544c4897f1f415ef414a';
   ```
3. **`tests/resetPasswordAccountTypeIsolation.test.js` (Account Type Isolation):**
   - Actual Outcome: The User -> Employee fallback in `authController.resetPassword` was REMOVED and the test was KEPT (it now passes). `forgotPassword` always issues `isEmployee: true` for employee accounts, so the fallback had no legitimate use.

---

## Phase 2 outcomes

### 1. Per-Bucket Results
- **Bucket B (Test Drift):** Expectations updated to reflect authorized gate behavior with explanatory comments:
  - `backend/tests/employeeLoginRole.test.js`: Expects 403 on `GET /api/employees` for cashier employee lacking `manage_employees` (Gate 3D `bfa4d7e`).
  - `backend/tests/phase6aReleaseBlockers.test.js`: Updated test fixture from cashier to manager for UUID expense attribution requiring `manage_expenses` (Gate 3E `8de4016`).
  - `backend/tests/phase2.test.js`: Expects 404 on `GET /api/employees/:id` per anti-enumeration policy (Gate 3D `bfa4d7e`).
  - `backend/tests/phase3UserTenantSecurity.test.js`: Aligned error code to `"TENANT_MISMATCH"` (Gate 2B `fae41af`) and branch rejection regex (Gate 3H `6e2841f`).
- **Bucket C (Regressions):**
  - **Owner Self-Edit Guard:** In `backend/src/controllers/userController.js`, no-op self-edits are allowed (200), but self-modifications altering own `role`, `active`, or `orgRole` return 403 for all callers (including owners).
  - **Permission-Revocation Seeder Bug:** Revoked permissions were being re-created on every permission-cache miss. In `backend/src/services/rolePermissionSeeder.js`, runtime seeding now only runs when an org has zero `RolePermission` rows (`existingCount === 0`).
- **Bucket D (Isolation):**
  - In `backend/tests/setupAfterEnv.js`, `resetDatabaseToBaselineSnapshot()` prunes test plans via `DELETE FROM Plans WHERE code NOT IN ('starter', 'growth', 'pro', 'grandfathered')`.
  - Added hard guard: `setupAfterEnv.js` immediately throws if the active database name does not contain `'test'`.
- **Bucket E / A (Environment & Account Isolation):**
  - `ENCRYPTION_SECRET` test-only fallback added to `backend/tests/setupAfterEnv.js` (strictly for tests; never in application code or `.env.example`).
  - Removed User -> Employee fallback in `backend/src/controllers/authController.js` `resetPassword`.

### 2. Seeder Fix & Backfill Migration
- Revoked permissions were being re-created on every permission-cache miss because the seeder queried missing role-permission pairs against defaults. Runtime seeding now only runs when an org has zero `RolePermission` rows.
- Idempotent backfill migration `20261008120000-backfill-gate3-default-role-permissions.js` adds `manage_coupons`, `manage_discounts`, `manage_held_carts` (admin, manager) and `manage_customers` (manager) for existing orgs. Verified safe to run multiple times with zero changes on pass two.
- **Decision:** `manage_customers` for managers is kept as the Gate 3H default change.
- **Standing Rule:** Every future permission needs its own backfill migration.

### 3. Security Finding: Platform Authority Isolation (`super_admin`)
- `updateRole` previously accepted arbitrary role strings, enabling tenant callers to assign role `"super_admin"` (platform operator authority via `requirePlatformSuperAdmin`).
- Fixed by enforcing a strict allowlist (`['admin', 'manager', 'cashier']`), normalizing and validating `active`/`role`/`orgRole`, and rejecting `role: 'super_admin'` with 400 across User and Employee branches.
- Tested: owner, shop admin, and delegated org_admin callers attempting `role: 'super_admin'` receive 400 with target user role unchanged in the database.
- **Recommended DB Check:** Query non-throwaway databases for unexpected super_admin users:
  ```sql
  SELECT id, email, role FROM Users WHERE role = 'super_admin';
  ```

### 4. Owner Self-Edit Policy
- No-op self-edits are allowed (200).
- Real changes to caller's own `role`, `active`, or `orgRole` return 403.

### 5. Evidence Statement
- Full suite executed on **October 9, 2026** with command:
  ```bash
  npx jest --runInBand --forceExit --json --outputFile="<scratch>/final_reconciled_after_hardening.json"
  ```
- **Observed Results:**
  - **Test Suites:** 84 passed, 84 total (100%)
  - **Tests:** 1,177 passed, 1,177 total (100%)
  - **Wall Time:** 584.976s
- Dev database `zana_pos` verified untouched (`Users` count = 1).

