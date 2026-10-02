# Zana POS — Canonical Authorization Context Design

## 1. Executive Summary & Gate 1 Mandate

- **Document**: `docs/security/CANONICAL-AUTHORIZATION-DESIGN.md`
- **Phase**: **Gate 1 — Canonical Authorization Context Design**
- **Baseline Commit**: `d81f08b` (October 2, 2026)
- **Status**: **Draft Design / Awaiting Gate 1 Review & Approval**

### 1.1 Objective
Following the approval of Gate 0 (`docs/security/AUTHORIZATION-MATRIX.md`), this document establishes the centralized, canonical authorization architecture for Zana POS. 

The primary architectural shift is:
> **Decouple authorization from static, unverified JWT claims (`req.user.role`) and converge all authorization decisions onto a centralized, authoritative Authorization Context (`req.authz`).**

This design guarantees that:
1. Role demotions, employee terminations, and branch reassignment take effect immediately (zero stale privilege retention).
2. The authorization pipeline evaluates session liveness, organization membership, branch delegation, granular permissions, and resource ownership in a single coherent flow.
3. 100% backward compatibility is maintained for existing POS terminals, mobile clients, and existing tests.
4. Zero application code is modified prior to formal Gate 1 approval.

---

## 2. Canonical Authorization Architecture

### 2.1 The End-to-End Authorization Pipeline

Every incoming request to a protected API endpoint traverses the following deterministic 8-step pipeline:

```text
[1] Authentication (Bearer JWT)
     │ • RS256 signature verification & expiration check
     │ • Rejection of non-session tokens (e.g. password_reset)
     ▼
[2] Session Liveness & Revocation Cutoff
     │ • Token JTI blacklist check (logout)
     │ • User revocation cutoff check (password reset, account close)
     │ • Authorization version verification (authzVersion against DB/cache)
     ▼
[3] Tenant Context & Organization Membership
     │ • Organization existence & subscription status (active, past_due, suspended, deleted)
     │ • OrganizationMembership lookup for caller (userId or employeeId)
     │ • Membership status check (active vs suspended)
     ▼
[4] Organization Role (orgRole) & Operational Role Resolution
     │ • Resolution of orgRole: 'owner' | 'admin' | 'member' | 'billing_admin'
     │ • Resolution of effectiveRole: 'admin' | 'manager' | 'cashier' | 'org_admin'
     │ • Admin equivalence to owner preserved (admin -> 'all' permissions)
     ▼
[5] Branch / Shop Scope Delegation
     │ • activeShopId resolution from JWT claim or header
     │ • ShopAccess verification:
     │   - Owner: universal implicit bypass across all organization branches
     │   - Admin/Member: verified against explicit ShopAccess table records
     │ • Anti-Oracle enforcement: unauthorized branch queries return 404 Not Found
     ▼
[6] Granular Permission Resolution
     │ • Dynamic lookup against RolePermission matrix via Redis cache:
     │   Key: permissions:org:{organizationId}:role:{effectiveRole}
     │ • Admin role evaluates to true immediately ('all')
     │ • Missing canonical permissions (coupons, discounts, shop access, held carts)
     ▼
[7] Resource Scope & Ownership Evaluation
     │ • Tenant isolation (WHERE organizationId = req.authz.organizationId)
     │ • Branch isolation (WHERE shopId = req.authz.activeShopId)
     │ • Fine-grained ownership (e.g., Cashier owns HeldCart vs Manager override)
     ▼
[8] FINAL ACCESS DECISION: ALLOW or DENY (401 / 403 / 404)
```

---

## 3. Authorization-Context Design (`req.authz`)

To prevent fragmented database queries across middleware and controllers, a centralized object—`req.authz`—is constructed early in the request lifecycle and attached to the Express request.

### 3.1 Interface Specification

