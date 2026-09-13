# FINDING-12 Phase 4: Organization-Wide AI Roll-Up Analytics Design

**Status:** Proposed Architecture Design  
**Author:** Principal Architect  
**Date:** September 13, 2026  
**Target Milestone:** FINDING-12 Phase 4 (Multi-Branch & Organization Architecture)  
**Dependencies:** Phase 1 (Organizations & Memberships), Phase 2 (Customer/Supplier Org Scoping), Phase 3 (Product Catalog & Inventory Split)

---

## Executive Summary

Phase 3 successfully completed the decoupling of product definitions into an organization-scoped master catalog (`Products`) and branch-specific stock ledgers (`Inventory`). Prior to Phase 4, all business intelligence, sales reporting, and AI forecasting operate strictly at the single-shop level (`req.shopId` scoping across `insightsController.js`, `dashboardController.js`, and `reportsController.js`).

Phase 4 introduces an **additive, non-breaking organization-level analytics layer**. This allows multi-branch merchants and enterprise owners to obtain consolidated roll-up visibility across all their physical locations—such as total company revenue, comparative branch performance rankings, organization-wide inventory health, and aggregated demand forecasting—without impacting or altering the behavior of single-shop merchants or existing per-shop endpoints.

A comprehensive audit of the Python AI microservice confirms that it is **100% stateless and decoupled from the database**. All ML algorithms (Prophet time series, Random Forest regression, Isolation Forest anomaly detection, and KMeans customer segmentation) compute purely on in-memory arrays supplied in request payloads. Consequently, **Phase 4 requires ZERO Python-side code changes**. All aggregation, data shaping, and security enforcement are handled entirely on the Node.js backend.

---

## Part 1 — Current State Re-Verification

### 1.1 Exhaustive Audit of `insightsController.js`

`insightsController.js` comprises 11 distinct helper functions and controller handlers. Every call is strictly scoped to `req.shopId`.

| Function / Endpoint | Route & Method | Database Queries & Scoping | Upstream AI Service Call | Payload Data Shape Sent |
| :--- | :--- | :--- | :--- | :--- |
| `calculateTrends(shopId)` | Helper (called in `getInsights`) | `Sale.findAll` scoped to `{ shopId, ...NON_CANCELLED_SALE_FILTER, createdAt >= lastMonth }`. Groups by `DATE(createdAt)`. | None (pure SQL aggregation). | N/A |
| `generateRecommendations(shopId)` | Helper (called in `getInsights`) | 1. `SystemSettings.findOne({ where: { shopId } })`<br>2. `Inventory.findAll({ where: { shopId }, include: [Product] })` filtered by `stockQuantity <= reorderPoint`<br>3. `Expense.findAll({ where: { shopId, createdAt >= lastMonth } })` grouped by category. | None (rule-based heuristic). | N/A |
| `generateRuleBasedAlerts(shopId)` | Helper (fallback) | `Sale.findAll({ where: { shopId, createdAt >= lastWeek } })` grouped by date. | None (rule-based heuristic). | N/A |
| `generateSmartAlerts(shopId, userId)` | Helper (called in `generateAlerts`) | `Sale.findAll({ where: { shopId, saleStatus: 'completed', createdAt >= 90 days } })` grouped by date. Returns daily revenue and transaction counts. | `POST /api/insights/anomalies` via `aiClient.post` (falls back to `generateRuleBasedAlerts` if `< 14` days or on network error). | `{ daily_data: [{ date, revenue, transaction_count, avg_transaction_value }], contamination: 0.05 }` |
| `getStockDepletionForecast(shopId, userId)` | Helper (called in `getInsights`) | 1. `Product.findAll` with required join on `Inventory` where `{ shopId }`.<br>2. `SaleItem.findAll({ where: { shopId, createdAt >= 90 days } })` grouped by `productId` and `DATE(createdAt)`. | `POST /api/forecasting/stock-depletion` via `aiClient.post` (falls back to 14-day linear run-rate velocity if error). | `{ products: [{ product_id, product_name, current_stock, daily_sales: [{ date, quantity }] }], alert_threshold_days: 7 }` |
| `generateAlerts(shopId, userId)` | Helper (called in `getInsights`) | 1. `Inventory.findAll({ where: { shopId, stockQuantity <= CRITICAL_STOCK_UNITS } })`<br>2. Calls `generateSmartAlerts(shopId, userId)`. | Inherits from `generateSmartAlerts`. | Inherits from `generateSmartAlerts`. |
| `getInsights(req, res)` | `GET /api/insights/` | Scoped strictly to `req.shopId`. Executes parallel promises: `calculateTrends`, `generateRecommendations`, `generateAlerts`, WoW revenue sum, top profit product, and 6-month monthly sales/expense/customer aggregates. | `POST /api/insights/analyze` via direct `fetch` to `AI_SERVICE_URL`. | `{ revenue: [float], costs: [float], customer_count: [int], transaction_count: [int], average_transaction_value: [float] }` (6 monthly buckets). |
| `getCustomerSegments(req, res)` | `GET /api/insights/customer-segments` | `Sale.findAll({ where: { shopId, saleStatus: 'completed' }, group: ['customerId'] })`. Computes total spend, frequency, avg transaction, and recency. | `POST /api/insights/customer-segments` via `aiClient.post` (requires >= 10 customers). | `{ customers: [{ customerId, total_spend, purchase_frequency, avg_transaction_value, days_since_last_purchase }] }` |
| `getMonthlyRevenue(req, res)` | `GET /api/insights/monthly-revenue` | `Sale.findAll({ where: { shopId, ...NON_CANCELLED_SALE_FILTER, createdAt >= 12 months } })` grouped by `DATE_FORMAT(createdAt, '%Y-%m-01')`. | None (pure SQL series). | N/A |
| `getDailySales(req, res)` | `GET /api/insights/daily-sales` | `Sale.findAll({ where: { shopId, saleStatus: 'completed', createdAt >= 90 days } })` grouped by `DATE(createdAt)`. | None (pure SQL series). | N/A |
| `getStockDepletion(req, res)` | `GET /api/insights/stock-depletion` | Same queries as `getStockDepletionForecast`. | `POST /api/forecasting/stock-depletion` via `aiClient.post`. | Full per-product current stock + daily sales history. |

