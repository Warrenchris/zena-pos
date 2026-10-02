# Zana POS — Canonical Authorization Context Design & Security Hardening

## 1. Executive Summary & Gate 1 Mandate

- **Document Path**: `docs/security/CANONICAL-AUTHORIZATION-DESIGN.md`
- **Phase**: **Gate 1 — Canonical Authorization Context Design (Revised & Hardened)**
- **Baseline Commit**: `9e16be2` (October 2, 2026)
- **Status**: **Revised Architecture Design / Awaiting Gate 1 Formal Sign-Off**

### 1.1 Objective & Scope
Following conditional approval of Gate 1, this document provides the revised, hardened architectural specification for the centralized authorization system in Zana POS.

The foundational principle of this design is:
> **Decouple authorization from static, unverified JWT claims (`req.user.role`) and converge all authorization evaluations onto an authoritative, tamper-proof Authorization Context (`req.authz`), backed strictly by the database as the authoritative source of truth.**

This hardening addresses four critical architectural requirements:
1. **Separation of Concerns**: Unambiguous division of labor between `authzVersion` (epoch tracking for authorization state mutations) and token revocation/cutoff (session and credential security invalidation).
2. **Authoritative Transaction Semantics**: Strict `DB-first -> commit -> cache-invalidate` ordering where Redis is strictly an ephemeral cache, never the authority.
3. **Strict Role Disambiguation**: Formal separation of governance authority (`OrganizationMembership.orgRole`), operational profile (`effectiveRole`), and granular capabilities (`permissions`), eradicating the false equivalence of `org_admin === manager`.
4. **Fail-Closed Context Invariants**: Elimination of all fallback paths to raw JWT claims. If `req.authz` is missing or unconstructed, security-sensitive authorization fails closed immediately.

---

## 2. Canonical Authorization Pipeline

Every request targeting a protected API endpoint traverses the following deterministic 8-step pipeline:

```text
[1] Authentication (Bearer JWT)
     │ • RS256 signature verification & expiration check
     │ • Rejection of non-session tokens (e.g. password_reset)
     ▼
[2] Session Liveness & Revocation Cutoff
     │ • Token JTI blacklist check (logout)
     │ • User revocation cutoff check (password reset, account close)
     │ • Authorization epoch check (JWT authzVersion vs authoritative version)
     ▼
[3] Tenant Context & Organization Membership
     │ • Organization existence & subscription status (active, past_due, suspended, deleted)
     │ • OrganizationMembership lookup for caller (userId or employeeId)
     │ • Membership status check (active vs suspended)
     ▼
[4] Governance Role (orgRole) & Operational Role Resolution
     │ • Resolution of orgRole: 'owner' | 'admin' | 'member' | 'billing_admin'
     │ • Resolution of effectiveRole: 'admin' | 'manager' | 'cashier' | 'org_admin'
     │ • Admin equivalence to owner preserved (admin -> 'all' permissions)
     ▼
[5] Branch / Shop Scope Delegation
     │ • activeShopId resolution from request / JWT claim
     │ • ShopAccess verification:
     │   - Owner: universal implicit bypass across all organization branches
     │   - Admin/Manager/Cashier: verified against explicit ShopAccess table records
     │   - billing_admin: zero operational branch access
     │ • Anti-Oracle enforcement: unauthorized branch queries return 404 Not Found
     ▼
[6] Granular Permission Resolution
     │ • Dynamic lookup against RolePermission matrix via Redis cache:
     │   Key: permissions:org:{organizationId}:role:{effectiveRole}
     │ • Admin role evaluates to true immediately ('all')
     │ • DB fallback if cache miss or Redis unavailable (Fail-Closed)
     ▼
[7] Resource Scope & Ownership Evaluation
     │ • Tenant isolation (WHERE organizationId = req.authz.tenant.organizationId)
     │ • Branch isolation (WHERE shopId = req.authz.scope.activeShopId)
     │ • Fine-grained ownership (Cashier owns HeldCart vs Manager override)
     ▼
[8] FINAL ACCESS DECISION: ALLOW or DENY (401 / 403 / 404)
```