```typescript
interface AuthorizationContext {
  // 1. Identity
  identity: {
    id: number | string;            // User.id (integer) or Employee.id (UUID)
    userId: number | null;          // Populated if User entity
    employeeId: string | null;      // Populated if Employee entity
    isEmployee: boolean;            // Discriminator
    email: string;
    name: string;
  };

  // 2. Session & Revocation State
  session: {
    authzVersion: number;           // Current authorization epoch
    iat: number;                    // Token issued-at timestamp (seconds)
    exp: number;                    // Token expiration timestamp (seconds)
    jti: string;                    // Unique token identifier
  };

  // 3. Organization & Governance Context
  tenant: {
    organizationId: number;
    organizationName: string;
    organizationStatus: 'active' | 'trialing' | 'past_due' | 'suspended' | 'canceled' | 'deleted';
    membershipId: string;           // UUID of OrganizationMembership record
    orgRole: 'owner' | 'admin' | 'member' | 'billing_admin';
    membershipStatus: 'active' | 'suspended';
    isOwner: boolean;               // orgRole === 'owner'
    isOrgAdmin: boolean;            // orgRole === 'owner' || orgRole === 'admin'
  };

  // 4. Effective Operational Role
  role: {
    rawRole: string;                // Legacy User.role or Employee.position
    effectiveRole: 'admin' | 'manager' | 'cashier' | 'org_admin';
  };

  // 5. Branch & Shop Scoping
  scope: {
    activeShopId: number | null;    // Branch context for current request
    homeShopId: number;             // Default/home shop from user record
    accessibleShopIds: number[];    // All branch IDs user has rights to access
    hasShopAccess(targetShopId: number): boolean;
  };

  // 6. Granular Permission Evaluation
  permissions: {
    granted: Set<string>;           // Cached permission bundle for effectiveRole
    has(permissionName: string): boolean;
    hasAny(...permissionNames: string[]): boolean;
    hasAll(...permissionNames: string[]): boolean;
  };

  // 7. Resource Ownership & Manager Override Helper
  ownership: {
    isOwnerOf(resourceOwnerId: string | number): boolean;
    canManage(resourceOwnerId: string | number, managerPermission?: string): boolean;
  };
}
```

### 3.2 Backward Compatibility Guarantees
To prevent breaking existing controllers and external integrations, the context builder maintains legacy request properties:
* `req.user`: Preserved with identical shape (`id`, `name`, `email`, `role`, `orgRole`, `shopId`, `organizationId`, `isEmployee`).
* `req.shopId`: Synchronized with `req.authz.scope.activeShopId`.
* `req.organizationId`: Synchronized with `req.authz.tenant.organizationId`.
* `req.membership`: Synchronized with `req.authz.tenant`.

---

## 4. Role → Permission Resolution Strategy

### 4.1 Resolution Matrix
The system explicitly reconciles the 5 role dimensions without destructive schema alterations:

| Actor Identity | `User.role` | `Employee.position` | `OrganizationMembership.orgRole` | Resolved `effectiveRole` | `RolePermission` Source | Shop Delegation Boundary |
|---|---|---|---|---|---|---|
| **Platform Operator** | `super_admin` | *N/A* | *None* | `super_admin` | Platform isolated | Out of tenant scope |
| **Organization Owner** | `admin` | *N/A* | `owner` | `admin` | Automatic `['all']` | Universal bypass across all branches |
| **Delegated Admin** | *N/A* or `manager` | `admin` | `admin` | `org_admin` | Mapped to `manager` | Restricted to `ShopAccess` branches |
| **Branch Manager** | `manager` | `manager` | `member` | `manager` | `manager` table rows | Restricted to `ShopAccess` branches |
| **Cashier / Staff** | `cashier` | `cashier` | `member` | `cashier` | `cashier` table rows | Restricted to home `ShopAccess` branch |

### 4.2 Key Architectural Decisions
1. **Admin -> 'all' is Preserved by Design**:
   The owner of an organization holds `User.role === 'admin'` and `orgRole === 'owner'`. They receive universal permission bypass (`['all']`). This is an intentional multi-tenant owner capability, not a vulnerability.
2. **`org_admin` Compatibility**:
   Employees assigned `position: 'admin'` are granted `orgRole: 'admin'`. In `permissionCache.js`, `org_admin` maps to `manager` permissions, ensuring they receive branch-level management authority without obtaining owner-level unscoped powers.
3. **No Role Renaming**:
   Existing role enum values in `User.role` (`admin`, `manager`, `cashier`, `super_admin`) and `OrganizationMembership.orgRole` (`owner`, `admin`, `member`, `billing_admin`) remain strictly unmodified.

---

