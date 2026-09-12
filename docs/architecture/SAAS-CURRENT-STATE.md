# Zena POS — SaaS Transformation: Current-State Architecture Map

## 1. Executive Summary

Zena POS (`github.com/Warrenchris/zena-pos`) is currently architected as a **single-tenant, multi-shop POS and ERP system** for small and medium-sized retail businesses. While a previous development cycle attempted to introduce multi-tenancy by stamping a `shopId` foreign key onto most operational database tables, the platform **completely lacks a true tenant or organization abstraction**. 

In its current state:
- Each individual physical `Shop` acts as the root operational entity, preventing an enterprise merchant from operating multiple branch locations under a unified organization.
- Critical database unique constraints are enforced **globally across the entire database**, causing immediate collisions when distinct merchants use identical SKUs, barcodes, invoice numbers, customer emails, category names, or coupon codes.
- Multiple controllers, routes, and services permit cross-tenant data leaks, IDORs, and spoofing (e.g., query-parameter tenant overrides in financial reports, role-check bypasses on invoice PDF generation, unauthenticated payment polling, un-isolated `Store` resources, and global role permission tampering).
- Background jobs, SaaS subscription tiers, plan limits, and feature gating are non-existent.

---

## 2. Frontend Architecture

### 2.1 Application Shell & Routing
- **Core Technologies**: React 18.2.0, Vite 4.5.14, TailwindCSS 3.3.3, Redux Toolkit 1.9.5, React Router DOM 6.14.2.
- **Entry Pipeline**: `src/main.jsx` -> `src/App.jsx` -> `src/routes.jsx` (`AppRoutes`).
- **Route Hierarchy**:
  - **Public Routes**: `/login`, `/signup` (handled by unauthenticated views).
  - **Authenticated Shell**: `PrivateRoute` verifies token presence in Redux/localStorage and mounts `<Layout />`.
  - **Role-Based Navigation**:
    - `admin` users are directed to the executive `<Dashboard />`.
    - `cashier` and `employee` users are routed directly to `<CashierDashboard />` (POS checkout).
  - **Operational Modules**: Products, Categories, Customers, Employees, Sales, Expenses, Reports, Settings, Inventory/Stock Management, Purchases, Purchase Orders.
  - **SaaS / Super-Admin Placeholders**: `/super-admin`, `/applications`, `/layouts`, `/invoices`, `/sales/returns`, `/quotations`, `/coupons`, `/gift-cards`, `/discounts` currently render a static `<PlaceholderPage />`.

### 2.2 Authentication State & Tenant Selection
- **State Slice**: `src/store/slices/authSlice.js`.
  - Stored State: `user`, `shop`, `token`, `loading`, `error`.
  - Token Persistence: Stored in browser `localStorage` under key `'token'`.
  - Session Bootstrap: On app initialization and login, `authAPI.getProfile()` retrieves user details and active shop profile.
- **Tenant / Business Selection**:
  - **Completely Absent**: There is no UI or state mechanism for selecting or switching organizations or branches. A user is permanently pinned to the single `shopId` encoded in their JWT.

### 2.3 API Client & State Management
- **Axios HTTP Client**: `src/services/api.js`.
  - Base URL resolved dynamically from `VITE_API_URL` (defaults to `http://localhost:3000`).
  - **Request Interceptor**: Automatically attaches `Authorization: Bearer <token>` from `localStorage`.
  - **Response Interceptor**: Implements retry-with-backoff on HTTP 429 rate limits, and purges token on consecutive HTTP 401s.
  - **In-Memory Request Cache (`getCache`)**: Caches and de-duplicates concurrent GET requests for 3 seconds using `JSON.stringify({ url, params })`. *(Note: Cache key omits tenant/user identity; see Tenant Isolation Matrix)*.
- **State Management**:
  - 13 modular Redux slices: `authSlice`, `shopSlice`, `productsSlice`, `salesSlice`, `categoriesSlice`, `customersSlice`, `dashboardSlice`, `invoicesSlice`, `notificationsSlice`, `settingsSlice`, `unitsSlice`, `brandsSlice`, `analyticsSlice`.
  - No subscription, quota, or tenant entitlement state slice exists.

### 2.4 Permission Checks & Feature Visibility
- **Client-Side Authorization**:
  - Primitive checks against `user.role` (e.g. `role === 'admin'`).
  - Fine-grained permission matrices or subscription feature flags are not wired into the UI navigation; users see buttons for modules they may lack backend access to.

### 2.5 Error Handling
- **React Error Boundary**: `src/components/ErrorBoundary.jsx` catches runtime render errors.
- **Route Error Handling**: `src/pages/RouteError.jsx` catches unmatched paths and router exceptions.
- **API Errors**: Surfaced to users via toast notifications (`react-toastify`) and Redux rejected action states.

