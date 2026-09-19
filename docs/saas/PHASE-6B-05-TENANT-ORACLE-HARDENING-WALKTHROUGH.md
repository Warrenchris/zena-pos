# PHASE 6B-05: TENANT ISOLATION & CROSS-TENANT ID-ORACLE NORMALIZATION WALKTHROUGH

## 1. Executive Summary

Phase 6B-05 was implemented as part of the Zana POS production hardening program under requirement **ORAC-01 (Cross-Tenant ID-Oracle Normalization)**.

In multi-tenant SaaS environments, resource endpoints must never leak whether a queried identifier exists in another shop or organization. Prior to this phase, certain endpoints returned `404 Not Found` when a resource did not exist in the database, but returned `403 Forbidden` (e.g., `'Access denied: cross-shop refund'`) when the resource existed but belonged to another tenant or branch. This discrepancy created an **ID oracle**, enabling malicious actors to enumerate valid resource IDs across foreign tenants.

### Key Deliverables & Outcomes
- **`ORAC-01` Remediation**: Eliminated cross-tenant existence oracles in `saleController.processRefund`, `invoiceController.generatePDF`, and `routes/sales.js (GET /:id)`.
- **Database-Level Query Scoping**: Migrated from the vulnerable "fetch by primary key then inspect tenant ownership" pattern to direct SQL-level scoping (`where: { id, shopId }`).
- **Uniform Error Invariants**: Non-existent vs. unauthorized cross-tenant/cross-shop queries now yield identical HTTP status codes (`404 Not Found`) and indistinguishable error response payloads (`{ error: '...' }`).
- **RBAC Preservation**: Legitimate role-based access denials (e.g., non-staff customer roles requesting staff-only endpoints) continue to return `403 Forbidden` (`{ error: 'Access denied.' }`).
- **Dedicated Test Suite**: Implemented `backend/tests/phase6bTenantOracleSecurity.test.js` containing 14 adversarial tests verifying oracle elimination, payload uniformity, and RBAC integrity.
- **Regression Verification**: **17/17 test suites passing**, **215/215 tests passing (100%)** (all 201 prior baseline tests maintained + 14 new security tests).
- **Frontend Build Verification**: `npm run build` (`tsc && vite build`) passing with 0 errors (2583 modules).
- **Database Schema**: 90 UP / 0 pending migrations; no unnecessary schema migrations introduced.

---

## 2. Root Cause Analysis: ID-Oracle Vulnerabilities

| Vulnerability ID | File & Endpoint | Previous Behavior (Oracle Leak) | Security Risk |
|---|---|---|---|
| **ORAC-01-A** | `saleController.js`<br>`POST /api/sales/:saleId/refund` | Looked up `Sale.findOne({ where: { id: saleId } })`.<br>• If missing: `404 { error: 'Sale not found' }`<br>• If in another shop: `403 { error: 'Access denied: cross-shop refund' }` | Attacker can scan integer IDs `1..N` to map out all sales across all competitor shops in the SaaS platform. |
| **ORAC-01-B** | `invoiceController.js`<br>`GET /api/invoices/:id/pdf` | Looked up `Invoice.findByPk(req.params.id)`.<br>• If missing: `404 { error: 'Invoice not found' }`<br>• If in another shop: `403 { error: 'Access denied' }` | Enumerates invoice IDs and reveals exact transaction density across other organizations. |
| **ORAC-01-C** | `routes/sales.js`<br>`GET /api/sales/:id` | Inline middleware checked cashier/employee access via `Sale.findOne({ where: { id, shopId } })`.<br>• If missing or in another shop: `403 { error: 'Access denied to this sale' }`<br>Meanwhile, admins received `404 { error: 'Sale not found' }` from `getSaleById`. | Role-inconsistent status codes leaked existence signals and returned misleading 403s on non-existent IDs. |

---

## 3. Implementation Details

### A. Sale Refund Scoping (`backend/src/controllers/saleController.js`)
Refactored `processRefund` to query directly with `shopId`:
```javascript
// Before:
const sale = await Sale.findOne({ where: { id: saleId } });
if (!sale) return res.status(404).json({ error: 'Sale not found' });
if (sale.shopId !== shopId) return res.status(403).json({ error: 'Access denied: cross-shop refund' });

// After:
const sale = await Sale.findOne({ where: { id: saleId, shopId } });
if (!sale) {
  return res.status(404).json({ error: 'Sale not found' });
}
```
**Outcome**: If the sale does not exist, or exists in another shop, the database query returns `null`. Both cases return HTTP `404` with `{ error: 'Sale not found' }`. Zero existence information is leaked.

### B. Invoice PDF Scoping (`backend/src/controllers/invoiceController.js`)
Replaced `findByPk` with tenant-scoped `findOne`:
```javascript
// Before:
const invoice = await Invoice.findByPk(req.params.id);
if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
if (req.user?.role !== 'super_admin' && invoice.shopId !== req.user.shopId) {
  return res.status(403).json({ error: 'Access denied' });
}

// After:
const where = req.user?.role === 'super_admin' 
  ? { id: req.params.id } 
  : { id: req.params.id, ...shopWhere(req) };
const invoice = await Invoice.findOne({ where });

if (!invoice) {
  return res.status(404).json({ error: 'Invoice not found' });
}
```
**Outcome**: Cross-shop invoice requests yield HTTP `404` with `{ error: 'Invoice not found' }`, identical to non-existent invoice queries, while preserving super-admin cross-shop generation capabilities.

