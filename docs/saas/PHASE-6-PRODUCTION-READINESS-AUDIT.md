# Zana POS — Phase 6 Production Readiness & SaaS Hardening Audit

**Date:** September 18, 2026  
**Repository:** `https://github.com/Warrenchris/zena-pos.git`  
**Audit Type:** Production Readiness, SaaS Multi-Tenant Architecture & Resilience Audit (Read-Only — Hard Stop)  
**Author:** Senior Staff Security & Production Infrastructure Auditor  
**Status:** Audit Complete — Awaiting Human Review and Release Decision  

---

## 1. Executive Summary

Zana POS has achieved substantial engineering milestones through Phases 1 through 5. Core multi-tenant tenant boundaries (`Organizations`), branch scoping (`Shops`), relational schema migrations, subscription lifecycle modeling (`Subscriptions`, `Plans`), inter-branch inventory transfers with idempotency, and interactive billing checkout have been built, verified, and backed by 119 automated regression tests.

However, a production readiness audit examining the live system against commercial-grade SaaS, multi-tenant resilience, horizontal scalability, and cybersecurity standards reveals **critical architectural, concurrency, performance, and operational bottlenecks** that must be resolved prior to general production release.

Most crucially:
1. **Unbounded Database Queries in Production Hot Paths (P0 - BLOCKER):** Critical dashboard and analytics endpoints execute full unpaginated `Sale.findAll()` queries (e.g. `saleController.js:857` loads every sale in shop history into Node memory just to log array length), creating immediate fatal Out-of-Memory (OOM) crash risks under real-world transaction volumes.
2. **Missing Concurrency Locks on POS Payment Callbacks (P0 - BLOCKER):** While SaaS billing webhooks enforce pessimistic row locking, POS M-Pesa callbacks (`/api/mpesa/callback`) and card verification (`/api/card/verify`) execute `PendingPayment` lookups outside transactions without row locks. Concurrent webhook retries or rapid client double-clicks can create duplicate sales and double-decrement inventory.
3. **Absence of Token Revocation & Session Invalidation (P1 - BLOCKER):** 2-hour RS256 JWTs operate completely statelessly with no token revocation blocklist or database session check in `auth.js`. Deactivating an employee, terminating a user, or suspending an organization leaves existing tokens fully privileged for up to 120 minutes.
4. **Dual Identity Schema Fractures (P1 - BLOCKER):** The legacy split between `Users` (auto-increment INTEGER) and `Employees` (UUID CHAR(36)) has left modules like `Invoices` and `Expenses` with integer-only `userId` columns. Cashiers logging in as employees cannot create invoices or record expenses without encountering schema type mismatch failures.
5. **Development-Only Deployment Configuration (P1 - BLOCKER):** Dockerfiles run development commands (`nodemon`, `npm run dev -- --host 0.0.0.0`), depend on host bind-mounts, run an unauthenticated Redis server, and run scheduled background billing workers directly within the web process without multi-instance coordination.
6. **Zero Disaster Recovery & Automated Backup Procedures (P1 - BLOCKER):** No automated database dump, retention policy, WAL/binlog archiving, or disaster recovery runbook exists.

---

## 2. Production Readiness Scorecard

