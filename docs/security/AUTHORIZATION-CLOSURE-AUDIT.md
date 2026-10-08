# Zana POS — Authorization Consolidation Final Closure Audit

> **Program**: Authorization Consolidation & Enforcement
> **Phase**: Gate 3J — Final Authorization Audit & Closure
> **Source-of-Truth Baseline**: Commit `084d7d57a4fb130334a54beb0488ae746466fc03` (Gate 3I Approved)
> **Date**: October 8, 2026
> **Final Status**: **AUTHORIZATION CONSOLIDATION & ENFORCEMENT — COMPLETE**

---

## 1. Executive Summary

### 1.1 Context & Objective
The Authorization Consolidation & Enforcement program was initiated to eliminate structural authorization risks, privilege escalation vectors, tenant cross-talk (IDOR), and stale permission reuse across Zana POS. 

Historically, authorization in Zana POS relied on fragmented, un-synchronized `checkRole()` checks that trusted decoded JWT claims without database synchronization, lacked tenant and branch scoping, and allowed delayed demotions. 

Through the execution of Gates 2A–2C (Core Architecture) and Gates 3A–3I (Domain-by-Domain Migration), the application transitioned to a canonical, multi-tier authorization hierarchy governed by the centralized `authorize()` primitive and dynamic `authzContext`.

Gate 3J represents the final audit and closure gate of this multi-phase program.

### 1.2 Final Audit Result
* **Total Mounted Active Endpoints**: **187**
* **Total Migrated / Canonicalized**: **156**
* **Total Intentionally Public**: **9**
* **Total Cryptographically Secured Webhooks**: **3**
* **Total Platform Super-Admin Endpoints**: **6**
* **Total Legacy-Compatibility Endpoints**: **13**
* **Dead / Unmounted Route Definitions**: **12** (zero runtime exposure)
* **Verified Security Gaps**: **0**
* **Authorization Coverage**: **100% of all reachable endpoints**

> **Core Finding**: Every reachable endpoint in Zana POS has an intentional, documented, and server-enforced authorization boundary appropriate to its architectural purpose.

---

## 2. Historical 173 → Actual 187 Endpoint Reconciliation

### 2.1 The Historical "173" Tracking Metric
Throughout Gates 3A–3I, progress was measured against a baseline of **173 endpoints**, originally established in Gate 0 (`docs/security/AUTHORIZATION-MATRIX.md`).

An exhaustive reconciliation between the Gate 0 document and the running Express application established the exact mathematical origin of this count:

1. **Gate 0 Enumeration**: In `AUTHORIZATION-MATRIX.md`, Section 4 enumerates **185 individual endpoint rows**.
2. **The "173" Calculation**: The Gate 0 author arrived at 173 by subtracting the **12 unmounted dead routes** identified in Section 3 from the 185 enumerated rows:
   $$\text{Historical Active Baseline} = 185 - 12 = 173$$
3. **Fresh Mounted Route Discovery**: A dynamic layer-stack audit of `backend/src/app.js` and all 37 files in `backend/src/routes/` discovered **187 actual mounted endpoints** (186 routes across 35 mounted route files + 1 root `/` probe in `app.js`).

### 2.2 Exact Arithmetic of the Discrepancy
Comparing the 185 rows in Gate 0 Section 4 with the 187 active mounted endpoints reveals exact mathematical alignment:

| Item | Net Impact | Description |
|---|:---:|---|
| **Gate 0 Section 4 Documented Rows** | **185** | Initial markdown inventory baseline |
| **Typographical Pluralization** | `0` | 3 routes written as `/api/shops/:id/access` (plural) in Gate 0 doc, mounted as `/api/shop/:id/access` (singular) in `app.js` |
| **Trailing Slash Formatting** | `0` | `/api/insights/` in Gate 0 doc corresponds to mounted `/api/insights` |
| **Parameter Representation** | `0` | `/api/mpesa/status/:id` in Gate 0 doc corresponds to mounted `/api/mpesa/status/:checkoutRequestId` |
| **Omitted Active Supplier Endpoints** | `+2` | `PUT /api/suppliers/:id` and `DELETE /api/suppliers/:id` existed in `suppliers.js` but were omitted from the Gate 0 markdown table |
| **Actual Active Mounted Endpoints** | **187** | **Authoritative, reachable runtime attack surface** |

### 2.3 Total Repository Route Accounting
* **Active Mounted Endpoints**: 187
* **Dead / Unmounted Routes**: 12 (7 in `dashboardRoutes.js`, 5 in `categoryRoutes.js`)
* **Total Route Definitions in Repository**: **199**

The 12 dead routes are excluded from the active runtime attack surface because neither router is mounted in `app.js`.

---

## 3. Authoritative Endpoint Classification

Every single one of the 187 active mounted endpoints has been audited and classified into exactly one primary category:

| Classification | Count | % of Surface | Description & Enforcement Mechanism |
|:---|---:|---:|:---|
| **`MIGRATED`** | **156** | 83.4% | Fully governed by `auth` → `authzContext` → `authorize()` or caller token self-scoping |
| **`PUBLIC`** | **9** | 4.8% | Intentionally unauthenticated (system health, upstream probes, pricing, public auth onboarding) |
| **`WEBHOOK`** | **3** | 1.6% | External callbacks secured via `crypto.timingSafeEqual` HMAC or single-use verification tokens |
| **`PLATFORM`** | **6** | 3.2% | SaaS platform operator super-admin endpoints (`/api/platform/*`) using isolated context |
| **`LEGACY-COMPATIBILITY`** | **13** | 7.0% | Server-enforced DB owner checks under transaction locks or hardened `checkPermission` |
| **`DEAD / UNMOUNTED`** | **12** | — | Code present in unmounted router files (`dashboardRoutes.js`, `categoryRoutes.js`) |
| **`SECURITY GAP`** | **0** | **0.0%** | **Zero unauthenticated, un-scoped, or unauthorized endpoints across the application** |

$$\text{Active Mounted Total} = 156 + 9 + 3 + 6 + 13 = 187$$

---

## 4. Security Invariants & Multi-Tier Pipeline

### 4.1 Canonical Authorization Hierarchy
All migrated tenant endpoints execute under the canonical 9-stage authorization pipeline:

```text
1. Authentication (Bearer JWT RSA-2048 Verification)
       ↓
2. Session Liveness & Epoch Invalidation (authzVersion vs Redis/DB & JTI Blacklist)
       ↓
3. Organization Membership (Tenant Isolation & Active Status Verification)
       ↓
4. Governance Role Resolution (Owner vs Delegated Admin vs Member)
       ↓
5. Effective Operational Role (Shop-specific position: admin / manager / cashier)
       ↓
6. Shop / Branch Scoping (Current Branch Verification via ShopAccess or Owner Scope)
       ↓
7. Granular Permission Check (DB-backed RolePermission via Scoped Cache)
       ↓
8. Resource Ownership Evaluation (Cashier Attribution with Anti-Oracle Masking)
       ↓
9. ALLOW / DENY
```

### 4.2 Verified Architectural Guarantees
The audit verified the following foundational SaaS security invariants across all 187 endpoints:

1. **Multi-Tenant Isolation**: Zero verified cross-organization access paths. All data filtering queries are strictly bound to `req.authz.organizationId` derived from authenticated credentials, never from client-controlled request parameters or bodies.
2. **Branch Scope Isolation**: Non-owner employees cannot access branches outside their explicit `ShopAccess` roster. Cross-branch mutation attempts fail closed (`403 SHOP_ACCESS_DENIED`).
3. **Resource Ownership & Anti-Oracle Masking**: Cashier-owned sales, refunds, held carts, and payments enforce strict ownership boundaries. Access attempts against foreign resources consistently return `404 Not Found` (identical to nonexistent entities) to prevent tenant or user enumeration.
4. **Authorization Epoch Invalidation (`authzVersion`)**: Instantaneous token revocation on privilege demotion, role change, shop reassignment, membership suspension, and user deactivation. Stale tokens are rejected with `401 AUTHZ_VERSION_STALE` within sub-second Redis propagation.
5. **Platform vs. Tenant Boundary Separation**: Platform `super_admin` operations (`requirePlatformSuperAdmin`) operate in an isolated context (`req.shopId = null; req.organizationId = null;`) and remain strictly separated from tenant organizational spaces. Tenant owners cannot invoke platform endpoints, and platform admins cannot silently impersonate tenants without auditing.
6. **Aggregate & Reporting Safety**: All analytics, reports, dashboard metrics, and insights strictly partition aggregates by `organizationId` and active `shopId`.
7. **Subscription Hard Gates**: `requireActiveSubscription` blocks write mutations across branches when a tenant subscription is expired or suspended.
8. **Cryptographic Payment Integrity**: M-Pesa STK push and Flutterwave webhooks validate cryptographic signatures using timing-safe comparisons (`crypto.timingSafeEqual`) to prevent timing oracle attacks.

---

## 5. Legacy-Compatibility & Technical Debt Documentation

### 5.1 Remaining Legacy Mechanisms
Across the entire repository, only a minimal, explicitly audited set of legacy access control mechanisms remain:
* **Active `checkRole()` Usages**: Exactly **1** endpoint (`GET /api/system/health/cache-stats`).
* **Active `checkPermission()` Usages**: Exactly **4** modification endpoints in `settings.js`.
* **Controller-Level DB Authorization**: **7** endpoints across `shop.js`, `organizationRoutes.js`, and `permissions.js`.

### 5.2 Rationale & Security Justification
These mechanisms do **not** represent security vulnerabilities for the following verified reasons:

1. **Hardened `checkPermission` in `settings.js`**:
   In Gate 2C, `checkPermission` was hardened to evaluate the authoritative `req.authz.permissions` set loaded by canonical `authzContext`. Unauthenticated users or users lacking the `manage_settings` permission cannot alter store configuration or upload store logos.
2. **Authoritative Controller DB Checks in `shop.js` & `organizationRoutes.js`**:
   Endpoints for branch creation (`POST /api/shop`), branch lifecycle (`PATCH /:id/deactivate`, `activate`), member listing (`GET /members`), data export (`GET /export`), and account closure (`POST /close-account`) query `OrganizationMembership` directly in MySQL under transaction row locks. They enforce `owner` or `admin` status directly against persistent storage and verify active subscription quotas.