### C. Single Sale Lookup Route (`backend/src/routes/sales.js`)
Replaced inline middleware with standard `checkRole`:
```javascript
// Before:
router.get('/:id',
  async (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'manager') return next();
    if (req.user.role === 'cashier' || req.user.role === 'employee') {
      const sale = await Sale.findOne({ where: { id: req.params.id, shopId: req.user.shopId } });
      if (sale) return next();
      return res.status(403).json({ error: 'Access denied to this sale' });
    }
    return res.status(403).json({ error: 'Access denied' });
  },
  saleController.getSaleById
);

// After:
router.get('/:id',
  checkRole(['admin', 'manager', 'cashier', 'employee']),
  saleController.getSaleById
);
```
**Outcome**:
- Authorized roles (`admin`, `manager`, `cashier`, `employee`) proceed to `saleController.getSaleById`, which queries `where: { id: req.params.id, shopId }`. If not found or cross-shop, it uniformly returns `404 { error: 'Sale not found' }`.
- Unauthorized roles (e.g. `customer` or non-staff) are rejected at the route level with `403 { error: 'Access denied.' }` regardless of whether the sale exists or not, preserving RBAC boundaries.

---

## 4. Verification & Testing

### Dedicated Test Suite: `backend/tests/phase6bTenantOracleSecurity.test.js`
The test suite executes against live MySQL & Redis test environments and covers:
1. **Sale Refund Oracle Tests**:
   - `1.1`: Non-existent sale refund returns 404 `{ error: 'Sale not found' }`
   - `1.2`: Cross-shop/cross-tenant sale refund returns 404 `{ error: 'Sale not found' }`
   - `1.3`: Non-existent vs. cross-shop refund responses have identical status codes and payload structures
   - `1.4`: Same-shop refund passes ownership validation and returns 200 with refund records
2. **Invoice PDF Oracle Tests**:
   - `2.1`: Non-existent invoice PDF returns 404 `{ error: 'Invoice not found' }`
   - `2.2`: Cross-shop/cross-tenant invoice PDF returns 404 `{ error: 'Invoice not found' }`
   - `2.3`: Non-existent vs. cross-shop invoice PDF responses have identical status codes and error bodies
   - `2.4`: Same-shop invoice PDF succeeds with `application/pdf` Content-Type
   - `2.5`: Super-admin can generate invoice PDF across shops
3. **Sale Single Lookup Oracle Tests**:
   - `3.1`: Non-existent sale returns 404 for admin, manager, and cashier
   - `3.2`: Cross-shop sale returns 404 for admin, manager, and cashier
   - `3.3`: Same-shop sale returns 200 for admin, manager, and cashier
   - `3.4`: Unauthorized role (`customer`) gets 403 `Access denied.` (RBAC preservation)
4. **Metadata & Leakage Tests**:
   - `4.1`: Cross-tenant requests leak zero internal tenant/shop metadata (IDs, names, or cross-shop error hints)

### Complete Backend Regression Run
Command:
```bash
npx jest tests/phase6bTenantOracleSecurity.test.js tests/phase6bDatabaseOptimization.test.js tests/phase6bPosIdempotency.test.js tests/phase6bAuthSessionSecurity.test.js tests/phase6bPaymentSecurity.test.js tests/phase6aReleaseBlockers.test.js tests/phase5SubscriptionLifecycle.test.js tests/billingEndpoints.test.js tests/billingRenewal.test.js tests/subphase6c.test.js tests/phase4ProductInventorySecurity.test.js tests/phase4TransferIdempotency.test.js tests/phase3UserTenantSecurity.test.js tests/phase1.test.js tests/phase2.test.js tests/mpesaSecurity.test.js tests/item1-token-purpose.test.js --runInBand --forceExit
```
**Results**:
- **Test Suites**: **17 passed, 17 total (100%)**
- **Tests**: **215 passed, 215 total (100%)**
- **Snapshots**: 0 total
- **Pass Rate**: 100%

### Frontend Build Verification
Command:
```bash
cd frontend && npm run build
```
**Results**:
- `tsc && vite build`: **PASS** (0 TypeScript errors, 2583 modules transformed).

---

## 5. Summary of Files Changed

| File Path | Description of Change |
|---|---|
| `backend/src/controllers/saleController.js` | Direct `{ id: saleId, shopId }` scoping in `processRefund` and `getSaleById`. |
| `backend/src/controllers/invoiceController.js` | Direct `{ id: req.params.id, ...shopWhere(req) }` scoping in `generatePDF`. |
| `backend/src/routes/sales.js` | Applied `checkRole(['admin', 'manager', 'cashier', 'employee'])` to `GET /:id` route. |
| `backend/tests/phase6bTenantOracleSecurity.test.js` | Dedicated 14-test verification suite for Phase 6B-05 ORAC-01. |
| `docs/saas/PHASE-6B-05-TENANT-ORACLE-HARDENING-WALKTHROUGH.md` | Comprehensive walkthrough and verification record. |

---

## 6. Phase Status

- **Phase 6B-01 (FIN-01)**: CLOSED & VERIFIED
- **Phase 6B-02 (AUTH-02, AUTH-03)**: CLOSED & VERIFIED
- **Phase 6B-03 (POS-01)**: CLOSED & VERIFIED
- **Phase 6B-04 (INDX-01..04, DUP-01..04, PAGE-01..02, MIGR-01)**: CLOSED & VERIFIED
- **Phase 6B-05 (ORAC-01)**: **COMPLETE & VERIFIED**
- **Phase 6B-06 (AI / Rate Limiting / Observability)**: Awaiting authorization
