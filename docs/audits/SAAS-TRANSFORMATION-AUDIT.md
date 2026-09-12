# Zana POS — SaaS Transformation Master Audit

## 1. Executive Summary

Zana POS is an SME Point-of-Sale, inventory, and customer management system designed for African retailers. It includes an Express/Sequelize backend, a React/Vite/Tailwind frontend, a Python/FastAPI predictive AI microservice, Redis caching, and Safaricom M-Pesa integration.

This master audit evaluates the readiness of Zana POS to transition into a production-grade multi-tenant SaaS platform. 

### Core Verdict
The repository currently implements a **single-business, shop-isolated architecture** that was previously retrofitted by prefixing `shopId` onto database tables. It is **not yet SaaS-ready**. 
1. An organization/tenant model does not exist.
2. A single business cannot operate multiple branch shops without either sharing one shop context or creating disjoint accounts.
3. Critical database constraints enforce **global uniqueness across all tenants**, creating catastrophic operational collisions (e.g. two businesses cannot use the same barcode, SKU, category name, or daily receipt sequence `0001`).
4. Subscription, billing tiers, plan limits, and feature gating are completely absent.
5. Several API endpoints (`Store`, M-Pesa status polling, report date ranges) leak data across tenants or have zero authorization.

---

## 2. Baseline SaaS Readiness Scorecard

| Assessment Area | Baseline Score | Rationale & Critical Deficiencies |
|---|:---:|---|
| **Multi-tenancy** | **22 / 100** | No `Organization` entity; tenancy is conflated with physical `Shop`; multi-branch tenancy impossible. |
| **Authentication** | **55 / 100** | RS256 JWT is robust, but identity is split between `Users` and `Employees` and lacks organization context. |
| **Authorization** | **48 / 100** | Token role checks exist, but several routes omit shop context or permit cross-tenant IDOR. |
| **RBAC** | **60 / 100** | Roles (`admin`, `manager`, `cashier`, `employee`) exist and cache in Redis, but are shop-centric rather than org-centric. |
| **Onboarding** | **18 / 100** | Only registers a single shop and user; no org creation, plan selection, or branch setup. |
| **Billing** | **0 / 100** | Zero subscription billing infrastructure exists in the codebase. |
| **Subscriptions** | **0 / 100** | No plans, no subscription state machine, no trial period enforcement. |
| **Entitlements** | **10 / 100** | Feature gating is non-existent; all authenticated users access all enabled modules regardless of plan. |
| **Database** | **35 / 100** | Severe global unique constraint bugs (`sku`, `barcode`, `invoiceNumber`, `email`, `category name`, `coupon code`). |
| **Inventory Integrity**| **72 / 100** | Good transaction usage in purchases/sales, but inventory quantity is stored directly on Product table. |
| **Financial Integrity**| **68 / 100** | Uses `DECIMAL(10,2)` in MySQL, but M-Pesa callback and status polling lack atomic concurrency locks. |
| **AI Isolation** | **40 / 100** | Proxies user token, but cache keys and dataset isolation only use `shopId` rather than tenant organization. |
| **API Security** | **52 / 100** | Rate limiting and Helmet in place, but `/api/stores` and `/api/mpesa/status` have IDOR/unauthenticated exposure. |
| **Frontend SaaS UX** | **25 / 100** | Single-shop view; placeholder pages for super-admin/invoices; no branch switcher or subscription banner. |
| **Testing** | **45 / 100** | Tests exist for existing POS features, but multi-tenant adversarial isolation tests are virtually absent. |
| **Observability** | **58 / 100** | Winston request logging present; lacks structured request correlation IDs and tenant tags in logs. |
| **Deployment** | **65 / 100** | Docker Compose is working with MySQL 8 and Redis; deployment relies on migration scripts. |
| **Overall SaaS Readiness** | **36 / 100** | **NOT SAAS-READY — Structural overhaul required across Phases 1–19.** |

---

## 3. Findings Classification (P0 → P4)

### P0 — Catastrophic / Security / Data-Loss Blockers

#### [FINDING-P0-01] Daily Invoice Number Collision Between Tenants
- **Area**: Sales / Financial Integrity
- **Location**: `backend/src/controllers/saleController.js:427-443` & `backend/src/models/Sale.js:13-17`
- **Current Behavior**: `Sale.invoiceNumber` has a GLOBAL `unique: true` constraint. The sequence generator queries the last sale for `shopId` for today's date and creates `YYYYMMDD-0001`.
- **Root Cause**: When Tenant A generates `20260912-0001`, Tenant B's first sale of the day also generates `20260912-0001`, resulting in a MySQL `SequelizeUniqueConstraintError`. Tenant B's sales fail entirely.
- **Impact**: Multi-tenant point of sale is completely broken in production.
- **Recommended Fix**: Prefix invoice numbers with tenant/branch identifiers (e.g. `T{orgId}-S{shopId}-YYYYMMDD-0001`) and replace global unique constraint with `UNIQUE (organizationId, invoiceNumber)`.

