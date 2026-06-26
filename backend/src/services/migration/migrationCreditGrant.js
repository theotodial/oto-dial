/**
 * Single source of truth for "how many telecom credits does this subscription's plan grant?"
 * Used by both the data migration (to reset balances) and verification (to assert correctness).
 */

import { PLAN_CREDITS } from "../../config/creditConfig.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Resolve the monthly telecom credit grant for a subscription, given its plan document.
 * Order of precedence: plan.monthlyCreditsLimit → plan.limits.creditsTotal → PLAN_CREDITS[type/name]
 * → subscription mirrors → plan/subscription minutesTotal (legacy 1:1) → 0.
 *
 * @param {object} subscription - lean subscription
 * @param {object|null} plan - lean plan document (may be null)
 * @returns {number} grant credits (>= 0)
 */
export function resolvePlanCreditGrant(subscription = {}, plan = null) {
  const byPlan =
    num(plan?.monthlyCreditsLimit) ??
    num(plan?.limits?.creditsTotal);
  if (byPlan != null && byPlan > 0) return Math.max(0, byPlan);

  const typeKey = normalize(plan?.type || subscription?.planType || subscription?.planKey);
  const nameKey = normalize(plan?.name || subscription?.planName);
  if (typeKey && PLAN_CREDITS[typeKey] != null) return Math.max(0, Number(PLAN_CREDITS[typeKey]));
  if (nameKey.includes("super")) return Math.max(0, Number(PLAN_CREDITS.super));
  if (nameKey.includes("basic")) return Math.max(0, Number(PLAN_CREDITS.basic));

  const bySub =
    num(subscription?.monthlyCreditsLimit) ??
    num(subscription?.limits?.creditsTotal);
  if (bySub != null && bySub > 0) return Math.max(0, bySub);

  // Legacy fallback: minutes allowance mapped 1:1 to credits.
  const legacy =
    num(plan?.limits?.minutesTotal) ??
    num(subscription?.limits?.minutesTotal) ??
    num(subscription?.minutesLimit);
  if (legacy != null && legacy > 0) return Math.max(0, legacy);

  return 0;
}
