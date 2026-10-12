# Stage B Design: Short-TTL Versioned Authorization Context Cache

**Repository**: `Warrenchris/zena-pos`  
**Branch**: `perf/auth-context-cache` (cut from `origin/master` @ `b35ce82`)  
**Status**: Stage B — Approved Design Baseline for Stage C1, C2, C3

---

## 0. Updated Facts for Stage B (Baseline & Prerequisites)

> **UPDATED FACTS FOR STAGE B (override earlier background where they differ)**
> - **PR #3** (`DEBUG_SQL` opt-in, env-driven pool, merge commit `b8736b3`) and **PR #4** (`authzContext` runs once per request via a module-private `WeakSet`; `DB_POOL_MAX >= 1`; prod `DB_POOL_MAX` default `10`, merge commit `b35ce82`) are merged into `master`.
> - **Measured warm baseline** (deterministic, from committed [`docs/perf/BASELINE.md`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/docs/perf/BASELINE.md) Section 6 `AFTER-A2`):
>   - `GET /api/auth/profile`: **`6` SQL** (`4` pre-handler + `2` handler), **`7` Redis commands**.
>   - `GET /api/sales/statistics`: **`8` SQL** (`4` pre-handler + `4` handler), **`8` Redis commands**.
>   - **Dashboard burst (11 requests, warm)**: **`65` SQL queries** (`44` pre-handler + `21` handler).
>   - The **4 warm pre-handler SQL queries** are all inside [`backend/src/middleware/authzContext.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/authzContext.js):
>     1. `User.findByPk` (or `Employee.findByPk` for employee tokens)
>     2. `OrganizationMembership.findOne`
>     3. `Organization.findByPk`
>     4. `Shop.findAll` (for owners) or `ShopAccess.findAll` (for non-owners)
>   - *(Note: On cold cache misses, pre-handler middleware also queries `Users.authzVersion` in `tokenRevocationService.getAuthzVersion`, `Users.active` in `tokenRevocationService.getUserStatus`, `Users.emailVerifiedAt/createdAt` in `emailVerification7DayGate`, and `Subscriptions`/`Plans` in `tokenRevocationService.getOrgStatus`, totaling `7–12` pre-handler SQL queries on cold requests.)*
> - **Latency note**: Latency numbers in `BASELINE.md` are noisy across sessions; SQL and Redis command counts are the primary deterministic metric, and latency comparisons are only valid when measured back-to-back in one session.
> - **Stage B Goal**: Design the short-TTL versioned auth context cache so warm pre-handler SQL drops from **`4` to `0`** (target `0–1`) and warm pre-handler Redis commands drop from **`~7–8` to `<= 3`**, with **every authorization change taking effect on the very next request**.
> - `authzContext` already has a per-request completion guard (`completedAuthzRequests` `WeakSet` in [`backend/src/middleware/authzContext.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/authzContext.js#L15)).

---

## 1. Complete Inventory of Fields Placed on `req` by Pre-Handler Auth Middleware

The pre-handler authentication and authorization pipeline consists of three middlewares mounted in [`backend/src/server.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/server.js#L261-L263) and route files:
1. [`emailVerification7DayGate`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireVerifiedEmail.js#L153-L248) (global `/api` gate in `server.js:263`, plus [`requireVerifiedEmail`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireVerifiedEmail.js#L112-L144) on sensitive routes)
2. [`auth`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/auth.js#L8-L118) (`backend/src/middleware/auth.js`)
3. [`authzContext`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/authzContext.js#L21-L459) (`backend/src/middleware/authzContext.js`)

### 1.1 `req` Top-Level Properties Set by `auth.js` and `authzContext.js`

| Property | Set By | Source of Truth | Event That Changes It | Bumps `authzVersion` (With Stage C2)? | Cache Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `req.shopId` | `auth.js:52` (`decoded.shopId`), updated by `authzContext.js:445` (`activeShopId`) | For `super_admin`: `decoded.shopId` (`undefined`/`null`). For tenant users/employees: `req.shopId \|\| tokenShopId \|\| null`. | `POST /api/auth/switch-shop` (`authController.js:621` mints new JWT with new `shopId`, **zero DB writes**) | **NO** (per-token claim) | **COMPUTED PER REQUEST** from `req.shopId \|\| tokenShopId \|\| null`. **Never cached inside `authz_ctx`** because `switch-shop` changes the JWT `shopId` without touching the database. |
| `req.organizationId` | `auth.js:55-65` (`decoded.organizationId` or `Shop.findByPk`), updated by `authzContext.js:446` (`organization.id`) | `OrganizationMembership.organizationId` (`status: 'active'`) + `Organization.id` | Membership creation/status change (`OrganizationMembership`) | **YES** (all membership status/role updates bump `authzVersion`) | **CACHEABLE IN `authz_ctx`** (`tenant.organizationId`). |
| `req.membership` | `authzContext.js:447` (`membership`, tenant only; `undefined` for `super_admin`) | `OrganizationMembership` row (`{ id, organizationId, userId, employeeId, orgRole, status }`) | Membership role change (`orgRole`), status change (`active`/`suspended`), or deletion | **YES** (every `OrganizationMembership` status or `orgRole` update bumps `authzVersion`) | **CACHEABLE IN `authz_ctx`** (`tenant` metadata reconstructed into `req.membership` plain object with `{ id, organizationId, userId, employeeId, orgRole, status }`). |

---

### 1.2 `req.user` Fields (`auth.js:51` -> Synchronized by `authzContext.js:130-134, 433-444`)

`auth.js:51` initializes `req.user = decoded` (from `jwt.verify`), and `authzContext.js:433-444` (or `130-134` for `super_admin`) merges the resolved identity and role fields onto `req.user`:

| Field on `req.user` | Set By | Source of Truth | Event That Changes It | Bumps `authzVersion` (With Stage C2)? | Cache Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `req.user.id` | `auth.js:51` (JWT), `authzContext.js:435` | `Users.id` (int) or `Employees.id` (UUID) | Immutable primary key | N/A | **CACHE IN `authz_ctx`** |
| `req.user.email` | `authzContext.js:436` | `Users.email` or `Employees.email` | `employeeController.updateEmployee`, `accountPurgeScheduler` | **NO** (cosmetic display field — never used in any authorization decision; may be stale up to TTL) | **CACHE IN `authz_ctx`** (bounded by `45`s TTL; never triggers `authzVersion` bump) |
| `req.user.name` | `authzContext.js:437` | `Users.name \|\| Users.email` or `${Employees.firstName} ${Employees.lastName}` | `employeeController.updateEmployee`, `accountPurgeScheduler` | **NO** (cosmetic display field — never used in any authorization decision; may be stale up to TTL) | **CACHE IN `authz_ctx`** (bounded by `45`s TTL; never triggers `authzVersion` bump) |
| `req.user.role` | `auth.js:51` (JWT), overwritten by `authzContext.js:132,438` (`effectiveRole`) | `'super_admin'`, or resolved `effectiveRole` from `membership.orgRole` + `Users.role` / `Employees.position` | `userController.updateRole`, `employeeController.updateEmployee`, direct model update | **YES** (`incrementAuthzVersion`) | **CACHE IN `authz_ctx`** |
| `req.user.orgRole` | `auth.js:51` (JWT), overwritten by `authzContext.js:439` | `OrganizationMembership.orgRole` (`'owner'`, `'admin'`, `'member'`, `'billing_admin'`) | `userController.updateRole`, `employeeController.updateEmployee`, direct model update | **YES** (`incrementAuthzVersion`) | **CACHE IN `authz_ctx`** |
| `req.user.shopId` | `auth.js:51` (JWT), overwritten by `authzContext.js:440` (`activeShopId`) | `req.shopId \|\| tokenShopId \|\| null` | `POST /api/auth/switch-shop` | **NO** (per-token claim) | **COMPUTED PER REQUEST** (`activeShopId`) — **NEVER CACHED** |
| `req.user.organizationId` | `auth.js:51` (JWT), overwritten by `authzContext.js:441` | `Organization.id` | Membership change | **YES** | **CACHE IN `authz_ctx`** |
| `req.user.isEmployee` | `auth.js:51` (JWT), `authzContext.js:442` | `Boolean(decoded.isEmployee)` | Immutable per identity | N/A | **CACHE IN `authz_ctx`** |
| `req.user.authzVersion` | `auth.js:51` (JWT), overwritten by `authzContext.js:133,443` | `currentVersion` (`Users.authzVersion` or `Employees.authzVersion`) | `tokenRevocationService.incrementAuthzVersion` | **YES** (is `authzVersion` itself) | **CACHE IN `authz_ctx`** AND embedded in key `authz_ctx:{u\|e}:<id>:v:<authzVersion>` |
| `req.user.jti`, `iat`, `exp` | `auth.js:51` (spread from `...req.user` in `authzContext.js:131,434`) | Current request's decoded JWT claims | Every login / refresh / switch-shop token | **NO** (per-token claims) | **FROM REQUEST JWT ONLY** (`decoded.jti`, `decoded.iat`, `decoded.exp`) — **NEVER CACHED** |

---

### 1.3 `req.authz` Fields (`authzContext.js:91-129, 391-430`)

| Sub-Object / Field on `req.authz` | Source of Truth | Event That Changes It | Bumps `authzVersion` or Epoch? | Cached in `authz_ctx` or Computed Per Request? |
| :--- | :--- | :--- | :--- | :--- |
| `identity` (`{ id, userId, employeeId, isEmployee, email, name }`) | `Users` or `Employees` | `id`/`userId`/`employeeId`/`isEmployee` are immutable; `email`/`name` are cosmetic display fields | **NO** for `email`/`name` (cosmetic only, bounded by TTL) | **Cached in `authz_ctx`** (frozen via `Object.freeze`) |
| `session` (`{ authzVersion, iat, exp, jti }`) | `authzVersion`: live `currentVersion`; `iat`, `exp`, `jti`: request JWT | Every new token issue or `authzVersion` bump | `authzVersion` bumps on authz change; `iat`/`exp`/`jti` are per-token | **Constructed per request** from `currentVersion` + request JWT `iat`, `exp`, `jti` |
| `tenant` (`{ organizationId, organizationName, organizationStatus, membershipId, orgRole, membershipStatus, isOwner, isOrgAdmin }` or `null` for `super_admin`) | `OrganizationMembership` + `Organization` + `tokenRevocationService.getOrgStatus` | Membership `orgRole`/`status` change; Organization `status`/`name` change | Membership `orgRole`/`status` changes **bump `authzVersion`**; `organizationName` is cosmetic (bounded by TTL); `organizationStatus` checked per request via `getOrgStatus` | `organizationId`, `organizationName`, `membershipId`, `orgRole`, `membershipStatus`, `isOwner`, `isOrgAdmin` **cached in `authz_ctx`**; `organizationStatus` **injected per request** from live `orgStatus` |
| `role` (`{ rawRole, effectiveRole }`) | `Users.role` / `Employees.position` + `OrganizationMembership.orgRole` (and `tokenRole === 'customer'` special case) | Role, position, or `orgRole` update | **Bumps `authzVersion`** | **Cached in `authz_ctx`** |
| `scope.homeShopId` | `Users.shopId` or `Employees.shopId` (`null` for `super_admin`) | User or Employee `shopId` reassignment | **Bumps `authzVersion`** | **Cached in `authz_ctx`** |
| `scope.activeShopId` | `req.shopId \|\| tokenShopId \|\| null` (`null` for `super_admin`) | `POST /api/auth/switch-shop` | **NO** (per-token claim) | **Computed per request** from request JWT `shopId` |
| `scope.accessibleShopIds` | For `orgRole === 'owner'`: active `Shops.id` in org. For non-owners: `ShopAccess.shopId` + `homeShopId`. (`[]` for `super_admin`) | For owners: Shop create/update/activate/deactivate/delete. For non-owners: `ShopAccess` grant/revoke or `homeShopId` change. | Non-owners: **bumps `authzVersion`**. Owners: **bumps `authz_org_shops_epoch:org:<orgId>`** (`INCR`). | Non-owner `memberAccessibleShopIds` in `authz_ctx`; Owner shop IDs in `authz_org_shops:org:<orgId>:e:<epoch>` |
| `scope.hasShopAccess(targetShopId)` | Closure over `accessibleShopIds` (`() => true` for `super_admin`) | Same as `accessibleShopIds` | Same as `accessibleShopIds` | **Reconstructed per request** over `accessibleShopIds` |
| `permissions` (`{ granted: Set, has, hasAny, hasAll }`) | `['*']` for `super_admin`; `['all']` for `effectiveRole === 'admin' \|\| orgRole === 'owner'`; `['view_invoices', 'manage_billing']` for `billing_admin`; `permissionCache.getRolePermissions(effectiveRole, orgId)` for `manager`/`org_admin`/`cashier` | `PUT /api/settings/permissions/:role` or `/reset` (`settingsController.js` -> `permissionCache.invalidateRoleCache`) | Invalidates `permissions:org:<orgId>:role:<role>` in Redis (does not bump `authzVersion`) | **Out of `authz_ctx`** — resolved per request from `permissions:org:<orgId>:role:<role>` (and wrapped in frozen `{ granted, has, hasAny, hasAll }` helper) |
| `ownership` (`{ isOwnerOf, canManage }`) | Closure over `identityId`, `orgRole`, `effectiveRole`, `permissionsHelper` | Role / `orgRole` / permissions change | Covered by `authzVersion` + `permissions` | **Reconstructed per request** |

---

### 1.4 Verification That `email`, `name`, and `organizationName` Are Never Authorization Inputs

A full audit of all authorization middlewares and helpers confirms that **`email`, `name`, and `organizationName` are purely cosmetic display fields and are never used in any authorization decision, allowlist, or ownership check**:

1. **[`backend/src/middleware/requirePlatformSuperAdmin.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requirePlatformSuperAdmin.js#L56-L145)**:
   - Lines `99–101`: Checks `decoded.role !== 'super_admin'`.
   - Lines `108–130`: Queries `User.findByPk(decoded.id, { attributes: ['id', 'email', 'role', 'active', 'emailVerifiedAt'] })` and checks only `!user` (`:112`), `!user.active` (`:116`), `user.role !== 'super_admin'` (`:120`), and `!user.emailVerifiedAt` (`:125`).
   - Although `'email'` is listed in `attributes` at line `109`, `user.email` is **never read or compared against any allowlist** anywhere in `requirePlatformSuperAdmin.js`.
2. **[`backend/src/middleware/authorize.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/authorize.js#L16-L508)**:
   - `evaluateAuthorization(req, options)` inspects only `req.authz.role.effectiveRole` (`:46, 58, 205`), `req.authz.tenant.membershipStatus` (`:86`), `req.authz.tenant.organizationId` (`:98, 357`), `req.authz.tenant.isOwner` (`:110`), `req.authz.tenant.isOrgAdmin` (`:121`), `req.authz.scope.activeShopId` (`:136`), `req.authz.scope.hasShopAccess` (`:166, 189, 377`), `req.authz.permissions.has/hasAny/hasAll` (`:229–260, 429`), and `req.authz.ownership.isOwnerOf/canManage` (`:410–441`).
   - In [`backend/src/middleware/authzContext.js:378-381`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/authzContext.js#L378-L381), `ownership.isOwnerOf` compares `String(resourceOwnerId) === String(identityId)` (primary key ID only).
   - `email`, `name`, and `organizationName` are **never referenced** in `authorize.js`.
3. **[`backend/src/middleware/requireVerifiedEmail.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireVerifiedEmail.js#L72-L248)**, **[`backend/src/middleware/requireOrgAdmin.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireOrgAdmin.js#L12-L95)**, and **[`backend/src/middleware/requireOrgOwner.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireOrgOwner.js#L8-L38)**:
   - Keyed strictly by `userPayload.id` (`Users.id`), `OrganizationMembership.orgRole`, `OrganizationMembership.status`, and `Users.emailVerifiedAt`. Never inspect `email`, `name`, or `organizationName`.
4. **Controllers & Services (`git grep` across `backend/src/`)**:
   - `req.user.name` is referenced only as a cosmetic audit description string in [`backend/src/controllers/settingsController.js:218`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/settingsController.js#L218) and [`settingsController.js:330`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/settingsController.js#L330).
   - Therefore, cosmetic edits to `name`, `firstName`, `lastName`, `email`, or `organizationName` **must never bump `authzVersion`** and may safely remain cached up to `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` (`45`s).

---

### 1.5 Email Verification State (`requireVerifiedEmail.js`)

| Mechanism | File & Lines | Source of Truth | Event That Changes It | Bumps `authzVersion`? | Cache Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `emailVerification7DayGate` | [`requireVerifiedEmail.js:153-248`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireVerifiedEmail.js#L153-L248) | `Users.emailVerifiedAt` and `Users.createdAt` (applies only to owners; fails open when `!isEmailConfigured()`) | `POST /api/auth/verify-email` (`authController.js:759` sets `user.emailVerifiedAt`) | **NO** (verifying email must not invalidate the user's active session) | **Kept OUT of `authz_ctx`**. `verifiedCache` (`requireVerifiedEmail.js:50`) caches **only positive verification (`true`)**. On cold requests where `User` is read from DB, the request-scoped `User` loader shares the `User` row across `emailVerification7DayGate` and `authzContext` and primes `verifiedCache` when `emailVerifiedAt !== null`. |
| `requireVerifiedEmail` | [`requireVerifiedEmail.js:112-144`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/middleware/requireVerifiedEmail.js#L112-L144) | `Users.emailVerifiedAt` (applies only to owners) | `POST /api/auth/verify-email` (`authController.js:759`) | **NO** | Uses `verifiedCache` for positive hits; if not in `verifiedCache`, reads `User.findByPk` (shared on request scope) so email verification takes effect on the **very next request**. |

---

## 2. Epoch-Keyed Cache Architecture (Zero Wildcard `DEL`s)

### 2.1 Why Epoch-Keyed Entries Replace `DEL`-Based Invalidation

Deleting cache keys via `DEL` or `SCAN ... MATCH authz_ctx:*` has two classic distributed-systems hazards:
1. **Wildcard `SCAN`/`DEL` overhead**: Scanning Redis keyspaces on mutations is $O(N)$ and unacceptable on hot paths.
2. **Stale Writer Race (Read-Modify-Write Hazard)**:
   - Suppose **Request A** starts before a mutation, reads `authzVersion = 3` (or `orgShopsEpoch = 5`), misses the cache, and begins querying MySQL.
   - Concurrently, **Request B** commits a mutation (e.g., demoting the user from `manager` to `cashier`, or deactivating a shop) and executes `DEL` on the cache key.
   - **Request A** then finishes its slow MySQL read and writes the pre-mutation data back into Redis, poisoning the cache until TTL expiry!

#### How Epoch Keys Eliminate Stale Writer Races Completely:
- Every cached entry embeds its authoritative epoch in **both** the Redis key name and the JSON payload:
  1. **Actor Context Key**:
     ```
     authz_ctx:u:<userId>:v:<authzVersion>
     authz_ctx:e:<employeeUuidLower>:v:<authzVersion>
     ```
     - Controlled by `authz_version:user:<userId>` / `authz_version:employee:<employeeUuidLower>` (and `Users.authzVersion` / `Employees.authzVersion` in MySQL).
  2. **Owner Organization Shops Key**:
     ```
     authz_org_shops:org:<organizationId>:e:<orgShopsEpoch>
     ```
     - Controlled by an atomic Redis counter key:
       ```
       authz_org_shops_epoch:org:<organizationId>
       ```
       which is incremented via `INCR authz_org_shops_epoch:org:<organizationId>` (with TTL `86400`s and an in-memory monotonic floor `inMemoryOrgShopEpochs` in process memory) on every shop create, update, activate, deactivate, or delete.
- **Trace of a Stale Writer After a Mutation**:
  1. **Request A** begins at $t_1$, reads `currentVersion = 3` (or `orgShopsEpoch = 5`), misses `authz_ctx:u:42:v:3` (or `authz_org_shops:org:10:e:5`), and queries MySQL.
  2. **Mutation B** commits at $t_2$, bumping `authzVersion` to `4` (or `INCR`ing `authz_org_shops_epoch:org:10` to `6`).
  3. **Request A** finishes hydrating at $t_3$ ($t_3 > t_2$) and writes its result to the key for the epoch it observed at $t_1$: `authz_ctx:u:42:v:3` (or `authz_org_shops:org:10:e:5`).
  4. **Request C** arrives at $t_4$, reads the live pointer (`currentVersion = 4` or `orgShopsEpoch = 6`), and looks up `authz_ctx:u:42:v:4` (or `authz_org_shops:org:10:e:6`).
  5. Request A's stale write landed in a **dead key** (`:v:3` / `:e:5`) that is never read again and expires naturally via its `45`s TTL. **No wildcard `DEL` is ever issued.**

---

### 2.2 Redis Key Schemas

#### Key 1: Versioned Actor Authorization Context (`authz_ctx:{u|e}:<id>:v:<authzVersion>`)
- **TTL**: `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` (default **`45` seconds**; `0` disables caching).
- **JSON Schema (`schemaVersion: 1`)**:
  ```json
  {
    "schemaVersion": 1,
    "actorKind": "u",
    "authzVersion": 3,
    "identity": {
      "id": 42,
      "userId": 42,
      "employeeId": null,
      "isEmployee": false,
      "email": "manager@example.com",
      "name": "Alex Manager"
    },
    "role": {
      "rawRole": "manager",
      "effectiveRole": "manager"
    },
    "tenant": {
      "organizationId": 10,
      "organizationName": "Acme Retail",
      "membershipId": 77,
      "orgRole": "member",
      "membershipStatus": "active",
      "isOwner": false,
      "isOrgAdmin": false
    },
    "membership": {
      "id": 77,
      "organizationId": 10,
      "userId": 42,
      "employeeId": null,
      "orgRole": "member",
      "status": "active"
    },
    "scope": {
      "homeShopId": 5,
      "memberAccessibleShopIds": [5, 8]
    },
    "isSuperAdmin": false
  }
  ```
  *(For `orgRole === 'owner'`, `scope.memberAccessibleShopIds` is `null` and `accessibleShopIds` is resolved from `authz_org_shops:org:<organizationId>:e:<orgShopsEpoch>`. For `super_admin`, `tenant` and `membership` are `null`, `isSuperAdmin` is `true`, and `scope.homeShopId` is `null`.)*

#### Key 2: Organization Shops Epoch Counter (`authz_org_shops_epoch:org:<organizationId>`)
- **Value**: Integer string (`"1"`, `"2"`, ...), default `1` when key is `nil` in Redis (and tracked in `inMemoryOrgShopEpochs` `Map<number, number>` so epoch bumps remain monotonic even if Redis hiccups).
- **Mutation Operation**: `INCR authz_org_shops_epoch:org:<organizationId>` + `EXPIRE authz_org_shops_epoch:org:<organizationId> 86400`.

#### Key 3: Epoch-Versioned Owner Active Shops List (`authz_org_shops:org:<organizationId>:e:<epoch>`)
- **TTL**: `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` (default **`45` seconds**).
- **JSON Schema (`schemaVersion: 1`)**:
  ```json
  {
    "schemaVersion": 1,
    "organizationId": 10,
    "epoch": 2,
    "shopIds": [5, 8]
  }
  ```

---

## 3. Complete Invalidation Matrix & Sequelize Hooks (Instance + Bulk)

### 3.1 Rules Governing `authzVersion` Bumps & Epoch Increments

1. **Every mutation affecting an authorization-relevant cached field bumps `authzVersion` (or the org shops epoch)**:
   - **User or Employee `role` / `position` change** -> bumps `authzVersion`.
   - **`OrganizationMembership.orgRole` change** (`owner` / `admin` / `member` / `billing_admin`) -> bumps `authzVersion`.
   - **`OrganizationMembership.status` change** (`active` / `suspended` / `inactive` — suspend, deactivate, reactivate) -> bumps `authzVersion`.
   - **`User.shopId` or `Employee.shopId` change** (`homeShopId`) -> bumps `authzVersion`.
   - **`User.active` or `Employee.status` change** (deactivate / reactivate) -> bumps `authzVersion` AND updates `auth_status:{user|employee}:<id>`.
   - **`ShopAccess` grant / revoke / update / destroy** -> bumps `authzVersion` for the owning membership's actor.
   - **`Shop` create / update (`active`) / activate / deactivate / delete** -> increments `authz_org_shops_epoch:org:<organizationId>` (`INCR`).
2. **Cosmetic fields NEVER bump `authzVersion`**:
   - `Users.name`, `Users.email`, `Employees.firstName`, `Employees.lastName`, `Employees.email`, and `Organizations.name` are cosmetic display fields (verified in Section 1.4 not to participate in any authorization decision). Changes to these fields **must not** call `incrementAuthzVersion` and may remain stale up to `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` (`45`s).
3. **Creation hooks (`afterCreate` on `User`, `Employee`, `OrganizationMembership`, `ShopAccess`) MUST NOT bump `authzVersion`**:
   - A newly created user or employee has no pre-existing sessions or cached context.
   - Crucially, `POST /api/auth/register` ([`backend/src/controllers/authController.js:82-159`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/authController.js#L82-L159)) creates `User` (`authzVersion: 1` in memory) at line `82`, creates `OrganizationMembership` at line `92`, and then signs the registration JWT at line `159` using the in-memory `user.authzVersion || 1`. If `OrganizationMembership.afterCreate` bumped `authzVersion` in DB/Redis to `2`, the token returned by `register` would immediately fail with `401 AUTHZ_VERSION_STALE` on its very first request!
   - Likewise, `staffCreationService.createStaffMember` ([`backend/src/services/staffCreationService.js:256-285`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/staffCreationService.js#L256-L285)) creates `Employee`, `OrganizationMembership`, and `ShopAccess` for a brand-new staff member with `authzVersion: 1`.
   - When `ShopAccess.create` is called for an **existing** actor, the controller already bumps `authzVersion` explicitly: [`shopController.grantShopAccess` (`line 606`)](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L606), [`shopController.createShop` (`line 191`, for admin creators)](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L191), and [`employeeController.updateEmployee` (`line 475`, on `shopIdChanged`)](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/employeeController.js#L475).
   - Therefore, neither `OrganizationMembership.afterCreate` nor `ShopAccess.afterCreate` bumps `authzVersion` (only `Shop.afterCreate` bumps `authz_org_shops_epoch:org:<orgId>`, which does not touch `authzVersion`).

---

### 3.2 Master Invalidation Matrix (Citing Exact Files, Functions & Lines)

| # | Mutation Event | Exact File, Function & Line | Currently Bumps `authzVersion`? | Stage C2 Action (Controller/Service + Hook) | Next-Request Effect |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **User or Employee `role` / `orgRole` / `active` change via `updateRole`** | [`backend/src/controllers/userController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/userController.js#L159-L412) `exports.updateRole` (employee branch lines `301-304`, user branch lines `395-398`) | **YES** (`incrementAuthzVersion` on `roleChanged \|\| activeChanged \|\| orgRoleChanged`) | Keep explicit `incrementAuthzVersion` + `setUserStatus`; backed by `User`/`Employee`/`OrganizationMembership` update hooks | Old JWT rejected (`401 AUTHZ_VERSION_STALE`); new JWT uses `:v:<newVersion>` |
| **2** | **Employee `position` / `status` / `shopId` / `orgRole` change** | [`backend/src/controllers/employeeController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/employeeController.js#L328-L493) `exports.updateEmployee` (lines `473-476`: `authzChanged = positionChanged \|\| statusChanged \|\| shopIdChanged \|\| membershipOrgRoleChanged`) | **YES** (`incrementAuthzVersion` at `:475`) | Keep exact condition (`positionChanged \|\| statusChanged \|\| shopIdChanged \|\| membershipOrgRoleChanged`; cosmetic `firstName`/`lastName`/`email` edits do NOT bump); backed by `Employee.afterUpdate` hook | Next request sees `:v:<newVersion>` (`401 AUTHZ_VERSION_STALE` for old token) |
| **3** | **Employee deletion** | [`backend/src/controllers/employeeController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/employeeController.js#L496-L566) `exports.deleteEmployee` (lines `547-558`: `ShopAccess.destroy`, `membership.destroy`, `employee.destroy`, `incrementAuthzVersion`, `setUserStatus`) | **YES** (`incrementAuthzVersion` at `:555` + `setUserStatus('inactive')` at `:558`) | Keep explicit calls; backed by `ShopAccess.afterBulkDestroy`, `OrganizationMembership.afterDestroy`, `Employee.afterDestroy` | Next request rejected (`401 Account is deactivated or terminated`) |
| **4** | **Membership status change (`suspend` / `deactivate` / `reactivate`) or `orgRole` change** | 1) [`userController.js:286,376`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/userController.js#L286)<br>2) [`employeeController.js:459`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/employeeController.js#L459)<br>3) [`accountPurgeScheduler.js:132`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/accountPurgeScheduler.js#L132) (`OrganizationMembership.update({ status: 'suspended' }, { where: { organizationId } })`)<br>4) Direct `OrganizationMembership` instance/static updates | 1 & 2: **YES**<br>3 & 4: **NO** (today `accountPurgeScheduler.js:132` and direct `OrganizationMembership` updates do not bump `authzVersion`) | **ADD** `incrementAuthzVersion` in `accountPurgeScheduler.js` for all purged org memberships AND in `OrganizationMembership` `afterUpdate` / `afterDestroy` / `afterBulkUpdate` / `afterBulkDestroy` hooks whenever `status`, `orgRole`, or `organizationId` changes | Very next request sees bumped `authzVersion` -> `401 AUTHZ_VERSION_STALE` (or `403 MEMBERSHIP_SUSPENDED` on re-auth) |
| **5** | **`User.shopId` or `Employee.shopId` change** | [`employeeController.js:438-475`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/employeeController.js#L438) (`updateEmployee`) and any direct `User.update({ shopId })` / `Employee.update({ shopId })` | **YES** in `updateEmployee`; **NO** on direct `User`/`Employee` `.update({ shopId })` | **ADD** `User` and `Employee` `afterUpdate` / `afterBulkUpdate` hook check: if `shopId` changed and `authzVersion` was not already incremented in the same save, call `incrementAuthzVersion` | Very next request uses bumped `authzVersion` |
| **6** | **`ShopAccess` grant** | [`backend/src/controllers/shopController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L542-L620) `exports.grantShopAccess` (line `591`: `ShopAccess.update`, line `597`: `ShopAccess.create`, line `606`: `incrementAuthzVersion`) | **YES** (`incrementAuthzVersion` at `:606`) | Keep explicit `incrementAuthzVersion` at `:606` (and `createShop` `:191`, `updateEmployee` `:475`); `ShopAccess.afterUpdate`/`afterBulkUpdate` also covers updates | Very next request uses bumped `authzVersion` with new `accessibleShopIds` |
| **7** | **`ShopAccess` revoke** | [`backend/src/controllers/shopController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L626-L688) `exports.revokeShopAccess` (line `662`: `ShopAccess.destroy`, line `676`: `incrementAuthzVersion`) | **YES** (`incrementAuthzVersion` at `:676`) | Keep explicit `incrementAuthzVersion`; backed by `ShopAccess.afterDestroy` and `ShopAccess.afterBulkDestroy` hooks | Very next request uses bumped `authzVersion` without revoked shop |
| **8** | **Shop create** | [`backend/src/controllers/shopController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L42-L247) `exports.createShop` (line `171`: `Shop.create`; line `191`: `incrementAuthzVersion` for admin creator) | **YES** for `admin` creator (`:191`); **NO** for `owner` (owner keeps session valid) | **BUMP** `authz_org_shops_epoch:org:<orgId>` (`INCR`) in `createShop` after commit AND in `Shop.afterCreate` hook | Owner's very next request reads `authz_org_shops:org:<orgId>:e:<epoch+1>` and sees the new shop immediately without losing their JWT |
| **9** | **Shop update (`updateMine`)** | [`backend/src/controllers/shopController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L26-L36) `exports.updateMine` (line `34`: `shop.save()`) | **NO** | **BUMP** `authz_org_shops_epoch:org:<shop.organizationId>` in `updateMine` and `Shop.afterUpdate` / `afterBulkUpdate` when `active` changes | Owner's very next request reads `:e:<epoch+1>` |
| **10** | **Shop deactivate** | [`backend/src/controllers/shopController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L333-L390) `exports.deactivateShop` (line `368`: `shop.save()`) | **NO** | **BUMP** `authz_org_shops_epoch:org:<orgId>` in `deactivateShop` and `Shop.afterUpdate` / `afterBulkUpdate` | Owner's very next request reads `:e:<epoch+1>` (deactivated shop excluded) |
| **11** | **Shop activate** | [`backend/src/controllers/shopController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L396-L484) `exports.activateShop` (line `456`: `shop.save()`) | **NO** | **BUMP** `authz_org_shops_epoch:org:<orgId>` in `activateShop` and `Shop.afterUpdate` / `afterBulkUpdate` | Owner's very next request reads `:e:<epoch+1>` (activated shop included) |
| **12** | **Permission matrix edit / reset** | [`backend/src/controllers/settingsController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/settingsController.js#L317-L408) -> [`permissionCache.invalidateRoleCache`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/permissionCache.js#L101-L115) | **NO** (`permissions` is NOT stored in `authz_ctx`) | `permissionCache.invalidateRoleCache` deletes `permissions:org:<orgId>:role:<effectiveRole>`. Because `permissions` is resolved per request outside `authz_ctx`, no `authzVersion` bump is needed | Very next request loads updated permissions for that role |
| **13** | **Organization status transition (`active` / `past_due` / `suspended` / `deleted`)** | 1) [`billingService.js:261`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/billingService.js#L261) (`confirmInvoicePayment` -> `Organization.update({ status: 'active' })`)<br>2) [`billingService.js:337,387,422`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/billingService.js#L337) (`checkAndTransitionExpiredSubscriptions` -> `Organization.update({ status })`)<br>3) [`organizationController.js:354`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/organizationController.js#L354) (`closeOrganizationAccount` -> `org.save()`)<br>4) [`accountPurgeScheduler.js:76`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/accountPurgeScheduler.js#L76) (`org.update({ status: 'deleted' })`) | `organizationStatus` is checked **per request** via `tokenRevocationService.getOrgStatus(orgId)` | **ADD** `tokenRevocationService.setOrgStatus(orgId, status)` in `billingService.js` (`:261,337,387,422`), `organizationController.closeOrganizationAccount`, `accountPurgeScheduler.js`, AND in `Organization` `afterUpdate` / `afterBulkUpdate` hooks | Very next request sees live `orgStatus` (`403 ORGANIZATION_SUSPENDED` / `ORGANIZATION_DELETED`) |
| **14** | **Email verify / resend** | [`backend/src/controllers/authController.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/authController.js#L737-L815) `exports.verifyEmail` (`:759`), `exports.resendVerification` (`:775`) | **NO** (`emailVerifiedAt` is NOT stored in `authz_ctx`) | In `verifyEmail` (`:759`) and `User.afterUpdate` (when `emailVerifiedAt` becomes non-null), call `verifiedCache.set(user.id, true)` | Very next request to any `requireVerifiedEmail` or 7-day gate route passes immediately |
| **15** | **Password change / password reset** | [`authController.js:415`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/authController.js#L415) (`resetPassword` line `447`), [`authController.js:570`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/authController.js#L570) (`changePassword` line `609`) | Calls `revokeAllUserTokens(id, isEmployee)` | `revokeAllUserTokens` sets `revoked_tokens_cutoff:{user\|employee}:<id>` (checked on every request before `authzContext`) | Very next request with pre-change token rejected (`401 Token has been revoked due to password change`) |
| **16** | **Logout / Switch-shop** | [`authController.js:456`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/authController.js#L456) (`logout`), [`authController.js:621`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/authController.js#L621) (`switchShop`) | **NO** | `logout` sets `revoked_token:<jti>`; `switchShop` mints new JWT with new `shopId` (`activeShopId` computed per request from `decoded.shopId`) | Logged-out JTI rejected (`401`); switched-shop token uses new `shopId` on very next request |
| **17** | **`super_admin` role or `active` change** | Direct `User.update` / instance `.save()` | Handled by `User` hooks | `User` `afterUpdate` / `afterBulkUpdate` bumps `authzVersion` and updates `auth_status:user:<id>` | Very next request reflects new `super_admin` state or `401` |

---

### 3.3 Sequelize Lifecycle Hooks: Instance Hooks AND Bulk Hooks (`afterBulkUpdate` / `afterBulkDestroy`)

#### Why Instance Hooks Alone Are Insufficient
In Sequelize, `afterCreate`, `afterUpdate`, and `afterDestroy` only fire when mutating a model instance (`instance.save()`, `instance.update()`, `instance.destroy()`) or when `individualHooks: true` is explicitly passed to a static bulk call. Static calls without `individualHooks: true` trigger only `beforeBulkUpdate`/`afterBulkUpdate` and `beforeBulkDestroy`/`afterBulkDestroy`.

**Verified authz-relevant static calls in `backend/src/`**:
1. `ShopAccess.update({ isDefault: false }, { where: { membershipId }, transaction })` — [`backend/src/controllers/shopController.js:591`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L591)
2. `ShopAccess.destroy({ where: { shopId, membershipId }, transaction })` — [`backend/src/controllers/shopController.js:662`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/shopController.js#L662)
3. `ShopAccess.destroy({ where: { membershipId }, transaction })` — [`backend/src/controllers/employeeController.js:547`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/controllers/employeeController.js#L547)
4. `Organization.update({ status: ... }, { where: { id: organizationId }, transaction })` — [`backend/src/services/billingService.js:261, 337, 387, 422`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/billingService.js#L261)
5. `OrganizationMembership.update({ status: 'suspended' }, { where: { organizationId }, transaction, validate: false })` — [`backend/src/services/accountPurgeScheduler.js:132`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/services/accountPurgeScheduler.js#L132)

#### Hook Registration Matrix (Registered Centrally in `backend/src/models/index.js` via `authzContextCacheService.registerModelHooks(models)`)

All hooks schedule their Redis/epoch side effects via `options.transaction.afterCommit(...)` when a transaction is present (or execute immediately when `options.transaction` is null), and guard against recursion using `options._skipAuthzHook = true` when `incrementAuthzVersion` itself increments `authzVersion`:

| Model | Instance Hooks (`afterUpdate`, `afterDestroy`, plus `Shop.afterCreate`) | Bulk Hooks (`beforeBulkUpdate` + `afterBulkUpdate`, `beforeBulkDestroy` + `afterBulkDestroy`) | Coarse Invalidation / Epoch Action |
| :--- | :--- | :--- | :--- |
| **`User`** | On `afterUpdate` / `afterDestroy` (**never** `afterCreate`): if `role`, `active`, `shopId`, or `authzVersion` changed (**excluding** cosmetic `name`/`email`): sync `auth_status:user:<id>`, prime `verifiedCache` if `emailVerifiedAt` set, and if `authzVersion` was not the field explicitly incremented, call `incrementAuthzVersion(user.id, false)`. | In `beforeBulkUpdate`/`beforeBulkDestroy`: if `options.fields` (on update) touches `role`, `active`, `shopId`, or `authzVersion` (or on destroy), query matching `User.findAll({ where: options.where, attributes: ['id'] })`. In `afterBulkUpdate`/`afterBulkDestroy`, for each affected `id`, call `incrementAuthzVersion(id, false)` and clear/sync `auth_status:user:<id>`. | Bumps `authzVersion` and syncs `auth_status:user:<id>` for all matched users when authz fields change. |
| **`Employee`** | On `afterUpdate` / `afterDestroy` (**never** `afterCreate`): if `position`, `status`, `shopId`, or `authzVersion` changed (**excluding** cosmetic `firstName`/`lastName`/`email`): sync `auth_status:employee:<id>`, and if `authzVersion` was not already incremented, call `incrementAuthzVersion(emp.id, true)`. | In `beforeBulkUpdate`/`beforeBulkDestroy`: if `options.fields` touches `position`, `status`, `shopId`, or `authzVersion` (or on destroy), resolve matching `Employee.id`s from `options.where`. In `afterBulkUpdate`/`afterBulkDestroy`, for each affected `id`, call `incrementAuthzVersion(id, true)` and clear/sync `auth_status:employee:<id>`. | Bumps `authzVersion` and syncs `auth_status:employee:<id>` for all matched employees when authz fields change. |
| **`OrganizationMembership`** | On `afterUpdate` / `afterDestroy` (**never** `afterCreate`, so `register` and `createStaffMember` do not invalidate freshly minted tokens): if `orgRole`, `status`, or `organizationId` changed (or on destroy), call `incrementAuthzVersion(actorId, isEmployee)`. | In `beforeBulkUpdate`/`beforeBulkDestroy`, query matching `OrganizationMembership.findAll({ where: options.where, attributes: ['userId', 'employeeId'] })`. In `afterBulkUpdate`/`afterBulkDestroy`, bump `authzVersion` for every matched `(userId, employeeId)`. | Bumps `authzVersion` for every member affected by update/destroy or bulk update/destroy (including `accountPurgeScheduler.js:132`). |
| **`ShopAccess`** | On `afterUpdate` / `afterDestroy` (**never** `afterCreate`; `grantShopAccess`, `createShop`, and `updateEmployee` already bump explicitly when granting access to an existing actor): look up `OrganizationMembership` by `access.membershipId` and call `incrementAuthzVersion(actorId, isEmployee)`. | In `beforeBulkUpdate`/`beforeBulkDestroy`, resolve affected `membershipId`s from `options.where` (e.g., `shopController.js:591,662`, `employeeController.js:547`), look up their `OrganizationMembership`s, and in `afterBulkUpdate`/`afterBulkDestroy` bump `authzVersion` for each actor. | Bumps `authzVersion` for every actor whose `ShopAccess` rows were updated, destroyed, bulk-updated, or bulk-destroyed. |
| **`Shop`** | On `afterCreate`, `afterUpdate` (when `active` or `organizationId` changes), and `afterDestroy`: call `bumpOrgShopsEpoch(shop.organizationId)`. | In `beforeBulkUpdate`/`beforeBulkDestroy`, resolve affected `organizationId`s from `options.where` (or `Shop.findAll({ where: options.where, attributes: ['organizationId'] })`). In `afterBulkUpdate`/`afterBulkDestroy`, call `bumpOrgShopsEpoch(orgId)` for each affected org. | `INCR`s `authz_org_shops_epoch:org:<orgId>` so owners read `:e:<epoch+1>` on the very next request without invalidating the owner's JWT. |
| **`Organization`** | On `afterUpdate` (when `status` or `deletedAt` changes; cosmetic `name` changes do NOT bump `authzVersion`) and `afterDestroy`: call `setOrgStatus(org.id, org.deletedAt ? 'deleted' : org.status)` and `bumpOrgShopsEpoch(org.id)`. | In `beforeBulkUpdate`/`beforeBulkDestroy`, resolve affected `Organization.id`s from `options.where` (covering `billingService.js:261,337,387,422`). In `afterBulkUpdate`/`afterBulkDestroy`, clear/update `auth_status:org:<id>` and `bumpOrgShopsEpoch(id)`. | Immediately updates/invalidates `auth_status:org:<id>` and bumps `authz_org_shops_epoch:org:<id>`. |

> **Explicit Scope Boundary (Mutations That Bypass Sequelize Hooks)**:
> - Raw SQL queries (`sequelize.query(...)`), database migrations (`sequelize-cli db:migrate`), direct manual SQL edits via `mysql` CLI / database admin tools, and the Python `ai_service` bypass Sequelize model hooks.
> - Any changes made through those external channels are bounded by `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` (default `45` seconds). See **Section 8.4 (Operational Runbook Note)** for the exact operator command to force immediate invalidation after manual DB edits.

---

## 4. Per-Request Sharing (Stage C1) & Batched `MGET` Semantics (Stage C3)

### 4.1 Stage C1: Request-Scoped Sharing (`WeakMap` Keyed by `req`)

Even before adding Redis caching (Stage C2) or `MGET` batching (Stage C3), three redundant operations happen within a single request across `emailVerification7DayGate`, `auth.js`, and `authzContext.js`:
1. **Duplicate JWT Verification**: `emailVerification7DayGate` (`requireVerifiedEmail.js:191`) and `auth.js` (`auth.js:16`) both run `jwt.verify(token, publicKey, { algorithms: ['RS256'] })`.
2. **Duplicate `User`/`Employee` Hydration on Cold Requests**: On a cold request, `emailVerification7DayGate` (`requireVerifiedEmail.js:216`), `tokenRevocationService.getUserStatus` (`:192,195`), `tokenRevocationService.getAuthzVersion` (`:298,303`), and `authzContext.js` (`:65,149,178`) can each issue a separate `User.findByPk(id)` or `Employee.findByPk(id)` query (3–4 reads of the exact same row).
3. **Duplicate `getOrgStatus` Call on Warm Requests**: `auth.js:79` calls `tokenRevocationService.getOrgStatus(req.organizationId)` and `authzContext.js:272` calls `tokenRevocationService.getOrgStatus(organization.id)` again for the same organization ID.

#### Stage C1 Design (`backend/src/utils/requestAuthState.js`):
A module-private `WeakMap` keyed by the Express `req` object (`const requestState = new WeakMap()`):
- **Never attaches a client-settable property to `req`** (preserving the Stage A2 security invariant).
- Stores per-request state:
  - `verifiedToken`: `{ rawToken, decoded }` — verified once by whichever middleware runs first (`emailVerification7DayGate` or `auth.js`) and reused if the `Authorization` header matches `rawToken`.
  - `userPromise` / `employeePromise`: A single shared promise per request for `User.findByPk(userId, { attributes: ['id', 'name', 'email', 'role', 'active', 'shopId', 'authzVersion', 'emailVerifiedAt', 'createdAt'] })` or `Employee.findByPk(employeeId, { attributes: ['id', 'firstName', 'lastName', 'email', 'position', 'status', 'shopId', 'authzVersion'] })` (selecting **only non-secret columns**, never `password`, `emailVerificationTokenHash`, or reset tokens) so cold requests read `Users` or `Employees` **at most once** across `emailVerification7DayGate`, `requireVerifiedEmail`, `getUserStatus`, `getAuthzVersion`, and `authzContext`.
  - `orgStatusPromises`: `Map<number, Promise<string>>` — when `auth.js:79` resolves `getOrgStatus(orgId, req)`, it records the promise/result in `orgStatusPromises.set(Number(orgId), promise)`. When `authzContext.js:272` checks `getOrgStatus(organization.id, req)` for the same `organization.id`, it reuses the already-resolved status without issuing a second Redis `GET auth_status:org:<orgId>` command!

---

### 4.2 Stage C3: Mockable `redisGetMany` Helper & `MGET` Miss/Error Semantics

#### 1. No Test Detection (`_isMockFunction`) in Production Code
Production code must **never** inspect `redisClient.get._isMockFunction` or branch on whether Jest is running. Instead:
- Add a small, dedicated, mockable helper in [`backend/src/utils/redisGetMany.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/utils/redisGetMany.js) (or method on `tokenRevocationService`):
  ```js
  async function redisGetMany(keys) {
    if (!Array.isArray(keys) || keys.length === 0) return [];
    if (!redisClient || redisClient.status !== 'ready') {
      return keys.map(() => null);
    }
    return redisClient.mget(keys);
  }
  ```
- In `ioredis` (used in [`backend/src/config/redis.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/config/redis.js)), `redisClient.mget(keys)` is a native command that sends a single `MGET k1 k2 ...` command and returns an array of `(string | null)` in positional order.

#### 2. Exact Existing Tests That Must Change in Stage C3
A full repository search (`git grep -n "redisClient" backend/tests/`) confirms that across all 85 test suites, **only one existing test** mocks `redisClient.get`:
- **[`backend/tests/phase6bAuthSessionSecurity.test.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/tests/phase6bAuthSessionSecurity.test.js#L396-L427)** (`Test 9: Revocation failure behavior (in-memory fallback enforces revocation if Redis errors)`, lines `405–426`):
  - Currently mocks `redisClient.get = jest.fn().mockRejectedValue(new Error('Redis connection timeout'))`.
  - In Stage C3, update lines `405–426` of `backend/tests/phase6bAuthSessionSecurity.test.js` to mock both `redisClient.get` and `redisClient.mget` (`redisClient.mget = jest.fn().mockRejectedValue(new Error('Redis connection timeout'))` and restore both in `finally`), verifying that when `MGET` throws a Redis error, the middleware still enforces in-memory token revocation and rejects the request with `401`.
- *(No other existing test mocks `redisClient.get`: `gate2bAuthzEpochMutations.test.js:647` and `gate2cAuthorizationPrimitive.test.js:760` mock `redisClient.setex`, which is unaffected by `MGET`.)*

#### 3. Exact `MGET` Miss (`nil`) and Error Semantics
When the pre-handler pipeline calls `redisGetMany(keys)` for a request with decoded JWT `{ id, isEmployee, jti, iat, organizationId, role, orgRole, authzVersion }`:

| Key in `MGET` Batch | Value Present (Hit) | Value is `null` (`nil` / Miss) | Redis `MGET` Throws Error |
| :--- | :--- | :--- | :--- |
| `revoked_token:<jti>` | `'revoked'` or `'used'` -> **`401 Token has been revoked`** | Token JTI is not revoked (`false`). | Log warning; treat JTI check as `false` (same as `isTokenRevoked` today at `tokenRevocationService.js:45-48`), then continue to cutoff & status checks. |
| `revoked_tokens_cutoff:{user\|employee}:<id>` | Parse `Number(val)`; if `Number(iat) <= cutoff` -> **`401 Token has been revoked due to password change`** | Check `inMemoryCutoffs.get(key)` (`tokenRevocationService.js:93-95`). If present and `iat <= cutoff` -> **`401`**. Otherwise `false`. | Log warning; check `inMemoryCutoffs.get(key)`. If `iat <= cutoff` -> **`401`** (proven by `phase6bAuthSessionSecurity.test.js` Test 9). |
| `auth_status:{user\|employee}:<id>` | `'inactive'` -> **`401 Account is deactivated or terminated`**; `'active'` -> pass | **Exact same DB fallback as single-`GET` miss (`tokenRevocationService.js:189-210`)**: query `User.findByPk` / `Employee.findByPk` (sharing request-scoped entity promise), cache status in Redis via `setex`, and if DB query fails or user is inactive -> **fail closed (`'inactive'` -> `401`)**. | Log warning and execute the **exact same DB fallback** (`tokenRevocationService.getUserStatus`); if DB also fails -> **fail closed (`401`)**. |
| `auth_status:org:<orgId>` | `'deleted'` -> **`403 ORGANIZATION_DELETED`**; `'suspended'`/`'canceled'` (for non-owner) -> **`403 ORGANIZATION_SUSPENDED`**; `'active'`/`'trialing'` -> pass | **Exact same DB fallback as single-`GET` miss (`tokenRevocationService.js:246-266`)**: call `entitlementService.getOrganizationEntitlements(orgId)` / `Organization.findByPk(orgId)`, cache in Redis via `setex`, and enforce status. | Log warning and execute the **exact same DB fallback** (`tokenRevocationService.getOrgStatus`). |
| `authz_version:{user\|employee}:<id>` | Parse `Number(val)` (and take `Math.max` with `inMemoryAuthzVersions` if present). If `sessionVersion < currentVersion` -> **`401 AUTHZ_VERSION_STALE`** | **Exact same fallback as single-`GET` miss (`tokenRevocationService.js:290-321`)**: check `inMemoryAuthzVersions.get(key)`; if absent, query `User.findByPk` / `Employee.findByPk` (shared on request scope), store in `inMemoryAuthzVersions` + Redis `setex`, and if `sessionVersion < currentVersion` -> **`401 AUTHZ_VERSION_STALE`**. | Log warning, check `inMemoryAuthzVersions`, and if absent query DB (`tokenRevocationService.getAuthzVersion`); if DB throws -> **fail closed (`500 AUTHORIZATION_CONTEXT_ERROR`)**. |
| `authz_ctx:{u\|e}:<id>:v:<sessionVersion>` | Validate schema & `authzVersion === currentVersion`. If valid -> **warm cache hit (0 SQL)** | Cache miss -> run full Sequelize DB hydration (`User`/`Employee`, `OrganizationMembership`, `Organization`, `Shop`/`ShopAccess`) and write `authz_ctx` with TTL `45`s. | Cache miss -> run full Sequelize DB hydration. |
| `authz_org_shops_epoch:org:<orgId>` | Parse `epoch = Math.max(Number(val), inMemoryOrgShopEpochs.get(orgId) \|\| 1)`, then use `authz_org_shops:org:<orgId>:e:<epoch>` | Use `epoch = inMemoryOrgShopEpochs.get(orgId) \|\| 1`. If `authz_org_shops:org:<orgId>:e:1` is also `nil`, query `Shop.findAll({ where: { organizationId, active: true }, attributes: ['id'] })` and cache under `:e:1`. | Query `Shop.findAll` directly from MySQL. |
| `permissions:org:<orgId>:role:<effectiveRole>` | Parse JSON `string[]` | Call `permissionCache.getRolePermissions(effectiveRole, orgId)` (which seeds/queries DB and caches in Redis). | Call `permissionCache.getRolePermissions(effectiveRole, orgId)` (which falls back to DB / `ROLE_PERMISSIONS`). |

---

## 5. Failure Modes & Fail-Closed Guarantees

| Failure Mode | Detection | Fallback Behavior | Security / Authorization Impact |
| :--- | :--- | :--- | :--- |
| **Redis Down / Connection Timeout / Command Error** | `redisGetMany` / `mget` / `get` / `setex` throws or rejects | Log warning, consult `inMemoryCutoffs` and `inMemoryAuthzVersions`, and execute the full Sequelize DB hydration path (`User`/`Employee`, `OrganizationMembership`, `Organization`, `Shop`/`ShopAccess`). | **Fail-closed** on all auth/authz rules: revoked tokens in `inMemoryCutoffs`, inactive users in DB, suspended orgs in DB, non-members, or stale `authzVersion` in DB are rejected with `401`/`403`; DB errors return `401`/`500`, **never** "allow". |
| **Corrupt JSON or Schema Mismatch in Redis** | `JSON.parse` throws, or `parsed.schemaVersion !== 1`, or missing required objects (`identity`, `role`, `scope`), or `String(parsed.identity.id) !== String(entityId)` | Ignore corrupt cache payload and fall back to full Sequelize DB hydration, overwriting the key with a clean payload. | **Zero trust in corrupt cache**; full DB checks enforced. |
| **`authzVersion` Stale** | `sessionVersion < currentVersion` (from `authz_version:{user\|employee}:<id>`, `inMemoryAuthzVersions`, or DB `entity.authzVersion`), OR `cachedCtx.authzVersion !== currentVersion` | Return `401 { error: 'Authorization epoch stale. Session has been invalidated.', code: 'AUTHZ_VERSION_STALE' }`. | **Immediate session invalidation** on role, membership, or shop-access mutation. |
| **Stale Writer Race (Slow Request Finishes After Mutation)** | Request hydrated under old `authzVersion = v` or old `orgShopsEpoch = e` finishes after mutation bumped to `v+1` or `e+1` | Writes to `authz_ctx:{u\|e}:<id>:v:<v>` or `authz_org_shops:org:<id>:e:<e>`. Live readers read `:v:<v+1>` or `:e:<e+1>`. | Stale write lands in a **dead key** that is never read again and expires via TTL. |
| **Sensitive Data Exposure in Redis** | Inspection of Redis keys | `authz_ctx` and `authz_org_shops` store **zero** password hashes, PIN hashes, refresh tokens, reset tokens, or raw JWTs. | Redis dump discloses no credentials or session secrets. |

---

## 6. Kill Switch, Configuration & Rollout Plan

### 6.1 Environment Variable Kill Switch
- **Variable**: `AUTHZ_CONTEXT_CACHE_TTL_SECONDS`
- **Parsing Rules** (in `authzContextCacheService.js`):
  - If unset or empty: defaults to **`45`** (`45` seconds, middle of the `30–60s` window).
  - If set to **`0`** (or `<= 0`, `'false'`, `'off'`): **kill switch engaged** — caching of `authz_ctx` and `authz_org_shops` is completely bypassed, and `authzContext` executes the direct DB resolution path on every request.
  - If set to a positive integer `N`: uses `N` seconds as the Redis `EX` TTL (clamped to a maximum of `300` seconds).
- **Read Dynamically**: `getCacheTtlSeconds()` reads `process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS` dynamically per request so tests and operators can toggle `process.env.AUTHZ_CONTEXT_CACHE_TTL_SECONDS = '0'` at runtime.

---

## 7. Stage C 3-PR Split, Expected Counts & Golden Parity Test Plan

### 7.1 Stage C Implementation Split (Three Sequential PRs)

Stage C will be implemented across **three separate branches and PRs**, one at a time, stopping for review and merge approval after each PR:

| Stage PR | Branch Name | Scope |
| :--- | :--- | :--- |
| **Stage C1** | `perf/authz-c1` | **Request-scoped sharing only**: `WeakMap` keyed by `req` so JWT is verified once across `emailVerification7DayGate` and `auth.js`, cold requests share a single `User.findByPk` / `Employee.findByPk` read (selecting only non-secret columns), and the duplicate `tokenRevocationService.getOrgStatus` call between `auth.js` and `authzContext.js` is eliminated. **No context caching, no hooks, no invalidation changes, no `MGET`.** |
| **Stage C2** | `perf/authz-c2` | **Versioned context cache + epochs + hooks + kill switch**: `authz_ctx:{u\|e}:<id>:v:<authzVersion>` and `authz_org_shops:org:<id>:e:<epoch>` (with `INCR` on `authz_org_shops_epoch:org:<id>`), `authzVersion` bumps on all authz-relevant cached-field mutations (excluding cosmetic `name`/`email`/`organizationName` and creation hooks), instance + `afterBulkUpdate`/`afterBulkDestroy` hooks on `User`, `Employee`, `OrganizationMembership`, `ShopAccess`, `Shop`, and `Organization`, `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` kill switch, golden parity tests, and CI dual-mode test execution (`TTL=0` and default `45`s). |
| **Stage C3** | `perf/authz-c3` | **Redis `MGET` batching**: Batch pre-handler Redis reads via the mockable `redisGetMany` helper so warm pre-handler Redis commands drop to `<= 3` (`2` on `/api/auth/profile`, `3` on `/api/sales/statistics`), plus update `phase6bAuthSessionSecurity.test.js` Test 9. |

---

### 7.2 Expected SQL & Redis Command Counts Across Stages C1, C2, and C3

| Workload | `BASELINE` | `AFTER-A2` (Current `master`) | **After C1 (Sharing Only)** | **After C2 (Cache + Epochs)** | **After C3 (`MGET` Batching)** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`GET /api/auth/profile` — Warm Pre-handler SQL** | `4` | `4` | `4` (Cold `Users` reads cut `3 -> 1`) | **`0` SQL** | **`0` SQL** |
| **`GET /api/auth/profile` — Warm Total SQL** | `6` | `6` | `6` | **`2` SQL** (`0` pre + `2` handler) | **`2` SQL** (`0` pre + `2` handler) |
| **`GET /api/auth/profile` — Warm Redis Commands** | `7` | `7` | **`6` Redis** (`-1` duplicate `getOrgStatus`) | **`7` Redis** (`6` + `authz_ctx` + `org_shops`) | **`2` Redis** (`1 EVAL` + `1 MGET`) |
| **`GET /api/sales/statistics` — Warm Pre-handler SQL** | `8` | `4` | `4` (Cold `Users` reads cut `3 -> 1`) | **`0` SQL** | **`0` SQL** |
| **`GET /api/sales/statistics` — Warm Total SQL** | `12` | `8` | `8` | **`4` SQL** (`0` pre + `4` handler) | **`4` SQL** (`0` pre + `4` handler) |
| **`GET /api/sales/statistics` — Warm Redis Commands** | `10` | `8` | **`7` Redis** (`-1` duplicate `getOrgStatus`) | **`8` Redis** | **`3` Redis** (`1 EVAL` + `1 MGET` + `1 GET entitlements`) |
| **11-Request Dashboard Burst — Warm Pre-handler SQL** | `88` | `44` | `44` | **`0` SQL** | **`0` SQL** |
| **11-Request Dashboard Burst — Warm Total SQL** | `109` | `65` | `65` | **`21` SQL** (`-80.7%` vs `BASELINE`) | **`21` SQL** (`-80.7%` vs `BASELINE`) |

---

### 7.3 Golden Parity Test Plan, Registration/Staff-Creation Regression & Dual-Mode CI Execution

1. **Registration & Staff-Creation First-Use Regression Tests (Run in Every Stage C PR: C1, C2, and C3)**:
   - **Self-Registration Token Immediate Use**: Call `POST /api/auth/register` to create a new organization, shop, owner `User`, and `OrganizationMembership`, extract `res.body.token` from the `201` register response, and immediately call `GET /api/auth/profile` (`-> 200`) and `GET /api/sales/statistics` (`-> 200`) using that token. (Guards against creation hooks or cold sharing corrupting `authzVersion` on `register`.)
   - **Staff Creation + First Login Immediate Use**: As the owner, create a staff member (`POST /api/employees` or `POST /api/users`), log in as that staff member (`POST /api/auth/login` `-> 200`), and immediately use the returned token on `GET /api/auth/profile` (`-> 200`) and `GET /api/sales/statistics` (`-> 200`).

2. **Golden Parity Test Suite (`backend/tests/authzContextCacheParity.test.js` in Stage C2)**:
   - Exercises **4 canonical fixtures** through the real `auth` + `authzContext` middleware chain on a test endpoint that serializes all observable properties and helper evaluations of `req.authz`, `req.user`, `req.shopId`, `req.organizationId`, and `req.membership`:
     1. **`owner`** (`User` with `orgRole: 'owner'`, multiple active shops in org)
     2. **`non-owner`** (`User` with `role: 'manager'`, `orgRole: 'member'`, explicit `ShopAccess` grants)
     3. **`employee`** (`Employee` UUID with `position: 'cashier'`, `orgRole: 'member'`, `ShopAccess` grant)
     4. **`super_admin`** (`User` with `role: 'super_admin'`, `tenant: null`)
   - For each fixture, executes:
     - Request 1 with `AUTHZ_CONTEXT_CACHE_TTL_SECONDS=0` (uncached DB hydration)
     - Request 2 with `AUTHZ_CONTEXT_CACHE_TTL_SECONDS=45` (cold cache miss + cache write)
     - Request 3 with `AUTHZ_CONTEXT_CACHE_TTL_SECONDS=45` (warm cache hit, asserting **`0` pre-handler SQL queries** via Sequelize `afterQuery` hook)
   - Asserts **strict deep equality (`expect(warmSnapshot).toEqual(uncachedSnapshot)`)** across:
     - `req.authz.identity` (`{ id, userId, employeeId, isEmployee, email, name }`)
     - `req.authz.session` (`{ authzVersion, iat, exp, jti }`)
     - `req.authz.tenant` (`{ organizationId, organizationName, organizationStatus, membershipId, orgRole, membershipStatus, isOwner, isOrgAdmin }`)
     - `req.authz.role` (`{ rawRole, effectiveRole }`)
     - `req.authz.scope` (`activeShopId`, `homeShopId`, `accessibleShopIds`, plus `hasShopAccess(shopA1.id)`, `hasShopAccess(shopA2.id)`, `hasShopAccess(otherOrgShop.id)`, `hasShopAccess(null)`)
     - `req.authz.permissions` (`Array.from(granted).sort()`, plus `has('create_sales')`, `has('manage_settings')`, `hasAny(...)`, `hasAll(...)`)
     - `req.authz.ownership` (`isOwnerOf(selfId)`, `isOwnerOf(otherId)`, `canManage(selfId)`, `canManage(otherId, 'manage_sales')`)
     - `Object.isFrozen(req.authz)`, `Object.isFrozen(req.authz.identity)`, `Object.isFrozen(req.authz.role)`, `Object.isFrozen(req.authz.scope)`, `Object.isFrozen(req.authz.permissions)`, `Object.isFrozen(req.authz.ownership)`
     - `req.user` (`{ id, email, name, role, orgRole, shopId, organizationId, isEmployee, authzVersion, jti, iat, exp }`)
     - `req.shopId`, `req.organizationId`, and `req.membership` (`{ id, organizationId, userId, employeeId, orgRole, status }` for tenant actors; `undefined` for `super_admin`).

3. **CI Dual-Mode Full Suite Verification (`.github/workflows/backend-ci.yml` in Stage C2)**:
   - The Backend CI workflow will run the full backend Jest suite **twice**:
     1. Default mode (`AUTHZ_CONTEXT_CACHE_TTL_SECONDS` unset -> `45`s TTL, exercising the versioned cache, epochs, and hooks across all 85+ suites).
     2. Kill-switch mode (`AUTHZ_CONTEXT_CACHE_TTL_SECONDS=0`, proving 100% of suites pass when the cache is disabled).

---

## 8. Security Review & Operational Runbook Notes

1. **Strict Key Namespacing by Validated ID Kind (`u:<int>` vs `e:<uuid>`)**:
   - Cache key construction uses [`backend/src/utils/idKind.js`](file:///C:/Users/WARREN%20CHRIS/.gemini/antigravity/scratch/zena-pos/backend/src/utils/idKind.js) (`isIntegerId` and `isUuid`):
     - If `!isEmployee`: `entityId` **must** pass `isIntegerId(entityId)`, producing `authz_ctx:u:${Number(entityId)}:v:${version}`.
     - If `isEmployee`: `entityId` **must** pass `isUuid(entityId)`, producing `authz_ctx:e:${String(entityId).trim().toLowerCase()}:v:${version}`.
     - Any mismatch (`isEmployee=false` with UUID, `isEmployee=true` with integer, or invalid characters) refuses cache access and fails closed (`401`).
2. **Zero Cache Key Influence from Untrusted Request Input**:
   - Cache keys are derived **exclusively** from the RS256-verified JWT payload (`decoded.id`, `decoded.isEmployee`, `decoded.authzVersion`) and DB-verified `organizationId` + Redis epoch.
   - Query params (`?shopId=...`), headers (`x-shop-id`, `x-organization-id`), and request bodies have **zero** influence on cache keys or cached contents.
3. **Cross-User & Cross-Tenant Isolation**:
   - Upon reading `authz_ctx` from Redis, `authzContext` asserts `String(cached.identity.id) === String(entityId)`, `Boolean(cached.identity.isEmployee) === Boolean(isEmployee)`, and `Number(cached.authzVersion) === Number(currentVersion)`.
   - Fresh clones of arrays (`[...accessibleShopIds]`) and frozen objects (`Object.freeze(...)`) are constructed per request so downstream handlers cannot mutate cached state.
4. **Operational Runbook Note (Manual DB Edits)**:
   > **OPS NOTE — Manual Database Edits**:
   > Direct SQL edits via the `mysql` CLI, GUI clients, or external scripts do not trigger Sequelize model hooks. After performing any manual DB edit to `Users` (`role`, `active`, `shopId`), `Employees` (`position`, `status`, `shopId`), `OrganizationMemberships` (`orgRole`, `status`), `ShopAccess`, `Shops` (`active`), or `Organizations` (`status`), operators **must** either:
   > 1. Increment `authzVersion` in SQL on the affected rows:
   >    ```sql
   >    UPDATE Users SET authzVersion = authzVersion + 1 WHERE id = <userId>;
   >    UPDATE Employees SET authzVersion = authzVersion + 1 WHERE id = '<employeeUuid>';
   >    ```
   >    and flush or bump the corresponding Redis keys:
   >    ```bash
   >    redis-cli DEL authz_version:user:<userId> auth_status:user:<userId>
   >    redis-cli INCR authz_org_shops_epoch:org:<orgId>
   >    ```
   > 2. Or flush all `authz_*` keys in Redis:
   >    ```bash
   >    redis-cli --scan --pattern "authz_*" | xargs -r redis-cli DEL
   >    ```
   > Without this step, manual SQL changes to cached fields may remain cached for up to `AUTHZ_CONTEXT_CACHE_TTL_SECONDS` (default `45` seconds).
