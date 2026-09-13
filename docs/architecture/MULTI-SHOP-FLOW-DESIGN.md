# Zena POS — Multi-Shop Creation & Session Switching Architecture Design
**Document Version**: 1.0.0  
**Phase**: FINDING-12 (Consumer Slice: Shop Creation & Branch Switching under Organizations)  
**Status**: DESIGN & AUDIT PROPOSAL (Read-Only Pass — No Code, Model, Route, or Migration Mutations)  
**Target File**: `docs/architecture/MULTI-SHOP-FLOW-DESIGN.md`  

---

## 1. Executive Summary & Context

Phase 1 of FINDING-12 established the platform's multi-tenant foundation:
- The `Organization` root entity.
- The foreign key constraint `Shops.organizationId REFERENCES Organizations(id)`.
- The two-table governance and branch operational grant model (`OrganizationMemberships` and `ShopAccess`).
- Inclusion of `organizationId` within the RS256 JWT payload alongside `shopId`.

However, the application runtime currently operates under a **single-shop mental model**:
1. Every login session produces a JWT bound to exactly one `shopId`.
2. All 48 existing backend controllers and P0/P1 tenant isolation filters assume `req.user.shopId` / `req.shopId` represents the sole active operational context.
3. No API endpoint exists to create a secondary shop under an existing organization.
4. No endpoint exists to switch active shop context without full credential re-entry.

Before Phase 2 begins migrating shared business entities (`Customers` and `Suppliers`) to organization-level scoping, we must surface and formalize the session and branch-switching mechanics. This design document establishes the architecture for:
- **Creating a secondary Shop** under an existing Organization.
- **Session context switching** (`POST /api/auth/switch-shop`) enabling multi-branch merchants to operate across physical retail locations seamlessly without destabilizing existing isolation guarantees.

---

## 2. Current State Re-Verification Audit

### 2.1 Live JWT Claim Shape & Expiry (Post-Phase 1)
Re-verified directly from `backend/src/controllers/authController.js` and `backend/src/middleware/auth.js`:

#### Token Payload:
```javascript
{
  id: user.id,                      // INTEGER (User) or UUID CHAR(36) (Employee)
  role: user.role,                  // 'admin' | 'manager' | 'cashier' | 'employee'
  shopId: user.shopId,              // INTEGER (Primary physical branch)
  organizationId: shop.organizationId, // INTEGER (Parent enterprise tenant boundary)
  isEmployee: !!user.isEmployee,    // BOOLEAN (Distinguishes identity table)
  iat: 1789243672,                  // Issued At
  exp: 1789250872                   // Expiry (2 hours)
}
```

#### Token Characteristics:
- **Algorithm**: RS256 (asymmetric cryptographic key pair).
- **Expiry Window**: `process.env.JWT_EXPIRES_IN || '2h'` (2 hours).
- **Request Context Decoded by `auth.js`**:
  - `req.user = decoded;`
  - `req.shopId = decoded.shopId;`
  - `req.organizationId = decoded.organizationId;` (with automatic fallback to `Shop.findByPk(decoded.shopId)` for legacy tokens).

### 2.2 Migrated Schemas & Integrity Constraints

Re-verified directly from the Phase 1 migration files:

#### 1. `OrganizationMemberships` (`20260912195655-create-organization-memberships-table.js`)
- `id`: `CHAR(36) COLLATE utf8mb4_bin PRIMARY KEY` (UUIDv4).
- `organizationId`: `INT NOT NULL`, FK to `Organizations(id)` `ON DELETE CASCADE`.
- `userId`: `INT NULL`, FK to `Users(id)` `ON DELETE CASCADE`.
- `employeeId`: `CHAR(36) COLLATE utf8mb4_bin NULL`, FK to `Employees(id)` `ON DELETE CASCADE`.
- `orgRole`: `ENUM('owner', 'admin', 'member', 'billing_admin') NOT NULL DEFAULT 'member'`.
- `status`: `ENUM('active', 'invited', 'suspended') NOT NULL DEFAULT 'active'`.
- **Identity Constraint**:
  `CONSTRAINT chk_org_memberships_identity CHECK ((userId IS NOT NULL AND employeeId IS NULL) OR (userId IS NULL AND employeeId IS NOT NULL))`
