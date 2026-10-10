# CI Hardening & Production Migration Audit (`ci/hardening`)

**Date:** 2026-10-10  
**Base Commit (`origin/master`):** `b88ec23` (`Merge pull request #1 from Warrenchris/fix/test-baseline-phase2`)  

### Prerequisite Check (Verbatim `git log origin/master --oneline -n 10`)
```text
b88ec23 Merge pull request #1 from Warrenchris/fix/test-baseline-phase2
f3bea97 test(ai): add unit tests for auth, stock depletion, and expense prediction
dbeb59d fix(ai): handle missing expense model gracefully and refine stock depletion forecast
817946f feat(platform): add platform-wide organization management, billing, and notifications
22d0f86 ci(backend): run startup validation with NODE_ENV=development (test is rejected)
1795726 fix(backend): guard integer User and UUID Employee lookups against MySQL prefix coercion
c8edeb6 fix(authz,tests): restore backend test baseline and backfill missing permissions
69910c6 docs(audit): record backend test baseline audit (16 failing suites)
20ae166 feat(superadmin): add interactive super_admin provisioning script and tests
88a9026 fix(pos): make barcode scanner listener work regardless of input focus
```

---

## 1.1 Workflow Inventory & GitHub Actions History on `master`

### Workflow Inventory (`.github/workflows/` before Phase 2)

| Workflow File | Name | Job Name | Triggers & Path Filters | Runtime / Image | Services | Steps & Flags (Pre-Fix) | Docker Target Built (Pre-Fix) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `.github/workflows/backend-ci.yml` | `Backend CI` | `Backend Test & Docker Validation` | `push` & `pull_request` on `master`, `main`, `develop` (`paths: backend/**`, `docker-compose.yml`, `.github/workflows/backend-ci.yml`) | `ubuntu-latest`, `actions/setup-node@v4` (`node-version: 20`) | `mysql:8.0` (`zana_pos_test`, root/root, port `3306`), `redis:7-alpine` (port `6379`) | 1. Checkout<br>2. Setup Node 20 (`npm` cache)<br>3. `npm ci`<br>4. `node scripts/check-dependencies.js`<br>5. `npm test` (`NODE_ENV=test`)<br>6. `docker build -t zana-backend-ci .`<br>7. Verify `scripts/check-dependencies.js` in Docker<br>8. Verify `validateStartup()` in Docker (`NODE_ENV=development`) | `backend/Dockerfile` (**dev**, not `Dockerfile.prod`) |
| `.github/workflows/frontend-ci.yml` | `Frontend CI` | `Frontend Build & Test` | `push` & `pull_request` on `master`, `main`, `develop` (`paths: frontend/**`, `.github/workflows/frontend-ci.yml`) | `ubuntu-latest`, `actions/setup-node@v4` (`node-version: 20`) | None | 1. Checkout<br>2. Setup Node 20 (`npm` cache)<br>3. `npm ci`<br>4. `npm run build`<br>5. `npm test -- --passWithNoTests` (**`continue-on-error: true`**) | None (no Docker build step) |
| `.github/workflows/ai-service-ci.yml` | `AI Service CI` | `AI Service Verification & Docker Build` | `push` & `pull_request` on `master`, `main`, `develop` (`paths: ai_service/**`, `.github/workflows/ai-service-ci.yml`) | `ubuntu-latest`, `actions/setup-python@v5` (`python-version: '3.10'`) | None | 1. Checkout<br>2. Setup Python 3.10 (`pip` cache)<br>3. `pip install -r requirements.txt pytest`<br>4. Generate throwaway RSA keypair<br>5. `py_compile` & `import src.main`<br>6. `pytest` (if `tests/` exists)<br>7. `docker build -t zana-ai-service-ci .` | `ai_service/Dockerfile` |
| `.github/workflows/sentry-release.yml` | `Sentry Release Tracking` | `Create Sentry Release & Commits` | `push` on `master`, `main` (no path filter); job gated by `if: github.repository_owner == 'Warrenchris'` | `ubuntu-latest` | None | 1. Checkout (`fetch-depth: 0`)<br>2. Check `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`<br>3. `getsentry/action-release@v1` (only if `has_secrets == 'true'`) | None |

### GitHub Actions History on `master`

| Workflow | Latest Run ID | Commit | Timestamp (UTC) | Status / Conclusion | Duration | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend CI** | `38055171462` | `b88ec23` | `2026-10-10T13:17:45Z` | **SUCCESS** | `3m19s` | All steps green (`84/84` suites, `1,181` tests in `198s`; Docker build & `validateStartup()` passed). Prior `master` runs from Sep 28 (`37584695663` through `37755239614`) were all **FAILURE**. |
| **Frontend CI** | `37973096936` | `20ae166` | `2026-10-09T18:24:51Z` | **SUCCESS** | `1m2s` | All recent `master` runs (`37584695658` through `37973096936`) succeeded (`52 passed` suites, `389 passed` tests in `8.394s`). |
| **AI Service CI** | `38053886443` | `f3bea97` | `2026-10-10T12:57:41Z` | **FAILURE** | `47s` | Failed at `Run pytest (if tests exist)` with `exit code 2` (`collected 0 items / 4 errors`). |
| **Sentry Release Tracking** | `38055171460` | `b88ec23` | `2026-10-10T13:17:45Z` | **SUCCESS** | `24s` | Skips release step gracefully when Sentry secrets are unset. |

#### Why `AI Service CI` (`38053886443`) Failed on `master`
1. `tests/test_auth.py`, `tests/test_expense_model.py`, `tests/test_stock_depletion.py`: `ModuleNotFoundError: No module named 'src'` because `pytest` was invoked directly instead of `python -m pytest` with `PYTHONPATH=.`.
2. `tests/test_forecasting_rf.py`: `RuntimeError: The starlette.testclient module requires the httpx2 package to be installed.` because `ai_service/requirements.txt` had unbounded `fastapi>=0.100.0` (resolving `starlette 1.7.0`) and omitted `httpx`.

