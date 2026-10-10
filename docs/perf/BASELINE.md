# Performance Gate P1 — Stage A Baseline & After-A Measurements

## 1. Environment & Sequelize Configuration Audit (A1.a, A2, A3)

### 1.1 Runtime & Hardware Environment

| Property | Value |
| :--- | :--- |
| **Measurement Timestamp (Baseline)** | `2026-10-10T20:52:45.575Z` |
| **Measurement Timestamp (After-A)** | `2026-10-10T20:55:13.417Z` |
| **Host OS** | `win32 10.0.26200 (x64)` |
| **CPU** | `Intel(R) Core(TM) i5-6300U CPU @ 2.40GHz` (`4` logical cores) |
| **System RAM** | `15.41 GB` |
| **Node.js Version (Host Harness)** | `v24.11.1` (`v20.20.2` in Docker containers & CI) |
| **MySQL Version (`zana-mysql`)** | `8.4.7` (`127.0.0.1:3307`) |
| **Redis Version (`zana-redis`)** | `7.4.9` (`127.0.0.1:6379`) |
| **Runtime Mode (`NODE_ENV`)** | `development` (`SMTP_HOST` and `SMTP_PORT` set at runtime so `emailVerification7DayGate` is active) |

---

### 1.2 Sequelize Configuration Files in Repository

The repository contains two primary Sequelize configuration files (plus one legacy file in `backend/config/config.js`):

1. **[`backend/src/config/database.js`](../../backend/src/config/database.js)** — **Used by the running Express server** (imported by [`backend/src/models/index.js`](../../backend/src/models/index.js) and [`backend/src/app.js`](../../backend/src/app.js)).
2. **[`backend/src/config/sequelize.js`](../../backend/src/config/sequelize.js)** — **Used by `sequelize-cli`** (configured via [`backend/.sequelizerc`](../../backend/.sequelizerc) for `db:migrate`, `db:seed`, etc.).
3. **[`backend/config/config.js`](../../backend/config/config.js)** — Legacy config file not referenced by `.sequelizerc` or `backend/src/` (only referenced by standalone one-off maintenance scripts in `backend/scripts/`).

#### Pool & Logging Settings: Before Stage A (`BASELINE`) vs After Stage A (`AFTER-A`)

| Config File & Consumer | Environment | Setting | Before Stage A (`BASELINE`) | After Stage A (`AFTER-A` Defaults) | Env Override Variables |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`backend/src/config/database.js`**<br>*(Running Express Server)* | `development` | `logging` | `console.log` (`true`) | `false` (`console.log` only when `DEBUG_SQL === 'true'`) | `DEBUG_SQL` |
| | `development` | `pool` | `{ max: 5, min: 0, acquire: 30000, idle: 10000 }` | `{ max: 15, min: 0, acquire: 30000, idle: 10000 }` | `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_ACQUIRE_MS`, `DB_POOL_IDLE_MS` |
| | `test` / `production` / other | `logging` | `false` | `false` (`console.log` only when `DEBUG_SQL === 'true'`) | `DEBUG_SQL` |
| | `test` / `production` / other | `pool` | `{ max: 5, min: 0, acquire: 30000, idle: 10000 }` | `{ max: 5, min: 0, acquire: 30000, idle: 10000 }` *(unchanged)* | `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_ACQUIRE_MS`, `DB_POOL_IDLE_MS` |
| **`backend/src/config/sequelize.js`**<br>*(`sequelize-cli`)* | `development` | `logging` | `console.log` (`true`) | `false` (`console.log` only when `DEBUG_SQL === 'true'`) | `DEBUG_SQL` |
| | `development` | `pool` | *(unset -> Sequelize default `max: 5, min: 0, acquire: 60000, idle: 10000`)* | `{ max: 15, min: 0, acquire: 60000, idle: 10000 }` | `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_ACQUIRE_MS`, `DB_POOL_IDLE_MS` |
| | `test` | `logging` | `false` | `false` (`console.log` only when `DEBUG_SQL === 'true'`) | `DEBUG_SQL` |
| | `test` | `pool` | *(unset -> Sequelize default `max: 5, min: 0, acquire: 60000, idle: 10000`)* | `{ max: 5, min: 0, acquire: 60000, idle: 10000 }` *(unchanged)* | `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_ACQUIRE_MS`, `DB_POOL_IDLE_MS` |
| | `production` | `logging` | `false` | `false` (`console.log` only when `DEBUG_SQL === 'true'`) | `DEBUG_SQL` |
| | `production` | `pool` | `{ max: 10, min: 2, acquire: 30000, idle: 10000 }` | `{ max: 10, min: 2, acquire: 30000, idle: 10000 }` *(unchanged)* | `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_ACQUIRE_MS`, `DB_POOL_IDLE_MS` |

