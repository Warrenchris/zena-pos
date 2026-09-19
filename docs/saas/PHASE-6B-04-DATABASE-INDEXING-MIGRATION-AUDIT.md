# Phase 6B-04 Database Indexing, Query Performance & Migration Hygiene Audit

---

## 1. Audit Metadata

- **Date**: September 19, 2026
- **Auditor**: Autonomous Senior Database Engineering Agent (Antigravity)
- **Repository**: `https://github.com/Warrenchris/zena-pos.git`
- **Branch**: `master`
- **HEAD Commit**: `c195dec` (*feat(pos): implement client idempotency keys and server-side deduplication (POS-01)*)
- **Working Tree State**: Clean (`nothing to commit, working tree clean`)
- **Database Name**: `zana_pos`
- **Database Engine**: MySQL 8.4.7 (MySQL 8.4 LTS Server)
- **Node.js**: v24.11.1
- **Sequelize ORM Version**: 6.37.7
- **Sequelize CLI Version**: 6.6.5
- **Operating Mode**: STRICT READ-ONLY AUDIT (0 application modifications, 0 migrations run, 0 indexes added/dropped, 0 files deleted)

---

## 2. Executive Summary

During Phase 6B-04, an exhaustive read-only performance, indexing, and migration audit was conducted across the Zana POS multi-tenant SaaS architecture.

The audit analyzed:
- 39 database tables in the `zana_pos` schema
- 197 index column definitions and 77 foreign key constraints
- All 89 active migration files in comparison with the database `SequelizeMeta` table
- All 17 `.bak` files present in the `backend/migrations/` directory
- High-frequency POS, reporting, and multi-tenant Sequelize query paths
- MySQL 8.4 execution plans via `EXPLAIN` and `EXPLAIN ANALYZE`
- 184 backend test cases (15 suites) and the frontend production build pipeline

### Key Audit Findings:
1. **`INDX-01` Partially Confirmed with High Priority**:
   - `Employees.shopId`: **CONFIRMED MISSING**. The `Employees` table has **NO index on `shopId`**. Queries filtering by `shopId` (e.g. `getAllEmployees`, staff listings) degrade to **full table scans and filesorts** (`ALL`, `Using where; Using filesort`).
   - `SaleRefunds.shopId`: **CONFIRMED MISSING**. The `SaleRefunds` table has **NO index on `shopId`**. Queries filtering by `shopId` (e.g. `getAllReturns`, customer return history) degrade to **full table scans and filesorts**.
   - `Users.shopId`: **CONFIRMED MISSING IN MYSQL**, but evaluated as **P3 / Low Impact**. With the introduction of multi-tenant `OrganizationMemberships` and `ShopAccess`, `Users` represents organization-level owners/admins with near-zero shop cardinality; however, endpoints filtering legacy `shopId` execute full table scans.
2. **Additional Critical Missing Indexes Discovered**:
   - `Invoices`: Lacks a composite index on `(shopId, createdAt)`. Invoice listing queries (`ORDER BY createdAt DESC`) execute filesorts despite filtering by `shopId`.
   - `SaleRefunds`: Lacks an index on `productId` and `(shopId, createdAt)`.
   - `Invoices`: Lacks an index on `saleId` and `userId`.
3. **Severe Index Duplication & Redundancy**:
   - `SaleItems`: Contains exact duplicate indexes on both `productId` (`idx_sale_items_product_id` and `idx_saleItems_productId`) and `saleId` (`idx_sale_items_sale_id` and `idx_saleItems_saleId`).
   - `Invoices`: Contains exact duplicate indexes on `employeeId` (`idx_invoices_employee_id` and `invoices_employee_id`).
   - `PendingPayments`: Contains duplicate unique and non-unique indexes on `checkoutRequestId`.
   - `Products`: `idx_products_shop_stockQuantity` indexes only `shopId` (due to stockQuantity being migrated to `Inventory`), duplicating `idx_products_shop_id`.
4. **`MIGR-01` Confirmed as Repository Technical Debt**:
   - Exactly 17 `.bak` files were confirmed in `backend/migrations/`.
   - All 17 are tracked by Git.
   - Sequelize CLI ignores `.bak` files; hence, production migrations and runtime execution are unaffected.
   - 2 files are draft backups of historical migrations; 15 files are obsolete manual scripts written in late 2025.
5. **Regression Baseline**:
   - **184 / 184 backend tests PASS** (0 failures).
   - **Frontend build PASSES** with 0 errors (`tsc && vite build`).
   - **89 / 89 migrations UP** in `SequelizeMeta` (0 pending).

---

## 3. Previous Findings Revalidated

### 3.1 INDX-01 Revalidation

