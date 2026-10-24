# Zana POS Receipt Redesign & QR Deployment Guide

This guide describes production deployment requirements for the receipt redesign, offline counter numbering, and public receipt QR verification system.

---

## 1. Database Migrations (In Execution Order)

Run the following migrations via Sequelize CLI:

```bash
cd backend
npx sequelize-cli db:migrate
```

The migrations executed in sequence:

1. **`20261023000000-create-invoice-sequences-table.js`**
   - Creates the `InvoiceSequences` table.
   - Enforces unique constraint `(shopId, date)` for atomic, per-shop, per-day serial sequence locking (`SELECT ... FOR UPDATE`).
2. **`20261024000000-add-receipt-redesign-fields-to-sales-and-settings.js`**
   - Adds `receiptNumber VARCHAR(32) NULL` to `Sales` with unique constraint `(shopId, receiptNumber)`.
   - Adds `cashierName VARCHAR(120) NULL`, `taxAmount DECIMAL(10,2) NULL`, `taxRate DECIMAL(5,2) NULL`, `taxInclusive BOOLEAN NULL`, and `changeAmount DECIMAL(10,2) NULL` to `Sales`.
   - Adds `branch VARCHAR(100) NULL`, `tagline VARCHAR(255) NULL`, `showPoweredBy BOOLEAN DEFAULT true`, and `qrEnabled BOOLEAN DEFAULT false` to `SystemSettings`.
3. **`20261025000000-add-receipt-token-hash-to-sales.js`**
   - Adds `receiptTokenHash CHAR(64) NULL` to `Sales`.
   - Creates unique index `sales_receipt_token_hash_unique` on `receiptTokenHash`.

---

## 2. Required Environment Variables

### Backend (`backend/.env`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection for distributed rate limiting (30 req/min/IP on `/api/public/receipts/:token`).
  *Note: If Redis is temporarily unreachable, the endpoint automatically fails closed to a safe in-memory fallback.*

### Frontend (`frontend/.env` or build environment)
- **`VITE_PUBLIC_APP_URL`** (or `PUBLIC_APP_URL`):
  - Example: `https://app.zana.pos`
  - Defines the public root domain used to generate customer-facing receipt URLs: `${PUBLIC_APP_URL}/r/${receiptToken}`.
  - **Important**: If this environment variable is missing or empty, `qrEnabled` is automatically bypassed and thermal receipts print without a QR code (an alert is displayed in the Settings UI).

---

## 3. Reverse Proxy & Network Routing Rules

### Frontend Route (`/r/*`)
- The single-page app route `/r/:token` must be publicly accessible.
- Reverse proxies (Nginx, Caddy, Cloudflare, AWS CloudFront) must route `/r/*` directly to `index.html` without requiring any HTTP Basic Auth or session verification headers.

### Public Backend API (`/api/public/*`)
- `GET /api/public/receipts/:token` is unauthenticated and must **bypass** all JWT, Bearer token, and session auth middleware.
- The controller automatically sets strict privacy headers:
  ```http
  Cache-Control: no-store
  X-Robots-Tag: noindex
  ```
- Public receipt payloads are scrubbed of all PII: customer details, phone numbers, email addresses, cashier names, internal database IDs, and `receiptTokenHash` are never sent across the wire.

---

## 4. Rollback Plan

If a rollback is required, execute down migrations in reverse order:

```bash
cd backend

# 1. Rollback public receipt token hash
npx sequelize-cli db:migrate:undo

# 2. Rollback receipt fields and settings columns
npx sequelize-cli db:migrate:undo

# 3. Rollback invoice sequences table
npx sequelize-cli db:migrate:undo
```

### Rollback Caveats
- If any sales were recorded using the new `receiptNumber` format, dropping the column will not destroy sales transactions (`id` and `invoiceNumber` remain preserved).
- Offline queued transactions synced during deployment will have recorded `receiptNumber` mappings in their local IndexedDB. Reverting backend validation will fall back gracefully to invoice numbering.
