# Zena POS — Tenant Isolation Matrix & Security Audit

## 1. Executive Summary & Multi-Tenancy Verdict

**Current Architectural Verdict**: **Single-Tenant per Deployment (Effectively Single-Tenant)**.

While the codebase attaches a `shopId` foreign key to most business tables to support multiple branch locations, Zena POS **does not implement true multi-tenant SaaS isolation**. Specifically:
1. **No Tenant / Organization Layer**: There is no `tenant_id` or `organization_id` construct. A single business is conflated with an individual `Shop`. Multiple shops cannot belong to a single parent company.
2. **Global Database Constraint Poisoning**: Core unique constraints (`Product.sku`, `Product.barcode`, `Sale.invoiceNumber`, `Category.name`, `Coupon.code`, `Customer.email`) are enforced globally across all records in MySQL. The moment a second tenant attempts to record a sale or add standard products, unique key collisions crash the transactions.
3. **Severe Broken Object-Level Authorization (BOLA / IDOR)**: High-severity endpoints permit cross-tenant data leaks and data tampering—including downloading invoices belonging to other shops, querying financial Profit & Loss data of arbitrary shops via URL query parameters, hijacking card sales from other shops, tampering with global store definitions, and altering global role permission matrices.
4. **Cache & Polling Gaps**: Several Redis and in-memory cache keys lack organization-level scoping or proper invalidation, and external payment status polling is completely unauthenticated.

---

## 2. Tenant Isolation Matrix

The table below details every major domain entity and operational boundary in Zena POS.

