# Zana POS — Phase 7 SaaS Completion Plan

**Date:** 2026-09-28
**Repository:** `https://github.com/Warrenchris/zena-pos.git`
**Baseline commit:** `185eb6e` (feat: implement authentication controller, user model, and email verification tests)
**Predecessor:** Phase 6B-07 (release gate PASS, 2026-09-24, HEAD `2a2a01b`)
**Mode:** PLAN ONLY. No code changes are authorized by this document.

---

## 0. RESUME HERE (read this first in any new session)

**Where we are:** Security, tenant isolation, payments, idempotency, backups and cache invalidation are hardened and verified (Phases 1 to 6B-07). What remains is the *operational* SaaS layer and Kenya compliance.

**Working rules (carried over from Phases 3 to 6B):**
1. One sub-phase at a time. Stop at each gate and wait for explicit approval.
2. Each sub-phase starts with a read-only findings pass, then remediation, then a walkthrough doc in `docs/saas/`.
3. Every change ships with tests. No claim without evidence (command output, file:line, test count).
4. Never run `npm audit fix --force`.
5. Migrations must be reversible with pre-flight checks.

**Paste this to resume:**
> Continue Zana POS from `docs/saas/PHASE-7-SAAS-COMPLETION-PLAN.md`. Baseline is commit `185eb6e`. Start at the first sub-phase not marked DONE in section 3. Do the read-only findings pass only, then stop for approval.

**Progress tracker** (update this table as each sub-phase completes):

| Sub-phase | Title | Status | Commit | Walkthrough doc |
| :--- | :--- | :--- | :--- | :--- |
| 7.0 | Baseline reconciliation and repo hygiene | DONE | `26bfbac` | `docs/saas/PHASE-7-0-BASELINE-WALKTHROUGH.md` |
| 7A | Billing notifications and lifecycle emails | DONE | `663765f` | `docs/saas/PHASE-7A-BILLING-NOTIFICATIONS-WALKTHROUGH.md` |
| 7B | Platform operator (super-admin) console | DONE | `7c5dfbb` | `docs/saas/PHASE-7B-PLATFORM-CONSOLE-WALKTHROUGH.md` |
| 7C | Tax integrity and eTIMS groundwork | PARTIAL (Step 1 DONE; Step 2 BLOCKED) | `4483bbc` | `docs/saas/PHASE-7C-STEP1-TAX-INTEGRITY-WALKTHROUGH.md` |
| 7D | Account, data and entitlement gaps | NOT STARTED | | |
| 7E | Operations: offsite backups and dependency plan | NOT STARTED | | |
| 7F | Final production readiness audit | NOT STARTED | | |

---

## 1. Verified starting state

| Area | State | Evidence |
| :--- | :--- | :--- |
| M-Pesa callback auth (POS and billing) | Done | `timingSafeEqual` in `mpesaRoutes.js`, `billingRoutes.js` |
| Staff creation and quotas | Done | `userController` wraps `staffCreationService` |
| Signup abuse | Mostly done | IP-keyed `registerLimiter`, 5/hour; no disposable-domain check |
| Reset token purpose and revocation | Done | `purpose: 'password_reset'`, `auth.js` rejects it |
| Idempotency, backups, cache invalidation | Done | Phase 6B-07 report |
| Offline POS queue | Exists | `frontend/src/offline/` (audit doc says otherwise; stale) |
| Getting Started checklist | Done | `GettingStartedChecklist.jsx` |
| Billing emails | **Missing** | `emailService` has only invoice, reset, verify templates |
| Auto-renewal / saved card | **Missing** | Renewal is owner-initiated only |
| Plan change (proration, mid-cycle) | **Missing** | `renew` accepts `planId`; no proration |
| Super-admin tooling | **Missing** | `super_admin` role referenced, no routes or pages |
| eTIMS / tax integrity | **Missing** | No eTIMS code, no `taxCategory`, client-trusted tax |
| `multi_shop` enforced on backend | **Missing** | Frontend only; `shopController` checks `maxShops` only |
| Org data export / deletion | **Missing** | Terms and Privacy pages only |
| Offsite backups | **Missing** | Backups stay on local volume |
| Password minimum | Weak | 6 chars at register and reset |

Items marked Missing are from my static review of the code. Test results are the docs' claims and have **not** been re-run; 7.0 does that.

---

## 2. Open decisions (need your answer before the sub-phase that depends on them)

