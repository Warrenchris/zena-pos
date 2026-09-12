# Zana POS — SaaS Data Migration Plan

## 1. Context & Objective

The existing Zana POS database contains operational data created under a single-business or shop-isolated schema. To transition into a multi-tenant SaaS platform:
1. Every existing shop must be safely provisioned with or linked to an **Organization**.
2. All operational records (`Products`, `Sales`, `Customers`, `Employees`, `Expenses`, etc.) must have unambiguous `organizationId` attribution.
3. Database unique constraints (SKU, Barcode, InvoiceNumber, CouponCode, CategoryName, CustomerEmail) must be transformed from global unique constraints to composite unique constraints (`organizationId, <column>`).
4. Zero records may be orphaned or assigned arbitrary guessed ownership.

---

## 2. Pre-Migration Data Audit & Integrity Check

### 2.1 Inventory of Existing Records
Run pre-migration diagnostics in MySQL:
```sql
-- Count existing records
SELECT 'Shops' AS entity, COUNT(*) AS total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count FROM Shops
UNION ALL
SELECT 'Users', COUNT(*), SUM(CASE WHEN shopId IS NULL THEN 1 ELSE 0 END) FROM Users
UNION ALL
SELECT 'Employees', COUNT(*), SUM(CASE WHEN shopId IS NULL THEN 1 ELSE 0 END) FROM Employees
UNION ALL
SELECT 'Products', COUNT(*), SUM(CASE WHEN shopId IS NULL THEN 1 ELSE 0 END) FROM Products
UNION ALL
SELECT 'Sales', COUNT(*), SUM(CASE WHEN shopId IS NULL THEN 1 ELSE 0 END) FROM Sales
UNION ALL
SELECT 'Customers', COUNT(*), SUM(CASE WHEN shopId IS NULL THEN 1 ELSE 0 END) FROM Customers;
```

### 2.2 Orphaned & Inconsistent Data Rules
1. **Shops without an Organization**:
   - Each distinct existing `Shop` represents an autonomous business branch.
   - For each existing `Shop(id, name)`, create an `Organization` with:
     - `name` = `Shop.name`
     - `slug` = `LOWER(REGEXP_REPLACE(Shop.name, '[^a-zA-Z0-9]', '-'))-[id]`
     - `status` = `'active'`
     - `trialEndsAt` = `NOW() + INTERVAL 30 DAY`
   - Set `Shop.organizationId = Organization.id`.
2. **Users and Employees without a Shop**:
   - If any `User` has `shopId IS NULL`, flag record: DO NOT GUESS.
   - If user email matches an administrator, associate with the primary organization; otherwise flag for manual administrator review.
3. **Stores Table Data**:
   - Inspect `Stores` table. The `Stores` table is un-referenced and duplicate to `Shops`.
   - If rows exist in `Stores`, compare names against `Shops`.
   - Backup `Stores` to `_legacy_stores_backup` before deprecating or migrating.

---

## 3. Migration Sequence & Steps

### Step 1: Create SaaS Core Schema (Migration Script: `YYYYMMDD-create-saas-core.js`)
1. Create `Organizations` table:
   - `id` (INT PK autoIncrement)
   - `name` (VARCHAR)
   - `slug` (VARCHAR UNIQUE)
   - `currency` (VARCHAR(3) default 'KES')
   - `status` (ENUM: 'trialing', 'active', 'past_due', 'canceled', 'suspended')
   - `trialEndsAt` (DATETIME)
2. Create `Plans` table:
   - Seed baseline tiers:
     - `starter`: 1 Shop, 3 Users, 1,000 Products, Basic Reports (KES 2,500/mo)
     - `growth`: 3 Shops, 10 Users, 10,000 Products, AI Forecasting (KES 6,000/mo)
     - `enterprise`: Unlimited Shops, Unlimited Users, AI Suite (KES 15,000/mo)
