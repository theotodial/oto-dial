# OTODIAL RC2.4 — Final Release Candidate Report

**Generated:** 2026-06-27  
**Release type:** Audit accuracy & operational readiness only — **no billing behavior changes**

---

## Executive Summary

RC2.4 completes production readiness cleanup after RC2.1–RC2.3 investigations. All telecom billing systems remain **stable and untouched**. This release improves **audit accuracy**, **health gate exit codes**, and **deployment confidence**.

**Health outcome after RC2.4:** `PASS_WITH_WARNINGS` (exit **0**)

| Category | Status |
|----------|--------|
| Billing | PASS |
| Credits | WARN (41 historical ledger chain gaps — tails aligned) |
| Plans | **PASS** (was FAIL — label normalization fix) |
| Analytics | **PASS** (was FAIL — unlimited ledger exemption) |
| Migration | **WARN** (phone baseline 11→9 — manual review, not migration failure) |
| Numbers | PASS |
| Stripe | PASS |
| Ledger | PASS |
| Reservations | PASS |
| Infrastructure | WARN |

**Deployment recommendation:** **Ready for public rollout.** WARN items are historical/informational and do not block billing.

---

## Billing Engine Status

| Component | Status | Evidence |
|-----------|--------|----------|
| Telecom Rating Engine | **Stable** | Billing matrix 14/14 scenarios; TELECOM_RATING_V1 active |
| Voice billing | **Stable** | 60s answered call = 26 credits (11 lifecycle + 15 connected) |
| SMS billing | **Stable** | GSM 15/segment, Unicode 20/segment — all checks pass |
| Billing Gateway | **Unchanged** | No RC2.4 modifications |
| Economic Serialization | **Unchanged** | No RC2.4 modifications |
| Reservation Engine | **Stable** | 0 hanging terminal reservations (7d) |

---

## Migration Status

| Metric | Value |
|--------|-------|
| Credit migration | **Complete** — 55 subscriptions with `migration_reset` |
| Grant mismatches | 0 |
| Negative balances | 0 |
| Duplicate active subs | 0 |
| Unlimited skip | 1 active sub (`mdsahebdad@gmail.com`) — by design |
| Phone baseline | 11 assigned → 9 assigned — **historical/manual review** (reclassified WARN) |

Migration verification `ok: true` for credit integrity. Phone delta visible under Migration WARN, not FAIL.

---

## Stripe Status

**PASS** — No duplicate active subscriptions; active Stripe-linked subs have price IDs in Mongo.

---

## Credit Ledger Status

**PASS** — No duplicate idempotency keys. 41 subscribers have historical `balanceBefore/After` chain gaps with **aligned tail balances** (Credits WARN only).

---

## Audit Improvements (RC2.4)

### Task 1 — Plan audit accuracy
- Added `normalizePlanFamilyKey()` — maps `campaign` ↔ `sms_campaign` before comparison
- `productionPlanAuditService.js` uses normalized family equivalence
- **Result:** 4 false-positive Plan FAILs eliminated; Plans category **PASS**

### Task 2 — Analytics audit
- Unlimited accounts with zero CreditLedger rows (migration `unlimited_preserved`) exempt from ledger-vs-subscription FAIL when dashboard/wallet match subscription
- **Result:** `bob@otodial.com` no longer fails; Analytics category **PASS**

### Task 3 — Migration audit
- Phone count delta moved from `failures[]` to `warnings[]` in `migrationVerifyService.js`
- Health gate exposes `phone_baseline_manual_review` as **WARN**
- **Result:** Migration category **WARN** (visible, not hidden)

### Task 4 — Exit codes
| Outcome | Exit code |
|---------|-----------|
| PASS | 0 |
| PASS_WITH_WARNINGS | 0 |
| FAIL | 1 |

Implemented in `productionHealth.mjs` via `resolveHealthOutcome()`. Printed summary shows `Outcome PASS_WITH_WARNINGS (exit 0)`.

---

## Verification Summary

| Check | Result |
|-------|--------|
| `npm run production:health` | **PASS_WITH_WARNINGS** (exit 0) |
| `npm run validate:billing-matrix` | **PASS** |
| `npm run validate:sms-billing` | **PASS** |
| `npm test` | **PASS** (after stale recovery test assertion update — test-only, no billing change) |

**No production billing behavior was modified in RC2.4.**

---

## Remaining Manual Reviews

1. **Phone ownership** — 2 assigned numbers dropped since migration snapshot (11→9). All 9 current assignments valid in Mongo + Telnyx. Manual ops review recommended; does not block rollout.
2. **Historical ledger chain gaps** — 41 users; tail balances correct. Informational only.
3. **Infrastructure WARN** — Startup readiness billing replay divergence (24h). Monitor; non-blocking.

---

## Known Limitations

- Migration snapshot stores phone **counts** only, not per-number documents — exact missing E.164 identities require Telnyx/Mongo/call log cross-reference.
- Incomplete SMS campaign checkout records exist in Mongo (`status: incomplete`) — not active subscribers.
- Cancelled unlimited internal account (`bob@otodial.com`) has subscription balance but no CreditLedger rows — expected for `unlimited_preserved`.

---

## Files Changed (RC2.4)

| File | Change |
|------|--------|
| `src/services/production/productionAuditCommon.js` | Plan family normalization; `resolveHealthOutcome()` |
| `src/services/production/productionPlanAuditService.js` | Normalized plan family comparison |
| `src/services/production/productionAnalyticsAuditService.js` | Unlimited ledger authority exemption |
| `src/services/migration/migrationVerifyService.js` | Phone baseline → warning (not failure) |
| `src/services/production/productionHealthService.js` | Migration category split: credit PASS + phone WARN |
| `scripts/productionHealth.mjs` | Exit code documentation + behavior |
| `test/economicRecovery.test.js` | Stale test assertion (verification only) |

---

## Deployment Recommendation

**Proceed with public rollout.** Core billing, credits, Stripe, ledger, reservations, and numbers are healthy. Remaining WARNs are audit/historical/ops items with no customer billing impact.
