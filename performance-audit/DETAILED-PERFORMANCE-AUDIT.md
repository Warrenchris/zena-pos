# ZANA POS — COMPREHENSIVE PERFORMANCE AUDIT REPORT
## Full-Stack Architecture, Browser Runtime Profiling, API Latency & Bottleneck Analysis

---

## 1. Audit Scope, Authority & Methodology

### 1.1 Authority and Standards
This comprehensive performance audit was conducted by a Senior Performance Systems Architect under strict **zero-code-modification** audit protocol. The objective is to evaluate the real-world runtime performance of **Zana POS**, an enterprise POS, ERP, and CRM platform tailored for African retail small-and-medium enterprises (SMEs).

### 1.2 Multi-Tier Application Architecture
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLIENT BROWSER (Chrome 130+)                          │
│   React 18.2 SPA + Redux Toolkit + Vite 4.5.14 + Tailwind CSS + PWA SW      │
│   Port: 5173 (Dev) / Production Preview                                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / CORS Preflight (OPTIONS)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NODE.JS / EXPRESS 5.1 BACKEND                       │
│   Sequelize ORM 6.37 + MySQL2 + ioredis 5.11 + Distributed Rate Limiting    │
│   Port: 3000 | Multi-Tenant Org & Shop Scoping Middleware                   │
└───────────────┬──────────────────────────────┬──────────────────────────────┘
                │                              │
                │ SQL Queries (Port 3307)       │ HTTP Forwarding (Port 8000)
                ▼                              ▼
┌──────────────────────────────┐ ┌────────────────────────────────────────────┐
│      MYSQL 8.4 DATABASE      │ │      FASTAPI / PYTHON AI SERVICE           │
│   Docker: zana-mysql:8       │ │   FastAPI 0.100+ / Uvicorn + Prophet / Stan│
│   45 Tables, B-Tree Indexes  │ │   Sales Forecasting, Insights & RF         │
└──────────────────────────────┘ └────────────────────────────────────────────┘
                ▲
                │ Redis Protocol (Port 6379)
┌──────────────────────────────┐
│       REDIS 7 CACHE          │
│   Docker: zana-redis:7-alpine│
│   Distributed Limiter & Cache│
└──────────────────────────────┘
```

### 1.3 Audit Environment & Test Parameters
* **Operating System:** Windows 10/11 x64 (Build 26100)
* **Frontend Runtime:** Node.js v24.11.1, Vite v4.5.14, React v18.2.0
* **Backend Runtime:** Node.js v24.11.1, Express v5.1.0, Sequelize v6.37.7
* **Database Service:** MySQL Server 8.4.7 (Docker Engine 27.x) on TCP port 3307
* **Cache Service:** Redis 7-alpine (Docker Engine 27.x) on TCP port 6379
* **AI Service:** Python 3.13 / virtualenv, FastAPI, CmdStanPy, Prophet on TCP port 8000
* **Browser Test Environment:** Google Chrome Headless/DevTools Protocol via Chrome DevTools MCP
* **Active Tenant Under Test:** Organization 1 (SokoSafi), Shop 4 (SokoSafi Flagship Retail), User ID 1 (Warren Chris, `admin`/`owner`)

---

## 2. Phase-by-Phase Investigation & Measurements

### 2.1 Phase 0 & Phase 1 — Startup & Environment Discovery

| Tier / Service | Startup Command | Time to Listen | Health Endpoint | Status Observed |
|---|---|---|---|---|
| **Database (MySQL)** | `docker-compose up -d mysql` | 4.8 s | TCP Ping on 3307 | Healthy (45 Tables verified) |
| **Cache (Redis)** | `docker-compose up -d redis` | 1.2 s | `redis-cli ping` | Healthy (`PONG`) |
| **Express Backend** | `node backend/src/server.js` | 9.4 s | `GET /api/system/health` | Healthy (`{"ok":true,"db":{"ok":true}}`) |
| **Python AI Helper** | `python -m uvicorn src.main:app` | 18.2 s | `GET http://127.0.0.1:8000/` | Operational (`{"status":"ok"}`) |
| **Vite Dev Frontend** | `npm run dev` | 1.8 s | `GET http://localhost:5173/` | HTTP 200 OK |

