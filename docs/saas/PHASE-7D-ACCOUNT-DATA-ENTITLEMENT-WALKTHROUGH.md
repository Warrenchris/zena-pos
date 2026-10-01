# Phase 7D: Account, Data, and Entitlement Gaps - Walkthrough & Verification

**Date:** 2026-10-01  
**Status:** Complete  
**Branch:** `master` (synchronized with `origin/master`)

---

## 1. Executive Summary

Phase 7D completes the final core operational, compliance, and tenant lifecycle gaps identified in [`docs/saas/PHASE-7-SAAS-COMPLETION-PLAN.md`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/saas/PHASE-7-SAAS-COMPLETION-PLAN.md). 

Key implementations:
1. **Password Policy Hardening (D8):** 8-character floor across user registration, password reset, staff creation, and system settings validation.
2. **Disposable Email Blocking (SEC-02):** Rejection of disposable/temporary domains during registration with configurable environment overrides.
3. **Multi-Shop Entitlement Enforcement:** Gating branch expansion behind subscription `maxShops` quota and `multi_shop` feature flags in `shopController.createShop`.
4. **`api_access` Metadata Clarification:** Explicit architectural documentation clarifying `api_access` as reserved future plan metadata without speculative schema churn.
5. **Tenant Data Export:** Owner-only, rate-limited (`max 2/hour`), audited endpoint (`GET /api/organizations/export`) delivering a zip archive of CSVs across all tenant resources.
6. **Account Closure & Statutory 30-Day Retention Purge Scheduler:**
   - Dedicated `deletedAt` and `scheduledPurgeAt` columns on `Organizations` (completely separate from `Organization.status`).
   - Owner-only, password-verified endpoint (`POST /api/organizations/close-account`).
   - Immediate cancellation of active subscription and instant revocation of all active session tokens for organization members.
   - Statutory purge job (`purgeExpiredOrganizations`) that anonymizes customer and staff PII, terminates access, deletes ephemeral carts, and preserves sales/tax records for 5-year statutory audit compliance (Kenya Tax Procedures Act Sec 23).

---

## 2. Commit Sequence & Traceability

| Commit | Description | Scope |
|---|---|---|
| `b522647` | `feat(auth): raise minimum password length to 8 for new credentials and resets per D8` | Auth validation, settings validator, Signup/Settings UI copy |
| `4737250` | `feat(auth): block disposable and temporary email domains at registration per SEC-02` | Disposable domain filter in `src/utils/disposableEmail.js`, wired to `routes/auth.js` |
| `eb785fb` | `feat(entitlement): enforce multi_shop feature gate before branch creation in shopController` | Branch creation entitlement gating in `shopController.js` |
| `7c7da54` | `fix(entitlement): check branch quota limit before multi_shop feature gate` | Preserves `QUOTA_EXCEEDED` quantitative limit contract before boolean feature check |
| `c8fef09` | `docs(plan): document api_access as unimplemented plan metadata reserved for future API integrations` | Architecture documentation update in `BILLING-SUBSCRIPTIONS-DESIGN.md` |
| `83722b2` | `feat(org): add owner-only rate-limited organization data export with zipped CSVs` | Direct `archiver` dependency, CSV streaming, export route & limiter |
| `0d107cb` | `feat(org): add account closure with 30-day retention window and full PII purge scheduler` | Migration, model attributes, closure route, and `accountPurgeScheduler` |

---

## 3. Resolution of the Five Findings with Evidence

### Finding 1: Password Policy (D8)
- **Resolution:** Raised the minimum password length requirement from 6 to 8 characters for all new credentials minted via `POST /api/auth/register`, `POST /api/auth/reset-password`, `POST /api/users/staff`, and `POST /api/users`. The system settings validator enforce a floor of $\ge 8$ characters. Existing user passwords remain functional without forced resets.
- **Evidence:** Verified by `backend/tests/passwordPolicy.test.js` (8/8 tests passed).

### Finding 2: Disposable Email Block (SEC-02)
- **Resolution:** Created `src/utils/disposableEmail.js` with an in-memory Set of over 100 known disposable and temporary mail providers (e.g. `mailinator.com`, `tempmail.com`, `guerrillamail.com`, `10minutemail.com`). Added support for comma-separated `ADDITIONAL_DISPOSABLE_DOMAINS` env variables. Wired into `POST /api/auth/register` validation chain.
- **Evidence:** Verified by `backend/tests/disposableEmail.test.js` (7/7 tests passed).

