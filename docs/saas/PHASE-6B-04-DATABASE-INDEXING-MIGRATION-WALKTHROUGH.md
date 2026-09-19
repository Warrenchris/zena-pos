# PHASE 6B-04: DATABASE INDEXING, QUERY PERFORMANCE & MIGRATION HYGIENE WALKTHROUGH

## 1. Executive Summary

Phase 6B-04 was implemented as part of the Zana POS production hardening program. This phase addressed database query bottlenecks, index redundancy, unbounded data access, catalog cache memory pressure, and migration directory hygiene without introducing breaking changes or degrading multi-tenant isolation.

Key achievements:
- **Missing High-Value Indexes (`INDX-01-A`, `INDX-01-B`, `INDX-02`, `INDX-03`, `INDX-04`)**: Added composite and relationship indexes covering tenant filtering + reverse-chronological pagination.
- **Redundant Duplicate Index Removal (`DUP-01`, `DUP-02`, `DUP-03`, `DUP-04`)**: Cleaned 5 duplicate/redundant indexes on `SaleItems`, `Invoices`, `PendingPayments`, and `Products`, reducing write amplification.
- **Bounded Pagination (`PAGE-01`)**: Eliminated unbounded query in `saleController.getAllReturns`. Default limit 50, capped at 100, with HTTP headers (`X-Total-Count`, `X-Page`, `X-Limit`, `X-Total-Pages`) preserving frontend array compatibility and supporting optional `?format=paginated`.
- **Product Cache-Miss Memory Protection (`PAGE-02`)**: Eliminated `findAll` + `slice()` pattern that loaded entire organization catalogs into Node.js heap memory on Redis cache misses. Replaced with database-level `LIMIT` / `OFFSET` and per-page Redis caching.
- **Sales Listing Evaluation (`N1-01`)**: Evaluated `Sale.findAndCountAll`. Verified that covering indexes (`idx_sales_shop_createdAt`, `unique_sales_shop_invoice_number`) already optimize pagination. Left ORM associations intact to prevent frontend contract regressions.
- **Migration Hygiene (`MIGR-01`)**: Safely moved all 17 `.bak` files from `backend/migrations/` to `backend/migrations/archive/`. Active migration directory now contains strictly valid, executable `.js` migrations (90 UP, 0 pending).
- **Targeted Integration Tests**: Created `backend/tests/phase6bDatabaseOptimization.test.js` (17 tests covering index presence, duplicate removal, empirical MySQL EXPLAIN query plans, and pagination).
- **Full Regression**: 16/16 test suites, **201/201 tests passing** (184 baseline + 17 Phase 6B-04 tests).
- **Frontend Build**: `tsc && vite build` passed with 0 errors.

---

## 2. Before: Index State & Bottlenecks

Prior to Phase 6B-04, empirical database inspection and query analysis revealed:

1. **`Employees.shopId` Unindexed**: Query pattern `WHERE shopId = ? ORDER BY createdAt DESC` forced a full table scan (`type: ALL`) with temporary table and filesort.
2. **`SaleRefunds.shopId` Unindexed**: Query pattern `WHERE shopId = ? ORDER BY createdAt DESC` performed a full table scan with filesort.
3. **`Invoices` Missing Reverse Date Composite**: `Invoices(shopId)` existed, but `WHERE shopId = ? ORDER BY createdAt DESC` required a filesort pass.
4. **`StockMovements` Missing Reverse Date Composite**: `StockMovements(organizationId)` existed, but sorting by `createdAt DESC` triggered filesort.
5. **`SaleRefunds.productId` Unindexed**: Foreign key filtering by product had no dedicated index.
6. **Redundant Duplicate Indexes**:
   - `SaleItems`: `idx_saleItems_productId` duplicated `idx_sale_items_product_id`.
   - `SaleItems`: `idx_saleItems_saleId` duplicated `idx_sale_items_sale_id`.
   - `Invoices`: `invoices_employee_id` duplicated `idx_invoices_employee_id`.
   - `PendingPayments`: `pending_payments_checkout_request_id` (non-unique) duplicated `checkoutRequestId` (unique).
   - `Products`: `idx_products_shop_stockQuantity` duplicated `idx_products_shop_id` (since `stockQuantity` was removed from Products during the multi-shop inventory separation).
