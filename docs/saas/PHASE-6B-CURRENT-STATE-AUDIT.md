# Zana POS — Phase 6B Controlled Production Hardening Audit
## Comprehensive Production Readiness, Security, Reliability & Resilience Audit

**Date:** September 18, 2026  
**Repository:** `https://github.com/Warrenchris/zena-pos.git`  
**Author:** Principal Software Engineer, Security Engineer, Database Reliability Engineer, and Production Readiness Lead  
**Audit Status:** COMPLETE — READ ONLY (No Application Code, Schema, or Configuration Modified)  
**Verification Baseline:** 133 / 133 Automated Tests Passing (100%) | Frontend Build Passing (0 Errors) | 89 Applied Migrations | Git Working Tree Clean  

---

## 1. Executive Summary

Zana POS is undergoing transition from an isolated single-shop point-of-sale terminal into an enterprise-grade multi-tenant SaaS platform tailored for African retail and wholesale SMEs.

Following the successful remediation and independent verification of all eight Phase 6A release blockers (**PERF-01/02**, **SEC-01**, **SCHEM-01**, **AUTH-01**, **DATA-01**, **DEPL-01**, **DR-01**, and **VULN-01**), this **Phase 6B Controlled Production Hardening Audit** establishes an authoritative, adversarial, and empirical evaluation of the entire system across six core operational hardening vectors:
1. **6B-01: Dependency & Supply-Chain Hardening**
2. **6B-02: Authentication & Session Resilience**
3. **6B-03: Payment Adversarial Security**
4. **6B-04: Multi-Tenant Adversarial Isolation & RBAC**
5. **6B-05: Production Operations & Reliability**
6. **6B-06: POS Terminal Resilience & Client-Side Idempotency**

### Key Critical Findings
1. **[P0 - CRITICAL FINANCIAL] Card Payment Verification Missing Amount/Currency Verification (`cardRoutes.js:89-138`):**  
   While the card payment callback under exclusive row lock verifies gateway status, it **never compares the amount paid against `pendingPayment.amount` or currency**. An adversary purchasing 100,000 KES worth of goods can complete a separate 10 KES card transaction, supply the valid reference to `/api/card/verify`, and confirm the 100,000 KES order without paying the required balance.
2. **[P1 - SECURITY] Password Change & Reset Fails to Revoke Existing Active JWTs (`authController.js:305-327, 409-455`):**  
   When a user or employee changes their password or completes a password reset, active JWT tokens issued prior to the password update are not revoked in Redis or invalidated. An attacker holding an exfiltrated JWT retains privileged API access for up to 120 minutes post-password-change.
3. **[P1 - FINANCIAL / RESILIENCE] Frontend Missing Client-Side Idempotency-Keys on POS Checkout (`cashierAPI.js:35`):**  
   Although backend `Sale` and `StockTransfer` models enforce unique idempotency indexes (`unique_sales_shop_idempotency_key`), `cashierAPI.createSale` dispatches raw `POST /api/sales` without generating or attaching `Idempotency-Key` UUIDs. Rapid double-clicks or client retries create duplicate sales and duplicate invoices.
4. **[P1 - SUPPLY CHAIN] Critical Vulnerabilities in Frontend `xlsx` Dependency (Prototype Pollution & ReDoS):**  
   Frontend `xlsx` dependency contains GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS) with no direct fix available without package replacement or targeted override.
5. **[P2 - TENANT ISOLATION] Cross-Shop Sale Refund ID Oracle (`saleController.js:1120-1129`):**  
   `processRefund` queries `Sale.findOne({ where: { id: saleId } })` and returns `404 Sale not found` if non-existent, but `403 Access denied: cross-shop refund` if the sale belongs to another shop/tenant. This permits systematic enumeration of valid cross-tenant transaction IDs.
6. **[P2 - DATABASE PERFORMANCE] Missing Foreign Key Indexes on High-Volume Scoped Tables (`INDX-01`):**  
   Empirically confirmed via `SHOW INDEX`: `Employees.shopId`, `SaleRefunds.shopId`, and `Users.shopId` have zero indexes, forcing full table scans on all shop-filtered queries.

---

## 2. Repository State

* **Git Branch:** `master`
* **Latest Commit:** `5738402 docs: add Phase 6 production readiness audit and Phase 6A remediation walkthrough documentation`
* **Working Tree:** 100% Clean (`nothing to commit, working tree clean`)
* **Environment:** Node.js v24.11.1, MySQL 8.0 (Port 3307), Redis 7 (Port 6379), Python 3.11 (FastAPI AI Service)
* **Databases Active:** `zana_pos` (Primary production schema), `zana_pos_test` (Automated testing schema)
* **Migrations Applied:** 89 migrations registered in `SequelizeMeta` across both database environments.

---

## 3. Phase 6A Verification Confirmation

