# Zana POS Receipt Redesign & QR Deployment Guide

This guide describes production deployment requirements for the receipt redesign, offline counter numbering, public receipt QR verification system, credit notes, and VAT invoicing.

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
4. **`20261026000000-add-vat-registered-to-system-settings.js`**
   - Adds `vatRegistered BOOLEAN NOT NULL DEFAULT 0` to `SystemSettings`.
5. **`20261026120000-create-credit-note-sequences-and-credit-notes.js`**
   - Creates `CreditNoteSequences` table with `(shopId, date)` unique index for sequential `CN-YYYYMMDD-NNNN` sequence locking.
   - Adds `creditNoteNumber` with unique constraint `(shopId, creditNoteNumber)`.
6. **`20261026130000-add-auto-print-receipt-to-system-settings.js`**
   - Adds `autoPrintReceipt BOOLEAN NOT NULL DEFAULT 0` to `SystemSettings`.

---

## 2. Required Environment Variables

### Backend (`backend/.env`)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis connection for distributed rate limiting (30 req/min/IP on `/api/public/receipts/:token`).
  
> [!NOTE]
> **In-Memory Rate Limiter Caveat**: If Redis is temporarily unreachable or offline, the endpoint automatically fails closed using a local in-memory Map fallback enforcing 30 req/min/IP. In multi-instance or load-balanced environments with multiple Node.js worker processes, each worker enforces this limit independently while Redis is disconnected. Once Redis reconnects, rate tracking resumes globally across all cluster nodes.

### Frontend (`frontend/.env` or build environment)
- **`VITE_PUBLIC_APP_URL`**:
  - Example: `https://app.zana.pos` (or `https://pos.yourstore.com`)
  - **Purpose**: Defines the public base domain used to construct customer-facing receipt verification URLs: `${VITE_PUBLIC_APP_URL}/r/${receiptToken}`.
  - **Build-Time Inlining Requirement**:
    - Vite bundles static client-side single-page applications. Any client-accessible variable prefixed with `VITE_` is statically replaced during the build step (`npm run build` / `vite build`).
    - It **must** be set in the build environment before running `vite build`; setting it as a server runtime environment variable after the bundle is compiled has no effect on pre-built assets.
  - **Where to Configure**:
    1. **Local and Staging Files**:
       - In `frontend/.env.production` (or `frontend/.env.local`):
         ```bash
         VITE_PUBLIC_APP_URL=https://app.zana.pos
         ```
    2. **Cloud Hosting Providers (Render, Vercel, Netlify, Cloudflare Pages)**:
       - Set `VITE_PUBLIC_APP_URL` in the provider's Environment Variables dashboard for the Frontend Static Site / Web Service before triggering the deployment build.
    3. **Docker Multi-Stage Builds**:
       - Pass as a build argument in `Dockerfile`:
         ```dockerfile
         ARG VITE_PUBLIC_APP_URL
         ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
         RUN npm run build
         ```
       - Command-line invocation:
         ```bash
         docker build --build-arg VITE_PUBLIC_APP_URL=https://app.zana.pos -t zana-pos-frontend .
         ```
    4. **CI/CD Pipelines (GitHub Actions, GitLab CI)**:
       - Export `VITE_PUBLIC_APP_URL` as an environment variable in the workflow step executing `npm run build`.
  - **Fallback Behavior**:
    - If `VITE_PUBLIC_APP_URL` is omitted or empty at build time, the frontend defaults to `''`.
    - `buildReceipt` automatically suppresses the receipt QR code cleanly without throwing errors or leaving broken image placeholders on thermal or browser receipts.
    - An explanatory warning badge is displayed in the **Settings > Receipt & Printer** tab to guide store administrators.

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

## 4. Post-Deploy Smoke Test Checklist

Execute these 7 end-to-end verification steps in staging or production immediately after deployment:

1. **Make a Sale**:
   - Complete a cash transaction in `CashierDashboard` or quick sale in `POSModal`.
   - Verify sale persists with a valid `receiptNumber` (`R-XXXX-NNNNNN`), `receiptTokenHash`, `cashierName`, and tax/change snapshots.
2. **Print Thermal/Browser Receipt**:
   - Inspect printed output (80mm or 58mm):
     - Header: Store name (bold caps), branch line, Tel & PIN line.
     - Title: Bold `SALES RECEIPT`.
     - Meta: Monospace invoice number, date, cashier, customer, payment.
     - Table: Column headers (`ITEM | QTY | UNIT PRICE | TOTAL`), bold item names with `qty × unitPrice` sub-line.
     - Totals: Subtotal, VAT/Tax line, dark highlighted TOTAL block, Amount Received, bold Change Due.
     - Footer: Tagline, receipt number (`Receipt No: R-XXXX-NNNNNN`), and QR code with scan caption.
3. **Scan Public QR Code**:
   - Scan the printed QR code with a smartphone camera.
   - Verify browser opens `{PUBLIC_APP_URL}/r/{token}` displaying the digital receipt.
   - Verify that customer name, phone number, and cashier name are **not visible** on the public view.
4. **Reprint Stored Sale**:
   - Open `Sales` or `MySales` and trigger reprint of a previous transaction.
   - Verify output includes the bold badge `DUPLICATE COPY`.
   - If locally stored `receiptToken` is absent, verify QR code is cleanly omitted without blank spaces or broken images.
5. **Offline Sale & Sync**:
   - Disconnect network connectivity (or toggle Chrome DevTools Offline mode).
   - Complete a cash sale: verify amber "OFFLINE SALE · PENDING SYNC" badge prints with client-generated receipt number `R-XXXX-NNNNNN`.
   - Reconnect network: verify sale syncs via `salesSync`, receives server invoice number, and maps locally in IndexedDB `syncMappings`.
6. **Credit Note (Returns)**:
   - Navigate to `SalesReturns.jsx` and issue an itemized return.
   - Click "Print Credit Note": verify thermal output prints `CREDIT NOTE`, references the original invoice number, displays negative item amounts and line totals, shows refund method (e.g. `Cash Refund`), and omits the QR code.
7. **A4 Invoice PDF**:
   - Open `Invoices.jsx` and download/view PDF invoice:
     - With `vatRegistered = false`: verify header title is `INVOICE`.
     - With `vatRegistered = true` and a valid KRA PIN in settings: verify header title is `TAX INVOICE`.

---

## 5. Rollback Plan

If a rollback is required, execute down migrations in reverse order:

```bash
cd backend

# 1. Rollback auto print receipt setting
npx sequelize-cli db:migrate:undo

# 2. Rollback credit note sequences and credit notes
npx sequelize-cli db:migrate:undo

# 3. Rollback VAT registered setting
npx sequelize-cli db:migrate:undo

# 4. Rollback public receipt token hash
npx sequelize-cli db:migrate:undo

# 5. Rollback receipt fields and settings columns
npx sequelize-cli db:migrate:undo

# 6. Rollback invoice sequences table
npx sequelize-cli db:migrate:undo
```

### Rollback Caveats
- If any sales were recorded using the new `receiptNumber` format, dropping the column will not destroy sales transactions (`id` and `invoiceNumber` remain preserved).
- Offline queued transactions synced during deployment will have recorded `receiptNumber` mappings in their local IndexedDB. Reverting backend validation will fall back gracefully to invoice numbering.