| Domain | Readiness Status | Summary Rationale |
| :--- | :--- | :--- |
| **Authentication & Session Security** | **REQUIRES REMEDIATION** | Stateless 2h JWTs without revocation, no account lockout, reusable password reset tokens. |
| **Tenant Isolation & RBAC** | **READY WITH CONDITIONS** | Core models isolated; `Invoices` and `Expenses` lack `organizationId`; ID oracle in refunds. |
| **Subscription & Entitlement Engine** | **READY** | Effective trial evaluation, automated grace suspension, and grandfathered immunity verified (28/28 passed). |
| **Financial & Webhook Integrity** | **REQUIRES REMEDIATION** | POS M-Pesa & Card callbacks lack row locks; potential duplicate sale creation on race conditions. |
| **Inventory & Stock Management** | **READY WITH CONDITIONS** | Atomic transfer locking verified; frontend POS checkout lacks client-side idempotency keys. |
| **AI Isolation & Governance** | **READY WITH CONDITIONS** | Stateless FastAPI compute; in-memory cache and rate limits must migrate to Redis for multi-node scale. |
| **Database Integrity & Schema** | **READY WITH CONDITIONS** | Foreign keys and constraints clean; legacy global unique index on `Sales(invoiceNumber)` must be dropped. |
| **Database Query Performance** | **REQUIRES REMEDIATION** | Fatal unbounded queries loading all historical sales into memory (`saleController.js`, `dashboardController.js`). |
| **Concurrency & Race Conditions** | **REQUIRES REMEDIATION** | POS webhook handling unprotected by transactions/locks; TOCTOU vulnerability on duplicate callbacks. |
| **Cache Safety & Invalidation** | **READY WITH CONDITIONS** | Redis product caching clean; AI cache uses in-memory `NodeCache` instead of Redis. |
| **Deployment & Infrastructure** | **REQUIRES REMEDIATION** | Dev Dockerfiles (`npm run dev`), unauthenticated Redis, missing multi-stage production builds. |
| **Migration Safety & Integrity** | **READY WITH CONDITIONS** | 87 migrations migrate cleanly; 14 `.bak` files in migration directory pose contamination risk. |
| **Observability & Audit Trails** | **READY WITH CONDITIONS** | Morgan/Winston logging active; lacks correlation IDs (`x-request-id`) and centralized APM/Sentry. |
| **Backup & Disaster Recovery** | **REQUIRES REMEDIATION** | Zero automated backup scripts, no WAL/binlog archiving, and no documented disaster recovery runbook. |
| **Frontend Production Readiness** | **READY WITH CONDITIONS** | Production build passes (0 errors); lacks offline POS queuing and double-click submission debouncing. |
| **Dependency Security** | **REQUIRES REMEDIATION** | 37 vulnerabilities reported by `npm audit` (1 critical, 22 high in `nodemailer`, `tar`, `sequelize`, etc.). |

---

## 3. Critical Findings Matrix

| Finding ID | Severity | Classification | Domain | Component | Root Cause Summary | Recommended Remediation |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **SEC-01** | **P0** | **BLOCKER** | Concurrency / Financial | `mpesaRoutes.js:71-120`, `cardRoutes.js:71-95` | POS payment callback and verification update `PendingPayment` and call `createSaleInternal` without a database transaction or `t.LOCK.UPDATE`. Concurrent webhook deliveries create duplicate sales and double-decrement inventory. | Enclose callback processing in `sequelize.transaction()` with pessimistic row lock `t.LOCK.UPDATE` on `PendingPayment`. |
| **PERF-01** | **P0** | **BLOCKER** | Database Performance | `saleController.js:857` | `getSalesStatistics` executes `Sale.findAll({ where: { shopId } })` without a `limit` or column projection, pulling all sales in history into Node memory just to log length. Guarantees Node OOM crash at scale. | Remove unbounded `findAll()` and replace with SQL aggregate `Sale.count()` and `Sale.sum()`. |
| **PERF-02** | **P0** | **BLOCKER** | Database Performance | `dashboardController.js:38-75` | `getStats` fetches all sales in date range including all `SaleItem` rows into memory, performing `.reduce()` in Javascript to calculate total income. Destroys database and network I/O. | Refactor to database-level aggregation (`SELECT COUNT(*), SUM(total) FROM Sales WHERE ...`). |
| **AUTH-01** | **P1** | **BLOCKER** | Authentication | `middleware/auth.js`, `authController.js` | 2-hour JWTs are verified statelessly. Deactivating a user, employee, or organization does not revoke existing JWTs. Terminated employees retain access for up to 120 minutes. | Add token revocation blacklist in Redis (`revoked_tokens:<jti>`) or check user/org active status in Redis on sensitive requests. |
| **DATA-01** | **P1** | **BLOCKER** | Data Model / Schema | `Invoice.js:20`, `Expense.js:57`, `models/index.js` | `Invoices` and `Expenses` define `userId` as `INTEGER`, with no `employeeId` column or association. When cashiers (UUID `Employee`) create invoices or expenses, queries fail with SQL type mismatches. | Add `employeeId CHAR(36)` to `Invoices` and `Expenses`, updating controllers to attribute correctly. |
| **SCHEM-01** | **P1** | **BLOCKER** | Database Schema | MySQL `Sales` table index | A legacy global unique index `Sales_invoiceNumber_unique` on `Sales(invoiceNumber)` persists in MySQL alongside composite index `unique_sales_shop_invoice_number`. Inter-tenant invoice collisions fail sale creation. | Execute migration to drop legacy global index `Sales_invoiceNumber_unique`. |
| **DEPL-01** | **P1** | **BLOCKER** | Infrastructure | `backend/Dockerfile`, `frontend/Dockerfile` | Production containers execute development commands (`npm run dev`, `nodemon`), mount local files, and run unauthenticated Redis on standard port. | Implement production Dockerfiles (multi-stage Vite->Nginx for frontend, `npm start` with pruned node_modules for backend). |
| **DR-01** | **P1** | **BLOCKER** | Disaster Recovery | Repository operations | No automated backup schedule, retention policy, Point-in-Time-Recovery (PITR), or recovery verification exists. | Implement daily automated MySQL logical dumps (`mysqldump`) with S3 upload and retention lifecycle. |
| **VULN-01** | **P1** | **BLOCKER** | Dependency Security | `backend/package.json` | 37 package vulnerabilities (1 critical, 22 high) including remote code execution / DoS vulnerabilities in `tar`, `nodemailer`, `qs`, and `sequelize`. | Execute selective `npm audit fix` and regression verify to patch high/critical vulnerabilities. |
| **POS-01** | **P2** | **NON-BLOCKER** | POS Resilience | `frontend/src/services/cashierAPI.js:35` | Frontend does not generate or attach client-side `Idempotency-Key` UUIDs on checkout requests. Network retries cause duplicate sales. | Generate UUID `Idempotency-Key` in frontend state prior to checkout request dispatch. |
| **AI-01** | **P2** | **NON-BLOCKER** | AI Architecture | `aiProxy.js:18, 48` | AI proxy uses in-memory `NodeCache` and in-memory `express-rate-limit`. In multi-instance deployments, caching and rate limits are fragmented per replica. | Migrate AI prediction caching and rate limiting to centralized Redis store. |
| **SEC-02** | **P2** | **NON-BLOCKER** | Authentication | `authController.js:273` | Password reset tokens are signed without a `purpose: 'password_reset'` claim and are not invalidated upon password reset, allowing reuse within 15 minutes. | Add explicit token purpose claim and invalidate reset token in Redis upon password update. |
| **INDX-01** | **P2** | **NON-BLOCKER** | Database Performance | MySQL Schema | Foreign key columns `Employees.shopId`, `SaleRefunds.shopId`, and `Users.shopId` lack indexes, causing table scans on shop-filtered queries. | Add migration creating indexes on `(shopId)` for `Employees`, `SaleRefunds`, and `Users`. |
| **MIGR-01** | **P3** | **NON-BLOCKER** | Migration Hygiene | `backend/migrations/*.bak` | 14 `.bak` backup script files exist inside `backend/migrations/`. Tooling scanning directory risks executing unversioned scripts. | Move all `.bak` files out of `backend/migrations/` into a dedicated archive directory. |