### Finding 3: Multi-Shop Entitlement Enforcement & Grandfathering
- **Resolution:**
  1. Ran live and test database audit queries prior to implementation to identify any organizations exceeding plan `maxShops` or `multi_shop` allowances.
  2. Confirmed **0 violations** existed:
     ```
     Total organizations: 15
     Violations found: 0
     []
     Total organizations in test DB: 4
     Violations in test DB: 0
     ```
  3. Gated branch creation in `shopController.createShop` under database row locking: verifies `currentActiveShopCount < maxShops` and verifies `canUseFeature(orgId, 'multi_shop')`.
- **Evidence:** Verified by `backend/tests/multiShopEntitlement.test.js` (4/4 tests passed) and regression test `backend/tests/subphase6c.test.js`.

### Finding 4: `api_access` Plan Metadata
- **Resolution:** Documented in [`docs/architecture/BILLING-SUBSCRIPTIONS-DESIGN.md`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/architecture/BILLING-SUBSCRIPTIONS-DESIGN.md#L393-L399) that `api_access` is reserved metadata in plan definitions for future external developer and webhook access. No speculative endpoints or database churn introduced.
- **Evidence:** Documented under Commit `c8fef09`.

### Finding 5: Data Export & Account Closure with 30-Day Statutory Purge
- **Resolution:**
  1. **Direct Dependency:** Added `"archiver": "^5.3.2"` directly to `backend/package.json` and cleanly updated `package-lock.json`.
  2. **Data Export:** Implemented `GET /api/organizations/export` with `dataExportLimiter` (max 2/hour per org/IP). Bundles CSVs for shops, products, customers, sales, sale items, and subscription invoices. Verified tenant isolation (Org 2 cannot see Org 1 records) and recorded `ORGANIZATION_DATA_EXPORTED` in `ActivityLog`.
  3. **Database Migration:** Created `20261001120000-add-deleted-at-and-purge-to-organizations.js` adding nullable `deletedAt` and `scheduledPurgeAt` DATETIME columns to `Organizations`. Verified rollback (`db:migrate:undo`) and re-migration (`db:migrate`).
  4. **Account Closure:** Implemented `POST /api/organizations/close-account`:
     - Requires owner role and `currentPassword` confirmation.
     - Calculates `deletedAt = now` and `scheduledPurgeAt = now + 30 days`.
     - Sets subscription status to `canceled` via `billingService.cancelSubscription`.
     - Calls `tokenRevocationService.revokeAllUserTokens` for all organization members.
     - Keeps `Organization.status` separate from `deletedAt`.
  5. **Purge Scheduler (`accountPurgeScheduler.js`):**
     - Queries `deletedAt IS NOT NULL AND scheduledPurgeAt <= now`.
     - Anonymizes Customer PII (`name = 'Anonymized Customer'`, `email = null`, `phone = null`, `address = null`).
     - Anonymizes Employee PII (`firstName = 'Anonymized'`, `lastName = 'Staff'`, scrambled emails, `status = 'inactive'`, scrambled passwords).
     - Anonymizes User PII (`name = 'Anonymized User'`, scrambled emails, `active = false`).
     - Deletes ephemeral carts (`HeldCart`).
     - Preserves all financial and tax audit records (`Sale`, `SaleItem`, `SalePayment`, `SalesReturn`, `SubscriptionInvoice`) intact for 5-year compliance.
- **Evidence:** Verified by `backend/tests/organizationDataExport.test.js` (5/5 tests passed) and `backend/tests/organizationAccountClosure.test.js` (12/12 tests passed).

---

## 4. Four-Tier Regression Test Verification

### Tier 1: Backend Full Regression Suite
- **Command:** `npm test -- --runInBand --forceExit` (in `backend/`)
- **Result:** **64 / 64 suites passed (100%), 666 / 666 tests passed (100%)**
- **Test Duration:** 371.35 seconds

### Tier 2: Frontend Full Test Suite
- **Command:** `npm test -- --watchAll=false` (in `frontend/`)
- **Result:** **48 / 48 suites passed (100%), 372 / 372 tests passed (100%)**
- **Test Duration:** 72.76 seconds

### Tier 3: Frontend Production Build
- **Command:** `npm run build` (in `frontend/`)
- **Result:** **Success (0 errors)**
- **Output:** Built production bundle and PWA service workers in 1m 5s.

### Tier 4: AI Service Pytest Suite
- **Command:** `.venv\Scripts\python.exe -m pytest` (in `ai_service/`)
- **Result:** **12 / 12 tests passed (100%)**
- **Test Duration:** 15.55 seconds

### Database Migrations
- **Command:** `npx sequelize-cli db:migrate:status` (in `backend/`)
- **Result:** All 73 migrations `up` including `20261001120000-add-deleted-at-and-purge-to-organizations.js`.