- **Unique Indexes**:
  - `uq_org_membership_user (organizationId, userId)`
  - `uq_org_membership_employee (organizationId, employeeId)`
- **Query Index**:
  - `idx_org_membership_org_role (organizationId, orgRole)`

#### 2. `ShopAccess` (`20260912195715-create-shop-access-table.js`)
- `id`: `CHAR(36) COLLATE utf8mb4_bin PRIMARY KEY` (UUIDv4).
- `membershipId`: `CHAR(36) COLLATE utf8mb4_bin NOT NULL`, FK to `OrganizationMemberships(id)` `ON DELETE CASCADE`.
- `shopId`: `INT NOT NULL`, FK to `Shops(id)` `ON DELETE CASCADE`.
- `isDefault`: `TINYINT(1) NOT NULL DEFAULT 0` (Boolean primary flag).
- **Constraints & Indexes**:
  - `UNIQUE KEY uq_membership_shop (membershipId, shopId)`
  - `KEY idx_shop_access_shop (shopId)`

#### 3. `Shops.organizationId` (`20260912195647-enforce-shop-organization-id-constraint.js`)
- `organizationId`: `INT NOT NULL`.
- `CONSTRAINT fk_shops_organization_id FOREIGN KEY (organizationId) REFERENCES Organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE`.
- `KEY idx_shops_organization_id (organizationId)`.

### 2.3 Audit of Existing Shop Creation Logic
An exhaustive codebase search across `backend/src` for `Shop.create` revealed only **two occurrences**:
1. `backend/src/seeders/seed.js:14`: Seed script creating a default shop.
2. `backend/src/controllers/authController.js:31`: The `register` endpoint (`POST /api/auth/register`), which executes during initial merchant onboarding:
   ```javascript
   if (shop?.name) {
     createdShop = await Shop.create({
       name: shop.name,
       address: shop.address || null,
       phone: shop.phone || null,
     });
   }
   ```
3. **Dedicated Shop Management Routes**:
   `backend/src/routes/shop.js` is mounted at `/api/shop`, but currently exposes **only**:
   - `GET /api/shop/me` (`shopController.getMine`): Returns current `req.user.shopId` details.
   - `PUT /api/shop/me` (`shopController.updateMine`): Updates current `req.user.shopId` details.
   - **Crucial Finding**: There is currently **zero endpoint** anywhere in the API for an authenticated user to create an additional shop or branch.

### 2.4 Frontend Shop Context Assumptions
An audit of `frontend/src` (`authSlice.js`, `router.config.jsx`, `PrivateRoute.jsx`, `Dashboard.jsx`, `Reports.jsx`):
- **Single Shop Storage**: `authSlice.js` stores `user`, `token`, and a single `shop: user?.shop || null`.
- **Global Dependency on `user.shopId`**:
  - `Dashboard.jsx`: `const userShopId = user?.shopId || user?.shop?.id; if (!userShopId) { ... }`.
  - `Reports.jsx`, `MySales.jsx`, `Employees.jsx`: All read `user.shopId` or pass `user?.shop?.id`.
- **Breakage Point for Multi-Shop Users**:
  If a user is granted access to multiple shops without a session-switching mechanism:
  - The frontend has no knowledge of the user's other branches.
  - The JWT only authorizes the single `shopId` minted at login.
  - Any attempt to interact with another shop results in a `403 Forbidden` from backend tenant isolation middleware.

---

## 3. The Central Decision: Session Model for Multi-Shop Users

We evaluated three potential session management strategies for multi-shop merchants.

### 3.1 Evaluated Options

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ OPTION A: Re-Login Required                                                                │
│ User logs out and re-authenticates to select or change active branch.                       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ OPTION B: Token Refresh Endpoint (RECOMMENDED)                                              │
│ POST /api/auth/switch-shop exchanges valid JWT for new JWT scoped to target shop.           │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ OPTION C: Shop-Agnostic Token                                                               │
│ JWT has organizationId only. Every HTTP request passes active branch via header (X-Shop-Id).│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 In-Depth Architectural Evaluation

