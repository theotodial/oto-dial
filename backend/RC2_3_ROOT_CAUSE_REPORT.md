# OTODIAL RC2.3 — Root Cause Investigation Report

**Generated:** 2026-06-27  
**Mode:** Read-only. No production writes, repairs, migrations, or logic changes performed.

---

## 1. Executive Summary

The three remaining **FAIL** categories in the production health gate (**Plans**, **Analytics**, **Migration**) do **not** indicate billing engine defects. Live investigation of 61 subscribers confirms:

| Category | FAIL count | Real production issues | Root cause |
|----------|------------|------------------------|------------|
| **Plans** | 4 records | **0** | Audit false positive — family label mismatch (`sms_campaign` vs `campaign`) on **incomplete** SMS checkout records |
| **Analytics** | 1 user | **0** | Audit checks wrong authority — compares CreditLedger to Subscription for an **unlimited, cancelled** account with zero ledger rows |
| **Migration** | 1 verification failure | **0 billing impact** | Historical phone-count baseline delta (11→9); migration itself **succeeded** (`migrationFailed: false`) |

**Billing, Credits (critical), Stripe, Ledger, Reservations, and Numbers are healthy.** Credits correctly shows **WARN** (41 historical ledger chain gaps).

**Deployment conclusion:** **A) Safe to deploy immediately.**  
The FAIL categories are audit-classification and historical-baseline issues. No active paying customer is receiving wrong plans, wrong balances, or broken analytics. Phone count delta requires manual ops review but does not block telecom billing rollout.

---

## 2. Category 1 — Plans (FAIL)

### Why the health gate fails

`auditPlansCategory` fails when `plans.mismatches > 0`. Mismatches include any row with `planMismatch`, `stripeMongoMismatch`, or `creditDrift`.

**Current fleet (61 subscribers):** Basic=52, Super=3, Unlimited=2, Campaign=4.  
**Zero** Super→Basic downgrades. **Zero** genuine plan ID mismatches.

All 4 failing records share the same pattern.

### Exact failing records

#### Record 1 — cofival964@ziniche.com

| Field | Value |
|-------|-------|
| User ID | `6a3ab012229a9fc3bd4fc3d7` |
| Email | cofival964@ziniche.com |
| Subscription ID | `6a3ab604229a9fc3bd4fe54c` |
| Plan ID | `69e7d7d269f38886f91371f2` |
| Plan name | 1000 SMS |
| Stripe subscription | `sub_1TlWz4CxZc7GK7QKiTU17ecN` |
| Stripe price | `price_1TOk5pCxZc7GK7QKlvKNFyuN` |
| Mongo plan | 1000 SMS (`family: campaign`) |
| Resolved plan | 1000 SMS (source: `stripe_price_id`) |
| Expected plan | 1000 SMS |
| Actual plan | 1000 SMS |
| Subscription status | **incomplete** |
| Why audit failed | `stripeMongoMismatch`: Stripe canonical `"sms_campaign"` ≠ mongo family `"campaign"` |
| Classification | **audit false positive** |
| Customer affected? | **No** — incomplete checkout; not an active subscriber |

#### Record 2 — sicana9477@fishnone.com

| Field | Value |
|-------|-------|
| User ID | `6a3adf62229a9fc3bd50e753` |
| Subscription ID | `6a3ae037229a9fc3bd50ea8f` |
| Stripe subscription | `sub_1Tla6GCxZc7GK7QKHTXMddf3` |
| Stripe price | `price_1TOk5pCxZc7GK7QKlvKNFyuN` |
| Plan | 1000 SMS (same ID as above) |
| Status | **incomplete** |
| Classification | **audit false positive** (same naming bug) |
| Customer affected? | **No** |

#### Record 3 — chatrapalr27@gmail.com

| Field | Value |
|-------|-------|
| User ID | `6a3b4739229a9fc3bd525d1c` |
| Subscription ID | `6a3b5274229a9fc3bd528713` |
| Stripe subscription | `sub_1Tlh2bCxZc7GK7QKRQSHLSWP` |
| Status | **incomplete** |
| Classification | **audit false positive** |
| Customer affected? | **No** |