---

## 3. FIX #1 — Separation of Responsibilities: `authzVersion` vs. Token Revocation

To prevent competing or ambiguous invalidation systems, the responsibilities of `authzVersion` and token revocation/cutoff are strictly partitioned:

```text
                             AUTHORIZATION CHANGE
                                      │
                     ┌────────────────┴────────────────┐
                     ↓                                 ↓
               authzVersion                       Token Cutoff
            (Authorization Epoch)             (Session Invalidation)
                     │                                 │
                     │ • Role/Position change          │ • Password change / reset
                     │ • orgRole change                │ • Logout / Logout-all
                     │ • ShopAccess grant/revoke       │ • Account termination
                     │ • Membership suspended          │ • Organization closure
                     │ • RolePermission matrix change  │ • Emergency security event
                     │                                 │
                     └────────────────┬────────────────┘
                                      ↓
                           Existing token rejected
```

### 3.1 `authzVersion` (Canonical Authorization Epoch)
`authzVersion` is an unsigned integer stored in the database on `Users` and `Employees` records (starting at `1`) and stamped into the JWT payload upon minting.
* **Scope of Responsibility**:
  * Alterations to `User.role` or `Employee.position`.
  * Alterations to `OrganizationMembership.orgRole` or `OrganizationMembership.status`.
  * Granting, revoking, or updating `ShopAccess` branch assignments.
  * Tenant-level permission matrix updates that alter the user's role bundle.
* **Mechanism**:
  * An authorization-changing event increments the entity's `authzVersion` in the database.
  * Middleware compares the JWT's `decoded.authzVersion` against the authoritative `authzVersion`.
  * If `decoded.authzVersion < currentAuthzVersion`, the session's authorization claims are stale: the request is rejected with `401 Unauthorized` (`code: 'AUTHZ_VERSION_STALE'`), requiring the client to refresh its session.

### 3.2 Token Revocation & Cutoff (Security & Session Invalidation)
Managed by `tokenRevocationService` via Redis and in-memory tombstones.
* **Scope of Responsibility**:
  * User logout (single token JTI blacklist via `revokeToken(jti, exp)`).
  * Password change or password reset (user-level cutoff timestamp via `revokeAllUserTokens(id, isEmployee)`).
  * Organization closure or account termination (all memberships revoked).
  * Emergency incident response (immediate invalidation of all active credentials).
* **Mechanism**:
  * Sets a Unix cutoff timestamp `revoked_tokens_cutoff:{type}:{id}`.
  * Any token issued with `iat <= cutoff` is immediately rejected with `401 Unauthorized` (`code: 'TOKEN_REVOKED_BY_CUTOFF'`).

### 3.3 Authority Relationship
* **`authzVersion` is the canonical mechanism for authorization state changes.**
* **Token revocation is the security mechanism for session destruction and credential resets.**
* Neither mechanism allows Redis to become the authority: **The database is the ultimate authority for `authzVersion`, and Redis serves exclusively as a caching layer.**

---

## 4. FIX #2 — Database Authority, Transaction Semantics & Failure Modes

### 4.1 Transaction Execution Pattern
Authorization mutations must guarantee consistency across the database and cache. All state mutations MUST follow this strict sequence:

```text
1. BEGIN DB TRANSACTION
      ↓
2. Apply authorization mutation (e.g. update Employee.position, update ShopAccess)
      ↓
3. Increment authzVersion on target User / Employee (within the same transaction)
      ↓
4. COMMIT DB TRANSACTION
      ↓
5. Invalidate / update Redis cache (authz_version and permission keys)
```

> **Core Principle**: Database state is authoritative. Redis is an ephemeral cache only.