| Evaluation Criteria | Option A: Re-Login | Option B: Token Refresh (`switch-shop`) | Option C: Shop-Agnostic Header |
| :--- | :--- | :--- | :--- |
| **User Experience (UX)** | ❌ **Abysmal**. Owner creates a branch, must immediately log out, re-type credentials. | 🟢 **Frictionless**. Instant branch switch via dropdown without password re-entry. | 🟡 Good, but prone to client-side header desynchronization bugs. |
| **Impact on Existing Backend** | 🟡 Minimal backend code, but requires redesigning login to add a shop picker. | 🟢 **Zero backend refactoring**. All 48 controllers continue reading `req.shopId` unchanged. | ❌ **Massive rewrite**. Breaks all 48 controllers, P0/P1 IDOR fixes, and `auth.js` path checks. |
| **Login Flow Invariants** | ❌ **Breaks FINDING-04 invariant**. Login currently matches email uniquely; requires shop picker UI at login. | 🟢 **Preserves FINDING-04 invariant**. Login logs user into default shop; switching happens post-auth. | 🟢 Login unchanged. |
| **Performance Overhead** | 🟢 Zero extra per-request overhead. | 🟢 **Zero extra per-request overhead**. 15-byte claim in JWT, 0 DB queries on business routes. | ❌ **Severe overhead**. Every route must query `ShopAccess` from DB/Redis to authorize header. |
| **Security & Tenant Isolation** | 🟢 Cryptographically signed shop claim. | 🟢 **Cryptographically signed shop claim**. Untamperable `req.shopId`. | ❌ **Higher risk**. Client-supplied header can be forged or mistargeted if middleware slips. |

### 3.3 Architectural Recommendation: Option B (`POST /api/auth/switch-shop`)

**Option B is selected**. It adheres to the fundamental tenet of the Zena POS target architecture:
> *"POS Sales, Purchases, Purchase Orders, Expenses, Employees — stay shop-scoped forever, no phase touches these."*

By minting a fresh, cryptographically signed RS256 token containing the target `shopId`, every downstream service, controller, and security middleware receives a verified, tamper-proof `req.shopId` with **zero code changes required across existing business endpoints**.

### 3.4 Key Sub-Decisions for Option B

#### 1. Token Lifetime & Revocation Strategy (Old vs. New Token)
- **Decision**: **Both old and new tokens remain cryptographically valid until natural expiry (2 hours). No distributed blocklist or immediate invalidation.**
- **Rationale**:
  - In a stateless JWT architecture, the old token only grants access to a shop the user is *already* legitimately authorized to operate. Having a token for Shop A and a token for Shop B confers zero privilege elevation.
  - Adding immediate token invalidation would require a Redis token blacklist lookup on *every single authenticated HTTP request across the entire system*.
  - This project tracks platform-wide token revocation under **BACKLOG-04** (Redis-backed session termination on password reset / user deactivation). Shop switching should not couple itself to distributed state or introduce Redis as a single point of failure for standard routing.

#### 2. Frontend Contract & State Invalidation
When the frontend switches branches, it follows a strict 4-step contract:
1. Client issues: `POST /api/auth/switch-shop` with `{ shopId: targetShopId }`.
2. Server validates access and returns: `{ token: newJwt, user: updatedUser, shop: newShop }`.
3. Redux dispatches `setCredentials({ token, user, shop })`, replacing `localStorage.getItem('token')`.
4. Client-side shop caches (cached sales in held carts, active product catalog, drawer counts) are purged from memory, and the UI re-fetches dashboard and inventory data for the new branch.

---

## 4. New Shop Creation Endpoint Specification

### 4.1 Route & Access Control
- **Endpoint**: `POST /api/shop`
- **Authentication**: `auth` middleware (requires valid JWT).
- **Authorization Rule**: **Governance Axis Only (`OrganizationMembership.orgRole IN ('owner', 'admin')`)**.
  - A cashier or local shop manager (`orgRole: 'member'`) cannot spawn new physical branches.
  - Only enterprise `owner` or `admin` accounts can expand an organization.

### 4.2 Atomic Transaction Lifecycle
When a new Shop is created, the operation must execute within an atomic MySQL transaction (`sequelize.transaction`):

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              ATOMIC SHOP CREATION LIFECYCLE                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Validate caller has orgRole IN ('owner', 'admin') in req.organizationId             │
│ 2. INSERT INTO Shops (name, address, phone, kraPin, registrationNumber, organizationId)│
│ 3. INSERT INTO ShopAccess (membershipId, shopId, isDefault = 0)                        │
│ 4. INSERT INTO SystemSettings (shopId, defaultCurrency = 'KES', timezone, ...)         │
│ 5. Commit Transaction & Return Created Shop Details                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 The `ShopAccess` Resolution for Org Owners/Admins
**Central Architectural Question**: *Does the creating user's membership need a NEW `ShopAccess` row for this shop, or do owners/admins get implicit all-shops access without a row?*