### 1.2 AI Microservice Architecture & Ingestion Characteristics

Inspection of `ai_service/src/` confirms the following fundamental architectural properties:
1. **Zero Database Coupling**: The FastAPI application has no database connection pool, ORM, or SQL drivers. It accepts JSON arrays over HTTP and returns mathematical and predictive inferences.
2. **Shop-Agnostic Mathematical Engines**:
   - `/api/insights/analyze`: Operates on dimensionless parallel arrays of numbers (e.g., `revenue: [1000, 1200]`). It evaluates MoM percent change and retention ratios. It does not inspect `shopId`.
   - `/api/insights/anomalies`: Runs scikit-learn `IsolationForest` on daily features (`revenue`, `transaction_count`, `avg_transaction_value`, `day_of_week`, `is_weekend`). It detects multivariate statistical outliers regardless of whether the observations represent one store or a conglomerate.
   - `/api/insights/customer-segments`: Runs scikit-learn `KMeans` with standard scaling on customer behavioral metrics. Because Phase 2 already established `Customer` as an organization-scoped identity, clustering customers across the organization is mathematically superior to single-shop clustering.
   - `/api/forecasting/forecast` & `/rf-forecast`: Fits Facebook Prophet or Random Forest on `{ dates: [...], values: [...] }`. In `rf-forecast`, `shop_id` is merely accepted as an optional metadata string for logging (`logger.info("[rf-forecast] Success: shop_id=%s ...")`). The model itself trains purely on the continuous time series.
   - `/api/forecasting/stock-depletion`: Iterates through an array of items `{ product_id, product_name, current_stock, daily_sales }`.
3. **Verdict**: The Python microservice works **identically** on pre-aggregated multi-shop data. **Zero Python changes are required.**

### 1.3 Audit of `dashboardController.js` and `reportsController.js`