| Candidate | Claimed Issue | Actual MySQL State | Codebase Access Pattern | Severity | Assessment |
|---|---|---|---|---|---|
| `Employees.shopId` | Missing index on `shopId` | **No index exists**. Table only has `PRIMARY KEY (id)` and `UNIQUE KEY (email)`. No FK constraint in MySQL. | `Employee.findAll({ where: { shopId }, order: [['createdAt', 'DESC']] })` in `employeeController.getAllEmployees`, `userController.list`. | **P1** | **CONFIRMED**. Real full table scan and filesort on high-frequency staff routes. Requires `INDEX idx_employees_shop_createdAt (shopId, createdAt)`. |
| `SaleRefunds.shopId` | Missing index on `shopId` | **No index exists**. Indexes present: `PRIMARY KEY (id)`, `processedBy`, `saleId`, `status`. | `SaleRefund.findAll({ where: { shopId }, order: [['createdAt', 'DESC']] })` in `saleController.getAllReturns`. | **P1** | **CONFIRMED**. High-growth table. Full table scan and filesort on every returns view. Requires `INDEX idx_sale_refunds_shop_createdAt (shopId, createdAt)`. |
| `Users.shopId` | Missing index on `shopId` | **No index exists**. Table only has `PRIMARY KEY (id)` and `UNIQUE KEY (email)`. | `User.findAll({ where: { shopId } })` in `userController.list`, `employeeController.getAllEmployees`. | **P3** | **PARTIALLY CONFIRMED**. Index is technically missing, but `Users` table has very low row count (1-3 owners per org), as store staff are in `Employees`. Low cardinality impact. |

### 3.2 MIGR-01 Revalidation

- **Finding**: 17 `.bak` migration scripts in `backend/migrations/`.
- **Status**: **CONFIRMED**.
- **Investigation**:
  - Exactly 17 files with `.bak` extension exist in `backend/migrations/`.
  - All 17 files are actively tracked in Git (`git ls-files` returned all 17).
  - Sequelize CLI filters by `.js` extension, so `sequelize db:migrate` never executes them.
  - They pose zero runtime failure risk, but represent significant clutter, confusion, and violation of migration repository hygiene.

---

## 4. Current Database Architecture

- **Schema Name**: `zana_pos`
- **Total Tables**: 39
- **Character Set / Collation**: `utf8mb4` / `utf8mb4_unicode_ci`
- **Storage Engine**: `InnoDB` for all transactional tables
- **Multi-Tenancy Model**:
  - Two-tier scoping: `Organizations` (tenant top-level) -> `Shops` (store branches).
  - Cross-cutting tenant tables: `OrganizationMemberships` and `ShopAccess` manage RBAC and permissions.
  - Business entities (`Sales`, `Products`, `Inventory`, `Customers`, `Invoices`, `Expenses`) carry `shopId` and/or `organizationId`.

---

## 5. Full Index Inventory

### Table Index Matrix

