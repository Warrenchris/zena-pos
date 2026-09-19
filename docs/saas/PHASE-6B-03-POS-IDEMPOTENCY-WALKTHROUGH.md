# Zana POS — Phase 6B-03 Technical Walkthrough & Verification Report

**Phase Focus**: POS Resilience & Client Idempotency (`POS-01`)  
**Scope**: Client-generated idempotency keys (`Idempotency-Key`), server-side idempotency enforcement, canonical SHA-256 payload fingerprinting, concurrent race-condition absorption, and exactly-once financial/inventory guarantees across retries.  
**Date**: September 19, 2026  
**Status**: COMPLETE & VERIFIED  

---

## 1. Executive Summary

During Phase 6B-03, we addressed finding **`POS-01`**: POS transactions in volatile network environments were vulnerable to double-charging and duplicate stock deduction when client retries or network timeouts occurred.

To resolve this without breaking backward compatibility or altering the existing database schema, we engineered an end-to-end idempotency pipeline across both the backend Express/Sequelize API and the frontend POS cashier dashboard:
- **Client Key Generation & Lifecycle**: POS clients generate an RFC 4122 v4 UUID (`sale_${Date.now()}_${randomUUID()}`) as the idempotency key upon sale initialization or payment modal open. This key is persisted in the local component/transaction state across network timeouts, dropped connections, and UI retries.
- **HTTP Header Protocol**: Keys are transmitted via standard `Idempotency-Key` headers (with body-key fallback for legacy clients).
- **Canonical Request Fingerprinting**: The server computes a deterministic SHA-256 hash over canonicalized cart items, payments, total amounts, customer IDs, and payment methods. Replaying the same key with identical parameters returns the existing sale transparently (200/201). Reusing the key with a mutated payload immediately halts execution and returns HTTP `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`).
- **Concurrent Race-Condition Resolution**: Handled using MySQL composite unique indexing on `('shopId', 'idempotencyKey')`. Concurrent requests contending on the same key catch the `SequelizeUniqueConstraintError`, fetch the committed sale produced by the winning thread, verify payload hashes match, and return the sale without duplicate mutations.
- **Verification**: 20/20 dedicated automated tests passed, 184/184 full-system backend tests passed (15/15 test suites), and the frontend compiled cleanly with 0 TypeScript/build errors.

---

## 2. Finding Addressed & Security / Correctness Impact

### Finding POS-01 Description
In typical retail environments across African SME markets, unstable mobile networks, Wi-Fi drops, and payment gateway timeouts frequently lead cashiers to click "Complete Sale" multiple times or allow automatic retry mechanisms to fire.

### Impact Before Mitigation:
1. **Duplicate Financial Records**: Multiple `Sale` records and multiple `SalePayment` entries created for a single customer transaction.
2. **Double/Triple Inventory Decrements**: Products were deducted from inventory multiple times, causing artificial phantom stockouts and breaking inventory counts.
3. **Double Ledger / Audit Logs**: Erroneous financial reporting in daily cashier reconciliations and tax audits.
4. **Adversarial Exploitation**: Malicious actors could replay intercepted sale creation payloads to cause state corruption.

### Impact After Mitigation:
- **Exactly-Once Guarantee**: Inventory deduction, stock movement recording, payment logging, and invoice generation occur strictly once per logical sale.
- **Transparent Recovery**: Retried requests return the original sale object, invoice number, and payment receipts without re-running transactions.
- **Tamper Protection**: Reusing an idempotency key with modified prices, quantities, or line items is rejected with `409 Conflict`.

---

## 3. Architecture & Protocol Design

```
+-----------------------------------------------------------------------------------+
|                              FRONTEND POS CLIENT                                  |
|                                                                                   |
|  1. Cashier initiates checkout -> Generates `idempotencyKey = sale_uuidv4()`      |
|  2. Sends POST /api/sales with Header: `Idempotency-Key: <key>`                   |
|  3. Network timeout or error? -> Re-uses the EXACT SAME key on retry              |
+------------------------------------------+----------------------------------------+
                                           |
                                           v
+-----------------------------------------------------------------------------------+
|                               BACKEND SALE PIPELINE                               |
|                                                                                   |
|  1. Extract & normalize key (validate string, trim, enforce max 64 chars)          |
|  2. Compute canonical SHA-256 requestHash from items, total, customer, etc.       |
|                                                                                   |
|  3. PRE-TRANSACTION CHECK:                                                        |
|     SELECT * FROM Sales WHERE shopId = :shopId AND idempotencyKey = :key          |
|     +-> FOUND:                                                                    |
|     |   +-> requestHash MATCHES  -> Return cached sale (HTTP 200/201, 0 mutations)|
|     |   +-> requestHash DIFFERS  -> Return HTTP 409 Conflict (KEY_REUSED)         |
|     |                                                                             |
|     +-> NOT FOUND:                                                                |
|         Begin DB Transaction                                                      |
|         - Deduct inventory & create StockMovement                                 |
|         - Insert Sale (idempotencyKey, metadata: { requestHash })                 |
|         - Insert SaleItems & SalePayments                                         |
|         Commit DB Transaction                                                     |
|                                                                                   |
|  4. CONCURRENCY CATCH (Duplicate Key Race on Commit):                             |
|     Catch SequelizeUniqueConstraintError                                          |
|     Fetch winning sale -> Validate requestHash -> Return winner (0 double mutate) |
+-----------------------------------------------------------------------------------+
```

