# Zana POS — Phase 5 Current-State Audit: Multi-Tenant Lifecycle, Subscriptions, Billing & Entitlements

**Date:** September 17, 2026  
**Repository:** `https://github.com/Warrenchris/zena-pos.git`  
**Audit Type:** Phase 5 Current-State Reconnaissance & Architectural Integrity Verification (Read-Only — Hard Stop)  
**Author:** Senior Backend & Security Engineering Agent  
**Status:** Audit Findings Fully Remediated & Verified (119/119 tests passing). See [PHASE-5-REMEDIATION-WALKTHROUGH.md](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/saas/PHASE-5-REMEDIATION-WALKTHROUGH.md) for full implementation details.

---

## 1. Executive Summary & Verification Matrix

In accordance with Phase 5 operating requirements, a comprehensive, read-only audit of the Zana POS codebase was performed across data models, database schemas, middleware, controllers, billing services, scheduled tasks, background workers, frontend views, and automated test suites.

Following the successful hardening of multi-branch catalog isolation and stock-transfer idempotency in Phase 4, the repository possesses a solid foundational relational schema:
- **Organization** as the authoritative tenant boundary (`Organizations`).
- **Subscription** with explicit plan associations (`Subscriptions`, `Plans`).
- **Billing Invoices & M-Pesa / Card Gateway Integrations** (`SubscriptionInvoices`, `billingPaymentService.js`, `billingRoutes.js`).
- **Entitlement Service** with Redis caching for feature gating and quota checks (`entitlementService.js`).
- **Multi-Branch Staff & Shop Hierarchy** (`Shops`, `OrganizationMemberships`, `ShopAccess`, `staffCreationService.js`).

However, the audit identified **critical lifecycle, security, and operational gaps** that must be resolved before Phase 5 can be considered production-ready. Most notably:
1. **Trial expiration is unenforced:** `billingService.checkAndTransitionExpiredSubscriptions` only inspects active subscriptions; `trialing` subscriptions are never transitioned upon expiry, granting free Growth-tier access indefinitely.
2. **Subscription suspension does not block core POS operations:** Suspended organizations cannot add new branches or staff, but can continue logging in, checking out sales, updating products, and managing inventory indefinitely.
3. **Branch creation quota suffers from a TOCTOU race condition:** `Shop.count` is performed outside of a transaction without locks, allowing concurrent requests to breach `maxShops`.
4. **The frontend billing UI is completely decoupled from payment flows:** Upgrade buttons are hardcoded `disabled`, and no form or modal exists to initiate M-Pesa or Card subscription renewals.
5. **Renewal endpoints allow arbitrary plan selection:** An owner can request renewal with `planId: 4` (the internal Grandfathered plan at KES 0.00) without validation.

### Comprehensive Findings Matrix