Prior to commencing the Phase 6B hardening audit, the current repository was verified against the claims in `docs/saas/PHASE-6A-REMEDIATION-WALKTHROUGH.md`:

| Phase 6A Blocker | Remediated Component | Status | Empirical Evidence |
| :--- | :--- | :---: | :--- |
| **PERF-01 / PERF-02** | Bounded aggregates in `saleController.js` & `dashboardController.js` | **VERIFIED** | `Sale.count()` and `Sale.sum()` replace full table `findAll()`. |
| **SEC-01** | POS M-Pesa & Card pessimistic row locks | **VERIFIED** | `sequelize.transaction()` with `PendingPayment.findOne({ lock: t.LOCK.UPDATE })`. |
| **SCHEM-01** | Drop legacy `Sales_invoiceNumber_unique` | **VERIFIED** | Dropped in migration `20260918000000`. Composite tenant index preserved. |
| **AUTH-01** | Redis JTI revocation & status tombstones | **VERIFIED** | `tokenRevocationService.js` active; fail-open on Redis token blacklist, fail-closed on DB status. |
| **DATA-01** | Dual identity in `Invoices` & `Expenses` | **VERIFIED** | `employeeId CHAR(36)` and `organizationId INT` active with verified model associations. |
| **DEPL-01** | Production multi-stage Docker & Redis lock | **VERIFIED** | `backend/Dockerfile.prod`, `frontend/Dockerfile.prod`, `frontend/nginx.conf`, `billingScheduler.js` Redis lock. |
| **DR-01** | Database backup & restore verification | **VERIFIED** | `scripts/backup-db.js` and `scripts/restore-db.js` verified with SHA256 checksum and 39 tables restored. |
| **VULN-01** | Pruned `@ant-design/charts` and `sqlite3` | **VERIFIED** | 0 Critical vulnerabilities in backend; 310 redundant packages eliminated. |

---

## 4. 6B-01 — Dependency & Supply-Chain Hardening Audit

### Backend Production Dependencies (`npm audit --omit=dev`)
* **Total Dependencies:** 651 (217 prod, 435 dev)
* **Vulnerabilities Reported:** 0 Critical, 11 High, 7 Moderate (Total: 18)

| Package | Version | Path | Severity | Advisory / Risk | Fix Available | Breaking Change Risk |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| `validator` | `<=13.15.20` | `express-validator -> validator` | **HIGH** | GHSA-vghf-hv5q-vc2g (Incomplete filtering of special elements) | Yes (`13.15.22`) | Low (patch release) |
| `path-to-regexp` | `8.0.0 - 8.3.0` | `express -> path-to-regexp` | **HIGH** | GHSA-j3q9-mxjg-w52f (DoS via sequential optional groups) | Yes (`8.4.0`) | Low (patch release) |
| `sequelize` | `6.37.7` | `sequelize` (Direct) | **HIGH** | GHSA-6457-6jrx-69cr (SQL injection via JSON column cast type) | Yes (v6 latest / v7) | Medium (ORM regression risk) |
| `nodemailer` | `6.10.0` | `nodemailer` (Direct) | **MODERATE**| GHSA-cc9r-2j5m-2m83 (Recipient-domain validation bypass) | Yes (`10.0.10`) | High (major release bump) |
| `qs` | `<=6.15.3` | `express -> qs` | **MODERATE**| GHSA-4mjr-xmp4-gh2g (DoS via attacker-controlled isBuffer) | Yes (`6.16.0`) | Low |
| `uuid` | `<11.1.1` | `sequelize -> uuid` | **MODERATE**| GHSA-w5hq-g745-h8pq (Missing buffer bounds check) | Yes | Low |

### Frontend Production Dependencies (`npm audit --omit=dev`)
* **Total Dependencies:** 1163 (276 prod, 847 dev)
* **Vulnerabilities Reported:** 1 Critical, 15 High, 5 Moderate, 1 Low (Total: 22)

| Package | Version | Path | Severity | Advisory / Risk | Fix Available | Breaking Change Risk |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| `xlsx` | `<0.20.2` | `xlsx` (Direct) | **CRITICAL** | GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) & GHSA-5pgg-2g8v-p4x9 (ReDoS) | **NO** (SheetJS unmaintained on npm) | High (Requires migration to `exceljs` or SheetJS CDN) |
| `axios` | `1.7.9` | `axios` (Direct) | **HIGH** | GHSA-pf86-5x62-jrwf (Prototype pollution gadgets, SSRF bypass) | Yes (`1.18.0+`) | Low |
| `react-router-dom`| `6.22.0` | Direct & `@remix-run/router` | **HIGH** | GHSA-2w69-qvjg-hvjx (XSS via Open Redirects) | Yes (`6.30.4`) | Medium |
| `postcss` | `8.4.35`| Transitive | **HIGH** | GHSA-6g55-p6wh-862q (Arbitrary file read / sourceMappingURL) | Yes | Low |
| `browserslist` | `4.23.0`| Transitive | **HIGH** | GHSA-c83g-rgw3-j3cx (Unbounded memory growth OOM) | Yes | Low |
| `dompurify` | `3.0.9` | Transitive | **MODERATE**| GHSA-vhxf-7vqr-mrjg (XSS Sanitization Bypass) | Yes (`3.4.5+`) | Low |

