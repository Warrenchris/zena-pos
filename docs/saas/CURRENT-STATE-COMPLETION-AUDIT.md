# Zana POS — Current-State SaaS Completion Audit

**Date:** September 16, 2026  
**Repository:** `https://github.com/Warrenchris/zena-pos.git`  
**Audit Type:** Phase 1 Current-State Reconnaissance & Verification (Findings Pass)  
**Status:** Complete — No code changes made. Awaiting approval.

---

## 1. Executive Summary & Verification Matrix

Every finding from the initial audit and subsequent reconnaissance has been independently verified by inspecting the live codebase.

| Finding | Area | Current Status | Evidence | Risk | Required Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Payments / Webhooks | **CONFIRMED** | `billingRoutes.js:314`, `mpesaRoutes.js:55`, `mpesaService.js:130` | **CRITICAL** (Financial): Unauthenticated M-Pesa callbacks + client-leaked `CheckoutRequestID` enable trivial payment spoofing | Implement per-transaction cryptographic URL tokens, active Daraja STK query verification, IP filtering, and omit `checkoutRequestId` from client responses |
| **ISO-01** | Tenancy / Quotas | **CONFIRMED** | `userController.js:9-17`, `routes/users.js:11-20`, `Users.jsx:28` | **CRITICAL** (Quota Bypass): `POST /api/users` bypasses `maxUsers`, leaves `organizationId: null`, omits `OrganizationMembership` | Deprecate `userController.js` and route staff management exclusively through `employeeController.js`, or wire quota checks and memberships |
| **ISO-02** | Catalog Multi-Tenancy | **CONFIRMED** | `productController.js:381-384`, `Product.js:70-73` | **CRITICAL** (Data Integrity): Sequential SKU count queries `{ where: { shopId } }`, colliding with org-scoped unique constraint `unique_products_org_sku` | Change SKU count filter in `productController.js` to `{ where: { organizationId } }` and implement collision-safe retry logic |
| **SEC-02** | Signup / Trial Abuse | **NEW DISCOVERY** | `routes/auth.js:14-21`, `authController.js:72-91` | **CRITICAL** (Business / Denial of Service): `authLimiter` keyed on `ip:email` allows unthrottled automated creation of 14-day Growth-tier trial orgs | Key rate limiter strictly by IP on `/register`, add disposable domain checks, and require email/phone verification for trial activation |
| **SEC-03** | Token Architecture | **NEW DISCOVERY** | `authController.js:239-246, 268-276`, `auth.js:5-53` | **MODERATE** (Security / Profile Leakage): Reset token is a bare `{ id }` RS256 token accepted by `auth` middleware; leaks profile at `/api/auth/profile`; tokens are reusable for 15m | Add `purpose: 'password_reset'` claim, enforce `purpose: 'session'` in `auth.js`, and blacklist used reset tokens in Redis |
| **UI-01** | Frontend Quota UX | **CONFIRMED** | `Employees.jsx:183, 311, 453`, `EmployeeModal.jsx:1-259` | **MODERATE** (UX Inconsistency): Modal lacks internal error banner, hides errors behind backdrop, ignores `QUOTA_EXCEEDED`; `EmployeeModal.jsx` is dead code | Port `CreateBranchModal.jsx` upgrade-banner pattern into `Employees.jsx` and delete orphaned `EmployeeModal.jsx` |
| **ISO-03** | Customer History Scoping | **CONFIRMED** | `customerController.js:70-75, 96, 133` | **MODERATE** (Tenant Consistency): Customers & loyalty points are org-scoped, but order history, spend stats, and favorites are shop-isolated | Aggregate customer metrics across the whole organization or support an explicit branch filter toggle |
| **ENT-01** | Entitlement Enforcement | **CONFIRMED** | `migrations/...seed-plans.js:36-66`, `Plan.js:40`, `shopController.js:66` | **MODERATE** (Schema Alignment): Plan features `multi_shop` and `api_access` exist in schema/seed metadata but are never checked in code | Wire `canUseFeature(orgId, 'multi_shop')` in `shopController.js` and document `api_access` as future plan metadata |
| **TST-01** | Test Coverage Gaps | **CONFIRMED** | `tests/billingRenewal.test.js:213`, `tests/controllers/multiTenantIsolation.test.js` | **MODERATE** (Regression Risk): Zero automated test coverage for callback forgery, user quota bypass, cross-shop sales, and SKU collisions | Add comprehensive negative security tests for callback authentication, quota enforcement, and cross-tenant isolation |
| **PRD-02** | SaaS Onboarding | **NEW DISCOVERY** | `frontend/src/pages/Dashboard.jsx:42-100`, `pages/Signup.jsx:42-43` | **MODERATE** (Product Activation): Zero post-signup onboarding wizard or getting-started empty state for 0-data accounts | Add a dismissible "Getting Started" checklist card on `/dashboard` when product and sales count is zero |
| **AUT-01** | Signup Role Coherence | **NEW DISCOVERY** | `routes/auth.js:33-35`, `authController.js:60, 68` | **MINOR** (Logical Inconsistency): Self-signup validator accepts `role: 'cashier'` while setting `orgRole: 'owner'`, locking owner out of admin routes | Force `role: 'admin'` server-side in `authController.register` or reject non-admin roles in route validation |
| **SEC-04** | Account Discovery | **NEW DISCOVERY** | `authController.js:252` | **MINOR** (Information Leakage): Synchronously awaiting SMTP delivery causes 5ms vs 500ms timing discrepancy between registered and unregistered emails | Dispatch reset emails asynchronously in background worker to eliminate timing discrepancies |
| **ERR-01** | Error Handling | **CONFIRMED** | `productController.js:520-531` | **MINOR** (Unhandled Error): Updating SKU or barcode to an existing org item throws unhandled 500 rather than controlled 409 | Wrap `product.update` with specific catch handler returning `409 Conflict` (`SKU_ALREADY_EXISTS`) |
| **TEC-01** | Tech Debt / Dead Code | **CONFIRMED** | `controllers/storeController.js`, `routes/storeRoutes.js` | **MINOR** (Cleanliness): Unmounted routes and controllers querying deprecated `Store` model with zero tenant isolation | Delete `storeController.js` and `storeRoutes.js` |
| **PRD-01** | Product Behavior | **CONFIRMED** | `requireOrgAdmin.js:78`, `shopController.js:66`, `employeeController.js:283` | **INFORMATIONAL** (Confirmed As Designed): Core POS/sales/inventory operations are ungated by subscription lapse | Retain graceful degradation; formalize 14-day grace window before hard lockout with business stakeholders |
| **AUT-02** | Authorization Scoping | **CONFIRMED** | `frontend/src/routes.jsx:85`, `hooks/usePermissions.js:7`, `TopNavBar.jsx:22` | **INFORMATIONAL** (Already Verified): All remaining `user?.role` checks are legitimate system-level view switches | No action required; Milestone 1 fix in `TopNavBar.jsx` resolved the only defect |

