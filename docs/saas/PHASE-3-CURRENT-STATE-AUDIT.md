# Zana POS — Phase 3 Current-State Audit: User Creation, Tenant Membership & Quota Integrity

**Date:** September 17, 2026  
**Repository:** `https://github.com/Warrenchris/zena-pos.git`  
**Audit Type:** Phase 3 Current-State Reconnaissance & Pre-Remediation Verification  
**Author:** Senior Backend & Security Engineering Agent  
**Status:** Audit Complete — No Application Code Modified. Awaiting User Approval (Audit Gate).

---

## 1. Executive Summary & Verification Matrix

In accordance with Phase 3 non-negotiable operating rules, every user, staff, and tenant creation flow was independently traced across controllers, routes, models, frontend clients, and database schemas.

| Finding ID | Area | Classification | Severity | Current Code Location | Root Cause Summary | Required Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ISO-01** | Tenancy / Quotas | **CONFIRMED** | **CRITICAL** | `userController.js:9-17`, `routes/users.js:11-20`, `employeeController.js:308-313` | `POST /api/users` performs zero quota checks, leaves `organizationId` unset, creates no `OrganizationMembership`. In addition, `employeeController.createEmployee` enforces quota but omits creating `OrganizationMembership` for new employees. | Establish one canonical staff creation path. Wire strict `maxUsers` quota, atomic transaction, `OrganizationMembership`, and tenant-safe branch validation. Convert `/api/users` into a protected compatibility alias. |
| **AUT-01** | Auth / Identity | **CONFIRMED** | **MINOR** | `routes/auth.js:32-36`, `authController.js:60, 68` | `/register` accepts client-supplied `role: cashier` or `role: manager` while creating `orgRole: owner`. Because administrative routes enforce `checkRole(['admin'])`, the owner is locked out of admin functions. | Disallow non-admin client roles in self-registration. Server must authoritatively assign `role: 'admin'` and `orgRole: 'owner'`. |
| **NEW-01** | Membership Integrity | **NEW DISCOVERY** | **HIGH** | `employeeController.js:308-313`, `OrganizationMembership.js:47-55` | Staff created via `POST /api/employees` are inserted only into `Employees`; no `OrganizationMembership` record is ever inserted. This forced controllers to use ad-hoc "unlinked active employee" counts. | Insert `OrganizationMembership` (`employeeId: employee.id, orgRole: 'member', status: 'active'`) and `ShopAccess` atomically with employee creation. |
| **NEW-02** | Concurrency Safety | **NEW DISCOVERY** | **HIGH** | `employeeController.js:250-297` | Quota check executes `COUNT` before `INSERT` without a database row lock. Two concurrent administrator requests at `limit - 1` can race and exceed `maxUsers`. | Acquire an exclusive row lock on the tenant (`Organization.findByPk(orgId, { transaction: t, lock: t.LOCK.UPDATE })`) inside the creation transaction. |
| **NEW-03** | Branch Isolation & Cross-Tenant Assignment | **NEW DISCOVERY** | **MODERATE** | `routes/employees.js:30`, `middleware/auth.js:76-78`, `employeeController.js:310` | `ensureShopIsolation` forcefully overrides any `req.body.shopId` with `req.user.shopId`. Legitimate multi-branch managers cannot specify branch, while invalid/foreign shop IDs are silently rewritten rather than rejected. | Validate target `shopId` against the authenticated organization (`where: { id: targetShopId, organizationId: orgId, active: true }`). Explicitly reject cross-tenant shop IDs with `403 Forbidden`. |
| **NEW-04** | Employee Profile `orgRole` Missing | **NEW DISCOVERY** | **MODERATE** | `authController.js:196-205, 301` | `authController.login` and `getProfile` only look up `OrganizationMembership` if `!isEmployee`. For employee accounts, `orgRole` is hardcoded to `null`. | When `isEmployee === true`, resolve `OrganizationMembership` by `employeeId` and return the employee's `orgRole`. |
| **NEW-05** | Dead / Broken Frontend Link | **NEW DISCOVERY** | **MINOR** | `ModernSidebar.jsx:106`, `router.config.jsx:194-200` | Sidebar links "User Access" to `/admin/users`, but `/admin/users` does not exist in `router.config.jsx`. `Users.jsx` is completely orphaned. | Map `/admin/users` in `router.config.jsx` to render `<Employees />` and remove or retire orphaned `Users.jsx`. |