### 4.2 Failure Modes and Fail-Safe Behavior

| Failure Scenario | System Behavior | Security Outcome |
|---|---|---|
| **DB Transaction Rollback** | Transaction aborts before commit. `authzVersion` is not incremented in the database. Redis is **NOT** touched. Caller receives error. | **Safe**: No partial authorization state exists. |
| **Redis Unavailable** | System logs a warning and falls back to direct database reads for `authzVersion` and `RolePermission`. | **Safe**: Authorization checks continue using DB truth. Under no circumstances does Redis unavailability grant unauthorized access. |
| **Redis Contains Stale Data** | If Redis caches an old `authzVersion` or old role permissions, the cache key TTL (max 300s) limits exposure. For security-sensitive actions, database validation is authoritative. | **Safe**: `Redis says authorized` can NEVER override `Database says unauthorized`. |
| **Process Crash After Commit but Before Redis Invalidation** | DB holds the new `authzVersion`. Old Redis cache expires via TTL (300s). In addition, any new token issued reads the DB version. | **Safe**: Eventual consistency within TTL window; DB state is authoritative on cache miss. |
| **Database Query Error during Authz** | If the database fails during context hydration or fallback, the request immediately terminates. | **Fail-Closed**: Returns `500 Internal Server Error` or `503 Service Unavailable`. Zero requests are allowed through unverified. |

---

## 5. FIX #3 — Strict Role Semantics & Governance vs. Operational Separation

To eliminate ambiguity across the codebase, three distinct authorization dimensions are formally defined:

### 5.1 Governance Role (`OrganizationMembership.orgRole`)
* **Core Question**: *What administrative authority does this actor possess over the organization entity?*
* **Storage**: `OrganizationMemberships.orgRole` (ENUM: `'owner'`, `'admin'`, `'member'`, `'billing_admin'`).
* **Definitions**:
  * **`owner`**: The creator / primary legal owner of the organization. Holds absolute administrative authority, universal branch access bypass, and exclusive rights to data export, account closure, and subscription management.
  * **`admin`**: A delegated organizational administrator. Can manage staff, assign branch access, and view organizational insights within authorized branches. Cannot modify the owner account or close the organization.
  * **`member`**: Standard operational staff member (cashier, manager). Holds zero organizational governance rights.
  * **`billing_admin`**: Specialized administrative actor with authority over invoices, payment methods, and subscription renewal. Holds **zero operational POS access**.

### 5.2 Operational Role (`effectiveRole`)
* **Core Question**: *What operational profile does this actor use when interacting with the POS and store operations?*
* **Values**: `'admin'`, `'org_admin'`, `'manager'`, `'cashier'`.
* **Resolution**:
  * Account Owner (`orgRole === 'owner'`) -> `effectiveRole = 'admin'`
  * Delegated Admin (`orgRole === 'admin'`) -> `effectiveRole = 'org_admin'`
  * Store Manager (`orgRole === 'member'` AND position/role `'manager'`) -> `effectiveRole = 'manager'`
  * Cashier / Staff (`orgRole === 'member'` AND position/role `'cashier'`) -> `effectiveRole = 'cashier'`

### 5.3 Granular Permissions
* **Core Question**: *What specific business operation is this actor permitted to execute?*
* **Examples**: `manage_coupons`, `manage_discounts`, `manage_shop_access`, `manage_held_carts`, `create_sales`, `view_sales`, `manage_sales`, `process_refunds`, `manage_settings`, `view_dashboard`, `view_reports`.