7. **Unbounded Endpoint**: `GET /api/sales/returns/all` retrieved all returns for a shop without `LIMIT`/`OFFSET`.
8. **Memory Pressure on Cache Miss**: `GET /api/products` loaded all products across the organization into Node.js heap memory before performing `.slice(offset, offset + limit)`.
9. **Migration Clutter**: 17 non-executable `.bak` files resided in `backend/migrations/`.

---

## 3. After: Final Index State

All schema updates were applied through a reversible, forward-only migration.

### Added Indexes
| Table | Index Name | Columns | Purpose |
|---|---|---|---|
| `Employees` | `idx_employees_shop_createdAt` | `(shopId, createdAt)` | Eliminates table scan & filesort for staff listings |
| `SaleRefunds` | `idx_sale_refunds_shop_createdAt` | `(shopId, createdAt)` | Eliminates table scan & filesort for refunds/returns |
| `Invoices` | `idx_invoices_shop_createdAt` | `(shopId, createdAt)` | Eliminates filesort for invoice pagination |
| `StockMovements` | `idx_stockmovements_org_createdAt` | `(organizationId, createdAt)` | Eliminates filesort for stock movement logs |
| `SaleRefunds` | `idx_sale_refunds_product_id` | `(productId)` | Optimizes product refund tracking and inventory reconciliation |

### Removed Duplicate / Obsolete Indexes
| Table | Removed Index | Retained Index | Reason |
|---|---|---|---|
| `SaleItems` | `idx_saleItems_productId` | `idx_sale_items_product_id` | Identical column `(productId)` |
| `SaleItems` | `idx_saleItems_saleId` | `idx_sale_items_sale_id` | Identical column `(saleId)` |
| `Invoices` | `invoices_employee_id` | `idx_invoices_employee_id` | Identical column `(employeeId)` |
| `PendingPayments` | `pending_payments_checkout_request_id` | `checkoutRequestId` (UNIQUE) | Unique index already provides complete lookup coverage |
| `Products` | `idx_products_shop_stockQuantity` | `idx_products_shop_id` | `stockQuantity` dropped in Phase 4; left single-column `(shopId)` duplicate |

---

## 4. Migrations

New forward-only migration executed:
- **File**: `backend/migrations/20260919000000-phase6b-04-database-indexing-remediation.js`
- **Direction**: `up` applied successfully; `down` method supports full rollback.
- **Current Migration Status**: 90 UP, 0 pending.

Sequelize models synchronized:
- `backend/src/models/Employee.js`: Added `idx_employees_shop_createdAt`.
- `backend/src/models/SaleRefund.js`: Added `idx_sale_refunds_shop_createdAt` and `idx_sale_refunds_product_id`.
- `backend/src/models/Invoice.js`: Added `idx_invoices_shop_createdAt`.
- `backend/src/models/StockMovement.js`: Added `idx_stockmovements_org_createdAt`.

---

## 5. Query Improvements & EXPLAIN Results

Empirical verification executed against MySQL 8.4:

### 1. Employees Listing
- **Query**: `SELECT * FROM Employees WHERE shopId = 1 ORDER BY createdAt DESC LIMIT 20`
- **Before**: `type: ALL`, `possible_keys: NULL`, `Extra: Using where; Using filesort`
- **After**: `type: ref`, `key: idx_employees_shop_createdAt`, `Extra: Backward index scan` (0 filesort, index-driven lookup).

