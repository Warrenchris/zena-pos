# Zana POS — Central Authorization Primitive (`authorize`)

**Document Version:** 1.0  
**Security Gate:** Gate 2C  
**Baseline Commit:** 58b9520 (Gate 2B)  
**Status:** Approved & Implemented  

---

## 1. Executive Summary

This document specifies the architecture, API, and behavioral semantics of the central authorization primitive (`authorize(...)`) implemented in `backend/src/middleware/authorize.js`.

The central authorization primitive is the single policy evaluation point for Zana POS. It builds upon:
1. **Gate 2A:** Canonical authorization context (`req.authz`), multi-layer cache, and authorization epoch tracking (`authzVersion`).
2. **Gate 2B:** Authorization epoch mutation wiring on users, memberships, and employees.
3. **Gate 2C:** The single central primitive that evaluates permissions, roles, tenant isolation, shop branch scoping, resource-level ownership, platform boundary, and anti-oracle protections.

---

## 2. Canonical Authorization Pipeline

The complete request lifecycle follows a strict fail-closed pipeline:

```text
Incoming HTTP Request
      │
      ▼
1. Authentication (`auth`)
   ├── Verify JWT signature & structure
   ├── Extract userId, organizationId, employeeId, token authzVersion
   └── Check token blacklist (Redis / DB fallback)
      │
      ▼
2. Session Liveness & Epoch Validation (`authzContext`)
   ├── Query cached / database user & employee authzVersion
   ├── Stale Token Detection: token authzVersion < current authzVersion ➔ 401 TOKEN_EXPIRED (Revoked / Re-login required)
   ├── Hydrate OrganizationMembership (orgRole, status)
   ├── Resolve Effective Operational Role (owner, org_admin, manager, cashier, etc.)
   ├── Hydrate ShopAccess (assigned shops, hasAllShops)
   ├── Hydrate Role Permissions (with tenant-scoped overrides)
   └── Attach canonical `req.authz` to the request object
      │
      ▼
3. Central Authorization Primitive (`authorize`)
   ├── Validate context presence (`!req.authz` ➔ 500 AUTHORIZATION_CONTEXT_MISSING)
   ├── Validate authenticated caller (`!req.user` ➔ 401 UNAUTHORIZED)
   ├── Enforce Platform vs Tenant boundary (`platformOnly` vs tenant routes)
   ├── Enforce Governance Role (`requireOrgOwner`, `requireOrgAdmin`)
   ├── Enforce Role checks (`roles`)
   ├── Enforce Granular Permission (`permission`, `permissions` with `all` or `any`)
   ├── Enforce Shop / Branch Scope (`shopScope`)
   ├── Enforce Resource Ownership & Anti-Oracle rules (`ownership`)
   └── Enforce Custom policy predicates (`custom`)
      │
      ▼
4. Controller Execution
```

---

## 3. Canonical Authorization Context (`req.authz`)

The central primitive never queries raw JWT claims or relies on unverified headers. It evaluates requests strictly against `req.authz`, which has the following standardized contract:

```typescript
interface CanonicalAuthzContext {
  version: number;                        // Context schema version (1)
  sessionVersion: number;                  // JWT token authzVersion
  currentAuthzVersion: number;             // Live DB/cache authzVersion
  isStale: boolean;                        // True if sessionVersion < currentAuthzVersion
  
  caller: {
    userId: number;
    employeeId: number | null;
    isEmployee: boolean;
    authType: 'user' | 'employee' | 'platform';
  };

  tenant: {
    organizationId: number;
    membershipId: number | null;
    membershipStatus: 'active' | 'suspended' | 'invited';
  };

  roles: {
    governanceRole: 'owner' | 'admin' | 'member' | 'billing_admin' | null;
    effectiveRole: string;                 // Operational role (e.g., 'manager', 'cashier')
    isPlatformSuperAdmin: boolean;
    isOrgAdmin: boolean;
    isOrgOwner: boolean;
  };

  scope: {
    organizationId: number;
    currentShopId: number | null;
    assignedShopIds: number[];
    hasAllShops: boolean;
    hasShopAccess: (shopId: number | string) => boolean;
  };

  permissions: {
    list: string[];
    has: (permission: string) => boolean;
    hasAny: (permissions: string[]) => boolean;
    hasAll: (permissions: string[]) => boolean;
  };

  raw: {
    user: object;
    membership: object | null;
    employee: object | null;
  };
}
```

---

## 4. `authorize(...)` API Reference

The middleware factory is exported from `backend/src/middleware/authorize.js` and re-exported from `backend/src/middleware/auth.js`.

### 4.1 Signatures