| Finding ID | Area | Classification | Severity | Current Code Location | Root Cause Summary | Required Remediation | Test Required |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P0-01** | Trial Lifecycle | **NEW DISCOVERY** | **CRITICAL** | `billingService.js:170-252`, `entitlementService.js:104-179` | `checkAndTransitionExpiredSubscriptions` only queries `status: 'active'` and `status: 'past_due'`. Subscriptions with `status: 'trialing'` are never expired or transitioned when `trialEndsAt` elapses. `entitlementService` also fails to evaluate `trialEndsAt`. | Add query for expired `trialing` subscriptions to scheduler (transition to `past_due` or `suspended`); evaluate `trialEndsAt < now` in `entitlementService`. | Unit test simulating `trialEndsAt` in the past confirming immediate feature/quota lock and scheduler transition. |
| **P0-02** | SaaS Security / Enforcement | **NEW DISCOVERY** | **CRITICAL** | `saleController.js`, `authController.js:129`, `middleware/auth.js` | Subscription status (`suspended`, `canceled`, `past_due`) is never evaluated during user authentication or core sales transactions. Suspended merchants retain full POS checkout and catalog access. | Implement `requireActiveSubscription` middleware or enforce subscription state check in `auth.js` and `saleController.js` with graceful grace-period handling. | Integration test verifying `POST /api/sales` and `POST /api/auth/login` reject or restrict suspended organizations. |
| **P0-03** | Entitlements / Quotas | **NEW DISCOVERY** | **CRITICAL** | `shopController.js:61-80` | Branch quota check (`checkQuota('maxShops')`) reads count outside of transaction without row locks. Concurrent `POST /api/shops` calls both pass the check and create excess branches. | Wrap `Shop.count` inside transaction with pessimistic row lock on `Organization` (mirroring `staffCreationService.js`). | Concurrency test sending parallel `POST /api/shops` requests verifying exactly one commits when limit is 1. |
| **P1-01** | Frontend Billing UX | **NEW DISCOVERY** | **HIGH** | `frontend/src/pages/Billing.jsx:464-472` | Plan switching and upgrade buttons are hardcoded `disabled` (`title="Plan switching will be available in an upcoming release"`). No renewal checkout form exists in the UI. | Wire `POST /api/billing/subscription/renew` into an interactive modal supporting M-Pesa STK push and Card checkout. | Cypress/Playwright or frontend unit test verifying checkout modal submission and polling. |
| **P1-02** | SaaS Billing Security | **NEW DISCOVERY** | **HIGH** | `billingService.js:53-62`, `billingRoutes.js:252-266` | `generateRenewalInvoice` accepts arbitrary `planId` without validating `plan.isActive === true` and `plan.code !== 'grandfathered'`. Allows upgrading to Grandfathered tier (KES 0.00). | Validate `plan.isActive && plan.code !== 'grandfathered'` in `generateRenewalInvoice`. | API test attempting renewal with `planId: 4` asserting `400 Bad Request`. |
| **P1-03** | Org Administration | **NEW DISCOVERY** | **HIGH** | `backend/src/routes/shop.js`, `backend/src/controllers/shopController.js` | Zero endpoints exist to manage branch access delegation (`ShopAccess`). Once created, an admin or staff member cannot be granted or revoked access to other branches. | Implement `GET/POST/DELETE /api/shops/:id/access` endpoints guarded by `requireOrgOwner`. | Integration test verifying owner can grant and revoke branch access to non-owner admins. |
| **P1-04** | Org Administration | **NEW DISCOVERY** | **HIGH** | `employeeController.js:17-57`, `userController.js` | Staff queries and deletions are hardcoded to `where: { shopId: req.user.shopId }`. No tenant-wide member listing exists, and `User` records cannot be deleted via API. | Add `GET /api/organizations/members` (tenant-wide) and support revoking/deleting `User` memberships. | Test verifying organization owner can list all employees across all branches and revoke memberships. |
| **P1-05** | Subscription Lifecycle | **NEW DISCOVERY** | **HIGH** | `billingService.js:93-163` | Plan downgrades (e.g. Growth with 3 branches downgrading to Starter with 1 branch) do not reconcile or freeze excess branches or seats. Excess resources remain active. | Implement downgrade validation: require deactivating excess branches/users before downgrade, or freeze excess resources. | Test asserting downgrade to Starter fails if organization has 2 active shops. |
| **P2-01** | Entitlements / AI | **NEW DISCOVERY** | **MODERATE** | `backend/src/routes/aiProxy.js:145-220` | AI proxy routes forward requests to upstream FastAPI without checking `entitlementService.canUseFeature('ai_features')` or subscription status. | Gate `/api/ai/forward/*` with `canUseFeature` check and verify active subscription. | Integration test verifying Starter tier or suspended tenant receives 403 on AI forecast endpoint. |
| **P2-02** | RBAC / Governance | **NEW DISCOVERY** | **MODERATE** | `userController.js:98-130` | Modifying a user's role or status in `userController.updateRole` updates `User.role` or `Employee.position`, but does not update `OrganizationMembership.orgRole` or `OrganizationMembership.status`. | Synchronize status and role changes into `OrganizationMemberships` within an atomic transaction. | Test verifying deactivating an employee updates `OrganizationMembership.status = 'suspended'`. |
| **P2-03** | Subscription Lifecycle | **NEW DISCOVERY** | **MODERATE** | `backend/src/routes/billingRoutes.js` | No subscription cancellation endpoint exists (`POST /api/billing/subscription/cancel`) to set `cancelAtPeriodEnd = true`. | Implement `POST /api/billing/subscription/cancel` allowing owners to opt out of auto-renew. | Test verifying owner can set `cancelAtPeriodEnd = true`. |
| **P2-04** | Lifecycle / Data Integrity | **NEW DISCOVERY** | **MODERATE** | `backend/src/routes/shop.js`, `shopController.js` | No endpoint exists to delete or archive a branch (`Shop`). Foreign keys enforce `RESTRICT` on delete, but no soft-deactivation endpoint exists. | Add `PATCH /api/shops/:id/deactivate` and `PATCH /api/shops/:id/activate` guarded by `requireOrgOwner`. | Test verifying deactivating a branch prevents new sales/logins but preserves historical records. |
| **P3-01** | Plan Metadata | **NEW DISCOVERY** | **MINOR** | `Plan.js:40`, `migrations/...seed-plans.js` | `api_access` feature flag is present in schema and plans, but has no API key subsystem or enforcement. | Document `api_access` as reserved for future external API gateway integrations. | N/A (Documentation only). |
| **P3-02** | Data Consistency | **NEW DISCOVERY** | **MINOR** | `authController.js:46` | Registration sets `Organization.status = 'active'` even though the underlying subscription is `'trialing'`. | Set `Organization.status = 'trialing'` upon self-registration to maintain status parity with `Subscription`. | Test verifying newly registered organization has `status: 'trialing'`. |
| **INF-01** | SaaS Security | **CONFIRMED** | **INFORMATIONAL** | `billingRoutes.js`, `billingPaymentService.js`, `mpesaRoutes.js` | M-Pesa STK callbacks and Flutterwave webhooks implement cryptographic token checks, signature validation, row locks, and idempotency guards. Phase 2 protections intact. | Maintain existing security patterns in all future webhook implementations. | Regression tests currently passing (6/6). |

---

## 2. Architecture Reality: The 9 Core Dimensions

The current system architecture decomposes cleanly into 9 interconnected dimensions:

```text
Organization (id, name, slug, status, currency)
│
├── 1. Subscription & Plans
│     ├── Subscription (id [UUID], organizationId [UNIQUE], planId, status, billingCycle, currentPeriodStart, currentPeriodEnd, trialEndsAt, cancelAtPeriodEnd)
│     └── Plan (id, name, code, priceMonthly, currency, maxShops, maxUsers, features, isActive)
│
├── 2. Billing & Invoices
│     └── SubscriptionInvoices (id, invoiceNumber [UNIQUE], organizationId, subscriptionId, planId, amount, currency, paymentChannel, paymentReference, status, paidAt, metadata)
│
├── 3. Organization Identity & RBAC
│     ├── OrganizationMemberships (id [UUID], organizationId, userId [NULLABLE], employeeId [NULLABLE], orgRole, status)
│     └── ShopAccess (id [UUID], membershipId, shopId, isDefault)
│
├── 4. Branches / Physical Locations
│     ├── Shops (id, organizationId, name, address, phone, active, kraPin, registrationNumber)
│     └── SystemSettings (shopId, taxRate, receiptHeader, receiptFooter, printerType, lowStockThreshold, ...)
│
├── 5. Master Product Catalog
│     ├── Products (id, organizationId, shopId [NULLABLE origin], name, sku, barcode, price, cost, active, nonReturnable, categoryId)
│     └── Categories (id, organizationId, shopId, name, parentId)
│
├── 6. Branch-Level Inventory & Ledger
│     ├── Inventory (id, shopId, productId, stockQuantity, reorderPoint) [UNIQUE (shopId, productId)]
│     └── StockMovements (id, organizationId, shopId, productId, quantity, previousStock, newStock, type, reference, userId, employeeId)
│
├── 7. Inter-Branch Stock Transfers
│     └── StockTransfers (id, organizationId, idempotencyKey, requestHash, reference, sourceShopId, destinationShopId, productId, quantity, status, responsePayload)
│
├── 8. Customers & Suppliers
│     ├── Customers (id, organizationId, shopId [NULLABLE], name, phone, email, loyaltyPoints, totalPurchases)
│     └── Suppliers (id, organizationId, shopId [NULLABLE], name, phone, email, contactPerson)
│
└── 9. AI Services Integration
      └── AI Proxy (aiProxy.js -> FastAPI uvicorn: Prophet, Random Forest, Financial Forecasting, Insights)
```

### Architectural Verdict
The relational database structure is sound and normalized. Foreign keys protect tenant boundaries via `RESTRICT` on core assets (`Products`, `Categories`, `Customers`, `Suppliers`, `Shops`, `StockMovements`, `StockTransfers`), preventing accidental orphaned records upon tenant deletion.

The defects are **application-layer lifecycle omissions** (un-triggered trial expiry, unenforced suspension gates, un-synchronized membership statuses, and missing administrative endpoints), rather than fundamental relational design failures.

---

## 3. Organization & Tenant Lifecycle Audit

### A. Organization Creation
- **Mechanism:** Handled in `authController.js:43-56` within an atomic MySQL transaction during user self-registration (`POST /api/auth/register`).
- **Behavior:** Generates a URL-safe slug `${cleanName}-${Date.now()}`, creates initial `Shop` (branch 1), initial `User` (role `'admin'`), initial `OrganizationMembership` (orgRole `'owner'`), and provisions a 14-day trial on the `growth` plan.
- **Defect (P3-02):** Sets `Organization.status = 'active'` immediately upon creation, while `Subscription.status = 'trialing'`.

### B. Organization Activation / Deactivation
- **Activation:** Occurs in `billingService.js:144-147` inside `processConfirmedRenewal`:
  ```javascript
  await Organization.update(
    { status: 'active' },
    { where: { id: invoice.organizationId }, transaction }
  );
  ```
- **Deactivation / Suspension:** Occurs in `billingService.js:229-232` inside `checkAndTransitionExpiredSubscriptions`:
  ```javascript
  await Organization.update(
    { status: 'suspended' },
    { where: { id: sub.organizationId }, transaction: t }
  );
  ```
- **Operational Enforcement Gap (P0-02):** When `Organization.status` becomes `'suspended'`, the system does **not** terminate active sessions or block new POS sales transactions. Only administrative expansion calls (`createShop`, `createStaffMember`, `orgInsights`) check `org.status === 'suspended'`.

### C. Tenant Ownership Governance
- **Rule:** The creator receives `OrganizationMembership.orgRole = 'owner'`.
- **Enforcement:** `requireOrgOwner.js` strictly restricts subscription renewal and invoice access to owners (`membership.orgRole === 'owner'`).
- **Gap (P1-04):** There is no mechanism to transfer ownership to another member, nor can an organization have a designated `billing_admin` who can manage payments without having the full root `owner` role.

### D. Organization Deletion & Archival Behavior
- **Database Boundary:** Foreign keys from `Shops`, `Products`, `Categories`, `Customers`, `Suppliers`, `StockMovements`, and `StockTransfers` to `Organizations` all specify `ON DELETE RESTRICT`. An organization with business records **cannot** be deleted at the database level.
- **Application Boundary (P2-04):** No API endpoint exists to soft-delete, archive, or offboard an organization. `Organization.destroy` only exists in test suites.

### E. Cross-Tenant Boundaries & Context Resolution
- In `auth.js`, the JWT carries `organizationId`, `shopId`, and `role`.
- `req.organizationId` is resolved from the JWT claim.
- All Phase 1–4 tables (`Products`, `Categories`, `Customers`, `Suppliers`, `StockMovements`, `StockTransfers`, `Subscriptions`, `SubscriptionInvoices`) have explicit `organizationId` foreign keys and composite tenant-scoped indexes.
- Cross-tenant data leakage is structurally prevented at the database and controller query layers.

---

## 4. Subscription & Billing Audit

### A. Subscription Model & Plan Definitions
The database defines 4 plans (`Plans` table):
1. **Starter (`starter`)**: KES 1,500/mo. Quotas: 1 shop, 2 users. Features: `{"api_access": false, "multi_shop": false, "org_insights": false}`.
2. **Growth (`growth`)**: KES 3,500/mo. Quotas: 3 shops, 10 users. Features: `{"api_access": false, "multi_shop": true, "org_insights": true}`.
3. **Pro (`pro`)**: KES 7,500/mo. Quotas: Unlimited (-1) shops, Unlimited (-1) users. Features: `{"api_access": true, "multi_shop": true, "org_insights": true}`.
4. **Grandfathered (`grandfathered`)**: KES 0.00/mo. Quotas: Unlimited (-1). Features: all true. `isActive: 0` (internal tier for founding merchants migrated from single-shop legacy).

