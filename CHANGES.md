# Zana POS Receipt Redesign Changelog

## Phase 1: Bug Fixes & Foundations

### Step 0 — Test Runner Setup
- Added `test:printing` npm script in `frontend/package.json`:
  ```bash
  npm run test:printing
  ```
  Exact command: `jest src/printing/__tests__ --runInBand --env=node --setupFilesAfterEnv="<rootDir>/src/printing/setupPrinting.cjs" --forceExit`
- Added lightweight node environment shim in `frontend/src/printing/setupPrinting.cjs` supporting `window`, `window.location`, `navigator.usb`, `navigator.serial`, `document.createElement('iframe')`, and `localStorage` to avoid jsdom/open handle hanging and allow test suites to run rapidly and reliably.

---

### Fix 1 — Stored Sale Reprints & Duplicate Copy
- **Files Modified**:
  - `frontend/src/printing/receiptModel.js`: Added `meta.isDuplicate` flag.
  - `frontend/src/printing/layout.js`: Added `*** DUPLICATE COPY ***` centered line directly below `RECEIPT` header when `meta.isDuplicate` is true.
  - `frontend/src/printing/printStoredSale.js`: Created shared helper that normalizes stored sale objects (handling `SaleItems`, `items`, `products`, `Customer`, etc.) into `buildReceipt()` format with `isDuplicate = true`, calls `printReceipt()`, and displays toast errors on printer failure.
  - `frontend/src/printing/index.js`: Exported `printStoredSale`.
  - `frontend/src/components/SaleDetailModal.jsx`: Replaced raw `window.print()` with `printStoredSale(sale)`.
  - `frontend/src/pages/Sales.jsx`: Updated to use `printStoredSale`.
  - `frontend/src/pages/MySales.jsx`: Replaced `console.log` callback with direct `printStoredSale(sale)`.
- **Tests Added**:
  - `frontend/src/printing/__tests__/reprint.test.js`: Verified `isDuplicate` flag, layout rendering of `*** DUPLICATE COPY ***`, and toast handling on failure.

---

### Fix 2 — Offline Numbering (`R-<deviceId>-<counter>`)
- **Files Modified**:
  - `frontend/src/offline/idb.js`: Bumped `DB_VERSION` to 2; added `counters` and `syncMappings` object stores.
  - `frontend/src/offline/offlineNumbering.js`: Implemented `getDeviceId()` (4-character alphanumeric device identifier persisted in `localStorage`) and `getNextReceiptNumber()` (returns `R-<deviceId>-<counter zero-padded to 6>`, incremented atomically inside a single IndexedDB transaction).
  - `frontend/src/pages/CashierDashboard.jsx`: Replaced `OFFLINE-<last4>` with `await getNextReceiptNumber()`; set `invoiceNumber: null` while offline.
  - `frontend/src/printing/receiptModel.js` & `frontend/src/printing/layout.js`: Updated to display `Pending` when `invoiceNumber` is null or pending, and render `Receipt No: R-XXXX-XXXXXX`.
- **Tests Added**:
  - `frontend/src/printing/__tests__/offlineNumbering.test.js`: Verified format `R-[A-Z0-9]{4}-\d{6}`, verified 1,000 rapid calls yield 1,000 unique sequential values, and verified counter persistence across simulated reloads.

---

### Fix 3 — Invoices.jsx & Backend PDF Real Data
- **Files Checked & Modified**:
  - `backend/src/controllers/invoiceController.js`: Inspected `generatePDF`; discovered hard-coded dummy text and missing business details. Updated `generatePDF` to include `Shop`, `InvoiceItem` (`Product`), `User`, and `Employee`, rendering real business name, address, phone number, KRA PIN, full itemized table, subtotal, discount, tax, and total.
  - `backend/src/utils/currency.js`: Implemented and exported `formatCurrency` for backend PDF formatting.
  - `frontend/src/pages/Invoices.jsx`: Deleted frontend `COMPANY` object and dead `generatePdfDoc()`. Updated Download and Print buttons to trigger `GET /api/invoices/:id/pdf` directly via browser blob downloads and print windows.