| Entity | Tenant Scoped (Y/N/Partial) | Shop Scoped (Y/N/Partial/N-A) | User Scoped (Y/N) | Isolation Verified (Y/N) | Notes |
|---|:---:|:---:|:---:|:---:|---|
| **Users** | ❌ N | ✅ Y | ✅ Y | ❌ N | No `organizationId`. `User.email` is globally unique. Two tenants cannot have users with the same email. |
| **Employees** | ❌ N | ✅ Y | ✅ Y | ❌ N | UUID primary key. `Employee.email` is globally unique across all shops. |
| **Shops / Businesses** | ❌ N | N-A (Root) | ❌ N | ❌ N | `Shop` is currently the top-level entity. No parent organization grouping exists. |
| **Stores** | ❌ N | ❌ N | ❌ N | ❌ N | **Un-isolated Entity**: Model has no `shopId`. `/api/stores` allows any user to read, edit, or delete any store globally. |
| **Categories** | ❌ N | ✅ Y | ❌ N | ❌ N | Has `shopId`. However, `Category.name` is globally unique. Shop B cannot create "Beverages" if Shop A has it. |
| **Brands** | ❌ N | ✅ Y | ❌ N | ⚠️ Partial | Factory model with `shopId`. Not imported or wired into `models/index.js`. |
| **Units** | ❌ N | ✅ Y | ❌ N | ⚠️ Partial | Factory model with `shopId`. Not imported or wired into `models/index.js`. |
| **Products** | ❌ N | ✅ Y | ❌ N | ❌ N | Has `shopId`. Critical failure: `sku` and `barcode` have global unique indexes in MySQL. Auto-generated SKU collides across shops. |
| **Inventory / Stock** | ❌ N | ✅ Y | ❌ N | ❌ N | Stock is kept as `stockQuantity` on `Products`. Lacks multi-location inventory ledger per tenant. |
| **Stock Movements** | ❌ N | ✅ Y | ✅ Y | ✅ Y | Scoped by `shopId` and tracked to `userId`. Validated in queries. |
| **Sales** | ❌ N | ✅ Y | ✅ Y | ❌ N | Has `shopId` and `userId`/`employeeId`. Critical failure: `invoiceNumber` is globally unique, but counter restarts at `0001` daily per shop, causing collisions. |
| **Sale Items** | ❌ N | ✅ Y | ❌ N | ✅ Y | Explicitly scoped by `shopId`, `saleId`, and `productId`. Enforced via foreign keys. |
| **Sale Payments** | ❌ N | ✅ Y | ✅ Y | ✅ Y | Scoped by `shopId`, `saleId`, and `processedBy` (UUID). |
| **Sale Refunds** | ❌ N | ✅ Y | ✅ Y | ✅ Y | Scoped by `shopId`, `saleId`, and `processedBy` (UUID). |
| **Held Carts** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId`. Filtered by `req.user.shopId`. |
| **Customers** | ❌ N | ✅ Y | ❌ N | ❌ N | Has `shopId`. Critical failure: `Customer.email` has a global unique index. Also, `adjustLoyaltyPoints` lacks `shopId` filter (IDOR). |
| **Suppliers** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId`. Filtered in controllers. |
| **Purchases** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId` and `supplierId`. Summary SQL query enforces `:shopId`. |
| **Purchase Items** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId` and `purchaseId`. |
| **Purchase Orders** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId` and `supplierId`. Summary SQL query enforces `:shopId`. |
| **Purchase Order Items** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId` and `purchaseOrderId`. |
| **Payments (Card / M-Pesa)** | ❌ N | ⚠️ Partial | ❌ N | ❌ N | `PendingPayment` has `shopId`. However, `cardRoutes.js:81` lookups omit `shopId` check, and `mpesaRoutes.js:109` status polling has NO authentication. |
| **Expenses** | ❌ N | ✅ Y | ✅ Y | ✅ Y | Scoped by `shopId` and `userId`. |
| **Invoices** | ❌ N | ✅ Y | ✅ Y | ❌ N | Has `shopId`. Critical failure: `invoiceController.js:170` allows any user with role `admin` to view and download PDF invoices of any other shop. |
| **Invoice Items** | ❌ N | ❌ N | ❌ N | ⚠️ Partial | Tied to `invoiceId`. No `shopId` column on item table itself. |
| **Coupons** | ❌ N | ✅ Y | ❌ N | ❌ N | Has `shopId`. Critical failure: `Coupon.code` is globally unique across all tenants. |
| **Discount Rules** | ❌ N | ✅ Y | ❌ N | ✅ Y | Scoped by `shopId`. |
| **System Settings** | ❌ N | ✅ Y | ❌ N | ✅ Y | Strictly scoped 1:1 with `shopId`. |
| **Activity Logs** | ❌ N | ✅ Y | ✅ Y | ✅ Y | Scoped by `shopId`, `performedBy`, and `performedByEmployee`. |
| **Permissions / Matrix** | ❌ N | ❌ N | ❌ N | ❌ N | System-wide global tables (`Permissions`, `RolePermissions`). Updating permissions alters rules for that role across all shops globally. |
| **Reports** | ❌ N | ⚠️ Partial | ❌ N | ❌ N | `getProfitAndLoss` accepts `?shopId=` query param override. `salesRange` in `reportsController:37` queries entire DB without `shopId`. |
| **Cache Keys (Redis)** | ❌ N | ⚠️ Partial | ❌ N | ❌ N | `products:shop:${shopId}` is shop-scoped but stale on sales. `permissions:role:${role}` is global with no tenant isolation. |
| **AI / Forecast Data** | ❌ N | ⚠️ Partial | ❌ N | ❌ N | Cache key `forecast:${shopId}:...` is shop-scoped, but `DELETE /api/ai/cache/:shopId` allows any admin to clear any shop's cache. Intersects with `BACKLOG-04`. |

---

## 3. End-to-End Request Tracing (Business-Critical Flows)

### Flow 1: Financial Profit & Loss Report (`GET /api/reports/profit-loss?shopId=X`)
- **HTTP Request**: Client sends `GET /api/reports/profit-loss?shopId=2` with JWT of User belonging to Shop 1.
- **Authentication**: `auth` middleware verifies RS256 token. Sets `req.user = decoded; req.shopId = 1;`.
- **User / Tenant Resolution**: Controller executes:
  ```javascript
  const { startDate, endDate, shopId: queryShopId } = req.query;
  const targetShopId = queryShopId ? parseInt(queryShopId, 10) : (req.shopId || req.user?.shopId);
  ```
- **Database Query**: Queries `Sales.findAll({ where: { shopId: 2 } })` and `Expenses.findAll({ where: { shopId: 2 } })`.
- **Response**: Full gross sales, COGS, itemized expenses, and net profit of **Shop 2** returned to **Shop 1 user**.
- **Isolation Status**: **BROKEN (P0 Leak / Spoofing)**. Tenant context from JWT is overridden by untrusted client query parameter.

