# Zana POS — Phase 6B-02 Authentication & Session Invalidation Hardening Walkthrough

## Executive Summary

Phase 6B-02 resolves vulnerabilities **`AUTH-02` (P1: Password change does not invalidate active sessions)** and **`AUTH-03` (P1: Password reset does not invalidate existing active sessions)** in Zana POS authentication infrastructure. Previously, when a user or employee changed their password via `POST /api/auth/change-password` or completed a password reset via `POST /api/auth/reset-password`, existing active JWT sessions issued prior to the credential update remained fully functional for up to 120 minutes. An adversary holding an exfiltrated session token could maintain unauthorized access despite credential changes.

With Phase 6B-02, the authentication subsystem enforces account-wide session invalidation via cutoff timestamps persisted in Redis with fallback caching, integrated into the `auth` middleware, and synchronized with `login` to prevent token generation race conditions.

---

## 1. Vulnerability & Root Cause Analysis

### Original Vulnerabilities (`AUTH-02` & `AUTH-03`)
1. **`AUTH-02` (`authController.changePassword`):**
   - When an authenticated user or employee successfully called `/api/auth/change-password`, the password hash was updated in the database, but no session revocation call was dispatched.
   - Any compromised or previously active session tokens across devices (mobile, POS terminal, desktop) retained privileged access until standard JWT expiration (2 hours).
2. **`AUTH-03` (`authController.resetPassword`):**
   - When resetting a password via `/api/auth/reset-password`, the endpoint only revoked the single reset token JTI (`decoded.jti`).
   - Any prior active session tokens created before the password reset remained valid for API calls.
   - An attacker holding an exfiltrated session token could continue making API calls even after an account owner completed a secure password recovery.

### Root Cause
- Session revocation was scoped only to individual token JTIs (`revoked_token:<jti>`) during explicit logout.
- Lack of account-level token cutoff enforcement based on issued-at (`iat`) timestamp relative to password modification events.

---

## 2. Affected Files

1. **`backend/src/services/tokenRevocationService.js`**
   - Implemented `revokeAllUserTokens(id, isEmployee, cutoff)`: sets 24-hour cutoff timestamp in Redis (`revoked_tokens_cutoff:${type}:${id}`) and local in-memory fallback.
   - Implemented `isUserTokenRevoked(id, isEmployee, iat)`: verifies whether a token's `iat` is `<= cutoff`.
   - Implemented `getUserTokenCutoff(id, isEmployee)`: retrieves current cutoff for synchronization.
   - Implemented `clearUserTokenCutoff(id, isEmployee)`: testing and cache purge helper.

2. **`backend/src/controllers/authController.js`**
   - Updated `changePassword`: triggers `await tokenRevocationService.revokeAllUserTokens(userId, isEmployee)` upon successful password update.
   - Updated `resetPassword`: triggers `await tokenRevocationService.revokeAllUserTokens(account.id, isEmployee)` upon reset, supporting both Users and Employees.
   - Updated `login`: retrieves cutoff and enforces `iat = Math.max(nowSec, cutoff + 1)` in token payload, eliminating sub-second race conditions on immediate post-change logins.

3. **`backend/src/middleware/auth.js`**
   - Added Step 1b: evaluates `isUserTokenRevoked(decoded.id, !!decoded.isEmployee, decoded.iat)` immediately after JTI check.
   - Returns `401 Unauthorized` with `'Token has been revoked due to password change. Please log in again.'` if token was issued prior to or at the cutoff.

4. **`backend/tests/phase6bAuthSecurity.test.js`**
   - Dedicated adversarial security test suite covering all scenarios across users, employees, multi-session revocation, immediate login, and account isolation.

---

## 3. Security Architecture & Token Lifecycle