---

## 1.2 Node Version Map (Pre-Fix)

| Location | Specified Node Version | Purpose / Context | Notes / Mismatch |
| :--- | :--- | :--- | :--- |
| `backend/Dockerfile:3` | `FROM node:18-alpine` | Dev backend image | Ran `v18.20.8`; emitted 18 `EBADENGINE` warnings for `@aws-sdk/*` requiring `node: '>=20.0.0'`. |
| `backend/Dockerfile.prod:2` | `FROM node:18-alpine AS base` | Production backend image | Ran `v18.20.8`; emitted 18 `EBADENGINE` warnings for `@aws-sdk/*` requiring `node: '>=20.0.0'`. |
| `.github/workflows/backend-ci.yml:49` | `node-version: 20` | Backend CI test runner | Tested on Node 20 while containers ran Node 18. |
| `frontend/Dockerfile:1` | `FROM node:20.19-bullseye` | Dev frontend image | Node 20 (`20.19`). |
| `frontend/Dockerfile.prod:2` | `FROM node:20.19-bullseye AS builder` | Production frontend builder stage | Node 20 (`20.19`); runner stage is `nginx:1.27-alpine`. |
| `.github/workflows/frontend-ci.yml:31` | `node-version: 20` | Frontend CI test & build runner | Node 20. |
| `package.json`, `backend/package.json`, `frontend/package.json` | *(none)* | Package manifests | No `engines` field (updated in Phase 2 to `>=20.0.0` in `backend/package.json` and `frontend/package.json`; root left untouched as `mobile/` requires Node 22+). |
| `.nvmrc` | *(none)* | Version manager config | Added `.nvmrc` (`20`) in Phase 2. |

---

## 1.3 Lint Reality Check (Pre-Fix)

### Backend (`cd backend && npm run lint`)
- **Unmodified `backend/eslint.config.js`:** Crashed with `TypeError: Key "languageOptions": Unexpected key "env" found.` (ESLint v8 `.eslintrc` key inside ESLint v9 flat config).
- **With `globals.node` + `globals.jest` enabled:** Reported `134 problems (13 errors, 121 warnings)`:
  - `no-undef:error`: **1** — `backend/src/controllers/saleController.js:1640:89` (`'Shop' is not defined` inside `exports.processRefund`).
  - `no-empty:error`: **7**
  - `no-useless-escape:error`: **5**
  - `no-unused-vars:warn`: **120**

### Frontend (`cd frontend && npm run lint`)
- **Unmodified `frontend/eslint.config.js`:** Reported `1,573 problems (1,552 errors, 21 warnings)`.
- **Non-test `no-undef` errors (11 errors across 4 files):**
  1. `frontend/src/components/POSModal.jsx:121:20` — `'useSelector' is not defined` (**live bug**).
  2. `frontend/src/components/pos/DiscountModal.jsx:219:17` — `'setPinError' is not defined` (**live bug**; state setter is `setApprovalError`).
  3. `frontend/src/pages/MySales.jsx:81:73 & 94:73` — `'formatCurrency' is not defined` (2 occurrences in unexported `SalesStats`).
  4. `frontend/src/services/dashboardAPI.js:4,6,8,10,12,14,16` — `'api' is not defined` (7 occurrences in unreferenced file).

---

## 1.4 Production Dockerfiles & Compose Audit

1. **`backend/Dockerfile.prod`:**
   - Local cold build (`zana-backend-prod-audit`): `1182.22s`, `845MB`.
   - Used `node:18-alpine` (`v18.20.8`) instead of `node:20-alpine`.
   - `npm ci --omit=dev` excluded `sequelize-cli` (which was in `devDependencies` in `backend/package.json`).
   - Ran as `USER node` with `/app` owned by `root:root` and `/app/logs` missing (`app.js:30` calls `fs.mkdirSync(logsDir)`).
   - `HEALTHCHECK` probed `http://localhost:5000/health` (`404 Not Found`) instead of `http://localhost:5000/` (`200 OK`).
2. **`frontend/Dockerfile.prod`:**
   - Local build (`zana-frontend-prod-audit`): `325.12s`, `106MB`.
   - Was not built in `.github/workflows/frontend-ci.yml`.
3. **`docker-compose.prod.yml`:**
   - Lacked a `backend-migrate` service and `backend.depends_on.backend-migrate` (`condition: service_completed_successfully`).
   - `backend` healthcheck probed `http://localhost:5000/health` (`404 Not Found`) instead of `http://localhost:5000/`.

---

## 1.5 Items Needing Future Decision (Handover Implications)

### `.github/workflows/sentry-release.yml` — `github.repository_owner` Condition
- **Current state (intentionally left unchanged in this PR):**
  Line 12 of `.github/workflows/sentry-release.yml` gates the job with:
  ```yaml
  if: github.repository_owner == 'Warrenchris'
  ```
- **Handover implications:**
  When the repository is transferred to or forked under the client's GitHub organization/user account, `github.repository_owner` will no longer equal `'Warrenchris'`, causing the `Sentry Release Tracking` workflow to be skipped on every push to `master`/`main` even if the client configures `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
- **Options for client handover:**
  1. Remove the `if: github.repository_owner == 'Warrenchris'` condition altogether and rely solely on the existing `Check Sentry secrets` step (`steps.sentry_check.outputs.has_secrets == 'true'`), which already safely no-ops when `SENTRY_AUTH_TOKEN` is absent.
  2. Or update `github.repository_owner` (or compare against a repository variable `vars.ENABLE_SENTRY_RELEASE`) during handover.