| Table | Column(s) | Index Name | Unique | Index Type | Left-Prefix Coverage / Notes |
|---|---|---|---|---|---|
| **Organizations** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `slug` | `slug` | Yes | BTREE | Tenant lookup |
| **Shops** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `organizationId` | `idx_shops_organization_id` | No | BTREE | FK to Organizations |
| **Users** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `email` | `email` | Yes | BTREE | Unique login lookup |
| | `shopId` | *None* | No | N/A | **MISSING**: No index on `shopId` |
| **Employees** | `id` | `PRIMARY` | Yes | BTREE | Primary Key (UUID) |
| | `email` | `email` | Yes | BTREE | Unique staff email |
| | `shopId` | *None* | No | N/A | **MISSING**: No index on `shopId` |
| **OrganizationMemberships** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `employeeId` | `fk_org_memberships_employee` | No | BTREE | FK index |
| | `userId` | `fk_org_memberships_user` | No | BTREE | FK index |
| | `organizationId, orgRole` | `idx_org_membership_org_role` | No | BTREE | Org role lookup |
| | `organizationId, employeeId` | `uq_org_membership_employee` | Yes | BTREE | Unique org-employee |
| | `organizationId, userId` | `uq_org_membership_user` | Yes | BTREE | Unique org-user |
| **ShopAccess** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `shopId` | `idx_shop_access_shop` | No | BTREE | Branch access check |
| | `membershipId, shopId` | `uq_membership_shop` | Yes | BTREE | Unique membership-shop pair |
| **Products** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `name` | `ft_products_name` | No | FULLTEXT | Fulltext search |
| | `categoryId` | `categoryId` | No | BTREE | Category filter |
| | `organizationId, createdAt` | `idx_products_org_createdAt` | No | BTREE | Catalog listing by org |
| | `organizationId, barcode` | `unique_products_org_barcode` | Yes | BTREE | Barcode barcode lookup |
| | `organizationId, sku` | `unique_products_org_sku` | Yes | BTREE | SKU barcode lookup |
| | `shopId` | `idx_products_shop_id` | No | BTREE | Branch filter |
| | `shopId` | `idx_products_shop_stockQuantity` | No | BTREE | **REDUNDANT**: Only indexes `shopId` |
| **Inventory** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `productId` | `productId` | No | BTREE | Product inventory lookup |
| | `shopId, productId` | `unique_inventory_shop_product` | Yes | BTREE | Unique branch inventory |
| | `shopId, stockQuantity` | `idx_inventory_shop_stock` | No | BTREE | Low stock / reorder queries |
| **Sales** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `shopId, idempotencyKey` | `unique_sales_shop_idempotency_key` | Yes | BTREE | Phase 6B-03 POS idempotency |
| | `shopId, invoiceNumber` | `unique_sales_shop_invoice_number` | Yes | BTREE | Scoped invoice uniqueness |
| | `shopId, createdAt` | `idx_sales_shop_createdAt` | No | BTREE | POS sale history & cashier views |
| | `shopId, status` | `idx_sales_shop_status` | No | BTREE | Branch status filter |
| | `createdAt` | `idx_sales_created_at` | No | BTREE | Global date range |
| | `customerId` | `idx_sales_customer_id` | No | BTREE | Customer sales history |
| | `employeeId` | `idx_sales_employee_id` | No | BTREE | Cashier sales history |
| | `paymentMethod` | `idx_sales_payment_method` | No | BTREE | Payment method reports |
| | `status` | `idx_sales_status` | No | BTREE | Status filter |
| | `userId` | `Sales_userId_foreign_idx` | No | BTREE | User sales lookup |
| **SaleItems** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `shopId` | `sale_items_shop_id` | No | BTREE | Branch item scoping |
| | `productId` | `idx_sale_items_product_id` | No | BTREE | Product sale lookup |
| | `productId` | `idx_saleItems_productId` | No | BTREE | **REDUNDANT DUPLICATE** of above |
| | `saleId` | `idx_sale_items_sale_id` | No | BTREE | Line item retrieval |
| | `saleId` | `idx_saleItems_saleId` | No | BTREE | **REDUNDANT DUPLICATE** of above |
| **SalePayments** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `shopId` | `fk_salepayments_shopId` | No | BTREE | Branch payment filter |
| | `saleId` | `idx_payments_sale_id` | No | BTREE | Tender lookup by sale |
| | `status` | `idx_payments_status` | No | BTREE | Payment status filter |
| | `processedBy` | `idx_sale_payments_processed_by` | No | BTREE | Cashier shift audit |
| **SaleRefunds** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `saleId` | `idx_refunds_sale_id` | No | BTREE | Sale return lookup |
| | `status` | `idx_refunds_status` | No | BTREE | Refund status filter |
| | `processedBy` | `processedBy` | No | BTREE | Employee audit |
| | `shopId` | *None* | No | N/A | **MISSING**: No index on `shopId` |
| | `productId` | *None* | No | N/A | **MISSING**: No index on `productId` |
| **StockMovements** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `organizationId` | `idx_stockmovements_org` | No | BTREE | Org movement audit |
| | `shopId, productId` | `stock_movements_shop_product_idx` | No | BTREE | Product movement in shop |
| | `productId` | `productId` | No | BTREE | Product movement global |
| | `employeeId` | `idx_stockmovements_employee` | No | BTREE | Employee audit |
| | `userId` | `userId` | No | BTREE | User audit |
| **StockTransfers** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `organizationId, idempotencyKey` | `unique_stock_transfers_org_idempotency_key` | Yes | BTREE | Transfer idempotency |
| | `organizationId` | `idx_stock_transfers_org` | No | BTREE | Org transfers |
| | `sourceShopId` | `idx_stock_transfers_source_shop` | No | BTREE | Source branch |
| | `destinationShopId` | `idx_stock_transfers_dest_shop` | No | BTREE | Destination branch |
| | `reference` | `reference` | Yes | BTREE | Transfer reference |
| | `productId` | `productId` | No | BTREE | Product transfer history |
| | `employeeId` | `fk_stocktransfers_employee` | No | BTREE | Employee who initiated |
| | `userId` | `userId` | No | BTREE | User who initiated |
| **Customers** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `organizationId, email` | `unique_customers_org_email` | Yes | BTREE | Unique customer email in org |
| | `organizationId, createdAt` | `idx_customers_org_createdAt` | No | BTREE | Org customer listing |
| | `shopId, createdAt` | `idx_customers_shop_createdAt` | No | BTREE | Shop customer listing |
| | `shopId` | `idx_customers_shop_id` | No | BTREE | Shop customer filter |
| **Invoices** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `shopId, invoiceNumber` | `unique_invoices_shop_invoice_number` | Yes | BTREE | Unique invoice number in shop |
| | `shopId` | `invoices_shop_id` | No | BTREE | Branch invoice lookup |
| | `createdAt` | `invoices_created_at` | No | BTREE | Global date filter |
| | `customerId` | `invoices_customer_id` | No | BTREE | Customer invoice filter |
| | `employeeId` | `idx_invoices_employee_id` | No | BTREE | Staff invoice filter |
| | `employeeId` | `invoices_employee_id` | No | BTREE | **REDUNDANT DUPLICATE** of above |
| | `organizationId` | `idx_invoices_organization_id` | No | BTREE | Tenant invoice filter |
| | `invoiceNumber` | `invoices_invoice_number` | No | BTREE | Unscoped invoice number |
| | `status` | `invoices_status` | No | BTREE | Status filter |
| | `shopId, createdAt` | *None* | No | N/A | **MISSING**: Lacks composite index |
| **Expenses** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `shopId, createdAt` | `idx_expenses_shop_createdAt` | No | BTREE | Shop expense listing (optimal) |
| | `employeeId` | `idx_expenses_employee_id` | No | BTREE | Staff expense filter |
| | `organizationId` | `idx_expenses_organization_id` | No | BTREE | Tenant expense filter |
| | `userId` | `Expenses_userId_foreign_idx` | No | BTREE | User expense filter |
| **PendingPayments** | `id` | `PRIMARY` | Yes | BTREE | Primary Key |
| | `checkoutRequestId` | `checkoutRequestId` | Yes | BTREE | Unique M-Pesa request |
| | `checkoutRequestId` | `pending_payments_checkout_request_id` | No | BTREE | **REDUNDANT DUPLICATE** of above |
| | `shopId` | `pending_payments_shop_id` | No | BTREE | Branch scoping |
| | `orderId` | `pending_payments_order_id` | No | BTREE | Order association |
| | `status` | `pending_payments_status` | No | BTREE | Payment polling |

---

## 6. Query Pattern Analysis

Across the backend controllers and services, we traced the core query patterns:

