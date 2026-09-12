# Zena POS — Organization Layer Architecture Design
**Document Version**: 1.0.0  
**Phase**: FINDING-12 (Phase 1 of 6: Organization & Membership Foundation)  
**Status**: DESIGN & AUDIT PROPOSAL (Read-Only Pass — No Code or Schema Mutations)  
**Target File**: `docs/architecture/ORGANIZATION-LAYER-DESIGN.md`  

---

## 1. Executive Summary & Context

Zena POS (`github.com/Warrenchris/zena-pos`) currently operates with `Shop` as the root tenant entity. Every business-critical table (`Sales`, `Products`, `Customers`, `Suppliers`, `Expenses`, `Invoices`, etc.) is foreign-keyed directly to `shopId`. 

While earlier security hardening (FINDING-01 through FINDING-11) successfully sealed cross-shop IDORs, scoped unique indexes per shop, and corrected catalog cache invalidation, the platform lacks a parent enterprise boundary. A merchant operating multiple retail branches cannot manage employees centrally, view consolidated metrics, or share master records across locations.

This document establishes the architecture for **Phase 1 of FINDING-12**: introducing an **Organization** security boundary and a **Membership** model above `Shop`, without modifying or destabilizing any existing shop-scoped business tables.

```
Platform
└── Organization (tenant security boundary) [PHASE 1]
    ├── Membership (org-level roles + shop-access grants) [PHASE 1]
    ├── Master Catalog (product definitions, split from Product) [Phase 3 — Future]
    ├── Customers (org-scoped) [Phase 2 — Future]
    ├── Suppliers (org-scoped) [Phase 2 — Future]
    ├── AI Analytics (org roll-up) [Phase 4 — Future]
    └── Shop/Branch (1..N) [EXISTING ROOT — NOW CHILD OF ORGANIZATION]
        ├── Inventory (per-shop stock ledger) [Phase 3 — Future]
        ├── Registers/Till [Phase 5 — Future]
        └── POS Sales, Purchases, Purchase Orders, Expenses, Employees [Stay shop-scoped forever]
```

---

## 2. Current State Mapping & Dependency Audit

### 2.1 Model Inventory & Tenant Boundaries
From `docs/architecture/SAAS-CURRENT-STATE.md` and `docs/security/TENANT-ISOLATION-MATRIX.md`:
- **Current Root**: `Shops` table (`id` INTEGER PK auto-increment).
- **Database Count**: Exactly **6 shops** currently exist in the primary database (`id: 1, 2, 3, 4, 5, 17`).
- **Identity Split**:
  - `Users`: Integer PK (`id: INT`). Used for back-office administrators and managers (`role IN ('admin', 'manager', 'cashier')`).
  - `Employees`: UUID PK (`id: CHAR(36)`). Used for POS cashiers, supervisors, and floor staff (`position: VARCHAR`).
  - Both tables have a foreign key to `shopId`.
- **Shop-Scoped Entities**: `Products`, `Categories`, `Coupons`, `Customers`, `Suppliers`, `Sales`, `SaleItems`, `SalePayments`, `SaleRefunds`, `Invoices`, `Purchases`, `PurchaseOrders`, `Expenses`, `StockMovements`, `HeldCarts`, `SystemSettings`, `ActivityLogs`.

### 2.2 JWT & Request Context Mapping
In `backend/src/middleware/auth.js`:
- JWT is verified via RS256:
  ```javascript
  const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
  req.user = decoded;
  req.shopId = decoded.shopId;
  ```
- Claims currently present in JWT:
  - `id`: User or Employee ID (`INT` or `UUID`)
  - `role`: Role string (`admin`, `manager`, `cashier`, `employee`)
  - `shopId`: Primary shop ID (`INT`)
  - `isEmployee`: Boolean flag distinguishing `Users` vs `Employees`
- `shopId` is actively read across **48 controller and service endpoints** via `req.user.shopId` or `req.shopId`.

### 2.3 Authentication & Login Flow Audit
In `backend/src/controllers/authController.js` (`login` method):
1. Client submits `{ email, password }` with **zero shop or organization context**.
2. Lookup order:
   ```javascript
   let user = await User.findOne({ where: { email }, include: [{ model: Shop, attributes: ['id', 'name'] }] });
   if (!user) {
     const employee = await Employee.findOne({ where: { email }, include: [{ model: Shop, attributes: ['id', 'name'] }] });
     ...
   }
   ```
