# ZANA POS — API & NETWORK PERFORMANCE REPORT

---

## 1. Network Architecture Overview

The Zana POS frontend communicates with the backend Express API over REST JSON endpoints at `http://localhost:3000/api/*`.
When running in standard local development:
* **Frontend Origin:** `http://localhost:5173`
* **Backend Origin:** `http://localhost:3000`
* **Network Boundary:** Cross-Origin Resource Sharing (CORS) applies to every non-simple request.

---

## 2. Comprehensive Endpoint Latency & Benchmark Table

The following benchmarks represent direct server-side measurements (eliminating browser queuing and rendering costs) using an authenticated administrative bearer token for Tenant Organization 1 (Shop 4 — SokoSafi):

```
┌────────────────────────────────────────────────────────┬────────┬─────────────┬──────────────┬──────────────────┐
│ API Endpoint                                           │ Status │ Direct (ms) │ Payload (B)  │ Database Source  │
├────────────────────────────────────────────────────────┼────────┼─────────────┼──────────────┼──────────────────┤
│ GET  /api/auth/profile                                 │ 200    │ 195.7 ms    │ 387 B        │ Users, Shops     │
│ GET  /api/settings                                     │ 200    │ 36.8 ms     │ 1,429 B      │ SystemSettings   │
│ GET  /api/billing/subscription                         │ 200    │ 52.6 ms     │ 705 B        │ Subscriptions    │
│ GET  /api/shop/accessible                              │ 200    │ 31.9 ms     │ 172 B        │ Shops, ShopAccess│
│ GET  /api/employees                                    │ 200    │ 35.0 ms     │ 779 B        │ Employees, Users │
│ GET  /api/insights                                     │ 200    │ 494.9 ms    │ 1,527 B      │ Sales aggregations
│ GET  /api/sales/statistics                             │ 200    │ 36.6 ms     │ 59 B         │ Sales (COUNT/SUM)│
│ GET  /api/sales?limit=5                                │ 200    │ 60.6 ms     │ 31,167 B     │ Sales + SaleItems│
│ GET  /api/customers?limit=5                            │ 200    │ 31.6 ms     │ 1,642 B      │ Customers        │
│ GET  /api/products?limit=5                             │ 200    │ 26.3 ms     │ 7,060 B      │ Products         │
│ GET  /api/products?page=1&pageSize=100                 │ 200    │ 25.2 ms     │ 32,244 B     │ Products         │
│ GET  /api/categories                                   │ 200    │ 33.5 ms     │ 1,168 B      │ Categories       │
│ GET  /api/analytics/orders?period=week                 │ 200    │ 30.6 ms     │ 423 B        │ Sales GROUP BY   │
│ GET  /api/analytics/visitors?period=week               │ 200    │ 27.1 ms     │ 283 B        │ Sales GROUP BY   │
│ GET  /api/analytics/sales-channels?period=week         │ 200    │ 30.5 ms     │ 154 B        │ Sales GROUP BY   │
│ GET  /api/analytics/top-products?limit=5&period=week   │ 200    │ 36.8 ms     │ 662 B        │ SaleItems JOIN   │
│ GET  /api/analytics/customer-locations?period=week     │ 200    │ 27.5 ms     │ 56 B         │ Customers JOIN   │
│ GET  /api/reports/profit-loss                          │ 200    │ 152.0 ms    │ 299 B        │ Sales, Expenses  │
│ GET  /api/expenses                                     │ 200    │ 32.3 ms     │ 450 B        │ Expenses         │
│ GET  /api/invoices                                     │ 200    │ 36.4 ms     │ 686 B        │ Invoices         │
│ GET  /api/purchases                                    │ 200    │ 47.0 ms     │ 1,980 B      │ Purchases        │
│ POST /api/ai/forward/api/forecasting/forecast          │ 500    │ 572.0 ms    │ 185 B        │ AI Microservice  │
└────────────────────────────────────────────────────────┴────────┴─────────────┴──────────────┴──────────────────┘
```

---

## 3. Discovered Network Patterns & Critical Bottlenecks