---

### Fix 4 — Currency Consolidation
- **Files Modified**:
  - `frontend/src/store/slices/settingsSlice.js`: Made `formatCurrency` canonical source of truth for `"KSh 5,600.00"`.
  - `frontend/src/utils/currencyUtils.js`: Made `formatCurrencyWithSettings` a thin delegating wrapper.
  - `frontend/src/utils/currencyFormatters.js`: Made `formatAmount` a thin delegating wrapper.
- **Tests Added**:
  - `frontend/src/printing/__tests__/currency.test.js`: Verified `5600` ("KSh 5,600.00"), `1234567.5` ("KSh 1,234,567.50"), `0` ("KSh 0.00"), negative ("KSh -500.00"), and `5999.94` ("KSh 5,999.94").

---

### Fix 5 — Change Calculation & Cash Validation
- **Files Created & Modified**:
  - `frontend/src/utils/changeCalculation.js`: Created dedicated module exporting `calculateChange`, `roundToCents`, `roundToTwoDecimals`, `hasSubShillingFraction`, and `isCashPaymentValid` using integer cents (`Math.round(x * 100)`).
  - `frontend/src/pages/CashierDashboard.jsx`: Replaced floating-point change calculation with `calculateChange(paymentAmount, total)`; validated cash payment amount before submission.
  - `frontend/src/components/PaymentModal.jsx`: Pinned change calculation to `calculateChange`; rounded amount input to 2 decimal places on blur; disabled Complete Sale button when `amountReceived < total`; added non-blocking warning when cash tendered has sub-shilling fractions (cents).
- **Tests Added**:
  - `frontend/src/printing/__tests__/changeCalculation.test.js`: Verified `10.30 - 10.00 === 0.30` (which fails in IEEE-754 float arithmetic), odd cents (`6000.00 - 5999.94 === 0.06`), sub-shilling fraction detection, and cash validation.

---

### Fix 6 — Timezone Pinning to Africa/Nairobi
- **Files Modified**:
  - `frontend/src/utils/formatters.js`: Updated `formatDateTime` to format strictly as `YYYY-MM-DD HH:mm` pinned to `Africa/Nairobi` (UTC+3) using `Intl.DateTimeFormat` with `hourCycle: 'h23'`.
  - `frontend/src/printing/layout.js`: Replaced local `formatReceiptDate` implementation with delegation to `formatters.formatDateTime`.
- **Tests Added**:
  - `frontend/src/printing/__tests__/timezone.test.js`: Verified identical output (`2026-08-26 09:52`) under `TZ=UTC`, `TZ=America/New_York`, and `TZ=Asia/Tokyo`.

---

### Fix 7 — Backend Invoice Number Sequence & Concurrency
- **Files Created & Modified**:
  - `backend/src/models/InvoiceSequence.js`: Created model for per-shop, per-day sequence counters with unique index on `(shopId, date)`.
  - `backend/migrations/20261023000000-create-invoice-sequences-table.js`: Added migration creating `InvoiceSequences` table.
  - `backend/src/models/index.js`: Registered `InvoiceSequence` model and associations.
  - `backend/tests/setupAfterEnv.js`: Added `InvoiceSequence` to `DELETED_EPHEMERAL_MODELS` to satisfy schema drift protection.
  - `backend/src/utils/invoiceSequence.js`: Implemented `generateNextInvoiceNumber({ shopId, transaction, date })` using `SELECT ... FOR UPDATE` inside the sale transaction.
  - `backend/src/controllers/saleController.js`: Replaced range query "read last invoice then +1" with `generateNextInvoiceNumber`.
- **Tests Added**:
  - `backend/tests/invoiceSequence.unit.test.js`: Pure-logic unit test verifying sequential zero-padded numbers (`0001`..`0020`), shop isolation, date isolation, pre-existing sale seeding, and simulated concurrency with row locking (5 / 5 tests passed).
  - `backend/tests/invoiceSequence.concurrency.test.js`: Concurrency integration test for 20 parallel transactions (marked as requiring a live database; skips gracefully if MySQL is offline).