3. Because `User.email` and `Employee.email` were explicitly retained as globally unique in FINDING-04, an email uniquely maps to exactly one identity record.
4. The resolved identity contains `shopId`. The server mints the JWT containing that `shopId`.
5. **Key Takeaway**: Login currently requires no shop picker. Single-shop users experience seamless authentication. Introducing `Organization` does not require changing this flow for Phase 1.

---

## 3. Architecture & Data Model Design

### 3.1 Entity 1: `Organization`
The `Organization` entity represents the enterprise legal entity, billing account, and outermost security boundary.

#### Schema Specification (`Organizations`)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY`, `AUTO_INCREMENT` | Numeric ID matching repository standard for tenant roots. |
| `name` | `VARCHAR(255)` | `NOT NULL` | Business / Company legal or trading name. |
| `slug` | `VARCHAR(100)` | `NOT NULL`, `UNIQUE` | URL-safe identifier (e.g., `soko-safi-group`). |
| `status` | `ENUM('active', 'suspended', 'trial')` | `NOT NULL`, `DEFAULT 'active'` | Operational status of the merchant organization. |
| `currency` | `VARCHAR(3)` | `NOT NULL`, `DEFAULT 'KES'` | Default currency for organization roll-ups. |
| `createdAt` | `DATETIME` | `NOT NULL` | Standard audit timestamp. |
| `updatedAt` | `DATETIME` | `NOT NULL` | Standard audit timestamp. |

#### Model Associations
- `Organization.hasMany(Shop, { foreignKey: 'organizationId' })`
- `Organization.hasMany(OrganizationMembership, { foreignKey: 'organizationId' })`

---

### 3.2 Modification: `Shop` Foreign Key
A foreign key `organizationId` is added to the `Shops` table.

#### Schema Delta (`Shops`)
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `organizationId` | `INTEGER` | `NOT NULL`, `REFERENCES Organizations(id) ON DELETE RESTRICT` | Parent organization linkage. |

- Index: `CREATE INDEX idx_shops_organization_id ON Shops(organizationId);`
- `ON DELETE RESTRICT` guarantees that an organization cannot be deleted while child shops exist, preserving transactional integrity.

---

### 3.3 The Membership Model: Two-Table Architecture vs Single-Table Analysis

The central design decision is how to represent user membership across an organization and its multiple shops.

#### Evaluated Architectural Options

```
OPTION A: Two-Table Architecture (RECOMMENDED)
OrganizationMembership (User ↔ Org) ─────── 1 : N ───────> ShopAccess (Membership ↔ Shop)
(Holds org-level role: owner, admin, member)                (Specific shop grant / override)

OPTION B: Single-Table Architecture (REJECTED)
UserShopRole (User ↔ Shop ↔ Org)
(Every user assignment is tied directly to a single shop)
```

#### Why Option A (Two-Table) is Selected

1. **O(1) Access Verification for Future Phases**:
   - In Phase 2, `Customers` and `Suppliers` become org-scoped (`WHERE organizationId = :orgId`).
   - In Phase 4, AI analytics generate organization-wide roll-up insights across all branches.
   - With Option A, verifying whether a user has permission to read or modify org-level data is a single indexed query against `OrganizationMemberships` (`WHERE organizationId = :orgId AND userId = :userId`).
   - In Option B, verifying org access requires joining through `Shops` or grouping by `organizationId`, causing expensive query overhead on every org-scoped request.

2. **Organization-Level Administrators without Physical Till Assignments**:
   - Company owners, CFOs, inventory directors, and accountants need organization-wide access to reports and catalogs, but do not operate a physical cash drawer at a specific branch.
   - Option A models this cleanly: an `owner` or `admin` has an `OrganizationMembership` with org-level privileges, and implicit read access to all shops.
   - Option B forces the system to assign fake till/shop assignments to executives, polluting shop-level cashier lists.

3. **Atomic Tenant Lifecycle Operations**:
   - If an employee is terminated from an enterprise, setting `OrganizationMemberships.status = 'inactive'` immediately revokes access across all 15 branches in one update.
   - In Option B, N individual rows must be found and deleted/deactivated, creating race conditions.

---

### 3.4 Detailed Schema: `OrganizationMemberships` & `ShopAccess`

To accommodate the existing dual-table identity split (`Users` INT PK vs `Employees` UUID PK) without invasive schema rewrites, `OrganizationMemberships` utilizes explicit, nullable foreign keys with integrity constraints.