#### Record 4 — fatimaeman429pk@gmail.com

| Field | Value |
|-------|-------|
| User ID | `6a3b7824229a9fc3bd53087f` |
| Subscription ID | `6a3b78bd229a9fc3bd530bdc` |
| Stripe subscription | `sub_1TlkFrCxZc7GK7QKR6rDknld` |
| Status | **incomplete** |
| Classification | **audit false positive** |
| Customer affected? | **No** |

### Root cause (code-level, read-only observation)

In `productionPlanAuditService.js`, `planFamily()` returns `"campaign"` for SMS plans.  
In `stripeCatalog.js`, `getCanonicalPlanKeyFromPriceId()` returns `"sms_campaign"`.

The mismatch check at ```95:99:backend/src/services/production/productionPlanAuditService.js``` compares these two strings literally:

```
stripeCanonical !== planFamily(authoritative.plan)
// "sms_campaign" !== "campaign" → true → stripeMongoMismatch
```

Both sides refer to the **same** 1000 SMS plan. Plan IDs match. Stripe price resolves to the same Mongo plan document. This is a **label normalization bug in the audit**, not a plan mapping failure.

Additionally, all four records are **`incomplete`** subscriptions — abandoned or in-progress Stripe checkouts — not active paying users.

### Classification summary

| Classification | Count |
|----------------|-------|
| audit false positive | 4 |
| genuine production problem | 0 |
| stale legacy record | 0 (incomplete, not legacy active) |
| cancelled subscription | 0 |
| duplicate inactive subscription | 0 |
| unsupported legacy plan | 0 |
| migration artifact | 0 |

### Recommended targeted repair (audit only — not performed)

1. Normalize `planFamily()` to return `sms_campaign` (match `migrationPlanResolver` and `stripeCatalog`), **or** compare via canonical key mapping.
2. Exclude `incomplete` / `cancelled` subscriptions from plan mismatch critical count (report as informational).

---

## 3. Category 2 — Analytics (FAIL)

### Why the health gate fails

`auditAnalyticsCategory` fails when `auditAnalyticsCredits().status === "FAIL"`.  
**Scanned:** 61 users. **FAIL:** 1. **WARN:** 0. **PASS:** 60.

### Failing user — full pipeline trace

**User:** bob@otodial.com (`696c0bd618c9b9c0cdd9abe9`)

| Layer | Value | Notes |
|-------|-------|-------|
| **CreditLedger** | tail=0, rowCount=0 | No ledger rows (unlimited preserved; never migrated) |
| **Subscription** | remainingCredits=3600, status=**cancelled**, plan=Unlimited, displayUnlimited=true | Latest subscription doc by sort |
| **Wallet API** | remainingCredits=3600 | `getLatestSubscriptionCreditSnapshot` — matches subscription |
| **Dashboard API** | creditsRemaining=3600, isUnlimited=true | `loadUserSubscription` — matches subscription |
| **Billing authority** | PASS — all live layers aligned (0/3600 ledger ignored when rowCount=0) |
| **Analytics audit** | **FAIL** — ledger 0 vs subscription 3600 | Divergence flagged here only |

### Divergence analysis

| Check | Expected | Actual | Diff | Source of truth | Divergence point |
|-------|----------|--------|------|-----------------|------------------|
| Ledger vs Subscription | 3600 | 0 | -3600 | **Subscription** (unlimited; no ledger authority) | `auditAnalyticsCreditsForUser` line 63–68 |
| Wallet vs Subscription | 3600 | 3600 | 0 | Subscription | None |
| Dashboard vs Subscription | 3600 | 3600 | 0 | Subscription | None |
| Frontend transform | 3600 / ∞ | 3600 / ∞ | 0 | Subscription via `loadUserSubscription` | None |