---

### Fix 8 — Sync Reconciliation
- **Files Created & Modified**:
  - `frontend/src/offline/syncMappings.js`: Created module to persist `{ receiptNumber, serverInvoiceNumber, syncedAt }` in IndexedDB (`syncMappings` store) with localStorage fallback.
  - `frontend/src/pages/CashierDashboard.jsx`: Attached `receiptNumber` to `offlineSaleData` when queuing offline sales.
  - `frontend/src/offline/salesSync.js`: On successful sync, called `saveSyncMapping(receiptNumber, serverInvoiceNumber)`.
  - `frontend/src/printing/printStoredSale.js`: Before printing reprints, checks `getServerInvoiceNumber(receiptNumber)`; if found, resolves `invoiceNumber` to the real server invoice number.
- **Tests Added**:
  - `frontend/src/printing/__tests__/syncReconciliation.test.js`: Verified mapping persistence and lookup; verified that an offline sale reprinted after sync resolves the server invoice number.

---

### Fix 9 — Email Receipt Feature Flag
- **Files Modified**:
  - `frontend/src/components/SaleCompleteModal.jsx`: Added `const EMAIL_RECEIPTS_ENABLED = false` with an explanatory comment documenting that backend endpoint `POST /api/invoices/:id/email` currently returns HTTP 501 Not Implemented; wrapped Email Receipt button with this flag.

---

### Non-Receipt Pattern Inventory (For Future Cleanup)
#### 1. Remaining `window.print()` Calls
- `frontend/src/pages/PurchaseOrders.jsx`: Purchase order print button triggers raw `window.print()`.
- `frontend/src/pages/Purchases.jsx`: Purchase modal print button triggers raw `window.print()`.
- `frontend/src/pages/Reports.jsx`: Report print handler calls raw `window.print()`.
- `frontend/src/pages/SalesReturns.jsx`: Credit note print button calls raw `window.print()`.

#### 2. Other `Date.now()` Identifiers
- `backend/src/models/Invoice.js`: Hook generates `INV-${Date.now()}-${shopId}`.
- `backend/src/controllers/invoiceController.js`: Generates `INV-${Date.now()}-${shopId}`.
- `backend/src/routes/purchaseOrders.js`: Generates `PUR-...-${Date.now().toString().slice(-4)}`.
- `backend/src/routes/purchases.js`: Generates purchase references using `Date.now().toString().slice(-4)`.
- `backend/src/services/billingService.js`: Generates `INV-SUB-${Date.now()}-${organizationId}`.
- `frontend/src/components/PaymentModal.jsx`: Generates payment order references `ord-split-${Date.now()}` and `ord-${Date.now()}`.
- `frontend/src/pages/Coupons.jsx` & `Discounts.jsx`: Generates temporary local IDs with `String(Date.now())`.
- `frontend/src/pages/SalesReturns.jsx`: Generates temporary references `ref_${Date.now()}_${random}`.


---

## Phase 2: Data Model & Snapshots

### 1. Database Schema & Migrations
- **Files Created & Modified**:
  - `backend/migrations/20261024000000-add-receipt-redesign-fields-to-sales-and-settings.js`: Added migration adding missing receipt fields:
    - `Sales`: `receiptNumber VARCHAR(32) NULL` with unique constraint `(shopId, receiptNumber)`, `cashierName VARCHAR(120) NULL`, `taxAmount DECIMAL(10,2) NULL`, `taxInclusive BOOLEAN NULL`, `changeAmount DECIMAL(10,2) NULL`.
    - `SystemSettings`: `branch VARCHAR(100) NULL`, `tagline VARCHAR(255) NULL`, `showPoweredBy BOOLEAN NOT NULL DEFAULT 1`, `qrEnabled BOOLEAN NOT NULL DEFAULT 0`.
  - `backend/src/models/Sale.js`: Registered new columns `receiptNumber`, `cashierName`, `taxAmount`, `taxInclusive`, `changeAmount`.
  - `backend/src/models/SystemSettings.js`: Registered new columns `branch`, `tagline`, `showPoweredBy`, `qrEnabled`.

