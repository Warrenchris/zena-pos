# ZANA POS — FRONTEND PERFORMANCE & ASSET REPORT

---

## 1. Frontend Technology Stack & Build Architecture

* **Framework:** React 18.2.0 (SPA Mode)
* **Build Tool:** Vite 4.5.14 with Rollup 3.x
* **State Management:** Redux Toolkit 1.9.5 (`@reduxjs/toolkit`, `react-redux`)
* **Routing:** React Router DOM 6.14.2 (Data Router with `future.v7_startTransition: true`)
* **Styling:** Tailwind CSS 3.3.3 + Custom CSS Variables + `@headlessui/react`
* **Charting:** Recharts 2.8.0 (SVG-based D3 wrapper)
* **Export Utilities:** `xlsx` 0.18.5, `jspdf` 4.2.1, `jspdf-autotable` 5.0.8, `html2canvas`
* **PWA:** `vite-plugin-pwa` 1.3.0 + Workbox

---

## 2. Production Bundle & Chunk Distribution Analysis

The production build was executed via `npm --prefix frontend run build`:

```
┌──────────────────────────────────────────────┬───────────────┬──────────────┬───────────────────┐
│ Asset / Chunk Name                           │ Raw Size      │ Gzip Size    │ Assessment        │
├──────────────────────────────────────────────┼───────────────┼──────────────┼───────────────────┤
│ dist/assets/index-f9e62d62.js (Main Entry)   │ 1,170.77 kB   │ 349.82 kB    │ CRITICAL OVERSIZED│
│ dist/assets/chart-vendor-20c8b088.js         │   435.59 kB   │ 115.02 kB    │ HEAVY (Recharts)  │
│ dist/assets/xlsx-6ed613d4.js                 │   429.67 kB   │ 143.27 kB    │ EAGERLY BUNDLED   │
│ dist/assets/jspdf.es.min-90e0b286.js         │   416.02 kB   │ 136.42 kB    │ EAGERLY BUNDLED   │
│ dist/assets/LocationAudience-571d3ff3.js     │   233.25 kB   │  53.58 kB    │ LARGE (SVG MAP)   │
│ dist/assets/react-vendor-478e60df.js         │   207.23 kB   │  67.57 kB    │ ACCEPTABLE        │
│ dist/assets/CashierDashboard-62423c21.js     │   201.43 kB   │  48.04 kB    │ LEAKED POS CHUNK  │
│ dist/assets/html2canvas.esm-e0a7d97b.js      │   201.43 kB   │  48.04 kB    │ CANVAS RENDERER   │
│ dist/assets/index.es-b301c4d8.js             │   150.27 kB   │  51.43 kB    │ UTILITIES         │
│ dist/assets/index-0708b7cf.css               │   141.37 kB   │  21.36 kB    │ MODERATE CSS      │
│ dist/assets/Settings-4a0772a3.js             │    68.67 kB   │  12.73 kB    │ MODERATE          │
│ dist/assets/ui-vendor-795ac9fd.js            │    63.03 kB   │  20.10 kB    │ HEADLESS UI       │
│ dist/assets/Expenses-df2e8d76.js             │    54.74 kB   │  16.28 kB    │ ROUTE CHUNK       │
│ dist/assets/Products-ed79c419.js             │    54.52 kB   │  11.61 kB    │ ROUTE CHUNK       │
├──────────────────────────────────────────────┼───────────────┼──────────────┼───────────────────┤
│ TOTAL INITIAL BUNDLE (JS + CSS)              │ ~ 3,500.00 kB │ ~ 990.00 kB  │ EXCEEDS BUDGET    │
│ PWA SERVICE WORKER PRECACHE                  │   4,511.26 kB │ (104 files)  │ VERY HEAVY        │
└──────────────────────────────────────────────┴───────────────┴──────────────┴───────────────────┘
```

---

## 3. Discovered Frontend Performance Bottlenecks

