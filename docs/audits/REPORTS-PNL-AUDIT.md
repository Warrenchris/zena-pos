# Reports & Analytics (Profit & Loss Tab) Audit

**Target Repository:** Warrenchris/zena-pos  
**Branch:** master  
**Audit Phase:** Phase 1 (Read-Only Audit)  
**Date:** October 7, 2026  
**Auditor:** Antigravity Autonomous Engineering Agent  

---

## Executive Summary & Observed Anomaly

On `/reports`, under the **Profit & Loss** tab for date period **Oct 01 – 07, 2026**, the following metrics were observed on the user interface:

| Metric Card | Observed Display Value |
|---|---|
| Gross Revenue (Pre-Discount) | KSh 16,725.00 |
| Total Tax (Sales Tax) | KSh 0.00 |
| Discounts | KSh 0.00 |
| Revenue (After Discounts) | KSh 16,385.00 |
| COGS | KSh 13,618.00 |
| Gross Profit | KSh 2,767.00 |
| Operating Expenses | KSh 45,000.00 |
| Net Profit | KSh -42,233.00 |

### The Core Discrepancies
1. **Unexplained 340.00 Gap:**  
   $$\text{Gross Revenue } (16,725.00) - \text{Discounts } (0.00) = 16,725.00 \neq 16,385.00$$  
   There is an unexplained shortfall of **340.00** between Gross Revenue and the card labeled *"Revenue (After Discounts)"*. No card, tooltip, or line item explains where 340.00 went.
2. **Missing Export Elements:**  
   CSV, Excel, and PDF exports do not reconcile and either omit refund/COGS/gross profit data or omit P&L reporting entirely.
3. **Banner Clipping Under Sticky Navigation Bar:**  
   The email verification banner (`EmailVerificationBanner.jsx`) is partially obscured and clipped beneath the sticky floating top navigation bar (`TopNavBar.jsx`) upon scrolling down on desktop and mobile viewports.

---

## 1.1 Trace of the P&L Endpoint End-to-End

