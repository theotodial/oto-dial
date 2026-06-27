/**
 * RC2.2 — Repair the single confirmed User cache drift (bob@otodial.com only).
 * Uses syncUserCacheFromSubscription() — no custom repair logic.
 *
 *   node scripts/repairConfirmedCacheDrift.mjs           # dry-run (before values only)
 *   node scripts/repairConfirmedCacheDrift.mjs --apply   # execute sync
 */

import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../src/models/User.js";
import Subscription from "../src/models/Subscription.js";
import { syncUserCacheFromSubscription } from "../src/services/billingEnforcementGateway.js";
import { auditBillingAuthorityForUser } from "../src/services/production/productionBillingAuthorityService.js";

const TARGET_EMAIL = "bob@otodial.com";
const apply = process.argv.includes("--apply");

async function snapshotLayers(userId) {
  const audit = await auditBillingAuthorityForUser(userId);
  return {
    email: audit.email,
    userId: audit.userId,
    layers: audit.layers,
    status: audit.status,
    failures: audit.failures,
  };
}

async function run() {
  await connectDB();

  const user = await User.findOne({ email: TARGET_EMAIL }).select("_id email remainingCredits").lean();
  if (!user) {
    console.error(`Target user not found: ${TARGET_EMAIL}`);
    process.exit(1);
  }

  const sub = await Subscription.findOne({ userId: user._id })
    .sort({ createdAt: -1 })
    .select("remainingCredits planName status")
    .lean();

  const before = {
    userCache: Number(user.remainingCredits ?? 0),
    subscription: Number(sub?.remainingCredits ?? 0),
    audit: await snapshotLayers(user._id),
  };

  const report = {
    target: TARGET_EMAIL,
    userId: String(user._id),
    apply,
    before,
    after: null,
    syncResult: null,
  };

  if (apply) {
    report.syncResult = await syncUserCacheFromSubscription(user._id);
    const userAfter = await User.findById(user._id).select("remainingCredits").lean();
    report.after = {
      userCache: Number(userAfter?.remainingCredits ?? 0),
      subscription: Number(sub?.remainingCredits ?? 0),
      audit: await snapshotLayers(user._id),
    };
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
