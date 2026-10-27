# RECEIPT_AUDIT.md — Zana POS Receipt System Audit

> **Audit date:** 2026-10-22  
> **Codebase path:** `C:\Users\WARREN CHRIS\.gemini\antigravity\scratch\zena-pos`  
> **Scope:** Read-only; no source files were modified.  
> **Auditor note:** All claims cite file paths and line numbers. Where evidence was absent the entry reads "Not found." Secrets and real customer data are redacted.

---

## 1. Executive Summary

1. 🔴 **Two completely separate, non-shared receipt paths** exist: the `printing/` subsystem (ESC/POS + browser iframe) for point-of-sale receipts, and a standalone `jsPDF` generator in `Invoices.jsx` with **hard-coded fake company data** — neither knows the other exists.
2. 🔴 **Reprint from the Sales list is broken**: `Sales.jsx:219` and `SaleDetailModal.jsx:174` call `window.print()` which dumps the entire browser UI to the printer, not a formatted receipt.
3. 🔴 **Offline invoice numbers collide**: `CashierDashboard.jsx:1120` uses only the last 4 digits of `Date.now()` → collisions possible within ~10 000 ms of each other on the same device.
4. 🔴 **Email receipt is an unimplemented stub**: `SaleCompleteModal.jsx:70–78` shows a toast "Email will be sent" but performs no API call.
5. 🟠 **Three separate currency formatters** exist in parallel; only one is used in the receipt path, but the others are used elsewhere in the app — silent inconsistency (missing thousands separator in `currencyUtils.js:26`).
6. 🟠 **No QR code anywhere** in the receipt system: not in `package.json`, not referenced in any template. The target design requires one; KRA eTIMS compliance may also require it.
7. 🟠 **No tax/VAT line on any receipt**: Tax is calculated but never printed. No KRA eTIMS / control unit number support.
8. 🟡 **Logo prints in HTML/browser path only** — ESC/POS thermal output explicitly skips it (`renderers.js:67` comment: "ESC/POS output has no logo yet").
9. 🟡 **Date/time not timezone-pinned in receipt layout**: `layout.js:5–8` uses raw `Date` methods (device local time) instead of the correct `Africa/Nairobi` timezone used everywhere else.
10. ✅ **The printing subsystem itself is well-architected** (clean adapter pattern, pluggable renderers, comprehensive unit tests) — a strong foundation for the redesign.

---

## 2. Tech Stack Relevant to Receipts

| Layer | Technology | Version / Notes |
|---|---|---|
| Frontend framework | React (Vite) | — |
| State management | Redux Toolkit | `settingsSlice.js` stores receipt settings |
| Styling | Tailwind CSS | Used in modal UI; receipt HTML uses inline styles |
| Receipt engine | Custom (`printing/` folder) | No third-party receipt library |
| ESC/POS | Custom `EscPosBuilder` | `printing/escpos.js`; no `escpos-encoder` or similar |
| PDF (invoices) | jsPDF + jspdf-autotable | `Invoices.jsx:371–544` only |
| QR code | **None found** | Not in `package.json`; not imported anywhere |
| Barcode | **None found** | — |
| Bluetooth printer | Capacitor `ZanaBluetoothPrinter` plugin | Android only; `adapters/nativeBluetooth.js` |
| USB printer | WebUSB API | `adapters/webUsbAdapter.js`; Chrome/Edge only |
| Serial printer | Web Serial API | `adapters/webSerialAdapter.js`; Chrome/Edge only |
| Browser print | `<iframe>` + `window.print()` | `adapters/browserPrintAdapter.js`; 5 s timeout |
| Backend | Node.js + Express | — |
| ORM / DB | Sequelize + MySQL | `models/Sale.js`, `models/Invoice.js` |
| Offline storage | IndexedDB (primary) + localStorage (fallback) | `offline/salesQueue.js` |
| Fonts on receipt | System monospace (HTML) / ESC/POS built-in | No custom fonts loaded |

---

## 3. Receipt Surface Inventory

| # | Surface | Trigger | Medium | Files | Template / Component |
|---|---|---|---|---|---|
| 1 | **Post-sale receipt** | Cashier clicks "Print Receipt" in Sale Complete modal | ESC/POS thermal **or** browser iframe (fallback chain) | `SaleCompleteModal.jsx`, `printing/printService.js`, `printing/renderers.js` | `buildReceipt()` → `renderEscPos()` / `renderHtml()` |
| 2 | **Reprint from Sales list** | Printer icon in the sales table row | `window.print()` — prints entire browser page | `Sales.jsx:219`, `SaleDetailModal.jsx:174` | **None** — no receipt model used |
| 3 | **Invoice PDF (A4 - Frontend)** | "Print / Download" button on Invoices page | jsPDF A4 PDF | `Invoices.jsx:371–544` | `generatePdfDoc()` — standalone, hard-coded fake company data |
| 4 | **Test / sample receipt** | "Print Test Receipt" in printer settings | Same adapter chain as Surface 1 | `PrinterSettingsPanel.jsx:170`, `printing/sample.js` | `sampleSale()` → `printTestReceipt()` |
| 5 | **Email receipt (stub)** | Email icon in SaleCompleteModal when customer has email | Toast only — **no email sent** | `SaleCompleteModal.jsx:70–78` | None (stub) |
| 6 | **Live settings preview** | Printer settings panel (always visible) | Screen — HTML monospace `<pre>` | `PrinterSettingsPanel.jsx:90–131`, `ReceiptPreview` component | `renderHtml()` via `ReceiptPreview` |
| 7 | **Credit Note (Sales Return Refund)** | "View Credit Note" in Sales Returns table/modal → "Print Credit Note" | Browser print (`window.print()`) | `SalesReturns.jsx:1007–1066` | Inline modal JSX with Tailwind `print:` styles (`CREDIT NOTE`, `creditNoteNumber`, returned items breakdown, refund total) |
| 8 | **Reprint from My Sales (Cashier)** | Cashier clicks row in My Sales → `SaleDetailModal` → Print button | Dead no-op (logs to console only) | `MySales.jsx:144–148, 367–374` | `SaleDetailModal.jsx` passed no-op `handlePrintReceipt` (`console.log('Print receipt for sale:', sale.id)`) |
| 9 | **Backend Invoice PDF (A4 - Server)** | HTTP GET `/api/invoices/:id/pdf` | Streamed PDF binary (`application/pdf`) | `backend/src/controllers/invoiceController.js:163–202` | `PDFDocument` (pdfkit) generating basic A4 invoice document |
| 10 | **Backend Invoice Email** | HTTP POST `/api/invoices/:id/email` | Disabled HTTP endpoint (HTTP 501) | `backend/src/controllers/invoiceController.js:205–209` | Disabled (`message: 'Email service is temporarily disabled'`) |
| 11 | **Analytics & Summary Reports** | "Print" button on Reports page | Browser print (`window.print()`) | `Reports.jsx:476` | Fallback browser dump; no thermal layout; no dedicated Z/X-report exists |
| 12 | **Reports PDF Export** | "Export PDF" on Reports page | jsPDF A4 PDF | `Reports.jsx:437–475` | Standalone `exportPdf()` generating A4 PDF of trend/P&L tables |
| 13 | **Purchase Returns** | N/A (supplier return workflow) | None | `PurchaseReturns.jsx` | No receipt or credit note surface |
| 14 | **Barcode / QR label print** | PrintBarcode.jsx / PrintQR.jsx pages | Browser print | `PrintBarcode.jsx`, `PrintQR.jsx` | Product price tags / barcode labels only (not receipts) |