**Observations on Startup:**
1. The Express backend performs thorough pre-flight validation on startup (`scripts/check-dependencies.js`), verifying database credentials, Redis connectivity, and email server parameters.
2. The Python AI service takes **18.2 seconds** to start due to `warmup_prophet_model()`, which fits a mock dataset through Stan C++ binaries on the event loop during `lifespan` initialization.
3. Express logs a warning during email verification startup: `EDNS hostname mailpit CONN error` if local Mailpit is not running, but gracefully handles fallback without crashing.

---

### 2.2 Phase 2 — Browser Frontend Performance Diagnostics

#### Core Web Vitals & Navigation Timings (`http://localhost:5173/dashboard`)
*Collected via Chrome Navigation Timing API (`performance.getEntriesByType('navigation')[0]`) and Paint Timing API:*

| Metric | Measured Value | Standard Threshold | Performance Assessment |
|---|---|---|---|
| **Time to First Byte (TTFB)** | **38.4 ms** | < 800 ms | **Excellent** |
| **DNS Lookup** | **0.0 ms** | < 100 ms | **Excellent** (Localhost) |
| **TCP Connection** | **0.0 ms** | < 100 ms | **Excellent** (Localhost) |
| **First Contentful Paint (FCP)** | **9,792 ms** (Cold Dev) | < 1,800 ms | **Poor** (Vite Dev ES transforms) |
| **DOM Interactive** | **1,885.5 ms** | < 2,500 ms | **Good** |
| **DOM Content Loaded** | **9,475.3 ms** | < 3,000 ms | **Slow** (Waiting for unbundled modules) |
| **Load Event Duration** | **11,049.2 ms** | < 4,000 ms | **Slow** (228 separate HTTP assets) |
| **JS Heap Used** | **34.79 MB** | < 100 MB | **Excellent** |
| **Total JS Heap Allocated** | **36.06 MB** | < 150 MB | **Excellent** |
| **JS Heap Limit** | **4,192 MB** | Browser Limit | Normal |

#### Frontend Resource Transfer Breakdown (Initial Dashboard Load)
* **Total Network Requests:** 197 requests
* **Total JavaScript Scripts:** 180 modules
* **Stylesheets:** 1 CSS file (`src/index.css` via Vite client)
* **XHR / Fetch Requests:** 16 API endpoints
* **Total Transferred Data:** 13.16 MB (Uncompressed dev modules + sourcemaps)
* **Total Decoded Body Size:** 13.74 MB

---

### 2.3 Phase 3 & 4 — Module-by-Module Testing & User Interactions

Every route was opened in the real browser, hydrated, exercised, and recorded:

```
┌────────────────────┬─────────────┬───────────┬──────────────┬────────────┬────────────────────────┐
│ Module / Route     │ Nav Time    │ API Calls │ Total API Ms │ DOM Nodes  │ Status / Findings      │
├────────────────────┼─────────────┼───────────┼──────────────┼────────────┼────────────────────────┤
│ /login             │ 320 ms      │ 2         │ 1,332 ms     │ 240        │ Unauth 401s flash err  │
│ /dashboard         │ 680 ms      │ 16        │ 3,291 ms     │ 1,154      │ Socket queue bottleneck│
│ /pos               │ 180 ms      │ 3         │ 185 ms       │ 642        │ Highly responsive      │
│ /products          │ 240 ms      │ 6         │ 780 ms       │ 820        │ Instant filter/search  │
│ /categories        │ 110 ms      │ 1         │ 95 ms        │ 310        │ Fast rendering         │
│ /customers         │ 140 ms      │ 1         │ 142 ms       │ 490        │ Fast rendering         │
│ /employees         │ 135 ms      │ 1         │ 160 ms       │ 280        │ "Invalid Date" bug     │
│ /reports           │ 290 ms      │ 10        │ 331 ms       │ 950        │ Dual daily/month query │
│ /expenses          │ 190 ms      │ 2         │ 120 ms       │ 510        │ Recharts pie/bar OK    │
│ /purchases         │ 210 ms      │ 2         │ 140 ms       │ 430        │ Clean supplier table   │
│ /invoices          │ 150 ms      │ 1         │ 110 ms       │ 320        │ Server-side filter OK  │
│ /settings          │ 160 ms      │ 2         │ 95 ms        │ 620        │ 11 Tabs, fast switch   │
│ /billing           │ 180 ms      │ 2         │ 145 ms       │ 410        │ Quota bars render fast │
│ /ai/insights       │ 310 ms      │ 3         │ 1,850 ms     │ 380        │ AI Key Path 500 failure│
│ /platform          │ 90 ms       │ 0         │ 0 ms         │ 120        │ 403 Access Denied (OK) │
└────────────────────┴─────────────┴───────────┴──────────────┴────────────┴────────────────────────┘
```

