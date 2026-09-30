# Phase 7B Platform Operator (Super-Admin) Console Walkthrough

**Document Version:** 1.0.0  
**Date:** 2026-09-30  
**Phase Baseline Commit:** `04e2cb9`  
**Phase 7B Completion Commit:** `7c5dfbb`  
**Status:** COMPLETE (Read-Only Surface — Ready for Gate Approval)

---

## 1. Executive Summary

Phase 7B introduces the platform operator console and infrastructure for Zana POS, enabling operators to inspect system health, organizations, subscription states, quotas, invoices, and notification logs without direct database access.

Per the completion plan and user instructions, Phase 7B adheres to a strict read-only boundary: **zero mutation endpoints** (POST/PUT/DELETE) have been created on `/api/platform/*`—any mutation attempts return HTTP 404 by route omission. Mutations such as trial extensions, suspensions, and manual invoice receipts are reserved for future authorized sub-phases.

### Key Milestones Achieved:
1. **Schema & Model Foundation:** Updated `Users.role` ENUM to include `super_admin`, modified `Users.shopId` to be nullable (`INT NULL`), added index on `Organizations(createdAt)`, enforced model validations ensuring tenant roles require non-null `shopId`, and implemented an interactive/arg-driven provisioning CLI script (`backend/scripts/createSuperAdmin.js`).
2. **Platform Operator Authentication & Isolation:** Implemented `requirePlatformSuperAdmin.js` middleware verifying RS256 asymmetric JWT signatures, enforcing Redis token revocation cutoffs, stripping tenant context (`req.shopId = undefined`, `req.organizationId = undefined`), requiring zero-grace verified emails (`emailVerifiedAt`), and applying a dedicated distributed rate limiter (120 req/min).
3. **6 Read-Only Platform Endpoints:** Implemented and mounted `/api/platform` endpoints with strict pagination clamping (max 100 per page per ADD 2):
   - `GET /api/platform/overview`
   - `GET /api/platform/organizations`
   - `GET /api/platform/organizations/:id`
   - `GET /api/platform/plans`
   - `GET /api/platform/invoices`
   - `GET /api/platform/notifications`
4. **Dedicated Frontend Platform Interface:** Built a segregated `/platform` UI under `frontend/src/pages/platform/` with a standalone navigation bar (`PlatformLayout`), unauthorized access guard (`PlatformRoute`), and login redirection for operator roles in `Login.jsx` and `DashboardRouter.jsx`.
5. **Reversible Schema Migration Verified:** Executed and proved clean rollback (`db:migrate:undo`) and re-migration (`db:migrate`) for migration `20260930120000-add-super-admin-role-and-nullable-shop-id.js`.
6. **Full 4-Tier Regression Passed:** All 55 backend test suites (599 tests), 48 frontend test suites (370 tests), frontend production build, and 12 AI service pytest tests passed 100% green.

---

## 2. Answers to User Verification & Addition Items

### VERIFY 1: JWT Signing Algorithm
* **Finding:** The application authoritatively uses **RS256** asymmetric key-pair signing via OpenSSL RSA keys.
* **Evidence:**
  - Token signing in `backend/src/controllers/authController.js:160,292`:
    ```javascript
    const privateKey = getPrivateKey();
    return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: '24h' });
    ```
  - Token verification in `backend/src/middleware/auth.js:13-14` & `backend/src/middleware/requirePlatformSuperAdmin.js:46-51`:
    ```javascript
    const publicKey = getPublicKey();
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    ```
* **Resolution:** `requirePlatformSuperAdmin.js` strictly aligns with existing RS256 signing and verification. No new signing algorithm was introduced.

### VERIFY 2: Organization Status vs Subscription Status
* **Finding:** `Organization` maintains its own dedicated `status` column with ENUM values (`'trialing'`, `'trial'`, `'active'`, `'past_due'`, `'canceled'`, `'suspended'`), as defined in `backend/migrations/20260914100003-extend-organizations-status-enum.js`.
* **Resolution:** An index `idx_organizations_created_at` on `Organizations(createdAt)` was added to optimize default pagination ordering (`ORDER BY createdAt DESC`).