---

## 4. Authentication & Authorization

### JWT Architecture & Session Lifecycle
- **Algorithm & Keys:** RS256 asymmetric signing is properly configured using environment variables `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`.
- **Claims Structure:** `{ id, role, shopId, organizationId, isEmployee }`.
- **Token Lifetime:** Fixed at 2 hours (`process.env.JWT_EXPIRES_IN || '2h'`).
- **Gaps Identified:**
  1. **No Token Revocation Mechanism:** `middleware/auth.js` verifies the cryptographic signature with the RSA public key and checks `decoded.exp`. It **never checks** whether the issuing user, employee, or organization is still active, nor does it check a Redis token blocklist.
     - *Attack Scenario:* An employee is fired and marked `status: 'inactive'`. Their JWT remains valid for up to 120 minutes, allowing them to ring up unauthorized sales, issue refunds, or exfiltrate customer databases.
  2. **No Refresh Token Flow:** When the 2-hour token expires, the client must perform a full re-login. No secure HTTP-only refresh cookie or token rotation architecture exists.
  3. **No Account Lockout Protection:** `authController.login` does not track failed password attempts. An attacker can execute automated dictionary or brute-force attacks against any merchant email without triggering an account lockout.
  4. **Password Reset Token Reuse:** Password reset tokens generated in `authController.forgotPassword` are valid for 15 minutes. They lack a specific token purpose claim (e.g. `claim: { type: 'pwd_reset' }`) and are not revoked once `resetPassword` succeeds, allowing replay attacks within the 15-minute window.

### Dual Identity Coherence
- **Architectural Divergence:** The system operates two distinct identity tables:
  - `Users` (Integer `id`, typically organization owners and system administrators).
  - `Employees` (UUID `id`, typically store managers and cashiers).
- In `authController.login`, `User` is checked first, falling back to `Employee`. While `OrganizationMemberships` accommodates both via nullable `userId` and `employeeId` columns, downstream models and controllers frequently make erroneous assumptions (see Section 10).