### 5.4 Disambiguation: `org_admin` vs. `manager`
> **CRITICAL ARCHITECTURAL DIRECTIVE**:  
> `org_admin` and `manager` are **NOT** semantically equivalent.  
> 
> * `org_admin` is a **governance role** representing a delegated organization administrator who can manage staff, assign shop access, and view cross-branch reporting for authorized shops.
> * `manager` is a **branch-level operational supervisor** who runs day-to-day store operations, overrides cashier carts, and processes refunds.
> 
> The mapping of `org_admin -> manager` in `permissionCache.js` (`ROLE_NORMALIZATION_MAP`) is strictly a **backward-compatible permission bundle mapping** to grant operational store abilities without creating redundant duplicate permission sets. It does **NOT** downgrade an `org_admin` to a manager, nor does it elevate a `manager` to an organizational administrator.

---

## 6. FIX #4 — Fail-Closed Context Invariant on Missing `req.authz`

### 6.1 Elimination of JWT Fallback Bypass
The previous draft contained a dangerous fallback pattern:
```javascript
// DANGEROUS PATTERN — ELIMINATED:
const currentRole = req.authz ? req.authz.role.effectiveRole : req.user?.role;
```

**This pattern is completely eradicated.** Allowing authorization middleware to fall back to `req.user.role` (decoded JWT claims) preserves the exact stale-token vulnerability Gate 1 was mandated to solve.

### 6.2 Fail-Closed Invariant Specification
Every authorization middleware (`checkPermission`, `checkRole`, `requireOrgAdmin`, `requireOrgOwner`, or resource guard) MUST enforce this invariant:

```javascript
// CANONICAL FAIL-CLOSED PATTERN:
if (!req.authz) {
  logger.error('[SECURITY INVARIANT VIOLATION] req.authz is missing in authorization middleware', {
    url: req.originalUrl,
    method: req.method,
    requestId: req.requestId || req.id
  });
  return res.status(500).json({
    error: 'Internal authorization error: authorization context uninitialized.',
    code: 'AUTHORIZATION_CONTEXT_MISSING'
  });
}
```

### 6.3 Security Defenses Achieved
This invariant rigorously protects the application against:
1. **Middleware Ordering Errors**: Mounting `checkRole()` or `checkPermission()` before `authzContext` immediately fails closed with an HTTP 500 error, alerting engineers during testing rather than silently granting access via stale JWT claims.
2. **Accidentally Mounted Routes**: Routes mounted without the full authentication and context pipeline cannot be accessed.
3. **Future Developer Mistakes**: Future contributors cannot accidentally bypass context checks by relying on `req.user.role`.

> [!IMPORTANT]
> `req.user` is preserved solely for backward-compatible *data consumption* (e.g., retrieving `req.user.email` or `req.user.name` in legacy controllers). It is **NEVER** used as an authorization fallback.

---

## 7. Middleware Contract & Request Lifecycle

The request lifecycle is partitioned into distinct, single-responsibility middleware tiers:

```text
Request
  │
  ▼ [Tier 1] requestContext
  │   • Correlation ID (X-Request-Id), request start time
  ▼ [Tier 2] auth (Authentication)
  │   • Verify JWT RS256 signature, expiry, purpose
  │   • Verify token JTI blacklist and password cutoff timestamp
  │   • Hydrate base identity (id, email, isEmployee)
  ▼ [Tier 3] authzContext (Canonical Context Builder)
  │   • Verify authzVersion against DB/cache (reject if stale)
  │   • Hydrate Organization & verify subscription status
  │   • Hydrate OrganizationMembership & verify active status
  │   • Resolve governance orgRole and operational effectiveRole
  │   • Resolve ShopAccess & build accessibleShopIds
  │   • Load RolePermission bundle from DB/Redis
  │   • Construct and attach immutable req.authz
  ▼ [Tier 4] checkPermission / checkRole (Action Authorization)
  │   • Fail-closed if req.authz is undefined
  │   • Verify actor possesses required permission for action
  ▼ [Tier 5] Resource Authorization (Scope & Ownership)
  │   • Verify target shopId is in req.authz.scope.accessibleShopIds (or owner bypass)
  │   • Verify target entity ownership (e.g. cashierId on HeldCart)
  ▼ [Tier 6] Controller
      • Execute business logic against pre-authorized, pre-scoped request
```