1. **Staff & User Scoping**:
   - `employeeController.getAllEmployees`:
     `Employee.findAll({ where: { shopId }, order: [['createdAt', 'DESC']] })`
     `User.findAll({ where: { shopId }, order: [['createdAt', 'DESC']] })`
     *Finding*: Neither table has `shopId` indexed. Both degrade to full table scans.
2. **Returns & Refunds Scoping**:
   - `saleController.getAllReturns`:
     `SaleRefund.findAll({ where: { shopId }, include: [Product, Sale], order: [['createdAt', 'DESC']] })`
     *Finding*: `SaleRefunds` has no index on `shopId`. Executes full table scan and filesort.
3. **POS Sale Creation**:
   - `saleController.createSaleInternal`:
     `Sale.findOne({ where: { shopId, idempotencyKey } })`
     *Finding*: Perfectly indexed via `unique_sales_shop_idempotency_key` (`(shopId, idempotencyKey)`).
4. **POS Inventory Decrement & Stock Check**:
   - `Inventory.findOne({ where: { shopId, productId } })`
     *Finding*: Perfectly indexed via `unique_inventory_shop_product` (`(shopId, productId)`).
5. **POS Recent Sales**:
   - `saleController.getAllSales`:
     `Sale.findAndCountAll({ where: { shopId }, order: [['createdAt', 'DESC']], limit, offset, distinct: true })`
     *Finding*: Supported by `idx_sales_shop_createdAt` (`(shopId, createdAt)`), but `distinct: true` with 5 left joins causes subquery overhead.
6. **Invoicing Listing**:
   - `invoiceController.getAllInvoices`:
     `Invoice.findAll({ where: { shopId }, order: [['createdAt', 'DESC']], limit, offset })`
     *Finding*: Only has `invoices_shop_id` (`shopId`). Forces a MySQL filesort on every page view.

---

## 7. EXPLAIN / Query Plan Findings

Representative production queries were executed directly against MySQL 8.4 using `EXPLAIN` and `EXPLAIN ANALYZE`:

```text
1. POS Staff - Employees by Shop
SQL: SELECT * FROM Employees WHERE shopId = 1 ORDER BY createdAt DESC
Plan: type: ALL, key: NULL, rows: 2, Extra: 'Using where; Using filesort'
EXPLAIN ANALYZE:
  -> Sort: Employees.createdAt DESC  (cost=0.45 rows=2)
      -> Filter: (Employees.shopId = 1)  (cost=0.45 rows=2)
          -> Table scan on Employees  (cost=0.45 rows=2)
Classification: FULL SCAN + FILESORT (SEVERE DEFICIENCY)

2. POS Staff - Users by Shop
SQL: SELECT * FROM Users WHERE shopId = 1 ORDER BY createdAt DESC
Plan: type: ALL, key: NULL, rows: 2, Extra: 'Using where; Using filesort'
Classification: FULL SCAN + FILESORT (ACCEPTABLE ON SMALL TABLE, BUT CLEANUP NEEDED)

3. POS Returns - SaleRefunds by Shop
SQL: SELECT * FROM SaleRefunds WHERE shopId = 1 ORDER BY createdAt DESC
Plan: type: ALL, key: NULL, rows: 1, Extra: 'Using where; Using filesort'
EXPLAIN ANALYZE:
  -> Sort: SaleRefunds.createdAt DESC  (cost=1.1 rows=1)
      -> Filter: (SaleRefunds.shopId = 1)  (cost=1.1 rows=1)
          -> Table scan on SaleRefunds  (cost=1.1 rows=1)
Classification: FULL SCAN + FILESORT (HIGH VOLUME TABLE RISK)

4. POS Sales - List Sales by Shop
SQL: SELECT * FROM Sales WHERE shopId = 1 ORDER BY createdAt DESC LIMIT 20
Plan: type: ref, key: idx_sales_shop_createdAt, key_len: 4, Extra: 'Backward index scan'
EXPLAIN ANALYZE:
  -> Limit: 20 row(s) (actual time=0.173ms)
      -> Index lookup on Sales using idx_sales_shop_createdAt (shopId=1) (reverse)
Classification: INDEXED (OPTIMAL COMPOSITE INDEX)

5. Invoices - List Invoices by Shop
SQL: SELECT * FROM Invoices WHERE shopId = 1 ORDER BY createdAt DESC LIMIT 20
Plan: type: ref, key: unique_invoices_shop_invoice_number, Extra: 'Using filesort'
Classification: INDEXED WITH FILESORT (NEEDS COMPOSITE INDEX)

6. Expenses - List Expenses by Shop
SQL: SELECT * FROM Expenses WHERE shopId = 1 ORDER BY createdAt DESC
Plan: type: ref, key: idx_expenses_shop_createdAt, Extra: 'Backward index scan'
Classification: INDEXED (OPTIMAL COMPOSITE INDEX)

7. Stock Movements - By Organization
SQL: SELECT * FROM StockMovements WHERE organizationId = 1 ORDER BY createdAt DESC LIMIT 50
Plan: type: ref, key: idx_stockmovements_org, Extra: 'Using filesort'
Classification: INDEXED WITH FILESORT
```

---

## 8. High-Volume POS Queries

