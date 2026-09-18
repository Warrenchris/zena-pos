# Zana POS — Phase 6B-01 Payment & Financial Adversarial Hardening Walkthrough

## Executive Summary

Phase 6B-01 resolves vulnerability **`FIN-01` (P0: Financial Integrity)** in the card verification and settlement workflow (`POST /api/card/verify`). Previously, external gateway callbacks or verification calls were accepted solely upon `verificationResult.verified === true`, leaving the application vulnerable to underpayment fraud, currency mismatches, cross-tenant payment reference hijacking, and concurrent settlement replay.

With Phase 6B-01, the card payment verification subsystem is hardened with deterministic monetary comparisons, strict currency validation, pre-gateway tenant/shop boundary checks, pessimistic row locking (`t.LOCK.UPDATE`), and comprehensive idempotency controls.

---

## 1. Vulnerability & Root Cause Analysis

### Original Vulnerability (`FIN-01`)
In `backend/src/routes/cardRoutes.js`, when a client requested verification for a card payment via `POST /api/card/verify`:
1. The endpoint invoked `cardPaymentService.verifyPayment(reference)` against Flutterwave.
2. If `verificationResult.verified === true`, the endpoint proceeded immediately to finalize the sale via `saleController.createSaleInternal(...)` and marked `PendingPayment` as `confirmed`.
3. The endpoint did not verify whether `verificationResult.amount` matched `PendingPayment.amount`, or whether `verificationResult.currency` matched the expected currency of the sale or organization.
4. An adversary could initiate a KES 100,000 order, pay KES 10 on Flutterwave, and verify the transaction; the system would create a completed sale, decrement inventory, and issue an invoice for KES 100,000.
5. In addition, tenant isolation checks were deferred until after gateway verification, allowing external verification attempts on payments belonging to other organizations or shops.

### Root Cause
- Implicit trust in boolean gateway status (`verified === true`) without validating payment parameters against local state.
- Absence of exact integer minor-unit (cents) comparison logic, risking IEEE-754 floating-point inaccuracies.
- Deferred tenant boundary validation.

---

## 2. Affected Files

1. **`backend/src/routes/cardRoutes.js`**
   - Implemented `parseCents(amount)` for deterministic monetary conversion.
   - Added tenant and shop pre-validation before external gateway verification.
   - Added fast-path idempotency check for already confirmed payments.
   - Enforced exact amount validation under pessimistic database row lock (`t.LOCK.UPDATE`).
   - Enforced exact currency validation against `saleData.currency` and `Organization.currency`.
   - Persisted explicit `status: 'failed'` records with structured audit metadata on failure.
   - Added `idempotencyKey` to sale data for multi-layer settlement protection.

2. **`backend/tests/phase6bPaymentSecurity.test.js`**
   - Created dedicated adversarial test suite covering all 12 required security test cases.

---

## 3. Security Model & Architecture

```
Client Request
      │
      ▼
POST /api/card/verify
      │
      ▼
[Pre-Gateway Validation]
  ├─ Authenticate JWT & Resolve Caller Tenant (Org & Shop)
  ├─ Lookup PendingPayment by clean reference
  ├─ Tenant Boundary Check: Caller Org == PendingPayment Org? (403 if mismatch)
  ├─ Shop Boundary Check: Caller Shop == PendingPayment Shop? (403 if mismatch)
  ├─ Fast-Path Idempotency: status == 'confirmed'? (Return 200 immediately)
  └─ Terminal State Check: status == 'failed'? (Return 400 immediately)
      │
      ▼
[External Gateway Verification]
  └─ Call Flutterwave API (verify_by_reference) outside database transaction
      │
      ▼
[Pessimistic Row-Locked DB Settlement]
  └─ BEGIN TRANSACTION (t)
       ├─ SELECT PendingPayment FOR UPDATE (exclusive row lock)
       ├─ Concurrency Check: Was payment settled while awaiting lock? (Exit idempotently)
       ├─ Gateway Success Check: verificationResult.verified === true?
       ├─ Monetary Validation: parseCents(lockedPending.amount) === parseCents(gateway.amount)?
       │    └─ If mismatch: UPDATE status = 'failed', record AMOUNT_MISMATCH, COMMIT, Return 400
       ├─ Currency Validation: expectedCurrency === gatewayCurrency?
       │    └─ If mismatch: UPDATE status = 'failed', record CURRENCY_MISMATCH, COMMIT, Return 400
       ├─ Atomic Sale Creation & Inventory Decrement: createSaleInternal(..., t)
       └─ UPDATE PendingPayment status = 'confirmed', COMMIT
      │
      ▼
Response (200 OK / 400 Bad Request)
```

