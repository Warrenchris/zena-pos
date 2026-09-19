# Zana POS — Phase 6B-02 Authentication & Session Invalidation Hardening Walkthrough

## Executive Summary

Phase 6B-02 addresses and remediates vulnerabilities **`AUTH-02` (Password Change Session Invalidation)** and **`AUTH-03` (Password Reset Session Invalidation)**.
Prior to this phase, when a user or employee changed their password via `POST /api/auth/change-password` or completed an email-based password reset via `POST /api/auth/reset-password`, previously issued JWT access tokens remained fully valid for their remaining lifespan (up to 120 minutes). An adversary possessing an exfiltrated access token could continue executing authenticated operations even after the legitimate owner updated their credentials.

Phase 6B-02 introduces immediate, account-level token invalidation using a cutoff timestamp persisted in Redis (with in-memory fallback for process resilience), fully integrated with the `auth` middleware and synchronized with `login` token generation to prevent sub-second race conditions.

---

## 1. Vulnerability

- **AUTH-02 (Password Change Session Invalidation):**
  A user or employee updating their password via `POST /api/auth/change-password` succeeded in updating the password hash in MySQL, but all active access tokens previously issued across browsers, mobile devices, and POS terminals remained valid until their 2-hour JWT expiry.
- **AUTH-03 (Password Reset Session Invalidation):**
  Completing a password reset via `POST /api/auth/reset-password` properly revoked the single-use reset token JTI, but failed to invalidate pre-existing session access tokens belonging to the affected account.

---

## 2. Root Cause

- The system previously tracked token invalidation solely on an individual token basis via JTI blacklisting (`revoked_token:<jti>`), triggered during explicit logout (`POST /api/auth/logout`).
- There was no account-wide revocation mechanism to invalidate all historical tokens issued before a security event (such as a password change or reset) without requiring the server to remember every individual historical JTI.

---

## 3. Existing Authentication Architecture

- **Token Format:** RS256-signed JSON Web Tokens containing claims: `id`, `role`, `shopId`, `organizationId`, `isEmployee`, `jti`, and `iat`.
- **Identity Types:** Two distinct principal models:
  - `User`: Standard user / admin / merchant accounts (integer primary key `id`).
  - `Employee`: Store employees / cashiers (UUID primary key `id`).
- **Middleware Flow:**
  1. `jwt.verify` with RS256 public key.
  2. Reject tokens with `purpose === 'password_reset'` (SEC-03).
  3. Query Redis for individual revoked token JTI (`revoked_token:<jti>`).
  4. Query user/employee active status in Redis/DB (`auth_status:<type>:<id>`).
  5. Query organization subscription status.

---

## 4. Implementation

To satisfy the invariant that all pre-change tokens are immediately invalidated without altering database schemas:
1. **`backend/src/services/tokenRevocationService.js`**:
   - `revokeAllUserTokens(id, isEmployee, cutoff = null)`: Sets a cutoff timestamp (seconds since epoch) in Redis (`revoked_tokens_cutoff:${type}:${id}`) with a 24-hour TTL (matching maximum possible token lifetime) and records it in process memory (`inMemoryCutoffs`).
   - `isUserTokenRevoked(id, isEmployee, iat)`: Checks whether a token's `iat` (issued-at) is `<= cutoff`. If `true`, the token is rejected as revoked.
   - `getUserTokenCutoff(id, isEmployee)`: Returns current cutoff timestamp for synchronization during login.
   - `clearUserTokenCutoff(id, isEmployee)`: Testing and cache cleanup helper.
2. **`backend/src/controllers/authController.js`**:
   - `changePassword`: After verifying current password and saving the new password hash, executes `await tokenRevocationService.revokeAllUserTokens(userId, isEmployee)`.
   - `resetPassword`: Validates reset token purpose, ensures JTI is not used, updates password hash, revokes reset token JTI, and executes `await tokenRevocationService.revokeAllUserTokens(account.id, isEmployee)`.
   - `login`: Retrieves cutoff timestamp and issues new JWT with `iat = Math.max(nowSec, cutoff + 1)`, guaranteeing immediately minted tokens are never rejected by sub-second clock overlap with the cutoff.
