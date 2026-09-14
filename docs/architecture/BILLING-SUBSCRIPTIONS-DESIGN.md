# Zana POS — SaaS Subscriptions, Billing & Feature Entitlements Architecture Design
**Document Version**: 1.0.0  
**Phase**: FINDING-12 (Phase 6: Multi-Tenant SaaS Subscriptions, Billing Engine, & Feature Entitlements)  
**Status**: DESIGN & AUDIT PROPOSAL (Read-Only Architectural Pass — Zero Code, Model, Route, or Migration Mutations)  
**Target File**: `docs/architecture/BILLING-SUBSCRIPTIONS-DESIGN.md`  

---

## 1. Executive Summary & Context

Phases 1 through 4 established the foundational multi-tenant architecture of Zena POS:
- **Phase 1**: `Organization` tenant root entity, `Shop.organizationId`, two-tier RBAC (`OrganizationMembership` governance vs `ShopAccess` branch delegation), and multi-shop switching.
- **Phase 2**: Shared master data (`Customer` and `Supplier` scoped to `Organization`).
- **Phase 3**: Catalog vs Inventory split (`Product` catalog org-scoped; `Inventory` shop-scoped stock ledger).
- **Phase 4**: Additive organization-wide executive AI roll-up analytics and forecasting.
- **Phase 5**: Registers/Till (deferred per architectural audit).