---

## 2. Authentication & Session Architecture

### How Users Authenticate
Authentication occurs via `POST /api/auth/login` (`authController.login`):
1. **Identifier Resolution**:
   - Checks `User.findOne({ where: { email }, include: [Shop] })`.
   - If not found in `Users`, checks `Employee.findOne({ where: { email }, include: [Shop] })`.
2. **Credential Validation**:
   - Uses `bcrypt.compare(password, account.password)`.
   - Checks active status (`user.active === true` or `employee.status === 'active'`).
3. **Token Issuance**:
   - Signs an RS256 JWT using private key (`process.env.JWT_PRIVATE_KEY` / `jwt_private_key.pem`).

### JWT Payload & Session Token Claims
```json
{
  "id": "number (User) or UUID string (Employee)",
  "role": "admin | manager | cashier | employee",
  "shopId": 1,
  "organizationId": 1,
  "isEmployee": false,
  "iat": 1789630000,
  "exp": 1789637200
}
```

### Context Resolution
- **`organizationId` Resolution**:
  - In `middleware/auth.js`:
    1. Reads `decoded.organizationId`.
    2. Fallback: If `decoded.shopId` exists, queries `Shop.findByPk(decoded.shopId, { attributes: ['organizationId'] })`.
    3. Populates `req.organizationId`.
- **`shopId` Resolution**:
  - Read from `decoded.shopId`.
  - Routes requiring branch context (`/api/sales`, `/api/products`, `/api/customers`, `/api/employees`, `/api/purchases`) reject with `403` if `!req.shopId`.
- **Membership Loading & Authority**:
  - In `authController.login`, only users (`!isEmployee`) query `OrganizationMembership`. Employees are returned with `orgRole: null`.
  - In `requireOrgAdmin.js` and `requireOrgOwner.js`, `OrganizationMembership` is checked dynamically against the database:
    `where: { organizationId, status: 'active', [isEmployee ? 'employeeId' : 'userId']: req.user.id }`.
  - **Verdict**: Membership is authoritative for tenant-level governance and billing routes, but was incomplete because employee records lacked `OrganizationMembership` rows.

---

## 3. User & Staff Creation Reachability Matrix