## 5. Organization & Branch Scope Strategy

### 5.1 Branch Access Invariants
1. **Implicit Owner Bypass**: Organization owners (`orgRole === 'owner'`) inherently possess access to every branch registered under their `organizationId`. They do not require rows in `ShopAccess`.
2. **Explicit Delegation**: For all other staff (`org_admin`, `manager`, `cashier`), branch access is granted strictly through `ShopAccess` records linked to their `OrganizationMembership.id`.
3. **Default Branch Initialization**: Upon staff creation via `staffCreationService`, a `ShopAccess` record is atomically created for their assigned `shopId` (`isDefault: true`).

### 5.2 Anti-Oracle Enumeration Policy
* When a user attempts to access or mutate a branch (`shopId`) outside their `accessibleShopIds`, or a resource belonging to another branch/organization:
  * The response **MUST BE `404 Not Found`**, never `403 Forbidden`.
  * Rationale: Returning `403` informs an attacker that the targeted resource ID exists in another tenant or branch. Returning `404` prevents tenant resource enumeration (verified in `phase6bTenantOracleSecurity.test.js`).

---

## 6. Resource Ownership Strategy

Fine-grained ownership rules govern records that belong to individual cashiers within a branch:

### 6.1 Held Carts Ownership Model (Finding I Remediation)
A held cart represents temporary POS checkout state containing `shopId` and `cashierId`.
* **Cashier Rule**:
  * `GET /api/held-carts`: Automatically appends SQL filter `WHERE cashierId = req.authz.identity.id`. Cashiers only see their own carts.
  * `POST /api/held-carts/:id/recall` & `DELETE /api/held-carts/:id`: Verifies `cart.cashierId === req.authz.identity.id`. If non-matching, returns `404 Not Found`.
* **Manager / Owner Override Rule**:
  * Users possessing `manage_held_carts` (or `admin`/`manager`) can view all held carts across their authorized branch and recall/delete any held cart.

### 6.2 Sales History Ownership Model
* Cashiers querying `GET /api/sales/my-sales` (`view_own_sales`) are strictly constrained to sales where `userId = req.authz.identity.id` or `employeeId = req.authz.identity.id`.
* Store-wide sales history (`GET /api/sales`) requires `view_sales` or `manage_sales`.

### 6.3 Employee Profile Ownership Model
* `GET /api/employees/:id`: Accessible if `targetId === req.authz.identity.id` (self-service profile view) OR if caller possesses `view_employees` / `manage_employees`.

---

## 7. Stale-Session Strategy & `authzVersion`

### 7.1 The Delayed Demotion Vulnerability
Currently, `userController.updateRole` and `employeeController.updateEmployee` update database records but do not revoke active JWTs. Because `checkRole()` synchronously reads `req.user.role` from the JWT, a demoted administrator retains administrative power for up to 2 hours.

### 7.2 Two-Pronged Remediation Strategy

#### Prong A: Immediate Cutoff Revocation (Zero-Schema Quick Enforcement)
* Zana POS already features `tokenRevocationService.revokeAllUserTokens(id, isEmployee)`.
* Every mutation that alters authorization:
  * `userController.updateRole`
  * `employeeController.updateEmployee`
  * `shopController.revokeShopAccess`
  * `organizationController.closeOrganizationAccount`
  must immediately invoke `await tokenRevocationService.revokeAllUserTokens(targetId, isEmployee)`.
* In `auth.js`, the existing cutoff verification:
  ```javascript
  const isRevokedByCutoff = await tokenRevocationService.isUserTokenRevoked(decoded.id, !!decoded.isEmployee, decoded.iat);
  if (isRevokedByCutoff) {
    return res.status(401).json({ error: 'Token has been revoked due to authorization changes. Please log in again.' });
  }
  ```
  instantly blocks requests made with pre-demotion JWTs.

#### Prong B: Schema-Backed `authzVersion` (Formal Epoch Tracking)
* Add `authzVersion INT UNSIGNED NOT NULL DEFAULT 1` to `Users` and `Employees` tables.
* Embed `authzVersion` in newly minted JWTs.
* When roles or permissions change:
  ```javascript
  await user.increment('authzVersion', { transaction });
  await redisClient.setex(`authz_version:${isEmployee ? 'employee' : 'user'}:${id}`, 3600, String(newVersion));
  ```