| Operation | Target Table | Filtering Columns | Order / Limit | Supporting Index | Performance Assessment |
|---|---|---|---|---|---|
| **Cashier Login** | `Employees` / `Users` | `email = ?` | Limit 1 | `UNIQUE KEY email` | **Optimal (Const Lookup)** |
| **Catalog Load** | `Products` + `Inventory` | `organizationId = ?`, `shopId = ?` | `createdAt DESC` | `idx_products_org_createdAt` + `unique_inventory_shop_product` | **Optimal / Cached in Redis** |
| **Create Sale (Idempotency)** | `Sales` | `shopId = ?`, `idempotencyKey = ?` | None | `unique_sales_shop_idempotency_key` | **Optimal (Const Lookup)** |
| **Deduct Inventory** | `Inventory` | `shopId = ?`, `productId = ?` | None | `unique_inventory_shop_product` | **Optimal (Const Lookup)** |
| **Record Stock Movement**| `StockMovements`| `shopId = ?`, `productId = ?` | None | `stock_movements_shop_product_idx` | **Optimal (Index Insert/Ref)** |
| **Cashier Sales History** | `Sales` | `shopId = ?` | `createdAt DESC LIMIT 20` | `idx_sales_shop_createdAt` | **Optimal (Backward Index Scan)** |
| **Cashier Return History** | `SaleRefunds` | `shopId = ?` | `createdAt DESC` | *None* | **Degraded (Full Table Scan + Filesort)** |
| **Staff List** | `Employees` | `shopId = ?` | `createdAt DESC` | *None* | **Degraded (Full Table Scan + Filesort)** |

---

## 9. Tenant / Shop Query Analysis

Zana POS isolates data across branches (`shopId`) and organizations (`organizationId`).
- **Where tenant indexing is excellent**:
  - `Sales`: `idx_sales_shop_createdAt (shopId, createdAt)`
  - `Expenses`: `idx_expenses_shop_createdAt (shopId, createdAt)`
  - `Customers`: `idx_customers_shop_createdAt (shopId, createdAt)` and `idx_customers_org_createdAt (organizationId, createdAt)`
  - `Products`: `idx_products_org_createdAt (organizationId, createdAt)`
- **Where tenant indexing is broken or incomplete**:
  - `Employees`: Missing `(shopId, createdAt)` or `shopId`
  - `SaleRefunds`: Missing `(shopId, createdAt)` or `shopId`
  - `Invoices`: Has `invoices_shop_id (shopId)` but lacks `(shopId, createdAt)`, resulting in filesorts.
  - `StockMovements`: Has `idx_stockmovements_org (organizationId)` but lacks `(organizationId, createdAt)`, resulting in filesorts.

---

## 10. Missing Index Findings

| ID | Table | Column(s) | Impacted Endpoints | Problem | Recommended Index | Priority |
|---|---|---|---|---|---|---|
| **`INDX-01-A`** | `Employees` | `shopId, createdAt` | `GET /api/employees`, `GET /api/users` | Full table scan + filesort on every staff lookup | `INDEX idx_employees_shop_createdAt (shopId, createdAt)` | **P1** |
| **`INDX-01-B`** | `SaleRefunds`| `shopId, createdAt` | `GET /api/sales/returns` | Full table scan + filesort on every returns listing | `INDEX idx_sale_refunds_shop_createdAt (shopId, createdAt)` | **P1** |
| **`INDX-01-C`** | `Users` | `shopId` | `GET /api/users` | Full table scan when listing users by shop | `INDEX idx_users_shopId (shopId)` | **P3** |
| **`INDX-02`** | `Invoices` | `shopId, createdAt` | `GET /api/invoices` | Filesort on invoice listing queries | `INDEX idx_invoices_shop_createdAt (shopId, createdAt)` | **P2** |
| **`INDX-03`** | `SaleRefunds`| `productId` | Return analytics, product returns | Full scan when filtering returns by product | `INDEX idx_sale_refunds_productId (productId)` | **P2** |
| **`INDX-04`** | `StockMovements`| `organizationId, createdAt` | `GET /api/stock-movements` | Filesort on org movement ledger | `INDEX idx_stockmovements_org_createdAt (organizationId, createdAt)` | **P2** |
| **`INDX-05`** | `Invoices` | `saleId` | Sale invoice retrieval | Table scan on `saleId` lookup | `INDEX idx_invoices_saleId (saleId)` | **P3** |

---

## 11. Redundant Index Findings

Redundant indexes waste buffer pool memory and add overhead to every `INSERT`/`UPDATE`:

| Table | Redundant Index | Existing Retained Index | Reason | Classification | Action in Future Phase |
|---|---|---|---|---|---|
| `SaleItems` | `idx_saleItems_productId` | `idx_sale_items_product_id` | Exact duplicate index on `productId` | **Definitely redundant** | Safe to drop in 6B-05/cleanup |
| `SaleItems` | `idx_saleItems_saleId` | `idx_sale_items_sale_id` | Exact duplicate index on `saleId` | **Definitely redundant** | Safe to drop in 6B-05/cleanup |
| `Invoices` | `invoices_employee_id` | `idx_invoices_employee_id` | Exact duplicate index on `employeeId` | **Definitely redundant** | Safe to drop in 6B-05/cleanup |
| `PendingPayments` | `pending_payments_checkout_request_id` | `checkoutRequestId` (UNIQUE) | Non-unique index completely shadowed by unique index | **Definitely redundant** | Safe to drop in 6B-05/cleanup |
| `Products` | `idx_products_shop_stockQuantity` | `idx_products_shop_id` | `stockQuantity` was dropped; now both index only `shopId` | **Definitely redundant** | Safe to drop in 6B-05/cleanup |