- `dashboardController.js`: Computes quick dashboard cards: `getStats` (sales, customer counts, growth rates), `getRevenueData` (period breakdowns), `getTopProducts`, `getVisitorStats`, `getOrderStats`, `getPlatformStats`, and `getLocationStats`. All queries filter by `where: { shopId }`.
- `reportsController.js`: Computes detailed operational accounting reports: `getSalesSummary` (hourly, daily, or monthly breakdowns with tax, discount, and refund deductions), `getProfitAndLoss` (COGS calculated from `Product.cost` and `Expense` totals), `getTaxEstimate` (16% VAT estimation), and `getEmployeeSales` (cashier/manager shift commissions).

#### Scope Boundary Recommendation & Justification

**Recommendation**: Phase 4 should explicitly create a focused, executive-level **Organization Roll-Up Analytics** module, but should **NOT** refactor or duplicate the entire operational reporting suite in `reportsController.js` and `dashboardController.js`.

**Justification**:
1. **Executive Intent vs. Cashier/Store Operations**: An organization executive viewing cross-branch roll-ups wants strategic macro-indicators: consolidated revenue, multi-branch growth comparisons, branch ranking ("which branch is outperforming?"), company-wide stock depletion, and consolidated forecasting. They do not need an hourly cash-drawer breakdown or register-level shift sales combining 10 stores into one unreadable 240-row timeline.
2. **Accounting Invariants & Complexity**: `reportsController.getProfitAndLoss` and `getSalesSummary` contain delicate single-shop operational logic (e.g., hourly single-day bucketing, local shift returns, employee commission attribution). Attempting to convert every accounting report to an org-wide view creates high surface area for regressions in operational POS accounting without delivering proportional executive value.
3. **Clean Decoupling**: Placing organization roll-up endpoints in an additive controller namespace (e.g., `orgInsightsController.js` or additive handlers under `/api/insights/organization/*`) ensures that store-level POS terminals remain completely isolated and unaffected.

### 1.4 Forecast Cache Audit (`forecastCache`)

In `backend/src/routes/aiProxy.js`, Prophet and Random Forest forecasts are cached in-memory via `NodeCache`:
```javascript
function buildForecastCacheKey(shopId, requestBody, periods, model = 'prophet') {
  const dataHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ dates: requestBody.dates, values: requestBody.values, periods, model }))
    .digest('hex')
    .substring(0, 16);
  return `forecast:${shopId}:${model}:${periods}:${dataHash}`;
}
```
Key observations:
1. **Cache Scope**: Keys are prefixed with `forecast:${shopId}:...`.
2. **Invalidation**: `DELETE /api/ai/cache/:shopId` filters keys matching `forecast:${shopId}:`. It is restricted to the shop admin.
3. **Roll-Up Cache Strategy**:
   - An organization-level forecast needs a distinct prefix to eliminate any possibility of collision with a shop whose ID equals the organization's ID:
     `forecast:org:${organizationId}:${model}:${periods}:${dataHash}`
   - Org cache invalidation should be exposed via:
     `DELETE /api/ai/cache/org/:organizationId`
   - Forecast caches use a 1-hour TTL (`stdTTL: 3600`). Because forecasting runs expensive ML algorithms on historical time series, neither sales nor stock changes should trigger immediate cache eviction (sales happen every second in high-volume retail). Retaining the 1-hour TTL for org-level forecasts preserves server CPU while maintaining consistency with per-shop caching.

### 1.5 Access Control Analysis

In earlier phases, two distinct access control precedents were established:
1. **Phase 1 Precedent (Governance Axis)**: Shop creation (`POST /api/shop`) and shop access management required `orgRole IN ('owner', 'admin')`.
2. **Phase 2 Precedent (Operational Axis)**: Customer and Supplier lookups (`GET /api/customers`, `GET /api/suppliers`) were granted to *any active organization member* (including cashiers and branch employees).

#### Which Precedent Fits Organization Analytics?

**Decision**: Organization roll-up analytics must strictly follow **Phase 1 (Governance Axis: `orgRole IN ('owner', 'admin')`)**.

**Justification**:
1. **Business Confidentiality**: In multi-branch retail, store employees (cashiers, shelf stockers, branch managers) must not have access to company-wide financial performance, total organizational revenue, or margins and sales figures of competing branches.
2. **Role Mapping in `OrganizationMemberships`**:
   - `owner`: Business proprietor; has global visibility across all shops in the organization.
   - `admin`: Operations director / regional manager; has multi-shop administrative privileges.
   - `member`: Branch-level staff (cashier, store keeper). Membership is restricted to specific shops via `ShopAccess`.