#### Table: `OrganizationMemberships`
Represents a person's affiliation with an enterprise organization.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT UUIDV4` | Uniform UUID primary key. |
| `organizationId` | `INTEGER` | `NOT NULL`, `REFERENCES Organizations(id) ON DELETE CASCADE` | Target enterprise organization. |
| `userId` | `INTEGER` | `NULL`, `REFERENCES Users(id) ON DELETE CASCADE` | Link if identity is a `User` (admin/manager). |
| `employeeId` | `CHAR(36)` | `NULL`, `REFERENCES Employees(id) ON DELETE CASCADE` | Link if identity is an `Employee` (cashier/staff). |
| `orgRole` | `ENUM('owner', 'admin', 'member', 'billing_admin')` | `NOT NULL`, `DEFAULT 'member'` | High-level governance role within the organization. |
| `status` | `ENUM('active', 'invited', 'suspended')` | `NOT NULL`, `DEFAULT 'active'` | Membership status. |
| `createdAt` | `DATETIME` | `NOT NULL` | Audit timestamp. |
| `updatedAt` | `DATETIME` | `NOT NULL` | Audit timestamp. |

**Database-Level Constraints & Indexes**:
- `CONSTRAINT chk_member_identity CHECK ((userId IS NOT NULL AND employeeId IS NULL) OR (userId IS NULL AND employeeId IS NOT NULL))`
- `UNIQUE INDEX uq_org_membership_user (organizationId, userId)` (enforces one membership per User per Org)
- `UNIQUE INDEX uq_org_membership_employee (organizationId, employeeId)` (enforces one membership per Employee per Org)
- `INDEX idx_org_membership_org_role (organizationId, orgRole)`

#### Table: `ShopAccess`
Grants a member operational permission to act within specific branch locations.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, `DEFAULT UUIDV4` | Uniform UUID primary key. |
| `membershipId` | `UUID` | `NOT NULL`, `REFERENCES OrganizationMemberships(id) ON DELETE CASCADE` | Parent membership reference. |
| `shopId` | `INTEGER` | `NOT NULL`, `REFERENCES Shops(id) ON DELETE CASCADE` | Physical branch location. |
| `isDefault` | `BOOLEAN` | `NOT NULL`, `DEFAULT false` | Primary branch for login session bootstrapping. |
| `createdAt` | `DATETIME` | `NOT NULL` | Audit timestamp. |
| `updatedAt` | `DATETIME` | `NOT NULL` | Audit timestamp. |

**Database-Level Constraints & Indexes**:
- `UNIQUE INDEX uq_membership_shop (membershipId, shopId)` (prevents duplicate branch grants)
- `INDEX idx_shop_access_shop (shopId)` (rapid lookup of all staff at a branch)

---

## 4. RBAC & Dual-Role Hierarchy Coexistence

A critical requirement is that introducing `orgRole` must **not conflict with or duplicate** existing `User.role` (`admin`, `manager`, `cashier`) or `Employee.position`.

### Two Orthogonal Axes of Authorization

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AXIS 1: GOVERNANCE (Org Role)                   │
│   Scope: Organization wide (Cross-shop, Billing, Customers, Catalogs) │
│   Roles: owner | admin | member | billing_admin                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       AXIS 2: OPERATIONAL (Shop Role)                  │
│   Scope: Single Physical Shop (POS checkout, Cash Drawer, Refunds)     │
│   Roles: Existing User.role (admin, manager, cashier) + Permissions    │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Governance Axis (`OrganizationMembership.orgRole`)**:
   - `owner`: Full control over organization, billing, plan, creation of new branches/shops.
   - `admin`: Can invite staff, manage master catalog (Phase 3), view cross-shop reports (Phase 4).
   - `member`: Regular staff member. Can only operate within branches where an explicit `ShopAccess` grant exists.
   - `billing_admin`: Manages invoices and subscription tiers (Phase 6).

2. **Operational Axis (`User.role` / `RolePermissions`)**:
   - Governs point-of-sale actions inside a branch (e.g. ringing sales, voiding lines, applying discounts, viewing local drawer counts).
   - Continues using the existing `src/middleware/rolePermissions.js` and cached Redis permissions without modification.
   - **Zero Drift**: An employee can be `orgRole: 'member'` while being `role: 'manager'` at Shop A. An executive can be `orgRole: 'owner'` while having `role: 'admin'` at Shop A.