### Layer Responsibilities:
* **`auth`**: Answers *"Who is making this request, is their cryptographic session valid, and has their token been revoked?"*
* **`authzContext`**: Answers *"What is this actor's authoritative organizational state, what branch rights do they possess, and what permissions are in their bundle right now?"*
* **`checkPermission`**: Answers *"Does this actor have permission to execute action X?"*
* **`resource authorization`**: Answers *"Does this actor have authority over THIS specific resource instance?"*

---

## 8. Verification Requirements for Financial Endpoints (Gate 2/3 Mandate)

Before applying authorization middleware to financial endpoints (`/api/dashboard/*`, `/api/analytics/*`, `/api/insights/*`), the implementation team must verify each route through an end-to-end data tracing audit.

### 8.1 Required Query-Level Trace
Every financial route must be audited through:
```text
Route → Controller → Service → SQL Query → Org Scope → Shop Scope → Returned Financial Fields
```

### 8.2 Mandatory 9-Point Audit Checklist
For each endpoint under review, the audit must document:
1. **Returned Payload**: What exact JSON data structure is returned?
2. **Organization Scope**: Is the query scoped strictly to `req.authz.tenant.organizationId`?
3. **Branch Scope**: Is the query scoped to `req.authz.scope.activeShopId` or across multiple branches?
4. **Revenue Exposure**: Does the payload expose gross or net revenue figures?
5. **Profit Exposure**: Does the payload expose gross profit, net profit, or margin percentages?
6. **Cost / Expense Exposure**: Does the payload expose product wholesale costs, expenses, or supplier pricing?
7. **Customer PII**: Does the payload expose customer names, phone numbers, or loyalty balances?
8. **Legitimate Consumer Roles**: Does a cashier terminal legitimately need this data (e.g., cashier shift sales), or is it strictly management intelligence?
9. **Target Permission**: What is the canonical permission that must protect this endpoint?

> **Rule**: Do not apply blanket `view_reports` across all analytics routes without proving whether the underlying data represents operational register data or executive financial intelligence.

---

## 9. Strengthened Shop Access Semantics

Branch delegation rules are formally defined across all governance and operational roles:

| Role | Governance Tier | Operational Role | Branch Access Rule | ShopAccess Table Required? |
|---|---|---|---|:---:|
| **Organization Owner** | `owner` | `admin` | **Universal Implicit Bypass**: Can access every active shop in the organization. | ❌ No |
| **Delegated Admin** | `admin` | `org_admin` | **Explicit Delegation**: Strictly constrained to shops granted in `ShopAccess` (plus shops created by this admin). | ✅ Yes |
| **Branch Manager** | `member` | `manager` | **Explicit Delegation**: Strictly constrained to shops granted in `ShopAccess`. | ✅ Yes |
| **Cashier / Staff** | `member` | `cashier` | **Explicit Delegation**: Strictly constrained to their assigned home shop in `ShopAccess`. | ✅ Yes |
| **Billing Admin** | `billing_admin` | *None* | **Zero Operational POS Access**: Authorized for subscription management and invoice viewing. Holds zero rights to access POS register data, sales, or inventory. | ❌ N/A |

---

## 10. Anti-Oracle Semantics & Status Code Taxonomy

To prevent attackers from probing resource existence or organization boundaries, status codes are strictly standardized:

| Status Code | Standard Meaning | Exact Zana POS Authorization Usage |
|---|---|---|
| **`401 Unauthorized`** | Authentication Failure | Missing token, invalid signature, expired token, revoked JTI, token revoked by password cutoff, or stale `authzVersion`. |
| **`403 Forbidden`** | Permission Failure | Caller is authenticated and operates within their valid organization/branch, but lacks the specific permission or governance tier to perform the requested action (e.g., Cashier attempting `POST /api/coupons`). |
| **`404 Not Found`** | Resource Invisibility (Anti-Oracle) | Caller attempts to query or mutate a branch (`shopId`) outside their `accessibleShopIds`, a record belonging to another organization, or another cashier's private resource (e.g. HeldCart) without manager override permissions. Prevents cross-tenant existence enumeration. |

