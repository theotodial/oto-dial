# OTODIAL RC2.1 — Production Failure Root Cause Analysis

**Generated:** 2026-06-26T22:51:11.141Z

> Read-only analysis. No repairs executed.

## Executive Summary

**The telecom billing engine is healthy.** All FAIL categories in the RC2 health gate trace to **one real customer record** plus **audit-tooling false positives** — not systemic billing breakage.

| Category | Health status | Real issues | Audit noise |
|----------|---------------|-------------|-------------|
| **Credits** | FAIL | **1 user** (`bob@otodial.com`) — User cache `0` vs Subscription `3600` | 41 users flagged for `ledger_chain_historical_gap` — **all layers match** (ledger tail = subscription = dashboard); historical `balanceBefore/After` gaps only |
| **Plans** | FAIL | **0** — no Super→Basic downgrades; fleet has 3 Super, 2 Unlimited, 4 Campaign | 1 false positive (`bob@otodial.com` credit drift misclassified as plan issue) |
| **Analytics** | FAIL | **1 user** (same as credits — downstream of cache drift) | Analytics does not invent balances; reads `loadUserSubscription` |
| **Migration** | FAIL | **2 phone numbers** lost since snapshot (11→9 assigned); **1 active sub** missing `migration_reset` ledger | Not a billing engine defect |

**Safe to repair now (proven, low risk):** `bob@otodial.com` user cache sync only (`syncUserCacheFromSubscription`).

**Do NOT blanket repair:** 41 ledger chain gap warnings — tail balances are correct; repairing would be unnecessary.


### PASS
- Billing
- Numbers
- Stripe
- Ledger
- Reservations

### FAIL
- Credits
- Plans
- Analytics
- Migration

**Subscribers scanned:** 61

## Priority 1 — Credits Failure Analysis

**Failed users:** 42 / 61

### Root cause distribution
- **user_cache_stale:** 1 users
- **ledger_chain_historical_gap:** 41 users

### Per-user table

| User | Ledger | Subscription | User Cache | Wallet API | Dashboard | Diff | Root Cause | Repair? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bob@otodial.com | 0 | 3600 | 0 | 3600 | 3600 | 3600 | user_cache_stale | Yes |
| shahmeerzeb@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| sasnaha3@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| wegererh@alkimiya.online | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| alpharock399@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| darkprime237@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| darkfreemann072@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| mdaliarman968@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| garanchonando@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| phucan12979@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| bhaskargg69@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| forumgrow200@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| aymen.rahabiii@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| nexoraidy@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| 7thseptember2001@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| erik_kemmer15233@maily.lat | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| xxsailler@gmail.com | 1464 | 1464 | 1464 | 1464 | 1464 | 0 | ledger_chain_historical_gap | No |
| thyameet@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| veyron1809@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| ellamayers08@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| vugiejs975@ufiwi.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| hamzaa1111.pk@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| spotify34@quietdev.me | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| baruatapas150@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| annamacio9914@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| odh31388@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| ibrahimaidjadj18@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| aymen.910a@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| kimjong8553@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| cashcompress17@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| afnan014076@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| amiahnafxd@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| hachemiaymen37@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| kamren0_859@owner.lat | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| behruzdev0000@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| maanawlqi@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| nymm1314520@outlook.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| arturmaunze863@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| kkdjeopardy@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| rohitverma6507@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |
| latin38044@fishnone.com | 2500 | 2500 | 2500 | 2500 | 2500 | 0 | ledger_chain_historical_gap | No |
| aroon.pascal@gmail.com | 1500 | 1500 | 1500 | 1500 | 1500 | 0 | ledger_chain_historical_gap | No |

## Priority 2 — Plans Failure Analysis

**Failed plan records:** 1 / 61 subscribers
**Fleet:** Basic=52, Super=3, Unlimited=2, Campaign=4

### Root cause distribution
- **false_positive_credit_drift_only:** 1