### AI Service Dependencies (`ai_service/requirements.txt`)
* `sqlalchemy>=2.0.19` is explicitly declared in `requirements.txt` but **never imported or utilized anywhere** in `ai_service/src/`. This represents dead supply-chain attack surface and should be removed.

---

## 5. 6B-02 — Authentication & Session Resilience Audit

### Token Revocation & Password Lifecycle
1. **Password Change Gap:**  
   In `authController.changePassword`, when a user or employee updates their password, the controller performs `account.save()`, but **does not invoke `tokenRevocationService`**. Existing JWT tokens remain fully valid across all endpoints until expiration (up to 2 hours).
2. **Password Reset Gap:**  
   In `authController.resetPassword`, only the single-use reset token (`purpose: 'password_reset'`) is blacklisted. Any pre-existing access tokens belonging to the account are not revoked.
3. **Session Invalidation Architecture Recommendation:**  
   Introduce a `tokenVersion` or `passwordChangedAt` timestamp column in `Users` and `Employees`. When a password is changed, increment `tokenVersion`. Inject `tokenVersion` into issued JWTs and validate against Redis tombstone / database in `auth.js`.
4. **Redis Fail-Open vs Fail-Closed Behavior:**  
   - `isTokenRevoked(jti)`: **Fails open** if Redis is unreachable. A compromised token whose user is still marked active in MySQL can continue accessing the API during a Redis outage.  
   - `getUserStatus(id, isEmployee)`: **Fails closed** to MySQL fallback. If MySQL query fails, it returns `'inactive'`, ensuring deactivations cannot be bypassed during an outage.
   - *Audit Verdict:* Acceptable for high availability POS operations provided JWT lifetimes are capped at 1–2 hours. Moving to 15-minute access tokens with HTTP-only refresh tokens would eliminate the risk.

### Rate Limiting on Authentication
* In `backend/src/routes/auth.js:14`, `authLimiter` utilizes in-memory storage (`express-rate-limit` default). In multi-container Docker or Kubernetes deployments, the 10-attempt limit is not shared across backend replicas, enabling distributed credential stuffing.

---

## 6. 6B-03 — Payment Adversarial Security Audit

### Card Payment Verification Vulnerability (P0 - Blocker)
* **File:** `backend/src/routes/cardRoutes.js:89-138`
* **Defect:**  
  ```javascript
  const verificationResult = await cardPaymentService.verifyPayment(reference);
  if (!verificationResult.verified) { ... }
  // BUG: Does NOT verify verificationResult.amount === pendingPayment.amount
  // BUG: Does NOT verify verificationResult.currency === expected currency
  ```
* **Attack Scenario:**  
  1. Cashier rings up items worth 50,000 KES. POS initiates card payment (`PendingPayment` record created for 50,000 KES).
  2. Attacker initiates an independent card payment of 5 KES on Flutterwave and obtains gateway reference `FLW-12345`.
  3. Attacker posts `{ reference: 'FLW-12345' }` to `/api/card/verify`.
  4. Gateway returns `{ verified: true, amount: 5 }`.
  5. Controller confirms `pendingPayment`, executes `createSaleInternal`, and decrements 50,000 KES of inventory for 5 KES of settlement!
* **Remediation:**  
  Enforce strict decimal equality: `Number(verificationResult.amount) === Number(pendingPayment.amount)` and match currency.

### M-Pesa Callback Security Analysis
* **Verified:** Atomically wrapped in `sequelize.transaction()` with `PendingPayment.findOne({ lock: t.LOCK.UPDATE })`.
* **Verified:** Duplicate callbacks return `200 Callback already processed` without double sale creation or stock decrement.
* **Residual Risks:**
  - Token comparison `token !== expectedToken` uses variable-time equality instead of `crypto.timingSafeEqual`.
  - Amount validation `Number(amount) < Number(pendingPayment.amount)`: if `amount` is `NaN`, comparison evaluates to `false`, allowing bypass.

---

## 7. 6B-04 — Multi-Tenant Adversarial Isolation Audit

### Tenant Scoping Matrix