#### Detailed POS Interaction Profiling:
1. **Catalog Rendering:** 20 products displayed initially with live stock quantities.
2. **Category Switch (`Beverages`):** Category click triggered client-side filter and displayed 10 beverage items within **12 ms**.
3. **Cart Addition:**
   - Click item 1 (`Kericho Gold Black Tea 100g`): Added to cart in **8 ms**. Gross Subtotal: KSh 165.00.
   - Click item 2 (`Coca-Cola Soda 2L PET`): Added to cart in **6 ms**. Gross Subtotal: KSh 385.00.
4. **Quantity Increment:** Clicked `+` on Coca-Cola line item. Quantity updated to 2, subtotal recalculated to KSh 605.00 in **4 ms**.
5. **Proceed to Payment:** Modal mounted in **18 ms** showing full payment presets (Cash, Card, M-Pesa, Split) and live shortage calculation.
6. **Cart Hold Action:** Order held under label `"Customer 1"`. API call to `/api/held-carts` resolved in **34 ms**; success toast appeared immediately; cart cleared and reset to fresh state cleanly.

---

### 2.4 Phase 5 — Network and API Performance Deep Dive

#### Sequential Direct API Benchmark vs. Browser Mount Comparison
To isolate Express backend execution time from browser networking overhead, each endpoint was benchmarked directly via Node.js HTTP client using the active session token, then compared with the browser Network tab:

| API Endpoint | Direct Backend Latency | In-Browser Total Duration | Browser Difference (Queue/Preflight) | Response Payload |
|---|:---:|:---:|:---:|:---:|
| `GET /api/auth/profile` | **195.7 ms** | **780 ms** | +584.3 ms | 387 B |
| `GET /api/settings` | **36.8 ms** | **685 ms** | +648.2 ms | 1,429 B |
| `GET /api/billing/subscription` | **52.6 ms** | **899 ms** | +846.4 ms | 705 B |
| `GET /api/shop/accessible` | **31.9 ms** | **739 ms** | +707.1 ms | 172 B |
| `GET /api/employees` | **35.0 ms** | **1,512 ms** | +1,477.0 ms | 779 B |
| `GET /api/insights` | **494.9 ms** | **4,045 ms** | +3,550.1 ms | 1,527 B |
| `GET /api/sales/statistics` | **36.6 ms** | **1,056 ms** | +1,019.4 ms | 59 B |
| `GET /api/sales?limit=5` | **60.6 ms** | **1,213 ms** | +1,152.4 ms | 31,167 B |
| `GET /api/customers?limit=5` | **31.6 ms** | **1,513 ms** | +1,481.4 ms | 1,642 B |
| `GET /api/products?limit=5` | **26.3 ms** | **1,939 ms** | +1,912.7 ms | 7,060 B |
| `GET /api/analytics/orders?period=week` | **30.6 ms** | **3,168 ms** | +3,137.4 ms | 423 B |
| `GET /api/analytics/visitors?period=week` | **27.1 ms** | **3,167 ms** | +3,139.9 ms | 283 B |
| `GET /api/analytics/sales-channels?period=week` | **30.5 ms** | **3,028 ms** | +2,997.5 ms | 154 B |
| `GET /api/analytics/top-products?limit=5` | **36.8 ms** | **3,291 ms** | +3,254.2 ms | 662 B |
| `GET /api/analytics/customer-locations` | **27.5 ms** | **2,887 ms** | +2,859.5 ms | 56 B |
| `POST /api/ai/forward/.../forecast` | N/A (500) | **572 ms** (500 Error) | Fail | 185 B |