---

## 11. Strengthened Permission Cache Design

### 11.1 Key Architecture
```text
permissions:org:{organizationId}:role:{effectiveRole}
```
* **Source of Truth**: Database `RolePermissions` joined with `Permissions`.
* **Cache Medium**: Redis (`TTL = 3600s`).
* **Cache Population**: On cache miss, load from DB, seed default permissions if missing, and populate Redis.
* **Cache Invalidation**: Triggers immediately on:
  * Updates to `RolePermission` via Sequelize model hooks.
  * Direct updates via `PUT /api/permissions/matrix`.
  * Seeding/provisioning of new organizations.
  * When invalidating `manager`, the alias `org_admin` is atomically invalidated as well.

### 11.2 Fail-Closed Redis Policy
If Redis crashes, times out, or disconnects:
1. The system logs a critical warning.
2. The system executes a direct database query to load authoritative permissions.
3. If the database query also fails, the request fails closed (`500 Internal Server Error`).
4. **Under no circumstances does a cache failure grant permissions or allow access.**

---

## 12. Legacy `checkRole()` as a Temporary Adapter

`checkRole()` is explicitly classified as a **legacy compatibility adapter**, NOT the future authorization architecture.

### 12.1 Target Paradigm
* **New Code**: MUST use `checkPermission(canonicalPermission)` evaluating against `req.authz.permissions`.
* **Legacy Code**: Routes currently using `checkRole(allowedRoles)` route through an adapter that checks `req.authz.role.effectiveRole` (with mandatory fail-closed verification).
* **Deprecation Notice**: No new endpoint may be introduced using `checkRole()`. Existing call sites will be systematically migrated to canonical permissions in subsequent phases.

---

## 13. Invoice Authorization Specification (Closing Gap J)

The invoice mutation gap discovered during Phase 0 is formally resolved without inventing redundant permissions:

| Endpoint | Method | Pipeline Guard | Target Permission | Rationale |
|---|---|---|---|---|
| `/api/invoices` | `POST` | `auth`, `authzContext`, `checkPermission('create_sales')` | `create_sales` | Authorized cashiers and managers can generate invoices for store sales. |
| `/api/invoices/:id` | `PUT` | `auth`, `authzContext`, `checkPermission('manage_sales')` | `manage_sales` | Modifying existing issued invoices requires management authority. |
| `/api/invoices/:id` | `DELETE` | `auth`, `authzContext`, `checkPermission('manage_sales')` | `manage_sales` | Voiding/deleting issued invoices requires management authority. |
| `/api/invoices/:id/pdf` | `GET` | `auth`, `authzContext`, `checkPermission('view_sales')` | `view_sales` | Viewing/downloading invoice documents requires sales view access. |

---

## 14. M-Pesa & Financial Payment Authorization Boundary

### 14.1 Credential Secrecy Invariant
* M-Pesa Daraja credentials (`consumerKey`, `consumerSecret`, `passkey`, `tillNumber`) are sensitive secrets stored in tenant settings.
* **Under NO circumstances are raw payment credentials exposed in `req.authz`, `req.user`, JWT claims, or client-facing responses.**
* Payment credentials are loaded strictly within isolated backend payment services (`mpesaService.js`).

### 14.2 Webhook Security
* M-Pesa callbacks (`/api/mpesa/callback`) operate outside user session authentication.
* They are secured via single-use cryptographic tokens passed in query parameters, validated with `crypto.timingSafeEqual`, and processed under pessimistic database row locks (`t.LOCK.UPDATE`).