### Flow 2: Commercial Invoice PDF Export (`GET /api/invoices/export-pdf/:id`)
- **HTTP Request**: Admin of Shop 1 requests `GET /api/invoices/export-pdf/42` (Invoice 42 belongs to Shop 2).
- **Authentication**: `auth` verifies RS256 token. `req.user = { id: 1, role: 'admin', shopId: 1 }`.
- **Tenant Verification**:
  ```javascript
  const invoice = await Invoice.findByPk(req.params.id, ...);
  if (req.user.role !== 'admin' && invoice.shopId !== req.user.shopId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  ```
  Because `req.user.role === 'admin'`, the expression `req.user.role !== 'admin'` evaluates to `false`. The second clause is never evaluated.
- **Database Query & Response**: Generates and streams PDF containing invoice number, items, prices, customer details, and business name of **Shop 2** to **Shop 1 admin**.
- **Isolation Status**: **BROKEN (P0 IDOR / Information Disclosure)**.

### Flow 3: Card Payment Verification (`POST /api/card/verify`)
- **HTTP Request**: User in Shop 1 posts `{ reference: 'FLW-TX-999' }` (where transaction was initiated by Shop 2).
- **Authentication**: Authenticated via `auth`.
- **Tenant Resolution**:
  ```javascript
  const pendingPayment = await PendingPayment.findOne({
    where: { checkoutRequestId: reference, paymentChannel: 'card' }
  });
  ```
  `shopId` is completely omitted from the query.
- **State Mutation & DB Query**: Updates `pendingPayment.status = 'confirmed'`. Calls `saleController.createSaleInternal(saleData, pendingPayment.shopId, userContext)` using Shop 2's `pendingPayment.shopId`.
- **Response**: Returns `res.json({ verified: true, sale: completeSale })` returning Shop 2's entire sale record to Shop 1.
- **Isolation Status**: **BROKEN (P0 Cross-Tenant State Mutation & Leak)**.

### Flow 4: Customer Loyalty Points Adjustment (`PUT /api/customers/:id/loyalty-points`)
- **HTTP Request**: Authenticated user in Shop 1 sends `PUT /api/customers/99/loyalty-points` with `{ points: 100, reason: "bonus" }` (Customer 99 belongs to Shop 2).
- **Authentication**: Authenticated via `auth`.
- **Tenant Resolution**:
  ```javascript
  const customer = await Customer.findOne({
    where: { id: req.params.id, active: true }
  });
  ```
  `shopId` is omitted from `where`.
- **Database Query**: Customer 99 is updated and returned in response.
- **Isolation Status**: **BROKEN (P1 IDOR / Data Tampering)**.

### Flow 5: Store Management (`GET /api/stores`, `POST /api/stores`, `DELETE /api/stores/:id`)
- **HTTP Request**: Authenticated user in Shop 1 accesses `/api/stores`.
- **Authentication**: Authenticated via `auth`.
- **Tenant Resolution**: `Store` model has no `shopId` or `organizationId` column.
- **Database Query**: `Store.findAll({ where: { isActive: true } })` returns all stores across the entire platform.
- **Isolation Status**: **BROKEN (P1 Missing Model Scoping)**.

### Flow 6: POS Sale Checkout (`POST /api/sales`)
- **HTTP Request**: Cashier submits checkout payload.
- **Authentication**: Verified via `auth`.
- **Tenant Resolution**: Controller correctly binds `shopId = req.shopId`.
- **Database Execution**:
  1. Computes totals and begins Sequelize transaction.
  2. Queries last invoice: `Sale.findAll({ where: { invoiceNumber: { [Op.like]: `${dateStr}-%` }, shopId } })`.
  3. Formulates invoice number: `${dateStr}-0001`.
  4. Executes `Sale.create(...)`.
- **Failure Mode**: If another shop made a sale on the same date, MySQL throws `SequelizeUniqueConstraintError` because `invoiceNumber` has a global unique index.
- **Isolation Status**: **BLOCKED (P1 Cross-Tenant Collision / Denial of Service)**.

---

## 4. Exhaustive Redis & Cache Key Pattern Audit