* Middleware compares token `authzVersion` against Redis/DB. If mismatched: `401 Unauthorized`.

---

## 8. Permission-Cache Invalidation Strategy

### 8.1 Organization-Scoped Key Pattern
Permissions are stored in Redis under tenant-isolated keys:
```text
permissions:org:{organizationId}:role:{effectiveRole}
```
TTL: 3,600 seconds (1 hour).

### 8.2 Invalidation Hooks
* **RolePermission Mutation**:
  Hooks in `backend/src/models/RolePermission.js` trigger:
  ```javascript
  await permissionCache.invalidateRoleCache(role, organizationId);
  ```
* **Alias Invalidation**:
  When permissions for role `'manager'` are updated, `permissionCache.invalidateRoleCache` automatically invalidates both `'manager'` and its operational alias `'org_admin'`.
* **New Organization Seeding**:
  When a new organization registers, default permissions are seeded and cache entries populated atomically via `ensureOrgRolePermissionsSeeded`.

---

## 9. Legacy-Role Compatibility Strategy

To ensure zero downtime and prevent breaking existing frontend apps or POS registers:

1. **Drop-in `checkRole()` Refactoring**:
   `checkRole(allowedRoles)` in `backend/src/middleware/auth.js` is refactored internally:
   ```javascript
   const checkRole = (allowedRoles) => {
     return (req, res, next) => {
       // Evaluate authoritative effectiveRole from req.authz rather than trusting JWT
       const currentRole = req.authz ? req.authz.role.effectiveRole : req.user?.role;
       if (!allowedRoles.includes(currentRole)) {
         return res.status(403).json({ error: 'Access denied.' });
       }
       next();
     };
   };
   ```
   This immediately secures all 71 legacy `checkRole()` call sites against JWT spoofing and stale tokens without requiring simultaneous route edits.

2. **Unified `checkPermission()`**:
   Routes gradually adopt `checkPermission(permissionName)`, which queries `req.authz.permissions.has(permissionName)`.

---

## 10. Route Migration Strategy & Invoice Mutation Gap

### 10.1 Closing the Invoice Mutation Gap (Gap J)
Phase 0 uncovered that `POST /api/invoices` and `PUT /api/invoices/:id` in `backend/src/routes/invoiceRoutes.js` enforce input validation but lack RBAC checks.
* Target enforcement:
  * `POST /api/invoices`: Enforce `checkPermission('create_sales')` (allows authorized cashiers and managers to issue invoices).
  * `PUT /api/invoices/:id`: Enforce `checkPermission('manage_sales')` (restricts modifying existing invoices to managers and admins).
  * `DELETE /api/invoices/:id`: Enforce `checkPermission('manage_sales')`.

### 10.2 Phased Route Migration Roadmap
* **Phase 1 (Quick-Wins with Authoritative Context)**:
  * Coupons: `POST /`, `PUT /:id`, `DELETE /:id` -> `checkPermission('manage_coupons')`
  * Discounts: `POST /`, `PUT /:id`, `DELETE /:id` -> `checkPermission('manage_discounts')`
  * Shop Access: `GET /:id/access` -> `checkPermission('manage_shop_access')`
  * Dashboard & Analytics: `GET /api/dashboard/*`, `GET /api/analytics/*`, `GET /api/insights/*` -> `checkPermission('view_dashboard')` / `checkPermission('view_reports')`
  * Invoices: `POST /`, `PUT /:id` -> `checkPermission('create_sales')` / `checkPermission('manage_sales')`
* **Phase 2 (Held Carts & Fine-Grained Ownership)**:
  * Scope `heldCartRoutes.js` with cashier ownership filter and manager override.
* **Phase 3 (Full Seeder & RolePermission Convergence)**:
  * Migrate remaining `checkRole` usages across catalog, customers, and expenses.

---

## 11. Exact Files Expected to Change

