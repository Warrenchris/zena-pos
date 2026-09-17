# Zana POS — Phase 4 Implementation Plan: Multi-Branch Product & SKU Integrity

**Date:** September 17, 2026  
**Repository:** `https://github.com/Warrenchris/zena-pos.git`  
**Phase:** Phase 4 Remediation (Planning Stage — Awaiting Approval)  
**Author:** Senior Backend & Security Engineering Agent  
**Status:** Plan Complete — Awaiting User Approval to Begin Step 2 (Remediation).

---

## 1. Executive Summary & Proposed Remediation Sequence

Based on the verified findings in [PHASE-4-CURRENT-STATE-AUDIT.md](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/saas/PHASE-4-CURRENT-STATE-AUDIT.md), Phase 4 addresses critical multi-branch catalog and inventory integrity gaps:
1. **P0-01 / ISO-02:** SKU generation counts by `shopId` instead of `organizationId`, colliding with `unique_products_org_sku`.
2. **P0-02:** Unserialized, non-atomic SKU generation races under concurrent creation.
3. **P0-03:** Global unique index on `Categories(name)` blocks multi-tenancy and causes cross-tenant collision.
4. **P1-01:** Categories lack `organizationId`, preventing cross-branch catalog sharing.
5. **P1-02:** Stock Transfers are entirely missing in backend (frontend only mocks in state).
6. **P1-03:** Product creation/update does not validate category tenant ownership.
7. **P2-01:** `ManageStock.jsx` updates stock via `PUT /api/products/:id` rather than the locked `PATCH /api/products/:id/stock`.
8. **P2-02:** `StockMovements` drops cashier employee identity (`userId: null` for employees).

---

## 2. Migration Safety & DDL Specification

### Migration Required: **YES**

| Change | Affected Table | Current State | Target State | Risk / Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **Drop Global Category Name Index** | `Categories` | `UNIQUE KEY Categories_name_unique (name)` | Dropped. Replaced by `UNIQUE (organizationId, name)` | **Zero risk.** Dropping a too-broad global constraint allows valid multi-tenant category names. |
| **Add `organizationId` to Categories** | `Categories` | Only has `shopId` | Add `organizationId INTEGER NOT NULL REFERENCES Organizations(id)` | **Low risk.** Backfilled deterministically via `Shops.organizationId`: `UPDATE Categories c JOIN Shops s ON s.id = c.shopId SET c.organizationId = s.organizationId`. |
| **Add `employeeId` to StockMovements** | `StockMovements` | Only has `userId INT REFERENCES Users(id)` | Add `employeeId CHAR(36) NULL REFERENCES Employees(id)` | **Zero risk.** Non-breaking nullable addition. Allows cashier sales and adjustments to record employee identity. |
| **Add `organizationId` to StockMovements** | `StockMovements` | Only has `shopId INT REFERENCES Shops(id)` | Add `organizationId INTEGER NULL REFERENCES Organizations(id)` | **Low risk.** Backfilled via `Shops.organizationId`. Enables direct tenant filtering on movements. |

### Rollback Strategy
Each migration step is strictly reversible with down migrations that restore previous nullable/foreign key states.

---

## 3. Step-by-Step Remediation Plan

### Step 1: Migration — Category Multi-Tenancy & Index Hardening
* **Action:** Create migration `YYYYMMDDHHMMSS-harden-categories-and-stock-movements.js`:
  1. Add nullable `organizationId` to `Categories`.
  2. Set-based backfill: `UPDATE Categories c JOIN Shops s ON s.id = c.shopId SET c.organizationId = s.organizationId`.
  3. Alter `Categories.organizationId` to `NOT NULL` with FK `fk_categories_organization_id`.
  4. Drop unique index `Categories_name_unique`.
  5. Add unique index `unique_categories_org_name (organizationId, name)`.
  6. Add nullable `employeeId CHAR(36) NULL` to `StockMovements` with FK referencing `Employees(id)`.
  7. Add nullable `organizationId INT NULL` to `StockMovements` with FK referencing `Organizations(id)`.
  8. Backfill `StockMovements.organizationId` from `Shops.organizationId`.
* **Models Updated:** `models/Category.js`, `models/StockMovement.js`, `models/index.js`.

### Step 2: SKU Generation & Concurrency Hardening
* **Files:** `backend/src/controllers/productController.js`, `backend/src/utils/skuGenerator.js`
* **Action:**
  1. Update SKU count query from `where: { shopId }` to `where: { organizationId }`.
  2. In `createProduct`, execute SKU auto-generation with a retry loop (up to 3 attempts with random sequence salt) if a `SequelizeUniqueConstraintError` occurs on `unique_products_org_sku`.
  3. Enforce category ownership validation: verify `Category.findOne({ where: { id: categoryId, organizationId } })` before saving. Reject foreign categories with `400 Invalid category for organization`.

