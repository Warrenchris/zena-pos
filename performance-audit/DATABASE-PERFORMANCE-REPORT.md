# ZANA POS — DATABASE PERFORMANCE AUDIT REPORT

---

## 1. Database Architecture & Storage Configuration

* **Engine:** MySQL Server 8.4.7 Community Server (x86_64 Linux in Docker Container `zana-mysql`)
* **Default Port:** Host port 3307 -> Container port 3306
* **Database Name:** `zana_pos`
* **Schema Topology:** 45 relational tables managed via Sequelize migrations
* **Character Set / Collation:** `utf8mb4` / `utf8mb4_unicode_ci`
* **Storage Engine:** InnoDB across all application tables
* **Connection Pooling (`backend/src/config/sequelize.js`):**
  - Development pool: `max: 15`, `min: 0`, `acquire: 60000ms`, `idle: 10000ms`
  - Test pool: `max: 5`, `min: 0`
  - Production pool: configured via `DB_POOL_MAX` (default 15)

---

## 2. Table Indexing & Key Inventory Analysis

An audit of all indexes across the primary transactional tables was performed using `SHOW INDEX FROM <table>`:

```
┌─────────────────┬──────────────────────────────────────────┬─────────────────────────────┬────────────────┐
│ Table           │ Index Name                               │ Columns                     │ Index Type     │
├─────────────────┼──────────────────────────────────────────┼─────────────────────────────┼────────────────┤
│ Sales           │ PRIMARY                                  │ id                          │ BTREE (PK)     │
│                 │ unique_sales_shop_invoice_number         │ shopId, invoiceNumber       │ BTREE (UNIQUE) │
│                 │ unique_sales_shop_idempotency_key        │ shopId, idempotencyKey      │ BTREE (UNIQUE) │
│                 │ unique_sales_shop_receipt_number         │ shopId, receiptNumber       │ BTREE (UNIQUE) │
│                 │ sales_receipt_token_hash_unique          │ receiptTokenHash            │ BTREE (UNIQUE) │
│                 │ idx_sales_status                         │ status                      │ BTREE          │
│                 │ idx_sales_created_at                     │ createdAt                   │ BTREE          │
│                 │ idx_sales_payment_method                 │ paymentMethod               │ BTREE          │
│                 │ idx_sales_customer_id                    │ customerId                  │ BTREE          │
│                 │ idx_sales_employee_id                    │ employeeId                  │ BTREE          │
│                 │ idx_sales_shop_createdAt                 │ shopId, createdAt           │ BTREE (COMP)   │
│                 │ idx_sales_shop_status                    │ shopId, status              │ BTREE (COMP)   │
├─────────────────┼──────────────────────────────────────────┼─────────────────────────────┼────────────────┤
│ SaleItems       │ PRIMARY                                  │ id                          │ BTREE (PK)     │
│                 │ idx_sale_items_product_id                │ productId                   │ BTREE          │
│                 │ idx_sale_items_sale_id                   │ saleId                      │ BTREE          │
│                 │ sale_items_shop_id                       │ shopId                      │ BTREE          │
├─────────────────┼──────────────────────────────────────────┼─────────────────────────────┼────────────────┤
│ Products        │ PRIMARY                                  │ id                          │ BTREE (PK)     │
│                 │ unique_products_org_sku                  │ organizationId, sku         │ BTREE (UNIQUE) │
│                 │ unique_products_org_barcode              │ organizationId, barcode     │ BTREE (UNIQUE) │
│                 │ categoryId                               │ categoryId                  │ BTREE          │
│                 │ idx_products_shop_id                     │ shopId                      │ BTREE          │
│                 │ idx_products_org_createdAt               │ organizationId, createdAt   │ BTREE (COMP)   │
│                 │ ft_products_name                         │ name                        │ FULLTEXT       │
├─────────────────┼──────────────────────────────────────────┼─────────────────────────────┼────────────────┤
│ Inventory       │ PRIMARY                                  │ id                          │ BTREE (PK)     │
│                 │ unique_inventory_shop_product            │ shopId, productId           │ BTREE (UNIQUE) │
│                 │ productId                                │ productId                   │ BTREE          │
│                 │ idx_inventory_shop_stock                 │ shopId, stockQuantity       │ BTREE (COMP)   │
├─────────────────┼──────────────────────────────────────────┼─────────────────────────────┼────────────────┤
│ Customers       │ PRIMARY                                  │ id                          │ BTREE (PK)     │
│                 │ unique_customers_org_email               │ organizationId, email       │ BTREE (UNIQUE) │
│                 │ idx_customers_shop_createdAt             │ shopId, createdAt           │ BTREE (COMP)   │
│                 │ idx_customers_shop_id                    │ shopId                      │ BTREE          │
│                 │ idx_customers_org_createdAt              │ organizationId, createdAt   │ BTREE (COMP)   │
├─────────────────┼──────────────────────────────────────────┼─────────────────────────────┼────────────────┤
│ Expenses        │ PRIMARY                                  │ id                          │ BTREE (PK)     │
│                 │ idx_expenses_shop_createdAt              │ shopId, createdAt           │ BTREE (COMP)   │
│                 │ idx_expenses_employee_id                 │ employeeId                  │ BTREE          │
│                 │ idx_expenses_organization_id             │ organizationId              │ BTREE          │
└─────────────────┴──────────────────────────────────────────┴─────────────────────────────┴────────────────┘
```