---

## 3. Backend Architecture

### 3.1 Entry Point & Middleware Pipeline
- **Runtime & Framework**: Node.js 18+ / 20+, Express 5.1.0 (`src/server.js`, `src/app.js`).
- **Server Port**: 3000.
- **Middleware Execution Order**:
  1. `app.set('trust proxy', 1)`
  2. HTTPS redirection middleware in production (`x-forwarded-proto`)
  3. `helmet()` (Security headers)
  4. `cors()` with origin validation against configured whitelist
  5. `rateLimit()`: 500 requests per 15-minute sliding window
  6. `morgan()` for HTTP access logging via Winston
  7. `express.json()` and `express.urlencoded({ extended: true })`
  8. `requestLogger`: Logs HTTP method, URL, and sanitized metadata
  9. Static uploads directory (`/uploads` -> `backend/uploads/`)
  10. Health check probe: `GET /`
  11. Route Mounts (`/api/*`)
  12. Centralized `errorHandler` middleware

### 3.2 Authentication & Authorization
- **Authentication**: `src/middleware/auth.js`.
  - **Algorithm**: Asymmetric RS256 JWT verification using public key (`JWT_PUBLIC_KEY`).
  - **Claim Extraction**:
    ```javascript
    req.user = decoded;
    req.shopId = decoded.shopId;
    ```
  - **Route Guard**: Rejects requests missing `shopId` on a hardcoded list of paths:
    `['/api/sales', '/api/products', '/api/customers', '/api/employees', '/api/purchases', '/api/purchase-orders', '/api/suppliers']`.
    *(Flaw: Excludes `/api/reports`, `/api/invoices`, `/api/stores`, `/api/analytics`, `/api/expenses`, `/api/settings`, `/api/permissions`, `/api/card`, `/api/mpesa`, `/api/ai`)*.
- **Authorization & RBAC**: `src/middleware/rolePermissions.js`.
  - Roles supported: `super_admin`, `admin`, `manager`, `cashier`, `employee`.
  - `admin` role bypasses all authorization checks (`admin: ['all']`).
  - Other roles check cached permissions in Redis (`permissions:role:${role}`) before falling back to MySQL `RolePermissions`.
- **Identity Architecture Split**:
  - Dual User Tables: `Users` (Admins/Managers, Integer PK) and `Employees` (Cashiers/Staff, UUID PK).
  - Login route checks `User.findOne`, and if not found, checks `Employee.findOne`.

### 3.3 Controllers & Data Access
- **Data Access Pattern**: Controllers directly invoke Sequelize models (`Product.findAll`, `Sale.create`, etc.).
- **Query Scoping**:
  - Most queries append `where: { shopId: req.user.shopId }`.
  - Multiple inconsistencies exist where `req.shopId`, `req.user.shopId`, `req.query.shopId`, or `req.body.shopId` are used interchangeably.
- **Raw SQL Queries**:
  - `backend/src/routes/purchases.js:92`: Raw SQL for summary metrics correctly parameterizes `:shopId`.
  - `backend/src/routes/purchaseOrders.js:73`: Raw SQL for summary metrics correctly parameterizes `:shopId`.
  - `backend/src/controllers/analyticsController.js:200, 296, 396, 426`: Raw SQL analytics queries correctly parameterize `shopId`.
  - `backend/src/controllers/reportsController.js:37`: Raw Sequelize call `Sale.findOne({ attributes: [MIN, MAX] })` omits `shopId`, scanning the entire database.

### 3.4 Background Jobs & Asynchronous Workflows
- **Queue Infrastructure**: No background job queue (e.g. BullMQ, Celery, or RabbitMQ) is currently implemented.
- **In-Process Timers**:
  - `aiProxy.js`: Runs an in-memory background polling timer (`scheduleNextProbe()`) to verify upstream AI service availability.
- **Pending / Planned Background Jobs**:
  - `BACKLOG-01`: AI Digest email cron runner (preference stored in `SystemSettings`, no cron scheduler active).

### 3.5 Test Infrastructure
- **Frameworks**: Jest 30.1.3, Supertest 6.3.3.
- **Configuration**: `NODE_ENV=test jest --runInBand --forceExit --detectOpenHandles`.
- **Lifecycle Hooks**:
  - `tests/setup.js`: Database ping, migration sync check, test shop bootstrapping.
  - `tests/teardown.js`: Sequelize connection close, Redis client disconnect.
- **Test Suites**:
  - Phase 1-4 integration test suites (`phase1.test.js` through `phase4.test.js`).
  - Dedicated gateway suites (`mysql-salepayments.test.js`).
  - Analytical correctness tests (`analyticsFix.test.js`).