| Path | Method | Controller | Auth Middleware | Target Model | Org Assignment | Membership Creation | Quota Checked (`maxUsers`) | Branch Assignment | Frontend Caller | Status / Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/auth/register` | `POST` | `authController.register` | None (Public) | `User` | Sets `organizationId` on new `Organization` & `Shop` | Creates `OrganizationMembership` (`userId`, `owner`, `active`) | Unlimited (Initial owner creates 14-day trial) | Creates initial `Shop` | `Signup.jsx` | **VULNERABLE (AUT-01)**: accepts client-supplied `role: cashier` |
| `/api/users` | `POST` | `userController.create` | `auth, checkRole(['admin'])` | `User` | **NULL / Unset** | **NONE** | **NONE (Bypass)** | Forced to `req.user.shopId` | `Users.jsx` (Orphaned) / `usersAPI.create()` | **CRITICAL BYPASS (ISO-01)**: complete quota and tenancy bypass |
| `/api/employees` | `POST` | `employeeController.createEmployee` | `auth, checkRole(['admin']), ensureShopIsolation` | `Employee` | Inferred via `Shop.organizationId` | **NONE (Gap)** | **YES** (`checkQuota(orgId, 'maxUsers', ...)`) | Forced to `req.user.shopId` | `Employees.jsx` (`employeesAPI.create()`) | **AUTHORITATIVE BASE**: needs membership insert and branch validation |

---

## 4. Organization Membership Schema & Constraints

### Table: `OrganizationMemberships`
- **Primary Key**: `id` (UUIDv4 CHAR(36))
- **Foreign Keys**:
  - `organizationId`: INTEGER NOT NULL -> `Organizations(id)` ON DELETE CASCADE
  - `userId`: INTEGER NULL -> `Users(id)` ON DELETE CASCADE
  - `employeeId`: CHAR(36) NULL -> `Employees(id)` ON DELETE CASCADE
- **Database Constraints**:
  - `chk_org_memberships_identity`: `CHECK ((userId IS NOT NULL AND employeeId IS NULL) OR (userId IS NULL AND employeeId IS NOT NULL))`
  - `uq_org_membership_user`: `UNIQUE (organizationId, userId)`
  - `uq_org_membership_employee`: `UNIQUE (organizationId, employeeId)`
  - `idx_org_membership_org_role`: `KEY (organizationId, orgRole)`
- **Sequelize Model Validation**:
  - `exactlyOneIdentity()` asserts exactly one of `userId` or `employeeId` is present.
- **Active / Inactive Semantics**:
  - `status`: `'active' | 'invited' | 'suspended'`
- **Branch Access Table: `ShopAccess`**:
  - `id` (UUID), `membershipId` (UUID -> `OrganizationMemberships`), `shopId` (INTEGER -> `Shops`), `isDefault` (BOOLEAN).
  - Used for administrative branch delegation (`orgRole === 'admin'`).

---

## 5. Quota Semantics & Concurrency Analysis

### How `maxUsers` is Enforced
1. Entitlements are governed by `entitlementService.checkQuota(organizationId, 'maxUsers', currentCount)`.
2. Plan Quotas:
   - **Starter**: `maxUsers = 2`
   - **Growth**: `maxUsers = 10`
   - **Grandfathered / Enterprise**: `maxUsers = -1` (unlimited)
3. Count Algorithm in `employeeController.createEmployee`:
   - Counts all `OrganizationMemberships` with `status: 'active'`.
   - Plus active `Employees` in the organization's shops not yet in `OrganizationMembership`.
   - Compares total against `plan.maxUsers`.
4. Structured Response on Limit Exceeded (`sendUpgradePrompt`):
   ```json
   {
     "error": "Plan limit of 2 reached for maxUsers. Upgrade required.",
     "code": "QUOTA_EXCEEDED",
     "currentPlan": "starter",
     "requiredPlan": "growth",
     "quota": "maxUsers",
     "limit": 2,
     "current": 2
   }
   ```
   HTTP Status: `403 Forbidden`.

### Concurrency Vulnerability
- Currently, counting active members and calling `Employee.create` happens in a transaction without a row-level lock.
- Two simultaneous requests from an organization at `limit - 1` can both read `current = 1`, pass `checkQuota(limit = 2)`, and both commit, resulting in `3` users.
- **Remediation**:
  At the beginning of the creation transaction, lock the tenant record:
  ```javascript
  await Organization.findByPk(orgId, {
    transaction: t,
    lock: t.LOCK.UPDATE
  });
  ```
  This serializes staff creation within the tenant in MySQL without blocking any other tenant.

---

## 6. Frontend Flow Analysis

1. **Authoritative UI**:
   - `frontend/src/pages/Employees.jsx` is the sole functional staff management page in the app.
   - It is routed at `/employees` and `/admin/employees` in `router.config.jsx`.
   - It calls `employeesAPI.create(payload)` (`POST /api/employees`).
2. **Orphaned Legacy UI**:
   - `frontend/src/pages/Users.jsx` is never imported in `router.config.jsx`.
   - It contains a plain HTML form calling `usersAPI.create()` -> `POST /api/users`.
3. **Broken Navigation in `ModernSidebar.jsx`**:
   - Line 106 defines `{ name: 'User Access', path: '/admin/users', icon: UserIcon }`.
   - Clicking this currently triggers an unmatched route error because `/admin/users` is not in `router.config.jsx`.
   - Mapping `/admin/users` to `<Employees />` in `router.config.jsx` resolves this cleanly.

---

## 7. Database Migration Assessment

- **DDL Migration Required?**: **NO.**
  `No database DDL migration required.`
- **Justification**:
  - `OrganizationMemberships` already contains `employeeId` (CHAR(36) NULL), foreign keys, and unique constraints (`uq_org_membership_employee`).
  - `ShopAccess` already exists and references `OrganizationMemberships`.
  - All needed columns exist and are fully verified in the live MySQL schema.

---

## 8. Exact Remediation Plan (Step 2)

Upon user approval, remediation will proceed in the following exact order:

### 1. AUT-01 Remediation: Self-Signup Role Coherence
- **File**: `backend/src/routes/auth.js`
  - Remove `body('role').optional().isIn(...)` validator from `/register`.
- **File**: `backend/src/controllers/authController.js`
  - In `register`: Ignore or disallow client-supplied `role`. Always create initial user with `role: 'admin'` and `OrganizationMembership` with `orgRole: 'owner'`.
  - Add unit test coverage for self-signup role coherence.

### 2. ISO-01 Remediation: Authoritative Staff Creation Service
- **File**: `backend/src/controllers/employeeController.js` (`createEmployee`)
  - **Email Normalization**: Trim and lowercase email. Check for duplicates across `User` and `Employee` case-insensitively.
  - **Tenant Resolution**: Read `orgId` strictly from authenticated context (`req.organizationId` / `req.user.organizationId` / shop's `organizationId`).
  - **Branch / Shop Validation**:
    - If `req.body.shopId` is provided, verify:
      `Shop.findOne({ where: { id: req.body.shopId, organizationId: orgId, active: true } })`.
    - If shop does not belong to `orgId`: reject with `403 Forbidden` (`SHOP_ACCESS_DENIED`).
    - If omitted, default to `req.user.shopId`.
  - **Concurrency-Safe Quota Check**:
    - Wrap in `sequelize.transaction(async (t) => { ... })`.
    - Acquire exclusive lock: `await Organization.findByPk(orgId, { transaction: t, lock: t.LOCK.UPDATE })`.
    - Count active members and verify `await entitlementService.checkQuota(orgId, 'maxUsers', activeCount)`.
    - On failure, return `sendUpgradePrompt(res, ...)`.
  - **Atomic Record Creation**:
    - Create `Employee` in transaction `t`.
    - Create `OrganizationMembership`:
      ```javascript
      await OrganizationMembership.create({
        organizationId: orgId,
        employeeId: employee.id,
        orgRole: req.body.position === 'admin' ? 'admin' : 'member',
        status: 'active'
      }, { transaction: t });
      ```
    - Create `ShopAccess` for the target shop in transaction `t`.
    - Log activity via `logActivity`.
  - **Employee Deletion / Update Integrity**:
    - In `deleteEmployee`: In transaction, deactivate or delete associated `OrganizationMembership` and `ShopAccess`.
    - In `updateEmployee`: If `status` changes to `'inactive'`, update `OrganizationMembership.status` to `'suspended'`.

### 3. Legacy `/api/users` Compatibility Wrapper
- **File**: `backend/src/controllers/userController.js`
  - Convert `userController.create` into a compatibility wrapper that routes to the canonical staff creation service, enforcing the exact same organization context, quota checks, membership creation, and transaction locks.
  - Never allow direct insertion of unlinked, quota-bypassing users.

### 4. Auth Profile & Login Update for Employees
- **File**: `backend/src/controllers/authController.js`
  - In `login` and `getProfile`: Query `OrganizationMembership` for `employeeId` when `isEmployee === true` so staff accounts receive their correct `orgRole: 'member'` (or `'admin'`).

### 5. Frontend Route & Navigation Alignment
- **File**: `frontend/src/router.config.jsx`
  - Add route for `admin/users` rendering `<Employees />`.
- **File**: `frontend/src/pages/Users.jsx`
  - Deprecate / remove or replace with redirect to `/employees`.

### 6. Automated Security & Isolation Test Suite
- Create `backend/tests/phase3UserTenantSecurity.test.js`:
  1. Below-quota staff creation succeeds.
  2. At-quota staff creation fails with structured `QUOTA_EXCEEDED` (403).
  3. Legacy `POST /api/users` cannot bypass quota or organization context.
  4. Concurrent creation requests at quota boundary: exactly one succeeds, the second receives `QUOTA_EXCEEDED`.
  5. Tenant isolation: Tenant A cannot create staff in Tenant B, nor assign staff to Tenant B's shop (`SHOP_ACCESS_DENIED`).
  6. Transaction atomicity: creation failure leaves no orphaned user, employee, or membership.
  7. Self-signup role coherence: client passing `role: cashier` receives `role: admin` and `orgRole: owner`.
  8. Duplicate email handling across `User` and `Employee` tables is deterministic and case-insensitive.
  9. POS login, checkout, and employee lookup regression tests pass.

---

## 9. Gate Status

```
[X] Step 1 Reconnaissance Complete
[X] PHASE-3-CURRENT-STATE-AUDIT.md Created
[X] Zero Application Code Changes in Step 1
[ ] AWAITING EXPLICIT USER APPROVAL TO BEGIN STEP 2 REMEDIATION
```