| Cache Store | Cache Key Pattern | Code Location | Tenant Scoped? | Filter/Param Scoped? | Staleness / Collision Analysis |
|---|---|---|:---:|:---:|---|
| **Redis** | `products:shop:${shopId}` | `productController.js:30`<br>`productCache.js:9` | ✅ Partial (Shop only) | ❌ N (Default query only) | **Critical Staleness Bug**: Cache has 600s TTL. It is invalidated on product create/edit/delete and purchase receive, but **NEVER invalidated on sale checkout or refund** (`createSaleInternal`). POS serves stale stock quantities. Not organization-scoped. |
| **Redis** | `permissions:role:${role}` | `permissionCache.js:13, 39, 70, 90` | ❌ NO | N-A | **Global Collision**: Key is shared across all shops (`permissions:role:cashier`). When one shop admin edits the permissions matrix, it invalidates and mutates permissions for all shops in the system. |
| **NodeCache** (In-Memory) | `analytics:${shopId}:${endpoint}:${JSON.stringify(normalizedParams)}` | `analyticsCache.js:14` | ✅ Partial (Shop only) | ✅ YES | Scoped to `shopId` and serializes all normalized params. Missing organization-level tenancy. |
| **NodeCache** (In-Memory) | `forecast:${shopId}:${model}:${periods}:${dataHash}` | `aiProxy.js:16, 27` | ✅ Partial (Shop only) | ✅ YES (Hash includes dates, values, periods) | Scoped by `shopId` (falls back to `'unknown'` if undefined). **Intersect with BACKLOG-04**: Forecast is not invalidated when delayed payment (M-Pesa/card) transitions from `pending` to `completed`. Also `DELETE /api/ai/cache/:shopId` lacks caller-shopId check. |
| **Frontend Map** (In-Memory) | `JSON.stringify({ url, params })` | `frontend/src/services/api.js:30, 35` | ❌ NO | ✅ YES | In-memory 3s TTL deduplication cache. Omits token, user ID, and shop ID. If user switches accounts or logs out/in quickly within 3s, responses can theoretically cross-contaminate in SPA memory. |
| **Frontend Map** (In-Memory) | `JSON.stringify(payload)` | `frontend/src/services/ai.service.js:4` | ❌ NO | ✅ YES | In-flight request deduplication for AI endpoints. Scoped to payload contents only. |
| **Frontend Ref** (In-Memory) | `JSON.stringify({ tab, ...baseParams })` | `frontend/src/pages/Reports.jsx:64, 127` | ❌ NO | ✅ YES | Component-level cache in React `useRef`. Retained for component lifecycle. |

---

## 5. Database & ORM Scoping Analysis

### 5.1 Model Scoping Inventory
- **Global Unique Constraints (Collisions Across Tenants)**:
  - `Users.email` -> Global unique constraint.
  - `Employees.email` -> Global unique constraint.
  - `Products.sku` -> Global unique constraint.
  - `Products.barcode` -> Global unique constraint.
  - `Categories.name` -> Global unique constraint.
  - `Coupons.code` -> Global unique constraint.
  - `Customers.email` -> Global unique constraint.
  - `Sales.invoiceNumber` -> Global unique constraint.
  - `Sales.idempotencyKey` -> Global unique constraint.
  - `Invoices.invoiceNumber` -> Global unique constraint.
  - `Permissions.name` -> Global unique constraint.
- **Models Completely Lacking Shop / Tenant Scoping**:
  - `Store`: No `shopId`, no `organizationId`.
  - `RolePermission`: No `shopId`, no `organizationId`.
  - `InvoiceItem`: Relies entirely on `invoiceId`, no direct tenant column.
  - `brand.js` & `unit.js`: Define `shopId` in factory functions, but never wired into `models/index.js`.
  - `Settings.js` (Legacy): No `shopId`.

### 5.2 Raw SQL Query Inspection
- `backend/src/routes/purchases.js:92`:
  ```sql
  SELECT ... FROM Purchases WHERE shopId = :shopId
  ```
  Enforces `:shopId` via Sequelize replacements.
- `backend/src/routes/purchaseOrders.js:73`:
  ```sql
  SELECT ... FROM PurchaseOrders WHERE shopId = :shopId
  ```
  Enforces `:shopId` via Sequelize replacements.
- `backend/src/controllers/analyticsController.js:200, 296, 396, 426`:
  Raw SQL queries all include `WHERE s.shopId = ?` or `WHERE s.shopId = :shopId`.