---

## 2. In-Depth Technical Evidence & Risk Analysis

### SEC-01: M-Pesa Callback Authentication & Secret Leaking (CRITICAL)
- **Files:** `backend/src/routes/billingRoutes.js`, `backend/src/routes/mpesaRoutes.js`, `backend/src/services/mpesaService.js`
- **Technical Analysis:**
  - `POST /api/billing/mpesa/callback` (lines 314–427) and `POST /api/mpesa/callback` (lines 54–106) trust caller-provided request body attributes (`CheckoutRequestID`, `ResultCode`, `CallbackMetadata`) directly.
  - Unlike `POST /api/billing/flutterwave/webhook` which strictly validates `req.headers['verif-hash'] === process.env.FLW_SECRET_HASH`, M-Pesa callbacks have no header verification, no shared secret, and no IP allowlisting.
  - `mpesaService.verifyCallback()` merely asserts that `payload.Body.stkCallback` exists.
  - During STK push initiation in `billingRoutes.js:282-284` and `mpesaRoutes.js:47`, the server responds with `{ checkoutRequestId }` in plaintext JSON to the client.
  - An attacker simply initiates renewal or a sale, cancels the phone prompt, and issues a POST to `/api/billing/mpesa/callback` with `ResultCode: 0` and the known `CheckoutRequestID`. The backend marks the invoice paid and extends the subscription by 30 days without funds transacting.
