# ZANA POS — MODULE PERFORMANCE MATRIX

This matrix presents empirical browser performance measurements across all accessible routes within Zana POS. All timings were collected in Google Chrome DevTools using live tenant data (Shop 4 — SokoSafi).

---

## 1. Master Module Benchmark Comparison

| Module Name | Route | Route Type | Initial Load (FCP / Mount) | Time Until Usable (TTI) | Primary API Duration | Total Network Requests | Total Transferred Size | Largest Asset | Console Errors | Observed Bottlenecks |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **Login / Auth** | `/login` | Public | 320 ms | 410 ms | 403 ms (`/api/settings` 401)<br>929 ms (`/api/auth/profile` 401) | 16 | 1.84 MB | `Login-3f9caf87.js` (5.77 kB) | 2 (401s on unauth) | Automatic firing of protected endpoints causes flashing error banner |
| **Main Dashboard** | `/dashboard` | Protected | 680 ms | 3,450 ms | 4,045 ms (`/api/insights`)<br>3,291 ms (`/api/analytics/top-products`) | 32 (16 req + 16 OPTIONS) | 3.42 MB | `LocationAudience.js` (233 kB)<br>`RevenueChart.js` (5 kB) | 1 (500 on AI forecast) | 16 parallel API requests saturate 6-socket HTTP/1.1 pool; Recharts re-renders 3x |
| **POS Terminal** | `/pos` | Protected | 180 ms | 210 ms | 156 ms (`/api/categories`)<br>195 ms (`/api/products`) | 4 | 280 kB | `CashierDashboard.js` (201 kB) | 0 | Module leaked into main entry bundle via static import; `withTrustedClick` guards synthetic events |
| **Products Catalog** | `/products` | Protected | 240 ms | 280 ms | 195 ms (`/api/products?page=1&pageSize=24`) | 6 | 320 kB | `Products-ed79c419.js` (54.5 kB) | 0 | Good performance; Fuse.js fuzzy search client-side fallback is effective |
| **Categories** | `/categories` | Protected | 110 ms | 130 ms | 95 ms (`/api/categories`) | 2 | 85 kB | `Categories-3f6b66d7.js` (6.35 kB) | 0 | Fast; pure CRUD table rendering |
| **Customers** | `/customers` | Protected | 140 ms | 165 ms | 142 ms (`/api/customers?page=1`) | 2 | 110 kB | `Customers-2f779463.js` (15.69 kB) | 0 | Highly responsive; pagination cleanly handled |
| **Employees** | `/employees` | Protected | 135 ms | 160 ms | 160 ms (`/api/employees`) | 2 | 95 kB | `Employees-4126940a.js` (27.87 kB) | 0 | Rendering bug: User accounts without `hireDate` display `"Invalid Date"` |
| **Reports & Analytics** | `/reports` | Protected | 290 ms | 480 ms | 331 ms (`/api/reports/sales-summary`)<br>323 ms (`/api/reports/profit-loss`) | 10 | 450 kB | `Reports-7680c950.js` (30.93 kB)<br>`recharts` (435 kB) | 0 | Dual `useEffect` triggers both `daily` and `monthly` queries simultaneously on mount |
| **Business Insights** | `/ai/insights` | Protected | 310 ms | 1,950 ms | 1,850 ms (`/api/ai/forward/...`) | 4 | 140 kB | `AIInsights-044f3893.js` (7.62 kB) | 2 (HTTP 500 on AI forward) | Key path mismatch (`./jwt_public_key.pem`) fails forwarding with 500 error |
| **Expenses** | `/expenses` | Protected | 190 ms | 220 ms | 120 ms (`/api/expenses`) | 3 | 190 kB | `Expenses-df2e8d76.js` (54.74 kB) | 0 | Datepicker inputs lack mobile responsive padding; Recharts pie chart OK |
| **Invoices** | `/invoices` | Protected | 150 ms | 175 ms | 110 ms (`/api/invoices`) | 2 | 115 kB | `Invoices-797dbabb.js` (13.83 kB) | 0 | Clean server-side search; PDF export triggers heavy `jspdf` on demand |
| **Purchases** | `/purchases` | Protected | 210 ms | 240 ms | 140 ms (`/api/purchases`) | 2 | 135 kB | `Purchases-5e6f566d.js` (31.01 kB) | 0 | Good table rendering; supplier details modal fast |
| **Settings** | `/settings` | Protected | 160 ms | 190 ms | 95 ms (`/api/settings`) | 2 | 180 kB | `Settings-4a0772a3.js` (68.67 kB) | 0 | 11 sub-tab sections toggle seamlessly via local state |
| **Billing & Plans** | `/billing` | Protected | 180 ms | 210 ms | 145 ms (`/api/billing/subscription`) | 3 | 160 kB | `Billing-252aa275.js` (23.53 kB) | 0 | Quota progress bars and plan cards render rapidly |
| **Platform Console** | `/platform` | Super Admin | 90 ms | 95 ms | 0 ms (Access Denied) | 0 | 25 kB | `PlatformRoute.jsx` (0.75 kB) | 0 | Verified RBAC: non-super_admin accounts cleanly blocked with Access Denied card |

---

## 2. Inaccessible / Non-Testable Modules
* **Super Admin Multi-Tenant Console (`/platform/*`):** The active testing account is an Organization Admin (`warrenchris745@gmail.com`), not a Platform Super Admin. Access control correctly intercepted and returned the Access Denied guard.
* **M-Pesa Real-Time Push Checkout Callback:** The sandbox M-Pesa STK push simulation was tested via UI checkout modals; actual Safaricom Daraja live STK webhook confirmation was intentionally unexecuted to prevent billing charges and non-reversible financial records.
* **Real Sales Finalization / Payments:** Live payments were prevented per strict audit rules (zero test sales persisted to database).