---

## 4. Key Normalization & Payload Fingerprinting

Defined in [`backend/src/utils/idempotencyUtils.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/utils/idempotencyUtils.js):

### 4.1 Normalization Logic
- **Header Priority**: `req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey`.
- **Type Validation**: Non-string values (e.g. `{}` or `12345`) in request body throw HTTP `400 Bad Request`.
- **Trimming & Length**: Trims whitespace; empty strings become `null` (preserving backward compatibility for legacy clients); limits length to 64 characters to match DB schema.

### 4.2 Canonical SHA-256 Request Fingerprinting
`generateSaleFingerprint(saleData, shopId)`:
```javascript
const canonicalPayload = {
  shopId: Number(shopId) || null,
  customerId: saleData.customerId || null,
  totalAmount: Number(Number(saleData.totalAmount || 0).toFixed(2)),
  paymentMethod: String(saleData.paymentMethod || '').toLowerCase(),
  items: (saleData.items || []).map(i => ({
    productId: i.productId,
    quantity: Number(i.quantity),
    unitPrice: Number(Number(i.unitPrice || i.price || 0).toFixed(2)),
    discount: Number(Number(i.discount || 0).toFixed(2)),
    discountType: i.discountType || 'none',
    discountValue: Number(Number(i.discountValue || 0).toFixed(2))
  })).sort((a, b) => String(a.productId).localeCompare(String(b.productId))),
  payments: (saleData.payments || []).map(p => ({
    paymentMethod: String(p.paymentMethod || '').toLowerCase(),
    amount: Number(Number(p.amount || 0).toFixed(2))
  })).sort((a, b) => String(a.paymentMethod).localeCompare(String(b.paymentMethod)))
};

return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
```

---

## 5. Server-Side Idempotency Workflow

Implemented across:
- Standard Sales: [`backend/src/controllers/saleController.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/controllers/saleController.js) (`createSaleInternal`)
- Split Payment Sales: [`backend/src/services/EnhancedSaleService.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/backend/src/services/EnhancedSaleService.js) (`createSplitSale`)

### 5.1 Pre-Transaction Fast Path
Before acquiring database row locks or opening transactions:
```javascript
if (idempotencyKey) {
  const existingSale = await fetchCompleteSaleByIdempotencyKey(shopId, idempotencyKey);
  if (existingSale) {
    const existingHash = existingSale.metadata?.requestHash;
    if (existingHash && existingHash !== requestHash) {
      const err = new Error('The idempotency key was already used with a different request.');
      err.statusCode = 409;
      err.code = 'IDEMPOTENCY_KEY_REUSED';
      throw err;
    }
    return { sale: existingSale, isIdempotentReplay: true };
  }
}
```

### 5.2 Storage of Fingerprint
When persisting the sale, `requestHash` is securely placed in `sale.metadata.requestHash` (persisted in MySQL JSON column without modifying table schema).

---

## 6. Concurrency & Race Condition Resolution

When multiple identical requests arrive at the same millisecond:
1. Thread A and Thread B both pass the pre-transaction check.
2. Thread A inserts `Sale` and commits first.
3. Thread B encounters `SequelizeUniqueConstraintError` / `ER_DUP_ENTRY` on composite index `unique_sales_shop_idempotency_key`.
4. Thread B rolls back its transaction (reverting any staged inventory decrements).
5. Thread B's error handler calls `isIdempotencyUniqueError(err)`:
   - Fetches the committed sale created by Thread A.
   - Verifies `requestHash`.
   - Returns Thread A's sale with HTTP 200/201.
   - Result: Exactly 1 sale created, exactly 1 inventory deduction.

---

## 7. Inventory & Financial Invariants Enforced

| Invariant | Mechanism | Verification Status |
|---|---|---|
| **Inventory Decrement** | Decremented strictly inside atomic transaction; concurrent thread rollback prevents double decrement | Verified (Test 5 & 6) |
| **StockMovements** | Exactly 1 `StockMovement` row per line item | Verified (Test 7) |
| **SalePayment** | Exactly 1 `SalePayment` per tender | Verified (Test 8) |
| **Invoice Number** | Original unique `invoiceNumber` retained across all retries | Verified (Test 9) |
| **Tenant Isolation** | Scoped by `shopId` (`unique_sales_shop_idempotency_key`); identical keys across Org A vs Org B or Shop 1 vs Shop 2 do not collide | Verified (Test 11 & 12) |
| **Payload Integrity** | Replaying same key with modified total or items rejected with 409 | Verified (Test 4 & 18) |

---

## 8. Frontend POS Idempotency Lifecycle & Retry Integration

### 8.1 State Management & Key Lifecycle
- [`frontend/src/pages/CashierDashboard.jsx`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/pages/CashierDashboard.jsx):
  - In `handleDirectPayment`: checks `currentSale.idempotencyKey`. If not yet assigned, generates `sale_${Date.now()}_${uuidv4()}` and stores it on `currentSale`.
  - When retrying due to network failure, the key remains unchanged.
  - Upon sale completion or cart clearance, a new key is generated for the next customer.
- [`frontend/src/components/PaymentModal.jsx`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/components/PaymentModal.jsx):
  - Supports split payments and multiple tenders.
  - Reuses `currentSale.idempotencyKey` across split payment retries.

### 8.2 Client API Integration
- [`frontend/src/services/cashierAPI.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/services/cashierAPI.js): Updated `createSale(saleData, idempotencyKey)` to inject `Idempotency-Key: idempotencyKey` into Axios request headers.
- [`frontend/src/services/api.js`](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/frontend/src/services/api.js): Updated `salesAPI.create(saleData, idempotencyKey)` to pass `Idempotency-Key` header.

