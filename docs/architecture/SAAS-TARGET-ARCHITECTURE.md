# Zana POS — Target Multi-Tenant SaaS Architecture

## 1. Architectural Philosophy & Principles

The transformation of Zana POS from a single-business POS into a multi-tenant SaaS platform must adhere to the following non-negotiable principles:
1. **Strict Server-Side Tenant Isolation**: Tenant context must never be trusted from client query parameters, body, or headers. It must derive strictly from authenticated and verified server-side JWT claims or platform session state.
2. **True Multi-Branch Tenancy**: An SME Organization (Tenant) can own one or more physical Shops (Branches). The Tenant owns the subscription, billing, team memberships, customers, and AI analytics; individual Shops own location-specific inventory counts, cash registers, and physical POS sales.
3. **Deterministic Feature Entitlements & Usage Limits**: Feature access and operational quotas are governed by authoritative subscription status evaluated server-side.
4. **Idempotent Financial & Inventory Operations**: Financial and inventory ledger mutations are wrapped in database transactions with row-level locks and unique idempotency keys.
5. **Zero Downtime Migration Compatibility**: Existing operational data must be migrated safely into a default organization without breaking current POS terminals.

---

## 2. Target Entity Hierarchy

```
                      ┌─────────────────────────────────┐
                      │            PLATFORM             │
                      │   (Super Admin, Global Config)  │
                      └────────────────┬────────────────┘
                                       │
                      ┌────────────────▼────────────────┐
                      │      ORGANIZATION / TENANT      │
                      │  (name, slug, currency, status) │
                      └────────────────┬────────────────┘
                                       │
       ┌───────────────────────────────┼──────────────────────────────┐
       │                               │                              │
┌──────▼───────┐               ┌───────▼────────┐             ┌───────▼────────┐
│ SUBSCRIPTION │               │  ORGANIZATION  │             │     SHOPS /    │
│  & BILLING   │               │    MEMBERS     │             │    BRANCHES    │
├──────────────┤               ├────────────────┤             ├────────────────┤
│ Plan         │               │ Organization   │             │ Shop           │
│ Subscription │               │ Member Roles:  │             │ (Physical      │
│ Invoices     │               │ - Owner        │             │  Branch)       │
│ Payments     │               │ - Admin        │             │ SystemSettings │
│ Entitlements │               │ - Manager      │             └───────┬────────┘
│ Usage Limits │               │ - Cashier      │                     │
└──────────────┘               └────────────────┘                     │
       │                                                              │
       │ Shared Organization Entities                                 │ Branch-Scoped Entities
       ├──────────────────────────────────────────────┐               ├─────────────────────────┐
       │ - Customers                                  │               │ - Physical Inventory    │
       │ - Suppliers                                  │               │ - Stock Movements       │
       │ - Products Catalog                           │               │ - POS Sales             │
       │ - Categories, Brands, Units                  │               │ - POS Sale Items        │
       │ - Expense Categories                         │               │ - Sale Payments         │
       │ - AI Analytics & Forecasts                   │               │ - Cashier Registers     │
       │ - Audit Logs                                 │               │ - Purchases & POs       │
       └──────────────────────────────────────────────┘               └─────────────────────────┘
```

---

## 3. Core SaaS Domain Models

### 3.1 Organization (Tenant) Model
```javascript
Organization: {
  id: INTEGER, primaryKey, autoIncrement,
  name: STRING, allowNull: false,
  slug: STRING, allowNull: false, unique: true, // e.g. "acme-supermarket"
  currency: STRING(3), defaultValue: 'KES',
  status: ENUM('trialing', 'active', 'past_due', 'canceled', 'suspended'),
  trialEndsAt: DATE,
  createdAt: DATE,
  updatedAt: DATE
}
```

### 3.2 Organization Member Model (Membership & RBAC)
Decouples the global human `User` from their role inside a specific `Organization`:
```javascript
OrganizationMember: {
  id: INTEGER, primaryKey, autoIncrement,
  organizationId: INTEGER, references: Organizations(id),
  userId: INTEGER, references: Users(id),
  role: ENUM('owner', 'admin', 'manager', 'cashier'),
  defaultShopId: INTEGER, references: Shops(id), // Primary branch
  status: ENUM('active', 'invited', 'suspended'),
  createdAt: DATE,
  updatedAt: DATE,
  // Composite unique constraint: a user has at most one active membership per organization
  UNIQUE: (organizationId, userId)
}
```

### 3.3 Shop (Branch) Model Enhancement
```javascript
Shop: {
  id: INTEGER, primaryKey, autoIncrement,
  organizationId: INTEGER, allowNull: false, references: Organizations(id),
  name: STRING, allowNull: false,
  code: STRING(50), // Branch identifier, e.g. "BR-01"
  address: STRING,
  phone: STRING,
  kraPin: STRING,
  registrationNumber: STRING,
  active: BOOLEAN, defaultValue: true,
  createdAt: DATE,
  updatedAt: DATE,
  UNIQUE: (organizationId, code)
}
```