### B. Invoices & Payment Ledger
- `SubscriptionInvoices` stores every renewal invoice with unique `invoiceNumber` (`INV-SUB-{timestamp}-{organizationId}`).
- Tracks `paymentChannel` (`'mpesa'`, `'card'`, `'bank_transfer'`, `'manual'`), `amount`, `currency`, `paymentReference` (CheckoutRequestID or tx_ref), `gatewayReference` (M-Pesa receipt or Flutterwave transaction ID), and `status` (`'pending'`, `'paid'`, `'failed'`, `'refunded'`).
- Invoices are created in `status: 'pending'` via `generateRenewalInvoice` and transition to `'paid'` or `'failed'` strictly upon webhook verification.

### C. M-Pesa & Card Gateway Verification
- **Daraja STK Push:**
  - Token generation: 32 random bytes stored in `invoice.metadata.callbackToken`.
  - Safaricom callback URL includes `?token={callbackToken}`.
  - Callback processing in `billingRoutes.js:308-454` asserts token match, acquires `t.LOCK.UPDATE` on the invoice row, asserts `paidAmount >= invoice.amount`, and performs an independent Daraja Query API check if credentials exist.
  - Duplicate callbacks are handled idempotently (`if (invoice.status === 'paid') return 200`).
- **Flutterwave Card Webhook:**
  - Validates `verif-hash` header against `process.env.FLW_SECRET_HASH` prior to database queries.
  - Locks invoice with `t.LOCK.UPDATE`, asserts `status === 'successful'`, currency match, and amount match.
  - Duplicate webhooks return 200 no-op.

### D. Billing Security Gaps
- **Arbitrary Plan Selection (P1-02):** `generateRenewalInvoice` does not validate that the requested `planId` has `isActive === true` or that `plan.code !== 'grandfathered'`. An owner can pass `planId: 4` and renew for KES 0.00.
- **Invoice Spamming:** A merchant can invoke `POST /api/billing/subscription/renew` repeatedly, generating unlimited pending invoices with no cooldown or deduplication.
- **No Cancellation Flow (P2-03):** No endpoint exists for a customer to cancel auto-renewal or mark `cancelAtPeriodEnd = true`.

---

## 5. Entitlement & Plan Enforcement Matrix

| Capability / Entitlement | DB Column / Feature Key | Enforced Server-Side? | Transaction Safe? | Enforced Everywhere? | Frontend Bypassable? | Expired Sub Behavior | Downgrade Behavior | Concurrent Limit Reached |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Max Branches / Shops** | `Plans.maxShops` | **YES** (`shopController.js:66`) | **NO (TOCTOU)** | **YES** (`POST /api/shops`) | No (Backend rejects) | Suspended: rejected. Expired trial: **ALLOWED** | Excess shops remain active | **RACE CONDITION: Quota breached** |
| **Max Users / Seats** | `Plans.maxUsers` | **YES** (`staffCreationService.js`) | **YES** (`LOCK.UPDATE` on Org) | **YES** (`/api/employees`, `/api/users`) | No (Backend rejects) | Suspended: rejected. Expired trial: **ALLOWED** | Excess users remain active | Serialized safely via row lock |
| **Multi-Shop Delegation** | `features.multi_shop` | **PARTIAL** (Gated by `maxShops`) | N/A | **NO** (Not explicitly checked on switch) | No | Allowed if shops exist | Allowed | N/A |
| **Org Insights Analytics** | `features.org_insights` | **YES** (`requireOrgAdmin.js:78`) | N/A | **YES** (`/api/insights/organization/*`) | No | Suspended: rejected. Expired trial: **ALLOWED** | Blocked if downgraded to Starter | N/A |
| **AI Features & Forecasting**| `features.ai_features` | **NO** (Missing) | N/A | **NO** (Open on `/api/ai/forward/*`) | **YES** (Direct API call works) | Allowed | Allowed | N/A |
| **API Access** | `features.api_access` | **NO** (Unimplemented) | N/A | **NO** (No API key subsystem) | **YES** | N/A | N/A | N/A |
| **Reports & Profit/Loss** | None (Role-gated only) | **NO** | N/A | Open to admin/manager on all tiers | **YES** | Allowed | Allowed | N/A |
| **Product / Catalog Limits** | None | **NO** (Unlimited) | N/A | N/A | N/A | Allowed | Allowed | N/A |
| **Customer / Supplier Limits**| None | **NO** (Unlimited) | N/A | N/A | N/A | Allowed | Allowed | N/A |
| **POS Sales Transactions** | None | **NO** (Unrestricted) | N/A | N/A | N/A | **ALLOWED even when SUSPENDED** | Allowed | N/A |

---

## 6. Trial Lifecycle Analysis

```text
[Self-Registration (POST /api/auth/register)]
        │
        ▼
   Organization created: status = 'active' (P3-02)
   Subscription created: status = 'trialing', plan = 'growth', trialEndsAt = now + 14d
        │
        ├───────────────────────────────────────────────┐
        │                                               │
        ▼ (Day 1 - 14)                                  ▼ (Day 15+: Trial Ends)
Operational: Full Growth tier features          CRITICAL DEFECT (P0-01):
Branch limit = 3, User limit = 10               billingScheduler NEVER queries 'trialing'.
Redis cached for 15 minutes                     Subscription.status remains 'trialing' indefinitely.
                                                entitlementService allows all Growth features.
                                                Tenant NEVER transitions to past_due or suspended.
```