### Step 3: Category Controller & Route Scoping
* **Files:** `backend/src/controllers/categoryController.js`
* **Action:**
  1. Update `getAllCategories` to query by `organizationId`:
     `where: { active: true, organizationId }`
     This allows all branches in a tenant to share the organization's master product categories.
  2. In `createCategory`, assign `organizationId` from `req.organizationId || req.user.organizationId`.
  3. Handle `unique_categories_org_name` constraint conflicts cleanly with `400 Category already exists in your organization`.

### Step 4: Stock Movement Audit Trail Hardening
* **Files:** `backend/src/controllers/saleController.js`, `backend/src/services/purchaseService.js`, `backend/src/controllers/productController.js`
* **Action:**
  1. When logging `StockMovement` in `createSaleInternal`, pass:
     `employeeId: user?.isEmployee ? user.id : null`, `userId: !user?.isEmployee ? user.id : null`, and `organizationId`.
  2. When logging `StockMovement` in `updateStock`, pass `employeeId` or `userId` and `organizationId`.
  3. When logging `StockMovement` in `purchaseService.receiveItems`, pass `employeeId` or `userId` and `organizationId`.

### Step 5: Backend Stock Transfer Service & API
* **Files:** `backend/src/services/stockTransferService.js` [NEW], `backend/src/controllers/transferController.js` [NEW], `backend/src/routes/transfers.js` [NEW]
* **Action:**
  1. Implement `POST /api/transfers`:
     - Input: `{ sourceShopId, destinationShopId, productId, quantity, notes }`.
     - Validates: Both `sourceShopId` and `destinationShopId` belong to the same `organizationId`.
     - Validates: `sourceShopId !== destinationShopId`.
     - Validates: Actor has access to administer the transfer.
  2. In an atomic MySQL transaction:
     - Lock source `Inventory` row (`t.LOCK.UPDATE`).
     - Lock/provision destination `Inventory` row (`t.LOCK.UPDATE`).
     - Check: `sourceInventory.stockQuantity >= quantity` (reject with 409 if insufficient).
     - Decrement source `Inventory.stockQuantity`.
     - Increment destination `Inventory.stockQuantity`.
     - Create paired `StockMovement` records:
       - Source: `type: 'TRANSFER'`, `quantity: -quantity`, `notes: 'Transferred to Branch B'`.
       - Destination: `type: 'TRANSFER'`, `quantity: +quantity`, `notes: 'Received from Branch A'`.
  3. Invalidate Redis caches for both source and destination shops.
  4. Wire `frontend/src/pages/StockTransfer.jsx` to call `POST /api/transfers` and `GET /api/transfers`.

### Step 6: Frontend Stock Adjustment Alignment
* **Files:** `frontend/src/pages/ManageStock.jsx`
* **Action:**
  1. In `handleSaveStockAdjustment`, change API call from `PUT /api/products/:id` to `PATCH /api/products/:id/stock` with `{ quantity: delta }`.
  2. Calculate `delta` based on adjustment type (`ADD`: `+qty`, `REMOVE`: `-qty`, `SET`: `qty - currentStock`).
  3. This ensures every manual stock adjustment locks the row and generates a tracked `StockMovement`.

### Step 7: Comprehensive Security & Integrity Test Suite
* **Files:** `backend/tests/phase4ProductInventorySecurity.test.js` [NEW]
* **Test Coverage:**
  1. Multi-branch product creation below quota and SKU collision resistance.
  2. Concurrent SKU generation without duplicate key errors.
  3. Cross-tenant category independence (same category name in Tenant A and Tenant B both succeed).
  4. Cross-tenant category assignment rejection (Tenant A cannot use Tenant B category).
  5. Multi-branch category visibility (Branch B sees categories created by Branch A).
  6. Inter-branch stock isolation (sale in Branch A affects only Branch A inventory).
  7. Atomic stock transfer between branches under same tenant (debit source, credit dest, verify paired movements).
  8. Cross-tenant stock transfer rejection (`403 FORBIDDEN`).
  9. Stock transfer insufficient quantity rejection (`409 CONFLICT`).
  10. Employee attribution on `StockMovements` (`employeeId` populated).

### Step 8: Full Regression Suite Verification
* **Commands to Run:**
  - `npx jest backend/tests/phase4ProductInventorySecurity.test.js --runInBand`
  - `npx jest backend/tests/phase3UserTenantSecurity.test.js --runInBand`
  - `npx jest backend/tests/subphase6c.test.js --runInBand`
  - `npx jest backend/tests/billingRenewal.test.js --runInBand`
  - `npx jest backend/tests/controllers/multiTenantIsolation.test.js --runInBand`
  - `npm --prefix frontend run build`

---

## 4. Phase 4 Step 1 Hard Stop

Execution has stopped at the end of Step 1 (Current-State Audit & Implementation Plan).  
**No remediation will begin without explicit human approval.**