### ADD 1: `Users.shopId` Non-Null Assumptions & Down-Migration Risk
* **Codebase Audit:** Grepped references to `req.shopId || req.user.shopId` across all controllers (`saleController.js`, `productController.js`, `customerController.js`, etc.). All tenant business logic requires `req.shopId`. In `backend/src/middleware/auth.js:108-110`, any request targeting tenant routes (`/api/sales`, `/api/products`, etc.) without `req.shopId` is immediately rejected with `403 Shop context required for this operation.`
* **Down-Migration Behavior:** If rolled back, the down-migration deletes any operator accounts having `role = 'super_admin' OR shopId IS NULL` before re-imposing `NOT NULL` on `Users.shopId`. This prevents migration failure and database inconsistency, and is documented as an accepted one-way operational risk.

### ADD 2: Pagination Limit Clamping (Max 100)
* **Finding:** Implemented centralized parameter parsing in `backend/src/routes/platform.js:19-27`:
  ```javascript
  function getPaginationParams(query) {
    const rawLimit = parseInt(query.limit, 10);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const offset = (page - 1) * limit;
    return { limit, page, offset };
  }
  ```
* **Resolution:** Any query requesting `limit=500` or `limit=1000` on `/api/platform/organizations` or `/api/platform/invoices` is clamped to 100.

### ADD 3: `Login.jsx` Role-Based Redirect Logic
* **Finding:** Inspected `frontend/src/pages/Login.jsx:92-96`. Previously, all successful logins routed unconditionally to `navigate('/dashboard')`.
* **Resolution:** Updated `Login.jsx` and `DashboardRouter.jsx` to branch cleanly:
  ```javascript
  if (user?.role === 'super_admin') {
    navigate('/platform');
  } else {
    navigate('/dashboard');
  }
  ```
  No collision exists with tenant routing.

---

## 3. Commit Log & Detailed Changes

### Commit 1: Schema Migration & Provisioning CLI
* **Commit Hash:** `9a1a573`
* **Commit Message:** `feat(platform): super_admin schema migration, nullable shopId, model validation, and CLI provisioning`
* **Affected Files:**
  - `backend/migrations/20260930120000-add-super-admin-role-and-nullable-shop-id.js`
  - `backend/src/models/User.js`
  - `backend/scripts/createSuperAdmin.js`
  - `backend/package.json`
  - `backend/tests/superAdminProvisioning.test.js`
* **Summary:** Added `super_admin` to `Users.role` ENUM, made `Users.shopId` nullable, added `idx_organizations_created_at` index, added model `beforeValidate` hook requiring `shopId` for non-super-admins, created CLI provisioning script `npm run superadmin:create`, and added 8 unit tests in `superAdminProvisioning.test.js`.

---

### Commit 2: requirePlatformSuperAdmin Middleware & Limiter
* **Commit Hash:** `d741339`
* **Commit Message:** `feat(platform): implement requirePlatformSuperAdmin middleware and platform rate limiter`
* **Affected Files:**
  - `backend/src/middleware/requirePlatformSuperAdmin.js`
  - `backend/tests/requirePlatformSuperAdmin.test.js`
* **Summary:** Authored middleware with RS256 token verification, Redis cutoff checking, role assertion, zero-grace email verification (`emailVerifiedAt`), tenant context isolation, and a 120 req/min rate limiter. Added 6 unit tests in `requirePlatformSuperAdmin.test.js`.

---

### Commit 3: 6 Read-Only Platform Endpoints
* **Commit Hash:** `c27ddb3`
* **Commit Message:** `feat(platform): implement 6 read-only platform GET endpoints with pagination caps and tenant isolation`
* **Affected Files:**
  - `backend/src/routes/platform.js`
  - `backend/src/app.js`
  - `backend/tests/platformRoutes.test.js`
* **Summary:** Mounted 6 read-only GET routes at `/api/platform`. Enforced max limit of 100 on pagination. Verified that mutation attempts return 404 by omission. Added 19 unit tests in `platformRoutes.test.js`.

---

### Commit 4: Frontend Console, Route Guard & Layout
* **Commit Hash:** `7f26041`
* **Commit Message:** `feat(platform): frontend PlatformRoute guard, PlatformLayout, console pages, and login redirect`
* **Affected Files:**
  - `frontend/src/services/platformAPI.js`
  - `frontend/src/components/platform/PlatformRoute.jsx`
  - `frontend/src/components/platform/PlatformLayout.jsx`
  - `frontend/src/pages/platform/PlatformOverview.jsx`
  - `frontend/src/pages/platform/PlatformOrganizations.jsx`
  - `frontend/src/pages/platform/PlatformOrgDetail.jsx`
  - `frontend/src/pages/platform/PlatformPlans.jsx`
  - `frontend/src/pages/platform/PlatformInvoices.jsx`
  - `frontend/src/pages/platform/PlatformNotifications.jsx`
  - `frontend/src/pages/Login.jsx`
  - `frontend/src/components/DashboardRouter.jsx`
  - `frontend/src/router.config.jsx`
  - `frontend/src/components/__tests__/PlatformRoute.test.jsx`