---

## 5. Tenant Isolation Deep Audit

A full audit of all 39 database tables was conducted using `INFORMATION_SCHEMA` metadata inspection and live data integrity queries:

### Tenant Scoping by Model

| Model / Table | Organization Scoping | Shop Scoping | Isolation Mechanism | Risk Level |
| :--- | :---: | :---: | :--- | :---: |
| `Organizations` | Primary Tenant Root | N/A | Primary Key (`id`) | LOW |
| `Shops` | `organizationId NOT NULL` | N/A | FK + Row Lock on Quotas | LOW |
| `Subscriptions` | `organizationId NOT NULL` | N/A | UNIQUE FK (`organizationId`) | LOW |
| `SubscriptionInvoices` | `organizationId NOT NULL` | N/A | FK + Webhook Single-Use Token | LOW |
| `OrganizationMemberships`| `organizationId NOT NULL` | N/A | Composite UNIQUE (`orgId, userId/employeeId`) | LOW |
| `ShopAccess` | Inferred via Shop | `shopId NOT NULL` | Composite UNIQUE (`membershipId, shopId`) | LOW |
| `Products` | `organizationId NOT NULL` | `shopId NULL` | Composite UNIQUE (`organizationId, sku/barcode`) | LOW |
| `Categories` | `organizationId NOT NULL` | `shopId NOT NULL` | Composite UNIQUE (`organizationId, name`) + Auto-Hook | LOW |
| `Inventory` | Inferred via Product/Shop | `shopId NOT NULL` | Composite UNIQUE (`shopId, productId`) | LOW |
| `StockMovements` | `organizationId NOT NULL` | `shopId NOT NULL` | FK + Employee Attribution | LOW |
| `StockTransfers` | `organizationId NOT NULL` | `sourceShopId, destShopId` | Ascending Shop Row Lock + Idempotency | LOW |
| `Customers` | `organizationId NOT NULL` | `shopId NULL` | Scoped queries by `organizationId` | LOW |
| `Suppliers` | `organizationId NOT NULL` | `shopId NULL` | Scoped queries by `organizationId` | LOW |
| `Sales` | Inferred via Shop | `shopId NOT NULL` | `where: { shopId }` + Idempotency Key | LOW |
| `SaleItems` | Inferred via Shop | `shopId NOT NULL` | Scoped to parent `saleId` | LOW |
| `SalePayments` | Inferred via Shop | `shopId NOT NULL` | Scoped to parent `saleId` | LOW |
| `SaleRefunds` | Inferred via Shop | `shopId NOT NULL` | Scoped to parent `saleId` | LOW |
| `Invoices` | **NONE** | `shopId NOT NULL` | Scoped strictly to `shopId` | **MEDIUM** |
| `Expenses` | **NONE** | `shopId NOT NULL` | Scoped strictly to `shopId` | **MEDIUM** |

### IDOR & ID Oracle Finding
In `saleController.js:1115-1125` (`processRefund`):
```javascript
const sale = await Sale.findOne({ where: { id: saleId } });
if (!sale) return res.status(404).json({ error: 'Sale not found' });
if (sale.shopId !== shopId) return res.status(403).json({ error: 'Access denied: cross-shop refund' });
```
Querying without `shopId` and branching between 404 and 403 leaks cross-shop and cross-tenant sale IDs to malicious actors. It must be refactored to `where: { id: saleId, shopId }` to return a uniform 404.

---

## 6. Subscription & Billing

### Subscription State Machine Coherence
The subscription lifecycle has been thoroughly consolidated across `entitlementService.js`, `billingService.js`, `subscriptionEnforcement.js`, and `authController.js`:
- `trialing`: Full feature access; transitions dynamically to `past_due` upon `trialEndsAt` expiry within 7-day grace, and `suspended` thereafter.
- `active`: Normal access across all entitled features and quotas.
- `past_due`: Operational warning state during grace period; features remain entitled.
- `suspended`: Core operations (`/api/sales`, `/api/products`, `/api/transfers`, `/api/shops`, `/api/employees`) locked down with `403 ORGANIZATION_SUSPENDED`.
  - Non-owner employees blocked at login.
  - Owners retain login access and unrestricted `/api/billing/*` access to settle renewal invoices.
- `canceled`: Retains access until `currentPeriodEnd`, after which access is suspended.
- `grandfathered`: Permanent immunity against expiration cutoffs.