```
[Password Change / Reset Event]
               │
               ▼
   Hash & Save New Password in DB
               │
               ▼
  Set Account Cutoff in Redis & Cache
  Key: revoked_tokens_cutoff:user:<id>
  TTL: 86400s (24h), Value: cutoffSec
               │
               ▼
       Return Success (200)

───────────────────────────────────────────────────

[Subsequent Request with Old Token (iat <= cutoff)]
               │
               ▼
       POST /api/* (with Bearer Token)
               │
               ▼
       [auth Middleware]
        ├─ Verify RS256 signature
        ├─ Reject purpose === 'password_reset'
        ├─ Check JTI in Redis blacklist
        ├─ Check iat <= cutoff? ──► YES ──► 401 Unauthorized
        │                                  (Token has been revoked)
        └─ If valid, continue to route handler

───────────────────────────────────────────────────

[Immediate Login with New Password]
               │
               ▼
       POST /api/auth/login
               │
               ▼
       Verify new password credentials
        ├─ Query account cutoff from Redis
        ├─ Set iat = Math.max(nowSec, cutoff + 1)
        ├─ Sign new JWT with RS256
        └─ Return token (200 OK) ──► Valid for all subsequent calls
```

---

## 4. Adversarial Verification Matrix

The dedicated test suite `backend/tests/phase6bAuthSecurity.test.js` verified the following attack scenarios:

| Test # | Attack / Scenario | Expected Behavior | Actual Result | Status |
|---|---|---|---|---|
| **Test 1** | User changes password; old token replayed | 401 Unauthorized, rejected with revocation error | 401 Unauthorized, error: token revoked | **PASS** |
| **Test 2** | Employee changes password; old token replayed | 401 Unauthorized, rejected with revocation error | 401 Unauthorized, error: token revoked | **PASS** |
| **Test 3** | Concurrent sessions on multiple devices (phone + desktop); password changed on phone | All active sessions on all devices immediately rejected | Device 1 & Device 2 tokens both rejected with 401 | **PASS** |
| **Test 4** | Immediate login with new credentials post-change | Old password returns 401; new password returns 200 with valid working token | Old password rejected (401); new token succeeds (200) | **PASS** |
| **Test 5** | Password reset via email token; exfiltrated session token replayed | Session created prior to reset rejected with 401; new login works | Pre-reset session rejected with 401; login succeeds (200) | **PASS** |
| **Test 6** | Replay of password reset token | 400 Bad Request, reset token cannot be used twice | 400 Bad Request, error: token already used/revoked | **PASS** |
| **Test 7** | Account isolation: User A changes password | User A sessions revoked; User B sessions completely unaffected | User A token rejected (401); User B token remains 200 OK | **PASS** |

---

## 5. Regression Verification Results

The entire testing matrix across Phase 1 through Phase 6B was executed in the test environment:

| Test Suite | Total Tests | Passed | Failed | Duration |
|---|---|---|---|---|
| `phase6bAuthSecurity.test.js` (Targeted Sub-Phase 6B-02) | 7 | 7 | 0 | 25.0s |
| `item1-token-purpose.test.js` | 3 | 3 | 0 | 7.6s |
| `phase6bPaymentSecurity.test.js` (Sub-Phase 6B-01 FIN-01) | 12 | 12 | 0 | 16.1s |
| `mpesaSecurity.test.js` | 5 | 5 | 0 | 11.7s |
| `phase6aReleaseBlockers.test.js` | 13 | 13 | 0 | 27.2s |
| `phase2.test.js` | 20 | 20 | 0 | 9.8s |
| `phase1.test.js` | 1 | 1 | 0 | 1.8s |
| `phase3UserTenantSecurity.test.js` | 17 | 17 | 0 | 15.1s |
| `phase4ProductInventorySecurity.test.js` | 16 | 16 | 0 | 18.5s |
| `phase4TransferIdempotency.test.js` | 8 | 8 | 0 | 12.3s |
| `billingEndpoints.test.js` | 19 | 19 | 0 | 11.8s |
| `billingRenewal.test.js` | 16 | 16 | 0 | 8.5s |
| `phase5SubscriptionLifecycle.test.js` | 17 | 17 | 0 | 6.8s |
| **TOTAL** | **154** | **154** | **0** | — |

- **Frontend TypeScript check & production build:** `tsc && vite build` completed with **0 errors** (built in 47.46s).
- **Database migration status:** All 78 historical migrations verified up to date. Zero schema alterations required.
- **Git working tree:** Clean.