* **Summary:** Built frontend platform operator console with dedicated dark navigation layout, access-denied route guard, 6 responsive pages, API client service, and role-based login routing. Added 3 frontend tests in `PlatformRoute.test.jsx`.

---

### Commit 5: Tenant Route Isolation Test
* **Commit Hash:** `7c5dfbb`
* **Commit Message:** `test(platform): add test verifying super-admin token cannot access tenant endpoints`
* **Affected Files:**
  - `backend/tests/platformRoutes.test.js`
* **Summary:** Strengthened test suite by asserting that a super-admin token without shop context calling `/api/sales` is rejected with `403 Shop context required for this operation.`

---

## 4. Migration Rollback & Re-Migrate Verification

Executed `npx sequelize-cli db:migrate:undo` and `npx sequelize-cli db:migrate` against the database:

```text
== 20260930120000-add-super-admin-role-and-nullable-shop-id: reverting =======
Executing (default): ALTER TABLE `Organizations` DROP INDEX `idx_organizations_created_at`;
Executing (default): DELETE FROM `Users` WHERE `role` = 'super_admin' OR `shopId` IS NULL;
Executing (default): ALTER TABLE `Users` MODIFY COLUMN `shopId` INT NOT NULL;
Executing (default): UPDATE `Users` SET `role` = 'admin' WHERE `role` NOT IN ('admin', 'manager', 'cashier');
Executing (default): ALTER TABLE `Users` MODIFY COLUMN `role` ENUM('admin', 'manager', 'cashier') NOT NULL DEFAULT 'cashier';
== 20260930120000-add-super-admin-role-and-nullable-shop-id: reverted (2.501s)

== 20260930120000-add-super-admin-role-and-nullable-shop-id: migrating =======
Executing (default): ALTER TABLE `Users` MODIFY COLUMN `role` ENUM('admin', 'manager', 'cashier', 'super_admin') NOT NULL DEFAULT 'cashier';
Executing (default): ALTER TABLE `Users` MODIFY COLUMN `shopId` INT NULL;
Executing (default): ALTER TABLE `Organizations` ADD INDEX `idx_organizations_created_at` (`createdAt`);
== 20260930120000-add-super-admin-role-and-nullable-shop-id: migrated (1.615s)
```

Both `development` and `test` database environments are 100% UP and clean.

---

## 5. Full 4-Tier Regression Results

| Test Tier | Scope / Command | Result | Pass Rate |
| :--- | :--- | :--- | :--- |
| **Backend Jest** | `npm test -- --runInBand --forceExit` | **55 passed, 0 failed (55 total suites)**<br>**599 passed, 0 failed (599 total tests)** (423.6s) | **100% PASS** |
| **Frontend Jest** | `npm test` | **48 passed, 0 failed (48 total suites)**<br>**370 passed, 0 failed (370 total tests)** (117.1s) | **100% PASS** |
| **Frontend Build** | `npm run build` | **Exit code 0** (Vite production bundle built cleanly in 1m 60s) | **PASS** |
| **AI Service Pytest** | `.venv\Scripts\python.exe -m pytest` | **12 passed, 0 failed (12 total tests)** (38.47s) | **100% PASS** |
| **DB Migrations** | `npx sequelize-cli db:migrate:status` | **96 UP, 0 pending** | **100% UP** |

---

## 6. Confirmation of Read-Only Constraint

All mutation routes on `/api/platform/*` return HTTP 404 by omission:
- `POST /api/platform/organizations` -> `404 Not Found`
- `PUT /api/platform/organizations/:id` -> `404 Not Found`
- `DELETE /api/platform/organizations/:id` -> `404 Not Found`
- `POST /api/platform/suspend` -> `404 Not Found`

This guarantees that no unauthorized write pathways exist in Phase 7B.

---

## 7. Gate Determination & Next Sub-Phase

```text
======================================================================
PHASE 7B — PLATFORM OPERATOR CONSOLE GATE: PASS (READ-ONLY)
======================================================================
All requirements, verification items, additions, tests, migrations,
and regressions have succeeded.

Awaiting user approval before commencing Phase 7C (Tax Integrity &
eTIMS Groundwork).
======================================================================
```