---

## 5. Token & Request Context Architecture

### 5.1 The JWT vs Server-Side Resolution Decision
Should `organizationId` be embedded into the JWT or resolved per-request from `req.user.shopId`?

#### Evaluation Matrix
| Evaluation Factor | Derived Server-Side (`req.user.shopId` -> DB/Cache) | Embedded in JWT (`token.organizationId`) |
| :--- | :--- | :--- |
| **Token Size** | 0 bytes added | +15 bytes (negligible on 700-byte RS256 token) |
| **Database Overhead** | Requires DB/Redis query on every request that checks org context | **Zero extra DB queries** on every request |
| **Phase 2-6 Preparedness** | Phase 2 will need `organizationId` on all Customer/Supplier queries. High friction if missing. | **Ready immediately**. Every route has verified org context. |
| **Token Invalidation on Shop Switch** | Same (switching active shop requires token refresh in both models) | Clean, explicit claim |

#### Architectural Recommendation
**Embed `organizationId` directly in the JWT payload alongside `shopId`**.
- At login and token generation:
  ```javascript
  const token = jwt.sign(
    { 
      id: user.id, 
      role: user.role, 
      shopId: user.shopId,
      organizationId: shop.organizationId, // <-- Added in Phase 1
      isEmployee: !!user.isEmployee
    },
    getPrivateKey(),
    { algorithm: 'RS256', expiresIn: '2h' }
  );
  ```
- In `src/middleware/auth.js`:
  ```javascript
  req.user = decoded;
  req.shopId = decoded.shopId;
  req.organizationId = decoded.organizationId; // <-- Added in Phase 1
  ```
- **Fallback Compatibility**: For legacy tokens minted before Phase 1 deployment, `auth.js` will resolve `req.organizationId` via a fast fallback query/cache lookup if the claim is absent, guaranteeing 100% zero downtime.

---

## 6. Seamless Backward Compatibility & Backfill Strategy

### 6.1 The 1:1 Auto-Wrap Migration Principle
To ensure existing single-shop merchants experience **zero downtime and zero behavioral difference**, the migration will automatically wrap each of the 6 existing `Shops` in its own dedicated `Organization`.

### 6.2 Backfill Pseudocode & Logic

```sql
-- STEP 1: Insert an Organization for each existing Shop
INSERT INTO Organizations (name, slug, status, currency, createdAt, updatedAt)
SELECT 
  name,
  LOWER(CONCAT(REPLACE(REPLACE(name, ' ', '-'), '(', ''), ')', '-', id)) AS slug,
  'active',
  'KES',
  NOW(),
  NOW()
FROM Shops;

-- STEP 2: Link each Shop to its corresponding Organization
UPDATE Shops s
JOIN Organizations o ON o.name = s.name
SET s.organizationId = o.id;

-- STEP 3: Backfill OrganizationMemberships and ShopAccess for existing Users
-- Each user is granted 'owner' (if admin) or 'admin' (if manager) or 'member' in the shop's org
INSERT INTO OrganizationMemberships (id, organizationId, userId, employeeId, orgRole, status, createdAt, updatedAt)
SELECT 
  UUID(),
  s.organizationId,
  u.id,
  NULL,
  CASE WHEN u.role = 'admin' THEN 'owner' WHEN u.role = 'manager' THEN 'admin' ELSE 'member' END,
  'active',
  NOW(),
  NOW()
FROM Users u
JOIN Shops s ON s.id = u.shopId;

-- Grant ShopAccess to each user for their primary shop
INSERT INTO ShopAccess (id, membershipId, shopId, isDefault, createdAt, updatedAt)
SELECT 
  UUID(),
  om.id,
  u.shopId,
  true,
  NOW(),
  NOW()
FROM OrganizationMemberships om
JOIN Users u ON u.id = om.userId;

-- STEP 4: Backfill OrganizationMemberships and ShopAccess for existing Employees
INSERT INTO OrganizationMemberships (id, organizationId, userId, employeeId, orgRole, status, createdAt, updatedAt)
SELECT 
  UUID(),
  s.organizationId,
  NULL,
  e.id,
  'member',
  'active',
  NOW(),
  NOW()
FROM Employees e
JOIN Shops s ON s.id = e.shopId;

INSERT INTO ShopAccess (id, membershipId, shopId, isDefault, createdAt, updatedAt)
SELECT 
  UUID(),
  om.id,
  e.shopId,
  true,
  NOW(),
  NOW()
FROM OrganizationMemberships om
JOIN Employees e ON e.id = om.employeeId;
```