#### [FINDING-P0-02] Global Unique Constraints on Product SKU and Barcode
- **Area**: Database / Multi-Tenancy
- **Location**: `backend/src/models/Product.js:14-23`
- **Current Behavior**: `sku` and `barcode` have global `unique: true` column definitions.
- **Root Cause**: A single tenant registering a standard product SKU (e.g. "MILK-500ML") or barcode ("6161100000000") blocks every other tenant on the entire SaaS platform from adding that item.
- **Impact**: Denial of Service against catalog onboarding across businesses.
- **Recommended Fix**: Drop global unique indexes and introduce composite unique indexes: `UNIQUE (organizationId, sku)` and `UNIQUE (organizationId, barcode)`.

#### [FINDING-P0-03] Global Unique Constraints on Category Name, Coupon Code, and Customer Email
- **Area**: Database / Multi-Tenancy
- **Location**: `Category.js:13`, `Coupon.js:13`, `Customer.js:17`
- **Current Behavior**: Categories ("Beverages"), Coupons ("WELCOME10"), and Customer emails are forced unique across all businesses.
- **Impact**: Legitimate data creation by Tenant B is rejected because Tenant A used common industry names.
- **Recommended Fix**: Convert each to organization-scoped composite uniqueness.

#### [FINDING-P0-04] Complete Absence of Tenant / Organization Abstraction
- **Area**: SaaS Architecture
- **Location**: Database Schema & Backend Identity
- **Current Behavior**: No `Organizations` table exists. Tenancy is equated directly to `Shop`.
- **Root Cause**: Single businesses with 2 or more branch locations cannot be represented. Team members cannot share customers, catalog, or reports across branches.
- **Impact**: Inability to sell to multi-branch SMEs; inability to bill per organization.
- **Recommended Fix**: Create `Organizations`, `OrganizationMembers`, `Plans`, and `Subscriptions` tables.

#### [FINDING-P0-05] Un-Isolated Store Controller (Global IDOR)
- **Area**: API Security / Tenant Isolation
- **Location**: `backend/src/controllers/storeController.js:4-111` & `backend/src/routes/storeRoutes.js`
- **Current Behavior**: `Store.findAll({ where: { isActive: true } })`, `Store.findByPk(id)`, `store.update()`, and `store.delete()` have ZERO shop or tenant filtering.
- **Impact**: Any authenticated user in any shop can view, edit, or delete any store across the entire platform.
- **Recommended Fix**: Either deprecate the redundant `Stores` table or strictly isolate with `organizationId`.

---

### P1 — Production Blockers

#### [FINDING-P1-01] Unauthenticated M-Pesa Status Polling Endpoint
- **Area**: Payment Integrity / API Security
- **Location**: `backend/src/routes/mpesaRoutes.js:109-125`
- **Current Behavior**: `GET /api/mpesa/status/:checkoutRequestId` has no authentication middleware and performs no tenant ownership validation.
- **Impact**: Any external user who guesses or intercepts a `checkoutRequestId` can query payment transaction status, customer phone number, and sale data.
- **Recommended Fix**: Mount `auth` middleware and assert `pendingPayment.shopId === req.shopId`.

#### [FINDING-P1-02] Cross-Tenant Global Sales Date Range Leak in Reports
- **Area**: Reporting Isolation
- **Location**: `backend/src/controllers/reportsController.js:37-42`
- **Current Behavior**: `Sale.findOne({ attributes: [[fn('MIN', col('createdAt')), 'minDate'], [fn('MAX', col('createdAt')), 'maxDate']] })` is executed without a `where: { shopId }` clause.
- **Impact**: Date filters in sales summaries leak historical activity bounds of other tenants.
- **Recommended Fix**: Add `shopId: req.user.shopId` (and `organizationId`) to the where clause.

#### [FINDING-P1-03] Complete Absence of SaaS Billing, Subscriptions, and Feature Gating
- **Area**: Subscriptions / Billing
- **Location**: Entire Backend and Frontend
- **Current Behavior**: No subscription state (`TRIALING`, `ACTIVE`, `PAST_DUE`, `EXPIRED`), no plans, no M-Pesa subscription renewals, and no server-side feature entitlement checks.
- **Impact**: Cannot monetize, enforce trials, or restrict plan quotas.
- **Recommended Fix**: Implement `canUseFeature(organization, feature)` middleware and subscription manager.

---

### P2 — Significant SaaS Deficiencies

#### [FINDING-P2-01] Split User Identity Architecture (Users vs Employees)
- **Area**: Authentication & RBAC
- **Location**: `backend/src/models/User.js` (INT id) vs `backend/src/models/Employee.js` (UUID id)
- **Current Behavior**: `authController.login` tries `User` first; if not found, tries `Employee`. Permissions and schema are inconsistent between the two.
- **Impact**: Fractured audit logging (`performedBy` vs `performedByEmployee`) and duplicate login logic.
- **Recommended Fix**: Unify through `OrganizationMember` records mapping to a unified identity.

#### [FINDING-P2-02] AI Service Caching & Rate Limiting Only Scoped to Shop
- **Area**: AI Isolation
- **Location**: `backend/src/routes/aiProxy.js:16-28`
- **Current Behavior**: `forecast:${shopId}:${model}:${periods}:${dataHash}` ignores organization context.
- **Recommended Fix**: Include `organizationId` in cache key and rate limiter key generator.

---

### P3 — Improvements
- Missing structured request IDs (`x-request-id`) in API responses.
- Frontend sidebar displays placeholder links for inactive features (`/gift-cards`, `/quotations`, `/super-admin`).

### P4 — Cosmetic
- Clean up unused `.bak` files in `backend/migrations`.