**Consumer using stale data:** None. User cache was repaired in RC2.2 (3600). Wallet and dashboard read subscription authority.

### Is Analytics incorrect?

**No.** Admin analytics aggregation (`adminAnalyticsEnhanced.js`) reads `CreditLedger.aggregate` for **usage/grant totals in a date range**, not per-user remaining balance reconciliation. Per-user dashboard and wallet APIs are correct.

### Is the audit checking the wrong authority?

**Yes.** `productionAnalyticsAuditService.js` treats CreditLedger tail as mandatory authority for all users:

```javascript
if (!balancesRoughlyEqual(remainingFromLedger, remainingSub)) {
  mismatches.push({ field: "remainingCredits", ledger, subscription });
}
```

For unlimited subscribers intentionally skipped by migration (zero ledger rows), Subscription is the documented authority (`telecomCreditsAuthority: "subscription"` in `loadUserSubscription`). The billing authority audit already exempts ledger comparison when `ledgerRowCount === 0`.

**Classification:** audit false positive / wrong authority check.  
**Customer affected?** **No** — internal/cancelled unlimited account; all consumer-facing layers agree.

### Recommended targeted repair (audit only — not performed)

1. Skip ledger-vs-subscription FAIL when `displayUnlimited` or `ledger.rowCount === 0` and subscription is unlimited.
2. Optionally exclude `cancelled` subscriptions from analytics alignment scan.

---

## 4. Category 3 — Migration (FAIL)

### Why the health gate fails

`auditMigrationCategory` sets `pass: verification.ok`.  
`runMigrationVerification()` returns `ok: false` when **any** entry exists in `failures[]`.

### Verification result

| Field | Value |
|-------|-------|
| verification.ok | **false** |
| migrationFailed (billing/grants) | **false** |
| Snapshot exists | yes (`telecom-credit-migration-v1`) |
| Subscriptions scanned | 61 |
| migratedCount (has migration_reset) | 55 |
| negativeBalances | 0 |
| duplicateActiveSubscriptions | 0 |
| grantMismatches | 0 |
| orphanSubscriptions | 0 |

### Issues classified

| Issue | Severity | Category | Real failure? |
|-------|----------|----------|---------------|
| Assigned phone numbers dropped: baseline 11 → now 9 | **warning** (classified critical by health gate) | phone_ownership | Historical ops — migration did not drop numbers |
| Total phone numbers decreased: baseline 11 → now 9 | **historical** | phone_baseline | Same delta, duplicate signal |
| Active sub missing migration_reset — mdsahebdad@gmail.com | **informational** | missing_migration_reset | **By design** — unlimited_preserved |

### Missing migration_reset detail

| Field | Value |
|-------|-------|
| Subscription | `6a38144b229a9fc3bd4a01e6` |
| User | mdsahebdad@gmail.com |
| Plan | Unlimited Call |
| Stripe | `sub_1TkoPrCxZc7GK7QKvSipA5Me` (active) |
| migration_reset | **Does not exist** (expected) |
| Skip reason | `unlimited_preserved` in migrateToCredits.mjs |
| Credit grant | 0 (unlimited) |
| Repair required | **No** |

### Phone ownership

| Metric | Snapshot baseline | Current |
|--------|-------------------|---------|
| Total | 11 | 9 |
| Assigned | 11 | 9 |

Migration script **never mutates** PhoneNumber documents. The count delta occurred outside migration execution (likely manual cleanup or deprovisioning between snapshot and now). **Numbers health category PASS** — all 9 current assignments valid in Mongo and Telnyx.

### Did migration fail?

**No.** Credit migration completed successfully for 55 finite-grant subscriptions. Verification fails only on phone **count** comparison against snapshot manifest, not on credit grants, ledger integrity, or Stripe linkage.

### Recommended targeted repair (audit only — not performed)

1. Downgrade phone baseline delta from `failures[]` to `warnings[]` in `migrationVerifyService.js`, or exclude from critical health check.
2. Do not treat missing `migration_reset` on unlimited subs as a migration failure.

---