- **Remediation Requirement:**
  1. Generate a cryptographic 256-bit single-use token saved on the invoice (`callbackSecretToken`).
  2. Append token to `CallBackURL`: `${BASE_URL}/api/billing/mpesa/callback?token=${token}`.
  3. Validate `req.query.token === invoice.callbackSecretToken` on callback arrival.
  4. Perform synchronous Daraja STK Push Query (`/mpesa/stkpushquery/v1/query`) server-to-server confirmation before confirming payment.
  5. Enforce Safaricom official IP ranges (`196.201.214.200/26`).
  6. Stop returning `checkoutRequestId` in client initiation responses; return only internal opaque `invoiceId`.

---

### ISO-01: User Creation Quota & Organization Bypass (CRITICAL)
- **Files:** `backend/src/controllers/userController.js`, `backend/src/routes/users.js`, `frontend/src/pages/Users.jsx`
- **Technical Analysis:**
  - `employeeController.createEmployee` (lines 283–296) counts active members and enforces `entitlementService.checkQuota(orgId, 'maxUsers', currentActiveMemberCount)`.
  - In contrast, `userController.create` (`POST /api/users`) has zero quota checks, leaves `organizationId` unset (`null`), and creates no `OrganizationMembership`.
  - The frontend exposes `/users` and `/admin/users` via `frontend/src/routes.jsx:99-100`, which invokes `usersAPI.create(form)` -> `POST /api/users`.
  - Any admin can create infinite users on a 2-seat Starter plan without triggering quotas or membership links.
- **Remediation Requirement:**
  - Deprecate `POST /api/users` and `userController.js` completely.
  - Migrate `Users.jsx` and all user management views to `employeeController.js` and `employeesAPI`.
  - Ensure every user has an `organizationId` and an `OrganizationMembership`.

---

### ISO-02: Multi-Branch Product SKU Collision (CRITICAL)
- **Files:** `backend/src/controllers/productController.js`, `backend/src/models/Product.js`
- **Technical Analysis:**
  - `Product.js:70-73` establishes a unique composite index:
    `unique: true, fields: ['organizationId', 'sku'], name: 'unique_products_org_sku'`.
  - `productController.js:382` calculates:
    `const count = await Product.count({ where: { shopId } });`
    `finalSku = generateSKU(skuPrefix, count + 1);`
  - In a multi-shop organization, when Branch 2 is created, its initial product count is `0`. Auto-generating an SKU produces `SKU-0001`.
  - Because Branch 1 already created `SKU-0001` under the same `organizationId`, MySQL rejects the insert with `SequelizeUniqueConstraintError`, crashing product creation in the new branch.
- **Remediation Requirement:**
  - Change line 382 from `where: { shopId }` to `where: { organizationId }`.
  - Add an atomic collision-retry loop (e.g. up to 3 retries incrementing count on constraint collision) to handle concurrent product creation across multiple registers.

---

### SEC-02: Unthrottled Sybil Trial Account Creation (CRITICAL)
- **Files:** `backend/src/routes/auth.js`, `backend/src/controllers/authController.js`
- **Technical Analysis:**
  - `authLimiter` in `auth.js:20` is keyed by `ipKeyGenerator(req.ip):email`.
  - An automated script varying the email address (e.g. `bot1@spam.com`, `bot2@spam.com`) bypasses `authLimiter` completely.
  - The fallback `generalLimiter` permits 500 requests per 15 minutes per IP (2,000 accounts/hour).
  - Every registration automatically grants a 14-day trial on the Growth plan (`maxShops: 3`, `maxUsers: 10`, `org_insights: true`, AI forecasting), consuming database rows, Redis cache, bcrypt hashing cycles, and calling upstream AI forecasting services at zero cost.
- **Remediation Requirement:**
  - Key `authLimiter` on `/register` strictly by IP address (e.g., max 5 registrations per hour per IP).
  - Add disposable email domain filtering.
  - Require email verification before activating Growth trial benefits.

---

