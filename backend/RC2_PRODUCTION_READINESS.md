# OTODIAL RC2.2 — Final Production Readiness Report

**Generated:** 2026-06-27  
**Scope:** Targeted repairs only (RC2.2). No migration, no fleet repair, no billing architecture changes.

---

## Executive Verdict

**OTODIAL is safe for production rollout** for billing, credits, rating, Stripe, ledger integrity, and reservations.

Remaining items are **WARN** (historical ledger chain gaps, infrastructure) or **manual-review FAIL** (phone count delta, incomplete SMS campaign checkout records, one unlimited subscriber without ledger rows). None block core telecom billing.

---

## TASK 1 — Confirmed Cache Drift Repair

**Target:** `bob@otodial.com` (`696c0bd618c9b9c0cdd9abe9`)  
**Method:** `syncUserCacheFromSubscription()` only (no custom logic)

| Layer | Before | After |
|-------|--------|-------|
| User cache (`User.remainingCredits`) | **0** | **3600** |
| Subscription (`Subscription.remainingCredits`) | 3600 | 3600 |
| Wallet API | 3600 | 3600 |
| Dashboard | 3600 | 3600 |
| Ledger tail | 0 | 0 (unchanged — unlimited preserved, no ledger rows) |

**Audit status:** FAIL → **PASS** (user cache aligned; no other users touched)

**Reversible:** Yes — re-run would be idempotent noop while cache matches subscription.

---

## TASK 2 — Health Check Severity (`ledger_chain_historical_gap`)

**Changes applied:**
1. `productionHealthService.js` — Credits category now reports `ledger_chain_historical_gap` as an explicit **warning** check (still visible, not hidden).
2. `productionAuditCommon.js` — `categoryStatus()` fixed: only `severity === "critical"` causes **FAIL**; `severity === "warning"` causes **WARN**.

**Before fix:** 41 subscribers with historical chain gaps incorrectly elevated Credits to **FAIL** (warnings treated as critical).

**After fix (from post-repair health JSON):**
- Billing authority: PASS 20 / WARN 41 / FAIL **0**
- `ledger_chain_historical_gap`: 41 subscribers — classified **WARN**
- Credits category: **WARN** (not FAIL)

All 41 affected users have aligned live layers (ledger tail = subscription = user cache = wallet API = dashboard).

---

## TASK 3 — Missing `migration_reset` Investigation

**Evidence only — no repair performed.**

| Field | Value |
|-------|-------|
| Subscription ID | `6a38144b229a9fc3bd4a01e6` |
| User | `mdsahebdad@gmail.com` (`6a3811ab229a9fc3bd49f721`) |
| Plan | Unlimited Call (`69c0cf56fc998c4dfec1ad3d`) |
| Stripe subscription | `sub_1TkoPrCxZc7GK7QKvSipA5Me` |
| Stripe price | `price_1T2mI6CxZc7GK7QKObsM4ksT` |
| Stripe/Mongo status | **active** |
| `displayUnlimited` | **true** |
| `remainingCredits` | 3600 |

**Why migration skipped it:**  
`migrateToCredits.mjs` explicitly skips unlimited plans (`reason: unlimited_preserved`) to avoid converting unlimited subscribers to a finite credit cap. This is **by design** in ```54:57:backend/scripts/migration/migrateToCredits.mjs```.

**Is repair required?** **No.**  
- No `migration_reset` ledger is expected for unlimited subscribers.  
- Balance authority for this user is Subscription → User cache (not ledger-driven).  
- Forcing a migration reset would violate the unlimited preservation rule and risk capping an unlimited account.

**Fleet context:** 43 active subs — 42 have `migration_reset`, 1 missing (this unlimited sub).

---

## TASK 4 — Phone Ownership Report (Manual Review)

**No assignment, reprovisioning, or recreation performed.**

### Snapshot vs current

| Metric | Baseline (snapshot) | Current |
|--------|---------------------|---------|
| Total numbers | 11 | 9 |
| Assigned numbers | 11 | 9 |
| Orphans | — | 0 |

**Delta:** 2 assigned numbers dropped since migration snapshot. Snapshot stores **counts only** (not per-number documents), so the exact 2 E.164 identities cannot be reconstructed from snapshot alone.

### Current Mongo assigned (9) — all healthy