3. **`backend/src/middleware/auth.js`**:
   - Step 1b: Evaluates `isUserTokenRevoked(decoded.id, !!decoded.isEmployee, decoded.iat)`. If revoked by cutoff, halts request with `401 Unauthorized`: `'Token has been revoked due to password change. Please log in again.'`.

---

## 5. Token Invalidation Mechanism

The mechanism leverages JWT's standard `iat` (issued-at) claim paired with a centralized cutoff timestamp:
- Any token issued before or at the moment of password change/reset satisfies `token.iat <= cutoff`.
- The authentication middleware checks this condition in O(1) time via Redis GET.
- If true, the request is rejected with `401 Unauthorized`.
- Newly issued tokens created after the event have `token.iat > cutoff` and are accepted normally.

---

## 6. User vs. Employee Behavior

Both security principals are fully supported:
- **Keyspace Partitioning:** Redis keys are separated by principal type:
  - `revoked_tokens_cutoff:user:<id>` (integer ID)
  - `revoked_tokens_cutoff:employee:<id>` (UUID)
- **Password Change:** Both `User` and `Employee` accounts utilize `POST /api/auth/change-password`. `req.user.isEmployee` indicates whether the account is loaded from `User` or `Employee` model.
- **Password Reset:** `POST /api/auth/reset-password` checks `decoded.isEmployee`. If not set, it checks `User` first, then falls back to `Employee`, properly revoking tokens for either principal type.

---

## 7. Password-Change Flow

```text
POST /api/auth/change-password
  ↓
Verify current password with bcrypt
  ↓
Hash and persist new password in database
  ↓
tokenRevocationService.revokeAllUserTokens(userId, isEmployee)
  ↓
Sets Redis key: revoked_tokens_cutoff:<type>:<id> = cutoffSec (TTL: 86400s)
Updates in-memory process fallback cache
  ↓
Return { success: true, message: 'Password updated successfully.' }
  ↓
Subsequent requests using pre-change JWT:
  auth middleware detects iat <= cutoff → 401 Unauthorized
```

---

## 8. Password-Reset Flow

```text
POST /api/auth/reset-password { token, password }
  ↓
Verify RS256 signature and purpose === 'password_reset'
  ↓
Check reset token JTI in Redis (reject 400 if already revoked/used)
  ↓
Locate User or Employee account
  ↓
Hash and persist new password in database
  ↓
Revoke reset token JTI: revoked_token:<jti>
  ↓
tokenRevocationService.revokeAllUserTokens(account.id, isEmployee)
  ↓
Return { message: 'Password updated successfully' }
  ↓
Subsequent requests using pre-reset JWT:
  auth middleware detects iat <= cutoff → 401 Unauthorized
```

---

## 9. Redis Behavior & Failure Recovery

- **Key TTL:** `revoked_tokens_cutoff:<type>:<id>` is set with a 24-hour TTL (`TOMBSTONE_CACHE_TTL = 86400`). Since access tokens expire in 2 hours, 24 hours provides a 12x safety margin.
- **In-Memory Fallback:** `tokenRevocationService` maintains a process-level `inMemoryCutoffs` map. If Redis times out or throws an error:
  - `revokeAllUserTokens` sets the memory cutoff before Redis write.
  - `isUserTokenRevoked` falls back to `inMemoryCutoffs` if Redis is unreachable.
  - The security boundary fails closed (revokes access) rather than failing open.

---

## 10. Database Changes

- **No Schema Changes Required:** Zero database migrations or schema alterations were needed.
- All session invalidation state is stored in high-performance Redis key-value storage with memory fallback, avoiding relational DB overhead on every authenticated request.