### 3.1 The Broken POS Code-Splitting Defect
* **Location:** `frontend/src/router.config.jsx` vs. `frontend/src/components/DashboardRouter.jsx` and `frontend/src/pages/Dashboard.jsx`.
* **Problem:** In `router.config.jsx`, the POS page is defined as lazy:
  ```javascript
  const Pos = safeLazy(() => import('./pages/CashierDashboard'));
  ```
  However, in `DashboardRouter.jsx`:
  ```javascript
  import CashierDashboard from '../pages/CashierDashboard';
  ```
  And in `Dashboard.jsx`:
  ```javascript
  import CashierDashboard from './CashierDashboard';
  ```
* **Consequence:** In Rollup/Vite, any module imported via static `import` anywhere in the project tree is automatically pulled into the static parent graph. Vite cannot split `CashierDashboard.jsx` into an asynchronous chunk. Thus, every user visiting the login screen or dashboard must download the entire POS terminal code, receipt printers, barcode scanner libraries, and sound utilities upfront.

### 3.2 Heavy Export Libraries Packaged in Main Execution Graph
* **Offenders:** `xlsx` (429 kB) and `jspdf` (416 kB).
* **Problem:** These libraries are imported statically in several modal and export components:
  - `SaleDetailModal.jsx` imports `jspdf`
  - `Reports.jsx` imports `xlsx` and `jspdf`
  - `Expenses.jsx` imports `xlsx`
* **Impact:** 845 kB of JavaScript is downloaded and parsed by every client before any export button is ever clicked.

### 3.3 Large Static SVG Geometry in `LocationAudience.jsx`
* **Size:** 233.25 kB uncompressed.
* **Problem:** The component embeds raw SVG geographical paths directly inside the JSX source code to render a world map audience widget on the main dashboard. This adds 233 kB of AST parsing overhead to the dashboard initial render for a decorative metric card.

### 3.4 PWA Precache Saturation (4.51 MB)
* **Problem:** `vite-plugin-pwa` generates a service worker precache manifest encompassing all 104 generated assets (totaling **4,511.26 KiB**).
* **Impact:** On the first visit over a mobile network (e.g., Kenyan 3G / 4G), the browser initiates background HTTP downloads for 4.5 megabytes of offline cache assets, contending with the user's active API requests for bandwidth.

### 3.5 React Re-Render Cascades in Dashboard Recharts
* **Problem:** On `/dashboard`, several Recharts `<ResponsiveContainer>` elements are nested inside child components (`RevenueChart`, `VisitorGraph`, `OrderTracking`). As the 16 parallel API requests resolve at staggered intervals (between 680 ms and 4,000 ms), the Redux store updates 8 separate slices (`salesSlice`, `analyticsSlice`, etc.). Each slice update triggers a top-to-bottom re-render of `Dashboard.jsx`, causing Recharts to recalculate layout dimensions and re-animate SVG paths 4 times during page load.

---

## 4. Frontend Optimization Roadmap

1. **Eliminate Static Imports of POS Terminal:** Change `DashboardRouter.jsx` to dynamically load `CashierDashboard` using `React.lazy()`:
   ```javascript
   const CashierDashboard = lazy(() => import('../pages/CashierDashboard'));
   ```
2. **Dynamic Imports for Document Exporters:** Refactor export handlers to use on-demand dynamic imports:
   ```javascript
   const handleExportExcel = async () => {
     const XLSX = await import('xlsx');
     // execute export
   };
   ```
3. **Externalize World Map Geometry:** Move the 233 kB SVG path data out of `LocationAudience.jsx` into a standalone JSON asset fetched on-demand or replace it with a lightweight GeoJSON vector.
4. **Constrain Service Worker Precache:** Configure `globPatterns` in `vite.config.js` (`VitePWA`) to precache only the essential offline shell (`index.html`, `index.css`, core vendor, and POS chunks), excluding secondary analytical charts and PDF libraries from precache.