### Invoice Idempotency & Downgrade Protection
- `generateRenewalInvoice` enforces 1-hour idempotency, preventing duplicate renewal invoices.
- Target plan validation rejects inactive and grandfathered plan selection.
- Downgrades are checked against active branches and seats, returning `409 PLAN_RESOURCE_CONFLICT` if active resources exceed new limits.

---

## 7. Financial Integrity

### Payment State Machine

```text
       [ STK Push / Card Checkout ]
                    │
                    ▼
           ┌─────────────────┐
           │     pending     │
           └────────┬────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│     paid      │       │    failed     │
└───────┬───────┘       └───────────────┘
        │
        ▼
┌───────────────┐
│   refunded    │
│(full/partial) │
└───────────────┘
```

- **Forbidden Transitions:**
  - `paid -> paid`: Guarded on subscription invoices via idempotency check inside row lock.
  - `failed -> paid`: Permitted only if gateway confirms valid payment before timeout.
  - `refunded -> paid`: Irreversible state.

### POS vs Billing Divergence (P0 Blocker)
There is an inconsistency in payment processing between billing invoices and POS sales:
- **Billing Webhook (`billingRoutes.js:385-417`):**
  Uses `sequelize.transaction()` with `lock: t.LOCK.UPDATE`, checking `if (invoice.status === 'paid')` inside the lock before taking action.
- **POS Webhook (`mpesaRoutes.js:71-120` & `cardRoutes.js:71-95`):**
  Executes `PendingPayment.findOne` and `update` **outside a database transaction without row locks**. A concurrent callback duplicate executes `createSaleInternal` twice, creating duplicate sales records and double-decrementing stock.

---

## 8. Inventory & POS Integrity

### Stock Mutation Audit
- **Stock Movement Attribution:** Every inventory mutation (`createSaleInternal`, `processRefund`, `updateStock`, `applyStockReceipt`, `reverseStockReceipt`) records `employeeId` (UUID) or `userId` (INT) and `organizationId`.
- **Direct Stock Mutation Guard:** Direct mutation of `stockQuantity` via `PUT /api/products/:id` is ignored; all inventory adjustments must proceed through `PATCH /api/products/:id/stock` or transfers.
- **Inter-Branch Stock Transfers:** Implements deterministic row locking (ascending order of shop IDs) preventing database deadlocks.

### POS Terminal Resilience Gap
- **Missing Client-Side Idempotency Keys:** `frontend/src/services/cashierAPI.js` dispatches `POST /api/sales` without an `Idempotency-Key` header. If a cashier clicks the checkout button twice during a network delay, two separate sales with two separate invoice numbers are committed.
- **No Offline Queuing:** If POS terminals lose internet connectivity, the application displays an unhandled error and cannot cache or ring up sales offline.

---

## 9. AI Security & Data Isolation

### Architecture
- The AI Service is a Python FastAPI service running Prophet and Random Forest algorithms.
- **Compute-Only Design:** The AI service has **no direct database access**. It receives arrays of dates and values from the Node.js backend over an authenticated HTTP bridge (`aiClient.js`).
- **Tenant Data Isolation:** Data extraction is performed entirely within `backend/src/controllers/insightsController.js` and `orgInsightsController.js`, where queries are scoped strictly by `shopId` or `organizationId`.
- **Proxy Entitlement Guard:** All `/api/ai/forward/*` endpoints require `requireActiveSubscription()` and validate `ai_features` or `org_insights` plan entitlements.

### Architectural Risks
1. **In-Memory Cache Fragmentation:** `aiProxy.js` caches forecasts in `NodeCache` (process memory). In a multi-replica container deployment, cache hits are inconsistent across instances.
2. **In-Memory Rate Limiting:** `aiRateLimiter` uses in-memory tracking. Requests routed across multiple backend containers bypass the rate limit threshold.
3. **Hardcoded Admin Role:** `aiClient.js` hardcodes `role: 'admin'` when generating inter-service JWTs for FastAPI.

---

## 10. Database Integrity

### Schema Inspection Summary
- Total Tables: 39
- Foreign Keys Configured: 68
- Cascade Delete Rules: 28 (e.g. `Inventory -> Products`, `SaleItems -> Sales`)
- Set Null Delete Rules: 16 (e.g. `Sales.employeeId -> Employees`, `StockMovements.userId -> Users`)
- Restrict Delete Rules: Enforced on `Shops.organizationId`, `Categories.organizationId`, and `Subscriptions.planId`.