### 3.1 The Dashboard "Thunder Herd" & Socket Stalling Bottleneck
* **Phenomenon:** When a user lands on `/dashboard`, the page fires **16 API calls** simultaneously:
  1. `/api/auth/profile`
  2. `/api/settings`
  3. `/api/billing/subscription`
  4. `/api/shop/accessible`
  5. `/api/employees`
  6. `/api/insights`
  7. `/api/sales/statistics`
  8. `/api/sales?limit=5`
  9. `/api/customers?limit=5`
  10. `/api/products?limit=5`
  11. `/api/analytics/orders`
  12. `/api/analytics/visitors`
  13. `/api/analytics/sales-channels`
  14. `/api/analytics/top-products`
  15. `/api/products?page=1&pageSize=100`
  16. `/api/analytics/customer-locations`
* **Underlying Mechanism:** Because the requests go cross-origin (port 5173 to port 3000 with custom Authorization headers), every single call triggers an HTTP `OPTIONS` preflight request. This results in **32 total HTTP round trips**.
* **Browser Constraint:** In HTTP/1.1, Chromium restricts concurrent connections to **6 sockets per origin**.
* **Impact:** 26 requests are queued in the browser's internal network stack. Even though the Express backend responds in 25–40 ms, requests at the tail of the queue wait **2,500 ms to 4,050 ms** before acquiring an open TCP connection.

### 3.2 Dual Duplicate Initial Requests on `/reports`
* **Phenomenon:** Loading `/reports` triggers duplicate queries for both `range=monthly` and `range=daily`:
  - `/api/reports/employee-sales?range=monthly` & `/api/reports/employee-sales?range=daily`
  - `/api/reports/profit-loss?range=monthly` & `/api/reports/profit-loss?range=daily`
  - `/api/analytics/sales-channels?period=month` & `/api/analytics/sales-channels?period=week`
* **Root Cause:** Two independent `useEffect` hooks in `frontend/src/pages/Reports.jsx` run concurrently on component mount before default state synchronizes, causing redundant database queries and double data fetching.

### 3.3 Unauthenticated Requests on Login Page
* **Phenomenon:** Visiting `/login` immediately generates:
  - `GET http://localhost:3000/api/settings` -> HTTP 401 Unauthorized (403 ms)
  - `GET http://localhost:3000/api/auth/profile` -> HTTP 401 Unauthorized (929 ms)
* **Root Cause:** Global layout providers (`TopNavBar.jsx` and `authSlice.js`) fire session profile verification regardless of whether the current route is public (`/login`, `/signup`). This causes the login page to flash an "Invalid or expired token" error before the user enters credentials.

### 3.4 AI Microservice Forwarding HTTP 500 Failure
* **Endpoint:** `POST /api/ai/forward/api/forecasting/forecast`
* **Observed Error:** HTTP 500 Internal Server Error (572 ms).
* **Console Trace:** `Error fetching forecast: [AxiosError: Request failed with status code 500]`
* **Root Cause:** In `ai_service/src/core/auth.py`, the AI service verifies the incoming bearer JWT using `JWT_PUBLIC_KEY_PATH`. In `ai_service/.env`, this is defined as:
  `JWT_PUBLIC_KEY_PATH=./jwt_public_key.pem`
  When started outside a container, Python evaluates `./` against the root directory `Desktop/empty/`, where no public key file exists (the keys reside in `backend/` and `ai_service/`). The AI service aborts token verification with an unhandled exception, causing the proxy to return 500.

---

## 4. API Optimization Recommendations

1. **Dashboard Backend-For-Frontend (BFF) Aggregation:** Consolidate the 16 dashboard calls into a single endpoint: `GET /api/dashboard/summary`. This single request fetches the stats grid, order tracking, visitor graph, and top products in **1 SQL transaction / 1 HTTP round-trip**, dropping dashboard load time from 3.5s to < 200 ms.
2. **Reverse Proxy / Same-Origin Routing:** Configure Vite's dev server proxy (`server.proxy` in `vite.config.js`) or Nginx in production so requests go to `/api/*` on the same origin. This completely eliminates 16 `OPTIONS` CORS preflight roundtrips.
3. **Memoize and Guard Public Routes:** Wrap `getProfile` and `getSettings` dispatches in `App.jsx` with route checks (`if (['/login', '/signup'].includes(window.location.pathname)) return;`) to stop 401 request spam on public pages.
4. **Consolidate `Reports.jsx` Date Hooks:** Unify report range state so that switching tabs or mounting the page dispatches exactly one scoped query.