### 2. Backend Sales & Settings APIs
- **Files Modified**:
  - `backend/src/controllers/saleController.js`:
    - Validates `receiptNumber` format (`R-[A-Z0-9]{4}-\d{6}`).
    - Replays sale on matching idempotency key; rejects with HTTP 409 `RECEIPT_NUMBER_ALREADY_EXISTS` if `receiptNumber` exists under a different idempotency key.
    - Snapshots `cashierName` from `req.user` (or employee) at sale time.
    - Snapshots `taxAmount`, `taxRate`, `taxInclusive`, and `changeAmount`.
  - `backend/src/routes/settings.js`: Added schema validation for `branch`, `tagline`, `showPoweredBy`, and `qrEnabled`.
  - Sale GET endpoints return all snapshotted fields for receipts and reprints.

### 3. Frontend Settings & Redux Store
- **Files Modified**:
  - `frontend/src/store/slices/settingsSlice.js`: Added `branch`, `tagline`, `showPoweredBy`, `qrEnabled` to state and whitelist.
  - `frontend/src/printing/receiptSettings.js`: `buildReceiptSettings` captures the 4 new settings with sensible defaults (`showPoweredBy: true`, `qrEnabled: false`).
  - `frontend/src/hooks/useReceiptSettings.js`: Exposed new settings to printing consumers.
  - `frontend/src/pages/Settings.jsx`: Added UI input fields for Branch, Tagline, Show Powered By toggle, and Enable Receipt QR toggle.

### 4. Cashier Sale Snapshotting
- **Files Modified**:
  - `frontend/src/pages/CashierDashboard.jsx`:
    - Captures `cashierName` from logged-in user.
    - Allocates `receiptNumber` from the atomic IndexedDB sequence counter for EVERY sale (both online and offline).
    - Snapshots `taxAmount`, `taxRate`, `taxInclusive`, and `changeAmount` at sale time in the sale submission payload and completed sale record.

### 5. Receipt Model & Credit Note
- **Files Modified**:
  - `frontend/src/printing/receiptModel.js`:
    - Added `@typedef {object} ReceiptData` defining the full canonical structure.
    - `buildReceipt()` carries `documentType`, `isDuplicate`, `meta` (`receiptNumber`, `invoiceNumber`, `pendingSync`, `cashierName`, `dateTime`, `customerName`, `paymentLabel`), `business` (`branch`, `tagline`, `showPoweredBy`, `qrEnabled`), and `totals` (`subtotal`, `discount`, `total`, `tendered`, `change`, `tax: { amount, rate, inclusive }`).
    - Added `buildCreditNote(returnRecord, options)` outputting `documentType: 'CREDIT_NOTE'` with negative line quantities, unit prices, line totals, grand total, and tax refund amount.
  - `frontend/src/printing/printStoredSale.js`: Prioritizes snapshotted values from stored sales; checks offline sync mappings; falls back to `invoiceNumber` or `id` for legacy sales.

---

## Phase 3: Layout (`printing/layout.js`)

### 1. Narrow Roll Layout Architecture
- **Files Modified**:
  - `frontend/src/printing/layout.js`: Redesigned `layoutReceipt(receipt, { charsPerLine, formatMoney })` implementing the target roll-style layout for 80mm (~48 columns) and 58mm (~32 columns).
  - `frontend/src/printing/text.js`: Added middle dot `\u00B7` -> `.` and bullet `\u2022` -> `*` transliterations to `REPLACEMENTS` ensuring all output strictly remains single-byte ASCII for thermal printers.
  - `frontend/src/printing/renderers.js`: Added styling classes (`.hl` for highlighted total, `.muted` for sub-lines/wordmark, `.banner` for offline status box) in `renderHtml`.