| Resource | Organization Scoping | Shop Scoping | Query Filter | IDOR / Oracle Risk |
| :--- | :---: | :---: | :--- | :---: |
| **Sales** | Via Shop | `where: { shopId }` | Enforced | **MEDIUM (403 vs 404 Oracle in Refunds)** |
| **Products** | `where: { organizationId }` | Global/Catalog | Enforced | LOW (Uniform 404) |
| **Inventory** | Via Product | `where: { shopId }` | Enforced | LOW (Uniform 404) |
| **Transfers** | `where: { organizationId }` | Source / Destination | Enforced | LOW (Ascending lock) |
| **Invoices** | `where: { organizationId, shopId }`| `where: { shopId }` | Enforced | LOW |
| **Expenses** | `where: { organizationId, shopId }`| `where: { shopId }` | Enforced | LOW |
| **Customers** | `where: { organizationId }` | N/A | Enforced | LOW |
| **Suppliers** | `where: { organizationId }` | N/A | Enforced | LOW |
| **AI Analytics** | `where: { organizationId }` | `where: { shopId }` | Enforced | LOW |

### Refund Cross-Shop Oracle Analysis (`saleController.js:1120-1129`)
```javascript
const sale = await Sale.findOne({ where: { id: saleId } });
if (!sale) return res.status(404).json({ error: 'Sale not found' });
if (sale.shopId !== shopId) return res.status(403).json({ error: 'Access denied: cross-shop refund' });
```
* **Impact:** An authenticated user from Shop 1 can iterate `saleId` from 1 to 100,000. Any sale belonging to Shop 2 returns `403`, while non-existent IDs return `404`. This leaks transaction volume and sales existence across all tenants.
* **Fix:** Change query to `where: { id: saleId, shopId }` and return a uniform `404 Sale not found`.

---

## 8. RBAC / Privilege Escalation Matrix

Server-side enforcement verified in `middleware/auth.js`, `middleware/requireOrgAdmin.js`, and controller hooks:

| Capability | Owner | Admin | Manager | Cashier | Server-Side Enforcement Point |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Organization Settings** | ALLOW | ALLOW | DENY | DENY | `requireOrgAdmin.js:31` |
| **Billing & Plans** | ALLOW | DENY | DENY | DENY | `billingRoutes.js:auth, checkRole(['admin'])` + `owner` check |
| **Branch Management** | ALLOW | ALLOW | DENY | DENY | `shopController.js:requireOrgAdmin` |
| **Shop Access Delegation** | ALLOW | ALLOW (Scoped)| DENY | DENY | `requireOrgAdmin.js:42-60` |
| **Product Master Catalog** | ALLOW | ALLOW | ALLOW | VIEW ONLY | `checkRole(['admin', 'manager'])` |
| **Inventory Adjustments** | ALLOW | ALLOW | ALLOW | DENY | `productController.js:updateStock` |
| **Stock Transfers** | ALLOW | ALLOW | ALLOW | DENY | `transferController.js:checkRole` |
| **POS Sales Checkout** | ALLOW | ALLOW | ALLOW | ALLOW | `saleController.js:createSale` |
| **Process Refunds** | ALLOW | ALLOW | ALLOW (Threshold)| APPROVAL REQ | `saleController.js:1134` (`maxUnapproved`) |
| **Financial Reports** | ALLOW | ALLOW | SHOP ONLY | DENY | `reportController.js:checkRole` |
| **AI Forecasts** | ALLOW | ALLOW | ALLOW | DENY | `aiProxy.js:requireActiveSubscription` |

* **Privilege Tampering Protection:**
  - Callers cannot elevate privileges via `req.body.role` or `req.body.organizationId`; claims are extracted strictly from verified RS256 JWTs.
  - Position promotions/demotions in `employeeController.js` synchronize `OrganizationMembership.orgRole` atomically.

---

## 9. Database Integrity & Schema Audit

### Live Database Inspection (`zana_pos`)
* **NULL Tenant Check:**
  - `Shops.organizationId`: 0 NULL
  - `Products.organizationId`: 0 NULL
  - `Categories.organizationId`: 0 NULL
  - `Customers.organizationId`: 0 NULL
  - `Suppliers.organizationId`: 0 NULL
  - `StockMovements.organizationId`: 0 NULL
  - `StockTransfers.organizationId`: 0 NULL
  - `SubscriptionInvoices.organizationId`: 0 NULL
  - `Subscriptions.organizationId`: 0 NULL
  - `OrganizationMemberships.organizationId`: 0 NULL
  - `Invoices.organizationId`: 0 NULL
  - `Expenses.organizationId`: 0 NULL
* **NULL Shop Check:**
  - `Inventory.shopId`: 0 NULL
  - `Sales.shopId`: 0 NULL
  - `SaleItems.shopId`: 0 NULL
  - `SalePayments.shopId`: 0 NULL
  - `SaleRefunds.shopId`: 0 NULL
  - `Invoices.shopId`: 0 NULL
  - `Expenses.shopId`: 0 NULL
  - `Employees.shopId`: 0 NULL
* **Missing Index Confirmation (`INDX-01`):**
  - `SHOW INDEX FROM Employees WHERE Column_name = 'shopId'`: **0 Indexes**
  - `SHOW INDEX FROM SaleRefunds WHERE Column_name = 'shopId'`: **0 Indexes**
  - `SHOW INDEX FROM Users WHERE Column_name = 'shopId'`: **0 Indexes**