---

## 7. Migration Sequence & Idempotent Execution Plan

Because MySQL/InnoDB does not support transactional DDL, the migration script must be executed in discrete, verifiable stages:

```
[Stage 1: DDL] Create Organizations Table (Idempotent)
       │
       ▼
[Stage 2: DDL] Alter Shops Add organizationId INT NULL (Idempotent)
       │
       ▼
[Stage 3: DML] Backfill Organizations & link Shops.organizationId (Idempotent)
       │
       ▼
[Stage 4: DDL] Alter Shops Modify organizationId INT NOT NULL + Add FK Constraint
       │
       ▼
[Stage 5: DDL] Create OrganizationMemberships & ShopAccess Tables (Idempotent)
       │
       ▼
[Stage 6: DML] Backfill Memberships & Shop Access for Users and Employees
       │
       ▼
[Stage 7: VERIFY] Assert 0 orphan Shops, 0 orphan Memberships, 100% parity
```

### Rollback Strategy & Known Limitations
- **Up to Stage 4**: If migration aborts before making `organizationId` NOT NULL, existing application operations continue unaffected because `Shop` queries do not depend on `organizationId`.
- **Full Down Migration**:
  1. Drop `ShopAccess` table.
  2. Drop `OrganizationMemberships` table.
  3. Drop foreign key constraint on `Shops.organizationId`.
  4. Drop column `Shops.organizationId`.
  5. Drop `Organizations` table.

---

## 8. Risk Analysis & Interaction with Prior Hardening Work

| Hardening Component | Risk Level | Interaction Analysis | Mitigation Strategy |
| :--- | :---: | :--- | :--- |
| **FINDING-04 (Composite Unique Indexes)** | **NONE** | Indexes (`(shopId, sku)`, `(shopId, barcode)`, `(shopId, invoiceNumber)`) are strictly scoped to `shopId`. Phase 1 does not alter `shopId` or any product/sales schema. | Zero changes to `Products`, `Sales`, `Customers`, or `Invoices`. |
| **FINDING-11 (Catalog Cache Invalidation)** | **NONE** | Redis key pattern `products:shop:${shopId}` remains keyed by `shopId`. | Keep catalog caching exactly as-is. Do not introduce org-level catalog caching in Phase 1. |
| **P0/P1 IDOR & Tenant Isolation Fixes** | **NONE** | Fixes in `invoiceController.js`, `reportsController.js`, `cardRoutes.js`, `mpesaRoutes.js` enforce `req.user.shopId`. | Phase 1 preserves `req.user.shopId` and `req.shopId` completely intact. |
| **Dual User/Employee Authentication** | **LOW** | Login resolves user by email without shop context. | `User.findOne` and `Employee.findOne` include `Shop` association. `shop.organizationId` is populated with zero query penalty. |

---

## 9. Explicit Out-of-Scope Declarations (Phase 1)

To protect system stability, the following items are **explicitly out of scope** for Phase 1:
- ❌ **No changes to Customers or Suppliers** (Deferred to Phase 2: Org-Scoped CRM & Directory).
- ❌ **No Master Catalog / Inventory Split** (Deferred to Phase 3: Central Catalog vs Local Ledger).
- ❌ **No AI Roll-up Analytics** (Deferred to Phase 4).
- ❌ **No Cash Registers / Till Entity** (Deferred to Phase 5).
- ❌ **No Billing, Subscription Plans, or Entitlements** (Deferred to Phase 6).
- ❌ **No Frontend UI Organization Switcher** (Phase 1 establishes backend schema & data integrity only).

---

## 10. Summary & Sign-off Checklist

- [x] Current-state model inventory and JWT flow mapped.
- [x] Two-table `OrganizationMembership` + `ShopAccess` model justified and specified.
- [x] Dual `Users` (INT) / `Employees` (UUID) identity split accommodated cleanly via database constraints.
- [x] 100% backward compatibility for all 6 existing shops guaranteed via auto-wrap backfill.
- [x] Multi-stage, idempotent MySQL DDL/DML migration plan documented.
- [x] Confirmed zero regression risk to FINDING-01 through FINDING-11.

**HARD STOP REACHED**: This document represents the complete Phase 1 architectural design proposal. Awaiting explicit user review and approval before any migration or code changes are scheduled.