### 2. Layout Structure & Design Rules
1. **Header**:
   - `ZANA POS` wordmark centered (muted), displayed unless `business.showPoweredBy === false`.
   - Store name in bold caps (`String(business.name).toUpperCase()`) rendered double-height/double-width.
   - Branch line in uppercase if set.
   - Address if set and distinct from branch.
   - Single combined line: `Tel: <phone> | PIN: <kraPin>`. On narrow 58mm roll (32 columns), wraps onto two clean lines if combined text exceeds 32 characters.
   - Custom header textarea text (if configured in settings).
   - Horizontal divider rule (`rule(width)`).
2. **Title**:
   - `SALES RECEIPT` (or `CREDIT NOTE` for return transactions).
   - `*** DUPLICATE COPY ***` centered directly below title when `meta.isDuplicate` is true.
3. **Meta Block**:
   - Monospace key-value lines: `Invoice` (`#...` or `Pending`), `Receipt No` (`R-XXXX-NNNNNN`), `Date` (`YYYY-MM-DD HH:mm` pinned to `Africa/Nairobi`), `Cashier`, `Customer`, `Payment`.
   - For credit notes: `Original Invoice` (`#...`), `Reason` (`notes`).
4. **Status Banner**:
   - Bordered ASCII box when `meta.pendingSync || meta.isOffline`:
     ```
     +----------------------------------------------+
     |         OFFLINE SALE * PENDING SYNC          |
     +----------------------------------------------+
     ```
5. **Items Table**:
   - **80mm Roll (48 columns)**:
     - Header row: `ITEM                      QTY UNIT PRICE    TOTAL` followed by divider rule.
     - Row 1: Item name (up to 24 chars) with right-aligned `QTY`, `UNIT PRICE` (2 dp and thousands separators), and `TOTAL` (2 dp and thousands separators).
     - Wrapped rows for long item names.
     - Sub-line: `  ${quantity} x ${money(unitPrice)}`.
     - Indented modifiers, line notes, and line discounts.
   - **58mm Roll (32 columns)**:
     - Item name (bold).
     - Sub-line: `  ${quantity} x ${unitPrice}` left, `lineTotal` right.
     - Indented line notes and discounts.
   - Divider rule.
6. **Totals**:
   - `Subtotal`.
   - `Discount` (if > 0).
   - `Tax` breakdown: `Tax (16% incl.)` or `Tax (16%)` based on tax inclusive flag.
   - Highlighted `TOTAL` row (`double: true` / inverse / tinted bar).
   - If cash: `Amount Received`, `Change Due` (bold).
7. **Footer**:
   - `Thank you for your business!` centered between two horizontal rules (or custom footer).
   - Store tagline centered (if set).
   - `Receipt No: <receiptNumber>`.
   - `Powered by Zana POS` (unless `showPoweredBy === false`).
   - QR code slot placeholder (`[ QR CODE ]` when `business.qrEnabled === true`).

### 3. Tests & Verification
- **Test File Added**:
  - `frontend/src/printing/__tests__/layoutPhase3.test.js`:
    - 80mm layout verification (48-column limits, header, title, meta, 4-col table, sub-lines, totals, footer).
    - 58mm layout verification (32-column limits, 2-line item layout, wrapped contact info, totals).
    - Offline status banner rendering and pending invoice status.
    - Duplicate copy indicator placement.
    - Credit note document layout with negative quantities, unit prices, line totals, and grand total.
    - Tax-exclusive vs. tax-inclusive breakdown.
    - Zero-tax sale line omission.
    - White-label toggle verification (`showPoweredBy = false`).
    - `renderHtml` markup and CSS class verification.
    - `renderEscPos` byte stream validation (ASCII bytes < 0x80, ESC/POS control codes).
- **Verification Results**:
  - Frontend printing test suite: **20 / 20 test suites passed, 179 / 179 tests passed** (`npm run test:printing`).
  - Backend unit test suite: **2 / 2 test suites passed, 9 / 9 tests passed** (`npm run test:unit`).

---

## Pre-Phase 4 Cleanups & Phase 4: HTML Receipt Renderer

### 1. Pre-Phase 4 Cleanups
- **Sale.taxRate Verification**:
  - Confirmed `Sale.taxRate` exists and is persisted at sale time in `backend/src/models/Sale.js` and `backend/src/controllers/saleController.js`.