* **Migration Directory Cleanliness (`MIGR-01`):**
  - 17 `.bak` backup migration files remain inside `backend/migrations/` (`add-product-id.js.bak`, `cleanup-columns.js.bak`, etc.).

---

## 10. Concurrency & TOCTOU Audit

| Flow | Concurrency Protection | Locking Primitive | Status |
| :--- | :--- | :--- | :---: |
| **POS Sales Checkout** | Inventory Row Locks | `t.LOCK.UPDATE` on `Inventory` | **SAFE** |
| **POS M-Pesa Callback** | Pessimistic Row Lock | `t.LOCK.UPDATE` on `PendingPayment` | **SAFE** |
| **POS Card Verification** | Pessimistic Row Lock | `t.LOCK.UPDATE` on `PendingPayment` | **SAFE** |
| **Inter-Shop Stock Transfer** | Deterministic Ascending Order Lock | `t.LOCK.UPDATE` on `Shops` & `Inventory` | **SAFE** |
| **Subscription Renewal** | Distributed Redis Lock + Row Lock | `SET NX EX` + `t.LOCK.UPDATE` | **SAFE** |
| **Branch Creation Quota** | Atomic Row Lock | `t.LOCK.UPDATE` on `Organization` | **SAFE** |
| **Employee Creation Quota** | Atomic Row Lock | `t.LOCK.UPDATE` on `Organization` | **SAFE** |
| **Frontend Double-Click** | None | Client-side debouncing absent | **AT RISK** |

---

## 11. Financial Integrity & State Machine

```text
[ PendingPayment ]
       │
       ├──( result=0 & amount_valid )──► [ confirmed ] ──► [ Sale Created + Stock Decremented ]
       │
       └──( result!=0 || amount_short )─► [ failed ]    ──► [ No Sale + No Stock Decrement ]
```

* **Invariants:**
  - `SalePayments.sum(amount)` must equal `Sale.total`.
  - Replayed callbacks cannot confirm an already `confirmed` or `failed` payment.
  - Refunds reverse inventory when `disposition == 'restock'`, while write-offs record `damaged_writeoff` movements without restoring inventory.
* **Gap Identified:** `cardRoutes.js` fails to assert `amount >= pendingPayment.amount` before executing transition to `confirmed`.

---

## 12. Subscription State Machine Audit

Consolidated across `entitlementService.js`, `billingService.js`, and `subscriptionEnforcement.js`:
* `trialing`: 14-day trial period; feature-complete.
* `active`: Paid subscription; enforced against plan quotas (`maxShops`, `maxEmployees`, `ai_features`).
* `past_due`: 7-day grace period; operational access maintained with billing alerts.
* `suspended`: Operational lockdown; all mutations blocked (`403 ORGANIZATION_SUSPENDED`), non-owner logins blocked, owner billing recovery permitted.
* `canceled`: Active until `currentPeriodEnd`, followed by automated suspension.
* `grandfathered`: Permanent immunity against expiration.
* *Audit Verdict:* **100% Coherent.** Tested across 28 unit/integration tests (`tests/phase5SubscriptionLifecycle.test.js`).

---

## 13. AI Security & Isolation Audit

* **Stateless Compute:** FastAPI Python service has zero database credentials. Receives sanitized time-series arrays over internal HTTP bridge.
* **Inter-Service Authentication:** Verified RS256 JWT validation in FastAPI middleware.
* **Residual Gaps (`AI-01`):**
  - `aiProxy.js:18` uses in-memory `NodeCache` (`forecastCache`). Multiple instances fail to share cached forecast models.
  - `aiRateLimiter` in `aiProxy.js:48` is in-memory, permitting distributed rate limit bypass.

---

## 14. Rate Limiting & Abuse Prevention

| Endpoint Group | Current Limiter | Storage Backend | Multi-Node Resilience |
| :--- | :--- | :--- | :---: |
| `/api/auth/*` | 10 req / 15 min | In-Memory (Node process) | **FRAGMENTED** |
| `/api/ai/*` | 20 req / 15 min | In-Memory (Node process) | **FRAGMENTED** |
| `/api/sales` | None | N/A | **MISSING** |
| `/api/mpesa/*` | Default Express | N/A | **MISSING** |
| `/api/billing/*` | Default Express | N/A | **MISSING** |

* **Remediation:** Connect `express-rate-limit` to `rate-limit-redis` utilizing existing production Redis infrastructure.

---

## 15. Input Validation Audit

* **Express-Validator Coverage:** Registered across core mutation routes (`/api/auth`, `/api/products`, `/api/customers`, `/api/shops`).
* **Residual Risks:**
  - Several legacy controllers read directly from `req.body` without strict schema sanitization (e.g. `req.body.paymentMethod` in `saleController.js`).
  - Search query strings (`req.query.search`) pass into `Op.like` with `%${search}%` without escaping SQL wildcard characters (`%` and `_`).

