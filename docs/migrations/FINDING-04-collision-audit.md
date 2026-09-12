# FINDING-04: Database Unique Constraint Collision Audit

**Audit Date**: 2026-09-12  
**Scope**: Pre-migration audit of all global unique database constraints in Zena POS to determine whether real cross-tenant collisions exist in live MySQL data before restructuring to composite unique indexes (`shopId, <field>`).  
**Status**: Read-Only Audit Complete (Phase 1). No schema modifications performed.

---

## 1. Executive Summary & Verdict

- **Existing Cross-Tenant Collisions**: **0 (Zero)** across all investigated fields.
- **Within-Shop Duplicates**: **0 (Zero)** across all investigated fields.
- **Root Cause of Zero Collisions Today**: The existing global unique constraints previously aborted any transaction that would have created an overlap. Furthermore, the 6 existing shops in the database have partitioned usage (Shop 4 holds the primary supermarket inventory and historical sales; Shop 1 holds test data).
- **Collision Risk Severity**: **Critical / Guaranteed Immediate Failure**. Although historical rows do not collide, code inspection of `saleController.js` and `productController.js` reveals sequence calculations scoped to `shopId` (`${dateStr}-0001` and `generateSKU(skuPrefix, count + 1)`). Multiple active shops operating on the same day are guaranteed to collide on invoice numbers and SKUs.
- **Migration Recommendation**: **Safe to migrate directly to composite unique indexes `(shopId, field)`**. No data remediation (such as auto-suffixing SKUs or modifying historical invoice numbers) is required prior to applying the migration.

---

## 2. Table-by-Table Field Audit & Statistics

The following table summarizes live data queried from MySQL (`zana_pos` database):

| Table | Field | Total Rows | NULL Rows | Distinct Non-Null Values | Cross-Shop Collisions | Existing MySQL Indexes |
|---|---|:---:|:---:|:---:|:---:|---|
| **Products** | `sku` | 78 | 0 | 78 | **0** | `sku`, `sku_2` ... `sku_11` (all unique) |
| **Products** | `barcode` | 78 | 38 | 40 | **0** | `barcode`, `barcode_2` ... `barcode_11` (all unique) |
| **Categories** | `name` | 8 | 0 | 8 | **0** | `name`, `name_2` ... `name_11` (all unique) |
| **Coupons** | `code` | 3 | 0 | 3 | **0** | `code` (unique), `coupons_code`, `idx_coupons_code` |
| **Customers** | `email` | 28 | 23 | 5 | **0** | `email`, `email_2` ... `email_11` (all unique) |
| **Sales** | `invoiceNumber` | 131 | 0 | 131 | **0** | `invoiceNumber`, `invoiceNumber_2` ... `invoiceNumber_9` (all unique) |
| **Sales** | `idempotencyKey` | 131 | 110 | 21 | **0** | `sales_idempotency_key_unique` (unique) |
| **Invoices** | `invoiceNumber` | 2 | 0 | 2 | **0** | `invoiceNumber`, `invoiceNumber_2` ... `invoiceNumber_10` (all unique) |
| **Users** | `email` | 15 | 0 | 15 | **0** | `email`, `email_2` ... `email_12` (all unique) |
| **Employees** | `email` | 8 | 0 | 8 | **0** | `email`, `email_2` ... `email_10` (all unique) |

---

## 3. Deep Dive on Specific High-Risk Fields

### 3.1 `Sale.invoiceNumber` Logic Audit
- **Location**: `backend/src/controllers/saleController.js:424-444` and `backend/src/services/EnhancedSaleService.js:238-258`.
- **Generation Pattern**:
  ```javascript
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const [lastSale] = await Sale.findAll({
    where: {
      invoiceNumber: { [Op.like]: `${dateStr}-%` },
      shopId // <-- SCOPED TO CALLER'S SHOP
    },
    order: [['invoiceNumber', 'DESC']],
    limit: 1,
    lock: t.LOCK.UPDATE,
    transaction: t
  });
  let sequence = '0001';
  if (lastSale) {
    const lastSequence = parseInt(lastSale.invoiceNumber.split('-')[1], 10);
    sequence = String(lastSequence + 1).padStart(4, '0');
  }
  const invoiceNumber = `${dateStr}-${sequence}`;
  ```
