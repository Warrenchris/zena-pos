# Zana POS — Authorization Migration Status Tracker

> **Phase**: Authorization Consolidation & Enforcement
> **Source-of-Truth Baseline**: Commit `fae41af` (Gate 2C Approved)
> **Last Updated**: October 5, 2026 (Gate 3C Completion)

---

## 1. Executive Summary

| Metric | Count | Status / Notes |
|---|---|---|
| **Total Route Endpoints in Repository** | 173 | Canonical inventory established in Gate 0 (`AUTHORIZATION-MATRIX.md`) |
| **Total Domains** | 17 | Sales, Invoices, Auth, Users, Employees, Shops, Products, Categories, Transfers, Brands, Units, Purchases, Suppliers, Expenses, Reports, Analytics, Held Carts, Billing, M-Pesa |
| **Audited in Gate 3A (Sales & Invoices)** | 24 | Sales (15), Split Sales (1), Invoices (8) |
| **Migrated in Gate 3A** | 24 | Fully transitioned to `auth` → `authzContext` → `authorize()` |
| **Audited in Gate 3B (Inventory & Products)** | 26 | Products (9), Categories (5), Transfers (2), Brands (5), Units (5) |
| **Migrated in Gate 3B** | 26 | Fully transitioned to `auth` → `authzContext` → `authorize()` |
| **Audited in Gate 3C (Employees & Staff Admin)** | 12 | Employees (5), Users (3), Shop Access Delegation (4) |
| **Migrated in Gate 3C** | 12 | Fully transitioned to `auth` → `authzContext` → `authorize()` |
| **Cumulative Endpoints Migrated** | 62 | Gate 3A (24) + Gate 3B (26) + Gate 3C (12) |
| **Adopted `authorize()` Primitives** | 62 | Complete policy coverage for Sales, Invoices, Products, Categories, Transfers, Brands, Units, Employees, Staff Admin, Shop Access |
| **Legacy `checkRole()` Remaining in App** | 27 | Deferred domains (Purchases, Suppliers, Expenses, Reports, Analytics, etc.) |
| **Legacy `checkPermission()` Remaining in App** | 1 in `settings.js` | Deferred domain |
| **Remaining Endpoints to Migrate** | 111 | Deferred to Gates 3D - 3E |

---

## 2. Gate 3A Migration Accounting (Sales + Core POS)

### 2.1 Route Inventory & Transformation