---

## 16. Production Deployment & Orchestration Audit

* **`backend/Dockerfile.prod`:** Multi-stage Node 18 Alpine; runs as unprivileged user `node`; internal healthcheck configured.
* **`frontend/Dockerfile.prod`:** Multi-stage build (`node:18-alpine` builder $\to$ `nginx:1.27-alpine` runner).
* **`frontend/nginx.conf`:** Reverse proxies `/api/` to backend; security headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`) active.
* **`docker-compose.prod.yml`:**
  - Network isolation: Internal `zana-internal-net` prevents database and Redis ports from exposing to the host or internet.
  - Only port 80/443 exposed on frontend.
  - Redis runs with `--requirepass` and memory limit policies.
* **Scheduler Distributed Lock:** `billingScheduler.js` coordinates via Redis atomic key `lock:billing_scheduler_job` (TTL 300s).

---

## 17. Database Backups & Disaster Recovery Audit

* **Repository Verification:**
  - `scripts/backup-db.js`: Fully functional logical backup using `mysqldump` with `--single-transaction`, gzip compression, and SHA-256 checksum generation.
  - `scripts/restore-db.js`: Fully functional restore verification script. Tested live with 39 tables restored.
  - `docs/operations/DISASTER-RECOVERY.md`: Comprehensive runbook documenting RTO (< 30 min) and RPO targets.
* **Production Gap:**
  - Continuous binary log (binlog) archival to offsite cloud storage (S3/R2) is documented as a target, but has not yet been codified as an automated repository cron/worker script. Currently, RPO equals the manual backup interval.

---

## 18. POS Terminal Resilience Audit

* **Dependency on Continuous Connectivity:**
  - The POS frontend (`frontend/src/pages/POSPage.tsx`, `cashierAPI.js`) performs synchronous HTTP calls for every sale.
  - If internet drops during checkout, the UI displays a network error. Cashiers cannot ring up offline sales.
* **Client-Side Idempotency (`POS-01`):**
  - `cashierAPI.createSale` does not generate a client-side UUID `Idempotency-Key`. Double-clicks create duplicate orders.
* **Recommendation:**
  - Phase 6B: Implement client-side UUID `Idempotency-Key` generation and button debouncing.
  - Phase 7: Implement offline IndexedDB sale queueing with Service Worker sync.

---

## 19. Frontend Production Security Audit

* **Token Storage:** JWT tokens are stored in `localStorage`. XSS vulnerabilities in packages like `xlsx` could theoretically expose tokens.
* **Build Verification:** `tsc && vite build` compiles cleanly in 1m 49s with **0 errors**.
* **Chunk Size Warning:** Several bundles (`index-919fcec5.js`, `chart-vendor-0d7fb67f.js`, `xlsx-6ed613d4.js`) exceed 500 kB after minification and should be optimized.

---

## 20. Observability & APM Audit

* **Logging Stack:** Morgan HTTP logging and Winston structured daily-rotating file logs.
* **Redaction:** `requestLogger.js` redacts passwords and secrets.
* **Gaps:**
  - No distributed correlation ID (`x-request-id`) header generated or propagated to track requests across frontend, backend, and AI service.
  - No centralized APM / error tracking agent (e.g. Sentry) integrated.

---

## 21. Test Coverage & Empirical Matrix

Automated testing execution via `count_tests.cjs`:

```text
========================================
GRAND TOTAL: 133 / 133 passed (100%)
========================================
```

| Test Suite File | Domain / Functionality | Assertions Passed | Pass Rate |
| :--- | :--- | :---: | :---: |
| `tests/phase6aReleaseBlockers.test.js` | Concurrency, Aggregates, Schema, Revocation, Dual ID | **13 / 13** | 100% |
| `tests/phase5SubscriptionLifecycle.test.js`| Subscription State Machine, Enforcement, Quotas | **28 / 28** | 100% |
| `tests/billingEndpoints.test.js` | Invoices, Checkouts, STK Push, Card Verification | **10 / 10** | 100% |
| `tests/billingRenewal.test.js` | Period Rollover, Invariant Renewal, Downgrades | **14 / 14** | 100% |
| `tests/subphase6c.test.js` | Plans, Feature Gates, Grandfathered Immunity | **6 / 6** | 100% |
| `tests/phase4ProductInventorySecurity.test.js` | Catalog Isolation, Composite Uniques, Movements | **12 / 12** | 100% |
| `tests/phase4TransferIdempotency.test.js`| Transfer Idempotency, Concurrency, Deadlock Free | **6 / 6** | 100% |
| `tests/phase3UserTenantSecurity.test.js`| Multi-Tenant Users, Quotas, Role Synchronization | **16 / 16** | 100% |
| `tests/phase1.test.js` | POS Checkout, Cart Validation, Stock Decrement | **8 / 8** | 100% |
| `tests/phase2.test.js` | Multi-Payment, Refunds, Customer Loyalty | **20 / 20** | 100% |

---

## 22. Finding Matrix

| ID | Severity | Area | Component / Endpoint | Description | Recommended Remediation |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **FIN-01** | **P0** | Payment Security | `cardRoutes.js:89-138` | `/api/card/verify` confirms payment without checking `verificationResult.amount >= pendingPayment.amount` or currency. | Add strict amount and currency validation inside transaction lock. |
| **AUTH-02**| **P1** | Authentication | `authController.js:409-455` | Password change does not invalidate or revoke existing active JWTs; attacker retains access for 2 hours. | Invalidate user session tokens upon password change via token versioning or Redis blacklist. |
| **AUTH-03**| **P1** | Authentication | `authController.js:305-327` | Password reset does not revoke existing active session tokens for the account. | Revoke all prior account tokens upon password reset completion. |
| **POS-01** | **P1** | POS Resilience | `frontend/src/services/cashierAPI.js:35` | Frontend does not generate or attach `Idempotency-Key` headers on sale checkouts. | Generate UUID `Idempotency-Key` in frontend state prior to checkout request dispatch. |
| **VULN-02**| **P1** | Supply Chain | `frontend/package.json` | `xlsx` dependency contains unpatched Prototype Pollution and ReDoS vulnerabilities. | Migrate from `xlsx` to secure alternative (`exceljs`) or implement secure isolated worker. |
| **ORAC-01**| **P2** | Tenant Isolation | `saleController.js:1120-1129` | `processRefund` returns 404 for non-existent sale vs 403 for cross-shop sale, leaking sale existence. | Query `where: { id: saleId, shopId }` and return uniform 404. |
| **INDX-01**| **P2** | Database Performance | MySQL Schema | Foreign keys `Employees.shopId`, `SaleRefunds.shopId`, `Users.shopId` lack indexes. | Execute migration adding indexes on `shopId` for these three tables. |
| **AI-01**  | **P2** | AI Architecture | `aiProxy.js:18, 48` | AI proxy uses in-memory `NodeCache` and in-memory rate limiting instead of Redis. | Migrate AI caching and rate limiting to Redis store. |
| **RATE-01**| **P2** | Abuse Prevention | `backend/src/routes/auth.js:14` | Authentication rate limiter uses in-memory store; ineffective across clustered containers. | Connect `express-rate-limit` to `rate-limit-redis`. |
| **OBS-01** | **P2** | Observability | Backend middleware | Absence of correlation ID (`x-request-id`) across service requests. | Add correlation ID middleware generating and propagating `x-request-id`. |
| **MIGR-01**| **P3** | Migration Hygiene | `backend/migrations/*.bak` | 17 `.bak` backup script files exist inside `backend/migrations/`. | Move all `.bak` files to dedicated archive directory `backend/migrations/archive/`. |
| **AI-02**  | **P3** | Supply Chain | `ai_service/requirements.txt` | Unused `sqlalchemy` dependency declared in AI service requirements. | Remove `sqlalchemy` from `requirements.txt`. |

---

## 23. Risk Register

| Risk Event | Likelihood | Impact | Severity | Current Mitigation | Planned Phase 6B Remediation |
| :--- | :---: | :---: | :---: | :--- | :--- |
| Underpaid Card Payment Fraud | MEDIUM | CRITICAL | **P0** | Row locking exists, but amount check is missing | Strict verification of amount and currency in `cardRoutes.js` |
| Compromised Token Post-Password-Reset | MEDIUM | HIGH | **P1** | None (tokens valid for 2h) | Account token invalidation upon password update |
| Duplicate POS Checkout Invoices | HIGH | HIGH | **P1** | Backend index exists, frontend key absent | Client-side UUID `Idempotency-Key` and button debouncing |
| Supply-Chain Exploit via `xlsx` | LOW | HIGH | **P1** | Build passing, client-side execution | Replace `xlsx` with `exceljs` |
| Cross-Tenant Transaction Enumeration | MEDIUM | MEDIUM | **P2** | Cross-shop mutations blocked | Uniform 404 on refund sale lookup |
| Database Performance Degradation | HIGH | MEDIUM | **P2** | Database aggregates implemented | Add missing `shopId` indexes (`INDX-01`) |
| Clustered Rate Limit Bypass | HIGH | MEDIUM | **P2** | In-memory limiter | Migrate rate limiters to Redis store |

---

## 24. Production Readiness Scorecard

| Domain | Readiness Status | Empirical Blocker / Verification Evidence |
| :--- | :---: | :--- |
| **Dependency & Supply Chain** | **REQUIRES REMEDIATION** | `xlsx` critical vulnerability in frontend; `validator` and `path-to-regexp` high CVEs in backend. |
| **Authentication & Sessions** | **REQUIRES REMEDIATION** | Password changes do not invalidate existing active JWT tokens (`AUTH-02`). |
| **Payment Adversarial Security** | **REQUIRES REMEDIATION** | Missing amount/currency check on card verification (`FIN-01`). |
| **Multi-Tenant Isolation & RBAC** | **READY WITH CONDITIONS** | Core tenant isolation verified; 403 vs 404 ID oracle in `processRefund` (`ORAC-01`). |
| **Database Integrity & Indexing** | **READY WITH CONDITIONS** | Zero NULL tenant columns verified; missing `shopId` foreign key indexes (`INDX-01`). |
| **POS Terminal Resilience** | **REQUIRES REMEDIATION** | Frontend lacks client-side idempotency keys and double-click debouncing (`POS-01`). |
| **Deployment & Containerization** | **VERIFIED** | Non-root production Dockerfiles, isolated internal network, and Redis scheduler lock verified. |
| **Disaster Recovery** | **VERIFIED** | Logical backup and restore scripts verified on live MySQL database with 39 tables restored. |
| **Observability & Tracing** | **READY WITH CONDITIONS** | Morgan/Winston logs active; lacks distributed `x-request-id` correlation. |
| **Subscription & Quota Engine** | **VERIFIED** | 28/28 passing tests; state transitions and quota enforcement fully coherent. |

---

## 25. Recommended Phase 6B Remediation Roadmap

Upon human authorization, Phase 6B should execute in six controlled, zero-regression sub-phases:

### Sub-Phase 6B-01: Payment & Financial Adversarial Hardening (P0 Blocker)
* **Objective:** Close card verification amount/currency bypass (`FIN-01`) and harden M-Pesa token timing comparisons.
* **Files:** `backend/src/routes/cardRoutes.js`, `backend/src/routes/mpesaRoutes.js`.
* **Tests:** Add adversarial payment tests verifying rejection of underpaid card verification and invalid M-Pesa tokens.

### Sub-Phase 6B-02: Authentication & Session Invalidation Hardening (P1 Blocker)
* **Objective:** Invalidate active sessions upon password change and password reset (`AUTH-02`, `AUTH-03`).
* **Files:** `backend/src/controllers/authController.js`, `backend/src/services/tokenRevocationService.js`, `backend/src/middleware/auth.js`.
* **Tests:** Unit tests verifying immediate token rejection following password change or reset.

### Sub-Phase 6B-03: POS Resilience & Client Idempotency (P1 Blocker)
* **Objective:** Generate client-side UUID `Idempotency-Key` on checkout and implement button debouncing (`POS-01`).
* **Files:** `frontend/src/services/cashierAPI.js`, `frontend/src/pages/POSPage.tsx` (or checkout modal).
* **Tests:** Verify idempotency key generation and backend response deduplication.

### Sub-Phase 6B-04: Database Indexing & Migration Hygiene (P2)
* **Objective:** Add missing indexes on `Employees.shopId`, `SaleRefunds.shopId`, `Users.shopId` (`INDX-01`) and archive 17 `.bak` files (`MIGR-01`).
* **Files:** `backend/migrations/20260918120000-add-missing-foreign-key-indexes.js`, `backend/migrations/archive/`.
* **Tests:** Verify index existence via `SHOW INDEX` and test query execution plans.

### Sub-Phase 6B-05: Tenant Isolation & ID Oracle Elimination (P2)
* **Objective:** Normalize `processRefund` to query `where: { id: saleId, shopId }` and return uniform 404 (`ORAC-01`).
* **Files:** `backend/src/controllers/saleController.js`.
* **Tests:** Verify uniform 404 on non-existent and cross-shop refund requests.

### Sub-Phase 6B-06: Operational Reliability & Supply Chain Cleanup (P2)
* **Objective:** Migrate AI cache and rate limiters to Redis (`AI-01`, `RATE-01`), add `x-request-id` correlation (`OBS-01`), remove unused `sqlalchemy` from `ai_service/requirements.txt` (`AI-02`), and evaluate frontend `xlsx` replacement (`VULN-02`).
* **Files:** `backend/src/routes/aiProxy.js`, `backend/src/routes/auth.js`, `backend/src/middleware/correlationId.js`, `ai_service/requirements.txt`.
* **Tests:** Multi-instance rate limit tests and correlation header propagation verification.

---

## 26. Audit Verification & Hard Stop Confirmation

In compliance with the Phase 6B operating directive:
* **No application code was modified.**
* **No controllers, services, middleware, models, or routes were modified.**
* **No database migrations were created or executed.**
* **No frontend components were modified.**
* **All 133 automated tests remain passing (100%).**
* **Frontend production build remains passing (0 errors).**
* **Git working tree is 100% clean.**

```text
git status:
On branch master
Your branch is up to date with 'origin/master'.
nothing to commit, working tree clean
```