| # | Decision | Needed before | Recommendation |
| :--- | :--- | :--- | :--- |
| D1 | Which billing emails and at what timings (e.g. trial ends in 5 days and 1 day; renewal due in 7 and 1 days; payment failed; suspended)? | 7A | Start with those five |
| D2 | Email provider for production (SMTP as now, or a transactional provider)? | 7A | Keep current SMTP for now; abstract behind `emailService` |
| D3 | Is auto-renewal in scope, given M-Pesa STK needs customer approval each time? | 7A | Card auto-renew only, via Flutterwave tokenization; M-Pesa stays reminder-driven |
| D4 | Formal grace window before hard lockout (PRD-01 left this open; code uses 7 days) | 7A | Keep 7 days and document it |
| D5 | Super-admin scope: read-only support view, or also mutations (extend trial, suspend, refund)? | 7B | Read-only first, then audited mutations |
| D6 | Do you already hold KRA eTIMS sandbox credentials? | 7C | Confirmed: BLOCKED - no KRA sandbox credentials as of 2026-09-30. Step 2 parked until credentials arrive. |
| D7 | Offsite backup target (S3, Cloudflare R2, other)? | 7E | R2 or S3 with encryption at rest |
| D8 | Raise password minimum to 8? Breaks existing tests and UX copy | 7D | Yes; enforce on new passwords only |
| D9 | Tax-inclusive vs tax-exclusive shelf pricing: should Step 1 recompute treat product price as exclusive (current UI default) or inclusive (KRA retail norm)? | 7C Step 1 | Support configurable taxInclusive setting defaulting to exclusive (false) for backward compatibility, with inclusive calculation supported when enabled |

---

## 3. Sub-phases

### 7.0 — Baseline reconciliation and repo hygiene
**Goal:** Make sure the ground is solid before adding features.

- Run the full suites on `185eb6e`: backend Jest (`--runInBand`), frontend tests and `npm run build`, `pytest` in the AI service, `sequelize-cli db:migrate:status`. Record real numbers.
- Review the two commits made after the Sept 24 gate (email verification, auth controller/user model) for regressions; the release gate did not cover them.
- Correct stale docs: the 6B-07 offline-queue finding (POS-P3-01), and the ".bak files: none" claim.
- Repo cleanup, proposed and approved before deleting: root `.patch` files (about 20), `pre_reset_backup.sql` (contains data; check history for secrets), `serverTotal`, `docker-compose.override.yml.bak`, stray `test-*.js` at root. Move anything worth keeping to `docs/archive/`.
- Confirm `.gitignore` covers backups, `.env*`, and SQL dumps.

**Exit criteria:** all suites green with recorded counts; cleanup PR merged; docs corrected.
**Gate:** approval to proceed to 7A.

---

### 7A — Billing notifications and lifecycle
**Goal:** Customers are told about trials, renewals and failures. Stops silent churn.

**Findings pass:** trace `billingScheduler.runSubscriptionTransitionJob` and `billingService` transitions; list every status change that should notify.

**Work items:**
1. Email templates in `emailService`: trial ending, renewal due, payment received (receipt), payment failed, account suspended, reactivated.
2. Scheduler hook: emit notifications on transition, with a `NotificationLog` (or equivalent) table so each email is sent **once** per event (idempotent; the scheduler runs on an interval and across replicas).
3. Redis lock reuse: the scheduler already uses `lock:billing_scheduler_job`; keep single-runner semantics.
4. In-app banners already exist for trial, `past_due`, `canceled`, `suspended`; confirm they match the email timings.
5. Plan change: define behavior for upgrade and downgrade mid-cycle (proration or "change at next renewal"), reusing the existing downgrade conflict check. Decide per D3/D4.
6. (If D3 approved) Card auto-renewal via Flutterwave tokenization, behind a feature flag.

**Tests:** email sent once per event; no email on replay; failure to send does not block the transition; timing boundaries; multi-replica lock; tenant scoping of recipients (owner only).
**Migration:** notification log table, reversible.
**Exit criteria:** every subscription transition has a verified notification path; walkthrough doc written.

---

### 7B — Platform operator (super-admin) console
**Goal:** You can run the business without touching the database.

**Findings pass:** find every place `super_admin` is referenced (`auth.js:130`, `subscriptionEnforcement.js`, `invoiceController.js`) and how a super admin is created (currently no defined path).

**Work items (per D5):**
1. Secure super-admin provisioning (CLI script or seed, never via public signup) and a hard separation from tenant roles.
2. Read-only endpoints: list organizations, subscription state, plan, usage vs quota, last activity, invoices.
3. Audited mutations (phase 2 of this sub-phase): extend trial, suspend and reactivate, mark invoice paid manually with reason, resend verification.
4. Every super-admin action written to `ActivityLog` with actor and reason.
5. Frontend: minimal `/platform` area, route-guarded, not linked from tenant navigation.
6. Rate limiting and mandatory verified email on super-admin accounts.

**Tests:** tenant users cannot reach `/platform` (401/403); super admin actions are audited; cross-tenant reads work only for super admin; no tenant-facing route leaks.
**Exit criteria:** support tasks in section 1 doable via console; security review of the new surface.

---

### 7C — Tax integrity and eTIMS groundwork
**Goal:** Fix what is fixable without KRA credentials; prepare the rest. Source: `Zana-POS-KRA-eTIMS-Compliance-Scoping.md`.

**Step 1 (no credentials needed, do now):**
- Recompute `tax` server-side from the shop's configured rate in `saleController`; reject or correct client mismatch.
- Add tax category to `Product` and `Category` (standard, zero-rated, exempt) with migration and backfill defaulting to the current behavior.
- Fix `/api/reports/tax-estimate` to use recorded per-sale tax rather than a flat 16% guess.
- Show tax category in the product UI; carry it into sale items.