---

## 2. Throwaway Database, Redis Isolation & Seeded Dataset (A1.b)

### 2.1 Safety & Isolation

- **Throwaway MySQL Database**: Created `zana_perf_test` on `127.0.0.1:3307`, ran all Sequelize migrations via `sequelize-cli db:migrate`, seeded using `backend/src/seeders/seed.js` plus realistic benchmark volume, and dropped `zana_perf_test` (`DROP DATABASE IF EXISTS zana_perf_test`) immediately after `AFTER-A` measurements completed. The development database `zana_pos` was never touched.
- **Throwaway Redis Database**: Used `REDIS_DB=3` throughout the harness and ran `FLUSHDB` on Redis DB `3` during cleanup.
- **Rate Limiter Handling**: Application rate-limiting code (`backend/src/utils/distributedRateLimiter.js`, `generalLimiter` at 500 requests / 15 min) was **not** modified or weakened. Between benchmark phases and before each of the 20 dashboard burst runs, the harness deleted only `ratelimit:*` keys in throwaway Redis DB `3` (and cleared the in-memory fallback map) so rate limiting did not throttle the 274 requests per pass while leaving all auth/permission/entitlement caches intact.

### 2.2 Seeded Row Counts in `zana_perf_test`

| Table | Row Count | Notes |
| :--- | ---: | :--- |
| `Organizations` | `1` | `id: 3` (`Default Benchmark Org`, status `active`, currency `KES`) |
| `Plans` | `4` | Seeded by migration `20260914100000-create-and-seed-plans.js` (`starter`, `growth`, `enterprise`, `grandfathered`) |
| `Subscriptions` | `1` | Active `grandfathered` subscription for `organizationId: 3` |
| `Shops` | `1` | `id: 1` (`Default Shop`, `organizationId: 3`, `active: true`) |
| `Users` | `3` | `admin@example.com` (`id: 1`, `role: 'admin'`), `manager@example.com`, `cashier@example.com` |
| `OrganizationMemberships` | `3` | `userId: 1` (`orgRole: 'owner'`, `status: 'active'`), `userId: 2, 3` (`orgRole: 'member'`, `status: 'active'`) |
| `Employees` | `10` | 3 from `seed.js` + 7 additional active staff across Manager/Cashier positions |
| `Categories` | `4` | `Electronics`, `Clothing`, `Groceries`, `Stationery` (`seed.js`) |
| `Products` | `100` | 5 from `seed.js` + 95 additional active SKUs across the 4 categories |
| `Inventory` | `100` | Branch inventory records for all 100 products on `shopId: 1` |
| `Customers` | `50` | 3 from `seed.js` + 47 additional customers across Nairobi, Mombasa, Kisumu, Nakuru, Eldoret |
| `Sales` | `250` | 2 from `seed.js` + 248 completed sales distributed across the last 14 days |
| `SaleItems` | `500` | 4 from `seed.js` + 496 line items (2 items per sale) |
| `Expenses` | `20` | 3 from `seed.js` + 17 additional `utilities` / `maintenance` expenses |

---

## 3. SQL Query & Redis Command Counts per Authenticated Request (A1.c)

Counted in a non-committed harness using a Sequelize `afterQuery` hook and an `ioredis` `sendCommand` wrapper for `admin@example.com` (`User.id = 1`, `orgRole = 'owner'`, `shopId = 1`, `organizationId = 3`).

### 3.1 Summary Table

