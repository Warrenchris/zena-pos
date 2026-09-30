# Phase 7C Step 1: Tax Integrity & KRA Groundwork — Walkthrough & Verification Report

**Date:** 2026-09-30  
**Status:** COMPLETE (STEP 1 VERIFIED; STEP 2 BLOCKED AT GATE)  
**Branch:** `master`  
**Corpus / Repository:** `Warrenchris/zena-pos`

---

## 1. Executive Summary

Phase 7C Step 1 establishes a comprehensive, production-grade tax integrity architecture across both backend and frontend of the Zana POS platform. Prior to this implementation, the POS client sent arbitrary tax amounts that the server trusted without recalculation, refunds did not track tax reversions by tax classification, tax reports guessed VAT at a flat 16% of total revenue, and products lacked tax category classification required for Kenya Revenue Authority (KRA) VAT compliance.

Step 1 resolves all of these vulnerabilities without introducing regressions. Furthermore, per user instruction and project decision D6, **Step 2 (eTIMS integration) remains BLOCKED pending KRA sandbox credentials**, and this phase terminates strictly at the verification gate.

---

## 2. Key Architecture & Design Decisions

### D9: Tax-Inclusive vs. Tax-Exclusive Pricing Convention
* **Settled Decision:** `taxInclusive` defaults to `false` (exclusive pricing) on `SystemSettings` to preserve 100% backward compatibility for existing merchants.
* **KRA Retail Support:** Merchants who price inventory inclusive of VAT (standard retail practice in Kenya) can toggle `taxInclusive: true` in POS Configuration settings.
* **Mathematical Implementation:**
  - **Exclusive ($T_{inc} = \text{false}$):**
    $$\text{itemTax} = \text{itemNetBase} \times \frac{\text{taxRate}}{100}$$
    $$\text{itemTotal} = \text{itemNetBase} + \text{itemTax}$$
  - **Inclusive ($T_{inc} = \text{true}$):**
    $$\text{itemTax} = \text{itemGrossBase} \times \frac{\text{taxRate}}{100 + \text{taxRate}}$$
    $$\text{itemNetBase} = \text{itemGrossBase} - \text{itemTax}$$
* **Proportional Discount Apportionment:** Cart-level discounts are apportioned proportionally across line items before tax calculation:
  $$\text{discountRatio} = \frac{\text{Subtotal} - \text{Discount}}{\text{Subtotal}}$$

### Tax Category Hierarchy & Fallback
* Standardized categories: `'standard'` (16%), `'zero_rated'` (0%), and `'exempt'` (0%).
* Product-level `taxCategory` falls back to `Category.taxCategory`, defaulting to `'standard'` if neither is defined.
* Migration backfilled existing categories and products with `'standard'`.

### Refund Tax Tracking & Credit Note Generation
* When processing partial or full refunds, refundable tax is backed out proportionally by line item tax category.
* Every `SaleRefund` records line-item tax details (`taxAmount`, `taxRate`, `taxCategory`, `netAmount`) in `SaleRefund.metadata.items`.
* `Sale.metadata.refundedTax` maintains a running total of all refunded tax.
* `getCreditNote` exposes `taxAmount`, `taxCategory`, and top-level `totalTaxRefunded` for accounting reconciliation.

### Tax Estimation & Reporting
* `reportsController.getTaxEstimate` now computes tax from recorded `SaleItem.taxAmount` grouped by tax category and deducts refunds.
* Backward compatibility is preserved with top-level keys (`taxableRevenue`, `taxRate`, `estimatedTax`) while adding category-level breakdowns (`standard`, `zero_rated`, `exempt`).

---

## 3. Atomic Commits & Changes

### Commit 1: Schema Migration & Models
* **Commit Hash:** `39b58a3`
* **Commit Message:** `feat(tax): migration and models for Products.taxCategory, Categories.taxCategory, and SystemSettings.taxInclusive`
* **Affected Files:**
  - `backend/migrations/20261001000000-add-tax-category-and-tax-inclusive.js`
  - `backend/src/models/Product.js`
  - `backend/src/models/Category.js`
  - `backend/src/models/SystemSettings.js`
  - `backend/src/routes/categories.js`
  - `backend/src/routes/products.js`
  - `backend/src/routes/settings.js`
  - `backend/src/controllers/categoryController.js`
  - `backend/src/controllers/productController.js`
  - `backend/tests/taxIntegrityMigration.test.js`
* **Summary:** Added `taxCategory` ENUM(`'standard'`, `'zero_rated'`, `'exempt'`) to `Products` and `Categories`, added `taxInclusive` BOOLEAN to `SystemSettings`. Added unit test `taxIntegrityMigration.test.js` (3/3 passed).

### Commit 2: Server-Side Authoritative Tax Recomputation
* **Commit Hash:** `e19ad6b`
* **Commit Message:** `feat(tax): server-side tax recompute with category fallback and inclusive/exclusive support`
* **Affected Files:**
  - `backend/src/controllers/saleController.js`
  - `backend/tests/setup.js`
  - `backend/tests/taxIntegrityRecompute.test.js`
* **Summary:** Implemented authoritative server-side tax recomputation in `createSaleInternal`. Recomputes tax per line item with category fallback and proportional discount allocation. Rejects client tax tampering while permitting $\pm 0.02$ rounding tolerance. Added 14 comprehensive unit/integration tests in `taxIntegrityRecompute.test.js` (14/14 passed).