### 3.4 Subscription & Plan Models
```javascript
Plan: {
  id: INTEGER, primaryKey, autoIncrement,
  name: STRING, // e.g. "Starter", "Growth", "Enterprise"
  code: STRING, unique: true, // e.g. "starter", "growth"
  priceMonthly: DECIMAL(10, 2),
  priceYearly: DECIMAL(10, 2),
  currency: STRING(3), defaultValue: 'KES',
  maxShops: INTEGER, // Limit: Number of branches
  maxUsers: INTEGER, // Limit: Number of team members
  maxProducts: INTEGER, // Limit: Catalog size
  maxMonthlyTransactions: INTEGER,
  features: JSON, // e.g. { "ai_forecasting": true, "advanced_reports": true, "multi_branch": false }
  isActive: BOOLEAN, defaultValue: true
}

Subscription: {
  id: INTEGER, primaryKey, autoIncrement,
  organizationId: INTEGER, references: Organizations(id), unique: true,
  planId: INTEGER, references: Plans(id),
  status: ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED'),
  billingCycle: ENUM('monthly', 'yearly'),
  currentPeriodStart: DATE,
  currentPeriodEnd: DATE,
  cancelAtPeriodEnd: BOOLEAN, defaultValue: false,
  paymentMethod: STRING, // 'mpesa', 'card'
  lastPaymentDate: DATE,
  createdAt: DATE,
  updatedAt: DATE
}

SubscriptionEvent: {
  id: INTEGER, primaryKey, autoIncrement,
  subscriptionId: INTEGER, references: Subscriptions(id),
  organizationId: INTEGER, references: Organizations(id),
  eventType: STRING, // e.g. "PAYMENT_CONFIRMED", "PLAN_UPGRADED", "TRIAL_EXPIRED"
  metadata: JSON,
  createdAt: DATE
}
```

---

## 4. Authentication, Tenant Context & Security Flow

### 4.1 Authenticated Token Identity
The authenticated identity must represent:
$$\text{Identity} = \text{User} + \text{Organization Membership} + \text{Current Shop Context} + \text{Role} + \text{Entitlements}$$

**JWT Claims Payload:**
```json
{
  "id": 101,
  "email": "owner@sme.com",
  "organizationId": 5,
  "shopId": 12,
  "role": "owner",
  "plan": "growth",
  "iat": 1773400000,
  "exp": 1773486400
}
```

### 4.2 Request Processing & Resolution Pipeline
```
HTTP Request
  │
  ▼
auth middleware
  ├─ Verify RS256 JWT signature & expiration
  ├─ req.user = decoded (id, email)
  ├─ req.organizationId = decoded.organizationId
  ├─ req.shopId = decoded.shopId
  │
  ▼
tenantContext middleware
  ├─ Verify organization exists & is ACTIVE / TRIALING
  ├─ Verify user is an active member of organizationId
  ├─ If request specifies branch header ('x-shop-id'):
  │    Validate shop belongs to organizationId, override req.shopId
  │
  ▼
entitlementGuard(feature)
  ├─ Check if organization.subscription permits 'feature'
  ├─ Reject 403 Forbidden if feature not entitled
  │
  ▼
rolePermissions(requiredPermission)
  ├─ Verify req.user.role has permission
  │
  ▼
Controller / Service Execution
  └─ Force { where: { organizationId, ...(shopScoped ? { shopId } : {}) } }
```

---

## 5. Multi-Tenancy Data Isolation Strategy

### 5.1 Composite Unique Constraints
Replace all global unique constraints with organization-scoped composite unique constraints:
- `Product`: `UNIQUE (organizationId, sku)` and `UNIQUE (organizationId, barcode)`
- `Category`: `UNIQUE (organizationId, name)`
- `Coupon`: `UNIQUE (organizationId, code)`
- `Customer`: `UNIQUE (organizationId, phone)` and `UNIQUE (organizationId, email)`
- `Sale`: `UNIQUE (organizationId, invoiceNumber)` and `UNIQUE (organizationId, idempotencyKey)`

### 5.2 Invoice Number Generation Algorithm
Invoice numbers must prefix the organization slug or ID and branch code:
$$\text{InvoiceNo} = \text{ORG}-\text{SHOP}-\text{YYYYMMDD}-\text{SEQ}$$
Example: `ORG5-BR1-20260912-0001`.
This completely prevents collision across multiple tenants.

---

## 6. AI & Analytics Tenant Isolation

### 6.1 Data Pipeline Isolation
- Upstream requests to Python AI service (`fastapi`) pass `organizationId` and `shopId`.
- Caching keys in backend `aiProxy.js` and Redis must use composite keys:
  `cache:tenant:${organizationId}:shop:${shopId}:forecast:${model}:${hash}`
- AI models only train on datasets filtered strictly by `organizationId`.

---

## 7. Migration & Backward Compatibility Strategy

To ensure zero downtime and prevent breaking existing shops:
1. Create `Organizations`, `OrganizationMembers`, `Plans`, `Subscriptions` tables.
2. Seed baseline SaaS plans: `Starter` (1 shop, 2 users), `Growth` (3 shops, 10 users, AI enabled), `Enterprise` (Unlimited).
3. Auto-generate a default `Organization` for each existing `Shop` record:
   - Name: `Shop.name`
   - Plan: `Growth` (or Trial active)
   - Assign existing `Users` and `Employees` of that shop as members of that Organization.
4. Add `organizationId` column to all operational tables (`Products`, `Sales`, `Customers`, etc.) and backfill from `Shops.organizationId`.
5. Migrate database unique constraints to composite unique indexes.