- **Decision**: **Explicit `ShopAccess` creation for the creator's membership upon shop creation**.
- **Rationale**:
  1. **Authoritative Single Source of Truth**: System queries of the form *"Who has operational clearance at Branch X?"* (`SELECT * FROM ShopAccess WHERE shopId = :id`) remain 100% complete and index-backed, without needing clumsy `UNION` queries against org admins.
  2. **Fine-Grained Future Delegation**: An organization may appoint an `admin` (e.g. an operations director) who is assigned to manage North Region shops only. Relying on implicit universal access would prevent assigning sub-sets of branches to administrators.
  3. **Guaranteed Branch Switching**: By explicitly writing a `ShopAccess` record for the creator, the new shop is immediately visible in their accessible shops list (`GET /api/shop/accessible`) without edge-case fallback logic.

### 4.4 Shop Bootstrapping & Default Configuration
Existing single-shop onboarding creates a shop row, but relies on lazy initialization for settings. For a production multi-branch deployment:
- **Eager `SystemSettings` Initialization**: The endpoint must eagerly create a `SystemSettings` record using `SystemSettings.getDefaultSettings()`, binding it to `newShop.id`.
- **Inherited Enterprise Defaults**:
  - `defaultCurrency`: Inherited from `Organization.currency` (KES).
  - `timezone`: Inherited from parent organization or default (`Africa/Nairobi`).
  - Standard tax rate (`0.00`), barcode formats (`EAN13`), and return policies.
- This eliminates first-sale cold-start latency and ensures receipts, drawer limits, and tax calculations work immediately on the new branch.

---

## 5. API Interface Contracts

### 5.1 Endpoint 1: Create Shop (`POST /api/shop`)

#### Request:
- **Headers**: `Authorization: Bearer <jwt>`
- **Body**:
  ```json
  {
    "name": "Soko Safi Kilimani Branch",
    "address": "Argwings Kodhek Rd, Nairobi",
    "phone": "+254711000222",
    "kraPin": "P051234567Z",
    "registrationNumber": "BN-2026-9876"
  }
  ```

#### Response (`201 Created`):
```json
{
  "message": "Shop created successfully",
  "shop": {
    "id": 18,
    "name": "Soko Safi Kilimani Branch",
    "address": "Argwings Kodhek Rd, Nairobi",
    "phone": "+254711000222",
    "kraPin": "P051234567Z",
    "registrationNumber": "BN-2026-9876",
    "organizationId": 4,
    "active": true,
    "createdAt": "2026-09-12T23:30:00.000Z",
    "updatedAt": "2026-09-12T23:30:00.000Z"
  },
  "access": {
    "id": "5e1a3b8c-4d2f-4e6a-8b1a-9c7d8e6f0a1b",
    "membershipId": "7aa7f567-621f-49c9-a2c3-a4035b627142",
    "shopId": 18,
    "isDefault": false
  }
}
```

---

### 5.2 Endpoint 2: Switch Active Shop (`POST /api/auth/switch-shop`)

#### Request:
- **Headers**: `Authorization: Bearer <jwt>`
- **Body**:
  ```json
  {
    "shopId": 18
  }
  ```

#### Processing Logic:
1. Verify `shopId` belongs to `req.organizationId`.
2. Fetch `OrganizationMembership` for caller (`organizationId: req.organizationId, userId: req.user.id`).
3. Check authorization:
   - User has active row in `ShopAccess` for `(membershipId, shopId)`, **OR**
   - User has `orgRole: 'owner'` (an owner switching to an unassigned branch automatically receives an explicit `ShopAccess` grant on the fly).
4. Fetch target `Shop` record.
5. Mint new RS256 JWT containing `shopId: targetShopId`, `organizationId: req.organizationId`.
6. Return refreshed session envelope.