---

## 4. Implementation Details

### A. Deterministic Monetary Validation (`parseCents`)
To prevent floating-point comparison errors (e.g. `0.1 + 0.2 !== 0.3`), all amounts (strings, numbers, decimals) are parsed into exact `BigInt` minor units (cents):
```javascript
function parseCents(amount) {
  if (amount === undefined || amount === null || amount === '') return null;
  let str;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount < 0) return null;
    str = amount.toFixed(2);
  } else {
    str = String(amount).trim();
  }
  if (!/^\d+(\.\d{1,2})?$/.test(str)) return null;
  const [intPart, fracPart = ''] = str.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(paddedFrac);
}
```
Equivalent values such as `1000`, `1000.00`, and `"1000.00"` resolve to `100000n` cents. Malformed, negative, or NaN values return `null` and are rejected.

### B. Currency Validation
Currency is resolved hierarchically from authoritative sources:
1. `PendingPayment.saleData.currency`
2. `Shop.Organization.currency`
3. Fallback: `'KES'`

If `gatewayCurrency.toUpperCase() !== expectedCurrency.toUpperCase()`, the payment is rejected, logged with `[FIN-01 SECURITY ALERT]`, and marked `failed`.

### C. Tenant & Shop Isolation
- Pre-validation ensures that `req.organizationId === PendingPayment.Shop.organizationId` and `req.shopId === PendingPayment.shopId`.
- Cross-tenant requests return `403 Forbidden` without contacting the external gateway, preventing information leakage and oracle attacks.

### D. Concurrency & Idempotency
1. **Pre-gateway fast path:** If `PendingPayment.status === 'confirmed'`, return 200 OK without contacting the gateway or acquiring locks.
2. **Pessimistic lock:** In the settlement transaction, `PendingPayment` is queried with `lock: t.LOCK.UPDATE`. If another concurrent thread settled the payment while this thread was waiting, the state transition is detected and the request returns 200 OK idempotently.
3. **Sale idempotency key:** `saleData.idempotencyKey = cleanRef` is passed to `createSaleInternal`, ensuring the underlying sales table cannot create duplicate records.

---

## 5. Adversarial Verification Proof Matrix

The dedicated test suite `backend/tests/phase6bPaymentSecurity.test.js` verified the following 12 attack vectors:

| Test # | Attack / Scenario | Expected Behavior | Actual Result | Status |
|---|---|---|---|---|
| **Test 1** | Valid payment (1,000 KES expected, 1,000 KES verified) | 200 OK, sale created, inventory decremented, payment confirmed | 200 OK, sale created, inventory decremented (50 -> 49) | **PASS** |
| **Test 2** | Underpayment (100,000 KES expected vs 10 KES verified) | 400 Bad Request, rejected, no sale, no inventory decrement, status=failed | 400 Bad Request, rejected, no sale, stock=50, status=failed | **PASS** |
| **Test 3** | Overpayment (1,000 KES expected vs 1,100 KES verified) | 400 Bad Request, rejected, no sale, no inventory decrement, status=failed | 400 Bad Request, rejected, no sale, stock=50, status=failed | **PASS** |
| **Test 4** | Currency mismatch (1,000 KES expected vs 1,000 USD verified) | 400 Bad Request, rejected, no sale, no inventory decrement, status=failed | 400 Bad Request, rejected, no sale, stock=50, status=failed | **PASS** |
| **Test 5** | Forged verification (`verified = false` from gateway) | 400 Bad Request, rejected, no sale, no inventory decrement, status=failed | 400 Bad Request, rejected, no sale, stock=50, status=failed | **PASS** |
| **Test 6** | Wrong/non-existent payment reference | 404 Not Found, gateway never called | 404 Not Found, gateway never called | **PASS** |
| **Test 7** | Cross-tenant verification (User B verifies Org A payment) | 403 Forbidden, gateway never called, Org A state untouched | 403 Forbidden, gateway never called, status=pending | **PASS** |
| **Test 8** | Sequential Replay (same valid reference submitted twice) | 1st: 200 settled; 2nd: 200 already verified. Exactly 1 sale, 1 stock mutation | Exactly 1 sale created, stock mutated exactly once (50 -> 49) | **PASS** |
| **Test 9** | Concurrent verification (`Promise.all` simultaneous verify) | Exactly 1 settlement, exactly 1 sale, exactly 1 inventory mutation | Exactly 1 sale created, stock mutated exactly once (50 -> 49) | **PASS** |
| **Test 10** | Already-settled payment verification | 200 OK (already verified), gateway never called, no double settlement | 200 OK, gateway not called, stock unchanged | **PASS** |
| **Test 11** | Amount formatting (`1000`, `1000.00`, `"1000.00"`, `"250.50"` vs `250.5`) | All equivalent representations accepted without precision loss | All equivalent representations accepted with exact cents match | **PASS** |
| **Test 12** | Decimal precision (`1000.10`, `1000.01`, `999.99`, 1 cent diff rejected) | Decimal values match exactly; 1 cent under/over rejected | Exact cents match succeeds; 1 cent discrepancy rejected | **PASS** |

---

## 6. Regression Verification Results

All existing test suites across the entire application were executed in the test environment:

| Test Suite | Total Tests | Passed | Failed | Duration |
|---|---|---|---|---|
| `phase6bPaymentSecurity.test.js` (Targeted) | 12 | 12 | 0 | 17.2s |
| `phase6aReleaseBlockers.test.js` | 13 | 13 | 0 | 26.6s |
| `phase2.test.js` | 20 | 20 | 0 | 9.5s |
| `phase1.test.js` | 1 | 1 | 0 | 1.8s |
| `phase3UserTenantSecurity.test.js` | 17 | 17 | 0 | 14.5s |
| `phase4ProductInventorySecurity.test.js` | 16 | 16 | 0 | 18.2s |
| `phase4TransferIdempotency.test.js` | 8 | 8 | 0 | 12.1s |
| `billingEndpoints.test.js` | 19 | 19 | 0 | 11.4s |
| `billingRenewal.test.js` | 16 | 16 | 0 | 8.2s |
| `phase5SubscriptionLifecycle.test.js` | 17 | 17 | 0 | 6.5s |
| `mpesaSecurity.test.js` | 5 | 5 | 0 | 11.0s |
| **TOTAL** | **144** | **144** | **0** | — |

- **Frontend TypeScript check & production build:** `tsc && vite build` completed with **0 errors** (built in 57.82s).
- **Database migration status:** All migrations verified up to date (`up` status across all 78 historical migrations). No schema migration was required.

---

## 7. Remaining Risks & Phase Boundary

- **Remaining Hardening Items:** Sub-phases 6B-02 through 6B-06 (AUTH-02, AUTH-03, POS-01, VULN-02, ORAC-01, INDX-01, AI-01, RATE-01, OBS-01, MIGR-01, AI-02) remain untouched and await separate human authorization.
- **Card Webhook Synchronization:** Phase 6B-01 hardens the active client verification endpoint (`POST /api/card/verify`). When implementing webhook callbacks for asynchronous card completion, the same `parseCents` and currency invariants must be applied.