---

## 9. Database Schema & Migration Assessment

- **Existing Index**: Composite unique index `unique_sales_shop_idempotency_key` on `('shopId', 'idempotencyKey')` was confirmed present in MySQL (`SHOW INDEX FROM sales`).
- **NULL Key Semantics**: MySQL unique indexes allow multiple `NULL` values. Legacy requests omitting idempotency keys insert `idempotencyKey = NULL` without constraint collisions.
- **Metadata JSON**: Request hash is stored in existing `metadata` JSON column.
- **Migration Count**: **0 new migrations created**. All 88 historical migrations remain in `up` status.

---

## 10. Test Strategy & Verification Results

### Dedicated Test Suite: `backend/tests/phase6bPosIdempotency.test.js`
All 20 tests passed:
1. `POS-01.1`: Create sale with valid idempotency key succeeds
2. `POS-01.2`: Sequential duplicate request with same key returns original sale
3. `POS-01.3`: Same key + same payload returns identical sale id, total, and invoiceNumber
4. `POS-01.4`: Same key + different payload is rejected with 409 Conflict (IDEMPOTENCY_KEY_REUSED)
5. `POS-01.5`: Concurrent duplicate requests produce exactly 1 sale and exactly 1 inventory deduction
6. `POS-01.6`: Inventory is decremented exactly once under retries
7. `POS-01.7`: StockMovement is created exactly once for line items
8. `POS-01.8`: SalePayment is created exactly once
9. `POS-01.9`: Unique invoiceNumber is preserved across retries
10. `POS-01.10`: Retry after simulated client timeout returns original sale
11. `POS-01.11`: Cross-tenant isolation — identical key in different organizations succeeds independently
12. `POS-01.12`: Cross-shop isolation — identical key in different shops within same org succeeds independently
13. `POS-01.13`: Request without idempotency key succeeds without deduplication (backward compatible)
14. `POS-01.14`: Malformed idempotency key (non-string in body) is rejected with 400 Bad Request
15. `POS-01.15`: Empty/whitespace idempotency key is treated as omitted/null
16. `POS-01.16`: Key whitespace is trimmed and header key takes precedence over body key
17. `POS-01.17`: Transaction rollback on downstream failure does not leave orphan idempotency record
18. `POS-01.18`: Concurrent requests with same key but different payloads (one succeeds, other gets 409)
19. `POS-01.19`: Multiple independent sales with distinct keys succeed without interference
20. `POS-01.20`: Phase 6B-01 card payment integration idempotency works seamlessly

---

## 11. Full Regression Matrix