### State Machine Transition Table

| Current State | Trigger / Event | Expected Next State | Actual Code Behavior | Integrity Status |
| :--- | :--- | :--- | :--- | :--- |
| **None** | `POST /api/auth/register` | `status: 'trialing'` | Creates Growth sub with `status: 'trialing'`, `trialEndsAt = +14d` | **PASS** |
| **`trialing`** | `trialEndsAt` elapses (no payment) | `status: 'past_due'` (or `'suspended'`) | **NO-OP.** `checkAndTransitionExpiredSubscriptions` ignores `trialing`. | **FAIL (P0-01)** |
| **`trialing`** | Payment confirmed via M-Pesa / Card | `status: 'active'`, period = +30d | Transitions to `active`, extends period, updates `planId` | **PASS** |
| **`active`** | `currentPeriodEnd` elapses | `status: 'past_due'` (7-day grace) | Transitions to `past_due` in `checkAndTransitionExpiredSubscriptions` | **PASS** |
| **`past_due`** | Payment confirmed within grace period | `status: 'active'`, period extended | Re-activates subscription and organization | **PASS** |
| **`past_due`** | Grace period (7 days) elapses | `status: 'suspended'` | Transitions to `suspended` in scheduler | **PASS** |
| **`suspended`**| Owner initiates renewal & pays | `status: 'active'` | Transitions to `active`, sets Organization active | **PASS** |
| **`suspended`**| Cashier logs in & creates sales | `403 Forbidden / Subscription Suspended`| **200 OK.** Sales succeed without any subscription check! | **FAIL (P0-02)** |
| **`active`** | Owner downgrades to lower plan tier | Reconcile or freeze excess branches | `planId` updated, excess branches and staff remain active | **FAIL (P1-05)** |
| **`active`** | Owner requests cancellation | `cancelAtPeriodEnd = true` | Endpoint does not exist | **FAIL (P2-03)** |

---

## 7. RBAC & Organization Administration Audit

### A. Role Hierarchy
The codebase maintains a dual-layer RBAC structure:
1. **Application Role (`Users.role`, `Employees.position`):**
   - `'admin'`, `'manager'`, `'cashier'`.
   - Governs point-of-sale capabilities, discounting, refunds, voiding, and local report viewing.
2. **Organization Role (`OrganizationMemberships.orgRole`):**
   - `'owner'`, `'admin'`, `'member'`, `'billing_admin'`.
   - Governs multi-branch delegation, subscription renewal, billing invoice access, and branch creation.

### B. Governance & Delegation Gaps
1. **Owner vs Admin Delegation:**
   - Owners bypass `ShopAccess` checks universally (implicit access to all current and future branches).
   - Admins are restricted to branches explicitly mapped in `ShopAccess`.
   - **Gap (P1-03):** No controller or route allows owners to grant or revoke `ShopAccess` rows for administrators after their initial creation.
2. **Missing Cross-Branch Staff Management (P1-04):**
   - `employeeController.getAllEmployees` filters by `where: { shopId: req.user.shopId }`.
   - An owner logged into Branch 1 cannot see or manage staff working in Branch 2 without switching branches first.
3. **Role Desynchronization (P2-02):**
   - Updating an employee via `PUT /api/employees/:id` or `PUT /api/users/:id/role` modifies local table columns, but leaves `OrganizationMembership.orgRole` unmodified.

---

## 8. Data Integrity & Database Schema Findings

### A. Foreign Key Cascade & Restrict Analysis
- `Subscriptions` $\rightarrow$ `Organizations`: `ON DELETE CASCADE`.
- `SubscriptionInvoices` $\rightarrow$ `Subscriptions`: `ON DELETE CASCADE`.
- `OrganizationMemberships` $\rightarrow$ `Organizations`: `ON DELETE CASCADE`.
- `ShopAccess` $\rightarrow$ `OrganizationMemberships`: `ON DELETE CASCADE`.
- `Shops` $\rightarrow$ `Organizations`: `ON DELETE RESTRICT` (Guarantees branches are never accidentally deleted).
- `Products` $\rightarrow$ `Organizations`: `ON DELETE RESTRICT` (Catalog protected).
- `Customers` $\rightarrow$ `Organizations`: `ON DELETE RESTRICT`.
- `StockMovements` $\rightarrow$ `Organizations`: `ON DELETE RESTRICT`.
- `StockTransfers` $\rightarrow$ `Organizations`: `ON DELETE RESTRICT`.

### B. Unique Constraints & Composite Indexes
- `Subscriptions.organizationId`: `UNIQUE` (Enforces 1:1 relationship between organization and subscription).
- `SubscriptionInvoices.invoiceNumber`: `UNIQUE`.
- `SubscriptionInvoices.paymentReference`: Indexed (`idx_sub_invoices_reference`).
- `OrganizationMemberships.organizationId, userId`: Nullable unique constraints with validation hook `exactlyOneIdentity` ensuring either `userId` or `employeeId` is present.
- `ShopAccess.membershipId, shopId`: Foreign keys present; needs composite unique constraint `unique_membership_shop (membershipId, shopId)` to prevent duplicate access grants.

---

## 9. Frontend Enforcement & User Experience Findings

### A. Surface Gating vs Authoritative Enforcement
1. **Branch Switcher (`BranchSwitcher.jsx`):**
   - Uses `useEntitlement('multi_shop')` and `useQuota('shops')`.
   - Displays upgrade badge when `current >= limit`.
   - Properly backed by authoritative server-side checks in `shopController.createShop` and `authController.switchShop`.