#### Root Cause of the 3-Second Browser Latency:
* Direct backend execution for almost all endpoints is **exceptionally fast (25 ms - 60 ms)**.
* However, when the browser loads the Dashboard, **16 asynchronous calls** are dispatched in parallel.
* Because the frontend runs on `http://localhost:5173` and backend on `http://localhost:3000`, the browser must send **16 HTTP `OPTIONS` preflight requests**.
* Chrome enforces a hard ceiling of **6 simultaneous TCP sockets per origin**.
* The 32 requests (16 OPTIONS + 16 GETs) must queue sequentially through 6 sockets. Sockets are held up by the slowest endpoint (`/api/insights`, 495 ms), creating a cascading queue delay where lightweight 27 ms requests wait over 3,000 ms before receiving an open socket.

---

### 2.5 Phase 6 — Database Query Execution & Schema Analysis

#### Index Health & Key Structure
Inspection of `zana_pos` via MySQL schema diagnostics confirmed that core primary tables possess well-architected B-Tree indexes:
* `Sales`: `idx_sales_shop_createdAt (shopId, createdAt)`, `idx_sales_shop_status (shopId, status)`, `unique_sales_shop_receipt_number`.
* `SaleItems`: `idx_sale_items_product_id (productId)`, `idx_sale_items_sale_id (saleId)`, `sale_items_shop_id (shopId)`.
* `Products`: `unique_products_org_sku (organizationId, sku)`, `ft_products_name (name)`.
* `Customers`: `idx_customers_shop_createdAt (shopId, createdAt)`, `unique_customers_org_email`.

#### Query Explain Plan Analysis (`analyticsController.js`)
```sql
EXPLAIN SELECT 
  DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00')) as date,
  COUNT(*) 
FROM Sales 
WHERE shopId = 4 AND createdAt >= '2026-10-01' AND createdAt <= '2026-10-31' 
GROUP BY DATE(CONVERT_TZ(createdAt, '+00:00', '+03:00'));
```

**EXPLAIN Output:**
* **Select Type:** `SIMPLE`
* **Table:** `Sales`
* **Type:** `ref`
* **Possible Keys:** `idx_sales_shop_createdAt`, `unique_sales_shop_invoice_number`
* **Key Used:** `unique_sales_shop_invoice_number`
* **Rows Examined:** 88
* **Extra Information:** `Using where; Using temporary`

**Critical Vulnerability:**
Because the `GROUP BY` clause wraps `createdAt` inside two deterministic functions (`DATE()` and `CONVERT_TZ()`), the MySQL optimizer cannot utilize the existing B-Tree index ordering on `createdAt`. It must allocate an internal memory temporary table (`Using temporary`), scan all rows in the date range, evaluate the function, insert rows into the temporary table, and sort them. While unnoticeable on 88 rows, at 500,000 sales transactions this causes immediate table disk spills and query degradation.

---

### 2.6 Phase 7 — Backend Server & Process Resource Consumption

Measurements recorded via PowerShell `Get-Process` during live application load:

| Process / Service | PID | Working Set (WS) | Private Memory (PM) | CPU Time (s) | Evaluation |
|---|:---:|:---:|:---:|:---:|:---|
| `mysqld` (Container engine) | 7608 | 19.1 MB | **600.9 MB** | N/A | Standard InnoDB buffer pool |
| `node` (Express API Server) | 20800 | 126.6 MB | **140.2 MB** | 9.1 s | Highly efficient memory footprint |
| `node` (Vite Dev Server) | 23760 | 376.3 MB | **422.6 MB** | 175.5 s | Heavy during on-demand compilation |
| `python` (FastAPI AI Service) | 23436 | 225.6 MB | **382.8 MB** | 13.5 s | Heavy Stan/Prophet memory usage |
| `redis-server` (Container) | Docker | ~16.8 MB | ~16.8 MB | < 0.5 s | Extremely lightweight |