---

## 12. N+1 Findings

1. **`getAllSales` Subquery Eager Loading**:
   - In `saleController.getAllSales`, `Sale.findAndCountAll` eagerly loads `SaleItem`, `Product`, `Customer`, `Employee`, and `User` with `distinct: true`.
   - While Sequelize batches the child includes, the outer `COUNT(DISTINCT Sale.id)` query joins all 5 child tables, causing temporary table generation in MySQL when sales volume is high.
   - Classification: **P2**.
2. **`getAllReturns` Batched Performer Fetching**:
   - In `saleController.getAllReturns`, user/employee IDs are accumulated and fetched using two `Promise.all([User.findAll(...), Employee.findAll(...)])` calls.
   - This avoids classical N+1 loops, but is executed without caching or projection.
   - Classification: **INFO**.

---

## 13. Pagination Findings

1. **Unbounded Returns Query**:
   - `saleController.getAllReturns` does NOT implement `limit` or `offset`.
   - `SaleRefund.findAll({ where: { shopId }, include: [...] })` returns all historical returns for the store in a single JSON response.
   - Impact: As stores grow, memory pressure and payload sizes will grow unbounded.
   - Classification: **P1**.
2. **Product Catalog Cache-Miss Pagination Slicing in Memory**:
   - `productController.getAllProducts`: On cache miss, loads all active products of the organization into Node process memory via `Product.findAndCountAll`, caches the entire catalog into Redis, and slices with `slice(offset, offset + numericPageSize)` in JavaScript.
   - Impact: Ineffective database pagination for large product catalogs (> 20,000 items).
   - Classification: **P2**.

---

## 14. Aggregation Findings

- **Subqueries in Reports**:
  - `reportsController.js` and `analyticsController.js` use correlated subqueries to calculate net revenue after refunds:
    `SUM(total - COALESCE((SELECT SUM(amount) FROM SaleRefunds WHERE SaleRefunds.saleId = Sale.id AND SaleRefunds.status = 'processed'), 0))`
  - Supported by `idx_refunds_sale_id` (`saleId`) and `idx_refunds_status` (`status`) on `SaleRefunds`.
  - In a large-scale reporting period, this correlated subquery runs once per sale row.
  - Classification: **P2 / Future Analytics Optimization**.

---

## 15. Migration Inventory

- **Location**: `backend/migrations/`
- **Total Files in Directory**: 106
- **Active Sequelize Migration Files (`.js`)**: 89
- **Backup / Obsolete Scripts (`.bak`)**: 17
- **Database Recorded Migrations (`SequelizeMeta`)**: 89
- **Migration Sync Status**: **100% IN SYNC** (89/89 active `.js` files match `SequelizeMeta` exactly).

---

## 16. Migration History Integrity

- Executed `npx sequelize-cli db:migrate:status`:
  - **89 UP**, **0 PENDING**, **0 UNKNOWN**.
- Cross-referencing:
  - Every `.js` file in `backend/migrations` corresponds to a row in `SequelizeMeta`.
  - Zero missing migration files.
  - Zero phantom records in `SequelizeMeta`.
  - Historical migrations are properly ordered chronologically from `20250101000000` to `20260918000001`.

---

## 17. .bak / Backup Migration Analysis

Itemized inventory of all 17 `.bak` files:

| # | Filename | Size | Git Tracked | Type | Purpose / Assessment |
|---|---|---|---|---|---|
| 1 | `20251027000000-fix-product-id-type.js.bak` | 2.6 KB | Yes | Migration Backup | Early draft before error-handling wrappers. Safe to remove in future cleanup. |
| 2 | `20251027000001-add-shopid-to-saleitems.js.bak` | 750 B | Yes | Migration Backup | Backup copy of active migration. Safe to remove in future cleanup. |
| 3 | `add-product-id-v2.js.bak` | 1.6 KB | Yes | Manual Runner Script | Node script to alter column outside CLI. Not a migration. |
| 4 | `add-product-id.js.bak` | 1.6 KB | Yes | Manual Runner Script | Older attempt of script #3. Not a migration. |
| 5 | `cleanup-and-fix-data.js.bak` | 4.1 KB | Yes | Manual Data Fix | One-off data remediation script from Oct 2025. |
| 6 | `cleanup-columns.js.bak` | 2.8 KB | Yes | Manual Schema Script | Standalone table column drop script. |
| 7 | `fix-product-id.js.bak` | 3.0 KB | Yes | Manual Schema Script | Foreign key dropping and type alteration script. |
| 8 | `inspect-database.js.bak` | 2.4 KB | Yes | Diagnostic Script | Prints schema information. Harmless diagnostic. |
| 9 | `inspect-products.js.bak` | 1.2 KB | Yes | Diagnostic Script | Prints products table schema. |
| 10 | `inspect-table.js.bak` | 1.2 KB | Yes | Diagnostic Script | Generic table inspector. |
| 11 | `run-invoices-migration.js.bak` | 1.1 KB | Yes | Migration Invoker | Manually invoked invoices migration with standalone Sequelize instance. |
| 12 | `run-migration-direct.js.bak` | 1.4 KB | Yes | Migration Invoker | Direct runner for `20251013000000-enhance-sales-system`. |
| 13 | `run-migration.js.bak` | 1.5 KB | Yes | Migration Invoker | Runner for sales system enhancement migration. |
| 14 | `run-product-id-fix.js.bak` | 1.1 KB | Yes | Migration Invoker | Direct runner for product ID fix. |
| 15 | `run-saleitems-migration.js.bak` | 1.1 KB | Yes | Migration Invoker | Direct runner for sale items shopId migration. |
| 16 | `run-uuid-fix.js.bak` | 2.5 KB | Yes | Manual Data Fix | One-off UUID schema repair script. |
| 17 | `run-weight-grams.js.bak` | 1.1 KB | Yes | Migration Invoker | Direct runner for `20251105000000-add-weight-grams-to-products`. |

