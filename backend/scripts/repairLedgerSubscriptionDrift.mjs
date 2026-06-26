/**
 * Repair Subscription wallet when it drifted from CreditLedger tail balance.
 * Use when ledger is authoritative and subscription.remainingCredits is wrong.
 *
 *   node scripts/repairLedgerSubscriptionDrift.mjs              # report
 *   node scripts/repairLedgerSubscriptionDrift.mjs --apply      # fix all drifts in sample
 *   node scripts/repairLedgerSubscriptionDrift.mjs --apply --userId=<id>
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import Subscription from "../src/models/Subscription.js";
import {
  rebuildBalanceFromCreditLedger,
  balancesRoughlyEqual,
} from "../src/services/ledgerReconstructionService.js";
import { syncUserCacheFromSubscription } from "../src/services/billingEnforcementGateway.js";

const apply = process.argv.includes("--apply");
const userIdArg = process.argv.find((a) => a.startsWith("--userId="))?.split("=")[1];

async function repairUser(userId) {
  const sub = await Subscription.findOne({ userId }).sort({ createdAt: -1 });
  if (!sub) return { userId, skipped: true, reason: "no_subscription" };

  const ledger = await rebuildBalanceFromCreditLedger(userId);
  if (!(ledger.rowCount > 0)) return { userId, skipped: true, reason: "no_ledger" };

  const subBal = Number(sub.remainingCredits || 0);
  const ledgerBal = Number(ledger.balance || 0);

  if (balancesRoughlyEqual(subBal, ledgerBal)) {
    return { userId, skipped: true, reason: "already_aligned", subscriptionBalance: subBal, ledgerBalance: ledgerBal };
  }

  const row = { userId, subscriptionBalance: subBal, ledgerBalance: ledgerBal, diff: ledgerBal - subBal };
  if (apply) {
    sub.remainingCredits = ledgerBal;
    sub.telecomCredits = ledgerBal;
    await sub.save();
    await syncUserCacheFromSubscription(userId);
    row.repaired = true;
  }
  return row;
}

async function run() {
  await connectDB();

  let userIds = [];
  if (userIdArg) {
    userIds = [userIdArg];
  } else {
    const recent = await User.find({})
      .select("_id")
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    userIds = recent.map((u) => String(u._id));
  }

  const drifts = [];
  for (const uid of userIds) {
    const r = await repairUser(uid);
    if (!r.skipped) drifts.push(r);
  }

  console.log(
    JSON.stringify(
      { ranAt: new Date().toISOString(), apply, scanned: userIds.length, drifts, repaired: drifts.filter((d) => d.repaired).length },
      null,
      2
    )
  );

  await mongoose.disconnect().catch(() => {});
  process.exit(drifts.length > 0 && !apply ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