While Phases 1–4 made Zena POS *capable* of multi-tenancy, **Phase 6 is the commercial engine that transforms Zena into a revenue-generating SaaS product**. It governs:
1. **Plan Tiers & Quotas**: What a merchant gets based on what they pay.
2. **SaaS Billing Engine**: Recurring periodic subscriptions denominated in Kenyan Shillings (`KES`) using Kenya's primary payment rail (**M-Pesa STK Push**) and international/card rails (**Flutterwave**).
3. **Trial & Lifecycle State Machine**: 14-day automatic trial on merchant registration, graceful expiration with soft warnings (`past_due`), and zero false-positive lockouts.
4. **Centralized Feature Entitlements (`canUseFeature`)**: Strict server-side enforcement of branch quotas (`maxShops`), team limits (`maxUsers`), and premium modules (Phase 4's `org_insights`).

> [!IMPORTANT]
> **Financial & Security Rigor Principle**: Money bugs are as destructive as tenant isolation bugs. A billing bug that locks out a paying merchant in the middle of Saturday retail hours destroys business trust. Conversely, a webhook bug that grants unearned lifetime access to unpaid tenants undermines commercial viability. This design applies the hardened security patterns established during the P0 vulnerability remediations.

---

## 2. Part 1 — Current State Audit (Read-Only)

### 2.1 Re-Audit of Existing Payment Integrations

We audited all payment-related modules across the backend:
- [`backend/src/services/cardPaymentService.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/services/cardPaymentService.js)
- [`backend/src/routes/cardRoutes.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/routes/cardRoutes.js)
- [`backend/src/services/mpesaService.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/services/mpesaService.js)
- [`backend/src/routes/mpesaRoutes.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/routes/mpesaRoutes.js)
- [`backend/src/models/PendingPayment.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/PendingPayment.js)

#### Can this existing payment infrastructure be reused for recurring SaaS billing?

| Dimension | Existing Implementation (Sales Checkout) | SaaS Subscription Billing (Phase 6) | Reusability Verdict |
| :--- | :--- | :--- | :--- |
| **Payer** | Retail customer buying goods at a counter | Merchant (Organization Owner) paying for software | **Different Entity**: Payments must link to `Organization`, not `Shop` |
| **Transaction Purpose** | Creates a POS `Sale` with line items, inventory deduction, and customer receipt | Extends `Subscription.currentPeriodEnd`, updates `Organization.status` | **Different Target**: Cannot use `saleController.createSaleInternal` |
| **Gateway APIs Used** | - Flutterwave: Standard checkout (`/v3/payments`)<br>- Daraja: STK Push (`/mpesa/stkpush/v1/processrequest`) | - Flutterwave: Standard checkout or Payment Plans<br>- Daraja: STK Push / Paybill C2B | **Reuses Low-Level Gateway Communication**, but requires separate high-level handlers |
| **Credentials Used** | In `mpesaService.js:26-43`, credentials resolve per-shop from `SystemSettings` (or env fallback) | Platform SaaS credentials: Zena's platform Paybill and Flutterwave account | **Must Use Platform-Level Credentials**, not individual shop till numbers |
| **Pending Payment Model** | `PendingPayment` table is tightly coupled to `shopId` and `saleData` (`JSON` of items) | `SubscriptionInvoice` table linked to `organizationId` and `planId` | **Must Have Dedicated Model** |

**Conclusion on Existing Payment Code**:
The low-level HTTP integration patterns (Daraja OAuth token generation, STK push payload formulation, phone number normalization, and Flutterwave signature verification) are solid and reusable as shared service utilities. However, the high-level routing, database models, and callback business logic **must be dedicated to subscriptions** (`backend/src/services/billingService.js` and `backend/src/routes/billingRoutes.js`). Attempting to overload `cardRoutes.js` or `PendingPayment` with SaaS billing would create severe coupling and regression risk for customer sales checkout.

---

### 2.2 Audit of Plans, Subscriptions, Invoices, Entitlements & Quotas

1. **Plans & Subscriptions**:
   - Grep sweeps for `Plan`, `Subscription`, `Entitlement`, and `UsageLimit` returned **zero hits** across models, migrations, and controllers.
   - There are **zero subscription models** in the database today.
2. **Invoices Model**:
   - Audited [`backend/src/models/Invoice.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/Invoice.js):
   - `Invoice` represents a **POS customer sales tax receipt** (`saleId`, `shopId`, `tax`, `subtotal`, `total`, `discount`). It has no relationship to B2B SaaS subscription billing.
3. **Verdict**:
   - Zena POS has **zero existing subscription or entitlement infrastructure**. Phase 6 is greenfield with respect to subscription models.

---

### 2.3 Audit of Feature Gating Logic

We audited how features are currently guarded across the codebase:
1. **Multi-Shop Creation** ([`shopController.js:43-57`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/shopController.js#L43-L57)):
   - Checks: `if (!['owner', 'admin'].includes(membership.orgRole))` (RBAC only).
   - An organization owner can currently create an unlimited number of shops without any plan limit check.
2. **Executive Multi-Branch AI Roll-Ups** ([`requireOrgAdmin.js:15-30`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/middleware/requireOrgAdmin.js#L15-L30)):
   - Checks: Active `OrganizationMembership` with `orgRole IN ('owner', 'admin')`.
   - Zero checks on whether the tenant's subscription includes AI roll-ups.
3. **Per-Shop AI Forecasting** ([`insightsController.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/insightsController.js)):
   - Available to any authenticated shop staff without restriction.
4. **Verdict**:
   - Features are gated **strictly by human RBAC roles**, never by commercial subscription plan or quota.

---

### 2.4 Audit of Organization Schema (`status` Enum)

In [`backend/src/models/Organization.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/Organization.js#L19-L23) and migration [`20260912195615-create-organizations-table.js:28`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/migrations/20260912195615-create-organizations-table.js#L28):
```javascript
status: {
  type: DataTypes.ENUM('active', 'suspended', 'trial'),
  allowNull: false,
  defaultValue: 'active'
}
```
**Finding**:
The `status` column on `Organizations` was established in Phase 1 with values `'active'`, `'suspended'`, and `'trial'`.
- In `authController.js:register`, newly created organizations currently default to `'active'`.
- **Phase 6 Alignment**: When a merchant registers, `Organization.status` should be explicitly set to `'trial'`. We will expand this enum slightly (or introduce `'past_due'`) to provide an explicit grace period state.

---

### 2.5 Audit of Security & Callback Hardening Patterns

Review of the P0 vulnerability remediations ([`FINDING-03`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/security/TENANT-ISOLATION-MATRIX.md#L240)) and established callback flows revealed four mandatory security rules for billing webhooks:
1. **Signature Verification**: Flutterwave webhooks provide a hash in `req.headers['verif-hash']`. The handler must verify `crypto.timingSafeEqual(verifHash, secretHash)` before parsing.
2. **Strict Server-Side State Resolution**: The webhook must look up the pre-created `SubscriptionInvoice` using the gateway reference or internal invoice ID. It must never accept tenant identity or subscription duration from untrusted request body parameters.
3. **Idempotency Guard**: Webhook calls can be retransmitted by payment gateways. If the invoice is already marked `paid` or `confirmed`, the handler must return `200 OK` immediately without adding duplicate days to `currentPeriodEnd`.
4. **Amount & Currency Assertion**: Ensure `gatewayAmount >= invoiceAmount` and `gatewayCurrency === 'KES'`.

---

## 3. Part 2 — Scope Definition for Minimum Viable Billing

### 3.1 Plan Tiers & Concrete Differentiators

Rather than inventing speculative enterprise features, plan tiers must reflect **what Zena actually has to sell today**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ZENA POS PLAN TIERS                                       │
├───────────────────────────────┬──────────────────────────────┬──────────────────────────────┤
│       STARTER (SOLO)          │     GROWTH (MULTI-SHOP)      │        PRO / ENTERPRISE      │
│         KES 1,500/mo          │         KES 3,500/mo         │         KES 7,500/mo         │
├───────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
│ • 1 Physical Shop (Branch)    │ • Up to 3 Shops (Branches)   │ • Unlimited Shops            │
│ • Up to 2 Staff / Cashiers    │ • Up to 10 Staff / Cashiers  │ • Unlimited Staff            │
│ • Core POS & Local Inventory  │ • Multi-Shop Switching       │ • Priority Support           │
│ • Single-Shop Basic Reports   │ • Org Customers & Suppliers  │ • Custom Integrations        │
│ • Basic Single-Shop AI Alert  │ • Executive AI Roll-Ups      │ • All Features Unlocked      │
│                               │   (Phase 4 org_insights)     │                              │
└───────────────────────────────┴──────────────────────────────┴──────────────────────────────┘
```

#### What is Gated Concretely?
1. **Branch Quota (`maxShops`)**:
   - Starter: 1 Shop
   - Growth: 3 Shops
   - Pro: Unlimited (`-1` or `9999`)
   - *Enforcement Point*: `shopController.createShop` checks if active shop count $\ge$ plan limit.
2. **Team Quota (`maxUsers`)**:
   - Starter: 2 Employees/Users
   - Growth: 10 Employees/Users
   - Pro: Unlimited
   - *Enforcement Point*: `employeeController.createEmployee` checks if active employee count $\ge$ plan limit.
3. **Executive Multi-Branch AI Roll-Up Entitlement (`org_insights`)**:
   - Starter: Disabled
   - Growth: Enabled
   - Pro: Enabled
   - *Enforcement Point*: `requireOrgAdmin.js` or `orgInsightsRoutes.js` verifies `canUseFeature(orgId, 'org_insights')`.

---

### 3.2 Trial Handling & The "No False-Positive Lockout" Policy

```
[ Merchant Registers ]
         │
         ▼
 ┌────────────────┐
 │     TRIAL      │ ◄── 14 Days Full Access (Growth Plan capabilities)
 └───────┬────────┘
         │ (Day 14 expires, unpaid)
         ▼
 ┌────────────────┐
 │    PAST_DUE    │ ◄── 7 Days Grace Period
 └───────┬────────┘     • Core POS sales continue completely uninterrupted
         │              • Premium actions locked (cannot add new shop, no AI roll-up)
         │              • Dismissible banner: "Trial expired. Subscribe to keep all branches."
         │ (Day 21, still unpaid)
         ▼
 ┌────────────────┐
 │   SUSPENDED    │ ◄── Read-Only / Payment Wall
 └────────────────┘     • Back-office access allows viewing history and settling bill
                        • Core sales restricted until subscription renewed
```

#### Why Grace Period Over Hard Lockout?
In Kenya, SME merchants pay via M-Pesa. A merchant might be busy running their retail shop and miss an SMS reminder on Friday evening. If Zena executed a hard lockout at midnight, their cashiers would be blocked from ringing up customer sales on Saturday morning, triggering catastrophic churn.
- **Trial Duration**: 14 Days.
- **Grace Period (`past_due`)**: 7 Days.
- **In-App Communication**: Non-blocking warning banner across admin and cashier headers during `past_due`.
- **Enforcement during `past_due`**: Gated creation endpoints (`createShop`, `org_insights`) are disabled, but **existing single-shop sales and inventory lookups remain operational**.

---

### 3.3 Payment Rail Strategy: Period-Based Invoiced M-Pesa vs. Card Recurring

> [!NOTE]
> **Architectural Assessment: On-Demand Period Billing is the Authentic African SaaS Standard**
>
> In Western SaaS, "recurring billing" implies a credit card token saved on Stripe with background automatic debits. In Kenya:
> 1. Over 90% of SME merchants operate exclusively via **M-Pesa**.
> 2. Safaricom Daraja STK push requires user PIN authorization on the physical handset for every transaction; passive automated debits without PIN entry are not available for standard B2B merchants.
> 3. Forcing Kenyan merchants to provide credit cards causes immediate drop-off.
>
> **Recommended v1 Architecture**:
> - **Period-Based Invoiced Subscriptions (30-day renewable periods)**.
> - When renewal is due (or when upgrading):
>   - The merchant clicks **"Renew / Upgrade Subscription"**.
>   - They enter their M-Pesa phone number (or choose Card).
>   - System sends Daraja STK Push to the owner's phone.
>   - When the owner enters their PIN, Safaricom fires the callback to `/api/billing/mpesa/callback`.
>   - The callback extends `subscription.currentPeriodEnd` by +30 days and sets `organization.status = 'active'`.
>   - For cardholders, Flutterwave standard checkout achieves the exact same +30 days extension.
> - **Super-Admin Manual Override**: Platform super-admins can manually extend a subscription (for cash payments, enterprise invoices, or customer service grace periods).

This is **not a cop-out**—it is the proven, frictionless payment model for B2B software across East Africa.

---

### 3.4 Entitlement Enforcement Mechanism (`canUseFeature`)

To prevent fragmented `if (plan === 'pro')` conditionals scattered across controllers, all entitlement checks are centralized in a dedicated service and middleware.

#### Service Architecture: `backend/src/services/entitlementService.js`
```javascript
/**
 * Resolves active subscription and plan for an organization
 * Uses Redis cache (TTL: 15 minutes) invalidated on subscription mutation
 */
async function getOrganizationEntitlements(organizationId) { ... }

/**
 * Checks if a specific feature flag is granted
 */
async function canUseFeature(organizationId, featureKey) {
  const { plan, subscription, isGracePeriod } = await getOrganizationEntitlements(organizationId);
  
  // Hard suspended or expired past grace period
  if (subscription.status === 'suspended') {
    return { allowed: false, reason: 'Subscription is suspended due to non-payment.' };
  }
  
  // Premium feature check (e.g. 'org_insights')
  const hasFeature = plan.features?.[featureKey] === true;
  if (!hasFeature) {
    return { allowed: false, reason: `Feature "${featureKey}" requires a higher plan tier.` };
  }
  
  return { allowed: true };
}

/**
 * Checks if an operational quota has been exceeded
 */
async function checkQuota(organizationId, quotaKey, currentCount) {
  const { plan, subscription } = await getOrganizationEntitlements(organizationId);
  
  if (subscription.status === 'suspended') {
    return { allowed: false, reason: 'Subscription is suspended.' };
  }
  
  const limit = plan[quotaKey];
  if (limit !== -1 && currentCount >= limit) {
    return { 
      allowed: false, 
      limit, 
      current: currentCount,
      reason: `Plan limit of ${limit} reached for ${quotaKey}. Upgrade required.` 
    };
  }
  
  return { allowed: true, limit, current: currentCount };
}
```

#### Middleware Architecture: `backend/src/middleware/requireEntitlement.js`
```javascript
const requireFeature = (featureKey) => async (req, res, next) => {
  const orgId = req.organizationId || req.user?.organizationId;
  const result = await entitlementService.canUseFeature(orgId, featureKey);
  if (!result.allowed) {
    return res.status(403).json({ error: result.reason, code: 'UPGRADE_REQUIRED' });
  }
  next();
};
```

---

### 3.5 Downgrade & Non-Payment Behavior

| Event | System Action | Existing Data Impact |
| :--- | :--- | :--- |
| **Merchant Downgrades (Growth $\rightarrow$ Starter)** | `planId` updated for next cycle. `maxShops` becomes 1. | **Zero Data Deletion**: Existing shops remain intact and accessible in read-only/maintenance mode. Merchant cannot create a *new* shop until they upgrade. |
| **Trial Expires (Day 15–21)** | Status set to `'past_due'`. Grace period banner shown. | All existing single-shop sales and inventories remain fully functional. Premium creation actions blocked. |
| **Subscription Suspended (Day 22+)** | Status set to `'suspended'`. | Read-only access to historical data, sales reports, and customer lists. POS sales checkout gated until bill settled. |

---

## 4. Part 3 — Technical Design Proposal

### 4.1 Proposed Database Models

#### 4.1.1 Model: `Plan`
Table: `Plans`  
Scope: Platform-wide Master Data

```javascript
const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false // "Starter", "Growth", "Pro"
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true // "starter", "growth", "pro"
  },
  priceMonthly: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'KES'
  },
  maxShops: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1 // -1 = unlimited
  },
  maxUsers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2 // -1 = unlimited
  },
  features: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {} // { "org_insights": true, "multi_shop": true }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'Plans',
  timestamps: true
});
```

#### 4.1.2 Model: `Subscription`
Table: `Subscriptions`  
Scope: Tenant Root (`organizationId`)

```javascript
const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true, // Exactly one active subscription record per Organization
    references: {
      model: 'Organizations',
      key: 'id'
    }
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Plans',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('trialing', 'active', 'past_due', 'canceled', 'suspended'),
    allowNull: false,
    defaultValue: 'trialing'
  },
  billingCycle: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  currentPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  currentPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  trialEndsAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  lastPaymentMethod: {
    type: DataTypes.STRING(50),
    allowNull: true // "mpesa", "card"
  },
  lastPaymentDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'Subscriptions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_subscriptions_org_status',
      fields: ['organizationId', 'status']
    }
  ]
});
```

#### 4.1.3 Model: `SubscriptionInvoice` (Financial Ledger for SaaS Billing)
Table: `SubscriptionInvoices`  
Scope: Tenant Financial Record (`organizationId`)

```javascript
const SubscriptionInvoice = sequelize.define('SubscriptionInvoice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  invoiceNumber: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true // e.g. "INV-SAAS-ORG5-202609-001"
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  },
  subscriptionId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Subscriptions',
      key: 'id'
    }
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Plans',
      key: 'id'
    }
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'KES'
  },
  billingPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  billingPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  paymentChannel: {
    type: DataTypes.ENUM('mpesa', 'card', 'bank_transfer', 'manual'),
    allowNull: false
  },
  paymentReference: {
    type: DataTypes.STRING(200),
    allowNull: true // Safaricom receipt (e.g. "QK87HJK21") or Flutterwave tx_ref
  },
  gatewayReference: {
    type: DataTypes.STRING(200),
    allowNull: true // Flutterwave transaction ID
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
    allowNull: false,
    defaultValue: 'pending'
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'SubscriptionInvoices',
  timestamps: true,
  indexes: [
    {
      name: 'idx_sub_invoices_org_id',
      fields: ['organizationId']
    },
    {
      name: 'idx_sub_invoices_reference',
      fields: ['paymentReference']
    }
  ]
});
```

---

### 4.2 Migration Strategy (Additive & Greenfield)

1. **Migration 1 (`create-plans-table.js`)**:
   - Creates `Plans` table.
   - Seeds baseline plans: `starter` (KES 1,500), `growth` (KES 3,500), `pro` (KES 7,500).
2. **Migration 2 (`create-subscriptions-table.js`)**:
   - Creates `Subscriptions` table with foreign keys to `Organizations` and `Plans`.
   - Backfills existing organizations:
     - For every existing Organization (IDs 1–6): Create a `Subscription` on `growth` plan with `status = 'active'`, `currentPeriodEnd = NOW() + 1 YEAR` to ensure zero disruption to current merchants.
3. **Migration 3 (`create-subscription-invoices-table.js`)**:
   - Creates `SubscriptionInvoices` table.
4. **Migration 4 (`update-organizations-status-enum.js`)**:
   - Modifies `Organizations.status` to include `'past_due'` and `'trialing'`:
     `ALTER TABLE Organizations MODIFY COLUMN status ENUM('trialing', 'trial', 'active', 'past_due', 'canceled', 'suspended') NOT NULL DEFAULT 'trialing';`

---

### 4.3 API Surface Specification

All billing routes mounted at `/api/billing`:

| Method | Endpoint | Access Control | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/billing/plans` | Public / Authenticated | List all active SaaS subscription plans |
| `GET` | `/api/billing/subscription` | Any Org Member | Get organization's current plan, status, days remaining, and usage limits |
| `POST` | `/api/billing/subscribe/mpesa` | **Owner Only** | Initiate M-Pesa STK push for renewal/upgrade (Body: `{ planCode, phone }`) |
| `POST` | `/api/billing/subscribe/card` | **Owner Only** | Initiate Flutterwave checkout link (Body: `{ planCode }`) |
| `POST` | `/api/billing/mpesa/callback` | **Public Webhook** (Safaricom) | Handle Daraja STK push callback, extend subscription |
| `POST` | `/api/billing/flutterwave/webhook` | **Public Webhook** (Flutterwave) | Handle Flutterwave payment webhook with `verif-hash` |
| `GET` | `/api/billing/invoices` | **Owner / Admin** | List historical subscription invoices and receipts |
| `POST` | `/api/billing/manual-grant` | **Super-Admin Only** | Manually extend subscription for cash/bank payments |