**Conclusion**: None of these 17 files are executed by Sequelize CLI. They are historical development scratch files from October/November 2025 that were left in the repository. They pose no deployment blocker or runtime failure risk, but represent repository debt.

---

## 18. Migration Risk Assessment

Review of recent migrations (Phases 4 through 6B):

| Migration | Operation | Risk Level | Notes |
|---|---|---|---|
| `20260913131856-split-product-catalog-and-inventory.js` | Split products and inventory | **SAFE (Executed)** | Created `Inventory` table, backfilled stock data successfully. |
| `20260913143818-drop-product-stock-and-reorder-columns.js` | Dropped `stockQuantity` from `Products` | **SAFE (Executed)** | Dropped redundant columns after verification. |
| `20260917120000-phase4-harden-categories-and-stock-movements.js` | Added unique indexes and constraints | **SAFE (Executed)** | Hardened category and stock movement constraints. |
| `20260917130000-phase4-stock-transfer-idempotency...` | Added transfer idempotency keys | **SAFE (Executed)** | Composite index on `(organizationId, idempotencyKey)`. |
| `20260918000000-drop-legacy-sales-invoice-number...` | Dropped global unique constraint on `invoiceNumber` | **SAFE (Executed)** | Replaced with composite `(shopId, invoiceNumber)`. |
| `20260918000001-add-employee-and-organization-to-invoices...` | Added audit columns | **SAFE (Executed)** | Added foreign keys and indexes cleanly. |

---

## 19. Recommended Index Changes (For Future Remediation)

When authorized, a dedicated zero-downtime migration should be created applying the following indexes:

```sql
-- 1. High Priority Missing Tenant Indexes (P1)
CREATE INDEX idx_employees_shop_createdAt ON Employees (shopId, createdAt);
CREATE INDEX idx_sale_refunds_shop_createdAt ON SaleRefunds (shopId, createdAt);

-- 2. Query Performance Indexes (P2)
CREATE INDEX idx_invoices_shop_createdAt ON Invoices (shopId, createdAt);
CREATE INDEX idx_sale_refunds_productId ON SaleRefunds (productId);
CREATE INDEX idx_stockmovements_org_createdAt ON StockMovements (organizationId, createdAt);

-- 3. Secondary & Owner Scoping Indexes (P3)
CREATE INDEX idx_users_shopId ON Users (shopId);
CREATE INDEX idx_invoices_saleId ON Invoices (saleId);
```

### Zero-Downtime Migration Algorithm Considerations:
In MySQL 8.0 / 8.4 InnoDB, secondary index creation supports:
```sql
ALTER TABLE Employees ADD INDEX idx_employees_shop_createdAt (shopId, createdAt), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE SaleRefunds ADD INDEX idx_sale_refunds_shop_createdAt (shopId, createdAt), ALGORITHM=INPLACE, LOCK=NONE;
```
This ensures zero table locking and concurrent DML operations during index creation in production.

---

## 20. Recommended Migration Hygiene Changes (For Future Remediation)

To resolve `MIGR-01` without risking migration history:
1. Do NOT delete or rewrite historical `.js` migrations in `SequelizeMeta`.
2. Move the 17 `.bak` files from `backend/migrations/` to an archive directory outside the migration path (e.g. `docs/archive/historical-scripts/`) or remove them in a controlled hygiene commit.
3. Add a `.gitignore` rule or linter rule preventing `.bak` or `.tmp` files from being committed into `backend/migrations/`.

---

## 21. Priority Matrix

| ID | Category | Finding | Priority | Recommended Action |
|---|---|---|---|---|
| **`INDX-01-A`** | Indexing | Missing index on `Employees.shopId` | **P1** | Add `INDEX idx_employees_shop_createdAt (shopId, createdAt)` |
| **`INDX-01-B`** | Indexing | Missing index on `SaleRefunds.shopId` | **P1** | Add `INDEX idx_sale_refunds_shop_createdAt (shopId, createdAt)` |
| **`PAGE-01`** | Query Perf | Unbounded query in `saleController.getAllReturns` | **P1** | Add pagination (`limit`, `offset`) to returns endpoint |
| **`INDX-02`** | Indexing | Missing composite index on `Invoices(shopId, createdAt)` | **P2** | Add `INDEX idx_invoices_shop_createdAt (shopId, createdAt)` |
| **`INDX-03`** | Indexing | Missing index on `SaleRefunds.productId` | **P2** | Add `INDEX idx_sale_refunds_productId (productId)` |
| **`INDX-04`** | Indexing | Missing composite index on `StockMovements(organizationId, createdAt)` | **P2** | Add `INDEX idx_stockmovements_org_createdAt (organizationId, createdAt)` |
| **`PAGE-02`** | Query Perf | In-memory pagination on product catalog cache-miss | **P2** | Push limit/offset down to database query on cache miss |
| **`DUP-01`** | Indexing | Duplicate indexes on `SaleItems` (`productId`, `saleId`) | **P3** | Drop redundant duplicate indexes |
| **`DUP-02`** | Indexing | Duplicate indexes on `Invoices` (`employeeId`) | **P3** | Drop redundant duplicate index |
| **`DUP-03`** | Indexing | Duplicate index on `PendingPayments` (`checkoutRequestId`) | **P3** | Drop redundant non-unique index |
| **`DUP-04`** | Indexing | Redundant index on `Products` (`idx_products_shop_stockQuantity`) | **P3** | Drop single-column duplicate of `idx_products_shop_id` |
| **`INDX-01-C`** | Indexing | Missing index on `Users.shopId` | **P3** | Add index or normalize to `OrganizationMemberships` |
| **`MIGR-01`** | Hygiene | 17 `.bak` migration files in directory | **P3** | Archive or remove `.bak` files in a controlled hygiene commit |