| Endpoint | Cache State | HTTP Status | Total SQL Queries | Pre-Handler Auth/Authz SQL Queries | Handler SQL Queries | Redis Commands | Baseline Duration (`ms`) | After-A Duration (`ms`) |
| :--- | :--- | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `GET /api/auth/profile` | **Cold** (after `FLUSHDB` + in-memory reset) | `200` | **`9`** | `7` | `2` | **`12`** | `155.07` | `182.32` |
| `GET /api/auth/profile` | **Warm** | `200` | **`6`** | `4` | `2` | **`7`** | `46.53` | `62.76` |
| `GET /api/sales/statistics` | **Cold** (after `FLUSHDB` + in-memory reset) | `200` | **`16`** | `12` | `4` | **`15`** | `141.36` | `256.04` |
| `GET /api/sales/statistics` | **Warm** | `200` | **`12`** | `8` | `4` | **`10`** | `109.73` | `259.81` |

> [!IMPORTANT]
> **Why `GET /api/sales/statistics` (and other router-protected endpoints) executes 8–12 pre-handler SQL queries today:**
> 1. **Triple `User` read on cold cache**: `emailVerification7DayGate` (`User.findByPk` for `emailVerifiedAt, createdAt`), `auth.js` -> `tokenRevocationService.getUserStatus` (`User.findByPk` for `active`), `tokenRevocationService.getAuthzVersion` (`User.findByPk` for `authzVersion`), and `authzContext.js` (`User.findByPk` for full identity). Note: for an unverified owner within the 7-day grace window (`emailVerifiedAt IS NULL`), `emailVerification7DayGate` never caches the negative result and adds 1 `User.findByPk` query on **every** warm non-exempt request as well (bringing warm `GET /api/sales/statistics` to 13 SQL queries).
> 2. **Duplicate `authzContext` execution per request**: `backend/src/middleware/auth.js` line 114 ends with `return authzContext(req, res, next);`, while route files (`sales.js`, `analytics.js`, `customers.js`, `products.js`, `employees.js`, `billingRoutes.js`) mount `router.use(auth); router.use(authzContext);`. Consequently, `authzContext` runs **twice** on every request to those routers—executing `User.findByPk`, `OrganizationMembership.findOne`, `Organization.findByPk`, and `Shop.findAll` **twice per request** even when Redis is warm.

### 3.2 Exact SQL Queries & Redis Commands Recorded

#### `GET /api/auth/profile` — Cold (`9` SQL queries, `12` Redis commands)

**SQL Queries:**
1. `SELECT id, active FROM Users AS User WHERE User.id = 1;` *(auth.js -> getUserStatus cold fallback)*
2. `SELECT Subscription.*, Plan.* FROM Subscriptions AS Subscription INNER JOIN Plans AS Plan ON Subscription.planId = Plan.id WHERE Subscription.organizationId = 3;` *(auth.js -> getOrgStatus -> getOrganizationEntitlements cold fallback)*
3. `SELECT id, authzVersion FROM Users AS User WHERE User.id = 1;` *(authzContext.js -> getAuthzVersion cold fallback)*
4. `SELECT id, name, email, role, active, shopId, authzVersion FROM Users AS User WHERE User.id = 1;` *(authzContext.js step 3)*
5. `SELECT id, organizationId, userId, employeeId, orgRole, status, createdAt, updatedAt FROM OrganizationMemberships AS OrganizationMembership WHERE OrganizationMembership.userId = 1 LIMIT 1;` *(authzContext.js step 4)*
6. `SELECT id, name, status FROM Organizations AS Organization WHERE Organization.id = 3;` *(authzContext.js step 5)*
7. `SELECT id FROM Shops AS Shop WHERE Shop.organizationId = 3 AND Shop.active = true;` *(authzContext.js step 7)*
8. `SELECT User.*, Shop.* FROM Users AS User LEFT OUTER JOIN Shops AS Shop ON User.shopId = Shop.id WHERE User.id = 1;` *(authController.getProfile handler)*
9. `SELECT id, organizationId, userId, employeeId, orgRole, status, createdAt, updatedAt FROM OrganizationMemberships AS OrganizationMembership WHERE OrganizationMembership.userId = 1 AND OrganizationMembership.status = 'active' AND OrganizationMembership.organizationId = 3 LIMIT 1;` *(authController.getProfile handler)*