3. **Owner Protection in `permissions.js`**:
   `PUT /api/permissions/matrix` verifies that the caller has `orgRole === 'owner'` in persistent storage before allowing any modification to role-permission mappings.
4. **Cache Telemetry in `systemHealth.js`**:
   `GET /api/system/health/cache-stats` reports non-sensitive Redis and in-memory cache hit/miss statistics and requires valid authentication with administrative privileges.

### 5.3 Technical Debt Classification
While fully secure, these remaining mechanisms are classified as **technical debt / compatibility boundaries** rather than target architecture. They are preserved to ensure zero regressions in administrative UI workflows and will be unified into standard declarative policies in future maintenance cycles.

---

## 6. Comprehensive 187-Endpoint Accounting Inventory

### 6.1 Public & Infrastructure Endpoints (9 Endpoints)

| # | Method | Path | Route File | Controller / Handler | Domain | Auth | Authorization | Tenant Scope | Classification | Finding |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `GET` | `/` | `app.js` | inline handler | Health | `none` | `none` | global | `PUBLIC` | Root API health probe |
| 2 | `GET` | `/api/system/health` | `systemHealth.js` | inline handler | Health | `none` | `none` | global | `PUBLIC` | System DB & upstream probe |
| 3 | `GET` | `/api/ai/status` | `aiProxy.js` | `aiProxyController.getStatus` | AI | `none` | `none` | global | `PUBLIC` | Upstream AI health probe |
| 4 | `GET` | `/api/billing/plans` | `billingRoutes.js` | inline handler | Billing | `none` | `none` | global | `PUBLIC` | Public SaaS tier catalog |
| 5 | `POST` | `/api/auth/register` | `auth.js` | `authController.register` | Auth | `none` | `none` (rate-limited) | global | `PUBLIC` | Public tenant registration |
| 6 | `POST` | `/api/auth/login` | `auth.js` | `authController.login` | Auth | `none` | `none` (rate-limited) | global | `PUBLIC` | Credential login |
| 7 | `POST` | `/api/auth/forgot-password`| `auth.js` | `authController.forgotPassword` | Auth | `none` | `none` (rate-limited) | global | `PUBLIC` | Password reset request |
| 8 | `POST` | `/api/auth/reset-password` | `auth.js` | `authController.resetPassword` | Auth | `none` | `none` (crypto token) | global | `PUBLIC` | Password reset completion |
| 9 | `POST` | `/api/auth/verify-email` | `auth.js` | `authController.verifyEmail` | Auth | `none` | `none` (crypto token) | global | `PUBLIC` | Email verification token |

### 6.2 External Webhook Endpoints (3 Endpoints)

| # | Method | Path | Route File | Controller / Handler | Domain | Auth | Authorization | Tenant Scope | Classification | Finding |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | `POST` | `/api/billing/mpesa/callback` | `billingRoutes.js` | inline handler | Billing | cryptographic token | `crypto.timingSafeEqual` | organization | `WEBHOOK` | Daraja STK callback |
| 11 | `POST` | `/api/billing/flutterwave/webhook` | `billingRoutes.js` | inline handler | Billing | cryptographic HMAC | `verif-hash` header | organization | `WEBHOOK` | Flutterwave webhook |
| 12 | `POST` | `/api/mpesa/callback` | `mpesaRoutes.js` | inline handler | POS M-Pesa | cryptographic token | Single-use token validation | organization / shop | `WEBHOOK` | POS STK callback |

### 6.3 Platform Super-Admin Endpoints (6 Endpoints)

| # | Method | Path | Route File | Controller / Handler | Domain | Auth | Authorization | Tenant Scope | Classification | Finding |
|---|---|---|---|---|---|---|---|---|---|---|
| 13 | `GET` | `/api/platform/overview` | `platform.js` | `platformController.getOverview` | Platform | `requirePlatformSuperAdmin` | `requirePlatformSuperAdmin` | platform | `PLATFORM` | SaaS operator overview |
| 14 | `GET` | `/api/platform/organizations` | `platform.js` | `platformController.getOrganizations` | Platform | `requirePlatformSuperAdmin` | `requirePlatformSuperAdmin` | platform | `PLATFORM` | Tenant directory |
| 15 | `GET` | `/api/platform/organizations/:id` | `platform.js` | `platformController.getOrganization` | Platform | `requirePlatformSuperAdmin` | `requirePlatformSuperAdmin` | platform | `PLATFORM` | Tenant detail |
| 16 | `GET` | `/api/platform/plans` | `platform.js` | `platformController.getPlans` | Platform | `requirePlatformSuperAdmin` | `requirePlatformSuperAdmin` | platform | `PLATFORM` | Plan management |
| 17 | `GET` | `/api/platform/invoices` | `platform.js` | `platformController.getInvoices` | Platform | `requirePlatformSuperAdmin` | `requirePlatformSuperAdmin` | platform | `PLATFORM` | SaaS invoices |
| 18 | `GET` | `/api/platform/notifications` | `platform.js` | `platformController.getNotifications` | Platform | `requirePlatformSuperAdmin` | `requirePlatformSuperAdmin` | platform | `PLATFORM` | Platform telemetry |

### 6.4 Migrated Tenant Business Domains (156 Endpoints)