---

## 11. Adversarial Tests

Suite: `backend/tests/phase6bAuthSessionSecurity.test.js`

| Test # | Description | Result | Status |
|---|---|---|---|
| **Test 1** | Password change invalidates current token (login → request → change → reuse → 401) | 401 Unauthorized | **PASS** |
| **Test 2** | Password change invalidates multiple concurrent sessions (JWT-A, JWT-B, JWT-C) | All tokens 401 | **PASS** |
| **Test 3** | New login works after password change (old pass rejected 401, new pass accepted 200) | Old: 401, New: 200 | **PASS** |
| **Test 4** | Password reset invalidates old access token (login → old JWT → reset → reuse → 401) | 401 Unauthorized | **PASS** |
| **Test 5** | New password works after reset (login succeeds → new JWT works) | 200 OK | **PASS** |
| **Test 6** | Reset token remains single-use (replay rejected with 400) | 400 Bad Request | **PASS** |
| **Test 7** | Token-purpose enforcement regression (reset token rejected as session token with 401) | 401 Unauthorized | **PASS** |
| **Test 8** | Employee session invalidation (employee login → change password → old JWT rejected → new login works) | Old: 401, New: 200 | **PASS** |
| **Test 9** | Revocation failure behavior (in-memory fallback enforces revocation when Redis throws error) | 401 Unauthorized | **PASS** |
| **Test 10** | Unaffected authentication behavior (valid credentials 200, invalid credentials 401) | 200 / 401 verified | **PASS** |
| **Phase 7** | Concurrency & Linearizability (subsequent requests using pre-change credentials strictly rejected) | 401 Unauthorized | **PASS** |

---

## 12. Regression Results

All historical test suites passed with 100% success rate:

| Test Suite | Tests Passed | Tests Failed |
|---|---:|---:|
| `tests/phase6bAuthSessionSecurity.test.js` (Phase 6B-02) | 11 | 0 |
| `tests/phase6bPaymentSecurity.test.js` (Phase 6B-01 FIN-01) | 12 | 0 |
| `tests/phase6aReleaseBlockers.test.js` (Phase 6A) | 13 | 0 |
| `tests/phase5SubscriptionLifecycle.test.js` (Phase 5) | 28 | 0 |
| `tests/billingEndpoints.test.js` | 10 | 0 |
| `tests/billingRenewal.test.js` | 14 | 0 |
| `tests/subphase6c.test.js` | 6 | 0 |
| `tests/phase4ProductInventorySecurity.test.js` (Phase 4) | 12 | 0 |
| `tests/phase4TransferIdempotency.test.js` (Phase 4) | 6 | 0 |
| `tests/phase3UserTenantSecurity.test.js` (Phase 3) | 16 | 0 |
| `tests/phase1.test.js` (Phase 1) | 8 | 0 |
| `tests/phase2.test.js` (Phase 2) | 20 | 0 |
| `tests/mpesaSecurity.test.js` | 5 | 0 |
| `tests/item1-token-purpose.test.js` | 3 | 0 |
| **TOTAL** | **164** | **0** |

---

## 13. Migration Status

- Verified via `npx sequelize-cli db:migrate:status`:
  - Total historical migrations: 88 migrations UP.
  - New migrations created: 0.
  - Schema alterations: None.

---

## 14. Remaining Risks

- In multi-process horizontal deployments without Redis clustering, process memory fallback is local to the instance that handled the password change. Redis is the primary cross-instance synchronization bus; Redis cluster high availability ensures complete multi-instance consistency.

---

## 15. Exact Phase 6B-03 Boundary

Phase 6B-02 is complete.
The next planned scope is **Phase 6B-03 (`POS-01` POS Idempotency & Concurrency Hardening)**.
**NO CODE CHANGES OR WORK FOR PHASE 6B-03 HAVE BEEN STARTED.**
Execution stops here pending human authorization.