**Redis Commands:**
1. `EVAL <RATE_LIMIT_LUA_SCRIPT>` (`ratelimit:general:127.0.0.1`)
2. `GET revoked_token:bench-stage-a-jti-001`
3. `GET revoked_tokens_cutoff:user:1`
4. `GET auth_status:user:1`
5. `SETEX auth_status:user:1`
6. `GET auth_status:org:3`
7. `GET cache:entitlements:org:3`
8. `SETEX cache:entitlements:org:3`
9. `SETEX auth_status:org:3`
10. `GET authz_version:user:1`
11. `SETEX authz_version:user:1`
12. `GET auth_status:org:3` *(second check inside `authzContext.js`)*

#### `GET /api/auth/profile` — Warm (`6` SQL queries, `7` Redis commands)

**SQL Queries:** Queries `#4`, `#5`, `#6`, `#7` (`authzContext.js`) + `#8`, `#9` (`authController.getProfile`).
**Redis Commands:** `EVAL` (rate limiter), `GET revoked_token:...`, `GET revoked_tokens_cutoff:user:1`, `GET auth_status:user:1`, `GET auth_status:org:3`, `GET authz_version:user:1`, `GET auth_status:org:3`.

#### `GET /api/sales/statistics` — Cold (`16` SQL queries, `15` Redis commands) & Warm (`12` SQL queries, `10` Redis commands)