### Route & Controller Mapping
- **Route:** `GET /api/reports/profit-loss?startDate=&endDate=`  
- **Route Definition:** [`backend/src/routes/reports.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/routes/reports.js#L11)
  ```javascript
  router.use(auth, checkRole(['admin', 'manager', 'org_admin']));
  router.get('/profit-loss', validateDateRange, controller.getProfitAndLoss);
  ```
- **Controller Implementation:** [`backend/src/controllers/reportsController.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/reportsController.js#L262-L361)

### Date-Range & Scoping Clauses

```javascript
// backend/src/controllers/reportsController.js:264-276
const { startDate, endDate } = req.query;
const targetShopId = req.shopId || req.user?.shopId;

const where = { shopId: targetShopId, ...NON_CANCELLED_SALE_FILTER };
const expenseWhere = { shopId: targetShopId };
if (startDate || endDate) {
  const s = startDate ? new Date(startDate) : new Date('1970-01-01');
  const e = endDate ? new Date(endDate) : new Date();
  s.setHours(0,0,0,0);
  e.setHours(23,59,59,999);
  where.createdAt = { [Op.between]: [ s, e ] };
  expenseWhere.createdAt = { [Op.between]: [ s, e ] };
}
```

- **Date Range Normalization:**  
  Start date normalized to `00:00:00.000` local time; end date normalized to `23:59:59.999` local time. If omitted, start defaults to epoch `1970-01-01` and end defaults to current moment.
- **Sale Filter (`where`):**  
  Scoped strictly to `shopId: targetShopId`.  
  `NON_CANCELLED_SALE_FILTER = { saleStatus: { [Op.ne]: 'cancelled' } }` ([`backend/src/constants/saleFilters.js:3-5`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/constants/saleFilters.js#L3-L5)).
- **Sale Statuses Counted:**  
  Sales with `saleStatus != 'cancelled'` are included: `'pending'`, `'confirmed'`, `'processing'`, `'completed'`, `'refunded'`, `'partially_refunded'`, `'partial_refund'`. (Note: there is no `'voided'` status in the Sequelize `Sale.saleStatus` enum; cancelled sales are properly excluded).
- **Refund Scoping (`refundWhere`):**  
  Scoped by:
  ```javascript
  const refundWhere = { shopId: targetShopId, status: 'processed' };
  if (where.createdAt) {
    refundWhere.createdAt = where.createdAt;
  }
  ```
  Only refunds with `status = 'processed'` created within `[s, e]` for `shopId` are counted.
- **Returned COGS Scoping:**  
  Scoped by `refundWhere` PLUS `disposition = 'restock'`:
  ```javascript
  where: {
    ...refundWhere,
    disposition: 'restock'
  }
  ```
  Items damaged or returned to supplier are not added back to inventory or deducted from COGS.
- **Expense Scoping (`expenseWhere`):**  
  Scoped strictly to `shopId: targetShopId` and `createdAt` between `[s, e]`.

---

### Step-by-Step Computation for Each Metric

#### 1. `grossRevenue` (Pre-Discount, Pre-Tax Subtotal)
```javascript
// backend/src/controllers/reportsController.js:279-296
const [subtotalSum, discountSum, taxSum] = await Promise.all([
  Sale.sum('subtotal', { where }),
  Sale.sum('discount', { where }),
  Sale.sum('tax', { where }),
]);

let revenuePreDiscount = Number(subtotalSum || 0);
if (!revenuePreDiscount) {
  const row = await SaleItem.findOne({
    include: [{ model: Sale, required: true, where, attributes: [] }],
    attributes: [
      [sequelize.literal('SUM(SaleItem.quantity * COALESCE(NULLIF(SaleItem.price, 0), SaleItem.unitPrice, SaleItem.originalPrice, 0))'), 'amount']
    ],
    raw: true
  });
  revenuePreDiscount = Number(row?.amount || 0);
}
const grossRevenue = revenuePreDiscount;
```
`grossRevenue` represents the sum of sale subtotals before discounts and taxes.

#### 2. `totalTax`
```javascript
// backend/src/controllers/reportsController.js:339
const totalTax = Number(taxSum || 0);
```
Sum of `Sale.tax` across non-cancelled sales in the date range.

#### 3. `totalDiscount`
```javascript
// backend/src/controllers/reportsController.js:297
const totalDiscount = Number(discountSum || 0);
```
Sum of `Sale.discount` across non-cancelled sales in the date range.

#### 4. `revenue` and `netRevenue`
```javascript
// backend/src/controllers/reportsController.js:302-303, 340
const totalRefunds = Number(await SaleRefund.sum('amount', { where: refundWhere }) || 0);
const revenue = Math.max(0, revenuePreDiscount - totalDiscount - totalRefunds);
const netRevenue = revenue;
```
**CRITICAL FINDING:** `revenue` is computed by deducting both `totalDiscount` and `totalRefunds` from `revenuePreDiscount`. However, `totalRefunds` is NOT included in the JSON response returned to the client!

#### 5. `cogs` (Cost of Goods Sold)
```javascript
// backend/src/controllers/reportsController.js:306-330
const cogsRow = await SaleItem.findOne({
  include: [
    { model: Sale, required: true, where, attributes: [] },
    { model: Product, required: true, attributes: [] }
  ],
  attributes: [[sequelize.literal('SUM(SaleItem.quantity * COALESCE(Product.cost, 0))'), 'cogs']],
  raw: true
});
const grossCogs = Number(cogsRow?.cogs || 0);

const refundCogsRow = await SaleRefund.findOne({
  include: [
    { model: Product, as: 'product', required: true, attributes: [] }
  ],
  where: {
    ...refundWhere,
    disposition: 'restock'
  },
  attributes: [[sequelize.literal('SUM(SaleRefund.quantity * COALESCE(product.cost, 0))'), 'returnedCogs']],
  raw: true
});
const returnedCogs = Number(refundCogsRow?.returnedCogs || 0);
const cogs = Math.max(0, grossCogs - returnedCogs);
```
Calculates gross COGS from sale items, then subtracts returned cost for items marked `restock`.

#### 6. `grossProfit`
```javascript
// backend/src/controllers/reportsController.js:334
const grossProfit = revenue - cogs;
```
Direct difference between net revenue and COGS.

#### 7. `operatingExpenses`
```javascript
// backend/src/controllers/reportsController.js:332, 341
const operatingExpenses = Number(await Expense.sum('amount', { where: expenseWhere }) || 0);
const totalExpenses = operatingExpenses;
```
Sum of `Expense.amount` within `expenseWhere`.

#### 8. `profit` (Net Profit)
```javascript
// backend/src/controllers/reportsController.js:335
const profit = grossProfit - operatingExpenses;
```
Operating profit after deducting operating expenses from gross profit.

#### Response Payload Sent to Frontend:
```javascript
// backend/src/controllers/reportsController.js:343-356
res.json({
  // New fields
  revenue,
  cogs,
  grossProfit,
  operatingExpenses,
  profit,
  // Legacy fields (kept for UI compatibility)
  grossRevenue,
  totalTax,
  totalDiscount,
  netRevenue,
  totalExpenses,
});
```

---

## 1.2 Verification of H1 with Real MySQL Data

Executed read-only SELECT queries on the active dev MySQL stack (`docker exec zana-mysql mysql -uroot -proot zana_pos`):

### 1. Active Shop Verification
```sql
SELECT id, name, createdAt FROM Shops;
```
**Output:**
```
id  name      createdAt
4   SokoSafi  2026-10-06 10:36:37
```

### 2. Sales in Period Oct 01–07, 2026
```sql
SELECT id, shopId, subtotal, discount, tax, total, saleStatus, createdAt 
FROM Sales 
WHERE shopId = 4 
ORDER BY id ASC;
```
**Output:**
```
id  shopId  subtotal  discount  tax   total     saleStatus       createdAt
1   4       1265.00   0.00      0.00  1265.00   completed        2026-10-06 10:54:09
2   4       445.00    0.00      0.00  445.00    completed        2026-10-06 10:55:20
3   4       840.00    0.00      0.00  840.00    partial_refund   2026-10-06 11:42:26
4   4       1665.00   0.00      0.00  1665.00   completed        2026-10-06 11:43:42
5   4       3110.00   0.00      0.00  3110.00   completed        2026-10-06 11:50:33
6   4       900.00    0.00      0.00  900.00    completed        2026-10-07 07:44:41
7   4       2820.00   0.00      0.00  2820.00   completed        2026-10-07 07:45:28
8   4       5680.00   0.00      0.00  5680.00   completed        2026-10-07 09:57:32
9   4       1250.00   0.00      0.00  1250.00   completed        2026-10-07 12:57:54
10  4       830.00    0.00      0.00  830.00    completed        2026-10-07 12:59:31
```

At the exact timestamp the screenshot was taken (prior to sales 9 & 10 being entered), sales 1 through 8 were present:
$$\text{Sum of Sales 1 through 8} = 1265 + 445 + 840 + 1665 + 3110 + 900 + 2820 + 5680 = \mathbf{16,725.00}$$

Currently, with sales 9 & 10:
$$\text{Sum of Sales 1 through 10} = 16,725.00 + 1250.00 + 830.00 = \mathbf{18,805.00}$$

### 3. Sale Refunds Query
```sql
SELECT id, saleId, productId, quantity, amount, disposition, status, createdAt 
FROM SaleRefunds 
WHERE shopId = 4;
```
**Output:**
```
id  saleId  productId  quantity  amount  disposition  status     createdAt
1   3       37         1         340.00  restock      processed  2026-10-06 11:56:42
```

### 4. COGS and Refunded Product Verification
```sql
SELECT id, name, cost, price FROM Products WHERE id = 37;
```
**Output:**
```
id  name                      cost    price
37  Fresh Fri Cooking Oil 1L  290.00  340.00
```
- Gross COGS for sales 1–8: `13,908.00`
- Returned COGS for restocked refund (Product 37, 1 unit @ cost 290.00): `290.00`
- Net COGS: $13,908.00 - 290.00 = \mathbf{13,618.00}$ (matches screenshot card!)

### 5. Reconciliation Identity Proof
For sales 1–8:
$$\text{Gross Revenue: } 16,725.00$$
$$\text{Discounts: } 0.00$$
$$\text{Processed Refunds: } 340.00$$
$$\text{Net Revenue: } 16,725.00 - 0.00 - 340.00 = \mathbf{16,385.00}$$
$$\text{Gross Profit: } 16,385.00 - 13,618.00 = \mathbf{2,767.00}$$
$$\text{Net Profit: } 2,767.00 - 45,000.00 = \mathbf{-42,233.00}$$

**Conclusion for H1:** CONFIRMED. The 340.00 discrepancy is entirely accounted for by the processed partial refund of Sale 3 (Product 37). The calculation in `reportsController.js` already deducts `totalRefunds`, but the endpoint never returned `totalRefunds`, and the UI card is mislabeled as *"Revenue (After Discounts)"* rather than *"Net Revenue (after discounts & refunds)"*.

---

## 1.3 Verification of H2: Origin of the 45,000.00 Operating Expenses

### 1. Database Row in `Expenses`
```sql
SELECT id, description, amount, date, userId, employeeId, category, paymentMethod, createdAt 
FROM Expenses;
```
**Output:**
```
id  description       amount    date                 userId  employeeId  category  paymentMethod  createdAt
1   Rent for October  45000.00  2026-10-07 00:00:00  1       NULL        rent      cash           2026-10-07 07:47:53
```

### 2. User Origin
```sql
SELECT id, name, email, role, shopId FROM Users WHERE id = 1;
```
**Output:**
```
id  name          email                     role   shopId
1   Warren Chris  warrenchris745@gmail.com  admin  4
```

### 3. Examination of Seeder Files
- [`backend/src/seeders/seed.js:260-291`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/seeders/seed.js#L260-L291):  
  Seeds 3 expenses for `defaultShop`:
  1. "Monthly Rent" — 1,000.00
  2. "Electricity Bill" — 200.00
  3. "Stock Reorder - Electronics" — 5,000.00  
  Total seeded: 6,200.00 (NOT 45,000.00).
- [`backend/scripts/seed-kenyan-data.js:330-371`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/scripts/seed-kenyan-data.js#L330-L371):  
  Seeds "Westlands Shop Rent Payment (Landlord)" for 55,000.00 and utility bills.

**Conclusion for H2:** REFUTED. The 45,000.00 expense did NOT come from seeder scripts. It was manually entered by the admin user (Warren Chris, `userId: 1`) on **2026-10-07 at 07:47:53** (in between Sale 7 at 07:45:28 and Sale 8 at 09:57:32) using the Expenses UI / API.

---

## 1.4 Verification of H3: Origin of Total Tax 0.00

### 1. Source of `taxSum`
In `reportsController.js:282`:
```javascript
Sale.sum('tax', { where })
```
`Sale.tax` is populated at sale checkout in `saleController.js`:
```javascript
// backend/src/controllers/saleController.js:428-430
const shopSettings = await SystemSettings.findOne({ where: { shopId } });
const shopTaxRate = parseFloat(shopSettings?.taxRate !== undefined && shopSettings?.taxRate !== null ? shopSettings.taxRate : 0);
const isTaxInclusive = Boolean(shopSettings?.taxInclusive);
```
Line 481:
```javascript
const itemTaxRate = effectiveTaxCategory === 'standard' ? shopTaxRate : 0.00;
```
Line 521:
```javascript
lineTaxAmount = round2(taxableBase * (d.itemTaxRate / 100));
```
Line 550-556:
```javascript
totalServerTax = round2(totalServerTax);
Sale.tax = totalServerTax;
```

### 2. Shop 4 Settings in Database
```sql
SELECT id, shopId, taxRate, taxInclusive FROM SystemSettings WHERE shopId = 4;
```
**Output:**
```
id  shopId  taxRate  taxInclusive
1   4       0.00     0
```
Because `taxRate` is configured as `0.00`, every line item computed `0.00` tax and every sale recorded `tax = 0.00`.

### 3. Consistency with Tax Reports Tab (`getTaxEstimate`)
In `reportsController.js:364-500`:
- Evaluates line items from `SaleItem`.
- `SaleItem.taxRate = 0.00` and `SaleItem.taxAmount = 0.00`.
- Recorded tax totals `0.00`.
- The P&L tab and the Tax Reports tab both evaluate to `0.00` total tax.

**Conclusion for H3:** CONFIRMED (Legitimate zero tax). The 0.00 tax figure is neither a bug nor a missing sum; it accurately reflects the current shop setting of `taxRate = 0.00%`.

---

## 1.5 Reconciliation Identity & Export Functionality Audit

### UI Card Display
In [`frontend/src/pages/Reports.jsx:716-730`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/Reports.jsx#L716-L730):
```jsx
{tab==='pl' && data && (
  <>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <Stat label="Gross Revenue (Pre-discount)" value={data.grossRevenue} formatCurrency={formatCurrency} />
      <Stat label="Total Tax (Sales Tax)" value={data.totalTax} formatCurrency={formatCurrency} />
      <Stat label="Discounts" value={data.totalDiscount} formatCurrency={formatCurrency} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <Stat label="Revenue (After Discounts)" value={data.revenue ?? data.netRevenue} formatCurrency={formatCurrency} />
      <Stat label="COGS" value={data.cogs} formatCurrency={formatCurrency} />
      <Stat label="Gross Profit" value={data.grossProfit ?? ((data.revenue ?? data.netRevenue) - (data.cogs || 0))} highlight formatCurrency={formatCurrency} />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Stat label="Operating Expenses" value={data.operatingExpenses ?? data.totalExpenses} formatCurrency={formatCurrency} />
      <Stat label="Net Profit" value={data.profit} highlight formatCurrency={formatCurrency} />
    </div>
  </>
)}
```
**Deficiencies:**
1. No "Refunds" card exists.
2. Label says "Revenue (After Discounts)" while the value is actually pre-discount minus discounts minus refunds.
3. The cards do not visually reconcile for the end user: $16,725 - 0 \neq 16,385$.

### Export Audits in `Reports.jsx`
1. **CSV Export ([`Reports.jsx:365-367`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/Reports.jsx#L365-L367)):**
   ```javascript
   } else if (tab === 'pl' && data) {
     rows = [['Gross Revenue','Tax','Discount','Net Revenue','Expenses','Profit'], [data.grossRevenue, data.totalTax, data.totalDiscount, data.netRevenue, data.totalExpenses, data.profit]]
   }
   ```
   - Lacks `Refunds`.
   - Lacks `COGS`.
   - Lacks `Gross Profit`.
   - The CSV numbers do not reconcile ($16,725.00 - 0.00 \neq 16,385.00$).
2. **Excel Export ([`Reports.jsx:384-405`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/Reports.jsx#L384-L405)):**
   Only checks `if (tab === 'sales')`. When `tab === 'pl'`, it exports an empty workbook with no sheets or data.
3. **PDF Export ([`Reports.jsx:419-441`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/Reports.jsx#L419-L441)):**
   Only checks `if (tab === 'sales')`. When `tab === 'pl'`, it prints only a title header and zero content.
4. **Print (`window.print()`):**
   Prints the DOM, inheriting the exact card layout issues of the page.

---

## 1.6 Email Verification Banner Clipping Audit

### Component Architecture & Locations
- **Banner Component:** [`frontend/src/components/EmailVerificationBanner.jsx`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/components/EmailVerificationBanner.jsx)
- **Navigation Bar:** [`frontend/src/components/navigation/TopNavBar.jsx`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/components/navigation/TopNavBar.jsx#L34)
- **Root Layout:** [`frontend/src/components/Layout.jsx:111-123`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/components/Layout.jsx#L111-L123)

```jsx
<div className={`${paddingLeftClass} flex flex-col min-h-screen transition-[padding-left] duration-200 ease-out`}>
  <TopNavBar
    onMenuClick={() => setSidebarOpen(true)}
    isSidebarOpen={sidebarOpen}
  />
  <SubscriptionBanner />
  <EmailVerificationBanner />
  <main id="main-content" className="flex-1 pb-12 safe-area-padding">
    <div className={location.pathname === '/pos' ? 'w-full px-3 sm:px-6' : 'app-shell app-shell--wide'}>
      <Outlet />
    </div>
  </main>
</div>
```

### Root Cause Analysis
1. `TopNavBar.jsx` line 34 defines:
   ```jsx
   <header className={`sticky top-4 z-30 px-4 sm:px-6 mb-6 ${className}`}>
     <div className="mx-auto max-w-[1440px] bg-surface border border-border-default shadow-floating rounded-2xl h-14 px-4 flex items-center justify-between gap-4 transition-colors duration-200">
   ```
   The navbar is styled as a floating island pill with `sticky top-4 z-30`.
2. In `Layout.jsx`, `<SubscriptionBanner />` and `<EmailVerificationBanner />` are placed **after** `TopNavBar` in the DOM tree.
3. The banners are non-sticky block elements (`relative w-full border-b px-4 py-3 sm:px-6`).
4. When the page is at `scrollTop = 0`, the banner appears below the navbar.
5. However, as soon as the user scrolls down by 30–70px, normal document flow scrolls the banners upward into the top viewport area.
6. Because `TopNavBar` remains pinned at `top: 1rem (16px)` with stacking context `z-30`, the scrolling banner slides directly underneath `TopNavBar`.
7. The upper half of the banner (the "VERIFY EMAIL" badge, the heading, and the "Resend Email" button) is physically occluded by `TopNavBar`'s floating pill.

### Visual Evidence Captured via Headless Browser
1. **Unscrolled (`reports_page_banner_1791383069575.png`):** Banner is fully visible below navbar.
2. **Scrolled ~40px (`reports_scrolled_1791383114815.png`):** Top half of badge and "Resend Email" button are sliced in half by the navbar.
3. **Scrolled ~70px (`reports_scrolled_further_1791383157494.png`):** Entire heading and "Resend Email" button are completely buried and invisible underneath the navbar.

### Scope of Affected Pages
Every route wrapped by `Layout.jsx` is affected:
- `/dashboard`, `/reports`, `/products`, `/customers`, `/employees`, `/pos`, `/expenses`, `/settings`, `/company-settings`, `/billing`, `/invoices`, `/quotations`, `/sales-returns`, `/purchases`, `/purchase-orders`, `/purchase-returns`, `/coupons`, `/gift-cards`, `/discounts`, `/brands`, `/units`, `/variants`, `/warranties`, `/manage-stock`, `/stock-adjustment`, `/stock-transfer`, `/categories`, `/subcategories`, `/sales-forecasting`, `/financial-analysis`, `/ai-insights`, etc.

---

## 1.7 Existing Tests Audit & Known Failing Backend Tests

### 1. Tests Covering Reports
- [`backend/tests/taxEstimateReport.test.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/tests/taxEstimateReport.test.js):  
  Tests `/api/reports/tax-estimate`. Specifically asserts that standard/exempt/zero-rated categories compute tax, and that processed refunds deduct from recorded tax and taxable revenue.
- [`backend/tests/phase2.test.js:560,591,646`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/tests/phase2.test.js):  
  Tests `/api/reports/employee-sales`.
- **Profit & Loss Tests:**  
  Currently **zero** backend tests exist for `/api/reports/profit-loss`.
- **Frontend Tests:**  
  Currently zero frontend tests assert on `/api/reports/profit-loss` fields or card rendering.

### 2. Baseline Backend Test Suite Execution Results
The full backend test suite (`npm test`, 79 test suites, 962 tests) completed execution.
Baseline result: **71 passed, 8 failed, 954 tests passed, 8 tests failed**.

None of the 8 failures touch reports or the P&L endpoint:
1. `tests/phase6bOperationalReliability.test.js`: Error message mismatch (`Expected: "Sale not found"`, `Received: "Resource not found."`).
2. `tests/phase3UserTenantSecurity.test.js`: Error code mismatch (`Expected: "SHOP_ACCESS_DENIED"`, `Received: "TENANT_MISMATCH"`).
3. `tests/phase6aReleaseBlockers.test.js`: Employee expense creation authorization (`Expected: 201`, `Received: 403`).
4. `tests/orgAdminAccessControl.test.js`: Org owner edit user self (`Expected: 200`, `Received: 403`).
5. `tests/phase2.test.js`: `TEST 2.14c` viewing employee profile (`Expected: 403`, `Received: 404`). Does not touch reports.
6. `tests/billingEndpoints.test.js`: Plan count assertion (`Expected: 3`, `Received: 9`).
7. `tests/resetPasswordAccountTypeIsolation.test.js`: User reset token vs employee account (`Expected: 400`, `Received: 200`).
8. `tests/employeeLoginRole.test.js`: Cashier employee GET `/api/employees` (`Expected: 200`, `Received: 403`).

Per guidelines, none of these pre-existing failures will be touched during Phase 2.

---

## 1.8 Hypotheses Summary Scorecard

| Hypothesis | Verdict | Summary Evidence |
|---|:---:|---|
| **H1: 340.00 is processed refunds, missing from UI** | **CONFIRMED** | `reportsController.js:303` subtracts `totalRefunds` (340.00 from Sale 3, Product 37), but does not return it in JSON. `Reports.jsx` labels card "Revenue (After Discounts)" without showing refunds. |
| **H2: 45,000.00 expenses come from seed data** | **REFUTED** | `Expenses` row ID 1 ("Rent for October", 45,000.00) was created by user `Warren Chris` on 2026-10-07 at 07:47:53 via UI/API. `seed.js` only seeds 6,200.00 for Shop 1. |
| **H3: Total Tax 0.00 is legitimate or bug** | **CONFIRMED** *(Legitimate)* | `SystemSettings` for Shop 4 has `taxRate: 0.00%`. Sales correctly calculated 0.00 tax. P&L and Tax Reports tabs are consistent. |
| **H4: Banner clipping is layout/sticky issue** | **CONFIRMED** | `TopNavBar` is `sticky top-4 z-30`. Banners in `Layout.jsx` are in normal flow after the navbar. Scrolling causes banners to slide behind the floating navbar pill across all 30+ pages. |

---

## Proposed Plan for Phase 2 (Pending User Approval)

### (a) Display-Only / Frontend Changes
1. **`frontend/src/pages/Reports.jsx`:**
   - Add a dedicated **Refunds** card in the first row alongside Gross Revenue, Total Tax, and Discounts:
     - Row 1: `Gross Revenue (Pre-discount)`, `Total Tax (Sales Tax)`, `Discounts`, `Refunds` (4-column grid on desktop: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
     - Row 2: Rename `Revenue (After Discounts)` to `Net Revenue (after discounts & refunds)`. Keep `COGS` and `Gross Profit`.
     - Row 3: `Operating Expenses` and `Net Profit`.
   - **Reconciliation Guarantee:**  
     $$\text{Gross Revenue} - \text{Discounts} - \text{Refunds} = \text{Net Revenue}$$  
     $$\text{Net Revenue} - \text{COGS} = \text{Gross Profit}$$  
     $$\text{Gross Profit} - \text{Operating Expenses} = \text{Net Profit}$$
2. **Exports (`exportCsv`, `exportExcel`, `exportPdf`):**
   - In `exportCsv`: Include `Refunds`, `COGS`, and `Gross Profit` in the P&L CSV:
     `['Gross Revenue', 'Tax', 'Discounts', 'Refunds', 'Net Revenue', 'COGS', 'Gross Profit', 'Operating Expenses', 'Net Profit']`.
   - In `exportExcel`: Add handler for `tab === 'pl'` exporting the reconciled P&L rows to Excel.
   - In `exportPdf`: Add handler for `tab === 'pl'` exporting the reconciled P&L summary table to PDF.
3. **Banner Layout Fix (`frontend/src/components/Layout.jsx`):**
   - Fix the clipping at the layout root cause: render system banners (`<SubscriptionBanner />` and `<EmailVerificationBanner />`) **above** `<TopNavBar />` in `Layout.jsx`.
   - When rendered above `<TopNavBar />`, the banner sits at the very top of the page; scrolling down scrolls the banner away naturally without sliding behind the floating pill of `TopNavBar`.

### (b) Backend Response Fields (Additive Only)
1. **`backend/src/controllers/reportsController.js`:**
   - In `res.json(...)`, return `totalRefunds` and `returnedCogs` as additive fields:
     ```javascript
     res.json({
       // New fields
       revenue,
       cogs,
       grossProfit,
       operatingExpenses,
       profit,
       totalRefunds,
       returnedCogs,
       // Legacy fields (kept for UI compatibility)
       grossRevenue,
       totalTax,
       totalDiscount,
       netRevenue,
       totalExpenses,
     });
     ```
   - No existing keys or existing computed formulas will be altered.

### (c) Value Computation Changes
- **NONE.** The existing calculations in `reportsController.js` are verified to be mathematically sound.

### (d) Test Plan for Phase 2
1. **Backend Integration Test (`backend/tests/reportsProfitLoss.test.js`):**
   - Tests `GET /api/reports/profit-loss`.
   - Asserts that with a sale, a discount, and a processed partial refund:
     - `revenue = grossRevenue - totalDiscount - totalRefunds`.
     - `totalRefunds` is returned and equals the refund amount.
     - `returnedCogs` reduces COGS for restocked items.
     - Cancelled sales are excluded.
   - Demonstration: fails against old code missing `totalRefunds`, passes once added.
2. **Frontend Unit/Helper Test:**
   - Validates that the P&L cards and calculations satisfy $\text{Gross} - \text{Discount} - \text{Refunds} = \text{Net Revenue}$.
3. **Regression Check:**
   - Verify `npm run build` succeeds in frontend.
   - Verify full backend test suite introduces zero new failures.

---

## Decisions Needed from User Before Phase 2 Execution

1. **Card Wording:**  
   Confirm approval for card label:  
   `Net Revenue (after discounts & refunds)` (or alternative preferred phrasing).
2. **Grid Layout on P&L Tab:**  
   Recommend changing the top row to a 4-card grid:  
   `[Gross Revenue]` `[Total Tax]` `[Discounts]` `[Refunds]`.  
   Confirm preference.
3. **Banner Placement in `Layout.jsx`:**  
   Recommend moving `<SubscriptionBanner />` and `<EmailVerificationBanner />` above `<TopNavBar />` in `Layout.jsx`.  
   Confirm preference.
4. **Seed Expenses:**  
   Since H2 proved the 45,000.00 expense was entered by the user in the database (not seeded), the recommendation is to leave seed scripts alone and not alter database data.