2. **Billing Dashboard (`Billing.jsx`):**
   - Accurately renders active plan tier, pricing, currency, quota progress bars (branches and users), days remaining in trial, and invoice history.
   - **Fatal Flaw (P1-01):** The "Available Tier" buttons are disabled with `cursor-not-allowed` and no checkout form exists. The user cannot pay to upgrade or renew.
3. **Global Subscription Banner (`SubscriptionBanner.jsx`):**
   - Displays warning banners for trials with $\le 5$ days remaining, `past_due`, `canceled`, or `suspended`.
   - Properly restricts "Upgrade Plan" / "Manage Billing" buttons to `user.orgRole === 'owner'`.
   - Can be dismissed to `sessionStorage`.
4. **Staff Management (`Employees.jsx`):**
   - Has **no** quota indicators or upgrade prompts in the UI.
   - Relies purely on the backend rejecting with an upgrade prompt payload (`sendUpgradePrompt`), which is then caught by a global API interceptor or toast.

---

## 10. Automated Test Suite Inventory

### Existing Tests Matrix

| Test Suite File | Focus Area | Assertions / Tests Count | Verified Working? | Gaps Identified |
| :--- | :--- | :--- | :--- | :--- |
| `billingEndpoints.test.js` | Read-only billing APIs | 12 tests | **YES** | Does not test subscription renewal or invoice payment |
| `billingRenewal.test.js` | M-Pesa & Card renewal | 14 tests | **YES** | Does not test renewal with inactive or invalid plans |
| `billingScheduler.test.js` | Expiration transitions | 6 tests | **YES** | **Completely misses `trialing` expiration** |
| `entitlementService.test.js`| Feature flags & quotas | 10 tests | **YES** | Does not test expired trial behavior |
| `subphase6c.test.js` | Quota & trial bootstrap | 6 tests | **YES** | Does not test concurrent branch creation |
| `mpesaSecurity.test.js` | POS M-Pesa webhooks | 8 tests | **YES** | None (Phase 2 security intact) |
| `phase3UserTenantSecurity.test.js` | User & tenant isolation | 15 tests | **YES** | None (Phase 3 security intact) |
| `phase4ProductInventorySecurity.test.js` | Catalog & Inventory | 12 tests | **YES** | None (Phase 4 security intact) |
| `phase4TransferIdempotency.test.js` | Stock transfer idempotency | 6 tests | **YES** | None (Phase 4 security intact) |

### Missing Security & Integrity Tests Required for Phase 5
1. **Trial Expiration Job Test:** A test verifying `checkAndTransitionExpiredSubscriptions` moves `trialing` subscriptions to `past_due` when `trialEndsAt < now`.
2. **Suspended Operation Block Test:** Tests asserting `POST /api/sales` and `POST /api/auth/login` reject suspended organizations.
3. **Concurrent Branch Quota Test:** Parallel execution of `POST /api/shops` asserting only allowed number of branches can be created.
4. **Invalid Plan Renewal Test:** Test attempting renewal with `planId: 4` (Grandfathered) expecting `400 Bad Request`.
5. **Downgrade Validation Test:** Test attempting to downgrade to Starter while maintaining multiple active branches.
6. **ShopAccess Management Test:** Test verifying owner can grant and revoke branch access to an admin.

---

## 11. Detailed Findings & Recommended Remediations

### Finding P0-01: Unenforced Trial Expiration (CRITICAL)
- **Component:** `backend/src/services/billingService.js:170-252`, `backend/src/services/entitlementService.js:104-179`
- **Current Behavior:** `checkAndTransitionExpiredSubscriptions` explicitly searches only for `status: 'active'` and `status: 'past_due'`. Subscriptions with `status: 'trialing'` are never queried. When a merchant's 14-day trial ends, the subscription remains `trialing` indefinitely. In addition, `entitlementService.js` does not check `trialEndsAt`.
- **Why It Matters:** Any user who signs up receives permanent, free access to Growth tier features (3 branches, 10 users, organization insights) without ever paying.
- **Evidence:**
  ```javascript
  // billingService.js:178-186
  const expiredActiveSubscriptions = await Subscription.findAll({
    where: {
      status: 'active', // <--- 'trialing' is completely missing!
      currentPeriodEnd: {
        [Op.lt]: currentDate,
        [Op.lte]: new Date('2090-01-01')
      }
    },
    include: [{ model: Plan, where: { code: { [Op.ne]: 'grandfathered' } } }]
  });
  ```
- **Recommended Remediation:**
  1. In `billingService.checkAndTransitionExpiredSubscriptions`, query subscriptions where `status = 'trialing'` and `trialEndsAt < currentDate`. Transition them to `past_due` (or `suspended`), update `Organization.status`, log activity, and invalidate the Redis entitlement cache.
  2. In `entitlementService.js`, add a check: if `status === 'trialing'` and `trialEndsAt < new Date()`, treat the subscription as expired/suspended.
- **Test Required:** A unit test setting `trialEndsAt` in the past and verifying both the scheduler transition and immediate entitlement rejection.

---

