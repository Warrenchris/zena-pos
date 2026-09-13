# Zena POS — Customer & Supplier Organization Scoping Architecture Design
**Document Version**: 1.0.0  
**Phase**: FINDING-12 (Phase 2: Migrating Customers & Suppliers from Shop-Scoped to Organization-Scoped)  
**Status**: DESIGN & AUDIT PROPOSAL (Read-Only Pass — No Code, Model, Route, or Migration Mutations)  
**Target File**: `docs/architecture/CUSTOMER-SUPPLIER-ORG-SCOPE-DESIGN.md`  

---

## 1. Executive Summary & Context

Phase 1 of FINDING-12 established the platform's multi-tenant foundation: the `Organization` root entity, `Shop.organizationId` foreign key, `OrganizationMemberships`, `ShopAccess`, and the `POST /api/auth/switch-shop` session switching mechanism.

Currently, `Customers` and `Suppliers` remain siloed per physical branch (`shopId`). This creates critical operational limitations:
1. **Siloed Merchant Customers**: A loyal customer visiting Branch B (e.g. Kilimani) cannot be looked up, cannot accrue or redeem loyalty points earned at Branch A (Westlands), and must be re-registered as an entirely separate customer record.
2. **Fragmented Vendor Directory**: Common suppliers (e.g. Kenya Breweries, Farmer's Choice) must be re-entered independently at every retail branch, preventing centralized purchase tracking.
3. **Database Namespace Contradictions**: The composite unique constraint `unique_customers_shop_email` on `(shopId, email)` established in FINDING-04 prevents two customers within the *same* shop from having the same email, but allows duplicate customer records across branches of the *same* organization.

**Phase 2 Architectural Objective**: Migrate `Customer` and `Supplier` entities to **organization-level scoping** (`organizationId`), transforming them into shared master data across all branches of a tenant. Per the target architecture, POS Sales, Purchases, Invoices, Expenses, and Stock Inventory remain strictly `shopId`-scoped forever.

---

## 2. Current State Re-Verification Audit

### 2.1 Verification Fixture Cleanup Verification (Primary Database)
Before conducting any data audits, we re-verified the primary database (`zana_pos`) to confirm that all test fixtures created by the Phase 1 consumer slice verification script (`backend/scripts/verify_primary_multi_shop.js`) were completely purged:
- **Query for Test Shops**: `SELECT * FROM Shops WHERE name LIKE '%Primary Owner Shop%' OR name LIKE '%Primary Admin Shop%' OR name LIKE '%Verif Primary%'` -> **0 rows**.
- **Query for Test Organizations**: `SELECT * FROM Organizations WHERE slug LIKE '%verif-org%' OR name LIKE '%Verif Primary%'` -> **0 rows**.
- **Query for Test Users**: `SELECT * FROM Users WHERE email LIKE '%@primaryverif.com%'` -> **0 rows**.
- **Query for Test ActivityLogs**: `SELECT * FROM ActivityLogs WHERE details LIKE '%created under organization%'` -> **0 rows**.
- **Orphan Check**: Orphaned `OrganizationMemberships` = **0**; Orphaned `ShopAccess` = **0**.
- **Active Production Tenants**: Exactly 6 Shops (IDs 1, 2, 3, 4, 5, 17) and 6 Organizations (IDs 1, 2, 3, 4, 5, 6) in a pristine 1:1 baseline state.

### 2.2 Exhaustive Codebase Mapping of Customer & Supplier Queries
A complete audit across `backend/src` identified all call sites querying or mutating `Customer` and `Supplier`:

| File | Entity | Current Scoping Filter | Intended Phase 2 Scope Filter |
| :--- | :--- | :--- | :--- |
| `backend/src/controllers/customerController.js:19-30` (`getAllCustomers`) | `Customer` | `where: { active: true, shopId: req.user.shopId }` | `where: { active: true, organizationId: req.organizationId }` |
| `backend/src/controllers/customerController.js:56-58` (`getCustomerById`) | `Customer` | `where: { id, active: true, shopId }` | `where: { id, active: true, organizationId: req.organizationId }` |
| `backend/src/controllers/customerController.js:197-208` (`createCustomer`) | `Customer` | `where: { email, shopId }`, `where: { phone, shopId }` | `where: { email, organizationId }`, `where: { phone, organizationId }` |
| `backend/src/controllers/customerController.js:234-255` (`updateCustomer`) | `Customer` | `where: { id, active: true, shopId }`, duplicate check by `shopId` | `where: { id, active: true, organizationId }`, duplicate check by `organizationId` |
| `backend/src/controllers/customerController.js:274-276` (`deleteCustomer`) | `Customer` | `where: { id, active: true, shopId }` | `where: { id, active: true, organizationId }` |
| `backend/src/controllers/customerController.js:298-300` (`adjustLoyaltyPoints`) | `Customer` | `where: { id, active: true, shopId: req.user.shopId }` | `where: { id, active: true, organizationId: req.organizationId }` |
| `backend/src/controllers/customerController.js:334-352` (`getCustomerStatistics`) | `Customer` | `where: { active: true, shopId: req.user.shopId }` | `where: { active: true, organizationId: req.organizationId }` |
| `backend/src/controllers/saleController.js:526-540` (`createSaleInternal`) | `Customer` | `where: { id: resolvedCustomerId, shopId }` | `where: { id: resolvedCustomerId, organizationId: req.organizationId }` |
| `backend/src/controllers/saleController.js:542-563` (`createSaleInternal` walk-in) | `Customer` | `where: { shopId, [Op.or]: [...] }` | `where: { organizationId: req.organizationId, [Op.or]: [...] }` |
| `backend/src/controllers/saleController.js:1339` (`refundSale` void logic) | `Customer` | `where: { id: sale.customerId, shopId }` | `where: { id: sale.customerId, organizationId: req.organizationId }` |
| `backend/src/services/EnhancedSaleService.js:331-345` (`createEnhancedSale`) | `Customer` | `where: { id: resolvedCustomerId, shopId }` | `where: { id: resolvedCustomerId, organizationId: req.organizationId }` |
| `backend/src/services/EnhancedSaleService.js:347-365` (`createEnhancedSale` walk-in)| `Customer` | `where: { shopId, [Op.or]: [...] }` | `where: { organizationId: req.organizationId, [Op.or]: [...] }` |
| `backend/src/services/purchaseService.js:20` (`resolveSupplier`) | `Supplier` | `where: { id: supplierId, shopId }` | `where: { id: supplierId, organizationId: req.organizationId }` |
| `backend/src/services/purchaseService.js:27-30` (`resolveSupplier` by name) | `Supplier` | `where: { name: supplierName.trim(), shopId }` | `where: { name: supplierName.trim(), organizationId: req.organizationId }` |
| `backend/src/routes/suppliers.js:18` (`GET /api/suppliers`) | `Supplier` | `whereClause = { shopId }` | `whereClause = { organizationId: req.organizationId }` |
| `backend/src/routes/suppliers.js:54-61` (`POST /api/suppliers`) | `Supplier` | `Supplier.create({ shopId, name, ... })` | `Supplier.create({ organizationId: req.organizationId, shopId: req.shopId, ... })` |
| `backend/src/routes/suppliers.js:74-76` (`GET /api/suppliers/:id`) | `Supplier` | `where: { id: req.params.id, shopId }` | `where: { id: req.params.id, organizationId: req.organizationId }` |
| `backend/src/controllers/dashboardController.js:46-51, 78-83, 362-373` | `Customer` | `where: { shopId, createdAt }` | Keep `shopId` (measures local branch acquisition) or dual filter |
| `backend/src/controllers/analyticsController.js:552-560` | `Customer` | `where: { shopId, createdAt }` | Keep `shopId` (measures local branch acquisition) |

### 2.3 FINDING-08 (`adjustLoyaltyPoints`) Re-Verification & Threat Model
In FINDING-08, `customerController.js:298-300` had an IDOR vulnerability where loyalty points could be manipulated across shops because the query used un-scoped `Customer.findByPk(req.params.id)`. The fix added `shopId: req.user.shopId`.

**The Phase 2 Dilemma**:
- If `adjustLoyaltyPoints` remains scoped to `shopId: req.user.shopId`: A customer registered at Branch 1 who buys at Branch 2 will be rejected with `404 Customer not found` when Branch 2 staff attempts to redeem or update loyalty points.
- If `shopId` is removed without replacement: The cross-tenant IDOR re-opens immediately.
- **Architectural Resolution**: Must be scoped to `where: { id: req.params.id, active: true, organizationId: req.organizationId }`. This permits shared loyalty operations across all authorized shops of the organization while cryptographically blocking any tenant from touching another organization's customer.

### 2.4 Existing Index & Constraint Inventory
Re-verified via `SHOW INDEX FROM Customers` and `SHOW INDEX FROM Suppliers`:
- **`Customers` Table**:
  - `PRIMARY`: `id`
  - `unique_customers_shop_email` (UNIQUE): `(shopId, email)` (from FINDING-04)
  - `idx_customers_shop_createdAt` (NON-UNIQUE): `(shopId, createdAt)`
- **`Suppliers` Table**:
  - `PRIMARY`: `id`
  - `suppliers_shop_name_idx` (NON-UNIQUE): `(shopId, name)`
  - *Finding*: `Suppliers` never had a unique constraint on email or name in MySQL; uniqueness was only enforced logically in `purchaseService.js` via `name`.

### 2.5 Cross-Entity Consistency Audit (`Sale.customerId` & `Purchase.supplierId`)
We audited whether any controller, model association, or database foreign key assumes that `Sale.shopId === Customer.shopId` or `Purchase.shopId === Supplier.shopId`.
- **Database Schema**: `Sale.customerId REFERENCES Customers(id)` and `Purchase.supplierId REFERENCES Suppliers(id)` are standalone foreign keys with no compound checks against `shopId`.
- **Controller Assumption Gap**: In `saleController.js:527`, `EnhancedSaleService.js:332`, and `purchaseService.js:20`, existing lookup code executes:
  ```javascript
  const existingCustomer = await Customer.findOne({
    where: { id: resolvedCustomerId, shopId }, // <--- BREAKAGE POINT
    transaction: t
  });
  ```
  If Customer 10 was created at Shop 1, and a sale occurs at Shop 2, `where: { id: 10, shopId: 2 }` returns `null`! The sale proceeds without attributing customer points or auto-creates a duplicate customer.
  **Conclusion**: Phase 2 implementation **MUST** update these lookup filters to `organizationId`.

---

## 3. Collision Audit Results

We executed a comprehensive collision audit across all customer and supplier records in the primary database (`zana_pos`).

### 3.1 Customer Collision Audit
```sql
SELECT c.email, s.organizationId, COUNT(DISTINCT c.shopId) AS distinctShops, COUNT(*) AS duplicateCount
FROM Customers c
JOIN Shops s ON s.id = c.shopId
WHERE c.email IS NOT NULL AND c.email != ''
GROUP BY c.email, s.organizationId
HAVING COUNT(*) > 1;
```

| Metric | Result | Audit Note |
| :--- | :---: | :--- |
| **Total Customer Records** | **5** | Baseline production merchant data |
| **Distinct Non-Empty Emails** | **5** | 100% unique across the system |
| **Null / Empty Emails** | **0** | No unindexed null clusters |
| **Intra-Org Email Collisions** | **0** | Zero duplicate emails within any organization |
| **Cross-Org Shared Emails** | **0** | No cross-organization email overlap |
| **Distinct Phone Numbers** | **5** | 100% unique |
| **Intra-Org Phone Collisions** | **0** | Zero duplicate phone numbers |

### 3.2 Supplier Collision Audit
```sql
SELECT sup.name, s.organizationId, COUNT(DISTINCT sup.shopId) AS distinctShops, COUNT(*) AS duplicateCount
FROM Suppliers sup
JOIN Shops s ON s.id = sup.shopId
WHERE sup.name IS NOT NULL AND sup.name != ''
GROUP BY sup.name, s.organizationId
HAVING COUNT(*) > 1;
```

| Metric | Result | Audit Note |
| :--- | :---: | :--- |
| **Total Supplier Records** | **25** | Active vendor records |
| **Distinct Supplier Names** | **25** | All 25 supplier names are distinct |
| **Intra-Org Supplier Name Collisions** | **0** | Zero duplicate supplier names within any org |
| **Intra-Org Supplier Email Collisions** | **1** | `alice@megasupplies.co.ke` appears 8 times under Shop 1 |

*Note on Supplier Email duplicates*: The 8 records sharing `alice@megasupplies.co.ke` are distinct test supplier entities (`E2E Mega Supplies <timestamp>`) created under Shop 1. Because vendors frequently share sales representatives or generic contact emails (`sales@distributor.co.ke`), supplier email **must not** be constrained as unique. Uniqueness for suppliers is strictly governed by `(organizationId, name)`.

### 3.3 Collision Verdict & Migration Safety Recommendation
- **Verdict**: **SAFE TO MIGRATE DIRECTLY WITH ZERO REMEDIATION**.
- Zero intra-organization customer email collisions exist.
- Zero intra-organization supplier name collisions exist.
- Adding `(organizationId, email)` to `Customers` and `(organizationId, name)` to `Suppliers` will succeed cleanly without constraint violations.

---

## 4. Target Architectural Design for Phase 2

### 4.1 Schema Evolution: Column Addition & `shopId` Retention Decision

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               CUSTOMER / SUPPLIER SCHEMA EVOLUTION                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Customers:                                                                             │
│   id             INT PRIMARY KEY AUTO_INCREMENT                                        │
│   organizationId INT NOT NULL REFERENCES Organizations(id) ON DELETE CASCADE [NEW]    │
│   shopId         INT NULL REFERENCES Shops(id) ON DELETE SET NULL [RETAINED AS ORIGIN] │
│   name, email, phone, address, loyaltyPoints, totalPurchases, active, ...              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Suppliers:                                                                             │
│   id             INT PRIMARY KEY AUTO_INCREMENT                                        │
│   organizationId INT NOT NULL REFERENCES Organizations(id) ON DELETE CASCADE [NEW]    │
│   shopId         INT NULL REFERENCES Shops(id) ON DELETE SET NULL [RETAINED AS ORIGIN] │
│   name, contactPerson, email, phone, address, ...                                      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Recommendation: Retain `shopId` as a Nullable Informational Field ("Origin Branch")
**Decision**: Do **NOT** drop `shopId`. Retain `shopId` as an informational foreign key referencing `Shops(id) ON DELETE SET NULL`.

**Justification**:
1. **Acquisition Attribution & Local Provenance**: Merchants need to know which branch originally registered a customer for store-level sales commissions, marketing attribution, and regional customer density analysis.
2. **Local Dashboard & Analytics Compatibility**: Dashboard routes (`dashboardController.js:46-51`) and acquisition trend charts (`analyticsController.js:552-560`) query "new customers registered at this branch" (`where: { shopId, createdAt }`). Retaining `shopId` preserves these reports without requiring retroactive schema splits.
3. **Low Blast Radius**: Dropping `shopId` entirely would break multiple existing analytical queries, reports, and seeders. Keeping it as nullable metadata guarantees zero regressions.

### 4.2 Migration Strategy: Deterministic Set-Based SQL (`UPDATE ... JOIN`)
Unlike Phase 1's initial backfill which attempted string name-matching, Phase 2 links entities via existing, verified integer foreign keys:
- Every `Customer` and `Supplier` has `shopId INT NOT NULL REFERENCES Shops(id)`.
- Every `Shop` has `organizationId INT NOT NULL REFERENCES Organizations(id)`.

The mapping `Customer.shopId -> Shop.id -> Shop.organizationId` is a **strictly deterministic, unambiguous 1:1 foreign key traversal**. A single, set-based SQL `UPDATE ... JOIN` is 100% safe, instantaneous, and avoids memory-intensive iterative scripts.

#### Migration Pseudocode (`YYYYMMDDHHMMSS-migrate-customers-suppliers-to-organization.js`):
```javascript
// Step 1: Add nullable organizationId columns
await queryInterface.addColumn('Customers', 'organizationId', {
  type: Sequelize.INTEGER,
  allowNull: true,
  after: 'id'
});
await queryInterface.addColumn('Suppliers', 'organizationId', {
  type: Sequelize.INTEGER,
  allowNull: true,
  after: 'id'
});

// Step 2: Atomic Set-Based Backfill via Foreign Key Traversal
await queryInterface.sequelize.query(`
  UPDATE Customers c
  JOIN Shops s ON s.id = c.shopId
  SET c.organizationId = s.organizationId
`);

await queryInterface.sequelize.query(`
  UPDATE Suppliers sup
  JOIN Shops s ON s.id = sup.shopId
  SET sup.organizationId = s.organizationId
`);

// Step 3: Enforce NOT NULL and Add Foreign Key Constraints
await queryInterface.changeColumn('Customers', 'organizationId', {
  type: Sequelize.INTEGER,
  allowNull: false
});
await queryInterface.addConstraint('Customers', {
  fields: ['organizationId'],
  type: 'foreign key',
  name: 'fk_customers_organization_id',
  references: { table: 'Organizations', field: 'id' },
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

await queryInterface.changeColumn('Suppliers', 'organizationId', {
  type: Sequelize.INTEGER,
  allowNull: false
});
await queryInterface.addConstraint('Suppliers', {
  fields: ['organizationId'],
  type: 'foreign key',
  name: 'fk_suppliers_organization_id',
  references: { table: 'Organizations', field: 'id' },
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
});

// Step 4: Make shopId Nullable (Origin Branch)
await queryInterface.changeColumn('Customers', 'shopId', {
  type: Sequelize.INTEGER,
  allowNull: true
});
await queryInterface.changeColumn('Suppliers', 'shopId', {
  type: Sequelize.INTEGER,
  allowNull: true
});
```

### 4.3 Unique Constraint Restructuring (FINDING-04 Evolution)

1. **`Customers` Unique Index Evolution**:
   - Drop: `unique_customers_shop_email` on `(shopId, email)`.
   - Add: `unique_customers_org_email` on `(organizationId, email)`.
   - Add: Non-unique query index `idx_customers_org_createdAt` on `(organizationId, createdAt)`.

2. **`Suppliers` Unique Index Evolution**:
   - Drop: Non-unique `suppliers_shop_name_idx` on `(shopId, name)`.
   - Add: Unique constraint `unique_suppliers_org_name` on `(organizationId, name)`.
   - Add: Non-unique query index `idx_suppliers_org_createdAt` on `(organizationId, createdAt)`.

### 4.4 Comprehensive Controller & Service Scoping Matrix

When Phase 2 is implemented, the following controller changes must be executed:

#### 1. `backend/src/controllers/customerController.js`:
- `getAllCustomers`:
  ```javascript
  // Change whereClause from shopId to organizationId:
  const whereClause = search ? {
    [Op.and]: [
      { active: true, organizationId: req.organizationId },
      { [Op.or]: [...] }
    ]
  } : { active: true, organizationId: req.organizationId };
  ```
- `getCustomerById`:
  ```javascript
  const customer = await Customer.findOne({
    where: { id, active: true, organizationId: req.organizationId }
  });
  ```
- `createCustomer`:
  ```javascript
  // Check duplicate within organization:
  const existingEmail = await Customer.findOne({ where: { email, organizationId: req.organizationId } });
  const existingPhone = await Customer.findOne({ where: { phone, organizationId: req.organizationId } });
  // Create customer with org and origin shop:
  const customer = await Customer.create({
    name, email, phone, address, notes,
    organizationId: req.organizationId,
    shopId: req.shopId // Origin branch
  });
  ```
- `updateCustomer` & `deleteCustomer`:
  - Change lookup to `where: { id: req.params.id, active: true, organizationId: req.organizationId }`.
  - Duplicate email/phone checks in `updateCustomer` scoped to `organizationId: req.organizationId` and `id: { [Op.ne]: customer.id }`.
- `getCustomerStatistics`:
  - Returns tenant-wide totals: `Customer.count({ where: { active: true, organizationId: req.organizationId } })`.

#### 2. `backend/src/controllers/saleController.js` & `EnhancedSaleService.js`:
- During checkout customer resolution:
  ```javascript
  // Existing customer lookup:
  const existingCustomer = await Customer.findOne({
    where: { id: resolvedCustomerId, organizationId: req.organizationId },
    transaction: t
  });
  
  // Walk-in auto-creation lookup:
  let customerRecord = await Customer.findOne({
    where: {
      organizationId: req.organizationId,
      [Op.or]: [
        ...(customer.email ? [{ email: customer.email }] : []),
        ...(customer.phone ? [{ phone: customer.phone }] : []),
        { name: customer.name }
      ]
    },
    transaction: t
  });
  
  // Walk-in creation:
  if (!customerRecord) {
    customerRecord = await Customer.create({
      name: customer.name,
      email: customer.email || null,
      phone: customer.phone || null,
      location: customer.location || null,
      totalPurchases: total,
      lastVisit: new Date(),
      organizationId: req.organizationId,
      shopId: req.shopId // origin branch
    }, { transaction: t });
  }
  ```
- During sale void / refund (`saleController.js:1339`):
  ```javascript
  const customerRecord = await Customer.findOne({
    where: { id: sale.customerId, organizationId: req.organizationId },
    transaction: t
  });
  ```

#### 3. `backend/src/services/purchaseService.js`:
- `resolveSupplier`:
  ```javascript
  if (supplierId) {
    const existing = await Supplier.findOne({
      where: { id: supplierId, organizationId: req.organizationId },
      transaction
    });
    if (existing) return existing;
  }
  
  let supplier = await Supplier.findOne({
    where: { name: supplierName.trim(), organizationId: req.organizationId },
    transaction
  });
  
  if (!supplier) {
    supplier = await Supplier.create({
      organizationId: req.organizationId,
      shopId, // origin branch
      name: supplierName.trim(),
      ...
    }, { transaction });
  }
  ```

#### 4. `backend/src/routes/suppliers.js`:
- `GET /api/suppliers`: Change `whereClause = { shopId }` to `whereClause = { organizationId: req.organizationId }`.
- `POST /api/suppliers`: `Supplier.create({ organizationId: req.organizationId, shopId: req.shopId, name, ... })`.
- `GET /api/suppliers/:id`: `where: { id: req.params.id, organizationId: req.organizationId }`.

### 4.5 FINDING-08 Loyalty-Points Redesign & Cross-Tenant Security Model

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                       FINDING-08 REDESIGNED SECURITY BOUNDARY                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Operation: PATCH /api/customers/:id/loyalty-points                                     │
│ Caller: Branch 2 staff (Shop 18), Organization 4                                       │
│ Customer: Registered at Branch 1 (Shop 4), Organization 4                              │
│                                                                                        │
│ 1. Query: Customer.findOne({ id: :id, active: true, organizationId: 4 })               │
│ 2. MATCH FOUND -> Customer belongs to caller's org -> Points updated (200 OK)          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Operation: PATCH /api/customers/:id/loyalty-points                                     │
│ Caller: Attacker at Organization 5                                                     │
│ Target ID: Customer ID from Organization 4                                             │
│                                                                                        │
│ 1. Query: Customer.findOne({ id: :id, active: true, organizationId: 5 })               │
│ 2. NO MATCH -> Scoped to org 5 -> Returns 404 Not Found (IDOR BLOCKED)                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Verification Strategy for Implementation**:
1. **Legitimate Cross-Branch Test**: Customer registered at Shop 1. Staff token minted for Shop 2 (both under Org 1). Staff adjusts loyalty points by `+50`. Assert: `200 OK`, `loyaltyPoints = 50`.
2. **Cross-Tenant IDOR Attack Test**: Staff token minted for Shop 3 (under Org 2). Attacker attempts to adjust loyalty points of the Org 1 customer. Assert: `404 Not Found`, customer points unchanged in database.

### 4.6 Sale Creation & Purchase Execution Invariance
- **Sales stay shop-scoped**: `Sale.shopId`, `Sale.total`, invoice generation, line items, and payment processing are unchanged. `Sale.customerId` simply references an organization-wide customer.
- **Purchases stay shop-scoped**: `Purchase.shopId`, `PurchaseOrder.shopId`, inventory receipts, and stock increments are unchanged. `Purchase.supplierId` simply references an organization-wide vendor.
- **Zero Schema Changes to Sales / Purchases / Invoices**: Neither `Sale` nor `Purchase` receives `organizationId` in this phase.

### 4.7 Access Control & Authorization Governance
- **Access Rule**: Any authenticated user with an active `OrganizationMembership` (verified by `auth` middleware, which sets `req.organizationId`) possesses operational clearance to read and reference the organization's shared Customers and Suppliers.
- **No `ShopAccess` Requirement**: Customers and Suppliers are enterprise-level master directories, not physical branch resources. Restricting customer read access by branch would defeat the purpose of multi-branch customer loyalty.
- **RBAC Enforcement**: Existing route-level role checks remain intact (`checkRole(['admin', 'manager', 'cashier'])` for reading/registering customers; `checkRole(['admin', 'manager'])` for deleting or adjusting loyalty points).

---

## 5. Explicit Non-Scope Declarations

To maintain strict modular boundaries across the 6-phase roadmap, the following are **strictly out of scope**:
- ❌ **No Changes to POS Sales, Invoices, Expenses, or Payments**: Sales remain shop-scoped forever.
- ❌ **No Changes to Purchases or Purchase Orders Scoping**: Purchases remain shop-scoped forever.
- ❌ **No Changes to Inventory or Stock Quantities**: Stock movements and product stock remain branch-scoped.
- ❌ **No Master Catalog / Inventory Split**: Products remain single-table per shop until Phase 3.
- ❌ **No AI Roll-up Analytics**: Cross-shop roll-up analytics deferred to Phase 4.
- ❌ **No Tills / Cash Registers**: Cash registers deferred to Phase 5.
- ❌ **No Frontend UI Modifications**: No React components or Redux changes in this phase.

---

## 6. Risk Analysis & Compatibility Matrix

| System Layer | Risk Level | Interaction Analysis | Safeguard / Invariant |
| :--- | :---: | :--- | :--- |
| **FINDING-08 (IDOR Loyalty Fix)** | **HIGH** | Redesigning loyalty points lookup from `shopId` to `organizationId`. If done carelessly, could re-open cross-tenant IDOR. | Explicit `organizationId: req.organizationId` enforcement derived from verified RS256 token. Verified by mandatory negative cross-tenant automated test. |
| **FINDING-04 (Composite Indexes)** | **MEDIUM** | `unique_customers_shop_email` `(shopId, email)` is replaced by `unique_customers_org_email` `(organizationId, email)`. | Idempotent drop and create helper matching FINDING-04 migration. Zero collisions confirmed in audit. |
| **FINDING-11 (Catalog Cache)** | **ZERO** | `productCache.js` keys on `products:shop:${shopId}`. No customer or supplier Redis keys exist. | Confirmed via service grep: zero Redis customer/supplier cache keys exist. Zero invalidation risk. |
| **Cross-Shop Sale Attribution** | **LOW** | Sale at Shop B referencing Customer created at Shop A. | Lookup in `saleController.js` and `EnhancedSaleService.js` updated to `organizationId`. `Sale.customerId` links cleanly. |
| **Phase 1 Consumer Slice** | **ZERO** | `POST /api/shop` and `POST /api/auth/switch-shop`. | Switched JWT contains `req.organizationId`. Switching branches does not lose customer or supplier clearance. |

---

## 7. Step-by-Step Implementation & Verification Pre-Conditions

When approved to proceed to implementation, the phase will follow this sequential execution plan:
1. **Step 1: Database Migration**:
   - Run idempotent migration adding `organizationId` to `Customers` and `Suppliers`.
   - Execute deterministic set-based backfill via `Shops` foreign key.
   - Restructure composite unique constraints (`(organizationId, email)` and `(organizationId, name)`).
2. **Step 2: Model Updates**:
   - Update `backend/src/models/Customer.js`: add `organizationId`, update unique index definition.
   - Update `backend/src/models/Supplier.js`: add `organizationId`, update unique index definition.
   - Update `backend/src/models/index.js`: establish `Organization.hasMany(Customer)`, `Customer.belongsTo(Organization)`, `Organization.hasMany(Supplier)`, `Supplier.belongsTo(Organization)`.
3. **Step 3: Controller & Service Updates**:
   - Update `customerController.js` (all 7 methods).
   - Update `saleController.js` & `EnhancedSaleService.js` (customer resolution & walk-in creation).
   - Update `routes/suppliers.js` & `purchaseService.js` (supplier resolution).
4. **Step 4: Automated Verification Suite**:
   - Cross-branch customer creation and lookup test.
   - FINDING-08 loyalty adjustment verification test (both positive cross-branch and negative cross-tenant IDOR).
   - Cross-branch supplier sharing and purchase order creation test.
   - Full regression run of all 16 Jest suites on `zana_pos_test` and `zana_pos`.

---

🛑 **HARD STOP**: Design document complete at [`docs/architecture/CUSTOMER-SUPPLIER-ORG-SCOPE-DESIGN.md`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/architecture/CUSTOMER-SUPPLIER-ORG-SCOPE-DESIGN.md). Zero code, migrations, or route modifications have been made. Awaiting explicit user approval before proceeding to implementation.