3. Create `Subscriptions` table:
   - `id` (INT PK autoIncrement)
   - `organizationId` (INT FK -> Organizations.id)
   - `planId` (INT FK -> Plans.id)
   - `status` (ENUM: 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED')
   - `currentPeriodEnd` (DATETIME)
4. Create `OrganizationMembers` table:
   - `id` (INT PK autoIncrement)
   - `organizationId` (INT FK -> Organizations.id)
   - `userId` (INT FK -> Users.id)
   - `role` (ENUM: 'owner', 'admin', 'manager', 'cashier')
   - `defaultShopId` (INT FK -> Shops.id)
   - `status` (ENUM: 'active', 'invited', 'suspended')
   - Composite unique key: `(organizationId, userId)`

### Step 2: Backfill Organizations & Memberships (Migration Script: `YYYYMMDD-backfill-organizations.js`)
1. Transactionally loop through all `Shops`:
   - Create corresponding `Organization`.
   - Create a 30-day active trial `Subscription` on the `growth` plan.
   - Update `Shops` table with `organizationId = Organization.id`.
2. For every `User` belonging to `shopId`:
   - Create `OrganizationMember` with `role = user.role === 'admin' ? 'owner' : user.role`.
   - Set `defaultShopId = user.shopId`.

### Step 3: Add `organizationId` to Operational Tables & Backfill
Add `organizationId` (INT, NULLABLE during backfill, then NOT NULL) to:
- `Products`
- `Categories`
- `Brands`
- `Units`
- `Customers`
- `Suppliers`
- `Sales`
- `SaleItems`
- `SalePayments`
- `SaleRefunds`
- `Purchases`
- `PurchaseItems`
- `PurchaseOrders`
- `PurchaseOrderItems`
- `Expenses`
- `Invoices`
- `PendingPayments`
- `Coupons`
- `DiscountRules`
- `ActivityLogs`

**Backfill Query Pattern:**
```sql
UPDATE Products p
INNER JOIN Shops s ON p.shopId = s.id
SET p.organizationId = s.organizationId
WHERE p.organizationId IS NULL;
```
Verify zero rows have `organizationId IS NULL` before adding foreign key constraint and `NOT NULL`.

### Step 4: Drop Global Unique Constraints & Create Composite Indexes
Execute ALTER TABLE statements:
1. `Products`:
   - `DROP INDEX sku` (or unique constraint)
   - `ADD CONSTRAINT uq_products_org_sku UNIQUE (organizationId, sku)`
   - `DROP INDEX barcode`
   - `ADD CONSTRAINT uq_products_org_barcode UNIQUE (organizationId, barcode)`
2. `Categories`:
   - `DROP INDEX name`
   - `ADD CONSTRAINT uq_categories_org_name UNIQUE (organizationId, name)`
3. `Coupons`:
   - `DROP INDEX code`
   - `ADD CONSTRAINT uq_coupons_org_code UNIQUE (organizationId, code)`
4. `Customers`:
   - `DROP INDEX email`
   - `ADD CONSTRAINT uq_customers_org_email UNIQUE (organizationId, email)`
5. `Sales`:
   - `DROP INDEX invoiceNumber`
   - `ADD CONSTRAINT uq_sales_org_invoice_number UNIQUE (organizationId, invoiceNumber)`

---

## 4. Rollback & Disaster Recovery Strategy

1. **Full Database Snapshot**:
   Before running migration scripts, take a full mysqldump:
   ```bash
   docker exec zana-mysql mysqldump -u root -proot zana_pos > backup_pre_saas_migration.sql
   ```
2. **Reversible Migration Steps**:
   Every migration file must implement an explicit `down` method reverting foreign keys, composite indexes, and added columns.
3. **Flagged Unresolved Records Table**:
   Any row whose `shopId` references a non-existent shop is inserted into `_unresolved_migration_records` with timestamp and raw payload, ensuring zero data loss.