---

## 22. Test Verification

The existing automated test suite was executed in full without modifications:

```text
Test Suites: 15 passed, 15 total
Tests:       184 passed, 184 total
Snapshots:   0 total
Time:        269.238 s
```

### Breakdown by Test Suite:
1. `phase6bPosIdempotency.test.js`: 20/20 PASS
2. `phase6bAuthSessionSecurity.test.js`: 11/11 PASS
3. `phase6bPaymentSecurity.test.js`: 12/12 PASS
4. `phase6aReleaseBlockers.test.js`: 13/13 PASS
5. `phase5SubscriptionLifecycle.test.js`: 28/28 PASS
6. `billingEndpoints.test.js`: 10/10 PASS
7. `billingRenewal.test.js`: 14/14 PASS
8. `subphase6c.test.js`: 6/6 PASS
9. `phase4ProductInventorySecurity.test.js`: 12/12 PASS
10. `phase4TransferIdempotency.test.js`: 6/6 PASS
11. `phase3UserTenantSecurity.test.js`: 16/16 PASS
12. `phase1.test.js`: 8/8 PASS
13. `phase2.test.js`: 20/20 PASS
14. `mpesaSecurity.test.js`: 5/5 PASS
15. `item1-token-purpose.test.js`: 3/3 PASS

**Total Verified**: **184 / 184 tests passing (100%)**.

---

## 23. Frontend Build Verification

Executed `npm run build` (`tsc && vite build`) in `frontend/`:
- **Transformations**: 2,569 modules transformed cleanly.
- **TypeScript Type Checks**: **0 errors**.
- **Vite Production Bundler**: **0 errors**.
- **Build Duration**: 2m 18s.
- **Output**: Clean `dist/` production assets.

---

## 24. Database Migration Status

Executed `npx sequelize-cli db:migrate:status`:
- **Total Historical Migrations**: 89
- **Status**: **89 UP**, **0 PENDING**, **0 UNKNOWN**.
- **Schema Drift**: None.

---

## 25. Production Limitations / Unknowns

> [!NOTE]
> **Production Limitations Statement**:  
> All query plan and cardinality verifications were performed against the active development/test MySQL 8.4 database environment containing seeded baseline test data.  
> Production cardinality (e.g. organizations with >100,000 sales or >50,000 inventory items) and production query-plan latency distributions could not be independently measured against live production traffic.  
> However, the `EXPLAIN` and `EXPLAIN ANALYZE` plans provide definitive structural evidence of table scans and filesorts that will predictably scale linearly ($O(N)$) as production data volume accumulates.

---

## 26. Phase 6B-05 / 6B-06 Findings Explicitly Deferred

In accordance with strict phase boundaries:
- **Phase 6B-05 Deferred**:
  - `ORAC-01`: ID oracle normalization and UUID vs INT primary/foreign key standardization.
- **Phase 6B-06 Deferred**:
  - `AI-01`: AI service request rate limiting and payload validation.
  - `RATE-01`: Global Redis rate-limiting on sensitive endpoints.
  - `OBS-01`: Production observability, tracing, and structured logging.
  - `VULN-02`: Dependency vulnerability remediation.
  - `AI-02`: AI service fallback timeouts.

---

## 27. Final Assessment & Scorecard

| Area | Status | Notes |
|---|---|---|
| **Index Coverage** | **REQUIRES REMEDIATION** | `Employees.shopId`, `SaleRefunds.shopId`, and `Invoices(shopId, createdAt)` need indexes. Multiple redundant duplicate indexes exist. |
| **Query Performance** | **READY WITH CONDITIONS** | Core sales/inventory queries are fast, but returns and employee listings suffer from full scans. |
| **POS Query Performance** | **READY WITH CONDITIONS** | Sale checkout and idempotency lookups are $O(1)$; cashier return history needs indexing. |
| **Tenant Query Indexing** | **READY WITH CONDITIONS** | Strong on `Sales`, `Products`, `Customers`; deficient on `Employees` and `SaleRefunds`. |
| **Migration History** | **READY** | All 89 migrations are UP, strictly tracked, and 1-to-1 with `SequelizeMeta`. |
| **Migration Hygiene** | **REQUIRES REMEDIATION** | 17 legacy `.bak` files need archiving outside migrations directory. |
| **Production-Scale Evidence**| **READY WITH CONDITIONS** | Proven via MySQL 8.4 EXPLAIN and EXPLAIN ANALYZE; live production metrics unmeasured. |
| **Regression Safety** | **READY** | 184/184 automated tests PASS, frontend build passes with 0 errors. |
