/**
 * RC2 Priority 5 — verify analytics credit figures trace to CreditLedger (not duplicated UI math).
 */

import CreditLedger from "../../models/CreditLedger.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import { balancesRoughlyEqual } from "../ledgerReconstructionService.js";
import { rebuildBalanceFromCreditLedger } from "../ledgerReconstructionService.js";
import { loadUserSubscription } from "../subscriptionService.js";

function round4(v) {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

async function aggregateLedgerForUser(userId) {
  const rows = await CreditLedger.find({ user: userId })
    .select("amount type")
    .lean();

  let granted = 0;
  let used = 0;
  let lifecycle = 0;
  let connected = 0;
  let sms = 0;

  for (const r of rows) {
    const amt = Number(r.amount || 0);
    if (amt > 0) granted += amt;
    if (amt < 0) {
      const debit = -amt;
      used += debit;
      if (r.type === "call_event_charge" || r.type === "outbound_attempt_charge") lifecycle += debit;
      else if (r.type === "connected_duration_charge") connected += debit;
      else if (r.type === "sms_charge" || r.type === "sms_outbound_charge") sms += debit;
    }
  }

  return {
    granted: round4(granted),
    used: round4(used),
    lifecycle: round4(lifecycle),
    connected: round4(connected),
    sms: round4(sms),
    rowCount: rows.length,
  };
}

export async function auditAnalyticsCreditsForUser(userId) {
  const [ledgerAgg, ledgerTail, sub, dashboard] = await Promise.all([
    aggregateLedgerForUser(userId),
    rebuildBalanceFromCreditLedger(userId),
    Subscription.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    loadUserSubscription(userId).catch(() => null),
  ]);

  const remainingFromLedger = round4(ledgerTail.balance);
  const remainingSub = round4(sub?.remainingCredits || 0);
  const remainingDashboard = round4(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0);
  const totalUsedSub = round4(sub?.totalCreditsUsed || 0);
  const ledgerRowCount = ledgerTail.rowCount || ledgerAgg.rowCount || 0;
  const unlimited =
    Boolean(sub?.displayUnlimited) ||
    Boolean(dashboard?.isUnlimited) ||
    /unlimited/i.test(String(sub?.planName || dashboard?.planName || ""));

  // Unlimited accounts intentionally skipped by migration have no CreditLedger history;
  // Subscription is the live authority when wallet/dashboard already match.
  const ledgerAuthorityExempt =
    unlimited &&
    ledgerRowCount === 0 &&
    (!dashboard || balancesRoughlyEqual(remainingDashboard, remainingSub));

  const mismatches = [];
  if (!ledgerAuthorityExempt && !balancesRoughlyEqual(remainingFromLedger, remainingSub)) {
    mismatches.push({
      field: "remainingCredits",
      ledger: remainingFromLedger,
      subscription: remainingSub,
      ...(ledgerAuthorityExempt ? { severity: "warning" } : {}),
    });
  }
  if (dashboard && !balancesRoughlyEqual(remainingDashboard, remainingSub)) {
    mismatches.push({
      field: "dashboard_remaining",
      dashboard: remainingDashboard,
      subscription: remainingSub,
    });
  }
  if (totalUsedSub > 0 && !balancesRoughlyEqual(totalUsedSub, ledgerAgg.used)) {
    mismatches.push({
      field: "totalCreditsUsed",
      subscription: totalUsedSub,
      ledgerDebits: ledgerAgg.used,
      note: "subscription.totalCreditsUsed may lag ledger; informational",
      severity: "warning",
    });
  }

  return {
    userId: String(userId),
    status: mismatches.some((m) => m.severity !== "warning") ? "FAIL" : mismatches.length ? "WARN" : "PASS",
    ledger: { ...ledgerAgg, remaining: remainingFromLedger },
    subscription: {
      remainingCredits: remainingSub,
      totalCreditsUsed: totalUsedSub,
      planName: sub?.planName || null,
    },
    dashboard: dashboard
      ? { creditsRemaining: remainingDashboard, planName: dashboard.planName }
      : null,
    mismatches,
  };
}

export async function auditAnalyticsCredits(options = {}) {
  const { userId, limit = 200 } = options;
  let userIds = userId ? [userId] : [];
  if (!userIds.length) {
    userIds = (await Subscription.distinct("userId")).map(String).slice(0, limit);
  }

  const results = [];
  for (const uid of userIds) {
    results.push(await auditAnalyticsCreditsForUser(uid));
  }

  const globalGrant = await CreditLedger.aggregate([
    { $match: { amount: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const globalUsed = await CreditLedger.aggregate([
    { $match: { amount: { $lt: 0 } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  return {
    scanned: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    warn: results.filter((r) => r.status === "WARN").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    globalLedger: {
      creditsGranted: round4(globalGrant[0]?.total || 0),
      creditsUsed: round4(Math.abs(globalUsed[0]?.total || 0)),
    },
    results,
    mismatches: results.filter((r) => r.mismatches.length),
    status: results.some((r) => r.status === "FAIL") ? "FAIL" : results.some((r) => r.status === "WARN") ? "WARN" : "PASS",
  };
}
