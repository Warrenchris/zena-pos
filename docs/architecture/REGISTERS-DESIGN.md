# Zana POS — Registers & Till Management Architecture Design
**Document Version**: 1.0.0  
**Phase**: FINDING-12 (Phase 5: Registers & Cash Drawer Management per Target Architecture)  
**Status**: DESIGN & AUDIT PROPOSAL (Read-Only Architectural Pass — Zero Code, Model, Route, or Migration Mutations)  
**Target File**: `docs/architecture/REGISTERS-DESIGN.md`  

---

## 1. Executive Summary & Context

Phases 1 through 4 of FINDING-12 established the platform's multi-tenant SaaS architecture:
1. **Phase 1**: `Organization` tenant root entity, `Shop.organizationId`, two-tier RBAC (`OrganizationMembership` governance vs `ShopAccess` branch delegation), and multi-shop switching.
2. **Phase 2**: Master data consolidation (`Customer` and `Supplier` scoped to `Organization`).
3. **Phase 3**: Catalog vs Operational Stock decoupling (`Product` catalog org-scoped; `Inventory` shop-scoped stock ledger).
4. **Phase 4**: Additive organization-wide AI roll-up analytics and forecasting.

Per [`SAAS-TARGET-ARCHITECTURE.md`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/docs/architecture/SAAS-TARGET-ARCHITECTURE.md#L48), physical Shops (Branches) own location-specific operational entities:
- Physical Inventory & Stock Movements (Phase 3)
- POS Sales, POS Sale Items, Sale Payments
- **Cashier Registers & Till Sessions (Phase 5)**
- Purchases & Purchase Orders

Unlike prior phases that migrated, split, or aggregated pre-existing database tables, **Phase 5 is 100% greenfield**. There is no existing Register or Till entity in the codebase. This design document establishes what "Registers" means for Zena POS, audits the current codebase to verify that no overlapping or conflicting concepts exist, defines a minimal and non-breaking scope tailored to Kenyan SME retail realities, and provides a frank assessment of implementation priorities.

---

## 2. Part 1 — Current State Audit (Read-Only)

### 2.1 Keyword Sweep Across Codebase & Schema
An exhaustive search for concepts resembling registers, cash drawers, tills, shifts, and cash reconciliation was conducted across all backend models, controllers, routes, migrations, and frontend source files:

| Search Term | Hits Found | Actual Function / Purpose |
| :--- | :--- | :--- |
| `till` | 0 | No tables, models, columns, or methods exist in backend or frontend. |
| `drawer` | 17 | All 17 hits in code are **UI layout slide-over panels** (e.g. `HeldCartsDrawer` in `CashierDashboard.jsx`, `InvoiceDetailDrawer` in `Invoices.jsx`). The only occurrences of "cash drawer" are forward-looking architectural placeholders in Phase 1-4 design docs. |
| `cashup` / `cash_up` | 0 | Zero references anywhere in the repository. |
| `shift` | 19 | Exclusively refers to: (a) timezone hour shifting in `analyticsController.js`, (b) Pandas `.shift()` in `ai_service/financial_models.py`, (c) JavaScript `Array.prototype.unshift`, or (d) keyboard navigation `Shift+Tab`. |
| `reconcil*` | 12 | Refers to: (a) inventory stock adjustment reason (`StockAdjustment.jsx: "Audit Discrepancy Reconciliation"`), (b) database migration drift reconciliation comments, or (c) forward-looking comments in Phase 5 roadmap notes. |
| `register` | 12 | Exclusively refers to: (a) user merchant onboarding (`/api/auth/register`), (b) customer registration (`"sale was for a registered customer"` in `saleController.js`), or (c) duplicate customer checks (`"Email already registered"` in `customerController.js`). |

### 2.2 Audit of `SalePayment` and `PendingPayment`
We audited how cash payments are currently handled:
- [`backend/src/models/SalePayment.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/SalePayment.js):
  - Records individual payment transactions against a `Sale` (`saleId`, `amount`, `paymentMethod`, `status`, `processedBy`, `shopId`).
  - Supports split payments (e.g., KES 500 Cash + KES 1,000 M-Pesa).
  - `paymentMethod` is a free-form string or enum (`'cash'`, `'mpesa'`, `'card'`).
- [`backend/src/models/PendingPayment.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/PendingPayment.js):
  - Strictly dedicated to asynchronous online/mobile checkout callbacks (`paymentChannel: ENUM('mpesa', 'card')` with `checkoutRequestId`). Does not handle cash.
- **Current Operational Cash Handling**:
  - Cash collected on a sale is recorded as a static transaction attribute: `Sale.paymentMethod = 'cash'`, `Sale.paymentAmount`, and `Sale.change`.
  - There is **no concept of physical cash on hand**, no opening float, no petty cash payout tracking from the drawer, and no end-of-day drawer counting.
  - In [`reportsController.js:181-240`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/reportsController.js#L181-L240), payment breakdown simply executes `SUM(total) GROUP BY paymentMethod`.

### 2.3 Audit of Employee & User Shift/Session Tracking
- Audited [`backend/src/models/Employee.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/Employee.js) and [`backend/src/models/User.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/User.js):
  - `Employee` records HR metadata: `firstName`, `lastName`, `email`, `phone`, `position`, `status`, `hireDate`, `salary`, `shopId`.
  - There are **zero attendance, timesheet, clock-in/clock-out, or shift tables** in the database.
  - Although the repository `README.md` mentions *"Shift tracking, commission calculation"*, [`reportsController.js:240`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/reportsController.js#L240) explicitly states: `topEmployees: [], // We'll add this feature later`.
  - Cashier statistics in [`saleController.js:699-770`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/saleController.js#L699-L770) (`getCashierStats`) simply aggregates sales by calendar date ranges (`createdAt BETWEEN start AND end` where `userId` or `employeeId` matches). It has no awareness of when a cashier physically logged in or out of a station.

### 2.4 Audit of ActivityLog
- Audited [`backend/src/models/ActivityLog.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/models/ActivityLog.js) and all `logActivity` call sites:
  - Event types currently logged: `Sale` create, update, refund, cancel; `Purchase` create, pay, cancel; `PurchaseOrder` create, approve, receive; `Product` create, update, stock adjustment; and `Shop` create.
  - Zero cash-handling, till open, till close, float entry, or cash count events exist in the audit log.

### 2.5 Audit of Frontend POS (`CashierDashboard.jsx`)
- Audited [`frontend/src/pages/CashierDashboard.jsx`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/CashierDashboard.jsx) (2,241 lines) and [`frontend/src/services/cashierAPI.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/services/cashierAPI.js):
  - When a cashier logs in, they are immediately placed into the POS cart interface (`salesMode: 'idle' | 'product-selection' | 'payment'`).
  - There is no modal or prompt to "Open Shift" or "Enter Opening Float".
  - The cashier rings up sales, prints receipts, or holds carts indefinitely.
  - There is no "Close Register" or "End Shift Reconciliation" screen.

### 2.6 Audit Verdict
> [!IMPORTANT]
> **VERDICT: Zena POS is currently 100% a "register-less" system.**  
> Cash payments are tracked purely as accounting metadata on sales. There is zero existing shift, drawer, or till infrastructure. Phase 5 is **completely greenfield**. There are no legacy tables to migrate, no schemas to deprecate, and no half-built register features to clean up.

---

## 3. Part 2 — Scope Definition & Architectural Recommendations

Building register management for Kenyan SMEs (dukas, pharmacies, agro-dealers, cafes, and mini-marts) requires balancing financial accountability against operational simplicity.

### 3.1 Recommendation 1: Core Entity Mental Model
**Decision: Two-Tier Entity Model (`Register` + `RegisterSession`)**
- `Register`: Represents the **physical point-of-sale terminal/cash drawer** at a branch (e.g. "Counter 1", "Till 1", "Express Till").
  - Scope: Strictly `shopId`-scoped (operational, branch-level).
  - Attributes: `name`, `code`, `shopId`, `status: ('active', 'inactive')`.
- `RegisterSession`: Represents a **finite operational shift/drawer cycle**.
  - Scope: Linked to a `Register` (`registerId`) and `Shop` (`shopId`).
  - Tracks: `openedAt`, `closedAt`, `openedBy`, `closedBy`, `openingFloat`, `expectedCash`, `actualCash`, `difference`, `status: ('open', 'closed')`.

**Rationale over a flat "CashSession" tied directly to Shop**:
While most small Kenyan dukas operate a single drawer, Zena POS's target multi-tenant SaaS architecture explicitly caters to multi-branch SMEs (e.g. a merchant with a flagship supermarket in Westlands having 3 checkout lanes and a smaller satellite shop in Kilimani with 1 till). A single-tier `CashSession` on `Shop` would prevent two cashiers from working distinct physical drawers simultaneously at the same branch.
For single-till merchants, the system auto-provisions a default "Main Register" upon shop creation, requiring zero configuration.

### 3.2 Recommendation 2: Shift / Session Lifecycle
**Decision: Minimal Two-State Lifecycle (`open` → `closed`)**

```
┌─────────────────────────────────────────────────────────────┐
│                       REGISTER CLOSED                       │
│                   (No active cash drawer)                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
               POST /api/registers/:id/open
               - Provide openingFloat (e.g. KES 3,000)
               - Validates no active open session on this till
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        SESSION OPEN                         │
│ - Cashier rings up sales & refunds                          │
│ - Real-time tracking of cash in drawer                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
               POST /api/registers/:id/close
               - Provide actualCash (physical cash counted)
               - System computes expectedCash & discrepancy
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       SESSION CLOSED                        │
│ - Reconciled snapshot permanently sealed                    │
│ - Difference recorded (overage / shortage)                  │
└─────────────────────────────────────────────────────────────┘
```

**Why NOT a 3-state machine (`open` → `closed` → `reconciled`)?**
In enterprise ERPs (e.g. SAP), a cashier "closes" a till and sends the bag to a back-office vault where an accountant performs a separate "reconciliation" step hours later. In Kenyan SME retail, the cashier and manager/owner count the drawer together at close of business. Having a separate un-reconciled limbo state adds unnecessary API surface and workflow friction. The close action *is* the reconciliation. If an overage or shortage occurs, it is permanently recorded alongside optional explanatory notes.

### 3.3 Recommendation 3: Relationship to Sales
**Decision: Strictly Additive & Non-Gating (Non-Blocking)**

> [!CAUTION]
> **CRITICAL ARCHITECTURAL BOUNDARY**: Creating a Sale must NEVER require an open `RegisterSession`.

1. **Why Mandatory Register Gating Fails**:
   - Forcing an open register session before ringing up a sale would immediately break:
     - All existing POS tests in `tests/` (`phase1.test.js`, `phase3.test.js`, `multiShopFlow.test.js`, etc.).
     - Existing offline checkout queues (`usePendingSales.js`).
     - Non-physical sales channels (online orders, WhatsApp/phone deliveries, mobile app sales).
     - Single-owner merchants who do not want the overhead of counting an opening float every morning.
2. **Implementation Strategy**:
   - `Sale` receives a nullable foreign key `registerSessionId` (`allowNull: true`, default `null`).
   - If an active register session is open for the current shop/cashier, `saleController.createSale` optionally tags `sale.registerSessionId = activeSession.id`.
   - If no register session is open, or if the merchant does not use register management, the sale proceeds without interruption.
   - Financial aggregation for a session's expected cash uses a dual query:
     - Primary: Sales explicitly linked via `sale.registerSessionId = session.id`.
     - Fallback / Audit: Cash sales created within `[session.openedAt, session.closedAt || NOW()]` for that `shopId` and cashier.

### 3.4 Recommendation 4: Employee & User Identity Attribution
- Zena POS has two distinct user models: global platform `Users` (owners, admins) and shop-scoped `Employees` (cashiers, managers).
- Following the pattern established in Phase 1 (`OrganizationMembership`) and Phase 2 (`ActivityLog`):
  - `RegisterSession` stores:
    - `openedByUserId: INTEGER (nullable)`
    - `openedByEmployeeId: UUID (nullable)`
    - `closedByUserId: INTEGER (nullable)`
    - `closedByEmployeeId: UUID (nullable)`
- **Role Permissions**:
  - Register Configuration (`POST /api/registers`, `PUT /api/registers/:id`): Restricted to Shop/Org `admin` or `manager`.
  - Shift Operations (`open`, `close`, `view current`): Accessible to any active staff (`cashier`, `manager`, `admin`, `owner`) with valid access to that `shopId`.

### 3.5 Recommendation 5: What Zena Explicitly Should NOT Build
To avoid bloat and enterprise over-engineering, the following are strictly excluded from Phase 5:
1. **No Hardware Drivers / ESC-POS Drawer Kick**: No USB/serial/Ethernet ESC/POS printer drawer kick pulse triggers (`ESC p m t1 t2`).
2. **No Multi-Currency Cash Drawers**: Register floats and cash counts are strictly denominated in the organization/shop base currency (`KES`).
3. **No Mid-Session Cashier Handovers**: If Cashier A leaves for lunch and Cashier B takes over, Cashier A closes the session, and Cashier B opens a new session. No complex "handover pending approval" state machine.
4. **No Denomination Breakdown Tables**: No required inputs for "15x KES 1,000 notes, 8x KES 500 notes". Just a single numeric `actualCash` total (with optional break-out in a JSON `metadata` field).
5. **No Integration with Bank Vault Drops / CIT Carriers**: Beyond basic cash tracking, external banking integration is out of scope.

---

## 4. Part 3 — Technical Design Proposal

### 4.1 Proposed Database Models

#### 4.1.1 Model: `Register` (Physical Station)
Table Name: `Registers`  
Scope: Operational (`shopId`)

```javascript
const Register = sequelize.define('Register', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false // e.g. "Till 1", "Counter A", "Express"
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: true // Optional short code e.g. "T-01"
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
    allowNull: false,
    defaultValue: 'active'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'Registers',
  timestamps: true,
  indexes: [
    {
      name: 'idx_registers_shop_id',
      fields: ['shopId']
    },
    {
      name: 'unique_shop_register_name',
      unique: true,
      fields: ['shopId', 'name']
    }
  ]
});
```

#### 4.1.2 Model: `RegisterSession` (Shift Cycle & Reconciliation)
Table Name: `RegisterSessions`  
Scope: Operational (`shopId`, `registerId`)

```javascript
const RegisterSession = sequelize.define('RegisterSession', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  registerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Registers',
      key: 'id'
    }
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  // Who opened the shift
  openedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Users', key: 'id' }
  },
  openedByEmployeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'Employees', key: 'id' }
  },
  // Who closed the shift
  closedByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Users', key: 'id' }
  },
  closedByEmployeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'Employees', key: 'id' }
  },
  // Financial Reconciliation
  openingFloat: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  cashSalesTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  cashRefundsTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  expectedCash: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true // Calculated at close: openingFloat + cashSalesTotal - cashRefundsTotal
  },
  actualCash: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true // Physical cash counted by cashier at close
  },
  difference: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true // actualCash - expectedCash (negative = short, positive = over)
  },
  status: {
    type: DataTypes.ENUM('open', 'closed'),
    allowNull: false,
    defaultValue: 'open'
  },
  openedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true // e.g. "Shortage of 150 KES due to unrecorded milk expense"
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true // Optional denomination count: { "1000": 5, "500": 4 }
  }
}, {
  tableName: 'RegisterSessions',
  timestamps: true,
  indexes: [
    {
      name: 'idx_reg_sessions_register_status',
      fields: ['registerId', 'status']
    },
    {
      name: 'idx_reg_sessions_shop_openedAt',
      fields: ['shopId', 'openedAt']
    }
  ]
});
```

#### 4.1.3 Model Enhancement: `Sale` (Additive Foreign Key)
Add a single nullable column to `Sales`:
```javascript
registerSessionId: {
  type: DataTypes.UUID,
  allowNull: true,
  defaultValue: null,
  references: {
    model: 'RegisterSessions',
    key: 'id'
  }
}
```

---

### 4.2 Reconciliation Calculation Algorithm

When a session is closed (`POST /api/registers/:id/close`), the backend executes the following atomic calculation:

$$\text{Cash Sales} = \sum \text{SalePayment.amount} \quad \text{where } \begin{cases} \text{paymentMethod} = \text{'cash'} \\ \text{status} = \text{'completed'} \\ \text{saleId IN (Sales tagged with registerSessionId OR within session time window)} \end{cases}$$

$$\text{Cash Refunds} = \sum \text{SaleRefund.amount} \quad \text{where } \begin{cases} \text{status} = \text{'processed'} \\ \text{refundMethod} = \text{'cash'} \\ \text{processed within session window} \end{cases}$$

$$\text{Expected Cash} = \text{openingFloat} + \text{Cash Sales} - \text{Cash Refunds}$$

$$\text{Difference} = \text{actualCash} - \text{expectedCash}$$

- **Result Interpretation**:
  - $\text{Difference} = 0$: Balanced drawer.
  - $\text{Difference} < 0$: Cash shortage (drawer is missing cash).
  - $\text{Difference} > 0$: Cash overage (excess unrecorded cash in drawer).

---

### 4.3 Migration Strategy (100% Greenfield)

Unlike Phase 2 (which had to safely backfill 6 tables and migrate 2 unique constraints) or Phase 3 (which split 3 tables and created `Inventories`), Phase 5 is simple:
1. **Migration 1**: Create `Registers` table.
2. **Migration 2**: Create `RegisterSessions` table.
3. **Migration 3**: Add nullable `registerSessionId` column to `Sales` table with index.
4. **Data Backfill**:
   - Zero existing registers to migrate.
   - Optional: Seed one default `Register` (`name: 'Main Till'`, `shopId: shop.id`) for each active shop so merchants immediately have a register ready without manual setup.

---

### 4.4 API Surface Specification

All endpoints are mounted at `/api/registers` and protected by `auth` middleware (scoped to `req.user.shopId` or authenticated `x-shop-id`):

| Method | Endpoint | Description | Access Control |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/registers` | List all physical registers for the current shop | Any shop staff |
| `POST` | `/api/registers` | Create a new physical register at the branch | `admin`, `manager`, org `owner` |
| `GET` | `/api/registers/:id` | Get details of a specific register | Any shop staff |
| `PUT` | `/api/registers/:id` | Update register name or status | `admin`, `manager`, org `owner` |
| `GET` | `/api/registers/:id/current-session` | Get active open session on this register (if any) | Any shop staff |
| `POST` | `/api/registers/:id/open` | Open a new session (body: `{ openingFloat, notes }`) | Any shop staff |
| `POST` | `/api/registers/:id/close` | Close & reconcile session (body: `{ actualCash, notes }`) | Any shop staff |
| `GET` | `/api/registers/:id/sessions` | Paginated shift history for this register | Any shop staff |
| `GET` | `/api/registers/sessions/:sessionId` | Detailed session summary (cash sales, refunds, over/short) | Any shop staff |

---

### 4.5 Interaction With Existing Subsystems

1. **Activity Log Integration**:
   - Opening a register emits:
     ```javascript
     await logActivity({
       shopId: req.user.shopId,
       performedBy: req.user.id,
       performedByType: req.user.isEmployee ? 'Employee' : 'User',
       action: 'open_shift',
       entity: 'RegisterSession',
       entityId: session.id,
       details: `Till "${register.name}" opened with float KES ${openingFloat}`
     });
     ```
   - Closing a register emits:
     ```javascript
     await logActivity({
       shopId: req.user.shopId,
       performedBy: req.user.id,
       performedByType: req.user.isEmployee ? 'Employee' : 'User',
       action: 'close_shift',
       entity: 'RegisterSession',
       entityId: session.id,
       details: `Till "${register.name}" closed. Counted KES ${actualCash}, Expected KES ${expectedCash}, Diff KES ${difference}`
     });
     ```
2. **StockMovement & Inventory**:
   - Zero interaction. Register management deals purely with physical cash reconciliation, not product quantities.
3. **Reports & Analytics**:
   - Existing accounting reports (`getSalesSummary`, `getProfitAndLoss`) remain 100% untouched.
   - Future enhancement: Session reconciliation reports can be queried additively by accountants without disturbing daily sales reporting.

---

## 5. Part 4 — Explicit Non-Scope

To guarantee stability and avoid feature creep:
1. **No Hardware Integration**: No ESC/POS printer drawer kicks, RJ11/12 serial triggers, or cash counter machines.
2. **No Frontend Code**: Phase 5 design and implementation is strictly backend API and data model.
3. **No Checkout Pipeline Mutation**: `saleController.js:createSale` core logic (cart pricing, stock deduction, tax, discounts, receipt generation) remains unaltered. Linking `registerSessionId` is purely observational and optional.
4. **No Multi-Currency Drawer Support**: One currency per shop (`KES`).
5. **No Gating of Other Endpoints**: Held carts, refunds, and discounts do not require active till sessions.
6. **No SaaS Subscription / Billing (Phase 6)**: Tills are not restricted by subscription quotas in Phase 5.

---

## 6. Part 5 — Risk Call-Outs & Pragmatic Value Assessment

### 6.1 Architectural Risk Assessment
1. **Speculative Need vs. Real Usage Pattern**:
   - *Audit Fact*: In the real production database (`zana_pos`), every active merchant is a 1-to-2 employee business with modest transaction volume. None of them currently use shift tracking.
   - *Risk*: If register management is designed as a rigid, mandatory prerequisite for POS sales, it would alienate small merchants who prefer frictionless checkout.
   - *Mitigation*: Our design makes registers **strictly opt-in and additive**. A merchant who does not care about till floats can ignore `/api/registers` completely and continue ringing up sales.

2. **Concurrency / Unclosed Session Drift**:
   - *Risk*: A cashier forgets to close their register on Friday evening, goes home, and a different cashier logs in on Saturday morning.
   - *Mitigation*: If a register already has an active session, attempting `POST /api/registers/:id/open` returns `409 Conflict: Register already has an active session`. The incoming cashier or manager can inspect the open session, close it with the counted cash, and immediately open a fresh session.

### 6.2 Honest Value Assessment: Is Phase 5 High-Value Right Now?

> [!NOTE]
> **Architectural Assessment: Nice-to-Have Operational Feature vs. Commercial Blocker**
>
> 1. **Commercial Value**:
>    - Phase 5 does **not** advance Zena POS toward commercial multi-tenant SaaS monetization.
>    - The true commercial blocker for the platform is **Phase 6 (Billing, Subscriptions, Entitlements, Plan Quotas, & M-Pesa Recurring Billing)**. Phase 6 is what turns Zena POS into a revenue-generating SaaS product.
> 2. **Operational Value**:
>    - For single-duka merchants, Phase 5 adds minimal value (they count their own cash in their pocket).
>    - For multi-employee branches (e.g. 2 cashiers in a minimart), cash reconciliation is a genuine anti-theft safeguard.
> 3. **Strategic Recommendation**:
>    - Because Phase 5 is completely greenfield and additive (zero legacy migrations, zero risk of breaking existing sales), it is technically trivial to build (2 small tables, 1 migration, ~8 standard CRUD endpoints).
>    - **However**, if the engineering objective is to complete the multi-tenant SaaS transformation, **Phase 6 (Billing & Subscriptions) is far higher leverage** than Phase 5. Register management could reasonably be deferred until after the billing and subscription engine is in place.

---

## 7. Next Steps & Approvals

This document represents the complete, conservative architectural design for Phase 5.  
Awaiting user decision on:
1. **Approve Phase 5 as specified**: Proceed with the lightweight, additive `Register` + `RegisterSession` implementation.
2. **OR Deprioritize Phase 5**: Skip Phase 5 for now and proceed directly to designing Phase 6 (SaaS Subscriptions & Billing Engine).