#### Response (`200 OK`):
```json
{
  "message": "Switched active shop successfully",
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 205,
    "name": "Wanjiku Kamau",
    "email": "wanjiku@sokosafi.co.ke",
    "role": "admin",
    "shopId": 18,
    "organizationId": 4
  },
  "shop": {
    "id": 18,
    "name": "Soko Safi Kilimani Branch",
    "address": "Argwings Kodhek Rd, Nairobi",
    "phone": "+254711000222"
  }
}
```

---

### 5.3 Endpoint 3: List Accessible Shops (`GET /api/shop/accessible`)

Provides the list of shops the caller can switch between (for populating future UI branch selectors).

#### Request:
- **Headers**: `Authorization: Bearer <jwt>`

#### Processing Logic:
- For `orgRole: 'owner'`: Returns **all active shops** in `req.organizationId`.
- For `orgRole IN ('admin', 'member')`: Returns shops where an active `ShopAccess` record links caller's `membershipId`.

#### Response (`200 OK`):
```json
{
  "currentShopId": 4,
  "organizationId": 4,
  "shops": [
    {
      "id": 4,
      "name": "Soko Safi Supermarket (Westlands)",
      "isDefault": true,
      "isCurrent": true
    },
    {
      "id": 18,
      "name": "Soko Safi Kilimani Branch",
      "isDefault": false,
      "isCurrent": false
    }
  ]
}
```

---

## 6. Risk Analysis & Compatibility Matrix

| System Layer | Risk Level | Interaction Analysis | Safeguard / Invariant |
| :--- | :---: | :--- | :--- |
| **P0/P1 Tenant Isolation Fixes** | **ZERO** | All 48 controllers rely on `req.user.shopId` and `req.shopId`. | `switch-shop` updates `token.shopId`. The active shop context remains completely isolated and enforced at the database level. |
| **FINDING-04 Composite Unique Indexes** | **ZERO** | `(shopId, sku)`, `(shopId, barcode)`, `(shopId, invoiceNumber)`. | Creating Shop 18 allows Shop 18 to have `SKU-001` even if Shop 4 also has `SKU-001`. Independent branch namespaces preserved. |
| **FINDING-11 Catalog Cache Invalidation** | **ZERO** | Cache key is `products:shop:${shopId}`. | Switching to Shop 18 automatically points queries and invalidations to `products:shop:18`, preventing cache cross-talk. |
| **Dual Identity (Users vs. Employees)** | **LOW** | Employees (`UUID`) vs Users (`INT`). | `ShopAccess` points to `OrganizationMemberships.id` (`UUID`). Both identity types are supported identically without polymorphic fields. |
| **Existing Login Flow** | **ZERO** | `authController.login` queries email without shop context. | Login continues minting tokens for the user's default shop. Zero changes to login endpoints. |

---

## 7. Explicit Non-Scope Declarations

To maintain strict modular boundaries across the 6-phase roadmap, the following are **explicitly out of scope**:
- ❌ **No Frontend UI**: No React components, modals, dropdowns, or Redux modifications in this phase.
- ❌ **No Customer / Supplier Migration**: Customers and Suppliers remain strictly shop-scoped until Phase 2.
- ❌ **No Master Catalog / Inventory Split**: Products remain single-table per-shop until Phase 3.
- ❌ **No Org Analytics Roll-up**: Consolidated cross-shop reporting remains deferred to Phase 4.
- ❌ **No Tills / Cash Registers**: Cash registers remain deferred to Phase 5.
- ❌ **No Multi-Currency Conversions**: Every branch under an organization currently inherits the organization's base currency (`KES`).

---

## 8. Summary Checklist & Implementation Pre-Conditions

- [x] JWT claims, RS256 signing, and 2h TTL re-verified from active source files.
- [x] Schema constraints, UUID binary collations (`utf8mb4_bin`), and cascading FKs verified from migration code.
- [x] Complete absence of existing shop-creation endpoints confirmed via codebase grep.
- [x] Frontend `authSlice` single-shop bottleneck identified and mapped.
- [x] Option B (`switch-shop` token refresh) fully evaluated and justified over Options A and C.
- [x] Atomic 3-step creation transaction (`Shop` + `ShopAccess` + `SystemSettings`) designed.
- [x] Zero-regression compatibility with FINDING-01 through FINDING-12 Phase 1 established.

---

🛑 **HARD STOP**: Design document complete. Zero code, migrations, or route modifications have been made. Awaiting explicit user approval before proceeding to implementation.
