/**
 * Repair User credit cache mirrors from authoritative Subscription wallet.
 * Optionally reports Subscription vs CreditLedger tail drift (read-only report).
 *
 * Usage:
 *   node scripts/repairWalletDrift.mjs           # dry-run report
 *   node scripts/repairWalletDrift.mjs --apply   # sync User cache from Subscription
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
import { syncSubscriptionReservedFromTimelines } from "../src/services/reservationReconciliationService.js";

const apply = process.argv.includes("--apply");
const limit = Number(process.env.REPAIR_WALLET_LIMIT || 500);

async function run() {
  await connectDB();
  const users = await User.find({})
    .select("_id email remainingCredits reservedCredits")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  const report = {
    ranAt: new Date().toISOString(),
    apply,
    scanned: users.length,
    cacheDrift: [],
    ledgerDrift: [],
    repaired: 0,
  };

  for (const user of users) {
    const sub = await Subscription.findOne({ userId: user._id })
      .sort({ createdAt: -1 })
      .select("remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased")
      .lean();
    if (!sub) continue;

    const subBal = Number(sub.remainingCredits || 0);
    const userBal = Number(user.remainingCredits || 0);
    const subRes = Number(sub.reservedCredits || 0);
    const userRes = Number(user.reservedCredits || 0);

    if (!balancesRoughlyEqual(subBal, userBal) || !balancesRoughlyEqual(subRes, userRes)) {
      report.cacheDrift.push({
        userId: String(user._id),
        email: user.email,
        userBalance: userBal,
        subscriptionBalance: subBal,
        userReserved: userRes,
        subscriptionReserved: subRes,
      });
      if (apply) {
        await syncUserCacheFromSubscription(user._id);
        await syncSubscriptionReservedFromTimelines(user._id);
        report.repaired += 1;
      }
    }

    const ledger = await rebuildBalanceFromCreditLedger(user._id);
    if ((ledger.rowCount || 0) > 0 && !balancesRoughlyEqual(ledger.balance, subBal)) {
      report.ledgerDrift.push({
        userId: String(user._id),
        email: user.email,
        subscriptionBalance: subBal,
        ledgerBalance: ledger.balance,
        diff: ledger.balance - subBal,
        chainValid: ledger.chainValid,
      });
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect().catch(() => {});
  process.exit(report.ledgerDrift.length > 0 && !apply ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