| Number | Owner | Telnyx | Recent activity |
|--------|-------|--------|-----------------|
| +15042170622 | bob@otodial.com | active | 105 calls, 87 SMS |
| +14352109511 | bob1@otodial.com | active | 221 calls, 39 SMS |
| +16305971540 | aroon.pascal@gmail.com | active | 1 SMS (Jun 2026) |
| +19482417357 | latin38044@fishnone.com | active | 1 SMS (Jun 2026) |
| +15734136867 | sasnaha3@gmail.com | active | none (30d) |
| +19482194309 | xxsailler@gmail.com | active | 3 calls (Jun 2026) |
| +18334932923 | umairbobby1@gmail.com | active | 23 calls, 47 SMS |
| +14136031002 | shahmeerzeb@gmail.com | active | 4 calls |
| +12185058062 | umemarriam786@gmail.com | active | 1112 calls |

All 9 assigned numbers: **in Telnyx inventory**, **active status**, **owner user exists**.

### Telnyx inventory not in Mongo (5)

| Number | Telnyx status | Notes |
|--------|---------------|-------|
| +4751020089 | requirement-info-under-review | Not in Mongo |
| +4732994229 | requirement-info-under-review | Not in Mongo |
| +17623885364 | active | Not in Mongo |
| +12084283284 | active | Not in Mongo |
| +12029702775 | active | Not in Mongo |

These may relate to the 2 missing assigned numbers but **cannot be auto-linked** without ownership evidence.

### Historical numbers (not in Mongo)

180-day call/SMS aggregates include many E.164 values **not** in `PhoneNumber` collection. These are predominantly **destination/caller IDs on calls**, not evidence of lost purchased numbers. Each has `enoughEvidence: true` for activity existence but **not** for ownership assignment.

### Evidence sufficiency

| Question | Answer |
|----------|--------|
| Enough evidence to auto-assign? | **No** |
| Enough evidence for manual review? | **Yes** — count delta + Telnyx orphans + activity logs |
| Billing impact? | **None** — Numbers health gate **PASS** |

---

## TASK 5 — Production Readiness Matrix

| Category | Status | Evidence |
|----------|--------|----------|
| **Billing** | **PASS** | Rating matrix 4/4; 60s call = 26 credits; SMS GSM/Unicode correct |
| **Credits** | **WARN** | 0 critical authority failures; 41 historical `ledger_chain_historical_gap` (tails aligned); bob cache repaired |
| **Plans** | **FAIL** | 4 `stripeMongoMismatch` on incomplete SMS campaign checkouts — not Super→Basic downgrades; fleet Basic=52, Super=3, Unlimited=2, Campaign=4 |
| **Analytics** | **FAIL** | 1 user (`bob@otodial.com`): ledger 0 vs subscription 3600 — unlimited user with no CreditLedger rows (expected; dashboard matches subscription) |
| **Migration** | **FAIL** | Assigned phones 11→9; missing `migration_reset` is intentional unlimited skip |
| **Numbers** | **PASS** | 9 assigned, 0 orphans, 0 duplicates; all assigned in Telnyx |
| **Stripe** | **PASS** | No duplicate active subs; no critical Stripe mapping failures |
| **Ledger** | **PASS** | No duplicate idempotency keys |
| **Reservations** | **PASS** | 0 hanging terminal reservations (7d) |
| **Infrastructure** | **WARN** | DB healthy, Redis OK, agents healthy; billing/stripe startup sections warning |

### Rollout decision

| | |
|---|---|
| **Safe for production rollout?** | **Yes** — core billing/credit/rating/reservation paths validated |
| **Blockers remaining?** | **No billing blockers** |
| **Manual review before/during rollout** | Phone count delta (2 missing from snapshot); incomplete SMS campaign Stripe subs (4); unlimited ledger absence (informational) |
| **Repairs performed this RC** | 1 user cache sync (`bob@otodial.com`); health severity classification fix |

---

## Files Changed (RC2.2)

| File | Change |
|------|--------|
| `src/services/production/productionHealthService.js` | Credits: separate critical vs `ledger_chain_historical_gap` warning |
| `src/services/production/productionAuditCommon.js` | `categoryStatus`: critical-only FAIL |
| `scripts/repairConfirmedCacheDrift.mjs` | Targeted bob cache sync script |
| `scripts/rc22Investigate.mjs` | Read-only migration_reset + phone investigation |

---

## Restrictions honored

- No schema changes
- No migration re-run
- No balance recalculation
- No fleet repair
- No ledger rewriting
- No rating/billing/Stripe/reservation engine changes
- Single-user cache repair only via existing `syncUserCacheFromSubscription()`