---

### 4.4 Concrete Integration Points for `canUseFeature`

#### Point A: Shop Creation Limit (`shopController.js:createShop`)
In [`backend/src/controllers/shopController.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/shopController.js#L57):
```javascript
// Existing check:
if (!membership || !['owner', 'admin'].includes(membership.orgRole)) {
  return res.status(403).json({ error: 'Only organization owners and admins can create shops.' });
}

// NEW Phase 6 Quota Check (Additive):
const currentShopCount = await Shop.count({ where: { organizationId: orgId, active: true } });
const quotaCheck = await entitlementService.checkQuota(orgId, 'maxShops', currentShopCount);
if (!quotaCheck.allowed) {
  return res.status(403).json({ 
    error: quotaCheck.reason, 
    code: 'UPGRADE_REQUIRED',
    limit: quotaCheck.limit,
    current: quotaCheck.current
  });
}
```

#### Point B: Team Member Limit (`employeeController.js:createEmployee`)
In [`backend/src/controllers/employeeController.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/employeeController.js#L236):
```javascript
// NEW Phase 6 Quota Check (Additive):
const orgId = req.organizationId || req.user.organizationId;
const currentMemberCount = await OrganizationMembership.count({ where: { organizationId: orgId, status: 'active' } });
const quotaCheck = await entitlementService.checkQuota(orgId, 'maxUsers', currentMemberCount);
if (!quotaCheck.allowed) {
  return res.status(403).json({ 
    error: quotaCheck.reason, 
    code: 'UPGRADE_REQUIRED',
    limit: quotaCheck.limit,
    current: quotaCheck.current
  });
}
```

#### Point C: Multi-Branch AI Roll-Up Analytics (`requireOrgAdmin.js`)
In [`backend/src/middleware/requireOrgAdmin.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/middleware/requireOrgAdmin.js#L30):
```javascript
// Existing check verifies orgRole IN ('owner', 'admin') ...

// NEW Phase 6 Entitlement Check (Additive):
const featureCheck = await entitlementService.canUseFeature(targetOrgId, 'org_insights');
if (!featureCheck.allowed) {
  return res.status(403).json({ 
    error: featureCheck.reason, 
    code: 'FEATURE_GATED',
    requiredPlan: 'growth'
  });
}
```

---

## 5. Part 4 — Explicit Non-Scope

The following items are strictly out of scope for Phase 6:
1. **No Frontend UI Work**: Building React modals, checkout redirect views, and billing dashboards is reserved for frontend sprints.
2. **No Complex Proration Mathematics**: Upgrades mid-cycle grant immediate access and extend the period proportionally or charge the difference; complex fractional second proration tables are excluded.
3. **No Annual Discount Schemes / Coupons for Subscriptions**: Fixed monthly and yearly tier prices.
4. **No Automated Bank Standing Orders**: Integrations with automated ACH or banking direct debit protocols are out of scope.
5. **No Changes to Customer Sales Checkout**: Customer M-Pesa and Card payments at the POS checkout remain 100% isolated and unchanged.

---

## 6. Part 5 — Risk Call-Outs & Mitigation Strategy

### 6.1 Risk A: False-Positive Lockout of Paying Merchants
- **Threat**: A paying merchant's network drops during an M-Pesa push, or a webhook is delayed by Safaricom for 10 minutes. The merchant is locked out while standing in front of customers.
- **Mitigation**:
  1. The 7-day Grace Period (`past_due`) ensures that even if a payment fails or is delayed, POS sales checkout is **never halted immediately**.
  2. The manual extension endpoint allows support admins to instantly unblock any merchant.

### 6.2 Risk B: Webhook Replay & Unverified Source Attacks (P0 Lessons)
- **Threat**: An attacker calls `/api/billing/flutterwave/webhook` or `/api/billing/mpesa/callback` with fake payment confirmations to grant free subscriptions.
- **Mitigation**:
  1. **Secret Hash Check**: For Flutterwave, verify `req.headers['verif-hash'] === process.env.FLW_SECRET_HASH`.
  2. **Internal Invoice Verification**: Look up the specific pre-created `SubscriptionInvoice` by `invoiceNumber` or `paymentReference`.
  3. **Idempotency Check**: If invoice is already `paid`, discard without modifying dates.
  4. **Active Verification Query**: For card payments, immediately execute a secondary server-to-server verification request to `https://api.flutterwave.com/v3/transactions/{id}/verify` to verify authenticity directly with the gateway.

### 6.3 Risk C: Orphaned Subscription State Drift
- **Threat**: Organization exists without a Subscription row, or Subscription points to a non-existent Plan.
- **Mitigation**:
  1. Wrapped in `sequelize.transaction` during registration (`authController.js:register`).
  2. Foreign key constraints `ON DELETE RESTRICT` on `planId` and `organizationId`.
  3. Safe fallback in `entitlementService`: If an organization lacks a subscription record, automatically evaluate as `Starter (Trial)`.

---

## 7. Next Steps & Implementation Roadmap

Upon approval of this design document:
1. **Step 1 — Migrations**: Create `Plans`, `Subscriptions`, `SubscriptionInvoices` tables and seed baseline tiers.
2. **Step 2 — Entitlement Engine**: Implement `entitlementService.js` and `requireEntitlement.js` with Redis caching.
3. **Step 3 — Controller Integration**: Wire `checkQuota` into `shopController.js:createShop` and `canUseFeature` into `requireOrgAdmin.js`.
4. **Step 4 — Billing Endpoints & Webhooks**: Implement `billingController.js` and hardened callbacks for M-Pesa STK Push and Flutterwave.
5. **Step 5 — Full Test Verification**: Jest test suite verifying plan enforcement, grace periods, webhook idempotency, and anti-hijacking.