```javascript
// 1. Shorthand: Single permission
authorize('manage_users')

// 2. Shorthand: Multiple permissions (defaults to mode: 'all')
authorize(['manage_users', 'view_reports'])

// 3. Full configuration object
authorize({
  permission?: string,
  permissions?: string[],
  mode?: 'all' | 'any',
  roles?: string[] | string,
  requireOrgOwner?: boolean,
  requireOrgAdmin?: boolean,
  platformOnly?: boolean,
  shopScope?: 'current' | 'param' | ((req) => number | string) | number,
  ownership?: OwnershipOptions | ((req) => Promise<boolean>),
  custom?: (req, res, next) => boolean | Promise<boolean>
})
```

---

## 5. Authorization Policy Evaluators

### 5.1 Permissions Evaluation
- `permission: 'manage_users'`: Caller must possess `'manage_users'` via `authz.permissions.has('manage_users')`.
- `permissions: ['export_reports', 'view_financials'], mode: 'all'`: Caller must possess both permissions.
- `permissions: ['manage_inventory', 'audit_inventory'], mode: 'any'`: Caller must possess at least one of the listed permissions.
- **Fail Result:** HTTP 403 `FORBIDDEN` with code `INSUFFICIENT_PERMISSIONS`.

### 5.2 Role Evaluation
- `roles: ['admin', 'org_admin', 'manager']`: Caller's `effectiveRole` or `governanceRole` must match one of the specified roles.
- `requireOrgOwner: true`: Caller must have `authz.roles.isOrgOwner === true` (`governanceRole === 'owner'`).
- `requireOrgAdmin: true`: Caller must have `authz.roles.isOrgAdmin === true` (`governanceRole === 'owner' || 'admin'`).
- **Fail Result:** HTTP 403 `FORBIDDEN` with code `ROLE_NOT_AUTHORIZED` or `ORG_ADMIN_REQUIRED`.

### 5.3 Platform Super-Admin Boundary
- `platformOnly: true`: Only callers with `authz.roles.isPlatformSuperAdmin === true` may access the route.
- **Tenant Isolation Invariant:** If `platformOnly` is false or omitted (default for standard tenant endpoints), a platform super-admin attempting to access tenant endpoints without a valid organization membership is rejected. Platform super-admins do not bypass tenant isolation.

### 5.4 Shop / Branch Scope Evaluation
- `shopScope: 'current'`: Checks that caller has access to `authz.scope.currentShopId` via `authz.scope.hasShopAccess(...)`.
- `shopScope: 'param'`: Resolves `req.params.shopId || req.params.branchId` and validates branch access.
- `shopScope: (req) => req.query.shopId`: Evaluates a custom dynamic extractor.
- `shopScope: 42`: Evaluates access to an explicit shop ID.
- **Fail Result:** HTTP 403 `FORBIDDEN` with code `SHOP_ACCESS_DENIED`.

---

## 6. Resource Ownership & Anti-Oracle Protection

Multi-tenant endpoints frequently mutate or fetch resources belonging to specific users or branches (e.g., invoices, sales, held carts).

### 6.1 Ownership Configuration

```javascript
authorize({
  ownership: {
    // 1. Fetch resource dynamically
    getResource: async (req) => Invoice.findByPk(req.params.id),

    // 2. Resolve owner ID from resource
    getOwnerId: (resource) => resource.userId,

    // 3. Optional: Explicit ownership predicate
    isOwner: (req, resource, authz) => resource.userId === authz.caller.userId,

    // 4. Optional: Manager permission override
    managerPermission: 'manage_sales',

    // 5. Anti-oracle protection (default: true)
    antiOracle: true
  }
})
```

### 6.2 Evaluation Order & Invariants

1. **Resource Existence Check:**  
   If `getResource` returns `null` or `undefined`, the middleware terminates with **HTTP 404 `RESOURCE_NOT_FOUND`**.
2. **Strict Tenant Boundary:**  
   If `resource.organizationId` exists and does not match `authz.tenant.organizationId`, the middleware immediately terminates with **HTTP 404 `RESOURCE_NOT_FOUND`** when `antiOracle: true` (or HTTP 403 if `antiOracle: false`).  
   *Security Rationale:* A manager in Organization A possessing `manage_sales` must **never** be permitted to access or verify the existence of an invoice in Organization B.
3. **Branch Scope Boundary:**  
   If `resource.shopId` exists, the caller must satisfy `authz.scope.hasShopAccess(resource.shopId)`. If not, access is denied.
4. **Ownership Match:**  
   If caller ID matches owner ID (or `isOwner` returns true), access is granted (subject to `ownerPermission` if specified).
5. **Manager Fallback:**  
   If caller is not the owner, but possesses `managerPermission` within the same organization and branch, access is granted.
6. **Denial:**  
   If neither condition is met, access is denied with HTTP 403 `FORBIDDEN`.

---

## 7. HTTP Status Code Semantics

The central primitive adheres to strict, unambiguous HTTP status codes:

| Status Code | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| **401 Unauthorized** | `TOKEN_EXPIRED` | Token authorization epoch is stale (`tokenAuthzVersion < currentAuthzVersion`). Session revoked. |
| **401 Unauthorized** | `UNAUTHORIZED` | Request missing valid authentication token or context (`!req.user`). |
| **403 Forbidden** | `INSUFFICIENT_PERMISSIONS` | Caller lacks the granular permission required for the operation. |
| **403 Forbidden** | `ROLE_NOT_AUTHORIZED` | Caller does not possess the operational or governance role required. |
| **403 Forbidden** | `SHOP_ACCESS_DENIED` | Caller attempts to operate on a shop/branch they are not assigned to. |
| **403 Forbidden** | `RESOURCE_FORBIDDEN` | Caller does not own the resource and lacks manager override permissions. |
| **403 Forbidden** | `PLATFORM_ADMIN_REQUIRED` | Non-platform-super-admin caller attempts to access a platform-only route. |
| **404 Not Found** | `RESOURCE_NOT_FOUND` | Anti-oracle behavior: Resource does not exist, belongs to another organization, or cross-tenant query. |
| **500 Internal Error** | `AUTHORIZATION_CONTEXT_MISSING` | Misconfigured route: `authorize` called without preceding `authzContext` middleware. Fail-closed. |

---

## 8. Practical Route Usage Examples

```javascript
const { auth, authzContext, authorize } = require('../middleware/auth');

// Example 1: Read-only endpoint requiring granular permission
router.get('/users',
  auth,
  authzContext,
  authorize('view_users'),
  userController.listUsers
);

// Example 2: Organization management requiring org_admin or owner role
router.put('/organization/settings',
  auth,
  authzContext,
  authorize({ requireOrgAdmin: true }),
  orgController.updateSettings
);

// Example 3: Branch-specific inventory update
router.post('/shops/:shopId/inventory',
  auth,
  authzContext,
  authorize({
    permission: 'manage_inventory',
    shopScope: 'param'
  }),
  inventoryController.adjustStock
);

// Example 4: Invoice update with ownership & anti-oracle protection
router.put('/invoices/:id',
  auth,
  authzContext,
  authorize({
    ownership: {
      getResource: (req) => Invoice.findByPk(req.params.id),
      getOwnerId: (inv) => inv.userId,
      managerPermission: 'manage_invoices',
      antiOracle: true
    }
  }),
  invoiceController.updateInvoice
);

// Example 5: Platform Super-Admin system configuration
router.get('/admin/system-health',
  auth,
  authzContext,
  authorize({ platformOnly: true }),
  adminController.getSystemHealth
);
```

---

## 9. Backward Compatibility & Unmigrated Routes

### 9.1 Zero Premature Migration Rule
Under **Gate 2C**, zero existing routes have been migrated to `authorize`.
- All existing production endpoints continue to be protected by their legacy middleware (`auth`, `checkRole`, `checkPermission`).
- `checkRole` and `checkPermission` continue to operate as before, while benefiting from the upstream `authzContext` session validation where installed.

### 9.2 Coexistence During Phased Migration
In subsequent gates (Gate 3 onwards), routes will be systematically migrated module-by-module.
Because `authorize` accepts both granular permission identifiers and role constraints while seamlessly verifying `req.authz`, migration of individual routes can occur with zero disruption to unaffected modules.

---

## 10. Adversarial Security Verification Summary

The Gate 2C implementation is verified by a 34-scenario adversarial security test suite (`backend/tests/gate2cAuthorizationPrimitive.test.js`):

1. **Context Integrity (Scenarios 1-3):** Missing context fails closed (500), unauthenticated requests fail (401), stale epoch sessions fail (401).
2. **Tenant Isolation (Scenarios 4-6):** Cross-tenant queries masked (404), token org mismatch denied, resource org isolation verified.
3. **Shop Scope (Scenarios 7-9):** Unauthorized branch access rejected (403), assigned branch allowed, wildcard branch access allowed.
4. **Permissions (Scenarios 10-15):** Single permission allowed/denied, `mode: 'all'` passes only if all held, `mode: 'any'` passes if at least one held, unassigned permission denied.
5. **Role Hierarchy (Scenarios 16-19):** Single and multi-role checks, governance role (`requireOrgOwner`), operational admin (`requireOrgAdmin`).
6. **Ownership & Manager Fallback (Scenarios 20-24):** Owner mutation allowed, non-owner denied, manager override allowed with permission, manager cross-tenant denied (404 anti-oracle), custom ownership predicate verified.
7. **Anti-Oracle Protections (Scenarios 25-27):** Non-existent resource returns 404, other tenant resource returns 404 without leaking existence.
8. **Epoch & Cache Invalidation (Scenarios 28-30):** Token with stale `authzVersion` denied (401), token with matching version allowed, user epoch bump immediately invalidates active sessions.
9. **Platform Boundary (Scenarios 31-32):** Non-platform caller rejected (403), platform super-admin allowed on platform route but cannot cross into tenant routes without membership.
10. **Composite & Custom Rules (Scenarios 33-34):** Multi-factor evaluation (role + permission + branch scope), custom dynamic predicate evaluated.