#### `backend/src/routes/sales.js` (15 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3A Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth`, `requireActiveSubscription` | `auth, authzContext, reqSub, authorize` | `permission: 'manage_sales', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/statistics` | `auth`, `requireActiveSubscription` | `auth, authzContext, reqSub, authorize` | `permission: 'manage_sales', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/cashier-stats` | `auth`, `requireActiveSubscription` | `auth, authzContext, reqSub, authorize` | `permissions.any: ['view_own_sales', 'manage_sales'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/admin/all` | `auth`, `requireActiveSubscription` | `auth, authzContext, reqSub, authorize` | `permission: 'manage_sales', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/my-sales` | `auth`, `checkPermission('view_own_sales')` | `auth, authzContext, reqSub, authorize` | `permission: 'view_own_sales', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/returns/all` | `auth`, `checkRole([...])` | `auth, authzContext, reqSub, authorize` | `permissions.any: ['process_refunds', 'manage_sales'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:saleId/payments` | `auth` (no RBAC) | `auth, authzContext, reqSub, authorize` | `shopScope: 'current', ownership: { getResource, getOwnerId, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `GET` | `/:id` | `auth`, `checkRole([...])` | `auth, authzContext, reqSub, authorize` | `shopScope: 'current', ownership: { getResource, getOwnerId, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `POST` | `/` | `auth`, `checkPermission('create_sales')` | `auth, authzContext, reqSub, authorize` | `permission: 'create_sales', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth`, `checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, reqSub, authorize` | `permission: 'manage_sales', shopScope: 'current', ownership: { getResource, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `DELETE` | `/:id` | `auth`, `checkRole(['admin', 'org_admin'])` | `auth, authzContext, reqSub, authorize` | `roles: ['admin', 'org_admin'], shopScope: 'current', ownership: { getResource, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `PATCH` | `/:id/payment-status` | `auth`, `checkRole([...])` | `auth, authzContext, reqSub, authorize` | `permission: 'manage_sales', shopScope: 'current', ownership: { getResource, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `POST` | `/:saleId/refund` | `auth`, `checkPermission('process_refunds')` | `auth, authzContext, reqSub, authorize` | `permission: 'process_refunds', shopScope: 'current', ownership: { getResource, managerPermission: 'process_refunds', antiOracle: true }` | **MIGRATED** |
| `GET` | `/:saleId/refunds` | `auth` (no RBAC) | `auth, authzContext, reqSub, authorize` | `shopScope: 'current', ownership: { getResource, getOwnerId, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `GET` | `/:saleId/credit-note` | `auth` (no RBAC) | `auth, authzContext, reqSub, authorize` | `shopScope: 'current', ownership: { getResource, getOwnerId, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |

#### `backend/src/routes/splitSales.js` (1 Endpoint)
| Method | Endpoint | Prior Pipeline | Gate 3A Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `POST` | `/` | `auth, shopAuth, checkPermission('create_sales')` | `auth, authzContext, shopAuth, authorize` | `permission: 'create_sales', shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/invoiceRoutes.js` (8 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3A Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permission: 'manage_sales', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/statistics` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permission: 'manage_sales', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id` | `auth` (no RBAC) | `auth, authzContext, authorize` | `shopScope: 'current', ownership: { getResource, getOwnerId, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `POST` | `/` | `auth` (no RBAC) [GAP J] | `auth, authzContext, authorize` | `permission: 'create_sales', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth` (no RBAC) [GAP J] | `auth, authzContext, authorize` | `permission: 'manage_sales', shopScope: 'current', ownership: { getResource, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `DELETE` | `/:id` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], shopScope: 'current', ownership: { getResource, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `GET` | `/:id/pdf` | `auth` (no RBAC) | `auth, authzContext, authorize` | `shopScope: 'current', ownership: { getResource, getOwnerId, managerPermission: 'manage_sales', antiOracle: true }` | **MIGRATED** |
| `POST` | `/:id/send` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permission: 'manage_sales', shopScope: 'current'` (501 Disabled) | **MIGRATED** |

---

## 3. Gate 3B Migration Accounting (Inventory & Product Domain)

### 3.1 Route Inventory & Transformation

#### `backend/src/routes/products.js` (9 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3B Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/batch` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `POST` | `/import` | `auth, upload, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, upload, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `POST` | `/` | `auth, upload, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, upload, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth, upload, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, upload, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `DELETE` | `/:id` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `POST` | `/:id/deactivate` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin']` | **MIGRATED** |
| `PATCH` | `/:id/stock` | `auth, checkRole(['admin', 'manager', 'org_admin', 'cashier'])` | `auth, authzContext, authorize` | `permissions.any: ['manage_products', 'access_pos'], shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/categories.js` (5 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3B Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_categories', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_categories', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `POST` | `/` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_categories', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_categories', shopScope: 'current'` | **MIGRATED** |
| `DELETE` | `/:id` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/transfers.js` (2 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3B Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `POST` | `/` | `auth, requireActiveSubscription` | `auth, authzContext, reqSub, authorize` | `permission: 'manage_products', custom: dualShopAccessValidator` | **MIGRATED** |
| `GET` | `/` | `auth, requireActiveSubscription` | `auth, authzContext, reqSub, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/brandRoutes.js` (5 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3B Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `POST` | `/` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `DELETE` | `/:id` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/unitRoutes.js` (5 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3B Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id` | `auth` (no RBAC) | `auth, authzContext, authorize` | `permissions.any: ['view_products', 'manage_products'], shopScope: 'current'` | **MIGRATED** |
| `POST` | `/` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `permission: 'manage_products', shopScope: 'current'` | **MIGRATED** |
| `DELETE` | `/:id` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], shopScope: 'current'` | **MIGRATED** |

---

## 4. Gate 3C Migration Accounting (Employees, Staff Administration & Branch Access Delegation)

### 4.1 Route Inventory & Transformation

#### `backend/src/routes/employees.js` (5 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3C Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth, checkRole(['admin', 'manager', 'org_admin', 'cashier'])` | `auth, authzContext, authorize` | `permissions.any: ['manage_employees'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id` | `auth, checkAdminOrSelf, ensureShopIsolation` | `auth, authzContext, authorize` | `ownership: { getResource, isOwner, managerPermission: 'manage_employees', antiOracle: true }` | **MIGRATED** |
| `POST` | `/` | `auth, requireVerifiedEmail` | `auth, authzContext, requireVerifiedEmail, authorize` | `roles: ['admin', 'org_admin'], permission: 'manage_employees', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], permission: 'manage_employees', shopScope: 'current'` | **MIGRATED** |
| `DELETE` | `/:id` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], permission: 'manage_employees', shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/users.js` (3 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3C Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `GET` | `/` | `auth, checkRole(['admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], permission: 'manage_employees', shopScope: 'current'` | **MIGRATED** |
| `POST` | `/` | `auth, checkRole(['admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], permission: 'manage_employees', shopScope: 'current'` | **MIGRATED** |
| `PUT` | `/:id/role` | `auth, checkRole(['admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], permission: 'manage_employees', shopScope: 'current'` | **MIGRATED** |

#### `backend/src/routes/shop.js` (4 Endpoints)
| Method | Endpoint | Prior Pipeline | Gate 3C Pipeline | Enforcement Rule | Status |
|---|---|---|---|---|---|
| `PUT` | `/me` | `auth, checkRole(['admin', 'manager', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'manager', 'org_admin'], shopScope: 'current'` | **MIGRATED** |
| `GET` | `/:id/access` | `auth, checkRole(['admin', 'org_admin', 'manager'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin', 'manager'], permission: 'manage_employees', shopScope: { param: 'id' }, antiOracle: true` | **MIGRATED** |
| `POST` | `/:id/access` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], shopScope: { param: 'id' }, antiOracle: true` | **MIGRATED** |
| `DELETE` | `/:id/access/:membershipId` | `auth, checkRole(['admin', 'org_admin'])` | `auth, authzContext, authorize` | `roles: ['admin', 'org_admin'], shopScope: { param: 'id' }, antiOracle: true` | **MIGRATED** |

---

## 5. Security Properties Enforced

1. **Identity & Session Validity**: All 62 migrated endpoints reject missing tokens, revoked JTIs, deactivated accounts, and stale authorization epoch versions (`authzVersion`).
2. **Database-Backed RBAC**: Forged `role` claims in client JWT tokens are neutralized; authorization context resolves operational and governance roles authoritative from DB memberships.
3. **Branch Scope Isolation**: Every operation is scoped to caller's authoritative branch via `shopScope: 'current'` or branch parameter scope `{ param: 'id' }`. Parameter tampering attempting to act in other branches is rejected with HTTP 403 `SHOP_ACCESS_DENIED`.
4. **Self-Modification Block**: Staff and employees cannot modify their own privileges, roles, or active status via `PUT /api/employees/:id` or `PUT /api/users/:id/role`.
5. **Owner Protection**: Organization owner accounts cannot be modified or deleted via staff administration endpoints. Only owners can grant administrator privileges (`orgRole: 'owner'` or `orgRole: 'admin'`).
6. **Anti-Oracle Masking**: Unauthorized requests against cross-tenant or cross-branch resources return uniform HTTP 404 responses identical to non-existent resources, preventing existence probing.
7. **Atomic Authorization Epoch Synchronization**: Any mutation modifying roles, positions, active status, branch assignments, or branch access grants/revocations automatically increments `authzVersion` on the target actor within the database transaction, immediately invalidating cached tokens.
8. **Canonical Staff Creation**: All employee and user creation routes pipe through `staffCreationService.createStaffMember`, enforcing subscription quotas (`maxUsers`), creating corresponding `OrganizationMembership` records, and establishing default `ShopAccess`.

---

## 6. Verification Suite Results

| Test Suite | Scope | Result | Passing Rate |
|---|---|---|---|
| `tests/gate3cEmployeeStaffAuthorization.test.js` | 42 adversarial and functional scenarios covering Employees, Staff Admin & Branch Delegation | **PASS** | 42 / 42 (100%) |
| `tests/gate3bInventoryProductAuthorization.test.js` | 44 adversarial and functional test scenarios covering Inventory & Products domain | **PASS** | 44 / 44 (100%) |
| `tests/gate3aSalesAuthorization.test.js` | 34 adversarial and functional test scenarios covering Sales domain regression | **PASS** | 34 / 34 (100%) |
| `tests/gate2aAuthzContext.test.js` | Gate 2A authorization context & epoch regression | **PASS** | 19 / 19 (100%) |
| `tests/gate2bAuthzEpochMutations.test.js` | Gate 2B epoch invalidation on mutations regression | **PASS** | 20 / 20 (100%) |
| `tests/gate2cAuthorizationPrimitive.test.js` | Gate 2C central primitive regression | **PASS** | 24 / 24 (100%) |
| `tests/phase6bAuthSecurity.test.js` | Phase 6B authentication and password cutoff regression | **PASS** | 10 / 10 (100%) |
| `tests/phase6bAuthSessionSecurity.test.js` | Phase 6B session management regression | **PASS** | 8 / 8 (100%) |
| `tests/phase6bTenantOracleSecurity.test.js` | Phase 6B tenant & oracle elimination regression | **PASS** | 14 / 14 (100%) |
| **Total Test Assertions** | **All Security Regression & Gate Suites** | **PASS** | **215 / 215 (100%)** |
| **Frontend Production Build** | Vite build (`npm run build`) | **PASS** | Clean build (1m 46s) |

---

## 7. Deferred Domains (Future Gates)

The following domains remain under legacy authorization pipelines pending subsequent migration gates:

1. **Purchases & Suppliers**: `purchases.js`, `purchaseOrders.js`, `suppliers.js` (Gate 3D)
2. **Coupons, Discounts & Held Carts**: `coupons.js`, `discounts.js`, `heldCartRoutes.js` (Gate 3D)
3. **Reports, Dashboard & Analytics**: `reports.js`, `dashboard.js`, `analyticsRoutes.js` (Gate 3D)
4. **Billing, Subscriptions & M-Pesa**: `billing.js`, `mpesa.js` (Gate 3E)