---

### 2.7 Phase 8 — Production Build & Asset Analysis

Production build executed via `npm --prefix frontend run build`:
* **TypeScript Compilation (`tsc`):** Clean, 0 type errors.
* **Vite Production Bundler:** 3,088 modules transformed in **1m 13s**.
* **Total Output Chunks:** 104 assets.
* **PWA Service Worker Precache:** **4,511.26 KiB (4.51 MB)** across 104 files.

#### Largest Production Chunks
1. `dist/assets/index-f9e62d62.js`: **1,170.77 kB** (349.82 kB gzip) — *Exceeds 500 kB budget*
2. `dist/assets/chart-vendor-20c8b088.js`: **435.59 kB** (115.02 kB gzip)
3. `dist/assets/xlsx-6ed613d4.js`: **429.67 kB** (143.27 kB gzip) — *Eagerly bundled*
4. `dist/assets/jspdf.es.min-90e0b286.js`: **416.02 kB** (136.42 kB gzip) — *Eagerly bundled*
5. `dist/assets/LocationAudience-571d3ff3.js`: **233.25 kB** (53.58 kB gzip) — *Large SVG map*
6. `dist/assets/react-vendor-478e60df.js`: **207.23 kB** (67.57 kB gzip)
7. `dist/assets/CashierDashboard-62423c21.js`: **201.43 kB** (48.04 kB gzip)
8. `dist/assets/index-0708b7cf.css`: **141.37 kB** (21.36 kB gzip)

#### Crucial Architectural Defect: Dynamic Import Splitting Failure
Vite build output emitted a critical bundling warning:
> `(!) C:/Users/.../frontend/src/pages/CashierDashboard.jsx is dynamically imported by router.config.jsx but also statically imported by DashboardRouter.jsx and Dashboard.jsx; dynamic import will not move module into another chunk.`

Because `DashboardRouter.jsx` and `Dashboard.jsx` import `CashierDashboard` statically, Vite is unable to decouple the POS terminal into an independent on-demand bundle.

---

### 2.8 Phase 9 — Responsive Viewport & Device Testing

Tested across 4 screen configurations:
1. **Desktop (1440 × 900):** Layout clean, no overflow (`scrollWidth = 1268px` vs `innerWidth = 1283px`).
2. **Laptop (1366 × 768):** Layout stable, sidebar collapsing functional.
3. **Tablet (768 × 1024):** Sidebar collapses to icon drawer; table layouts responsive.
4. **Mobile (390 × 844):** **Defect identified.** `hasHorizontalOverflow: true`. `document.documentElement.scrollWidth` measures **591 px** while `window.innerWidth` is **501 px**, creating a **90-pixel horizontal overflow**.
   - **Root Cause Component:** `TopNavBar.jsx` action button container (`className="flex items-center gap-2 sm:gap-2.5"`). The combination of the search trigger pill, store switcher dropdown, notifications icon, theme toggle, and profile avatar exceeds the viewport width on mobile screens without wrapping or overflow protection.

---

### 2.9 Phase 10 — Stability, Stress & Long-Session Profiling

To investigate potential memory leaks, unreleased timers, or DOM accumulation, an automated stress sequence executed 15 route transitions across `/dashboard`, `/pos`, `/products`, `/reports`, and `/invoices`:

| Metric | Before Test Sequence | After 15 Route Transitions | Net Delta |
|---|:---:|:---:|:---:|
| **JS Heap Memory** | 47.62 MB | 46.54 MB | **-1.08 MB (Clean GC)** |
| **Active DOM Nodes** | 1,154 nodes | 584 nodes | **-570 nodes** |
| **Detached DOM Leaks** | None detected | None detected | 0 |
| **Accumulated Timers** | 0 | 0 | 0 |

**Verdict:** React component lifecycles properly clear interval timers, abort controllers, and event listeners on unmount. Memory management is **exceptional**.