### 2. SaleRefunds Listing
- **Query**: `SELECT * FROM SaleRefunds WHERE shopId = 1 ORDER BY createdAt DESC LIMIT 20`
- **Before**: `type: ALL`, `possible_keys: NULL`, `Extra: Using where; Using filesort`
- **After**: `type: ref`, `key: idx_sale_refunds_shop_createdAt`, `Extra: Backward index scan` (0 filesort, index-driven lookup).

### 3. Invoices Reverse Chronological Listing
- **Query**: `SELECT * FROM Invoices WHERE shopId = 1 ORDER BY createdAt DESC LIMIT 20`
- **Before**: `type: ref`, `key: idx_invoices_shop_id`, `Extra: Using index condition; Using filesort`
- **After**: `type: ref`, `key: idx_invoices_shop_createdAt`, `Extra: Backward index scan` (0 filesort).

### 4. StockMovements Organization Audit
- **Query**: `SELECT * FROM StockMovements WHERE organizationId = 1 ORDER BY createdAt DESC LIMIT 50`
- **Before**: `type: ref`, `key: idx_stockmovements_org`, `Extra: Using index condition; Using filesort`
- **After**: `type: ref`, `key: idx_stockmovements_org_createdAt`, `Extra: Backward index scan` (0 filesort).

### 5. SaleRefunds Product Lookup
- **Query**: `SELECT * FROM SaleRefunds WHERE productId = 1`
- **After**: `type: ref`, `key: idx_sale_refunds_product_id`.

---

## 6. Pagination Optimizations (`PAGE-01` & `PAGE-02`)

### PAGE-01: Bounded `SaleRefund` Listing (`saleController.getAllReturns`)
- **Issue**: Unbounded query fetched all records in memory without upper limits.
- **Remediation**:
  - Implemented sanitized integer bounds: `page` (default 1, min 1), `limit` (default 50, min 1, max 100).
  - Calculated SQL `offset = (page - 1) * limit`.
  - Used `SaleRefund.findAndCountAll` with `limit` and `offset`.
  - Preserved the existing frontend API contract: returns JSON array `formattedRefunds` by default (`SalesReturns.jsx` checks `Array.isArray(res.data)`).
  - Emitted pagination metadata in response headers: `X-Total-Count`, `X-Page`, `X-Limit`, `X-Total-Pages`.
  - Supported optional `?format=paginated` envelope `{ data, pagination: { total, page, limit, totalPages } }`.

### PAGE-02: Product Catalog Cache-Miss Memory Protection (`productController.getAllProducts`)
- **Issue**: On Redis cache miss, `getAllProducts` performed `Product.findAndCountAll` across the whole organization/shop without pagination, converted all rows into JSON, and ran `.slice(offset, offset + pageSize)`. For organizations with thousands of SKUs, this created major Node.js heap pressure.
- **Remediation**:
  - Replaced unbounded query with database-level pagination: `limit: numericPageSize`, `offset`.
  - Cached the paginated result in Redis under `products:shop:${shopId}:p:${numericPage}:s:${numericPageSize}` with 300s TTL.
  - Updated `productCache.invalidateShopProductCache(shopId)` to delete base cache and scan/delete all page-level keys (`products:shop:${shopId}:*`).
  - Preserved response structure `{ products, searchType: 'exact', pagination }` exactly.

---

## 7. Sales Query Evaluation (`N1-01`)

- Investigated `Sale.findAndCountAll` in `saleController.getAllSales`.
- Query plan inspection revealed:
  - MySQL uses `idx_sales_shop_createdAt` with `Backward index scan; Using index condition`.
  - Count query uses `unique_sales_shop_invoice_number` (`Using index`).
  - Eager-loaded associations (`Customer`, `Employee`, `User`, `SaleItem`, `SalePayment`) are strictly required by the sales list UI and reports.