- `backend/src/controllers/reportsController.js:37-42`:
  ```javascript
  const salesRange = await Sale.findOne({
    attributes: [
      [sequelize.fn('MIN', sequelize.col('createdAt')), 'minDate'],
      [sequelize.fn('MAX', sequelize.col('createdAt')), 'maxDate']
    ]
  });
  ```
  **CRITICAL OMISSION**: No `where: { shopId }` clause. Scans the entire `Sales` table across all tenants to determine date bounds.

---

## 6. Auth & Middleware Layer Audit

1. **Source of Truth for Identity**:
   - `req.user` and `req.shopId` are derived from the cryptographically verified RS256 JWT claims in `backend/src/middleware/auth.js:14-15`.
   - However, multiple controllers fail to exclusively rely on `req.shopId`, accepting overrides from `req.query.shopId` (e.g. `reportsController.js:262`) or `req.body.shopId`.
2. **Incomplete Route Protection (`shopRequiredPaths`)**:
   - `auth.js:23` only rejects missing `shopId` on 7 paths: `['/api/sales', '/api/products', '/api/customers', '/api/employees', '/api/purchases', '/api/purchase-orders', '/api/suppliers']`.
   - Endpoints such as `/api/reports`, `/api/invoices`, `/api/stores`, `/api/analytics`, `/api/expenses`, `/api/settings`, `/api/permissions`, `/api/card`, `/api/mpesa`, and `/api/ai` execute without enforcing `shopId` presence.
3. **Unauthenticated Endpoints**:
   - `backend/src/routes/mpesaRoutes.js:109`: `GET /status/:checkoutRequestId` has no `auth` middleware, allowing unauthenticated attackers to poll payment status, obtain sale IDs, and harvest gateway references.
4. **Inter-Service AI Client Fallback**:
   - `backend/src/utils/aiClient.js:16, 52`: When generating internal JWTs for AI microservice requests, if `shopId` is omitted, it silently defaults to `shopId = 1` and elevates role to `role: 'admin'`.

---

## 7. Comprehensive Findings List

### [FINDING-01] Cross-Tenant Invoice PDF Disclosure via Admin Role Bypass
- **Severity**: **P0** (Cross-tenant data leak possible today)
- **Location**: `backend/src/controllers/invoiceController.js:170`
- **Current Behavior**: 
  ```javascript
  if (req.user.role !== 'admin' && invoice.shopId !== req.user.shopId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  ```
  Any user holding the `'admin'` role in *their own shop* evaluates `req.user.role !== 'admin'` to `false`. The shop ownership check is bypassed completely.