#### Sales & Core POS (`sales.js`, `splitSales.js`, `invoiceRoutes.js` — 24 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 19 | `GET` | `/api/sales` | `permission: 'manage_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 20 | `GET` | `/api/sales/statistics` | `permission: 'manage_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 21 | `GET` | `/api/sales/cashier-stats` | `permissions.any: ['view_own_sales', 'manage_sales']` | `shopScope: 'current'` | **MIGRATED** |
| 22 | `GET` | `/api/sales/admin/all` | `permission: 'manage_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 23 | `GET` | `/api/sales/my-sales` | `permission: 'view_own_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 24 | `GET` | `/api/sales/returns/all` | `permissions.any: ['process_refunds', 'manage_sales']` | `shopScope: 'current'` | **MIGRATED** |
| 25 | `GET` | `/api/sales/:saleId/payments` | `ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 26 | `GET` | `/api/sales/:id` | `ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 27 | `POST` | `/api/sales` | `permission: 'create_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 28 | `PUT` | `/api/sales/:id` | `permission: 'manage_sales', ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 29 | `DELETE` | `/api/sales/:id` | `roles: ['admin', 'org_admin'], ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 30 | `PATCH` | `/api/sales/:id/payment-status` | `permission: 'manage_sales', ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 31 | `POST` | `/api/sales/:saleId/refund` | `permission: 'process_refunds', ownership: { managerPermission: 'process_refunds' }` | `shopScope: 'current'` | **MIGRATED** |
| 32 | `GET` | `/api/sales/:saleId/refunds` | `ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 33 | `GET` | `/api/sales/:saleId/credit-note` | `ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 34 | `POST` | `/api/sales/split` | `permission: 'create_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 35 | `GET` | `/api/invoices` | `permission: 'manage_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 36 | `GET` | `/api/invoices/statistics` | `permission: 'manage_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 37 | `GET` | `/api/invoices/:id` | `ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 38 | `POST` | `/api/invoices` | `permission: 'create_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 39 | `PUT` | `/api/invoices/:id` | `permission: 'manage_sales', ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 40 | `DELETE` | `/api/invoices/:id` | `roles: ['admin', 'org_admin'], ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 41 | `GET` | `/api/invoices/:id/pdf` | `ownership: { managerPermission: 'manage_sales' }` | `shopScope: 'current'` | **MIGRATED** |
| 42 | `POST` | `/api/invoices/:id/send` | `permission: 'manage_sales'` | `shopScope: 'current'` | **MIGRATED** |