| Test Suite | Tests | Result | Focus |
|---|---|---|---|
| `phase6bPosIdempotency.test.js` | 20 | PASS (100%) | Phase 6B-03 POS Idempotency (POS-01) |
| `phase6bAuthSessionSecurity.test.js` | 11 | PASS (100%) | Phase 6B-02 Auth Session Invalidation (AUTH-02, AUTH-03) |
| `phase6bPaymentSecurity.test.js` | 12 | PASS (100%) | Phase 6B-01 Payment Security (FIN-01) |
| `phase6aReleaseBlockers.test.js` | 13 | PASS (100%) | Phase 6A Multi-Tenant Scoping |
| `phase5SubscriptionLifecycle.test.js` | 28 | PASS (100%) | Phase 5 Billing & Subscriptions |
| `billingEndpoints.test.js` | 10 | PASS (100%) | Billing API Endpoints |
| `billingRenewal.test.js` | 14 | PASS (100%) | Billing Scheduler & Invoicing |
| `subphase6c.test.js` | 6 | PASS (100%) | RBAC & Security Perimeter |
| `phase4ProductInventorySecurity.test.js` | 12 | PASS (100%) | Product & Inventory Security |
| `phase4TransferIdempotency.test.js` | 6 | PASS (100%) | Inventory Stock Transfers |
| `phase3UserTenantSecurity.test.js` | 16 | PASS (100%) | User & Tenant Isolation |
| `phase1.test.js` | 8 | PASS (100%) | Core POS Basics |
| `phase2.test.js` | 20 | PASS (100%) | Store & Organization Models |
| `mpesaSecurity.test.js` | 5 | PASS (100%) | M-Pesa Callback Security |
| `item1-token-purpose.test.js` | 3 | PASS (100%) | Token Purpose Separation |
| **Total Backend Verification** | **184** | **PASS (100%)** | **Zero Failures Across 15 Suites** |
| **Frontend Production Build** | **tsc + vite** | **PASS (100%)** | **0 Errors (38.5s build)** |
| **Database Migrations** | **88 / 88 UP** | **PASS (100%)** | **0 Pending, 0 Schema Drift** |

---

## 12. Files Modified & Created

### Created:
1. `backend/src/utils/idempotencyUtils.js` — Key normalization, SHA-256 fingerprinting, unique error discrimination.
2. `backend/tests/phase6bPosIdempotency.test.js` — 20 dedicated integration and concurrency tests.
3. `docs/saas/PHASE-6B-03-POS-IDEMPOTENCY-WALKTHROUGH.md` — This comprehensive documentation.

### Modified:
1. `backend/src/controllers/saleController.js` — Key extraction, pre-transaction duplicate resolution, fingerprint storage, and concurrency race collision handling.
2. `backend/src/services/EnhancedSaleService.js` — Split-sale idempotency key handling, fingerprinting, and concurrent race resolution.
3. `frontend/src/services/cashierAPI.js` — `Idempotency-Key` header transmission.
4. `frontend/src/services/api.js` — `Idempotency-Key` header forwarding in `salesAPI.create`.
5. `frontend/src/pages/CashierDashboard.jsx` — POS idempotency key lifecycle, retry persistence, and checkout integration.
6. `frontend/src/components/PaymentModal.jsx` — Modal retry idempotency key persistence.

---

## 13. Edge Cases Handled

1. **Non-String Idempotency Key**: If a client passes `{}` or an array in the request body, it is rejected immediately with HTTP 400 Bad Request.
2. **Whitespace / Empty String Key**: Treated as omitted/null, preventing accidental collision on empty strings while maintaining backward compatibility.
3. **Payload Mismatch on Replay**: Reusing an existing key with altered items, prices, or quantities fails fast with HTTP 409 Conflict (`IDEMPOTENCY_KEY_REUSED`), blocking replay attacks.
4. **Header vs Body Precedence**: If both are present, the HTTP `Idempotency-Key` header takes precedence.
5. **Cross-Tenant Key Coincidence**: Two different shops or organizations generating the exact same UUID will not collide because the unique index and queries are scoped by `shopId`.
6. **Failed Downstream Transactions**: If inventory validation fails or payment processing aborts mid-transaction, Sequelize transaction rollback ensures no partial sale or orphan idempotency record remains.
7. **Zero-Downtime Migration**: Utilizes the pre-existing schema and index; zero migration risk or downtime.

---

## 14. Operational Readiness & Residual Risks

- **Production Readiness**: High. POS idempotency eliminates cashier double-charging during peak retail hours and degraded internet connectivity.
- **Rollback Safety**: Since no schema changes were introduced, rolling back code would leave the database completely intact and operational.
- **Residual Risks**: Clients that do not upgrade to send `Idempotency-Key` continue to operate under legacy semantics without duplicate protection. Adoption across all native mobile/desktop POS clients should be tracked.