### 14.3 Future Payment Configuration Endpoints
Any endpoint permitting modification of M-Pesa till numbers or credentials must strictly require:
* `requireOrgOwner` (Owner governance authority).
* Verified email.
* Audit logging.

---

## 15. Comprehensive Authorization Invariants

The following invariants must be preserved across all implementations:

1. **Tenant Invariant**: A request may never access, query, or mutate another organization's resources.
2. **Branch Invariant**: A non-owner may only access branches explicitly granted through `ShopAccess`.
3. **Permission Invariant**: Possessing an administrative role does not bypass tenant or branch scope boundaries.
4. **Session Invariant**: Authorization mutations increment `authzVersion`, immediately invalidating pre-existing sessions.
5. **Context Invariant**: Security-sensitive authorization may never evaluate raw JWT claims after `req.authz` initialization; missing `req.authz` fails closed.
6. **Cache Invariant**: Database state is authoritative; Redis is strictly an ephemeral cache; Redis may never override database truth.
7. **Platform Invariant**: Platform `super_admin` operates exclusively within platform administration and must never be inferred from tenant permissions.
8. **Payment Invariant**: Payment provider credentials are never part of the authorization context or client session state.

---

## 16. Phased Gate 2 Implementation Sequence

To ensure zero downtime, backward compatibility, and rigorous verification, Gate 2 must be executed in the following sequential order:

```text
[Gate 2A] Canonical authzContext Implementation
          • Create backend/src/middleware/authzContext.js
          • Implement req.authz builder & fail-closed guards
          ↓
[Gate 2B] authzVersion & Session Invalidation
          • Create migration for authzVersion on Users & Employees
          • Update tokenRevocationService and controllers (updateRole, updateEmployee)
          ↓
[Gate 2C] checkRole / checkPermission Integration
          • Refactor checkRole to evaluate req.authz.role.effectiveRole
          • Wire checkPermission directly to req.authz.permissions.has()
          ↓
[Gate 2D] Permission Cache Hardening & Seeder Backfill
          • Backfill 4 canonical permissions (manage_coupons, manage_discounts, manage_shop_access, manage_held_carts)
          • Implement fail-closed Redis DB fallback
          ↓
[Gate 2E] Financial Endpoints Verification & High-Risk Migration
          • Execute query-level audit of dashboard/analytics/insights
          • Migrate coupons, discounts, shop access, dashboard, and invoices
          ↓
[Gate 2F] Resource Ownership & Fine-Grained Scoping
          • Implement cashier ownership on heldCartRoutes.js with manager override
          ↓
[Gate 2G] Adversarial Security Test Suite
          • Build and execute all 8 adversarial test files to prove verification
```

---

## 17. Explicit Gate 2 Entry Criteria

Gate 2 implementation must **NOT** begin until all of the following criteria are satisfied:
- [x] Canonical `req.authz` contract finalized and reviewed.
- [x] Clear division between `authzVersion` and token revocation established.
- [x] Database authority and Redis cache failure modes specified.
- [x] Role semantics (governance vs operational vs permissions) formally disambiguated.
- [x] Fail-closed behavior on missing `req.authz` established.
- [x] Financial endpoint 9-point verification checklist documented.
- [x] Shop access delegation and billing_admin boundaries established.
- [x] M-Pesa credential isolation and webhook boundaries established.
- [x] Gate 2 sequential roadmap and adversarial test plans agreed upon.
- [ ] **Formal User Approval of Gate 1 Revised Design.**

---

## 18. Gate 1 Stop Notice

> [!IMPORTANT]
> **GATE 1 REVISED DESIGN COMPLETED — AWAITING FORMAL APPROVAL**  
> Complete design documentation is saved in [`docs/security/CANONICAL-AUTHORIZATION-DESIGN.md`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/docs/security/CANONICAL-AUTHORIZATION-DESIGN.md).  
> 
> **Zero application code has been modified.**  
> Execution is halted. Awaiting formal user approval before starting Gate 2A.