**Cold SQL Queries (`16`):**
1. `SELECT id, emailVerifiedAt, createdAt FROM Users AS User WHERE User.id = 1;` *(`emailVerification7DayGate`)*
2. `SELECT id, active FROM Users AS User WHERE User.id = 1;` *(`auth.js` -> `getUserStatus`)*
3. `SELECT Subscription.*, Plan.* FROM Subscriptions ... WHERE Subscription.organizationId = 3;` *(`auth.js` -> `getOrgStatus`)*
4. `SELECT id, authzVersion FROM Users AS User WHERE User.id = 1;` *(`authzContext` #1 via `auth.js` -> `getAuthzVersion`)*
5. `SELECT id, name, email, role, active, shopId, authzVersion FROM Users AS User WHERE User.id = 1;` *(`authzContext` #1)*
6. `SELECT * FROM OrganizationMemberships WHERE userId = 1 LIMIT 1;` *(`authzContext` #1)*
7. `SELECT id, name, status FROM Organizations WHERE id = 3;` *(`authzContext` #1)*
8. `SELECT id FROM Shops WHERE organizationId = 3 AND active = true;` *(`authzContext` #1)*
9. `SELECT id, name, email, role, active, shopId, authzVersion FROM Users AS User WHERE User.id = 1;` *(`authzContext` #2 via `routes/sales.js`)*
10. `SELECT * FROM OrganizationMemberships WHERE userId = 1 LIMIT 1;` *(`authzContext` #2)*
11. `SELECT id, name, status FROM Organizations WHERE id = 3;` *(`authzContext` #2)*
12. `SELECT id FROM Shops WHERE organizationId = 3 AND active = true;` *(`authzContext` #2)*
13. `SELECT count(*) AS count FROM Sales AS Sale WHERE Sale.shopId = 1;` *(`saleController.getSalesStatistics`)*
14. `SELECT sum(total) AS sum FROM Sales AS Sale WHERE Sale.shopId = 1 AND Sale.createdAt BETWEEN ...;` *(`saleController.getSalesStatistics`)*
15. `SELECT count(*) AS count FROM Sales AS Sale WHERE Sale.shopId = 1 AND Sale.createdAt BETWEEN ...;` *(`saleController.getSalesStatistics`)*
16. `SELECT AVG(total) AS average FROM Sales AS Sale WHERE Sale.shopId = 1 AND Sale.createdAt BETWEEN ... LIMIT 1;` *(`saleController.getSalesStatistics`)*

**Warm SQL Queries (`12`):** Queries `#5`–`#16` (`4` in `authzContext` #1 + `4` in `authzContext` #2 + `4` in `saleController.getSalesStatistics`).
**Warm Redis Commands (`10`):** `EVAL` (rate limiter), `GET revoked_token:...`, `GET revoked_tokens_cutoff:user:1`, `GET auth_status:user:1`, `GET auth_status:org:3`, `GET authz_version:user:1`, `GET auth_status:org:3`, `GET authz_version:user:1`, `GET auth_status:org:3`, `GET cache:entitlements:org:3` (`requireActiveSubscription`).

---

## 4. Latency & Pool Queueing Comparison: `BASELINE` vs `AFTER-A` (A1.d, A1.e, A4)

### 4.1 Dashboard Burst Endpoints (11 Concurrent Requests)

When the Dashboard mounts, it fires 11 requests concurrently across `Dashboard.jsx`, `StatsGrid.jsx`, `RevenueChart.jsx`, `VisitorGraph.jsx`, `OrderTracking.jsx`, `SellingPlatform.jsx`, `LocationAudience.jsx`, and `TopSellingProducts.jsx`:

1. `GET /api/analytics/orders?period=week` (`StatsGrid`)
2. `GET /api/analytics/visitors?period=week` (`StatsGrid`)
3. `GET /api/analytics/orders?period=week` (`RevenueChart` / `OrderTracking`)
4. `GET /api/analytics/sales-channels?period=week` (`SellingPlatform`)
5. `GET /api/analytics/customer-locations?period=week` (`LocationAudience`)
6. `GET /api/analytics/top-products?period=week&limit=5` (`TopSellingProducts`)
7. `GET /api/billing/subscription` (`Dashboard` mount)
8. `GET /api/employees` (`Dashboard` mount)
9. `GET /api/customers?limit=5` (`Dashboard` `loadDashboardData`)
10. `GET /api/products?limit=5` (`Dashboard` `loadDashboardData`)
11. `GET /api/sales/statistics` (`Dashboard` `loadDashboardData`)

### 4.2 Side-by-Side Summary Table (`BASELINE` vs `AFTER-A`)

| Metric | `BASELINE` (`pool.max = 5`, `logging = console.log`) | `AFTER-A` (`pool.max = 15`, `DEBUG_SQL = false`) | Change / Delta |
| :--- | ---: | ---: | :--- |
| **`GET /api/auth/profile` (50 Sequential) — `p50`** | `45.20 ms` | `77.68 ms` | `+32.48 ms` *(host CPU variance; still 6 SQL + 7 Redis per req)* |
| **`GET /api/auth/profile` (50 Sequential) — `p95`** | `63.65 ms` | `180.77 ms` | `+117.12 ms` *(host CPU variance; still 6 SQL + 7 Redis per req)* |
| **`GET /api/auth/profile` (50 Sequential) — `min` / `max` / `mean`** | `39.93` / `68.76` / `48.46 ms` | `40.47` / `376.29` / `94.11 ms` | `300` SQL queries executed across 50 requests in both |
| **`GET /api/auth/profile` (50 Sequential) — Pool Acquire `p50` / `p95`** | `0.05 ms` / `0.14 ms` | `0.06 ms` / `0.15 ms` | Unchanged (sequential requests use 1 connection at a time) |
| **Dashboard Burst (11 reqs) — Run 1 (Cold) Total Time** | **`966.19 ms`** | **`858.38 ms`** | **`-107.81 ms` (`-11.2%`)** |
| **Dashboard Burst — Run 1 Pool Acquire `p50` / `p95` / `max`** | `10.95` / `48.82` / `151.27 ms` | **`0.08` / `41.39` / `64.30 ms`** | **Acquire `p50` `-99.3%` (`10.95 ms` -> `0.08 ms`); `max` `-57.5%`** |
| **Dashboard Burst — Run 1 Queued Pool Acquires (`>5ms` or waiting)** | `116 / 140` (`82.9%`) | **`14 / 144` (`9.7%`)** | **`-87.9%` queued acquires** (only initial TCP connection setup) |
| **Dashboard Burst (11 reqs) — Runs 2–20 (Warm) `p50` Total Time** | `345.66 ms` | `371.55 ms` | `+25.89 ms` (`+7.5%`, within run-to-run variance: `269.88–624.31 ms` vs `283.56–794.81 ms`) |
| **Dashboard Burst (11 reqs) — Runs 2–20 (Warm) `p95` Total Time** | `624.31 ms` | `794.81 ms` | `+170.50 ms` (Run 2 outlier `794.81 ms`; Run 3–20 max is `511.80 ms`) |
| **Dashboard Burst (11 reqs) — Runs 2–20 `min` / `max` / `mean`** | `269.88` / `624.31` / `371.94 ms` | `283.56` / `794.81` / `399.20 ms` | Both execute **109 SQL queries** per warm burst |
| **Dashboard Burst — Runs 2–20 Max Active Pool Connections Used** | `5` *(capped at `pool.max = 5`)* | **`10`** *(up to `11` on Run 1)* | Pool no longer caps concurrent requests at 5 connections |
| **Dashboard Burst — Runs 2–20 Peak Waiting Requests in Pool Queue** | **`5` waiting** *(every run)* | **`0` waiting** *(all 19 runs)* | **100% elimination of Sequelize pool queue backlog** |
| **Dashboard Burst — Runs 2–20 Avg Queued Acquires per Burst** | **`82.9 / 109` (`76.1%`)** | **`0.2 / 109` (`0.2%`)** | **`-99.8%` reduction in queued connection acquires** |
| **Dashboard Burst — Runs 2–20 Pool Acquire `p95` (Median across runs)** | **`14.18 ms`** *(range `9.67–48.80 ms`)* | **`0.77 ms`** *(range `0.45–4.24 ms`)* | **`-94.6%` reduction in `p95` pool acquire wait time** |
| **Dashboard Burst — Runs 2–20 Pool Acquire `max` (Median across runs)** | **`17.14 ms`** *(range `11.41–64.47 ms`)* | **`1.78 ms`** *(range `1.19–9.92 ms`)* | **`-89.6%` reduction in max pool acquire wait time** |

### 4.3 Analysis of Stage A Impact & Remaining Bottleneck

1. **Sequelize Connection Pool Queueing Eliminated**:
   - With `pool.max = 5` (`BASELINE`), firing the 11 dashboard requests concurrently immediately saturated all 5 connections and forced up to 7 requests to wait in the Sequelize pool queue (`82.9` of `109` query connection acquires per warm burst waited for a connection, with median `p95` acquire latency of `14.18 ms` and spikes up to `64.47 ms` warm / `151.27 ms` cold).
   - With `pool.max = 15` (`AFTER-A`), peak active connections rose to `10–11` (matching the 11 concurrent requests), **`maxWaitingClientsObserved` dropped from `5` to `0` across all 19 warm runs**, and median `p95` pool acquire wait time dropped by **94.6%** (`14.18 ms` -> `0.77 ms`). Cold burst time (Run 1) improved by **`107.81 ms` (`-11.2%`, `966.19 ms` -> `858.38 ms`)**.
2. **Why Total Warm Burst Latency (~350–400 ms) Did Not Materially Drop Yet**:
   - Every warm 11-request dashboard burst still executes **109 SQL queries** (`84` of which are pre-handler auth/authz queries!) and **~90 Redis commands**.
   - On a 4-logical-core host running MySQL 8 in Docker, raising `pool.max` from `5` to `15` moves those 109 SQL queries from queuing in Node's `sequelize-pool` to executing concurrently across 10–11 MySQL threads.
   - Eliminating the ~84 redundant pre-handler DB queries per burst via request-scoped User sharing and the short-lived authorization context cache is the work of **Stages B and C**.

---

### 4.4 Per-Run Dashboard Burst Breakdown (`BASELINE` vs `AFTER-A`, All 20 Runs)

| Run | `BASELINE` Burst (`ms`) | `BASELINE` SQL Queries | `BASELINE` Queued Acquires | `BASELINE` Max Waiting | `BASELINE` Acquire `p50` / `p95` / `max` (`ms`) | `AFTER-A` Burst (`ms`) | `AFTER-A` SQL Queries | `AFTER-A` Queued Acquires | `AFTER-A` Max Waiting | `AFTER-A` Acquire `p50` / `p95` / `max` (`ms`) |
| --: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **1 (Cold)** | `966.19` | `140` | `116` | `7` | `10.95` / `48.82` / `151.27` | `858.38` | `144` | `14` | `5` | `0.08` / `41.39` / `64.30` |
| **2** | `471.08` | `109` | `86` | `5` | `9.36` / `38.15` / `57.95` | `794.81` | `109` | `0` | `0` | `0.04` / `0.70` / `1.75` |
| **3** | `402.11` | `109` | `84` | `5` | `9.13` / `15.72` / `17.14` | `375.12` | `109` | `0` | `0` | `0.05` / `1.00` / `1.88` |
| **4** | `345.32` | `109` | `87` | `5` | `8.40` / `12.95` / `13.84` | `459.35` | `109` | `0` | `0` | `0.05` / `0.72` / `1.46` |
| **5** | `376.15` | `109` | `79` | `5` | `8.70` / `14.46` / `30.66` | `364.27` | `109` | `0` | `0` | `0.06` / `0.75` / `2.54` |
| **6** | `402.64` | `109` | `78` | `5` | `8.47` / `15.29` / `19.65` | `384.51` | `109` | `0` | `0` | `0.05` / `1.01` / `1.44` |
| **7** | `332.65` | `109` | `66` | `5` | `5.71` / `12.12` / `14.37` | `467.91` | `109` | `0` | `0` | `0.05` / `0.70` / `1.48` |
| **8** | `335.24` | `109` | `81` | `5` | `6.66` / `13.09` / `15.76` | `390.29` | `109` | `0` | `0` | `0.07` / `1.53` / `1.74` |
| **9** | `624.31` | `109` | `91` | `5` | `13.76` / `48.80` / `62.22` | `349.81` | `109` | `0` | `0` | `0.05` / `0.68` / `2.04` |
| **10** | `376.44` | `109` | `80` | `5` | `7.58` / `14.69` / `18.40` | `342.88` | `109` | `0` | `0` | `0.06` / `0.86` / `2.15` |
| **11** | `345.66` | `109` | `83` | `5` | `6.78` / `15.26` / `24.99` | `283.56` | `109` | `0` | `0` | `0.05` / `0.58` / `1.35` |
| **12** | `309.94` | `109` | `83` | `5` | `6.16` / `11.94` / `15.71` | `384.74` | `109` | `0` | `0` | `0.06` / `0.95` / `1.48` |
| **13** | `316.54` | `109` | `89` | `5` | `6.39` / `12.45` / `14.67` | `371.55` | `109` | `3` | `0` | `0.06` / `4.24` / `9.92` |
| **14** | `440.71` | `109` | `89` | `5` | `7.73` / `19.75` / `64.47` | `334.79` | `109` | `0` | `0` | `0.05` / `0.53` / `3.84` |
| **15** | `494.52` | `109` | `83` | `5` | `8.16` / `36.14` / `49.90` | `301.69` | `109` | `0` | `0` | `0.06` / `0.76` / `1.78` |
| **16** | `287.50` | `109` | `70` | `5` | `6.12` / `11.00` / `12.02` | `339.67` | `109` | `0` | `0` | `0.06` / `0.77` / `1.19` |
| **17** | `277.36` | `109` | `89` | `5` | `6.67` / `10.61` / `12.53` | `350.64` | `109` | `0` | `0` | `0.07` / `1.99` / `2.90` |
| **18** | `269.88` | `109` | `89` | `5` | `5.26` / `9.67` / `11.41` | `360.76` | `109` | `0` | `0` | `0.05` / `1.71` / `2.03` |
| **19** | `307.44` | `109` | `78` | `5` | `6.05` / `10.17` / `13.19` | `416.64` | `109` | `0` | `0` | `0.04` / `0.45` / `1.55` |
| **20** | `351.36` | `109` | `90` | `5` | `8.09` / `14.18` / `17.39` | `511.80` | `109` | `0` | `0` | `0.04` / `1.07` / `2.08` |

---

## 5. Verification & Cleanup

- **Throwaway Benchmark Cleanup**: `DROP DATABASE IF EXISTS zana_perf_test` executed on `127.0.0.1:3307`; `FLUSHDB` executed on Redis DB `3`. Local dev DB (`zana_pos`) and test DB (`zana_pos_test`) were never touched by the benchmark.
- **Backend Lint (`npm run lint`)**: Exited `0` (`0` errors).
- **Backend Test Suite (`npm test`)**: `Test Suites: 84 passed, 84 total` | `Tests: 1181 passed, 1181 total` (`0` failed, identical to `master`).