3. If an individual needs to see organization-wide financial roll-ups, the owner elevates their membership `orgRole` to `admin`.
4. Therefore, any attempt by a `member` to request organization-level roll-ups will be rejected with `403 Forbidden` (`Organization analytics requires owner or admin privileges`).

---

## Part 2 — Data Audit

### 2.1 Live Production Database Audit (`zana_pos`)

A live SQL audit was performed on the primary database `zana_pos`:

```sql
SELECT o.id, o.name, COUNT(s.id) as shop_count
FROM Organizations o
LEFT JOIN Shops s ON s.organizationId = o.id
GROUP BY o.id, o.name;
```

#### Empirical Findings

| Org ID | Organization Name | Shop ID | Shop Name | Inventory Count | Sales Count | Total Sales Revenue | SaleItems Count | Customer Count |
| :---: | :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **1** | Shop 1 | 1 | Shop 1 | 63 | 28 | KSh 55,200.00 | 26 | 0 |
| **2** | Shop 2 | 2 | Shop 2 | 0 | 1 | KSh 5,000.00 | 0 | 0 |
| **3** | Default Shop | 3 | Default Shop | 0 | 0 | KSh 0.00 | 0 | 0 |
| **4** | Soko Safi Supermarket (Westlands) | 4 | Soko Safi Supermarket | 15 | 102 | KSh 2,172,304.45 | 288 | 28 |
| **5** | Main POS | 5 | Main POS | 0 | 0 | KSh 0.00 | 0 | 0 |
| **6** | Realmer technology limited | 17 | Realmer technology | 0 | 0 | KSh 0.00 | 0 | 0 |

#### Key Conclusions:
1. **Zero Real Multi-Shop Organizations**: Currently, **100% of organizations in `zana_pos` have exactly 1 shop**.
2. **Testing Requirement**: Phase 4 cannot rely on pre-existing multi-shop production data for verification. Automated test suites and verification scripts must construct synthetic multi-shop fixtures (e.g., an organization with 2–3 shops, distinct inventories for shared catalog products, and interleaved sales transactions), exactly as done during Phase 1's multi-shop switch flow testing.

### 2.2 Additive Safety & Zero-Regression Invariants

1. **Isolation of Existing Routes**: All existing endpoints in `insightsController.js` and `aiProxy.js` continue to read `req.shopId` and execute their existing SQL queries unmodified. Single-shop merchants will experience zero latency change, zero schema disruption, and zero behavioral differences.
2. **Disjoint Cache Namespaces**: Per-shop keys (`forecast:${shopId}:...`) and organization keys (`forecast:org:${organizationId}:...`) share no namespace overlap, preventing cross-tenant or cross-scope cache collisions.
3. **Stateless Operations**: No global or mutable variables are introduced. All roll-up queries execute concurrently against MySQL using standard Sequelize transactions and queries.

---

## Part 3 — Architectural Design Proposal

### 3.1 Recommended Scope Boundary: The Minimal High-Value Roll-Up Set

Rather than blindly cloning all 11 endpoints, Phase 4 defines **three high-impact roll-up endpoints**:

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │               ORGANIZATION ROLL-UP API                 │
                                    └────────────────────────────────────────────────────────┘
                                                                 │
                  ┌──────────────────────────────────────────────┼──────────────────────────────────────────────┐
                  ▼                                              ▼                                              ▼
    GET /api/insights/organization/summary        GET /api/insights/organization/inventory-alerts    GET /api/insights/organization/daily-sales
    - Org-wide Total Revenue & Sales             - Cross-branch Low Stock Alerts                    - Consolidated Daily Revenue Series
    - Branch Performance Ranking & Share          - Stock Balances per Branch                        - Ready for AI Prophet / RF Forecast
    - Org-wide Revenue Trend Series               - Inter-Branch Restock Opportunities               - Uses forecast:org:{orgId}:... Cache
