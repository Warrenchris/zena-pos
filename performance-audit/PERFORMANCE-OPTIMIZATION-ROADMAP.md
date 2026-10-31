# ZANA POS — PERFORMANCE OPTIMIZATION ROADMAP
## Prioritized Implementation Strategy for Future Approval (Zero Execution in Current Phase)

> [!IMPORTANT]
> **This optimization roadmap is an engineering strategy blueprint for future stakeholder approval. None of the listed changes have been implemented during this audit.**

---

## Overview of Phases

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE A: CRITICAL FIXES (Week 1)                                                       │
│ Fix bundle leakage, AI forwarding 500 failure, and CORS socket queue stalls             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE B: HIGH-IMPACT OPTIMIZATIONS (Week 2 - 3)                                        │
│ Backend-For-Frontend (BFF) dashboard aggregation, dynamic export imports, mobile navbar│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE C: MEDIUM-PRIORITY IMPROVEMENTS (Week 4)                                         │
│ PWA precache slimming, Reports hook consolidation, Recharts render memoization         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE D: LONG-TERM ARCHITECTURAL SCALABILITY (Month 2+)                                │
│ Generated date-store columns, material aggregated summary tables, Redis read-replicas   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase A: Critical Fixes (Immediate Priority)

### Item A1: Fix AI Service JWT Public Key Path Resolution
* **Finding ID:** `FND-AI-01`
* **Severity:** **CRITICAL**
* **Affected Component:** `ai_service/.env` & `ai_service/src/core/auth.py`
* **Issue:** `JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem` fails to resolve when running outside docker root, causing all AI forwarding requests (`/api/ai/forward/*`) to fail with HTTP 500.
* **Proposed Action:** Update path resolution in `ai_service/src/core/auth.py` to resolve relative to `Path(__file__).parent.parent.parent / "jwt_public_key.pem"`.
* **Estimated Complexity:** Low (1 hour)
* **Expected Benefit:** Restores full AI forecasting, insights, and financial analysis functionality (currently 100% failing with 500).
* **Dependencies / Risks:** None.

### Item A2: Restore Proper POS Code-Splitting in Bundle
* **Finding ID:** `FND-FE-01`
* **Severity:** **HIGH**
* **Affected Component:** `frontend/src/components/DashboardRouter.jsx` & `frontend/src/pages/Dashboard.jsx`
* **Issue:** Static `import CashierDashboard from '../pages/CashierDashboard'` breaks Vite chunk-splitting and forces the 201 kB POS module into the main bundle.
* **Proposed Action:** Convert static imports in `DashboardRouter.jsx` to `const CashierDashboard = React.lazy(...)`.
* **Estimated Complexity:** Low (2 hours)
* **Expected Benefit:** Reduces initial JavaScript download size by ~200 kB across all non-POS routes.
* **Dependencies / Risks:** Must ensure `<Suspense>` fallback is provided in `DashboardRouter.jsx`.

### Item A3: Eliminate Development CORS Socket Stalls via Vite API Proxy
* **Finding ID:** `FND-NET-01`
* **Severity:** **HIGH**
* **Affected Component:** `frontend/vite.config.js`
* **Issue:** 16 parallel requests from port 5173 to port 3000 generate 16 `OPTIONS` preflight calls, exhausting Chrome's 6-socket limit and producing 3.5s stalls.
* **Proposed Action:** Configure `server.proxy: { '/api': 'http://localhost:3000' }` in `vite.config.js` and set `VITE_API_URL=""` for local development.
* **Estimated Complexity:** Low (2 hours)
* **Expected Benefit:** Eliminates all 16 `OPTIONS` requests; reduces dashboard network wait time from ~3.5s to ~350ms.
* **Dependencies / Risks:** Test cookie/header forwarding in dev proxy.

---

## Phase B: High-Impact Optimizations

### Item B1: Implement Unified Dashboard Aggregation API (`/api/dashboard/summary`)
* **Finding ID:** `FND-API-01`
* **Severity:** **HIGH**
* **Affected Component:** `backend/src/controllers/dashboardController.js` & `frontend/src/pages/Dashboard.jsx`
* **Issue:** 16 separate roundtrips are fired on dashboard load to assemble stats, charts, recent sales, and notifications.
* **Proposed Action:** Create a single aggregation controller that executes dashboard queries in a single multi-query or concurrent `Promise.all()` in Express, returning a unified JSON payload.
* **Estimated Complexity:** Medium (1 day)
* **Expected Benefit:** Reduces HTTP requests from 16 to 1; cuts page hydration time by 75%; eliminates staggered Recharts layout recalculations.
* **Dependencies / Risks:** Requires minor adjustments to Redux slice initialization.

### Item B2: Lazy-Load Heavy Export Libraries (`xlsx`, `jspdf`)
* **Finding ID:** `FND-FE-02`
* **Severity:** **HIGH**
* **Affected Component:** `SaleDetailModal.jsx`, `Reports.jsx`, `Expenses.jsx`
* **Issue:** 845 kB of export libraries (`xlsx` 430 kB, `jspdf` 416 kB) are loaded in the initial bundle.
* **Proposed Action:** Refactor export button handlers to load libraries dynamically:
  ```javascript
  const handleExport = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    // generate PDF
  };
  ```