| File Path | Scope of Change | Rationale |
|---|---|---|
| `backend/src/middleware/auth.js` | Update | Build `req.authz`, enforce `authzVersion`/cutoff, modernize `checkRole`. |
| `backend/src/middleware/authzContext.js` | **NEW** | Centralized context builder resolving membership, roles, and shop access. |
| `backend/src/middleware/rolePermissions.js` | Update | Wire `checkPermission` directly into `req.authz.permissions`. |
| `backend/src/models/User.js` | Update | Add `authzVersion` column (when migration approved). |
| `backend/src/models/Employee.js` | Update | Add `authzVersion` column (when migration approved). |
| `backend/migrations/*-add-authz-version.js` | **NEW** | Database migration for `authzVersion`. |
| `backend/src/services/tokenRevocationService.js` | Update | Add `authzVersion` cache invalidation and increment helpers. |
| `backend/src/services/rolePermissionSeeder.js` | Update | Add 4 canonical permissions (`manage_coupons`, `manage_discounts`, `manage_shop_access`, `manage_held_carts`) and backfill logic. |
| `backend/src/controllers/userController.js` | Update | Invalidate tokens and bump `authzVersion` on role/status changes. |
| `backend/src/controllers/employeeController.js` | Update | Invalidate tokens and bump `authzVersion` on position/status changes. |
| `backend/src/routes/coupons.js` | Update | Protect coupon management endpoints. |
| `backend/src/routes/discounts.js` | Update | Protect discount management endpoints. |
| `backend/src/routes/shop.js` | Update | Protect `GET /:id/access` staff disclosure. |
| `backend/src/routes/dashboard.js` | Update | Protect financial revenue/stats endpoints. |
| `backend/src/routes/analytics.js` | Update | Protect financial analytics endpoints. |
| `backend/src/routes/insights.js` | Update | Protect shop-level insights endpoints. |
| `backend/src/routes/invoiceRoutes.js` | Update | Protect invoice creation and update endpoints. |
| `backend/src/routes/heldCartRoutes.js` | Update | Enforce cashier ownership and manager override. |

---

## 12. Proposed Adversarial Security Test Suite

To prove verification conclusively in Gate 5, the following adversarial test suites will be constructed:

1. `backend/tests/staleAuthorizationRevocation.test.js`
   * Tests demoting a user from `admin` to `cashier` via `PUT /api/users/:id/role`.
   * Proves that requests made with the original JWT to admin routes immediately return `401 Unauthorized`.
   * Tests demoting an employee from `manager` to `cashier` via `PUT /api/employees/:id`.
   * Proves that requests made with the original JWT to manager routes immediately return `401 Unauthorized`.
2. `backend/tests/couponsAuthorization.test.js`
   * Tests that authenticated cashiers receive `403 Forbidden` attempting `POST /api/coupons`.
   * Tests that managers and admins can successfully create, update, and delete coupons.
   * Tests that cashiers can still successfully invoke `POST /api/coupons/validate` during checkout.
3. `backend/tests/discountsAuthorization.test.js`
   * Tests that cashiers receive `403 Forbidden` attempting `POST /api/discounts`.
   * Tests that managers and admins can manage discount rules.
4. `backend/tests/shopAccessDisclosure.test.js`
   * Tests that cashiers calling `GET /api/shops/:id/access` receive `403 Forbidden` (PII protected).
   * Tests that organization owners and admins can retrieve access rosters.
5. `backend/tests/heldCartOwnership.test.js`
   * Tests that Cashier 1 cannot recall or delete Cashier 2's held cart (returns `404 Not Found`).
   * Tests that Cashier 1 can recall their own held cart.
   * Tests that a Manager can recall and delete any cashier's held cart in the branch.
6. `backend/tests/dashboardAnalyticsAuthorization.test.js`
   * Tests that cashiers receive `403 Forbidden` querying `/api/dashboard/stats`, `/api/dashboard/revenue`, `/api/analytics/orders`.
7. `backend/tests/invoiceMutationAuthorization.test.js`
   * Tests that arbitrary unprivileged users cannot issue or update invoices.
8. `backend/tests/tenantAntiOracleSecurity.test.js`
   * Tests that querying resources across organizations or across unauthorized branches returns `404 Not Found` (anti-oracle).

---

## 13. Gate 1 Stop Condition & Approval Request

- **No application code has been modified in Gate 1.**
- The canonical architecture, context interface, role reconciliation model, and migration strategy are documented above.
- **Execution is halted. Awaiting user review and formal approval of the Gate 1 Canonical Authorization Context Design.**