### Strengths Identified:
1. **Multi-Tenant Composite Keys:** `Sales`, `Customers`, and `Expenses` properly index `(shopId, createdAt)` and `(organizationId, createdAt)`. This prevents full table scans when tenant-scoped date range filtering is performed.
2. **Catalog Fulltext Search:** `Products.name` has a native `FULLTEXT` index (`ft_products_name`), enabling fast text searches in SQL.
3. **Idempotency Keys:** `Sales.idempotencyKey` has a unique compound constraint with `shopId`, guaranteeing offline sync retries do not create duplicate sales records.

---

## 3. Discovered Query Bottlenecks & Execution Plan Tracing

### Bottleneck 1: `Using temporary` on Function-Wrapped Date Grouping
* **Query Source:** `analyticsController.js:228-241` (used by `getVisitors`, `getOrders`, `getSalesChannels`)
* **SQL Clause:**
  ```sql
  SELECT 
    DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')) as date,
    HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00')) as hour,
    COUNT(CASE WHEN createdAt >= ? AND createdAt <= ? THEN 1 END) as current_visitors
  FROM Sales
  WHERE shopId = ? AND createdAt >= ? AND createdAt <= ? AND status IN ('completed')
  GROUP BY DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')), HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00'))
  ORDER BY DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')) ASC, HOUR(CONVERT_TZ(createdAt, '+00:00', '+03:00')) ASC;
  ```
* **EXPLAIN Plan:**
  - `key: unique_sales_shop_invoice_number` (or `idx_sales_shop_createdAt`)
  - `Extra: Using where; Using temporary`
* **Technical Explanation:** In MySQL, B-tree indexes store raw values (`createdAt`). When a query groups or orders by an expression `DATE(CONVERT_TZ(...))`, MySQL cannot traverse the index to satisfy the grouping. It must materialize all matching rows into an internal temporary table in memory, evaluate the expression for each row, and group them. When tables grow beyond `tmp_table_size` (typically 16MB), the temporary table is converted to an on-disk MyISAM/InnoDB table, causing severe disk I/O latency.
* **Recommended Solution:**
  Add a generated stored column or a date-only column `localSaleDate DATE GENERATED ALWAYS AS (DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00'))) STORED`, and index `(shopId, localSaleDate)`. This allows MySQL to perform index-driven grouping without creating temporary tables.

### Bottleneck 2: Top Products Join with Heavy Aggregation
* **Query Source:** `analyticsController.js:460-495`
* **SQL Clause:**
  ```sql
  SELECT 
    si.productId,
    p.name,
    SUM(si.quantity) as total_sold,
    SUM(si.subtotal) as total_revenue
  FROM SaleItems si
  JOIN Sales s ON si.saleId = s.id
  JOIN Products p ON si.productId = p.id
  WHERE s.shopId = ? AND s.createdAt >= ? AND s.createdAt <= ? AND s.status = 'completed'
  GROUP BY si.productId, p.name
  ORDER BY total_revenue DESC
  LIMIT 5;
  ```
* **EXPLAIN Plan:**
  - `Extra: Using where; Using temporary; Using filesort`
* **Technical Explanation:** This triple join scans `Sales`, joins `SaleItems`, groups by `productId`, and applies `filesort` across the entire result set to extract the top 5. On large retail catalogs, performing this aggregation on every dashboard refresh is wasteful.
* **Recommended Solution:**
  The Redis analytics cache (`utils/analyticsCache.js`) is already implemented; its TTL should be extended from the current 60 seconds to 300 seconds (5 minutes) for non-realtime widgets.

### Bottleneck 3: Unbounded Count Queries on Filter Reset
* **Query Source:** `productsController.js` and `customersController.js`
* **Pattern:** `SELECT COUNT(*) FROM Products WHERE organizationId = ?` without bounding by category or active status.
* **Impact:** While manageable on small catalogs, InnoDB executes `COUNT(*)` via an index scan. As product counts scale to 100,000+ items across multi-tenant shops, repeated unbounded counts on pagination components introduce unnecessary buffer pool thrashing.

---

## 4. Multi-Tenant Organization & Shop Isolation Verification

Multi-tenant query isolation was verified across all model controllers:
* All sales queries strictly enforce `WHERE shopId = ?`.
* All catalog items enforce `WHERE organizationId = ?`.
* Cross-tenant access attempts were tested; controllers reject mismatched `shopId` headers with HTTP 403 Forbidden (`req.authz.scope.hasShopAccess` guard).
* Zero query plan leaks between organizations were detected.