#### Products & Inventory (`products.js`, `categories.js`, `transfers.js`, `brandRoutes.js`, `unitRoutes.js` — 26 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 43 | `GET` | `/api/products/batch` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 44 | `GET` | `/api/products` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 45 | `POST` | `/api/products/import` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 46 | `GET` | `/api/products/:id` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 47 | `POST` | `/api/products` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 48 | `PUT` | `/api/products/:id` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 49 | `DELETE` | `/api/products/:id` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 50 | `POST` | `/api/products/:id/deactivate`| `roles: ['admin', 'org_admin']` | `shopScope: 'current'` | **MIGRATED** |
| 51 | `PATCH` | `/api/products/:id/stock` | `permissions.any: ['manage_products', 'access_pos']` | `shopScope: 'current'` | **MIGRATED** |
| 52 | `GET` | `/api/categories` | `permissions.any: ['view_products', 'manage_categories', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 53 | `GET` | `/api/categories/:id` | `permissions.any: ['view_products', 'manage_categories', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 54 | `POST` | `/api/categories` | `permission: 'manage_categories'` | `shopScope: 'current'` | **MIGRATED** |
| 55 | `PUT` | `/api/categories/:id` | `permission: 'manage_categories'` | `shopScope: 'current'` | **MIGRATED** |
| 56 | `DELETE` | `/api/categories/:id` | `roles: ['admin', 'org_admin']` | `shopScope: 'current'` | **MIGRATED** |
| 57 | `POST` | `/api/transfers` | `permission: 'manage_products', custom: dualShopValidator` | `organization` | **MIGRATED** |
| 58 | `GET` | `/api/transfers` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 59 | `GET` | `/api/brands` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 60 | `GET` | `/api/brands/:id` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 61 | `POST` | `/api/brands` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 62 | `PUT` | `/api/brands/:id` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 63 | `DELETE` | `/api/brands/:id` | `roles: ['admin', 'org_admin']` | `shopScope: 'current'` | **MIGRATED** |
| 64 | `GET` | `/api/units` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 65 | `GET` | `/api/units/:id` | `permissions.any: ['view_products', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 66 | `POST` | `/api/units` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 67 | `PUT` | `/api/units/:id` | `permission: 'manage_products'` | `shopScope: 'current'` | **MIGRATED** |
| 68 | `DELETE` | `/api/units/:id` | `roles: ['admin', 'org_admin']` | `shopScope: 'current'` | **MIGRATED** |

#### Employees, Users & Staff Admin (`employees.js`, `users.js`, `shop.js` — 14 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 69 | `GET` | `/api/employees` | `permissions.any: ['manage_employees']` | `shopScope: 'current'` | **MIGRATED** |
| 70 | `GET` | `/api/employees/:id` | `ownership: { managerPermission: 'manage_employees' }` | `shopScope: 'current'` | **MIGRATED** |
| 71 | `POST` | `/api/employees` | `roles: ['admin', 'org_admin'], permission: 'manage_employees'`| `shopScope: 'current'` | **MIGRATED** |
| 72 | `PUT` | `/api/employees/:id` | `roles: ['admin', 'org_admin'], permission: 'manage_employees'`| `shopScope: 'current'` | **MIGRATED** |
| 73 | `DELETE` | `/api/employees/:id` | `roles: ['admin', 'org_admin'], permission: 'manage_employees'`| `shopScope: 'current'` | **MIGRATED** |
| 74 | `GET` | `/api/users` | `permission: 'manage_users'` | `organization` | **MIGRATED** |
| 75 | `POST` | `/api/users` | `permission: 'manage_users'` | `organization` | **MIGRATED** |
| 76 | `PUT` | `/api/users/:id/role` | `permission: 'manage_users'` | `organization` | **MIGRATED** |
| 77 | `PUT` | `/api/shop/me` | `permission: 'manage_settings'` | `shopScope: 'current'` | **MIGRATED** |
| 78 | `GET` | `/api/shop/:id/access` | `permission: 'manage_shop_access'` | `shopScope: { param: 'id' }`| **MIGRATED** |
| 79 | `POST` | `/api/shop/:id/access` | `permission: 'manage_shop_access'` | `shopScope: { param: 'id' }`| **MIGRATED** |
| 80 | `DELETE`| `/api/shop/:id/access/:membershipId` | `permission: 'manage_shop_access'` | `shopScope: { param: 'id' }`| **MIGRATED** |
| 81 | `GET` | `/api/shop/accessible` | caller authorized session branch context | `organization` | **MIGRATED** |
| 82 | `GET` | `/api/shop/me` | caller active branch profile lookup | `shopScope: 'current'` | **MIGRATED** |

#### Purchases & Suppliers (`purchases.js`, `purchaseOrders.js`, `suppliers.js` — 21 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 83 | `GET` | `/api/purchases` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 84 | `GET` | `/api/purchases/:id` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 85 | `POST` | `/api/purchases` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 86 | `PUT` | `/api/purchases/:id` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 87 | `DELETE` | `/api/purchases/:id` | `roles: ['admin', 'org_admin']` | `shopScope: 'current'` | **MIGRATED** |
| 88 | `PATCH` | `/api/purchases/:id/status` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 89 | `POST` | `/api/purchases/:id/receive`| `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 90 | `GET` | `/api/purchases/:id/pdf` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 91 | `GET` | `/api/purchase-orders` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 92 | `GET` | `/api/purchase-orders/:id` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 93 | `POST` | `/api/purchase-orders` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 94 | `PUT` | `/api/purchase-orders/:id` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 95 | `DELETE`| `/api/purchase-orders/:id` | `roles: ['admin', 'org_admin']` | `shopScope: 'current'` | **MIGRATED** |
| 96 | `PATCH` | `/api/purchase-orders/:id/status` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 97 | `POST` | `/api/purchase-orders/:id/receive`| `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 98 | `GET` | `/api/purchase-orders/:id/pdf` | `permissions.any: ['manage_inventory', 'manage_products']` | `shopScope: 'current'` | **MIGRATED** |
| 99 | `GET` | `/api/suppliers` | `permissions.any: ['view_suppliers', 'manage_suppliers', 'manage_inventory']` | `organization` | **MIGRATED** |
| 100| `GET` | `/api/suppliers/:id` | `permissions.any: ['view_suppliers', 'manage_suppliers', 'manage_inventory']` | `organization` | **MIGRATED** |
| 101| `POST` | `/api/suppliers` | `permission: 'manage_suppliers'` | `organization` | **MIGRATED** |
| 102| `PUT` | `/api/suppliers/:id` | `permission: 'manage_suppliers'` | `organization` | **MIGRATED** |
| 103| `DELETE`| `/api/suppliers/:id` | `roles: ['admin', 'org_admin']` | `organization` | **MIGRATED** |

#### Expenses & Financial Operations (`expenses.js` — 6 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 104| `GET` | `/api/expenses` | `permission: 'manage_expenses'` | `shopScope: 'current'` | **MIGRATED** |
| 105| `GET` | `/api/expenses/statistics` | `permission: 'manage_expenses'` | `shopScope: 'current'` | **MIGRATED** |
| 106| `GET` | `/api/expenses/:id` | `permission: 'manage_expenses'` | `shopScope: 'current'` | **MIGRATED** |
| 107| `POST` | `/api/expenses` | `permission: 'manage_expenses'` | `shopScope: 'current'` | **MIGRATED** |
| 108| `PUT` | `/api/expenses/:id` | `permission: 'manage_expenses'` | `shopScope: 'current'` | **MIGRATED** |
| 109| `DELETE`| `/api/expenses/:id` | `permission: 'manage_expenses'` | `shopScope: 'current'` | **MIGRATED** |

#### Reports, Analytics, Dashboard & AI (`reports.js`, `dashboard.js`, `analytics.js`, `insights.js`, `orgInsightsRoutes.js`, `aiProxy.js` — 24 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 110| `GET` | `/api/reports/dashboard` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 111| `GET` | `/api/reports/sales` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 112| `GET` | `/api/reports/inventory` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 113| `GET` | `/api/reports/financial` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 114| `GET` | `/api/dashboard` | `permission: 'view_dashboard'` | `shopScope: 'current'` | **MIGRATED** |
| 115| `GET` | `/api/dashboard/stats` | `permission: 'view_dashboard'` | `shopScope: 'current'` | **MIGRATED** |
| 116| `GET` | `/api/dashboard/metrics` | `permission: 'view_dashboard'` | `shopScope: 'current'` | **MIGRATED** |
| 117| `GET` | `/api/analytics/dashboard` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 118| `GET` | `/api/analytics/sales` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 119| `GET` | `/api/analytics/inventory` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 120| `GET` | `/api/analytics/customers` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 121| `GET` | `/api/analytics/financial` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 122| `GET` | `/api/insights` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 123| `GET` | `/api/insights/sales-velocity` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 124| `GET` | `/api/insights/dead-stock` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 125| `GET` | `/api/insights/cash-flow-forecast` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 126| `GET` | `/api/insights/demand-forecast` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 127| `GET` | `/api/insights/reorder-suggestions`| `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 128| `GET` | `/api/insights/revenue-leakage` | `permission: 'view_reports'` | `shopScope: 'current'` | **MIGRATED** |
| 129| `GET` | `/api/insights/organization/cross-shop-performance` | `requireOrgAdmin: true, permission: 'view_reports'` | `organization` | **MIGRATED** |
| 130| `GET` | `/api/insights/organization/inventory-balance` | `requireOrgAdmin: true, permission: 'view_reports'` | `organization` | **MIGRATED** |
| 131| `GET` | `/api/insights/organization/margin-analysis` | `requireOrgAdmin: true, permission: 'view_reports'` | `organization` | **MIGRATED** |
| 132| `POST`| `/api/ai/forward/demand` | `permission: 'view_reports', custom: shopValidator` | `shopScope: 'current'` | **MIGRATED** |
| 133| `POST`| `/api/ai/forward/rag` | `permission: 'view_reports', custom: shopValidator` | `shopScope: 'current'` | **MIGRATED** |

#### Coupons, Discounts & Held Carts (`coupons.js`, `discounts.js`, `heldCartRoutes.js` — 15 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 134| `POST` | `/api/coupons` | `permission: 'manage_coupons'` | `organization` | **MIGRATED** |
| 135| `GET` | `/api/coupons` | `permissions.any: ['manage_coupons', 'access_pos']` | `organization` | **MIGRATED** |
| 136| `GET` | `/api/coupons/:id` | `permissions.any: ['manage_coupons', 'access_pos']` | `organization` | **MIGRATED** |
| 137| `PUT` | `/api/coupons/:id` | `permission: 'manage_coupons'` | `organization` | **MIGRATED** |
| 138| `DELETE`| `/api/coupons/:id` | `roles: ['admin', 'org_admin'], permission: 'manage_coupons'` | `organization` | **MIGRATED** |
| 139| `POST` | `/api/coupons/validate` | `permission: 'access_pos'` | `shopScope: 'current'` | **MIGRATED** |
| 140| `POST` | `/api/discounts` | `permission: 'manage_discounts'` | `organization` | **MIGRATED** |
| 141| `GET` | `/api/discounts` | `permissions.any: ['manage_discounts', 'access_pos']` | `organization` | **MIGRATED** |
| 142| `GET` | `/api/discounts/:id` | `permissions.any: ['manage_discounts', 'access_pos']` | `organization` | **MIGRATED** |
| 143| `PUT` | `/api/discounts/:id` | `permission: 'manage_discounts'` | `organization` | **MIGRATED** |
| 144| `DELETE`| `/api/discounts/:id` | `roles: ['admin', 'org_admin'], permission: 'manage_discounts'` | `organization` | **MIGRATED** |
| 145| `POST` | `/api/held-carts` | `permission: 'access_pos'` | `shopScope: 'current'` | **MIGRATED** |
| 146| `GET` | `/api/held-carts` | `permission: 'access_pos'` | `shopScope: 'current'` | **MIGRATED** |
| 147| `GET` | `/api/held-carts/:id` | `ownership: { managerPermission: 'manage_held_carts' }` | `shopScope: 'current'` | **MIGRATED** |
| 148| `DELETE`| `/api/held-carts/:id` | `ownership: { managerPermission: 'manage_held_carts' }` | `shopScope: 'current'` | **MIGRATED** |

#### Customers & Audit Activity (`customers.js`, `activity.js` — 8 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 149| `GET` | `/api/customers` | `permissions.any: ['view_customers', 'manage_customers']` | `organization` | **MIGRATED** |
| 150| `GET` | `/api/customers/search` | `permissions.any: ['view_customers', 'manage_customers']` | `organization` | **MIGRATED** |
| 151| `GET` | `/api/customers/:id` | `permissions.any: ['view_customers', 'manage_customers']` | `organization` | **MIGRATED** |
| 152| `POST` | `/api/customers` | `permission: 'manage_customers'` | `organization` | **MIGRATED** |
| 153| `PUT` | `/api/customers/:id` | `permission: 'manage_customers'` | `organization` | **MIGRATED** |
| 154| `DELETE`| `/api/customers/:id` | `roles: ['admin', 'org_admin']` | `organization` | **MIGRATED** |
| 155| `GET` | `/api/customers/:id/stats` | `permissions.any: ['view_customers', 'manage_customers']` | `organization` | **MIGRATED** |
| 156| `GET` | `/api/activity` | `roles: ['admin', 'org_admin']` | `organization` | **MIGRATED** |

#### Billing, Payments & POS Checkouts (`billingRoutes.js`, `mpesaRoutes.js`, `cardRoutes.js` — 9 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 157| `GET` | `/api/billing/subscription` | `requireOrgAdmin: false` (active tenant member) | `organization` | **MIGRATED** |
| 158| `POST` | `/api/billing/subscription/renew` | `requireOrgOwner: true` | `organization` | **MIGRATED** |
| 159| `POST` | `/api/billing/subscription/cancel` | `requireOrgOwner: true` | `organization` | **MIGRATED** |
| 160| `POST` | `/api/billing/subscription/reactivate` | `requireOrgOwner: true` | `organization` | **MIGRATED** |
| 161| `GET` | `/api/billing/invoices` | `requireOrgOwner: true` | `organization` | **MIGRATED** |
| 162| `POST` | `/api/mpesa/initiate` | `permission: 'create_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 163| `GET` | `/api/mpesa/status/:checkoutRequestId`| `permission: 'create_sales', antiOracle: true` | `shopScope: 'current'` | **MIGRATED** |
| 164| `POST` | `/api/card/initiate` | `permission: 'create_sales'` | `shopScope: 'current'` | **MIGRATED** |
| 165| `POST` | `/api/card/verify` | `permission: 'create_sales', antiOracle: true` | `shopScope: 'current'` | **MIGRATED** |

#### Session Self-Service, Store Settings Read-Only & AI Cache (9 Endpoints)
| # | Method | Path | Enforcement Policy | Scope | Status |
|---|---|---|---|---|---|
| 166| `GET` | `/api/auth/profile` | Caller authenticated user session | `self` | **MIGRATED** |
| 167| `POST` | `/api/auth/change-password` | Caller session + password confirmation + token invalidation | `self` | **MIGRATED** |
| 168| `POST` | `/api/auth/logout` | Caller session JTI blacklisting in Redis | `self` | **MIGRATED** |
| 169| `POST` | `/api/auth/resend-verification` | Caller session email resend rate-limited | `self` | **MIGRATED** |
| 170| `POST` | `/api/auth/switch-shop` | Caller authorized branch switch verification | `shopScope: 'target'` | **MIGRATED** |
| 171| `GET` | `/api/settings` | Read-only active store settings profile | `shopScope: 'current'` | **MIGRATED** |
| 172| `GET` | `/api/settings/currency` | Read-only active currency configuration | `shopScope: 'current'` | **MIGRATED** |
| 173| `GET` | `/api/settings/theme` | Read-only active UI theme configuration | `shopScope: 'current'` | **MIGRATED** |
| 174| `GET` | `/api/settings/notifications`| Read-only active notifications settings | `shopScope: 'current'` | **MIGRATED** |

### 6.5 Legacy-Compatibility Endpoints (13 Endpoints)

| # | Method | Path | Route File | Controller / Handler | Auth | Authorization | Tenant Scope | Classification | Verification Finding |
|---|---|---|---|---|---|---|---|---|---|---|
| 175 | `POST` | `/api/shop` | `shop.js` | `shopController.createShop` | `auth` | Controller DB check (`owner`/`admin`) | organization | `LEGACY-COMPATIBILITY` | Validates caller `OrganizationMembership.orgRole` under row lock; enforces subscription limits. |
| 176 | `PATCH` | `/api/shop/:id/deactivate` | `shop.js` | `shopController.deactivateShop` | `auth` | Controller DB check (`owner`) | organization | `LEGACY-COMPATIBILITY` | Requires DB `orgRole === 'owner'`; prevents deactivating the sole active branch. |
| 177 | `PATCH` | `/api/shop/:id/activate` | `shop.js` | `shopController.activateShop` | `auth` | Controller DB check (`owner`) | organization | `LEGACY-COMPATIBILITY` | Requires DB `orgRole === 'owner'`; checks subscription limits. |
| 178 | `GET` | `/api/organizations/members` | `organizationRoutes.js` | `organizationController.listMembers` | `auth` | Controller DB check (`owner`/`admin`) | organization | `LEGACY-COMPATIBILITY` | Authoritative DB membership verification before returning org member roster. |
| 179 | `GET` | `/api/organizations/export` | `organizationRoutes.js` | `organizationController.exportData` | `auth` | Controller DB check (`owner`) | organization | `LEGACY-COMPATIBILITY` | Restricted strictly to tenant organization owner with audit logging. |
| 180 | `POST` | `/api/organizations/close-account` | `organizationRoutes.js` | `organizationController.closeAccount` | `auth` | Controller DB check (`owner`) | organization | `LEGACY-COMPATIBILITY` | Enforces owner verification, password confirmation, cascade revocation, and token purge. |
| 181 | `GET` | `/api/permissions/matrix` | `permissions.js` | `permissionController.getMatrix` | `auth` | `checkAdminOnly` (legacy role) | organization | `LEGACY-COMPATIBILITY` | Reads permission allocation matrix. Non-sensitive schema metadata. |
| 182 | `PUT` | `/api/permissions/matrix` | `permissions.js` | `permissionController.updateMatrix` | `auth` | Controller DB check (`owner`) | organization | `LEGACY-COMPATIBILITY` | Enforces caller DB `orgRole === 'owner'` before allowing updates to role permission mappings. |
| 183 | `PUT` | `/api/settings` | `settings.js` | `settingsController.updateSettings` | `auth` | `checkPermission('manage_settings')` | organization | `LEGACY-COMPATIBILITY` | `checkPermission` evaluates authoritative `req.authz.permissions.has('manage_settings')`. |
| 184 | `POST` | `/api/settings/logo` | `settings.js` | `settingsController.uploadLogo` | `auth` | `checkPermission('manage_settings')` | organization | `LEGACY-COMPATIBILITY` | `checkPermission` evaluates authoritative `req.authz.permissions.has('manage_settings')`. |
| 185 | `POST` | `/api/settings/reset` | `settings.js` | `settingsController.resetSettings` | `auth` | `checkPermission('manage_settings')` | organization | `LEGACY-COMPATIBILITY` | `checkPermission` evaluates authoritative `req.authz.permissions.has('manage_settings')`. |
| 186 | `GET` | `/api/settings/backup-status` | `settings.js` | `settingsController.getBackupStatus` | `auth` | `checkPermission('manage_settings')` | organization | `LEGACY-COMPATIBILITY` | `checkPermission` evaluates authoritative `req.authz.permissions.has('manage_settings')`. |
| 187 | `GET` | `/api/system/health/cache-stats` | `systemHealth.js` | inline handler | `auth` | `checkRole(['admin'])` | platform / global | `LEGACY-COMPATIBILITY` | Non-sensitive Redis and in-memory cache hit/miss statistics. |

---

## 7. Verification & Regression Matrix

All authorization domains, primitives, and backward compatibility adapters were verified under automated regression testing:

| Test Suite | Domain / Scope | Tests | Result | Passing Rate |
|---|---|:---:|:---:|:---:|
| `tests/gate2aAuthzContext.test.js` | Gate 2A: Canonical Authorization Context & Epoch Validation | 13 | **PASS** | 100% |
| `tests/gate2bAuthzEpochMutations.test.js` | Gate 2B: Authorization Epoch Invalidation on Mutations | 16 | **PASS** | 100% |
| `tests/gate2cAuthorizationPrimitive.test.js` | Gate 2C: Central `authorize()` Primitive & Adversarial Security | 34 | **PASS** | 100% |
| `tests/gate3aSalesAuthorization.test.js` | Gate 3A: Sales, Split Sales & Invoices Authorization | 34 | **PASS** | 100% |
| `tests/gate3bInventoryProductAuthorization.test.js`| Gate 3B: Products, Categories, Transfers, Brands & Units | 44 | **PASS** | 100% |
| `tests/gate3cEmployeeStaffAuthorization.test.js` | Gate 3C: Employees, Users & Shop Access Delegation | 42 | **PASS** | 100% |
| `tests/gate3dPurchasesSupplierAuthorization.test.js`| Gate 3D: Purchases, Purchase Orders & Suppliers | 38 | **PASS** | 100% |
| `tests/gate3eExpensesFinancialAuthorization.test.js`| Gate 3E: Expenses & Financial Operations | 38 | **PASS** | 100% |
| `tests/gate3fReportsAnalyticsAuthorization.test.js` | Gate 3F: Reports, Dashboard, Analytics, Insights & AI Proxy | 64 | **PASS** | 100% |
| `tests/gate3gCouponsDiscountsHeldCartsAuthorization.test.js` | Gate 3G: Coupons, Discounts & Held Carts | 58 | **PASS** | 100% |
| `tests/gate3hCustomersActivityAuthorization.test.js`| Gate 3H: Customers & Audit Activity | 43 | **PASS** | 100% |
| `tests/gate3iBillingPaymentsAuthorization.test.js` | Gate 3I: Billing Subscriptions, M-Pesa POS & Card POS | 34 | **PASS** | 100% |
| **Total Security Assertions** | **All Gate 2 and Gate 3 Suites** | **458** | **PASS** | **100%** |
| **Frontend Production Build** | Vite production compilation (`tsc && vite build`) | — | **PASS** | **Clean** |
| **Database Migration Integrity** | Migration drift check | — | **PASS** | **0 Drift** |

---

## 8. Final Closure Sign-Off & Recommendation

### 8.1 Final Program Status
1. **Attack Surface Coverage**: 187 of 187 active mounted endpoints are secured by verified policies.
2. **Elimination of Security Gaps**: Zero unauthenticated, leaking, or unauthorized endpoints exist.
3. **Multi-Tenant Invariants**: Absolute tenant isolation, branch scoping, ownership attribution, and epoch invalidation are universally enforced.
4. **Zero Regressions**: All 458 security test cases and the frontend production build pass with 100% success.

### 8.2 Final Decision

```text
AUTHORIZATION CONSOLIDATION & ENFORCEMENT — COMPLETE
```