### Data Anomalies & Schema Drift
1. **Legacy Global Unique Index on Sales:**
   MySQL table `Sales` contains both:
   - `Sales_invoiceNumber_unique` on `(invoiceNumber)` (Global unique).
   - `unique_sales_shop_invoice_number` on `(shopId, invoiceNumber)` (Tenant composite).
   The global unique index is a legacy artifact from an early migration. If two independent tenants generate the same sequence format (e.g. `INV-001`), the second tenant's transaction fails with `Duplicate entry for key 'Sales_invoiceNumber_unique'`.
2. **Missing Employee Foreign Keys on Invoices & Expenses:**
   Neither `Invoices` nor `Expenses` contains an `employeeId` column. Both define `userId` as `INTEGER`. A cashier logging in as an employee cannot be recorded on these models.

---

## 11. Concurrency & TOCTOU Audit

| Operation | Atomic Transaction? | Row Lock? | Idempotency Key? | Concurrency Risk Rating |
| :--- | :---: | :---: | :---: | :---: |
| **Sale Creation (POS)** | Yes | Yes (Inventory) | Yes (Header optional) | LOW (Backend safe, frontend lacks key) |
| **POS M-Pesa Callback** | **NO** | **NO** | Token check only | **CRITICAL (P0 Blocker)** |
| **POS Card Verification** | **NO** | **NO** | Status check only | **CRITICAL (P0 Blocker)** |
| **Stock Transfer** | Yes | Yes (Ascending Shop) | Yes (Required) | SAFE |
| **Branch Creation** | Yes | Yes (`Organization` UPDATE) | Quota Check | SAFE |
| **Staff Creation** | Yes | Yes (`Organization` UPDATE) | Quota Check | SAFE |
| **Billing M-Pesa Webhook** | Yes | Yes (`SubscriptionInvoice`) | Idempotent No-Op | SAFE |
| **Billing Card Webhook** | Yes | Yes (`SubscriptionInvoice`) | Idempotent No-Op | SAFE |
| **Subscription Renewal** | Yes | Yes (`Organization` UPDATE) | 1-Hour Window | SAFE |
| **Branch Deactivation** | Yes | Yes (`Shop` UPDATE) | Sole Branch Guard | SAFE |

---

## 12. Database Performance & Scalability

### Fatal Unbounded Queries (PERF-01, PERF-02)
1. **`saleController.js:857`:**
   ```javascript
   const allSales = await Sale.findAll({ where: { shopId: req.user.shopId } });
   console.log('All sales for shopId', req.user.shopId, ':', allSales.length);
   ```
   In a store with 50,000 sales, every request to `/api/sales/statistics` fetches all 50,000 rows across MySQL, allocates memory, serializes to Javascript objects, and logs the length. This will exhaust heap memory and crash the server.
2. **`dashboardController.js:38-75`:**
   Fetches all sales and associated sale items for date ranges into memory to calculate sum and average ticket in Javascript rather than running SQL aggregation functions.

### Missing Indexes
The following high-frequency tenant foreign key columns lack database indexes:
- `Employees.shopId`
- `SaleRefunds.shopId`
- `Users.shopId`

---

## 13. Cache Safety & Invalidation

- **Redis Product Catalog Caching:**
  - Key format: `products:shop:<shopId>`.
  - Properly invalidated on `createProduct`, `updateProduct`, `deleteProduct`, `updateStock`, `createSale`, `processRefund`, and stock transfers.
  - Organization-wide products invalidate all member shops via `invalidateOrgProductCaches(organizationId)`.
- **Redis Entitlement Caching:**
  - Key format: `entitlements:org:<orgId>`.
  - 1-hour TTL. Invalidated on subscription renewal, cancellation, reactivation, branch creation/deactivation, and employee quota mutations.
- **Cache Leakage Check:**
  - Verified: No cache key mixes cross-tenant data.
  - Gap: AI forecast caching uses process-local `NodeCache` rather than Redis.

---

## 14. Infrastructure & Deployment

### Docker Environment Gaps
1. **Development Containers in Production File:**
   `docker-compose.yml` mounts source code directly (`./backend:/app`, `./frontend:/app`), runs `nodemon` and `npm run dev -- --host 0.0.0.0`, and uses `entrypoint` scripts that execute `npm install` on container launch.
2. **Unauthenticated Redis:**
   Redis runs on `redis:7-alpine` without a password or TLS encryption. Any container in `zana-network` can read or flush the cache.