### 3.6 Docker & Deployment Topology
- **Orchestration**: `docker-compose.yml`.
  - `mysql`: MySQL 8.0 container (mapped `3307:3306`), healthcheck via `mysqladmin ping`.
  - `redis`: Redis 7-Alpine container (mapped `6379:6379`), AOF enabled (`appendonly yes`), healthcheck via `redis-cli ping`.
  - `backend-migrate`: One-shot migration runner executing `npx sequelize-cli db:migrate` upon MySQL/Redis health.
  - `backend`: Node.js Express service on port 3000, configured with `NODE_OPTIONS=--dns-result-order=ipv4first`.
  - `frontend`: React/Vite development server on port 5173.
  - `ai_service`: FastAPI Python microservice on port 8000.
  - Network: Single bridge network `zana-network`.

---

## 4. Database Architecture & Entity Map

The database runs on **MySQL 8.0** managed via Sequelize ORM (v6.37.7). There are **32 models** in `backend/src/models/`.

### 4.1 Comprehensive Model & Table Inventory

| Table / Model Name | Primary Key | Tenant Scoped (`orgId`) | Shop Scoped (`shopId`) | User / Creator FK | Foreign Keys | Unique Constraints | Indexes |
|---|---|:---:|:---:|:---:|---|---|---|
| **Users** | `id` (INT) | ❌ NO | ✅ `shopId` | N/A | `shopId` -> `Shops(id)` | `email` (**GLOBAL**) | `PRIMARY`, `shopId`, `email` |
| **Employees** | `id` (UUID) | ❌ NO | ✅ `shopId` | N/A | `shopId` -> `Shops(id)` | `email` (**GLOBAL**) | `PRIMARY`, `shopId`, `email` |
| **Shops** | `id` (INT) | ❌ NO (is root) | N/A | None | None | None | `PRIMARY` |
| **Stores** | `id` (INT) | ❌ NO | ❌ **NO** | None | None | None | `PRIMARY` |
| **Categories** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` -> `Shops(id)`, `parentCategoryId` | `name` (**GLOBAL**) | `PRIMARY`, `shopId`, `name` |
| **Brands** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` -> `Shops(id)` | None | `PRIMARY`, `shopId` |
| **Units** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` -> `Shops(id)` | None | `PRIMARY`, `shopId` |
| **Products** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `categoryId`, `shopId` | `sku` (**GLOBAL**), `barcode` (**GLOBAL**) | `PRIMARY`, `shopId`, `categoryId`, `sku`, `barcode`, `ft_products_name` (FULLTEXT) |
| **StockMovements** | `id` (INT) | ❌ NO | ✅ `shopId` | `userId` | `shopId`, `productId`, `userId` | None | `PRIMARY`, `shopId`, `productId`, `userId`, `createdAt` |
| **Sales** | `id` (INT) | ❌ NO | ✅ `shopId` | `userId`, `employeeId` | `shopId`, `userId`, `employeeId`, `customerId` | `invoiceNumber` (**GLOBAL**), `idempotencyKey` (**GLOBAL**) | `PRIMARY`, `shopId`, `userId`, `employeeId`, `customerId`, `createdAt`, `saleStatus` |
| **SaleItems** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `saleId`, `productId`, `shopId` | None | `PRIMARY`, `saleId`, `productId`, `shopId` |
| **SalePayments** | `id` (INT) | ❌ NO | ✅ `shopId` | `processedBy` (UUID) | `saleId`, `shopId`, `processedBy` -> `Employees(id)` | None | `PRIMARY`, `saleId`, `shopId`, `processedBy`, `paymentChannel` |
| **SaleRefunds** | `id` (INT) | ❌ NO | ✅ `shopId` | `processedBy` (UUID) | `saleId`, `productId`, `shopId`, `processedBy` | None | `PRIMARY`, `saleId`, `productId`, `shopId` |
| **HeldCarts** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | None | `PRIMARY`, `shopId` |
| **Customers** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | `email` (**GLOBAL**) | `PRIMARY`, `shopId`, `email`, `phone` |
| **Suppliers** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | None | `PRIMARY`, `shopId` |
| **Purchases** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId`, `supplierId` | None | `PRIMARY`, `shopId`, `supplierId`, `status` |
| **PurchaseItems**| `id` (INT) | ❌ NO | ✅ `shopId` | None | `purchaseId`, `productId`, `shopId` | None | `PRIMARY`, `purchaseId`, `productId`, `shopId` |
| **PurchaseOrders**| `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId`, `supplierId` | None | `PRIMARY`, `shopId`, `supplierId`, `status` |
| **PurchaseOrderItems**| `id` (INT) | ❌ NO | ✅ `shopId` | None | `purchaseOrderId`, `productId`, `shopId` | None | `PRIMARY`, `purchaseOrderId`, `productId`, `shopId` |
| **Expenses** | `id` (INT) | ❌ NO | ✅ `shopId` | `userId` | `shopId`, `userId` | None | `PRIMARY`, `shopId`, `userId`, `createdAt` |
| **Invoices** | `id` (INT) | ❌ NO | ✅ `shopId` | `userId` | `shopId`, `userId`, `saleId` | `invoiceNumber` (**GLOBAL**) | `PRIMARY`, `shopId`, `userId`, `saleId`, `invoiceNumber` |
| **InvoiceItems** | `id` (INT) | ❌ NO | ❌ NO | None | `invoiceId`, `productId` | None | `PRIMARY`, `invoiceId`, `productId` |
| **PendingPayments**| `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | `checkoutRequestId` (GLOBAL) | `PRIMARY`, `shopId`, `checkoutRequestId`, `orderId` |
| **Coupons** | `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | `code` (**GLOBAL**) | `PRIMARY`, `shopId`, `code` |
| **DiscountRules**| `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | None | `PRIMARY`, `shopId` |
| **SystemSettings**| `id` (INT) | ❌ NO | ✅ `shopId` | None | `shopId` | None (1:1 with Shop) | `PRIMARY`, `shopId` (UNIQUE) |
| **ActivityLogs** | `id` (INT) | ❌ NO | ✅ `shopId` | `performedBy` | `shopId`, `performedByEmployee` | None | `PRIMARY`, `shopId`, `createdAt` |
| **Permissions** | `id` (INT) | ❌ N/A | ❌ N/A | None | None | `name` (**GLOBAL**) | `PRIMARY`, `name` |
| **RolePermissions**| `id` (INT) | ❌ N/A | ❌ N/A | None | `permissionId` -> `Permissions(id)` | None | `PRIMARY`, `role`, `permissionId` |
| **Settings** (Legacy)| `id` (INT)| ❌ NO | ❌ NO | None | None | None | `PRIMARY` |

---

## 5. External Systems & Integrations

### 5.1 Safaricom M-Pesa (Daraja 2.0 API)
- **Service & Routes**: `backend/src/services/mpesaService.js`, `backend/src/routes/mpesaRoutes.js`.
- **Capabilities**:
  - STK Push initiation (`/api/mpesa/initiate`).
  - Asynchronous webhook/callback processing (`/api/mpesa/callback`).
  - Frontend transaction status polling (`/api/mpesa/status/:checkoutRequestId`).
- **Credential Storage**: Merchant credentials (`MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`) are encrypted at rest using AES-256-CBC with an IV prepended to the ciphertext.
- **Callback Processing**: Verifies checkout response, transitions `PendingPayment` to `confirmed` or `failed`, and calls `saleController.createSaleInternal` to finalize the sale.

### 5.2 Flutterwave (Card Payments)
- **Service & Routes**: `backend/src/services/cardPaymentService.js`, `backend/src/routes/cardRoutes.js`.
- **Capabilities**:
  - Card checkout initialization (`/api/card/initiate`).
  - Payment reference verification (`/api/card/verify`).
- **Credential Storage**: System-wide `FLW_SECRET_KEY` environment variable.
- **Workflow**: Generates Flutterwave hosted payment link; on return, backend calls `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}` and completes the sale.

### 5.3 Redis 7 (Aiven / Local Docker)
- **Client**: `ioredis` (v5.11.1) initialized in `backend/src/config/redis.js`.
- **Connection**: Supports rediss:// TLS and IPv4 resolution (`family: 4`).
- **Use Cases**:
  1. Product catalogue caching (`products:shop:${shopId}`).
  2. RBAC role permission caching (`permissions:role:${role}`).

### 5.4 AI Forecasting Microservice (Python FastAPI)
- **Architecture**: Independent FastAPI microservice running on port 8000 (`ai_service/src/main.py`).
- **Algorithms**: Facebook Prophet (`/api/forecasting/forecast`) and Scikit-Learn Random Forest (`/api/forecasting/rf-forecast`).
- **Authentication**: Validates RS256 JWT tokens using the backend's shared `jwt_public_key.pem`.
- **Inter-Service Proxy**: Node.js backend proxies client requests via `backend/src/routes/aiProxy.js` using `backend/src/utils/aiClient.js`.

### 5.5 Email Service (SMTP / Nodemailer)
- **Implementation**: `backend/src/services/emailService.js`.
- **Use Cases**: Password reset emails and transactional receipts.

---

## 6. Existing Subscription / Billing Inventory
*(Note: Detailed billing architecture is out of scope and deferred per instructions)*.
- **Inventory Check Result**: **0% Implemented**.
  - There are no database tables for `Organizations`, `Plans`, `Subscriptions`, or `Invoices` (SaaS billing).
  - No payment webhooks exist for recurring SaaS subscription billing.
  - No server-side middleware or checks exist to verify whether a shop's account is in trial, active, past due, or expired.