- **Expected Behavior**: Access must strictly require that `invoice.shopId === req.user.shopId` (or within the user's verified organization), regardless of whether their role is admin.
- **Impact**: Any merchant admin can view, download, and harvest confidential commercial invoices, customer details, sale items, and pricing from every other tenant on the platform.

---

### [FINDING-02] Financial Profit & Loss Report Query Parameter Tenant Override
- **Severity**: **P0** (Cross-tenant data leak possible today)
- **Location**: `backend/src/controllers/reportsController.js:261-262`
- **Current Behavior**:
  ```javascript
  const { startDate, endDate, shopId: queryShopId } = req.query;
  const targetShopId = queryShopId ? parseInt(queryShopId, 10) : (req.shopId || req.user?.shopId);
  ```
- **Expected Behavior**: `targetShopId` must strictly be derived from verified JWT claims (`req.shopId`), never from untrusted query parameters.
- **Impact**: Any authenticated merchant can append `?shopId=<any_id>` to `/api/reports/profit-loss` and view the entire financial performance (revenue, discounts, COGS, expenses, net margin) of any competitor.

---

### [FINDING-03] Card Payment Verification Cross-Tenant Sale Hijacking & Leak
- **Severity**: **P0** (Cross-tenant data leak possible today)
- **Location**: `backend/src/routes/cardRoutes.js:71-83, 115`
- **Current Behavior**: `PendingPayment.findOne({ where: { checkoutRequestId: reference, paymentChannel: 'card' } })` omits `shopId: req.shopId`. If a user passes a reference from another shop, the pending payment is confirmed, a sale is recorded under the victim shop, and the full sale object is returned to the caller.
- **Expected Behavior**: The lookup must strictly filter `where: { checkoutRequestId: reference, paymentChannel: 'card', shopId: req.shopId }`.
- **Impact**: Cross-tenant data exposure of complete sale transactions, customer identities, and product lines, plus unauthorized state modification of foreign payment records.

---

### [FINDING-04] Global Database Unique Constraints Prevent Multi-Tenancy
- **Severity**: **P1** (Leak or immediate operational failure under multi-tenant conditions)
- **Location**:
  - `backend/src/models/Product.js:17, 22` (`sku`, `barcode`)
  - `backend/src/models/Sale.js:15, 20` (`invoiceNumber`, `idempotencyKey`)
  - `backend/src/models/Category.js:13` (`name`)
  - `backend/src/models/Coupon.js:13` (`code`)
  - `backend/src/models/Customer.js:17` (`email`)
  - `backend/src/models/User.js:15` (`email`)
  - `backend/src/models/Employee.js:17` (`email`)
- **Current Behavior**: MySQL enforces unique indexes globally across the entire table. Auto-generated SKUs (`generateSKU`) and daily invoice numbers (`YYYYMMDD-0001` in `saleController.js:443`) calculate sequence numbers per shop, guaranteeing collisions on day one of a second tenant onboarding.
- **Expected Behavior**: Unique constraints must be composite indexes scoped to the tenant/organization: `UNIQUE(organizationId, sku)`, `UNIQUE(organizationId, invoiceNumber)`, etc.
- **Impact**: Fatal blocker for SaaS multi-tenancy. Tenants cannot create sales, add standard retail products with UPC barcodes, or register existing customer emails.

---

### [FINDING-05] Unauthenticated M-Pesa Transaction Status Polling
- **Severity**: **P1** (Leak possible without credentials)
- **Location**: `backend/src/routes/mpesaRoutes.js:109`
- **Current Behavior**: Route `GET /status/:checkoutRequestId` omits `auth` middleware. Anyone can query any checkout request ID without providing an Authorization header.
- **Expected Behavior**: Route must require `auth` middleware and verify that `pendingPayment.shopId === req.shopId`.
- **Impact**: Information disclosure of transaction amounts, payment status, internal sale IDs, and payment provider references.
- **Cross-Reference**: **`BACKLOG-04`** (Payment settlement lifecycle & cache synchronization).

---

### [FINDING-06] Global Store Model Lacks Tenant Scoping
- **Severity**: **P1** (Cross-tenant modification & leak)
- **Location**: `backend/src/models/Store.js`, `backend/src/routes/storeRoutes.js:13-28`, `backend/src/controllers/storeController.js:6, 22, 43, 61, 89`
- **Current Behavior**: `Store` table has no `shopId` or `organizationId` column. All CRUD routes allow any authenticated user to list, read, modify, and delete any physical store entity in the database.
- **Expected Behavior**: `Store` should either be unified with `Shop` or explicitly scoped to an `organizationId`.
- **Impact**: Any user can delete or tamper with stores belonging to other businesses.

---

### [FINDING-07] Global Role Permission Matrix Tampering
- **Severity**: **P1** (Cross-tenant security privilege tampering)
- **Location**: `backend/src/models/RolePermission.js`, `backend/src/controllers/permissionController.js:96-160`
- **Current Behavior**: `RolePermissions` is a global database table without tenant scoping. When any shop admin updates the matrix via `PUT /api/permissions/matrix`, it alters permissions for roles platform-wide and flushes Redis caches globally.
- **Expected Behavior**: Role permissions must either be system-wide immutable templates or customized strictly within an `organizationId` scope.
- **Impact**: A malicious admin in Shop A can disable permissions for `cashier` or grant sensitive permissions to roles across all other shops.

---

### [FINDING-08] Customer Loyalty Points Adjustment Missing Shop Filter (IDOR)
- **Severity**: **P1** (Cross-tenant data tampering)
- **Location**: `backend/src/controllers/customerController.js:298-300`
- **Current Behavior**: `Customer.findOne({ where: { id: req.params.id, active: true } })` lacks `shopId: req.user.shopId`.
- **Expected Behavior**: Must query `where: { id: req.params.id, shopId: req.user.shopId, active: true }`.
- **Impact**: Any authenticated user can inflate or clear loyalty points and append arbitrary notes to customers belonging to other shops.

---

### [FINDING-09] Global Sales Date Range Discovery Leaks Cross-Tenant Activity
- **Severity**: **P1** (Information leak under multi-tenant deployment)
- **Location**: `backend/src/controllers/reportsController.js:37-42`
- **Current Behavior**:
  ```javascript
  const salesRange = await Sale.findOne({
    attributes: [
      [sequelize.fn('MIN', sequelize.col('createdAt')), 'minDate'],
      [sequelize.fn('MAX', sequelize.col('createdAt')), 'maxDate']
    ]
  });
  ```
- **Expected Behavior**: Must include `{ where: { shopId } }`.
- **Impact**: Queries and logs min and max transaction timestamps across all tenants on the system.

---

### [FINDING-10] AI Forecast Cache Purge IDOR
- **Severity**: **P1** (Cross-tenant resource degradation)
- **Location**: `backend/src/routes/aiProxy.js:102`
- **Current Behavior**: `DELETE /api/ai/cache/:shopId` takes `shopId` from URL parameters and only checks `checkRole(['admin'])`. It does not verify that `req.shopId === req.params.shopId`.
- **Expected Behavior**: Admins must only be permitted to invalidate their own shop/organization cache.
- **Impact**: An admin can flush cached predictions for any other tenant, forcing costly re-computation on upstream AI models.

---

### [FINDING-11] Product Catalog Redis Cache Missing Sale Invalidation (Inventory Staleness)
- **Severity**: **P2** (Data integrity / staleness issue)
- **Location**: `backend/src/services/productCache.js:8`, `backend/src/controllers/saleController.js:400-500`
- **Current Behavior**: `products:shop:${shopId}` has a 600s TTL. `createSaleInternal` decrements product stock in MySQL but never calls `invalidateShopProductCache(shopId)`.
- **Expected Behavior**: Any inventory deduction (sale, refund, adjustment) must immediately invalidate or update the product cache.
- **Impact**: The POS catalog serves stale stock numbers for up to 10 minutes, leading to overselling.
- **Cross-Reference**: **`BACKLOG-04`** (Cache invalidation patterns).

---

### [FINDING-12] Complete Absence of Organization / Tenant Abstraction
- **Severity**: **P2** (Architectural multi-tenancy gap)
- **Location**: Data model platform-wide (`backend/src/models/`)
- **Current Behavior**: The system only models `Shop`. A merchant cannot own multiple shops, share a centralized product catalog, or aggregate reporting across branches.
- **Expected Behavior**: Introduction of an `Organization` (Tenant) root entity that owns `Shops`, `Users`, `Subscriptions`, and `Customers`.
- **Impact**: Restricts commercial scalability to single-shop merchants; prevents enterprise SaaS onboarding.

---

### [FINDING-13] Frontend In-Memory GET Cache Lacks Tenant/User Scoping
- **Severity**: **P3** (Defense-in-depth gap)
- **Location**: `frontend/src/services/api.js:30, 35`
- **Current Behavior**: `getCache` Map stores responses keyed only on `JSON.stringify({ url, params })` with a 3-second TTL.
- **Expected Behavior**: In-memory client caches should incorporate user/tenant identifiers or be explicitly purged upon logout/login transitions.
- **Impact**: Edge-case risk of serving previous tenant data if sessions are switched within a 3-second window on a shared POS terminal.
- **Cross-Reference**: **`BACKLOG-02`** (Session management / token revocation), **`BACKLOG-03`** (Multi-device session manager).

---

### [FINDING-14] aiClient Dynamic Token Generation Defaults to Shop 1 and Admin
- **Severity**: **P3** (Defense-in-depth gap)
- **Location**: `backend/src/utils/aiClient.js:16, 52`
- **Current Behavior**: `getAuthHeader` accepts `shopId = 1` as default parameter. If called without explicit shop context, signs a JWT with `{ shopId: 1, role: 'admin' }`.
- **Expected Behavior**: Must throw an error if `shopId` or `userId` are omitted, preventing fallback to shop 1.
- **Impact**: Accidental attribution of background or automated AI workloads to Shop 1.
- **Cross-Reference**: **`BACKLOG-01`** (AI digest cron runner context).