- **Database & Concurrency Verification**:
  - Ran `receiptNumberValidation.db.test.js` and `invoiceSequence.concurrency.test.js` against live MySQL 8.0 (`127.0.0.1:3307`). Both test suites passed.
- **Settings QR Toggle & Placeholder**:
  - Temporarily hid the "Enable Receipt QR" toggle in `frontend/src/pages/Settings.jsx`.
  - Removed `[ QR CODE ]` placeholder from `layout.js` and HTML renderer until Phase 5.
- **Meta Block Alignment**:
  - Removed "Receipt No" from meta block in `frontend/src/printing/layout.js`; kept in receipt footer only (matching target design).
- **Collision & Conflict Handling**:
  - Added 409 `RECEIPT_NUMBER_ALREADY_EXISTS` collision retry with bumped counter in `frontend/src/pages/CashierDashboard.jsx`.
  - In `frontend/src/offline/salesSync.js`, mapped 409 response to `kind: 'conflict'` and marked queue entries with `status: 'conflict'` without mutating the printed receipt number.
  - Exposed conflict queue and conflict count in `frontend/src/hooks/usePendingSales.js` and added conflict banner in `CashierDashboard.jsx`.
  - Added localStorage fallback with warning callback when IndexedDB is unavailable in `frontend/src/offline/offlineNumbering.js`.

---

### 2. Phase 4 — Dedicated HTML Receipt Renderer
- **Module Created**: `frontend/src/printing/htmlReceipt.js`
  - Exported `renderReceiptHtml(receiptData, { widthMm = 80, formatMoney })` building semantic HTML directly from `ReceiptData` (bypassing ESC/POS line-layout padding).
  - Exported `escapeHtml(str)` for sanitizing user-provided strings against XSS.
- **Target Roll Receipt Design Implemented**:
  - **Paper Sizing & Print Styles**:
    - `@page { size: ${width}mm auto; margin: 0; }`
    - `@media print`: `-webkit-print-color-adjust: exact`, zero page margins, exact width constraint.
    - Strictly light-theme (`color-scheme: light`, black text on white container).
    - Scoped CSS rules under `.receipt-container` preventing style bleed into parent components.
  - **Header Block**:
    - Brand row: optional logo next to `ZANA POS` wordmark (omitted when `showPoweredBy === false`).
    - Store name: bold caps via CSS `text-transform: uppercase`.
    - Branch line: uppercase subtitle.
    - Contact line: `Tel: ... | PIN: ...` in muted styling.
    - Custom header lines (if set in settings).
    - Divider rule (`<hr class="divider-rule" />`).
  - **Title & Duplicate Indicator**:
    - `SALES RECEIPT` or `CREDIT NOTE` in bold large text.
    - `*** DUPLICATE COPY ***` badge below title when `isDuplicate: true`.
  - **Meta Block**:
    - Clean monospace block (`ui-monospace, "Courier New", Courier, monospace`).
    - `Invoice: #...` (or `Invoice: Pending` for un-synced offline sales).
    - `Date:` formatted to `YYYY-MM-DD HH:mm` pinned to `Africa/Nairobi` (UTC+3).
    - `Cashier:` cashier name snapshot.
    - `Customer:` omitted when null, empty, or 'Walk-in Customer'.
    - `Payment:` payment method label.
    - For credit notes: `Original Invoice: #...` and `Reason: ...`.
  - **Offline Status Banner**:
    - Rendered when `pendingSync` or `isOffline` is true.
    - Tinted background (`#fef3c7`, text `#92400e`), bold text `OFFLINE SALE · PENDING SYNC`.
    - Self-contained inline SVG icon (zero network requests).
  - **Items Layout**:
    - **80mm Paper**: 4-column table (`ITEM` 48%, `QTY` 12%, `UNIT PRICE` 20%, `TOTAL` 20%) with `table-layout: fixed` and `word-break: break-word`. Bold item name, sub-line `quantity × unitPrice`, indented notes and discounts.
    - **58mm Paper**: Collapsed 2-line layout per item (`item-block-58`, `item-row-58`) preventing column collision on narrow rolls.
  - **Totals Section**:
    - Subtotal, optional discount line (`-KSh ...`), tax breakdown (`Tax (16% incl.)` or `Tax (16%)`).
    - Large highlighted `TOTAL` bar with light-grey background (`#f1f5f9`), bold text, and tabular numbers.
    - `Amount Received` and `Change Due` (bold). Credit notes display negative refund totals.
  - **Footer Block**:
    - Divider rules around `Thank you for your business!` (or custom footer text).
    - Centered tagline from business settings.
    - Monospace `Receipt No: R-XXXX-NNNNNN` (falls back to `invoiceNumber` for legacy sales).
    - `Powered by Zana POS` (hidden when `showPoweredBy === false`).
    - Reserved bottom-right container for Phase 5 QR code.
  - **Zero External Requests**:
    - No external fonts (uses `system-ui` and `ui-monospace`).
    - No external stylesheets or scripts.
    - Inline SVG for icons.