### SEC-03: Token Purpose Confusion & Multi-Use Password Reset Tokens (MODERATE)
- **Files:** `backend/src/controllers/authController.js`, `backend/src/middleware/auth.js`
- **Technical Analysis:**
  - `forgotPassword` signs a JWT containing only `{ id: user.id }` with 15m expiry using the standard RS256 private key.
  - `auth.js` accepts any valid RS256 token and assigns `req.user = decoded`.
  - Route tracing confirms:
    - `GET /api/auth/profile` accepts the bare reset token and returns full user profile data (name, email, role, orgRole, shopId, shop address/phone).
    - Operational routes (`/sales`, `/products`, `/customers`) are blocked by `isShopRequired`.
    - Administrative routes (`/users`, `/permissions`) are blocked by `checkRole(['admin'])`.
    - Billing routes are blocked by `req.organizationId`.
  - However, in `resetPassword`, the token is **never invalidated upon use**. For the remainder of the 15-minute window, the token can be reused repeatedly.
- **Remediation Requirement:**
  - Include `purpose: 'password_reset'` in reset tokens.
  - In `auth.js`, enforce `if (decoded.purpose !== 'session') return res.status(401)`.
  - Invalidate reset tokens in Redis immediately upon successful password change.

---

### UI-01: `Employees.jsx` In-Modal Error Feedback & Quota Display (MODERATE)
- **Files:** `frontend/src/pages/Employees.jsx`, `frontend/src/components/EmployeeModal.jsx`
- **Technical Analysis:**
  - `Employees.jsx` implements an inline modal (lines 447–550). When employee creation fails at quota, `save()` catches the error and sets page-level state on line 183.
  - The error is rendered on line 311 on the main page, obscured behind the modal backdrop. The user sees no feedback inside the modal.
  - When closed, only a plain text error is shown, completely ignoring the structured response (`code: 'QUOTA_EXCEEDED'`, `requiredPlan: 'growth'`, `limit: 2`).
  - `EmployeeModal.jsx` is an orphaned, unimported duplicate component using raw `fetch`.
- **Remediation Requirement:**
  - Port `CreateBranchModal.jsx`'s quota handling into `Employees.jsx`: render an in-modal amber upgrade banner with plan comparison and link to `/billing`.
  - Delete `frontend/src/components/EmployeeModal.jsx`.

---

### ISO-03: Customer Profile Metrics Scoping Inconsistency (MODERATE)
- **Files:** `backend/src/controllers/customerController.js`
- **Technical Analysis:**
  - `Customer` records and loyalty points are organization-scoped (`where: { id, active: true, organizationId }`).
  - In `customerController.getCustomerById`, `salesStats`, `orderHistory`, and `favorites` queries filter by `where: { shopId }`.
  - When an organization customer visits a secondary branch, staff sees 0 lifetime spend and 0 past orders.
- **Remediation Requirement:**
  - Update `getCustomerById` to aggregate stats and history across `organizationId` by default, with an optional `shopId` query parameter for branch-specific filtering.

---

### ENT-01: Plan Feature Flags `multi_shop` and `api_access` Unenforced (MODERATE)
- **Files:** `backend/migrations/...seed-plans.js`, `backend/src/models/Plan.js`, `backend/src/controllers/shopController.js`
- **Technical Analysis:**
  - Seed data defines `features` JSON containing `multi_shop` and `api_access`.
  - Grep verification confirms neither key is ever checked by `canUseFeature` in application code.
  - `shopController.js` relies entirely on `checkQuota(orgId, 'maxShops', ...)`.
  - `api_access` has no underlying implementation.
- **Remediation Requirement:**
  - Add `await entitlementService.canUseFeature(orgId, 'multi_shop')` check in `shopController.js` before branch creation.
  - Document `api_access` as future plan metadata.

---

### TST-01: Test Coverage Gaps on Integration Boundaries (MODERATE)
- **Files:** `backend/tests/billingRenewal.test.js`, `backend/tests/controllers/multiTenantIsolation.test.js`
- **Technical Analysis:**
  - Existing tests for M-Pesa renewal issue unauthenticated POST requests directly to `/api/billing/mpesa/callback` and expect 200 OK.
  - No negative tests exist for callback forgery, invalid callback secrets, or payment status mismatches.
  - `POST /api/users` has zero tests in the entire suite.
  - Multi-tenant isolation tests only assert employee listing, omitting cross-tenant sales, invoices, and held carts.