```

1. **`GET /api/insights/organization/summary` (Executive Financial Roll-Up)**:
   - Aggregates revenue, transactions, and active customers across all active branches.
   - Provides a ranked `branchPerformance` breakdown (revenue, transaction count, average ticket, percent of total revenue).
   - Generates company-wide 30-day sales trend.
2. **`GET /api/insights/organization/inventory-alerts` (Cross-Branch Stock Health & Transfer)**:
   - Identifies every catalog product that has depleted to critical levels in *at least one* branch.
   - Crucially, displays the current stock of that product across **all other branches** in the organization.
   - *High Business Value*: If Branch A has 0 units of Milk and Branch B has 50 units, the system surfaces an actionable inter-branch transfer recommendation instead of merely suggesting a supplier purchase.
3. **`GET /api/insights/organization/daily-sales` (Consolidated Time Series for AI Forecasting)**:
   - Aggregates daily sales across all active branches for the last 90 days.
   - Formats data into `{ dates: [...], values: [...], daily_data: [...] }`.
   - Directly usable by the existing AI forecasting proxy (`POST /api/ai/forward/api/forecasting/forecast` or `rf-forecast`) with the new org cache key.

---

### 3.2 Endpoint Specifications

#### 1. Executive Summary Roll-Up
- **Endpoint**: `GET /api/insights/organization/summary`
- **Access Control**: `auth`, active membership, `orgRole IN ('owner', 'admin')`.
- **Query Parameters**:
  - `startDate` (optional, default: 30 days ago)
  - `endDate` (optional, default: now)
- **Response Shape**:
```json
{
  "organizationId": 4,
  "period": {
    "startDate": "2026-08-14T00:00:00.000Z",
    "endDate": "2026-09-13T23:59:59.999Z"
  },
  "metrics": {
    "totalRevenue": 2172304.45,
    "totalSales": 102,
    "averageTransactionValue": 21297.10,
    "activeShopsCount": 2
  },
  "branchPerformance": [
    {
      "shopId": 4,
      "shopName": "Soko Safi Supermarket (Westlands)",
      "totalRevenue": 1500000.00,
      "totalSales": 70,
      "averageTransactionValue": 21428.57,
      "revenueSharePercentage": 69.05,
      "rank": 1
    },
    {
      "shopId": 8,
      "shopName": "Soko Safi (Kilimani Branch)",
      "totalRevenue": 672304.45,
      "totalSales": 32,
      "averageTransactionValue": 21009.51,
      "revenueSharePercentage": 30.95,
      "rank": 2
    }
  ],
  "salesTrend": [
    { "date": "2026-09-10", "totalSales": 45000.00, "transactionCount": 5 },
    { "date": "2026-09-11", "totalSales": 62000.00, "transactionCount": 8 }
  ]
}
```

#### 2. Cross-Branch Inventory Alerts & Transfer Opportunities
- **Endpoint**: `GET /api/insights/organization/inventory-alerts`
- **Access Control**: `auth`, active membership, `orgRole IN ('owner', 'admin')`.
- **Response Shape**:
```json
{
  "organizationId": 4,
  "alertCount": 3,
  "alerts": [
    {
      "productId": 12,
      "productName": "Brookside Whole Milk 500ml",
      "sku": "BRK-MLK-500",
      "depletedShops": [
        {
          "shopId": 4,
          "shopName": "Westlands",
          "currentStock": 0,
          "reorderPoint": 10,
          "status": "OUT_OF_STOCK"
        }
      ],
      "surplusShops": [
        {
          "shopId": 8,
          "shopName": "Kilimani",
          "currentStock": 45,
          "reorderPoint": 10,
          "status": "HEALTHY"
        }
      ],
      "transferRecommendation": "Transfer up to 20 units from Kilimani to Westlands"
    }
  ]
}
```

#### 3. Consolidated Organization Daily Sales
- **Endpoint**: `GET /api/insights/organization/daily-sales`
- **Access Control**: `auth`, active membership, `orgRole IN ('owner', 'admin')`.
- **Response Shape**:
```json
{
  "organizationId": 4,
  "dates": ["2026-06-15", "2026-06-16", "..."],
  "values": [12450.00, 18900.50, "..."],
  "daily_data": [
    {
      "date": "2026-06-15",
      "revenue": 12450.00,
      "transaction_count": 14,
      "avg_transaction_value": 889.28
    }
  ]
}
```

---

### 3.3 Database Aggregation Strategy (No N+1 Queries)

To aggregate across $N$ shops, the Node backend will **never** execute $N$ sequential loop queries. Instead, it resolves the set of active shops for `req.organizationId` and queries MySQL in single set-based SQL operations:

```javascript
// 1. Resolve all active shop IDs for the organization
const shops = await Shop.findAll({
  where: { organizationId: req.organizationId, active: true },
  attributes: ['id', 'name'],
  raw: true
});
const shopIds = shops.map(s => s.id);
const shopMap = new Map(shops.map(s => [s.id, s.name]));

