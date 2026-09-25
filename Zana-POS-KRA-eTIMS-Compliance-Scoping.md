# Zana POS — KRA / eTIMS Compliance Audit & Scoping

**Repo:** https://github.com/Warrenchris/zena-pos
**Prepared:** September 2026

---

## 1. Current State

Zana POS today has only cosmetic KRA support — nothing that satisfies Kenya's actual e-invoicing requirements.

| Area | What exists | File(s) |
|---|---|---|
| KRA PIN | Free-text field on `Shop`, no format validation, printed as a plain line on receipts | `backend/src/models/Shop.js`, `frontend/src/printing/layout.js` |
| Tax rate | One global "Default Tax / VAT Rate (%)" per shop, applied uniformly to every sale | `frontend/src/pages/Settings.jsx` |
| Tax reporting | Sums whatever `tax` value was recorded per sale; separate `/api/reports/tax-estimate` endpoint guesses 16% of subtotal | `backend/src/controllers/reportsController.js` |
| Invoice numbering | Internal `YYYYMMDD-N` sequence, resets daily, has no relationship to any KRA-issued reference | `backend/src/controllers/saleController.js` |

### Gaps found

1. **No eTIMS integration at all.** No OSCU/VSCU calls, no invoice signing, no real-time (or near-real-time) transmission to KRA. Under the Tax Procedures (Electronic Tax Invoice) Regulations 2024, every business in Kenya — VAT-registered or not, above modest thresholds — must transmit invoices through eTIMS. From 2026, KRA cross-checks filed returns against eTIMS data line by line. As it stands, no receipt this POS prints is a valid tax invoice.
2. **Tax amount is trusted from the client.** `saleController.js` takes `tax` straight from the request body and only uses it to sanity-check the frontend's arithmetic — it's never recomputed server-side from the shop's configured rate. (Contrast with discount approvals in the same file, which *are* explicitly re-verified server-side, with a comment explaining why.) A tampered client could submit `tax: 0` and understate VAT collected in your own reports.
3. **No per-product/category tax exemption or zero-rating.** `Product` and `Category` have no tax-category field — every item in a shop is taxed at one blanket rate, with no way to reflect Kenya's exempt/zero-rated goods categories.
4. **No mandatory invoice fields.** A compliant electronic tax invoice needs a QR code, the eTIMS-issued invoice reference/control unit number, and (for B2B) a buyer PIN field. None of these exist in `receiptModel.js` / `layout.js`.
5. **No VAT-return-ready export.** The tax-estimate endpoint is a rough calculation, not a report tied to actual per-sale recorded tax data, and there's no VAT3-format export.

---

## 2. What eTIMS Actually Requires

### Two integration modes

- **OSCU (Online Sales Control Unit)** — runs inside your own trader invoicing system, talks to KRA's API directly and in real time. Best when a branch is reliably online.
- **VSCU (Virtual Sales Control Unit)** — KRA validates/signs server-side; tolerates asynchronous submission better. **Recommended starting point for Zana**, since the app already has an offline sales queue (`frontend/src/offline/salesQueue.js`) — VSCU fits the "sale happens offline, syncs later" pattern that already exists rather than fighting it.

A KRA-provided standalone **eTIMS Client** app also exists for very small taxpayers who don't build custom integrations — not relevant here, since Zana POS *is* the invoicing system.

### Onboarding is per-merchant, not centralized

Each organization/shop using Zana must independently:
1. Sign up on KRA's **eTIMS Taxpayer Sandbox** under their own PIN.
2. Register their device — receives a **branch ID** and **device serial number** from KRA.
3. Submit KRA's eTIMS Commitment Form.
4. Complete device initialization, which issues a **communication key (cmcKey)** — the long-lived secret used to authenticate every subsequent API call.
5. Separately graduate from sandbox to production once KRA's own testing/certification passes.

This maps onto the existing multi-shop model: `Shop` already carries `kraPin`. eTIMS credentials should be stored **per shop** (branch), not per organization, since that's how KRA issues them.

---

## 3. Data Model Changes Required

| Model | Change needed |
|---|---|
| `Product` / `Category` | Add a KRA tax-type code per item: `A` (exempt), `B` (standard 16%), `C` (zero-rated / exports), `E` (special rate, e.g. 8% on petroleum). Every product must map to one. |
| `Shop` | Add encrypted-at-rest fields for branch ID, device serial number, cmcKey, and sandbox/production mode flag. |
| `Sale` / `SaleItem` | Add fields for the KRA invoice reference number, QR/signature payload, and submission status (`pending` / `submitted` / `failed`). |
| `SaleRefund` | Add fields to support KRA credit notes — **must be issued from the same OSCU/VSCU that issued the original invoice**, referencing it. This is a real constraint on the existing refund flow. |
| Receipts (`receiptModel.js`, `layout.js`) | Print the QR code and KRA invoice reference once a sale is fiscally confirmed; handle the "not yet confirmed" state gracefully for offline sales. |

---

## 4. Submission Pipeline

For every completed sale:
1. Build the KRA invoice payload (items, tax category per item, totals, buyer PIN if requested).
2. Submit to eTIMS.
3. Receive back a signature/QR/control number.
4. Attach it to the `Sale` record — only then is the sale "fiscally complete."

Given the offline-first design already in place, this should be a **background job/queue** (Redis is already in the stack) with retry logic, rather than a blocking call at checkout. A sale can be recorded locally and reconciled with eTIMS moments later — consistent with how the existing offline sales queue already defers server sync.

---

## 5. Phased Plan

1. **Now, independent of eTIMS:** Add tax-category classification to `Product`/`Category`; fix server-side tax trust (recompute/validate `tax` from the shop's configured rate rather than accepting the client's figure). Useful regardless of eTIMS timing and unblocks everything after it.
2. Add per-shop eTIMS credential storage and an onboarding settings screen. Credential encryption matters here — these are live tax-filing secrets.
3. Build the VSCU submission service against KRA's **sandbox** environment. Several open-source reference SDKs for the OSCU/VSCU spec exist (GitHub, PyPI) worth studying for payload shapes — but treat KRA's own spec PDFs as the source of truth, and note any integration still must pass KRA's own testing/certification before production use.
4. Wire receipt printing to show the QR/reference once a sale is fiscally confirmed.
5. Extend `SaleRefund` for credit-note submission.
6. Move each merchant from sandbox to production individually, as each completes KRA's own certification — this is each merchant's compliance process, not engineering work; Zana just needs to support a sandbox/production mode toggle per shop.

### Dependencies to flag

- Steps 3 and 6 require real KRA sandbox credentials in hand before they can be tested — there's no way to fully build and verify the submission logic without them.
- Step 1 (tax categories + server-side tax integrity) can start immediately and stands on its own even before eTIMS work begins.

---

## 6. Bottom Line

This is a multi-week project, not a sprint task, and it now carries real legal weight for your target merchants given how far enforcement has moved since 2023 (mandatory for effectively all businesses by 2024, line-by-line return cross-checking from 2026). Recommend treating eTIMS integration as the top compliance-related roadmap item, with the data-model and server-side tax integrity fixes in Step 1 as the immediate, independently-shippable first slice.