### Finding P0-02: Non-Enforcement of Subscription Suspension on Core Operational Endpoints (CRITICAL)
- **Component:** `backend/src/controllers/saleController.js`, `backend/src/middleware/auth.js`, `backend/src/controllers/authController.js:129`
- **Current Behavior:** When an organization is `suspended` for non-payment, only administrative expansion endpoints (`POST /api/shops`, `POST /api/employees`, `GET /api/insights/organization/*`) check subscription status. Core operational endpoints (`POST /api/sales`, `GET /api/products`, `PUT /api/products`, `POST /api/auth/login`) perform zero subscription checks.
- **Why It Matters:** A suspended organization can continue conducting daily store checkouts and operating their retail business indefinitely without settling past-due invoices.
- **Evidence:** `grep_search` across `saleController.js` and `authController.login` reveals zero references to `Subscription` or `Organization.status === 'suspended'`.
- **Recommended Remediation:**
  1. Create a lightweight `requireActiveSubscription` middleware (or incorporate into `auth.js`) that checks `Organization.status`.
  2. If `status === 'suspended'`, reject operational mutations (e.g. `POST /api/sales`) with `403 Subscription Suspended` and prompt to pay outstanding renewal invoices.
  3. Allow a grace period for `past_due` status, but hard-block on `suspended`.
- **Test Required:** Integration test confirming that an authenticated request to `POST /api/sales` by a member of a suspended organization returns `403`.

---

### Finding P0-03: Branch Quota Race Condition (CRITICAL)
- **Component:** `backend/src/controllers/shopController.js:61-80`
- **Current Behavior:** In `createShop`:
  ```javascript
  const currentActiveShopCount = await Shop.count({
    where: { organizationId: orgId, active: true }
  });
  const quotaResult = await entitlementService.checkQuota(orgId, 'maxShops', currentActiveShopCount);
  if (!quotaResult.allowed) { ... }
  // Transaction is started ONLY after the check!
  return await sequelize.transaction(async (t) => { ... });
  ```
- **Why It Matters:** Two concurrent `POST /api/shops` requests simultaneously observe `currentActiveShopCount = 1` against limit `2`. Both pass validation and create shops, resulting in 3 active shops on a 2-shop plan.
- **Evidence:** Unlike `staffCreationService.js:148-152` which acquires an exclusive row lock (`Organization.findByPk(orgId, { transaction: t, lock: t.LOCK.UPDATE })`), `shopController.js` performs the check outside the transaction.
- **Recommended Remediation:** Move the quota check inside the transaction and acquire a row lock on `Organization` before evaluating `Shop.count`.
- **Test Required:** A concurrency test submitting two simultaneous `POST /api/shops` requests on a plan with 1 available slot, confirming exactly one succeeds and the other returns `403 Upgrade Required`.

---

### Finding P1-01: Non-Functional Frontend Plan Switching & Renewal (HIGH)
- **Component:** `frontend/src/pages/Billing.jsx:455-473`
- **Current Behavior:** The "Available Tier" buttons in `Billing.jsx` have hardcoded `disabled` attributes with title `"Plan switching will be available in an upcoming release"`. There is no modal, button, or form to trigger M-Pesa STK push or Card renewal.
- **Why It Matters:** Even if a merchant wants to pay or upgrade, the application provides no UI path to do so.
- **Evidence:** `Billing.jsx` lines 464-472:
  ```jsx
  <button
    type="button"
    disabled
    className="w-full py-2.5 px-4 rounded-xl text-small font-semibold bg-surface-2 text-text-muted cursor-not-allowed border border-border-default"
    title="Plan switching will be available in an upcoming release"
  >
    Available Tier
  </button>
  ```
- **Recommended Remediation:** Implement an interactive `PlanUpgradeModal` or `RenewalModal` on `Billing.jsx` that prompts for payment channel (M-Pesa phone number or Card checkout), calls `POST /api/billing/subscription/renew`, and displays STK push progress or redirects to Flutterwave.
- **Test Required:** Frontend component test verifying that clicking "Upgrade" opens the payment modal and submits the renewal payload.

---

### Finding P1-02: Arbitrary / Inactive Plan Renewal Exploitation (HIGH)
- **Component:** `backend/src/services/billingService.js:53-62`, `backend/src/routes/billingRoutes.js:252-266`
- **Current Behavior:** `POST /api/billing/subscription/renew` accepts `planId` from the request body. `generateRenewalInvoice` queries `Plan.findByPk(targetPlanId)` without verifying that `plan.isActive === true` and without verifying `plan.code !== 'grandfathered'`.
- **Why It Matters:** An organization owner can inspect the network or guess `planId: 4` (Grandfathered plan), generating an invoice for KES 0.00 and permanently acquiring unlimited shops and users for free.
- **Evidence:**
  ```javascript
  // billingService.js:53-57
  const targetPlanId = planId || subscription.planId;
  const plan = await Plan.findByPk(targetPlanId);
  if (!plan) {
    throw new Error(`Plan with ID ${targetPlanId} not found.`);
  }
  // Missing check: if (!plan.isActive || plan.code === 'grandfathered')
  ```
- **Recommended Remediation:** Enforce validation:
  ```javascript
  if (!plan.isActive || plan.code === 'grandfathered') {
    throw new Error('Selected plan is not available for subscription.');
  }
  ```
- **Test Required:** API test sending `POST /api/billing/subscription/renew` with `planId: 4` asserting rejection with `400 Bad Request`.

---

### Finding P1-03: Missing Branch Access (`ShopAccess`) Administration APIs (HIGH)
- **Component:** `backend/src/routes/shop.js`, `backend/src/controllers/shopController.js`
- **Current Behavior:** `ShopAccess` models exist and enforce branch boundaries in `authController.switchShop` and `orgInsightsController.js`. However, there are no endpoints to view, grant, or revoke branch access for non-owner administrators.
- **Why It Matters:** Multi-branch merchants cannot delegate branch management to store managers without manual database manipulation.
- **Evidence:** `grep_search` across `backend/src` confirms `ShopAccess.destroy` is never called anywhere in application code.
- **Recommended Remediation:** Implement:
  - `GET /api/shops/:id/access`: List members with access to this branch.
  - `POST /api/shops/:id/access`: Grant branch access to a member.
  - `DELETE /api/shops/:id/access/:membershipId`: Revoke branch access.
  Guarded by `requireOrgOwner`.