* **Estimated Complexity:** Medium (4 hours)
* **Expected Benefit:** Reduces entry bundle by **845 kB** (~25% of total bundle size).
* **Dependencies / Risks:** Ensure loading spinner appears on the export button while chunk downloads.

### Item B3: Fix Mobile Viewport Horizontal Overflow in TopNavBar
* **Finding ID:** `FND-MOB-01`
* **Severity:** **MEDIUM**
* **Affected Component:** `frontend/src/components/navigation/TopNavBar.jsx`
* **Issue:** Actions container overflows 390px mobile viewports by 90px (`scrollWidth = 591px`).
* **Proposed Action:** Hide store workspace text on `< sm` viewports (show icon only) and condense notification/theme icons into a mobile drawer or overflow menu.
* **Estimated Complexity:** Low (2 hours)
* **Expected Benefit:** Restores standard mobile layout stability; eliminates horizontal page shaking on touch devices.
* **Dependencies / Risks:** None.

---

## Phase C: Medium-Priority Improvements

### Item C1: Constrain PWA Precache Manifest
* **Finding ID:** `FND-PWA-01`
* **Severity:** **MEDIUM**
* **Affected Component:** `frontend/vite.config.js` (`VitePWA` options)
* **Issue:** Workbox precaches **4.51 MB** across 104 files on initial launch.
* **Proposed Action:** Set `globPatterns` to precache only core entry assets and the POS terminal (`['**/*.{html,css,js}', '!**/assets/xlsx*.js', '!**/assets/jspdf*.js', '!**/assets/Platform*.js']`).
* **Estimated Complexity:** Low (2 hours)
* **Expected Benefit:** Cuts initial service worker background download from 4.5 MB to ~1.2 MB, saving user cellular bandwidth.
* **Dependencies / Risks:** Non-precached routes fall back to network-first caching.

### Item C2: Eliminate Dual Duplicate Queries in `Reports.jsx`
* **Finding ID:** `FND-FE-03`
* **Severity:** **MEDIUM**
* **Affected Component:** `frontend/src/pages/Reports.jsx`
* **Issue:** Separate `useEffect` hooks trigger both `daily` and `monthly` queries on page mount.
* **Proposed Action:** Consolidate date range state and trigger a single fetch call matching the active tab.
* **Estimated Complexity:** Low (2 hours)
* **Expected Benefit:** Eliminates 4 redundant analytical SQL queries per report view.
* **Dependencies / Risks:** None.

### Item C3: Externalize Static World Map SVG Data
* **Finding ID:** `FND-FE-04`
* **Severity:** **MEDIUM**
* **Affected Component:** `frontend/src/components/dashboard/LocationAudience.jsx`
* **Issue:** 233 kB of static SVG map path coordinates are hardcoded directly in JSX.
* **Proposed Action:** Move map vectors into an external compressed SVG or JSON asset in `/public/assets/` fetched only if the audience card is visible.
* **Estimated Complexity:** Low (3 hours)
* **Expected Benefit:** Shaves **233 kB** off the dashboard component chunk.
* **Dependencies / Risks:** None.

---

## Phase D: Long-Term Scalability Architecture

### Item D1: Eliminate MySQL `Using temporary` via Stored Generated Date Column
* **Finding ID:** `FND-DB-01`
* **Severity:** **HIGH (at scale)**
* **Affected Component:** `backend/migrations/*` & `backend/src/controllers/analyticsController.js`
* **Issue:** `GROUP BY DATE(CONVERT_TZ(createdAt, ...))` forces internal temporary tables on analytical queries.
* **Proposed Action:** Add a generated stored column `localSaleDate` on `Sales` with a compound index `(shopId, localSaleDate)`. Refactor analytics queries to group by `localSaleDate`.
* **Estimated Complexity:** Medium (1 day + migration testing)
* **Expected Benefit:** Eliminates on-disk temporary tables; speeds up sales aggregations by 5x-10x on 500,000+ row datasets.
* **Dependencies / Risks:** Requires running database migration during scheduled maintenance.

### Item D2: Pre-Aggregated Daily Summary Rollups
* **Finding ID:** `FND-DB-02`
* **Severity:** **MEDIUM (at scale)**
* **Affected Component:** `backend/src/models/DailySalesSummary.js` & Billing Scheduler
* **Issue:** Calculating historical monthly and yearly revenue requires scanning months of raw transactional sale items.
* **Proposed Action:** Implement an automated end-of-day rollup worker that writes closed day totals (Gross, Net, Tax, Orders, Payment Breakdown) to `DailySalesSummaries`.
* **Estimated Complexity:** High (3 days)
* **Expected Benefit:** Historical 12-month and 5-year report queries execute in < 5 ms regardless of total historical sales count.
* **Dependencies / Risks:** Needs reconciliation logic for historical backdated refunds or voids.