- **Remediation Requirement:**
  - Add automated test suites for M-Pesa callback secret validation, user quota enforcement, and cross-tenant resource isolation.

---

### PRD-02: Zero SaaS Onboarding / First-Run Empty States (MODERATE)
- **Files:** `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/Signup.jsx`
- **Technical Analysis:**
  - Following registration, the user is redirected immediately to `/dashboard`.
  - `/dashboard` renders flat zero lines on charts, empty tables, and failing AI forecasts.
  - There is no first-run checklist (e.g. "Add Products", "Set up Taxes", "Add Staff").
- **Remediation Requirement:**
  - Implement a dismissible "Getting Started" onboarding card on `/dashboard` when product and transaction count is zero.

---

### Minor Findings Summary (AUT-01, SEC-04, ERR-01, TEC-01, PRD-01, AUT-02)
- **AUT-01 (Minor):** Self-signup validator allows `role: 'cashier'` while setting `orgRole: 'owner'`. Force `role: 'admin'` on self-signup.
- **SEC-04 (Minor):** Synchronous SMTP delivery in `forgotPassword` creates a ~500ms timing discrepancy between valid and invalid emails. Dispatch reset emails asynchronously.
- **ERR-01 (Minor):** `productController.updateProduct` throws unhandled 500 when updating SKU/barcode to a colliding value. Catch `SequelizeUniqueConstraintError` and return `409 Conflict`.
- **TEC-01 (Minor):** `storeController.js` and `storeRoutes.js` are unmounted, unreferenced legacy code querying a deprecated `Store` model. Delete both files.
- **PRD-01 (Informational):** POS operations remain functional during subscription lapse. Confirmed as intentional graceful degradation for physical retail.
- **AUT-02 (Informational):** Frontend audit confirmed all remaining `user?.role` checks are legitimate system-level view distinctions.

---

## 3. Recommended Remediation Order

Following user approval, remediation will execute strictly phase by phase with approval gates:

1. **PHASE 2: M-Pesa Financial Integrity (SEC-01)**
   - Per-transaction URL secret token generation and validation.
   - Synchronous Daraja STK Push Query verification.
   - Omit `checkoutRequestId` from client responses.
   - Negative test suite for callback forgery and duplicate callbacks.
2. **PHASE 3: User Creation & Tenant Quota Integrity (ISO-01, AUT-01)**
   - Deprecate `POST /api/users` and route all staff creation through `employeeController.js`.
   - Ensure strict `maxUsers` quota check, `organizationId` assignment, and `OrganizationMembership` creation.
   - Force `role: 'admin'` on self-signup.
3. **PHASE 4: Multi-Branch Product & SKU Integrity (ISO-02, ERR-01)**
   - Change SKU sequence generation to `{ where: { organizationId } }` with retry handling.
   - Wrap product updates with 409 conflict handling for SKU/barcode collisions.
4. **PHASE 5: Tenant & Customer Scoping Alignment (ISO-03, TEC-01)**
   - Align customer order history and spend metrics to organization scope.
   - Delete obsolete `storeController.js` and `storeRoutes.js`.
5. **PHASE 6: Token Lifecycle & Registration Hardening (SEC-02, SEC-03, SEC-04, ENT-01)**
   - Add `purpose` claims and single-use Redis invalidation for password reset tokens.
   - Fix `/register` rate limiter keying to IP; add disposable email checks.
   - Wire `canUseFeature(orgId, 'multi_shop')` in `shopController.js`.
6. **PHASE 7: Frontend SaaS UX & Error Handling (UI-01, PRD-02)**
   - Implement in-modal `QUOTA_EXCEEDED` banner in `Employees.jsx` and delete `EmployeeModal.jsx`.
   - Add dismissible Getting Started onboarding checklist on `/dashboard`.
7. **PHASE 8: Regression & Adversarial Testing (TST-01)**
   - Run full regression suite and add cross-tenant adversarial tests.
8. **PHASE 9: Final Production Readiness Audit**
   - Produce `docs/saas/FINAL-PRODUCTION-READINESS-AUDIT.md` release gate.