// 2. Aggregate Sales in a single query across all active shops
const branchAggregates = await Sale.findAll({
  where: {
    shopId: { [Op.in]: shopIds },
    ...NON_CANCELLED_SALE_FILTER,
    createdAt: { [Op.between]: [start, end] }
  },
  attributes: [
    'shopId',
    [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
    [sequelize.fn('SUM', sequelize.col('total')), 'totalRevenue'],
    [sequelize.fn('AVG', sequelize.col('total')), 'avgTransactionValue']
  ],
  group: ['shopId'],
  raw: true
});

// 3. Aggregate Daily Trend in a single query across all active shops
const dailyTrend = await Sale.findAll({
  where: {
    shopId: { [Op.in]: shopIds },
    ...NON_CANCELLED_SALE_FILTER,
    createdAt: { [Op.between]: [start, end] }
  },
  attributes: [
    [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
    [sequelize.fn('SUM', sequelize.col('total')), 'totalSales'],
    [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount']
  ],
  group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
  order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
  raw: true
});
```

---

### 3.4 Access Control Implementation Pattern

A dedicated middleware or inline authorization check ensures rock-solid governance:

```javascript
// Middleware: verifyOrgAdminOrOwner
async function requireOrgAdmin(req, res, next) {
  const organizationId = req.organizationId;
  if (!organizationId) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const membershipWhere = {
    organizationId,
    status: 'active'
  };
  if (req.user.isEmployee) {
    membershipWhere.employeeId = req.user.id;
  } else {
    membershipWhere.userId = req.user.id;
  }

  const membership = await OrganizationMembership.findOne({ where: membershipWhere });
  if (!membership || !['owner', 'admin'].includes(membership.orgRole)) {
    return res.status(403).json({ error: 'Organization analytics requires owner or admin privileges.' });
  }

  req.membership = membership;
  next();
}
```

---

### 3.5 Caching & Invalidation Architecture

1. **New Cache Key Pattern**:
   ```javascript
   function buildOrgForecastCacheKey(organizationId, requestBody, periods, model = 'prophet') {
     const dataHash = crypto
       .createHash('sha256')
       .update(JSON.stringify({
         dates: requestBody.dates,
         values: requestBody.values,
         periods: periods ?? requestBody.periods,
         model
       }))
       .digest('hex')
       .substring(0, 16);
     return `forecast:org:${organizationId}:${model}:${periods}:${dataHash}`;
   }
   ```
2. **Cache Separation**:
   - Per-shop key: `forecast:${shopId}:${model}:${periods}:${hash}`
   - Org roll-up key: `forecast:org:${organizationId}:${model}:${periods}:${hash}`
   - These keys are completely disjoint. Clearing a shop cache never evicts the org cache, and clearing an org cache never evicts per-shop caches.
3. **Invalidation Route**:
   - `DELETE /api/ai/cache/org/:organizationId`
   - Gated by `requireOrgAdmin`. Clears all keys starting with `forecast:org:${organizationId}:`.

---

### 3.6 Performance & Scale Consideration

- **Current Reality**: $N = 1$ in `zana_pos`. Target retail profile is $N \in [2, 10]$ shops per organization.
- **Node-Side Aggregation**: By utilizing SQL `IN (:shopIds)` and `GROUP BY shopId`, MySQL handles all summing and grouping in tens of milliseconds using composite indexes created in FINDING-04 (`idx_sales_shop_created`).
- **AI Microservice Call Count**: Exactly **1 call** per forecast or anomaly analysis (not $N$ calls). The Node backend sends the consolidated time-series array directly to the AI service.

---

## Part 4 — Explicit Non-Scope

The following areas are strictly out of scope for Phase 4:
1. **No Changes to Existing Per-Shop Insights/Forecasting**: All endpoints (`/api/insights/*`, `/api/dashboard/*`, `/api/reports/*`) remain completely intact with their existing behavior, routes, and response schemas.
2. **No Cash Drawer / Register Features**: Cash registers and drawer reconciliations are Phase 5 (Registers).
3. **No Subscription / Entitlement Gating**: Multi-branch feature gating and subscription plans are Phase 6 (Billing & Entitlements).
4. **No Frontend Modifications**: This phase defines and implements the backend architecture and API endpoints only.
5. **No Modifications to Phase 1, 2, or 3 Core Models**: No changes to `Organizations`, `OrganizationMemberships`, `ShopAccess`, `Customers`, `Suppliers`, `Products`, or `Inventory` schemas.

---

## Part 5 — Risk Call-Outs & Mitigation

### 5.1 AI Proxy Rate Limiter Interaction (`aiProxy.js`)

In `backend/src/routes/aiProxy.js`:
```javascript
const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.shopId || ipKeyGenerator(req),
});
```
- **Risk**: If an org-level forecasting request is sent through `/api/ai/forward/...` by an owner who is in an organization context where `req.shopId` is either unset or shared across NAT IPs, the request could share a rate-limit bucket with other users.
- **Mitigation**: Update `keyGenerator` in `aiProxy.js` to prioritize `org:${req.organizationId}` when an org forecast is requested:
  `keyGenerator: (req) => (req.body.isOrgForecast ? `org:${req.organizationId}` : (req.shopId || ipKeyGenerator(req)))`.
  Furthermore, because the Node backend aggregates all shops into **one** AI request, an org roll-up generates exactly 1 request against the rate limiter, never exhausting the limit of 20 requests per 15 minutes.

### 5.2 Empty or Single-Shop Edge Cases

- **Scenario**: An organization has only 1 shop, or an organization has multiple shops but only 1 has sales recorded.
- **Mitigation**:
  - If $N = 1$, the endpoint executes smoothly, returning a 1-element `branchPerformance` array with `revenueSharePercentage = 100%`.
  - If a branch has 0 sales, it appears in `branchPerformance` with `totalRevenue = 0`, `totalSales = 0`, and `revenueSharePercentage = 0%`, accurately flagging non-producing locations to management.

### 5.3 Forecast Data Sufficiency Guard

- **Scenario**: The organization has fewer than 14 days of combined sales data.
- **Mitigation**: Prophet and Isolation Forest fail or produce low-confidence results on sparse data. The endpoint will mirror the existing `dailySales.length < 14` guard, returning a descriptive message (`"Insufficient historical sales data across branches (minimum 14 days required for forecasting)"`) instead of crashing upstream.

---

## Part 6 — Summary Architecture Map

```
Client (Owner / Admin)
       │
       ▼
[GET /api/insights/organization/*]
       │
       ▼
[requireOrgAdmin Middleware] ─── (orgRole in ['owner', 'admin']) ───► If member: 403 Forbidden
       │
       ▼
[Resolve Active Shops in Org]
       │
       ▼
[Single SQL Aggregation via Op.in(shopIds)]
   ├── Sale.findAll (grouped by shopId) ──► Branch Performance Ranking
   ├── Sale.findAll (grouped by Date)   ──► Consolidated Daily Trend
   └── Inventory.findAll + Product      ──► Multi-Branch Stock & Inter-Shop Transfers
       │
       ▼
[Assemble Consolidated Payload]
       │
       ├──────────────────────────────────────────────────────┐
       ▼                                                      ▼
Internal AI Service Call (via aiClient)               NodeCache (forecast:org:{orgId}:...)
   POST /api/insights/anomalies (IsolationForest)        1-Hour TTL
   POST /api/forecasting/forecast (Prophet)              Explicit Invalidation via DELETE
       │                                                      │
       └──────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
                     Return JSON Roll-Up Response
```