- **Collision Risk**: The sequence counter resets to `0001` per shop per day. If Shop 1 and Shop 2 both complete a sale on `2026-09-13`, both compute `20260913-0001`. Because `Sales.invoiceNumber` currently has a global unique index in MySQL, the second shop to commit receives a fatal `SequelizeUniqueConstraintError`.
- **Historical Rows**: The 131 existing sales were recorded across different dates (or only by one active shop on a given date), so zero collision exists in the table today.
- **Fix Requirement**: Replace global unique constraint with `UNIQUE(shopId, invoiceNumber)`. Optionally prefix the invoice string with the shop identifier (`${shopId}-${dateStr}-${sequence}`) for platform-wide traceability, although `UNIQUE(shopId, invoiceNumber)` satisfies database isolation.

### 3.2 `Product.barcode` Nullable Index Behavior
- **Data State**: 38 out of 78 products have `barcode: NULL`. 40 distinct non-null barcodes exist.
- **MySQL Handling**: In MySQL (InnoDB), multiple `NULL` values are permitted in a unique index without triggering a collision (`NULL != NULL` in standard SQL index semantics).
- **Migration Caution**: A composite unique index on `(shopId, barcode)` will continue to permit multiple `NULL` barcodes within the same shop in MySQL. If `barcode` is intended to be unique only when populated, `UNIQUE(shopId, barcode)` functions as desired.

### 3.3 Redundant Index Proliferation
- Inspection of `SHOW INDEX FROM <table>` revealed repeated migrations or Sequelize auto-sync passes have created numerous duplicate unique index aliases on MySQL (e.g., `sku`, `sku_2`, ... `sku_11`).
- The Phase 2 migration must ensure all historical duplicate unique indexes on these columns are dropped cleanly before creating the composite `(shopId, <field>)` index.

---

## 4. Current Multi-Shop Distribution

A total of 6 shops exist in the database:
- **Shop 1 ("Shop 1")**: 63 products, 27 sales, 1 category, 5 employees, 7 users.
- **Shop 2 ("Shop 2")**: 0 products, 1 sale, 0 categories, 0 employees, 1 user.
- **Shop 3 ("Default Shop")**: 0 products, 0 sales, 0 categories, 0 employees, 2 users.
- **Shop 4 ("Soko Safi Supermarket")**: 15 products, 103 sales, 7 categories, 28 customers, 3 coupons, 2 invoices, 3 employees, 3 users.
- **Shop 5 ("Main POS")**: 0 products, 0 sales, 0 categories, 0 employees, 1 user.
- **Shop 17 ("Realmer technology limited")**: 0 products, 0 sales, 0 categories, 0 employees, 1 user.

---

## 5. Phase 1 Recommendation

1. **Direct Migration**: Proceed directly to composite unique index migration. **No data remediation is required** since cross-tenant collision count is 0 across all target columns.
2. **Target Columns for Scoping to `(shopId, <column>)`**:
   - `Products`: `(shopId, sku)` and `(shopId, barcode)`
   - `Categories`: `(shopId, name)`
   - `Coupons`: `(shopId, code)`
   - `Customers`: `(shopId, email)`
   - `Sales`: `(shopId, invoiceNumber)` and `(shopId, idempotencyKey)`
   - `Invoices`: `(shopId, invoiceNumber)`
3. **Users and Employees Scope**:
   - `Employees`: `(shopId, email)` is recommended if an employee email is scoped to a merchant.
   - `Users`: Recommend keeping `Users.email` globally unique if a single login identity spans the platform, or scope `(shopId, email)` if users are strictly tenant-isolated accounts.