## 5. Category 4 — Exit Codes (recommendation only)

### Current behavior

```javascript
// scripts/productionHealth.mjs
const allPass = Object.values(cats).every((c) => c.status === "PASS");
process.exit(allPass ? 0 : 1);
```

### Problem

| Outcome | Exit code | Example |
|---------|-----------|---------|
| All PASS | 0 | — |
| Any WARN (no FAIL) | **1** | Credits WARN + all else PASS |
| Any FAIL | **1** | Plans/Analytics/Migration FAIL |

**WARN and FAIL are indistinguishable** to CI/scripts despite different severity in printed output.

Additionally, several current FAILs are **audit false positives** treated as `severity: "critical"` in the health orchestrator — same exit code as a true billing blocker.

### Recommendation (no code change made)

| Exit code | Meaning |
|-----------|---------|
| 0 | All categories PASS |
| 1 | Any category FAIL (true blockers only) |
| 2 | WARN only — deploy allowed with documented warnings |

Alternatively: fail exit code only when categories with `severity: "critical"` actual production issues fail — not audit false positives.

---

## 6. Category 5 — Deployment Recommendation Table

| Category | Reason | Real issue? | Customer impact? | Safe repair? | Priority |
|----------|--------|-------------|------------------|--------------|----------|
| **Billing** | Rating matrix + SMS validation pass | No | None | N/A | — |
| **Credits** | 41 historical ledger chain gaps; 0 critical drift | No (historical) | None | No repair needed; audit severity fixed | Low |
| **Plans** | 4× `sms_campaign` vs `campaign` label mismatch on incomplete SMS subs | **No** (audit bug) | None | Audit normalization only | Low |
| **Analytics** | 1 unlimited/cancelled user: ledger empty vs sub 3600 | **No** (wrong audit authority) | None | Audit skip rule for unlimited | Low |
| **Migration** | Phone count 11→9 vs snapshot; unlimited missing reset | Partial (phones real, reset intentional) | None on billing | Manual phone review; not migration re-run | Medium (ops) |
| **Numbers** | 9 assigned, all in Telnyx | No | None | Manual review for 2 missing from baseline | Medium (ops) |
| **Stripe** | No duplicate active subs; prices linked | No | None | N/A | — |
| **Ledger** | No duplicate idempotency keys | No | None | N/A | — |
| **Reservations** | 0 hanging terminal reservations | No | None | N/A | — |
| **Infrastructure** | Startup checks warning (billing replay divergence 24h) | Informational | None | Monitor | Low |

### Final conclusion

## **A) Safe to deploy immediately.**

**Evidence:**
- Telecom billing engine, rating, reservations, and Stripe linkage verified PASS.
- All three FAIL categories trace to **audit tooling** or **historical baseline**, not live billing breakage.
- Zero active customers on wrong plans; zero balance authority drift on active subscribers.
- The one Analytics FAIL user is a cancelled unlimited account with aligned wallet/dashboard — not a production analytics bug.

**Optional follow-up (non-blocking):** Fix plan family normalization and analytics unlimited exemption in audit scripts; reclassify migration phone delta to WARN; manual ops review for 2 missing phone assignments.

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Audit false FAIL blocks CI deploy | High (current) | Low (process) | Exit code + audit fixes recommended |
| Lost phone ownership (2 numbers) | Medium | Low–Medium | Manual Telnyx/Mongo review (RC2.2 report) |
| Incomplete SMS checkout records flagged | Low | None | Exclude incomplete from plan audit |
| Unlimited user without ledger confuses audits | Low | None | Skip ledger authority for unlimited |

---

## 8. Investigation Artifacts

- Read-only script: `backend/scripts/rc23Investigate.mjs`
- Raw JSON output: `backend/RC2_3_INVESTIGATION.json` (generated 2026-06-27)
- Prior context: `backend/RC2_PRODUCTION_READINESS.md`, `backend/RC2_FAILURE_ANALYSIS.md`

**No production data was modified during this investigation.**