**Step 2 (BLOCKED — no KRA sandbox credentials as of 2026-09-30):**
- Per-shop eTIMS credential storage, encrypted, with sandbox/production toggle.
- VSCU submission service against KRA sandbox, using the offline queue's async pattern.
- Receipt changes: QR code, control unit number, buyer PIN. Refund to credit-note submission.

**Tests:** tax recompute edge cases (rounding, discounts, split payments, refunds); category backfill; report totals equal sum of recorded tax.
**Exit criteria:** Step 1 fully done and verified; Step 2 either done against sandbox or explicitly parked pending credentials.
**Note:** production eTIMS use requires each merchant to pass KRA's own certification; that is not an engineering task.

---

### 7D — Account, data and entitlement gaps
**Goal:** Close the smaller SaaS hygiene items.

1. **Password policy (D8):** raise the minimum for new passwords at register and reset; update validators, tests and UI copy.
2. **Disposable email check** at `/register` (SEC-02 remainder).
3. **`multi_shop` backend enforcement:** `canUseFeature(orgId, 'multi_shop')` in `shopController` before branch creation; document `api_access` as unimplemented plan metadata.
4. **Org data export:** owner-triggered export (products, customers, sales, invoices) as a zipped CSV, rate limited, audited.
5. **Org deletion / account closure:** owner-confirmed, soft-delete with retention window, then purge job; cancel subscription first; document what is retained for tax records.
6. Link data-request handling from the Privacy page.

**Tests:** export is tenant-scoped; deletion cannot be triggered by non-owners; purge removes only that org.

---

### 7E — Operations
**Goal:** Recovery and supply chain are production-grade.

1. **Offsite backups (D7):** extend `backup-scheduler.js` to upload the encrypted `.sql.gz` plus checksum; retention policy on the bucket; alert on failure.
2. **Restore drill:** restore from the *offsite* copy into a scratch DB and record the result; schedule it periodically.
3. **Redis password:** remove the `zana_secure_redis_pwd` fallback so production fails fast without an explicit value.
4. **Dependencies:** plan upgrades for `multer` and `nodemailer` (marked reachable) with regression runs; track the Sequelize v7 question separately. Never `audit fix --force`.
5. **Monitoring:** confirm Sentry release workflow, add alerts for backup failure, scheduler failure and webhook 401 spikes.

**Exit criteria:** an offsite restore has actually been performed and logged.

---

### 7F — Final production readiness audit
- Re-run the full regression: backend, frontend build, AI service, migrations.
- Re-verify tenant isolation, payment callbacks, and every new surface from 7A to 7E (especially `/platform`).
- Test suite isolation remediation: systematically resolve shared Redis state leakage (such as 24h tombstone keys leaking across test suites) and database row residue via automated per-suite namespace isolation or global teardown hooks.
- Produce `docs/saas/FINAL-PRODUCTION-READINESS-AUDIT.md` with a release gate matrix in the same format as 6B-07.
- Update the progress tracker in section 0.

---

## 4. Recommended order and why

1. **7.0** first: it costs little and protects everything after it.
2. **7A** next: highest revenue impact, no external dependencies.
3. **7C Step 1** can run in parallel with 7A if you want: independent files, no credentials needed.
4. **7B** after 7A, since suspend/extend actions depend on the lifecycle behavior 7A settles.
5. **7D and 7E** in any order.
6. **7C Step 2** whenever KRA sandbox credentials arrive.
7. **7F** last.

## 5. Risks

| Risk | Mitigation |
| :--- | :--- |
| Duplicate emails from the interval scheduler across replicas | Notification log with unique key per (org, event, period), plus existing Redis lock |
| Super-admin surface becomes a tenant-isolation hole | Separate route namespace, dedicated tests, audit logging, review in 7F |
| Tax recompute changes totals customers already see | Feature flag and a comparison run over historical sales before enabling |
| eTIMS blocked on credentials | Split so Step 1 delivers value alone |
| Org deletion destroys data needed for tax records | Soft delete with retention window; confirm retention rules with an accountant |
| Drift between docs and code (already happened once) | Each walkthrough must cite commit hash and file:line; 7F re-verifies |
| Test isolation & Redis state leakage across test suites | Workaround applied in 0435c1c. Diagnostic scan found 6+ suites (phase2-4, purchases-and-orders, mpesaSecurity, mysql-salepayments) sharing user IDs (101/102/201/999) without status reset; 7F will systematically isolate test keys via prefixing/global flush to eliminate cross-suite auth failures. |
| Offline sync tax rate mismatch | Client-supplied offlineSnapshotTaxRate dropped from Step 1 to prevent client tampering; log reconciliation risk for when sync occurs after tax rate adjustments |

## 6. Session-end checklist (do this every time we stop)

- [ ] Update the progress tracker in section 0 (status, commit, doc link)
- [ ] Commit the walkthrough doc for the finished sub-phase
- [ ] Note any new decisions in section 2
- [ ] Record the exact commit hash we stopped at
- [ ] State the next sub-phase and its first action
