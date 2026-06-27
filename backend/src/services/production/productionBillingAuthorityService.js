/**
 * RC2 Priority 4 — billing authority chain audit per subscriber.
 * CreditLedger → Subscription → User cache → Dashboard → projected balance.
 */

import User from "../../models/User.js";
import { reconcileUserWallet } from "../creditReconciliationService.js";
import { computeProjectedUserBalance } from "../projectedBalanceService.js";
import { getLatestSubscriptionCreditSnapshot } from "../creditLedgerService.js";
import { loadUserSubscription } from "../subscriptionService.js";
import { balancesRoughlyEqual } from "../ledgerReconstructionService.js";
import { syncUserCacheFromSubscription } from "../billingEnforcementGateway.js";
import Subscription from "../../models/Subscription.js";
import { rebuildBalanceFromCreditLedger } from "../ledgerReconstructionService.js";

export async function auditBillingAuthorityForUser(userId) {
  const [wallet, projected, walletApi, dashboard] = await Promise.all([
    reconcileUserWallet(userId),
    computeProjectedUserBalance(userId),
    getLatestSubscriptionCreditSnapshot(userId),
    loadUserSubscription(userId).catch(() => null),
  ]);

  const layers = {
    ledgerTail: Number(wallet.wallet?.ledgerBalance ?? 0),
    subscription: Number(wallet.wallet?.subscriptionBalance ?? 0),
    userCache: Number(wallet.wallet?.userBalance ?? 0),
    walletApi: Number(walletApi?.remainingCredits ?? 0),
    dashboard: Number(dashboard?.creditsRemaining ?? dashboard?.remainingCredits ?? 0),
    projectedAvailable: Number(projected?.projectedAvailableCredits ?? 0),
    reservedSubscription: Number(wallet.wallet?.subscriptionReserved ?? 0),
    reservedUser: Number(wallet.wallet?.userReserved ?? 0),
    reservedProjected: Number(projected?.reservedCredits ?? 0),
  };

  const failures = [];
  const subBal = layers.subscription;

  if (!wallet.ok) {
    for (const issue of wallet.issues || []) {
      failures.push({
        code: issue.code,
        reason: issue.message,
        severity: issue.severity,
        details: issue,
      });
    }
  }

  if ((wallet.wallet?.ledgerRowCount || 0) > 0 && !balancesRoughlyEqual(layers.ledgerTail, subBal)) {
    failures.push({
      code: "ledger_subscription_mismatch",
      reason: `Ledger tail ${layers.ledgerTail} != Subscription ${subBal}`,
      severity: "critical",
    });
  }
  if (!balancesRoughlyEqual(layers.userCache, subBal)) {
    failures.push({
      code: "user_cache_mismatch",
      reason: `User cache ${layers.userCache} != Subscription ${subBal}`,
      severity: "critical",
    });
  }
  if (walletApi && !balancesRoughlyEqual(layers.walletApi, subBal)) {
    failures.push({
      code: "wallet_api_mismatch",
      reason: `Wallet API ${layers.walletApi} != Subscription ${subBal}`,
      severity: "critical",
    });
  }
  if (dashboard && !balancesRoughlyEqual(layers.dashboard, subBal)) {
    failures.push({
      code: "dashboard_mismatch",
      reason: `Dashboard ${layers.dashboard} != Subscription ${subBal}`,
      severity: "critical",
    });
  }
  if (!balancesRoughlyEqual(layers.reservedUser, layers.reservedSubscription)) {
    failures.push({
      code: "reserved_cache_mismatch",
      reason: `User reserved ${layers.reservedUser} != Subscription reserved ${layers.reservedSubscription}`,
      severity: "warning",
    });
  }

  return {
    userId: String(userId),
    email: wallet.email,
    status: failures.some((f) => f.severity === "critical") ? "FAIL" : failures.length ? "WARN" : "PASS",
    layers,
    failures,
    projected,
  };
}

export async function auditBillingAuthority(options = {}) {
  const { userId, limit = 500 } = options;
  let userIds = [];
  if (userId) {
    userIds = [userId];
  } else {
    userIds = (await Subscription.distinct("userId")).map(String).slice(0, limit);
  }

  const results = [];
  for (const uid of userIds) {
    results.push(await auditBillingAuthorityForUser(uid));
  }

  return {
    scanned: results.length,
    pass: results.filter((r) => r.status === "PASS").length,
    warn: results.filter((r) => r.status === "WARN").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    results,
    failures: results.filter((r) => r.status !== "PASS"),
  };
}

export async function repairBillingAuthority(options = {}) {
  const audit = await auditBillingAuthority(options);
  const repaired = [];
  if (options.dryRun) return { audit, repaired };

  for (const row of audit.failures) {
    const uid = row.userId;
    const ledger = await rebuildBalanceFromCreditLedger(uid);
    if (!(ledger.rowCount > 0)) continue;

    const sub = await Subscription.findOne({ userId: uid }).sort({ createdAt: -1 });
    if (!sub) continue;

    const ledgerBal = Number(ledger.balance || 0);
    const subBal = Number(sub.remainingCredits || 0);
    if (!balancesRoughlyEqual(ledgerBal, subBal)) {
      sub.remainingCredits = ledgerBal;
      sub.telecomCredits = ledgerBal;
      await sub.save();
    }
    await syncUserCacheFromSubscription(uid);
    repaired.push({ userId: uid, action: "synced_from_ledger" });
  }
  return { audit, repaired };
}