- Conclusion: Rewriting Sequelize associations into separate queries would introduce N+1 query patterns or risk breaking client serialization without meaningful execution plan improvements. The existing query is well-indexed. Left unchanged per Section 14 instructions.

---

## 8. Migration Hygiene (`MIGR-01`)

- Identified 17 `.bak` files under `backend/migrations/` (backup artifacts from historical maintenance).
- Verified that all 17 files had either active counterparts already executed or were one-off migration scripts that are no longer part of the Sequelize migration sequence.
- Safely relocated all 17 files to `backend/migrations/archive/` via `git mv`:
  - `backend/migrations/archive/20251027000000-fix-product-id-type.js.bak`
  - `backend/migrations/archive/20251027000001-add-shopid-to-saleitems.js.bak`
  - `backend/migrations/archive/add-product-id-v2.js.bak`
  - `backend/migrations/archive/add-product-id.js.bak`
  - `backend/migrations/archive/cleanup-and-fix-data.js.bak`
  - `backend/migrations/archive/cleanup-columns.js.bak`
  - `backend/migrations/archive/fix-product-id.js.bak`
  - `backend/migrations/archive/inspect-database.js.bak`
  - `backend/migrations/archive/inspect-products.js.bak`
  - `backend/migrations/archive/inspect-table.js.bak`
  - `backend/migrations/archive/run-invoices-migration.js.bak`
  - `backend/migrations/archive/run-migration-direct.js.bak`
  - `backend/migrations/archive/run-migration.js.bak`
  - `backend/migrations/archive/run-product-id-fix.js.bak`
  - `backend/migrations/archive/run-saleitems-migration.js.bak`
  - `backend/migrations/archive/run-uuid-fix.js.bak`
  - `backend/migrations/archive/run-weight-grams.js.bak`
- Active `backend/migrations/` directory now strictly contains only valid, executable `.js` migration files.

---

## 9. Verification & Test Results

### Targeted Test Suite
- **File**: `backend/tests/phase6bDatabaseOptimization.test.js`
- **Result**: **17 passed, 17 total (100%)**
  - Index schema existence (5 tests)
  - Duplicate index removal (4 tests)
  - EXPLAIN query plan validation (4 tests)
  - Bounded pagination & cache-miss behavior (4 tests)

### Full Backend Regression Suite
- **Command**:
  ```bash
  npx jest tests/phase6bDatabaseOptimization.test.js tests/phase6bPosIdempotency.test.js tests/phase6bAuthSessionSecurity.test.js tests/phase6bPaymentSecurity.test.js tests/phase6aReleaseBlockers.test.js tests/phase5SubscriptionLifecycle.test.js tests/billingEndpoints.test.js tests/billingRenewal.test.js tests/subphase6c.test.js tests/phase4ProductInventorySecurity.test.js tests/phase4TransferIdempotency.test.js tests/phase3UserTenantSecurity.test.js tests/phase1.test.js tests/phase2.test.js tests/mpesaSecurity.test.js tests/item1-token-purpose.test.js --runInBand --forceExit
  ```
- **Result**: **16 test suites passed, 201 tests passed (100%)**
- **Test Baseline**: 184/184 baseline tests maintained + 17 Phase 6B-04 tests = **201/201 PASS**.

### Frontend Production Build
- **Command**: `npm run build` (`tsc && vite build`)
- **Result**: **PASS (0 errors, 2569 modules transformed)**

### Database Status
- **Active Migrations**: 90 UP
- **Pending Migrations**: 0

---

## 10. Remaining Findings & Out-of-Scope Items

Per the Phase 6B-04 boundary instructions, the following items remain strictly out of scope and untouched:
- **`INDX-05` (`Invoices.saleId` and `Invoices.userId`)**: Code inspection showed neither column is queried, filtered, or joined in production paths. Speculative indexing was avoided.
- **Phase 6B-05**: ORAC-01 ID-oracle normalization.
- **Phase 6B-06**: AI hardening, rate limiting, and observability.
