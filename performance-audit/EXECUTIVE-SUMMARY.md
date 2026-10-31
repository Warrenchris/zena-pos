# ZANA POS — EXECUTIVE PERFORMANCE AUDIT SUMMARY

**Audit Date:** October 31, 2026  
**Auditor:** Senior Performance & Full-Stack Systems Architect  
**Platform Version:** Zana POS v1.0.0 (Multi-Tenant African SME Retail Cloud)  
**Evaluation Mode:** Browser-Based Real-Time Testing & Empirical Diagnostics (Zero Code Modifications)  

---

## 1. Overall Performance Assessment

| Overall Score | Performance Classification | Audit Status |
|:---:|:---:|:---:|
| **75.5 / 100** | **Acceptable, Improvements Needed** | Complete & Verified |

> *Note: This classification is an objective engineering audit assessment based on actual browser runtime measurements, Chrome DevTools network captures, production build bundle analysis, and backend query execution traces.*

---

## 2. Executive Scorecard

```
┌──────────────────────────────────────────────┬────────┬────────┬───────────────┐
│ Evaluation Category                          │ Weight │ Score  │ Weighted Pts  │
├──────────────────────────────────────────────┼────────┼────────┼───────────────┤
│ 1. Initial Page Loading                      │  15%   │ 68/100 │  10.20 / 15.0 │
│ 2. Frontend Rendering                        │  15%   │ 76/100 │  11.40 / 15.0 │
│ 3. Navigation & Interaction Responsiveness   │  15%   │ 88/100 │  13.20 / 15.0 │
│ 4. API & Network Performance                 │  15%   │ 71/100 │  10.65 / 15.0 │
│ 5. Database Performance                      │  10%   │ 82/100 │   8.20 / 10.0 │
│ 6. Backend Performance                       │  10%   │ 84/100 │   8.40 / 10.0 │
│ 7. Asset & Bundle Optimization               │  10%   │ 58/100 │   5.80 / 10.0 │
│ 8. Mobile & Responsive Performance           │   5%   │ 65/100 │   3.25 /  5.0 │
│ 9. Stability & Memory Management             │   5%   │ 89/100 │   4.45 /  5.0 │
├──────────────────────────────────────────────┼────────┼────────┼───────────────┤
│ TOTAL WEIGHTED PERFORMANCE SCORE             │  100%  │        │  75.50 / 100  │
└──────────────────────────────────────────────┴────────┴────────┴───────────────┘
```

---

## 3. Core POS Performance Assessment

The core **Point of Sale (POS) Terminal** (`/pos`) is the mission-critical heart of Zana POS. In real-world browser testing with live shop inventory (Shop 4 — SokoSafi), the POS interface demonstrated **strong operational responsiveness**:

* **Terminal Initialization:** Mounts and becomes interactive within **180 ms** on client-side route transition.
* **Product Catalog Search & Filter:** Instant fuzzy search (<15 ms) and instant category filtering (<5 ms) with zero UI stutter.
* **Cart Operations:** Adding items, updating quantities, recalculating gross/net subtotal, taxes, and item-level discounts execute in **under 10 ms**.
* **Cart Hold & Release:** Holding orders (`Hold Cart`) communicates cleanly with backend API (`/api/held-carts`) in **34 ms** without locking the terminal.
* **Zero Transaction Leakage:** Diagnostic checkout workflow completed up to the payment options modal without executing destructive commits or creating phantom database records.

---

## 4. The Biggest Performance Bottlenecks

### 1. Connection Congestion & Stalled Dashboard API Calls (High Severity)
On mounting `/dashboard`, the frontend fires **16 API requests simultaneously** to `http://localhost:3000`. Because the frontend is hosted on port 5173 and backend on port 3000, each request requires an HTTP `OPTIONS` CORS preflight request, producing **32 consecutive HTTP requests**. Chrome limits concurrent HTTP/1.1 connections to 6 per origin; as a result, 26 requests sit stalled in browser socket queues for **2,400 ms to 4,050 ms**, even though the backend executes individual queries in **25 ms to 60 ms**.

### 2. Broken POS Code-Splitting in Production Bundle (High Severity)
While `router.config.jsx` attempts to code-split `CashierDashboard` using `safeLazy()`, both `DashboardRouter.jsx` and `Dashboard.jsx` import `CashierDashboard` via **static ES module imports** (`import CashierDashboard from '../pages/CashierDashboard'`). Rollup/Vite detects this static reference and cancels chunk splitting, forcing the entire 2,320-line POS codebase, barcode scanning logic, printing subsystem, and Fuse.js bundle directly into the main entry bundle.

### 3. Oversized Entry Bundle & Heavy Third-Party Libraries (High Severity)
The production build produces a main entry bundle of **1,170.77 kB (1.17 MB uncompressed / 349.82 kB gzip)**. Heavy export libraries are bundled eagerly: `xlsx` (**429.67 kB**), `jspdf` (**416.02 kB**), `chart-vendor` (**435.59 kB**), and `LocationAudience` SVG map (**233.25 kB**). In addition, the Workbox service worker precaches **4.51 MB** across 104 files on initial launch.

### 4. Group By Date/Hour Table Scans via `Using temporary` (Medium Severity)
Analytical aggregation queries in `analyticsController.js` and `reportsController.js` rely on MySQL expressions like `GROUP BY DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00'))`. `EXPLAIN` analysis reveals MySQL cannot utilize composite B-tree indexes for function-based grouping, forcing an in-memory/on-disk temporary table (`Using where; Using temporary`). While sub-50ms with 88 demo sales, this pattern will incur CPU and disk I/O bottlenecks when transaction volumes reach 100,000+ rows.

### 5. AI Service Key Path Resolution & Forwarding 500 Failure (High Severity)
The Python FastAPI AI service fails authenticated requests forwarding through `/api/ai/forward/*` with **HTTP 500** because `JWT_PUBLIC_KEY_PATH` in `ai_service/.env` is set to `./jwt_public_key.pem`, which fails to resolve when the service is launched outside a container root.

### 6. Mobile Viewport Horizontal Layout Overflow (Medium Severity)
At mobile viewport width (390 × 844 px), the top navigation bar actions container (`TopNavBar.jsx`) causes a horizontal page overflow of **90 pixels** (`document.scrollWidth = 591px` vs `window.innerWidth = 501px`), forcing horizontal scrolling and breaking layout stability on handheld devices.

---

## 5. Top 5 Prioritized Recommendations

1. **Implement Backend Dashboard Aggregation Endpoint (BFF Pattern):** Replace the 16 separate frontend API calls on `/dashboard` with a single unified `/api/dashboard/overview` endpoint. This reduces HTTP request count by 93% and eliminates browser socket queue stalls.
2. **Fix Code-Splitting Leakage in `DashboardRouter.jsx`:** Replace static `import CashierDashboard` with lazy imports to allow Vite to isolate the 201 kB POS module into an on-demand chunk.
3. **Lazy-Load Export & Heavy Charting Libraries:** Convert `xlsx`, `jspdf`, and `LocationAudience` map to dynamic `await import()` statements loaded only when users click "Export Excel", "Export PDF", or open geographic reports.
4. **Proxy API via Vite / Production Reverse Proxy:** Route `/api` through the same origin (e.g., `/api` via Vite proxy or Nginx) to eliminate 16 redundant `OPTIONS` CORS preflight roundtrips.
5. **Add Pre-Calculated Daily/Hourly Summary Tables:** Materialize sales aggregates into a lightweight `DailySalesSummaries` roll-up table or generated stored column to eliminate `Using temporary` on large historical date ranges.