### Commit 3: Proportional Refund Tax Backout & Credit Notes
* **Commit Hash:** `759252e`
* **Commit Message:** `feat(tax): allocate tax on partial and full refunds by tax category`
* **Affected Files:**
  - `backend/src/controllers/saleController.js`
  - `backend/tests/refundTaxAllocation.test.js`
* **Summary:** Updated `processRefund` to compute and back out tax proportionally by category, persisting audit trail in `SaleRefund.metadata.items` and cumulative `Sale.metadata.refundedTax`. Updated `getCreditNote` endpoint. Added 9 unit tests in `refundTaxAllocation.test.js` (9/9 passed).

### Commit 4: Accurate Tax Reports by Category
* **Commit Hash:** `6417f99`
* **Commit Message:** `feat(tax): update tax report to use recorded sale tax with category breakdown`
* **Affected Files:**
  - `backend/src/controllers/reportsController.js`
  - `backend/tests/taxEstimateReport.test.js`
* **Summary:** Refactored `getTaxEstimate` to query recorded `SaleItem.taxAmount` aggregated by category and subtract refunded tax, returning both legacy summary fields and detailed breakdowns. Added 5 unit tests in `taxEstimateReport.test.js` (5/5 passed).

### Commit 5: Frontend Tax Selectors & POS Display
* **Commit Hash:** `4483bbc`
* **Commit Message:** `feat(tax): frontend tax category selectors, taxInclusive settings toggle, and POS display`
* **Affected Files:**
  - `frontend/src/components/CategoryModal.jsx`
  - `frontend/src/pages/Categories.jsx`
  - `frontend/src/pages/CreateProduct.jsx`
  - `frontend/src/components/ProductModal.jsx`
  - `frontend/src/components/POSModal.jsx`
  - `frontend/src/pages/Settings.jsx`
  - `frontend/src/store/slices/settingsSlice.js`
* **Summary:** Added tax category dropdowns to CategoryModal, ProductModal, and CreateProduct (with automatic category inheritance). Added visual tax badges in Categories tree. Updated POSModal to calculate tax according to `taxInclusive` setting and line-item categories, displaying badges for zero-rated/exempt items. Added tax-inclusive pricing toggle in Settings POS Configuration. Added `taxInclusive` to Redux `settingsSlice` and satisfied `settings-slice.test.js` drift guard.

---

## 4. Hardcoded Low-Numbered Token/User ID Diagnostic (For Phase 7F)

During investigation of test isolation issues, a diagnostic grep of `backend/tests/` was performed to identify hardcoded low-numbered IDs (`101`, `102`, `201`, `88101`, etc.) that can collide with Redis 24h user status tombstones when tests run out of order or fail to clean up:

| Test Suite | Hardcoded IDs Found | Risk Level |
| :--- | :--- | :--- |
| `tests/phase2-4.test.js` | User `101`, `102` | High (shares IDs across suites) |
| `tests/purchases-and-orders.test.js` | User `101`, `201` | High (shares IDs across suites) |
| `tests/mpesaSecurity.test.js` | User `101` | Medium (M-Pesa auth tests) |
| `tests/mysql-salepayments.test.js` | User `101` | Medium (Sale payment tests) |
| `tests/insightsController.test.js` | User `88101` | Remediated in 7B (UUID-based random offsets) |
| `tests/dashboardController.test.js` | User `88102` | Remediated in 7B (UUID-based random offsets) |

**Recommendation for Phase 7F:** Introduce a dynamic test user helper (e.g. `createTestUserWithToken()`) that generates unique user IDs and explicitly clears the Redis status key `auth:user:status:<id>` in an `afterEach` hook.

---

## 5. Verification Results

### 1. Dedicated Tax Test Suites
```text
PASS tests/taxIntegrityMigration.test.js (3 tests)
PASS tests/taxIntegrityRecompute.test.js (14 tests)
PASS tests/refundTaxAllocation.test.js (9 tests)
PASS tests/taxEstimateReport.test.js (5 tests)
PASS tests/refundsOverhaul.test.js (6 tests)
Total: 37 passed, 0 failed (37 tests across 5 suites)
```

### 2. Frontend Test Suite & Build
```text
PASS (48 suites, 370 tests passed, 0 failed)
Vite build: Exit Code 0 (Production bundle built cleanly with PWA service worker)
```

### 3. AI Service Pytest
```text
ai_service/.venv/Scripts/python.exe -m pytest ai_service
12 passed in 55.83s (100% PASS)
```

### 4. Migration Status
```text
97 migrations UP, 0 pending
20261001000000-add-tax-category-and-tax-inclusive: UP
```

---

## 6. Gate Determination & Stop Notice

```text
======================================================================
PHASE 7C — STEP 1: TAX INTEGRITY & GROUNDWORK: PASS
======================================================================
Step 1 is production-complete and fully verified.
Per Decision D6:
STEP 2 (eTIMS INTEGRATION) IS BLOCKED: No KRA sandbox credentials
available as of 2026-09-30.
Execution is stopped at the gate. Awaiting user review and approval
before proceeding to Phase 7D (Multi-Currency & FX Accounting).
======================================================================
```