---

### 3. Wiring & Integration
- **`frontend/src/printing/renderers.js`**:
  - Updated `renderHtml(receipt, profile, formatMoney)` to delegate directly to `renderReceiptHtml(receipt, { widthMm: normalizeProfile(profile).paperWidth, formatMoney })`.
  - ESC/POS and plain text renderers remain unchanged consuming `layoutReceipt`.
- **`frontend/src/printing/index.js`**:
  - Exported `renderReceiptHtml`.
- **`frontend/src/components/printing/PrinterSettingsPanel.jsx`**:
  - Updated `ReceiptPreview` to render HTML from `renderReceiptHtml` inside the preview container, preserving `data-testid="receipt-preview"` and `data-columns={columns}` for test compatibility.
- **`frontend/src/utils/dateTime.js`**:
  - Extracted pure date/time formatting functions (`formatDateTime`, `formatDate`, `SHOP_TIMEZONE`) to eliminate React/JSX dependencies from non-component utilities and scripts.

---

### 4. Interactive Preview Script
- **Added Script**:
  - `npm run receipt:preview` in `frontend/package.json` and root `package.json`.
  - Created `frontend/scripts/generateReceiptPreview.js` that compiles sample 80mm and 58mm roll receipts into:
    - `./receipt-preview/preview.html`: Interactive side-by-side comparison page with card frames and standalone open buttons.
    - `./receipt-preview/receipt-80mm.html`: Standalone 80mm receipt document.
    - `./receipt-preview/receipt-58mm.html`: Standalone 58mm receipt document.

---

### 5. Verification Results
- **Frontend Printing Test Suite**:
  - Command: `npm run test:printing`
  - Results: **21 / 21 test suites passed, 200 / 200 tests passed**.
  - New test suite: `frontend/src/printing/__tests__/htmlReceipt.test.js` covering:
    - Full sale (80mm 4-column and 58mm 2-line layout)
    - Legacy sale fallback (missing receiptNumber, missing cashier)
    - Offline sale (inline SVG banner, `Invoice: Pending`)
    - Duplicate copy indicator (`*** DUPLICATE COPY ***`)
    - Credit note (title, original invoice, reason, negative totals)
    - 58mm vs 80mm column structure differences
    - Long product names wrapping with `table-layout: fixed`
    - 100 items performance stress test (< 100ms)
    - Customer omission for walk-in / null customer
    - Tax-inclusive vs tax-exclusive label formatting
    - White-label toggle (`showPoweredBy: false`)
    - XSS injection prevention
    - Zero external URL and font dependencies
- **Backend Unit Tests**:
  - Command: `npm run test:unit`
  - Results: **2 / 2 test suites passed, 9 / 9 tests passed**.
- **Backend Concurrency & Live DB Tests**:
  - Command: `npx jest tests/invoiceSequence.concurrency.test.js tests/receiptNumberValidation.db.test.js`
  - Results: **2 / 2 test suites passed, 2 / 2 tests passed**.