3. **In-Process Background Scheduler:**
   The recurring billing scheduler (`billingScheduler.js`) runs via `setInterval` inside the Express process. If 3 backend replicas run behind a load balancer, 3 independent scheduler instances run simultaneously.

---

## 15. Migration Safety

### Verification of 87 Migrations
- All 87 migrations run sequentially without error on clean databases (`zana_pos_test`).
- Upgraded and fresh schemas reach identical table definitions.
- **Hygiene Risk:** 14 backup files (`*.js.bak`) remain located inside `backend/migrations/`. These should be moved to avoid accidental execution by migration runners.

---

## 16. Observability & Audit Trails

- **Logging Stack:** Morgan for HTTP access logs; Winston for structured application logs with daily rotation.
- **Redaction:** `requestLogger.js` redacts `password`, `token`, and secret credentials.
- **Observability Gaps:**
  - No correlation ID (`x-request-id`) is generated or propagated across backend, frontend, and AI services.
  - No APM or error monitoring service (e.g. Sentry, Datadog) is integrated; unhandled rejections are logged to local stdout/files only.

---

## 17. Backup & Disaster Recovery

- **Current State:** Completely absent.
- **Findings:**
  - No automated MySQL backup script (`mysqldump` or Percona XtraBackup).
  - No defined backup frequency or retention policy.
  - No Point-In-Time-Recovery (PITR) configuration via MySQL binary logging.
  - No documented recovery runbook.

---

## 18. Frontend Production Readiness

- **Build Verification:** `npm run build` (`tsc && vite build`) compiles with **0 errors**.
- **UX & Billing Flow:** Interactive renewal modal functions properly with Daraja STK Push polling and Flutterwave card checkout.
- **Gaps:**
  - Lack of client-side idempotency keys on checkout.
  - Lack of button debouncing to prevent rapid double-clicks on critical actions.
  - No offline support or Service Worker caching for cashier operations during internet outages.

---

## 19. Dependency Security Audit

A production dependency vulnerability audit (`npm audit --omit=dev`) in `backend` identified **37 vulnerabilities**:
- **1 Critical:** `tar` (Arbitrary file creation / overwrite via hardlink traversal).
- **22 High:**
  - `nodemailer` (SMTP command injection, CRLF injection, address parser DoS).
  - `path-to-regexp` (Regular expression denial of service).
  - `postcss` (Arbitrary file read / info disclosure via sourceMappingURL).
  - `sequelize` (SQL injection via JSON column cast type in specific dialect configs).
  - `serialize-javascript` (RCE via RegExp.flags and CPU exhaustion DoS).
  - `validator` (URL validation bypass).
- **11 Moderate / 3 Low:** `qs`, `uuid`, `nanoid`.

---

## 20. Test Coverage Gap Analysis

| Domain | Unit Tests | Integration Tests | Concurrency Tests | Tenant Isolation | Failure Recovery | Coverage Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Auth & Sessions** | PASS | PASS | MISSING | PASS | MISSING | Token revocation & lockout untested |
| **RBAC** | PASS | PASS | N/A | PASS | N/A | High coverage |
| **Sales & POS** | PASS | PASS | MISSING | PASS | MISSING | Webhook concurrency untested |
| **Inventory** | PASS | PASS | PASS | PASS | PASS | Comprehensive |
| **Stock Transfers**| PASS | PASS | PASS | PASS | PASS | Comprehensive |
| **Billing & Plans**| PASS | PASS | PASS | PASS | PASS | Comprehensive |
| **AI Proxy** | PASS | PASS | N/A | PASS | MISSING | Upstream failure recovery untested |
| **Invoices & Expense**| MISSING | MISSING | MISSING | MISSING | MISSING | **Complete Test Blindspot** |

---

## 21. Production Data Findings

Inspection of live database `zana_pos` confirms:
- 0 NULL `organizationId` values across tenant-partitioned tables (`Shops`, `Products`, `Categories`, `StockMovements`, `StockTransfers`, `SubscriptionInvoices`).
- 0 orphaned shops, products, inventory, memberships, or subscriptions.
- 0 cross-tenant `ShopAccess` assignments (all member shops strictly match organization IDs).
- Clean status parity across existing organizations and subscriptions.

---

## 22. Scale & Capacity Review