- **Test Required:** Integration test verifying owner granting and revoking branch access for an administrator.

---

### Finding P1-04: Missing Tenant-Wide Member Administration APIs (HIGH)
- **Component:** `backend/src/controllers/employeeController.js:17-57`, `backend/src/controllers/userController.js`
- **Current Behavior:** `employeeController.getAllEmployees` filters strictly by `where: { shopId: req.user.shopId }`. An owner cannot view all staff across branches from one dashboard. Furthermore, `userController.js` lacks a delete/deactivate endpoint.
- **Why It Matters:** Owners of multi-branch stores are blind to their total employee headcount and cannot manage staff centrally.
- **Evidence:** `employeeController.js:20`: `const where = { shopId: req.user.shopId };`.
- **Recommended Remediation:** Add `GET /api/organizations/members` (guarded by `requireOrgAdmin`) that returns all active and suspended memberships across the organization, with their branch assignments and roles.
- **Test Required:** Test verifying an owner can query organization members across all branches.

---

### Finding P1-05: Missing Plan Downgrade Lifecycle & Resource Freezing (HIGH)
- **Component:** `backend/src/services/billingService.js:93-163`
- **Current Behavior:** When an organization on Growth (3 shops, 8 staff) renews with `planId = 1` (Starter: 1 shop, 2 staff), payment confirmation sets `subscription.planId = 1`. No validation is performed on whether the organization currently exceeds Starter quotas.
- **Why It Matters:** Existing branches and staff remain active and usable, allowing a merchant to pay Starter pricing while continuing to operate 3 branches and 8 staff.
- **Evidence:** `processConfirmedRenewal` updates `subscription.planId = invoice.planId` without checking existing active shop or user counts against the new plan's limits.
- **Recommended Remediation:**
  1. In `generateRenewalInvoice`, if `targetPlanId` has lower quotas than the current count of active branches or members, reject the downgrade until the owner deactivates excess branches or members.
  2. Alternatively, implement an automatic freezing policy for excess resources.
- **Test Required:** Test attempting to generate a renewal invoice for Starter plan when organization has 2 active shops, verifying rejection with explanation of excess resources.

---

## 12. Recommended Remediation Phases & Implementation Scope

To achieve complete production readiness for Phase 5 without destabilizing existing functionality, the remediation should be executed in 4 sequenced sub-phases:

```text
Phase 5A: Billing Security & Lifecycle Integrity
├── P0-01: Fix Trial Expiration in Scheduler & EntitlementService
├── P1-02: Prevent Unauthorized Plan / Grandfathered Renewal
└── P2-03: Implement Subscription Cancellation Endpoint

Phase 5B: Operational Quota & Enforcement Hardening
├── P0-02: Enforce Subscription Suspension on POS Sales & Login
├── P0-03: Fix Branch Quota Concurrency Race Condition (Row Lock)
├── P1-05: Enforce Downgrade Quota Validation
└── P2-01: Gate AI Proxy Endpoints by Entitlement

Phase 5C: Multi-Branch Organization Administration
├── P1-03: Implement ShopAccess Grant / Revoke Endpoints
├── P1-04: Implement Organization-Wide Member Listing & Revocation
├── P2-02: Synchronize User / Employee Role Changes with Memberships
└── P2-04: Implement Branch Deactivation / Archival Endpoints

Phase 5D: Frontend Billing & Checkout Integration
├── P1-01: Implement Plan Switching & Renewal Checkout UI Modal
├── Wire M-Pesa STK Push and Card Payment Flows
└── Test End-to-End Trial -> Renewal -> Multi-Branch Lifecycle in Browser
```

### Explicit Dependencies Between Fixes
1. **Phase 5A must precede 5B:** The scheduler and lifecycle transitions must be correct before enforcing suspension blocks on operational endpoints.
2. **Phase 5B must precede 5C:** Quota checks and concurrency locks must be in place before exposing new branch access and member administration APIs.
3. **Phase 5C must precede 5D:** Administrative and renewal endpoints must be fully functional and tested before wiring frontend modals and checkout flows.

---

## 13. Production Risks & Mitigation

| Production Risk | Severity | Mitigation Strategy |
| :--- | :--- | :--- |
| **Accidental lockout of legitimate merchants during subscription transition** | High | Implement a 7-day `past_due` grace period where POS checkout remains functional with a visible warning banner, locking down only when transitioned to `suspended`. |
| **Grandfathered merchant disruption** | Critical | Maintain strict year-2099 guards (`currentPeriodEnd: { [Op.lte]: new Date('2090-01-01') }`) and plan code exclusions (`code: { [Op.ne]: 'grandfathered' }`) across all transition queries. |
| **Deadlocks during concurrent branch creation** | Medium | Use ordered row locking: always lock `Organization` row first before reading or inserting `Shops`. |
| **Payment webhook race conditions** | Medium | Maintain the existing Phase 2 pattern: pessimistic `t.LOCK.UPDATE` on the `SubscriptionInvoice` row inside an atomic transaction. |

---

## 14. Hard Stop & Status

**AUDIT COMPLETE.**

In accordance with strict operating rules:
- **No application code was modified.**
- **No database schemas or migrations were altered.**
- **No tests were executed or edited.**
- **No Phase 5 remediation has been initiated.**

Awaiting human review and explicit approval of `docs/saas/PHASE-5-CURRENT-STATE-AUDIT.md` before proceeding to implementation planning.