---

## 4. Template and Rendering Map

### 4.1 Primary path (`printing/` subsystem)

```
User action
  │
  ▼
CashierDashboard.jsx           — creates sale, builds `serverData` / offline stub
  │
  ▼
SaleCompleteModal.jsx          — calls printReceipt(sale, settings, profile)
  │
  ▼
printing/printService.js       — resolves adapter order, calls adapter.print(bytes/html)
  │
  ├─ buildReceipt()            printing/receiptModel.js
  │    └─ normalises sale → { meta, business, items, totals, flags }
  │
  ├─ layoutReceipt()           printing/layout.js
  │    └─ fixed-width line array using text.js helpers (twoCol, center, rule, wrapText)
  │
  └─ render*()                 printing/renderers.js
       ├─ renderEscPos()  → EscPosBuilder (printing/escpos.js)
       ├─ renderHtml()    → <pre> block with inline styles
       └─ renderPlainText() → raw string
```

### 4.2 Invoice PDF path (`jsPDF`)

`Invoices.jsx:371–544` — `generatePdfDoc()` — completely standalone, not connected to the `printing/` subsystem. Uses jspdf-autotable for line items. Hard-codes company info (see Bug #4).

### 4.3 Reprint path (broken)

`Sales.jsx:219` → `window.print()` (no model, no template)  
`SaleDetailModal.jsx:174` → `window.print()` (same)

### 4.4 Shared helpers and duplication

| Helper | File | Used by |
|---|---|---|
| `twoCol()` | `printing/text.js` | `layout.js` only |
| `center()` | `printing/text.js` | `layout.js` only |
| `rule()` | `printing/text.js` | `layout.js` only |
| `wrapText()` | `printing/text.js` | `layout.js` only |
| `toPrinterText()` | `printing/text.js` | `renderers.js`, `layout.js` |
| `formatReceiptDate()` | `layout.js:5–8` | `layout.js` only (not `formatters.js`) |
| `formatCurrency()` | `settingsSlice.js:442` | Receipt print path via `useCurrency()` |
| `formatCurrencyWithSettings()` | `currencyUtils.js:26` | NOT the receipt path; used elsewhere |
| `formatAmount()` | `currencyFormatters.js:9` | NOT the receipt path |

### 4.5 Libraries

| Library | Purpose | Used in |
|---|---|---|
| jsPDF | A4 PDF generation | `Invoices.jsx` only |
| jspdf-autotable | Tables in PDF | `Invoices.jsx` only |
| No QR library | — | — |
| No barcode library | — | — |
| Capacitor `ZanaBluetoothPrinter` | Native BT printing | `adapters/nativeBluetooth.js` |

### 4.6 Paper width / character width

`printing/profile.js` — `PAPER_WIDTHS`:
- 58 mm → 32 chars/line (default)
- 80 mm → 48 chars/line

Stored in `localStorage` key `zana.printerProfile.v1`. `layout.js` reads `settings.colWidth` (derived from profile). No fallback if `localStorage` is cleared — defaults to 58 mm / 32 cols via `DEFAULT_PROFILE`.

### 4.7 Font / style

- ESC/POS: built-in printer font, no custom loading. `EscPosBuilder` supports `setDoubleSizeWidth()` and `setDoubleSizeHeight()` (used for grand total line).
- HTML renderer: `font-family: 'Courier New', monospace`, `font-size: 11px`, `line-height: 1.4`. Hard-coded in `renderers.js`.
- Invoice PDF: jsPDF default (Helvetica).

### 4.8 Logo handling

- `receiptSettings.js` → `resolveLogoUrl()` — resolves either a data-URL or HTTP URL from Redux `businessLogo`.
- HTML/browser path: `<img>` tag injected by `renderHtml()`.
- ESC/POS path: **skipped** — `renderers.js:67` comment: *"ESC/POS output has no logo yet."*
- `PrinterSettingsPanel.jsx:349–353` also notes: logo not shown in ESC/POS.

---

## 5. Data Field Table

| Field | Source | Used in which receipts | Nullable? | Fallback behaviour |
|---|---|---|---|---|
| `meta.invoiceNumber` | `serverData.invoiceNumber` (server) **or** `OFFLINE-${Date.now().slice(-4)}` (offline) | Post-sale, reprint stub, invoice | Yes (offline) | `OFFLINE-XXXX` |
| `meta.date` | `serverData.createdAt` or `new Date().toISOString()` | Post-sale | Yes | `new Date()` at render time |
| `meta.paymentMethod` | `sale.paymentMethod` | Post-sale | Yes | Blank |
| `meta.amountReceived` | `sale.paymentAmount` | Post-sale | Yes | Blank / `0` |
| `meta.changeDue` | `sale.change` | Post-sale | Yes | `0` |
| `meta.cashierName` | **Not present** | — | N/A | **Gap — not collected** |
| `meta.customerName` | `sale.customerName` | Post-sale (if set) | Yes | Omitted |
| `meta.customerPhone` | `sale.customerPhone` | Post-sale (if set) | Yes | Omitted |
| `business.name` | Redux `businessName` setting | All | Yes | `'Zana POS'` |
| `business.address` | Redux `businessAddress` | All | Yes | Blank |
| `business.phone` | Redux `businessPhone` | All | Yes | Blank |
| `business.kraPin` | Redux `businessKraPin` | All | Yes | Omitted if blank |
| `business.branch` | **Not present** | — | N/A | **Gap — no branch field** |
| `business.tagline` | **Not present** | — | N/A | **Gap — not configurable** |
| `items[].name` | `saleItem.productName` | All | No | — |
| `items[].qty` | `saleItem.quantity` | All | No | — |
| `items[].unitPrice` | `saleItem.unitPrice` | All | No | — |
| `items[].lineTotal` | `saleItem.quantity × saleItem.unitPrice` (computed at render) | All | No | — |
| `items[].discount` | `saleItem.discount` | All | Yes | `0` |
| `totals.subtotal` | Sum of line totals | All | No | — |
| `totals.discount` | Sum of item discounts | All | Yes | Omitted if `0` |
| `totals.tax` | **Not on receipt** — calculated but not included in model | — | N/A | **Gap — not printed** |
| `totals.grandTotal` | `sale.total` | All | No | — |
| `flags.isOffline` | `sale.isOffline` boolean | Post-sale | Yes | `false` |
| `flags.isPaid` | `sale.isPaid` | Post-sale | Yes | `true` |
| `settings.header` | Redux `receiptHeader` | All | Yes | Blank |
| `settings.footer` | Redux `receiptFooter` | All | Yes | `'Thank you for your business!'` |
| `settings.showLogo` | Redux `showLogoOnReceipt` | HTML only | Yes | `false` |
| `settings.logoUrl` | Redux `businessLogo` | HTML only | Yes | No logo |
| `settings.colWidth` | `printerProfile.colWidth` | ESC/POS + plain text | No | `32` |
| Receipt No (separate) | **Not present** — same as `invoiceNumber` | — | N/A | **Gap** |
| QR code payload | **Not present** | — | N/A | **Gap — not implemented** |
| `Powered by Zana POS` | **Not present** | — | N/A | **Gap** |
| Status banner (offline icon, tinted bg) | ESC/POS: plain text line only | Post-sale ESC/POS | N/A | No icon, no tinted background |

**Fields in target design MISSING from current data model:**

| Target field | Status |
|---|---|
| Cashier / Served by | Not collected, not in model |
| Branch / Location | Not in `business` object |
| Tagline | Not configurable, not in model |
| QR code | Not implemented (no library) |
| Separate Receipt No vs Invoice No | Not separated — same value used |
| `Powered by Zana POS` footer | Not in layout |
| Status banner (icon, tinted BG) | Icon/colour only in HTML; ESC/POS plain text |
| Tax/VAT line | Not in totals block |
| `SALES RECEIPT` title | Currently `RECEIPT` |

---

## 6. Number Generation and Offline/Sync Flow

### 6.1 Online invoice number (server-side)

File: `backend/src/controllers/saleController.js` ~line 947

1. Server extracts `dateStr` = today's date in `YYYY-MM-DD` format (server timezone, unverified).
2. Queries the `Sales` table for the **last** `invoiceNumber` that starts with `dateStr` for the same `shopId`.
3. Parses the numeric suffix from that record and increments by 1, zero-padded to 4 digits.
4. Result: `20261022-0042` format.
5. Stored with a `UNIQUE (shopId, invoiceNumber)` constraint.

**Risk**: The "last matching record" query is not atomic — if two requests arrive simultaneously, both can read the same last value and generate the same next number. No row-level lock or sequence/auto-increment is used. Collision at busy shops is theoretically possible but likely rare.

### 6.2 Offline invoice number (client-side)

File: `frontend/src/pages/CashierDashboard.jsx:1120`

```js
invoiceNumber: `OFFLINE-${Date.now().toString().slice(-4)}`
```

- Uses only the **last 4 digits** of `Date.now()` (milliseconds since epoch).
- Last 4 digits repeat every **10 000 ms** (~2.7 hours).
- Within that window any two offline sales on the same device can collide.
- The `idempotencyKey` is a separate UUID (not shown in the receipt) and prevents duplicate DB inserts on sync, but the `invoiceNumber` itself is not guaranteed unique at the DB level because of the `UNIQUE (shopId, invoiceNumber)` index — a collision would cause the second sync to fail.

### 6.3 Sync / reconciliation flow

File: `frontend/src/offline/salesSync.js`, `frontend/src/hooks/usePendingSales.js`

1. Offline sale stored in IndexedDB with status `queued`.
2. `flushSales()` is called on `online` event or every 60 s.
3. For each queued sale: POST to `/api/sales` with `idempotencyKey`; server returns real `invoiceNumber`.
4. Queue entry status updated to `synced` in IndexedDB.
5. **The real server `invoiceNumber` is NOT propagated back to any displayed receipt or any Redux state.** The receipt already shown/printed still displays `OFFLINE-XXXX`.
6. No mechanism exists to reprint after sync with the real number, or to notify the cashier.

### 6.4 Invoice vs Receipt number

- On the sample receipt: both "Invoice #OFFLINE-5566" and "Receipt No: #OFFLINE-5566" are the same value.
- `layout.js` emits the footer receipt number from `meta.invoiceNumber` — intentional (single field) but confusing.
- The target design treats them as potentially separate; the current system has no separation.

---

## 7. Money, Tax and Formatting Findings

### 7.1 Currency formatters (3 parallel implementations)

| Formatter | File:Line | Method | Thousands separator | Used in receipt path? |
|---|---|---|---|---|
| `formatCurrency(amount, currency, settings)` | `settingsSlice.js:442` | `Intl.NumberFormat('en-US', ...)` | ✅ Yes | ✅ Yes (via `useCurrency()`) |
| `formatCurrencyWithSettings(amount, settings)` | `currencyUtils.js:26` | `parseFloat().toFixed(2)` | ❌ No | ❌ No (used elsewhere) |
| `formatAmount(amount, currency)` | `currencyFormatters.js:9` | `Intl.NumberFormat` with full currency style | ✅ Yes | ❌ No |

**Receipt path uses `settingsSlice.formatCurrency`** → correctly produces `KSh 5,600.00`.  
`currencyUtils.formatCurrencyWithSettings` produces `KSh 5600.00` (no separator) — used in other screens.

### 7.2 Floating-point risk

`CashierDashboard.jsx:1093`:
```js
changeDue = Math.max(0, parseFloat(currentSale.paymentAmount) - currentSale.total)
```
- Uses JavaScript floating-point arithmetic (`parseFloat` + subtraction).
- `paymentAmount` and `total` are not converted to integer cents before subtraction.
- Risk of `0.1 + 0.2 = 0.30000000000004` type errors on edge amounts.
- Backend stores `paymentAmount` as `DECIMAL(10,2)` which avoids DB-side float errors, but the client-side change calculation is imprecise.

### 7.3 Amount received / cash validation

- `paymentAmount` field accepts any numeric value — no validation that it must be ≥ `total` for cash, or that it is a whole-number multiple for cash payments.
- The sample receipt shows `5,999.94` as "Amount Received" for a cash payment — this is a **data-entry gap**: the cashier typed a non-round amount. No guard in the code prevents it.
- `backend/src/models/Sale.js:59`: `paymentAmount DECIMAL(10,2)` — the DB stores exactly what the client sends.

### 7.4 Tax / VAT

- Tax rate and `taxInclusive` are settings (`settingsSlice.js`).
- Tax is calculated in `CashierDashboard.jsx` and `POSModal.jsx` for the `grandTotal`.
- **No tax field is included in `buildReceipt()`'s data model** (`receiptModel.js`).
- No tax line appears in `layout.js` totals block.
- No VAT itemization on any receipt surface.
- No KRA eTIMS / electronic tax invoice / control unit number found anywhere.

### 7.5 Discounts, returns, refunds

- Item-level discounts: collected in `saleItem.discount`; `buildReceipt()` maps them; `layout.js` shows a Discount line if `> 0`.
- Refunds: `backend/src/controllers/saleController.js` creates `SaleRefund` and `RefundIdempotency` records. No dedicated refund receipt template found — `SalesReturns.jsx` not read (see Appendix).
- Voids: Not found in the receipt system.

### 7.6 Split payments / M-Pesa / card

- `paymentMethod` field is a string (e.g. `'cash'`, `'mpesa'`, `'card'`).
- Only one payment method per sale visible in the model.
- No split-payment amount breakdown on the receipt.
- No M-Pesa transaction reference on receipt.

---

## 8. Settings / Config Matrix

| Setting | Stored where | Editable in UI | Respected by renderer |
|---|---|---|---|
| `receiptHeader` | Redux + DB (`settings` table) | Settings page / PrinterSettingsModal | ✅ ESC/POS + HTML |
| `receiptFooter` | Redux + DB | Settings page / PrinterSettingsModal | ✅ ESC/POS + HTML |
| `showLogoOnReceipt` | Redux + DB | PrinterSettingsPanel | ✅ HTML only ❌ ESC/POS |
| `businessLogo` (data URL or URL) | Redux + DB | Settings page | ✅ HTML only ❌ ESC/POS |
| `businessName` | Redux + DB | Settings page | ✅ All |
| `businessAddress` | Redux + DB | Settings page | ✅ All |
| `businessPhone` | Redux + DB | Settings page | ✅ All |
| `businessKraPin` | Redux + DB | Settings page | ✅ All |
| `taxRate` / `taxInclusive` | Redux + DB | Settings page | ✅ Calculation ❌ Not printed |
| `printerType` (old Redux field) | Redux + DB | Legacy settings | ❌ NOT used by `printing/` subsystem |
| Paper width (58/80 mm) | `localStorage: zana.printerProfile.v1` | PrinterSettingsPanel | ✅ ESC/POS + plain text |
| Connection type | `localStorage` | PrinterSettingsPanel | ✅ Adapter selection |
| Cut mode | `localStorage` | PrinterSettingsPanel | ✅ ESC/POS |
| Feed lines after cut | `localStorage` | PrinterSettingsPanel | ✅ ESC/POS |
| Open cash drawer | `localStorage` | PrinterSettingsPanel | ✅ ESC/POS |
| Auto-print on sale complete | **Nowhere** | **Not in UI** | ❌ Not implemented |
| Number of copies | **Nowhere** | **Not in UI** | ❌ Not implemented |
| Branch / Location | **Nowhere** | **Not in UI** | ❌ Not implemented |
| Tagline | **Nowhere** | **Not in UI** | ❌ Not implemented |
| `Powered by Zana POS` toggle | **Nowhere** | **Not in UI** | ❌ Not implemented |

---

## 9. Gap Analysis vs. Target Design

| Target element | Exists today? | Where (if yes) | What needs to change | Effort |
|---|---|---|---|---|
| Logo in header | Partial | `renderHtml()` only | Add ESC/POS raster/bitmap logo support | L |
| "ZANA POS" wordmark | Partial | Hard-coded in `layout.js:20` as part of header | Expose as setting; currently always "Zana POS" | S |
| Store name (bold, caps) | ✅ | `layout.js:21–22` — `center(business.name.toUpperCase())` | Styling only (ESC/POS bold already applied) | S |
| Branch / location line | ❌ | Not in data model | Add `business.branch` to settings + `buildReceipt()` + `layout.js` | S |
| Tel + PIN line | ✅ | `layout.js:28–35` | Confirmed present | — |
| Divider after header | ✅ | `layout.js:36` | Confirmed present | — |
| "SALES RECEIPT" title | ❌ | `layout.js:40` emits `RECEIPT` | Change string in `layout.js:40` | S |
| Meta block (Invoice, Date, Customer, Payment) | Partial | `layout.js:42–60` | Add cashier name; verify alignment | S |
| Offline status banner (icon + tint) | Partial (ESC/POS text only) | `layout.js:62–66` | Add icon glyph in ESC/POS; styled div in HTML | M |
| Items table header row (ITEM\|QTY\|UNIT PRICE\|TOTAL) | ❌ | No header row in current layout | Add column header row in `layout.js` | S |
| Item bold name + muted sub-line (`3 × KSh 290.00`) | ❌ | Item name printed once, qty/price on same line | Refactor item layout in `layout.js` + ESC/POS bold | M |
| Qty centered, unit price + total right-aligned | Partial | `twoCol()` used but not 4-column | Implement 4-column alignment helper | M |
| 2 decimals + thousands separators | ✅ (receipt path) | `settingsSlice.formatCurrency` | Consolidate other formatters | S |
| Subtotal line | ✅ | `layout.js:81` | — | — |
| Large highlighted TOTAL row (grey BG, bold, larger) | Partial | ESC/POS: double-size, no BG. HTML: no special BG | Add BG shading in HTML renderer; ESC/POS bold+double | M |
| Amount Received line | ✅ | `layout.js:90` | — | — |
| Change Due (bold) | ✅ | `layout.js:92` | Add bold in ESC/POS | S |
| "Thank you" between rules footer | ✅ | `layout.js:96–100` | Minor wording/layout tweak | S |
| Tagline ("Better Products · Brighter Together") | ❌ | Not in model or layout | Add `business.tagline` setting + `layout.js` | S |
| Receipt No in footer | ✅ | `layout.js:103` | Change label to separate from invoice # | M |
| "Powered by Zana POS" | ❌ | Not in layout | Add as configurable toggle in `layout.js` | S |
| QR code at bottom right | ❌ | Not implemented | Add QR library + encode + raster for ESC/POS; SVG/img for HTML | L |
| Currency format `KSh 5,600.00` | ✅ (receipt path) | `settingsSlice.formatCurrency` | — | — |
| Tax/VAT line | ❌ | Not in totals block | Add `tax` field to `buildReceipt()` + `layout.js` | M |
| Cashier / Served by | ❌ | Not in data model | Capture cashier on sale; add to `buildReceipt()` | M |
| Auto-print after sale | ❌ | Not implemented | Add setting + trigger in `SaleCompleteModal.jsx` | M |
| Number of copies | ❌ | Not implemented | Add setting + loop in `printService.js` | S |

---

## 10. Bugs, Risks and Inconsistencies

### Bug #1 — Reprint prints entire browser page UI
**Severity:** 🔴 High  
**Files:** `frontend/src/pages/Sales.jsx:219`, `frontend/src/components/SaleDetailModal.jsx:174`  
**Evidence:**
```js
// Sales.jsx:219
<button onClick={() => window.print()}>
// SaleDetailModal.jsx:174
onClick={() => window.print()}
```
**Fix:** Replace with `printReceipt(sale, settings, profile)` from the `printing/` subsystem, building the sale data from the sale record.

---

### Bug #2 — Offline invoice number collision (last-4-digits-of-timestamp)
**Severity:** 🔴 High  
**File:** `frontend/src/pages/CashierDashboard.jsx:1120`  
**Evidence:**
```js
invoiceNumber: `OFFLINE-${Date.now().toString().slice(-4)}`
```
`Date.now()` = milliseconds; last 4 digits cycle every 10 000 ms. Two sales within that window collide. The `UNIQUE(shopId, invoiceNumber)` DB index will reject the second sync.  
**Fix:** Use a local counter (persisted in localStorage or IndexedDB) or a UUID suffix: `` `OFFLINE-${crypto.randomUUID().slice(0, 8)}` ``.

---

### Bug #3 — Email receipt is an unimplemented stub
**Severity:** 🟠 Medium  
**File:** `frontend/src/components/SaleCompleteModal.jsx:70–78`  
**Evidence:** Toast displayed, no API call made.  
**Fix:** Implement a `/api/sales/:id/send-receipt` endpoint and wire it up, or remove the UI button until implemented.

---

### Bug #4 — jsPDF Invoice has hard-coded fake company data
**Severity:** 🔴 High  
**File:** `frontend/src/pages/Invoices.jsx:378–384`  
**Evidence:**
```js
const COMPANY = {
  name: 'Zana POS',
  address: '123 Market St, Nairobi, Kenya',
  phone: '+254 700 000000',
  email: 'info@zana.example',
};
```
Any A4 invoice PDF sent to a customer shows fake contact information.  
**Fix:** Replace `COMPANY` with Redux business settings (same as `buildReceiptSettings()` does).

---

### Bug #5 — `formatCurrencyWithSettings` missing thousands separator
**Severity:** 🟠 Medium  
**File:** `frontend/src/utils/currencyUtils.js:26`  
**Evidence:**
```js
return `${symbol} ${parseFloat(amount).toFixed(2)}`;
// Produces: KSh 5600.00 instead of KSh 5,600.00
```
Not in the receipt print path but is used elsewhere in the UI — customers see inconsistent formatting.  
**Fix:** Use `Intl.NumberFormat` with `minimumFractionDigits: 2` and `useGrouping: true`, or consolidate to a single formatter.

---

### Bug #6 — Floating-point arithmetic for change calculation
**Severity:** 🟠 Medium  
**File:** `frontend/src/pages/CashierDashboard.jsx:1093`  
**Evidence:**
```js
changeDue = Math.max(0, parseFloat(currentSale.paymentAmount) - currentSale.total)
```
JavaScript `Number` subtraction is not safe for currency. E.g. `10.30 - 10.00 = 0.2999999999999996`.  
**Fix:** Convert both values to integer cents before arithmetic: `Math.round(amount * 100)`, compute, then divide by 100. Or use a decimal library.

---

### Bug #7 — Date/time uses device local timezone, not Africa/Nairobi
**Severity:** 🟠 Medium  
**File:** `frontend/src/printing/layout.js:5–8`  
**Evidence:**
```js
function formatReceiptDate(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```
Uses local device `getHours()` / `getMinutes()` — not timezone-aware. A tablet running in UTC+3 but set to UTC would print times 3 hours early.  
**Fix:** Use `formatters.js`'s `formatDateTime()` which is correctly pinned to `'Africa/Nairobi'`.

---

### Bug #8 — ESC/POS logo always skipped
**Severity:** 🟡 Low  
**File:** `frontend/src/printing/renderers.js:67`  
**Evidence:** Comment: `// ESC/POS output has no logo yet`  
Thermal printer receipt has no logo even if "Show logo" is enabled.  
**Fix:** Implement raster image download + Floyd-Steinberg dithering + ESC/POS `GS v 0` bitmap command.

---

### Bug #9 — Offline sale number not reconciled after sync
**Severity:** 🟠 Medium  
**File:** `frontend/src/offline/salesSync.js`  
After sync the server returns a real `invoiceNumber` (e.g. `20261022-0042`). This number is never written back to Redux, the DB receipt record, or displayed to the cashier. The receipt already handed to the customer says `OFFLINE-XXXX`.  
**Fix:** After successful sync, store the mapping `{offlineId → serverInvoiceNumber}` and offer a "Reprint with server number" option.

---

### Bug #10 — `paymentAmount` accepts non-round cash amounts (no validation)
**Severity:** 🟡 Low  
**Files:** `frontend/src/pages/CashierDashboard.jsx:1093` (client), `backend/src/models/Sale.js:59` (DB `DECIMAL(10,2)`)  
The sample receipt shows "Amount Received: KSh 5,999.94" — an improbable cash amount. No guard enforces that cash payments must be whole-number currency amounts.  
**Fix:** Add a client-side validation: if `paymentMethod === 'cash'`, round `paymentAmount` to 2 decimal places and warn if it has sub-shilling fractions.

---

### Bug #11 — Receipt title is `RECEIPT` not `SALES RECEIPT`
**Severity:** 🟡 Low  
**File:** `frontend/src/printing/layout.js:40`  
**Evidence:** `lines.push(center('RECEIPT', cols));`  
Trivial one-line fix but noted for target design compliance.

---

### Bug #12 — No items table header row
**Severity:** 🟡 Low  
**File:** `frontend/src/printing/layout.js`  
Items section has no column header (ITEM | QTY | UNIT PRICE | TOTAL). Target design requires one.

---

### Bug #13 — Server-side invoice number race condition
**Severity:** 🟠 Medium  
**File:** `backend/src/controllers/saleController.js:~947`  
Sequential number derived from last DB record — not atomic. Under concurrent load two requests can read the same last value.  
**Fix:** Use `SELECT ... FOR UPDATE` within a transaction, or use a MySQL auto-increment sequence table per shop per day.

---

### Bug #14 — `printerType` Redux setting ignored by printing subsystem
**Severity:** 🟡 Low  
**File:** `frontend/src/store/slices/settingsSlice.js` (old `printerType` field)  
The new `printing/` subsystem reads from `localStorage zana.printerProfile.v1` — the Redux `printerType` field is a legacy setting that has no effect.  
**Fix:** Remove or deprecate `printerType` from Redux settings, or migrate to reading from the profile.

---

### Bug #15 — No items table header on any receipt surface
**Severity:** 🟡 Low  
Items header row (ITEM | QTY | UNIT PRICE | TOTAL) is absent from `layout.js`. The target design requires it.

---

## 11. Security, Privacy and Compliance Notes

### 11.1 Customer PII on receipt

- `meta.customerName` and `meta.customerPhone` may appear on the printed receipt if set (`layout.js:48–54`).
- These fields appear in plain text with no masking option (e.g. `Tel: 07XXXXXXXX`).
- No consent mechanism or PII-redaction setting found.

### 11.2 Public / guessable receipt links

- No shareable receipt links found — sharing is via email stub (unimplemented). No public URL exposure found.

### 11.3 Sensitive data in logs / state

- `paymentAmount`, `change`, `customerPhone` are stored in Redux and printed in `console.log`/`console.error` within `printService.js` and adapter files.
- No card PAN, CVV, or PIN stored — payment method is a string label only. No card data risk found.
- M-Pesa transaction references not stored/printed (no field for it).

### 11.4 KRA eTIMS / Tax compliance (Kenya)

- `business.kraPin` (KRA PIN) is printed on the receipt (`layout.js:30`).
- **No KRA eTIMS integration found**: no control unit device number, no eTIMS API call, no fiscal QR code, no electronic tax invoice number.
- The current receipt does **not** satisfy KRA eTIMS requirements for VAT-registered businesses:
  - Missing: VAT itemization, eTIMS transaction code, fiscal QR.
- **Risk**: If the shop is VAT-registered, issued receipts may not be tax-compliant.

### 11.5 Idempotency key storage

- `idempotencyKey` is a UUID stored in IndexedDB and sent to the backend. Not displayed on any receipt. No security concern noted.

---

## 12. Test Coverage and Gaps

### 12.1 What is tested

| Test file | What it covers |
|---|---|
| `printing/__tests__/receipt.test.js` | `buildReceipt()`, `renderPlainText()`, `renderEscPos()`, `renderHtml()`, logo, header/footer |
| `printing/__tests__/escpos.test.js` | `EscPosBuilder` commands |
| `printing/__tests__/text.test.js` | `twoCol()`, `center()`, `rule()`, `wrapText()`, `toPrinterText()` |
| `printing/__tests__/printService.test.js` | Adapter selection, fallback chain |
| `printing/__tests__/bluetoothAdapter.test.js` | BT chunking, queue |
| `printing/__tests__/browserPrintAdapter.test.js` | iframe creation, 5s timeout |
| `printing/__tests__/webSerialAdapter.test.js` | Serial port flow |
| `printing/__tests__/webUsbAdapter.test.js` | USB chunk flow |
| `printing/__tests__/nativeBluetooth.test.js` | Capacitor plugin bridge |
| `printing/__tests__/profile.test.js` | `printerProfile` localStorage read/write |
| `printing/__tests__/receiptSettings.test.js` | `buildReceiptSettings()`, `resolveLogoUrl()` |
| `printing/__tests__/base64.test.js` | `bytesToBase64()` |

### 12.2 Coverage gaps

| Area | Gap |
|---|---|
| `layout.js` | No direct unit tests for the line-layout logic (covered indirectly via `renderPlainText` tests) |
| `Invoices.jsx` PDF generation | No tests for `generatePdfDoc()` |
| `Sales.jsx` reprint | No test confirming `window.print()` is called (or that it is wrong) |
| `SaleCompleteModal.jsx` | No integration test for the full print-on-sale-complete flow |
| Currency formatters | `currencyUtils.formatCurrencyWithSettings` no-separator bug is not caught by any test |
| Offline number collision | No test for collision scenario |
| Sync reconciliation | No test for "server number returned after sync" flow |
| Email stub | No test confirming email is actually sent |
| Timezone correctness | No test comparing `formatReceiptDate()` output against `Africa/Nairobi` timezone |
| Tax line | No test for tax appearing on receipt (it doesn't appear — gap in both code and tests) |

### 12.3 TODO / FIXME / dead code found

- `renderers.js:67`: `// ESC/POS output has no logo yet` — explicit outstanding TODO.
- `PrinterSettingsPanel.jsx:349–353`: comment about logo not printing in ESC/POS.
- `SaleCompleteModal.jsx:70–78`: email stub, no TODO comment but clearly incomplete.
- `POSModal.jsx`: calls `createSale` then `onClose()` without printing — likely dead/legacy code path.

---

## 13. Recommended Redesign Approach

### 13.1 Proposed single shared receipt data model

Create a canonical `ReceiptData` type (TypeScript interface or JSDoc typedef) used by **all** receipt surfaces:

```
ReceiptData {
  meta: {
    invoiceNumber, receiptNumber, date, cashierName,
    customerName, customerPhone, paymentMethod,
    amountReceived, changeDue, isOffline, pendingSync
  }
  business: {
    name, address, branch, phone, kraPin, tagline, logoUrl
  }
  items: [{ name, qty, unitPrice, lineTotal, discount }]
  totals: { subtotal, discount, tax, grandTotal }
  settings: { header, footer, showLogo, showPoweredBy, colWidth }
}
```

### 13.2 One renderer per medium

| Medium | Renderer | Notes |
|---|---|---|
| ESC/POS thermal | `renderEscPos(data, profile)` | Extend existing; add logo raster, QR glyph |
| Browser iframe | `renderHtml(data)` | Extend existing; add QR `<img>`, styled TOTAL row |
| A4 PDF | New `renderPdf(data)` | Replace `Invoices.jsx` standalone generator |
| Plain text | `renderPlainText(data)` | Keep as-is for debugging |
| Email | New `renderEmailHtml(data)` | Implement properly |

### 13.3 Migration order (lowest risk first)

1. **Fix bugs first (no redesign required):**
   - Bug #1: Replace `window.print()` reprint with proper `printReceipt()` call.
   - Bug #2: Fix offline number collision (use UUID suffix).
   - Bug #4: Replace hard-coded `COMPANY` in `Invoices.jsx` with settings.
   - Bug #5: Consolidate currency formatters to single `formatCurrency()`.
   - Bug #7: Replace `formatReceiptDate()` with `formatters.formatDateTime()`.
   - Bug #11: Change `'RECEIPT'` to `'SALES RECEIPT'` in `layout.js`.

2. **Extend the data model** — add `branch`, `cashierName`, `tax`, `tagline`, `receiptNumber`, `poweredBy` fields to `buildReceipt()` and `layout.js`.

3. **Add QR code** — install `qrcode` or `qr-code-styling`, encode receipt URL or compliance payload, render in HTML path as `<img>`, ESC/POS path as raster bitmap.

4. **Fix email** — implement `/api/sales/:id/send-receipt` endpoint.

5. **Add A4 PDF renderer** — replace `Invoices.jsx`'s `generatePdfDoc()` with a renderer that uses the shared `ReceiptData` model.

6. **Add logo to ESC/POS** — implement bitmap download + dithering.

7. **Implement KRA eTIMS** (if required) — fiscal QR, control unit number, VAT itemization.

### 13.4 What to delete / consolidate

- Delete `currencyUtils.formatCurrencyWithSettings` (replace with `settingsSlice.formatCurrency`).
- Delete `currencyFormatters.formatAmount` or merge into single formatter.
- Delete legacy `printerType` Redux field from `settingsSlice`.
- Delete `POSModal.jsx` if confirmed dead path (no receipt, no active route).
- Remove `COMPANY` constant from `Invoices.jsx`.

---

## 14. Open Questions

1. **KRA eTIMS compliance**: Is the business VAT-registered and subject to eTIMS? If yes, what control unit device is in use? This determines whether a fiscal QR and eTIMS transaction number are required on receipts.

2. **Receipt number vs invoice number**: Should these be separate concepts (e.g. invoice # stays with the backend sale record, receipt # is a separate sequential counter)?

3. **Offline number reconciliation**: After sync, should the customer-facing receipt be updated with the real server invoice number? Is re-printing expected? What should the cashier see?

4. **Return / refund receipt**: Does `SalesReturns.jsx` produce a dedicated receipt? Should it say "CREDIT NOTE" or "REFUND RECEIPT"? (File not read — see Appendix.)

5. **Z-report / X-report**: Are these expected to be printable to the thermal printer, or display-only? (`Reports.jsx` not read — see Appendix.)

6. **Tagline**: Is "Better Products · Brighter Together" a fixed brand tagline or configurable per store?

7. **`Powered by Zana POS`**: Should this be configurable (hide for white-label deployments) or always shown?

8. **QR code payload**: What should the QR encode — a public receipt URL, a KRA compliance payload, or simply the invoice number?

9. **Email receipts**: Is there a transactional email provider already configured on the backend (Mailgun, SendGrid, etc.)?

10. **Branch / multi-location**: Is branch a separate entity in the DB (a `shops` or `branches` table), or a free-text field per shop?

11. **`POSModal.jsx`**: Is this an actively used code path or legacy? It calls `createSale` without printing — is it intentionally print-free or a bug?

12. **`SalesReturns.jsx` + `PurchaseReturns.jsx`**: Do these produce any receipt output? Were not read (noted below).

---

## 15. Appendix

### 15.1 Files fully read and reviewed

| File | Notes |
|---|---|
| `frontend/src/printing/receiptModel.js` | Core data model builder |
| `frontend/src/printing/layout.js` | Fixed-width line builder |
| `frontend/src/printing/renderers.js` | ESC/POS, HTML, plain-text renderers |
| `frontend/src/printing/escpos.js` | `EscPosBuilder` class |
| `frontend/src/printing/text.js` | ASCII text helpers |
| `frontend/src/printing/profile.js` | Printer profile / paper width |
| `frontend/src/printing/printService.js` | Adapter selection + fallback |
| `frontend/src/printing/receiptSettings.js` | Settings builder + logo resolver |
| `frontend/src/printing/sample.js` | Sample sale fixture |
| `frontend/src/printing/base64.js` | `bytesToBase64()` |
| `frontend/src/printing/index.js` | Barrel exports |
| `frontend/src/printing/adapters/browserPrintAdapter.js` | iframe-based browser print |
| `frontend/src/printing/adapters/bluetoothAdapter.js` | Android Capacitor BT |
| `frontend/src/printing/adapters/webUsbAdapter.js` | WebUSB |
| `frontend/src/printing/adapters/webSerialAdapter.js` | Web Serial |
| `frontend/src/printing/adapters/nativeBluetooth.js` | Capacitor `ZanaBluetoothPrinter` |
| `frontend/src/printing/adapters/index.js` | ADAPTERS registry |
| `frontend/src/printing/__tests__/receipt.test.js` | Receipt tests |
| `frontend/src/printing/__tests__/escpos.test.js` | ESC/POS tests |
| `frontend/src/printing/__tests__/text.test.js` | Text helper tests |
| `frontend/src/printing/__tests__/printService.test.js` | Service tests |
| `frontend/src/printing/__tests__/bluetoothAdapter.test.js` | BT adapter tests |
| `frontend/src/printing/__tests__/browserPrintAdapter.test.js` | Browser adapter tests |
| `frontend/src/printing/__tests__/webSerialAdapter.test.js` | Serial adapter tests |
| `frontend/src/printing/__tests__/webUsbAdapter.test.js` | USB adapter tests |
| `frontend/src/printing/__tests__/nativeBluetooth.test.js` | Native BT tests |
| `frontend/src/printing/__tests__/profile.test.js` | Profile tests |
| `frontend/src/printing/__tests__/receiptSettings.test.js` | Settings tests |
| `frontend/src/printing/__tests__/base64.test.js` | Base64 tests |
| `frontend/src/components/SaleCompleteModal.jsx` | Post-sale receipt UI |
| `frontend/src/components/POSModal.jsx` | Legacy POS modal (no receipt) |
| `frontend/src/pages/CashierDashboard.jsx` | Main cashier terminal, offline receipt generation |
| `frontend/src/components/SaleDetailModal.jsx` | Past-sale detail + reprint |
| `frontend/src/pages/Sales.jsx` | Sales list + broken reprint |
| `frontend/src/pages/Invoices.jsx` | A4 invoice PDF (jsPDF) |
| `frontend/src/components/printing/PrinterSettingsPanel.jsx` | Printer settings UI + preview |
| `frontend/src/components/printing/PrinterSettingsModal.jsx` | Modal wrapper |
| `frontend/src/store/slices/settingsSlice.js` | Settings Redux slice + `formatCurrency` |
| `frontend/src/hooks/useReceiptSettings.js` | Settings hook |
| `frontend/src/hooks/usePrinterProfile.js` | Profile hook |
| `frontend/src/hooks/useCurrency.js` | Currency hook |
| `frontend/src/utils/currency.js` | `getCurrencySymbol()` |
| `frontend/src/utils/currencyFormatters.js` | `formatAmount()` |
| `frontend/src/utils/currencyUtils.js` | `formatCurrencyWithSettings()` (missing thousands sep) |
| `frontend/src/utils/formatters.js` | `formatCurrency()`, `formatDateTime()` pinned to Nairobi |
| `frontend/src/hooks/useAdvancedCurrency.js` | `CURRENCY_DATA` (KES) |
| `frontend/src/offline/salesQueue.js` | IndexedDB queue |
| `frontend/src/offline/salesSync.js` | Sync flush logic |
| `frontend/src/hooks/usePendingSales.js` | Auto-flush hook |
| `frontend/src/components/OfflineSupport.jsx` | App-level offline support mount |
| `backend/src/models/Sale.js` | Sequelize Sale model |
| `backend/src/controllers/saleController.js` | Invoice # generation, refund, idempotency |
| `frontend/src/pages/SalesReturns.jsx` | Credit Note modal with `window.print()` |
| `frontend/src/pages/Reports.jsx` | Analytics reports with `window.print()` and jsPDF; no Z/X report |
| `frontend/src/pages/MySales.jsx` | Cashier sale history; no-op print callback to SaleDetailModal |
| `frontend/src/pages/PurchaseReturns.jsx` | Supplier purchase returns; no receipt surface |
| `backend/src/controllers/invoiceController.js` | Backend pdfkit PDF generator (`/api/invoices/:id/pdf`) & disabled email endpoint |
| `backend/src/models/Invoice.js` | Formal invoice model with `INV-{Date.now()}-{shopId}` beforeValidate hook |

### 15.2 Files partially reviewed (not fully read)

| File | What was confirmed | What was not read |
|---|---|---|
| `backend/src/controllers/saleController.js` | Invoice # generation (~line 947), idempotency key handling (~line 652), refund models | Lines 1000–2694 |

### 15.3 Files not read (noted for completeness)

| File | Why not read | Impact on audit |
|---|---|---|
| `frontend/src/pages/Settings.jsx` | Not read | Receipt settings UI — imports confirmed via settingsSlice |
| `frontend/src/pages/PrintBarcode.jsx` | Not read | Product labels only — not receipts |
| `frontend/src/pages/PrintQR.jsx` | Not read | Product labels only — not receipts |
| `mobile/plugins/zana-bluetooth-printer/` | Not read | Native Android plugin — JS bridge reviewed via nativeBluetooth.js |

---

*End of RECEIPT_AUDIT.md*