| Dimension | Theoretical Limit (Current Architecture) | Bottleneck Factor |
| :--- | :--- | :--- |
| **Organizations** | ~500 concurrent active orgs | In-memory rate limiting and scheduler overhead |
| **Shops per Org** | ~50 shops | Unindexed foreign keys and serial loops in delegation |
| **Products per Shop** | ~25,000 SKUs | Redis memory and unpaginated product scans in insights |
| **Daily Sales Volume** | ~2,000 sales / shop | **PERF-01 and PERF-02 unbounded queries will crash server** |
| **Concurrent POS Terminals** | ~50 checkout requests / sec | Webhook race conditions without row locks |

---

## 23. Remediation Roadmap

```text
Phase 6A: Release Blockers (Immediate Pre-Launch Hardening)
├── 1. Fix PERF-01 & PERF-02: Eliminate unbounded findAll() in sales & dashboard controllers
├── 2. Fix SEC-01: Wrap POS M-Pesa & Card callbacks in transactions with t.LOCK.UPDATE
├── 3. Fix SCHEM-01: Drop legacy global unique index Sales_invoiceNumber_unique
├── 4. Fix AUTH-01: Implement Redis-backed token revocation / active status check
├── 5. Fix DATA-01: Add employeeId to Invoices and Expenses schema
├── 6. Fix DEPL-01: Create production Dockerfiles (multi-stage Vite->Nginx & pruned Node)
├── 7. Fix DR-01: Script and document automated daily MySQL logical backup
└── 8. Fix VULN-01: Patch high/critical npm dependencies via audit fix

Phase 6B: Scalability & Operational Hardening
├── 1. Migrate AI Cache & Rate Limiter from NodeCache/Memory to Redis
├── 2. Add missing database indexes on Employees.shopId, SaleRefunds.shopId, Users.shopId
├── 3. Add client-side Idempotency-Key generation to POS checkout frontend
├── 4. Implement distributed lock (Redlock) for background billing scheduler
├── 5. Clean up .bak files in backend/migrations
└── 6. Implement structured correlation IDs (x-request-id) across service boundaries
```

---

## 24. Release Blockers

The following items are categorized as **HARD RELEASE BLOCKERS** that must be resolved prior to production launch:

1. **[BLOCKER] PERF-01 & PERF-02:** Memory exhaustion crashes caused by unpaginated `Sale.findAll()` in `saleController.js` and `dashboardController.js`.
2. **[BLOCKER] SEC-01:** Duplicate sales and inventory double-decrement caused by missing row locks on POS payment callbacks (`/api/mpesa/callback` and `/api/card/verify`).
3. **[BLOCKER] AUTH-01:** Inability to revoke compromised or terminated employee tokens before the 2-hour JWT expiry.
4. **[BLOCKER] DATA-01:** Inability of employees (UUID) to create invoices or record expenses due to integer-only `userId` column definitions.
5. **[BLOCKER] SCHEM-01:** Inter-tenant sale creation collision risk caused by legacy global index `Sales_invoiceNumber_unique`.
6. **[BLOCKER] DEPL-01:** Lack of production-ready container builds (currently executing dev server and nodemon).
7. **[BLOCKER] DR-01:** Lack of automated backup and disaster recovery runbook.
8. **[BLOCKER] VULN-01:** Critical and high CVE vulnerabilities in npm production dependencies.

---

## 25. Recommended Phase 7 Scope

Following approval and resolution of Phase 6 release blockers, Phase 7 should focus on:
1. **Offline POS Mode:** IndexedDB offline queue, Service Worker asset caching, and optimistic sync for intermittent connectivity.
2. **Hardware Integrations:** ESC/POS thermal receipt printer protocols, USB barcode scanner drivers, and electronic cash drawer triggers.
3. **Advanced Inventory:** Batch and serial number tracking, lot expiration alerts, and automated reorder purchase order generation.
4. **Multi-Currency Accounting:** Multi-currency branch ledgers, automated forex conversions, and localized tax authority integrations (KRA TIMS / eTIMS).

---

## 26. Audit Verification & Hard Stop Confirmation

In compliance with the Phase 6 operating directive:
- **No application code was modified.**
- **No controllers, services, middleware, models, or views were modified.**
- **No database migrations were created or executed.**
- **No tests were modified.**
- **All existing 119 automated regression tests remain passing.**

```text
git status --short:
 M docs/saas/PHASE-5-CURRENT-STATE-AUDIT.md
?? docs/saas/PHASE-5-REMEDIATION-WALKTHROUGH.md
?? docs/saas/PHASE-6-PRODUCTION-READINESS-AUDIT.md

git diff --stat:
 docs/saas/PHASE-5-CURRENT-STATE-AUDIT.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

**AUDIT COMPLETE — HARD STOP.** Awaiting human review and approval.