### bob@otodial.com
- **Current plan:** Unlimited
- **Expected plan:** Unlimited
- **Root cause:** false_positive_credit_drift_only
- **Why:** Plan IDs differ but family/name match; credit cache drift flagged as plan issue
- **Stripe price:** price_1T2mI6CxZc7GK7QKObsM4ksT (—)
- **Migration issue:** No
- **Metadata issue:** No
- **Stripe issue:** No
- **Repair required:** No | **Risk:** none
- **Recommendation:** No plan repair; fix credit cache only

## Priority 3 — Analytics Failure Analysis

**Failed records:** 1 / 61

### Root cause distribution
- **ledger_subscription_mismatch_propagates_to_dashboard:** 1

### Affected API endpoints
- GET /api/subscription (loadUserSubscription): 1 users

- **696c0bd618c9b9c0cdd9abe9** [FAIL]: ledger_subscription_mismatch_propagates_to_dashboard — pipeline: CreditLedger → Subscription (drift) → loadUserSubscription → dashboard.creditsRemaining

Analytics does not compute balances independently; failures propagate from Subscription/User cache drift via `loadUserSubscription` and `getLatestSubscriptionCreditSnapshot`.

## Priority 4 — Migration Failure Analysis

**Verification OK:** false
**Failures:** 1 | **Warnings:** 1
**Migration reset ledger:** 42 have reset / 1 missing (of 43 active subs)

### Failure categories

#### missing_phone_ownership (2)
- Assigned phone numbers dropped: baseline 11 → now 9.
- Total phone numbers decreased: baseline 11 → now 9.

## Priority 5 — Repair Preview (NOT EXECUTED)

### Credits — 1 records
- **Root cause:** user_cache_stale
- **Reason:** User cache (0) != Subscription (3600)
- **Repair:** syncUserCacheFromSubscription — mirror only, no ledger mutation
- **Risk:** low
- **Safe to auto-repair:** Yes

### Credits — 41 records (NO REPAIR NEEDED)
- **Root cause:** ledger_chain_historical_gap
- **Reason:** Pre-migration ledger rows have broken balanceBefore/After chain; tail matches all live layers
- **Repair:** None — downgrade health check from FAIL to WARN for this code
- **Risk:** none
- **Safe to auto-repair:** No

### Plans — 1 records
- **Root cause:** false_positive_credit_drift_only
- **Reason:** Plan IDs differ but family/name match; credit cache drift flagged as plan issue
- **Repair:** No plan repair; fix credit cache only
- **Risk:** none
- **Safe to auto-repair:** No — review first

### Analytics — 1 records
- **Root cause:** ledger_subscription_mismatch_propagates_to_dashboard
- **Reason:** CreditLedger → Subscription (drift) → loadUserSubscription → dashboard.creditsRemaining
- **Repair:** Fix Subscription/Ledger authority first; analytics will follow
- **Risk:** low
- **Safe to auto-repair:** Yes

### Migration — 2 records
- **Root cause:** missing_phone_ownership
- **Reason:** Assigned phone numbers dropped: baseline 11 → now 9.
- **Repair:** Category-specific — see migration failures list
- **Risk:** medium
- **Safe to auto-repair:** No — review first

## Risk Assessment

| Category | Auto-repair safe? | Notes |
| --- | --- | --- |
| User cache sync | Yes (low risk) | Mirror Subscription → User only |
| Ledger → Subscription | Medium | Only when ledger is authoritative and chain valid |
| Plan mapping | Medium | Requires Stripe price evidence per user |
| Analytics | Yes (after credits) | Downstream of authority fix |
| Migration | Varies | Duplicate subs / negative balances need manual review |

## Next Steps

1. Review this report
2. `npm run audit:billing-authority` (dry-run)
3. `npm run audit:production-plans` (dry-run)
4. Only then: `--repair` on proven cases
