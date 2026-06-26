import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Subscription from "../src/models/Subscription.js";
import User from "../src/models/User.js";
import Plan from "../src/models/Plan.js";

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computePlanCredits(sub, plan) {
  return Math.max(
    0,
    numberOr(
      sub?.monthlyCreditsLimit ??
        plan?.monthlyCreditsLimit ??
        sub?.limits?.creditsTotal ??
        plan?.limits?.creditsTotal ??
        sub?.limits?.minutesTotal ??
        plan?.limits?.minutesTotal ??
        0
    )
  );
}

async function run() {
  await connectDB();
  const subs = await Subscription.find({}).lean();
  const planIds = [...new Set(subs.map((s) => String(s.planId || "")).filter(Boolean))];
  const plans = planIds.length
    ? await Plan.find({ _id: { $in: planIds } })
        .select("_id monthlyCreditsLimit limits")
        .lean()
    : [];
  const planById = new Map(plans.map((p) => [String(p._id), p]));
  let touched = 0;

  for (const sub of subs) {
    const user = await User.findById(sub.userId)
      .select("remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased")
      .lean();
    const plan = sub.planId ? planById.get(String(sub.planId)) : null;
    const planCredits = computePlanCredits(sub, plan);

    // Subscription remains authoritative; User values are only cold-start fallback
    // for legacy rows that do not yet have telecom credit fields initialized.
    const sourceRemaining = Number.isFinite(Number(sub.remainingCredits))
      ? numberOr(sub.remainingCredits, planCredits)
      : (user ? numberOr(user.remainingCredits, planCredits) : planCredits);
    const sourceReserved = Number.isFinite(Number(sub.reservedCredits))
      ? numberOr(sub.reservedCredits, 0)
      : (user ? numberOr(user.reservedCredits, 0) : 0);
    const sourceUsed = Number.isFinite(Number(sub.totalCreditsUsed))
      ? numberOr(sub.totalCreditsUsed, 0)
      : (user ? numberOr(user.totalCreditsUsed, 0) : 0);
    const sourcePurchased = Number.isFinite(Number(sub.lifetimeCreditsPurchased))
      ? numberOr(sub.lifetimeCreditsPurchased, 0)
      : (user ? numberOr(user.lifetimeCreditsPurchased, 0) : 0);
    const telecomCredits = Math.max(
      planCredits,
      numberOr(sub.telecomCredits, 0),
      sourceRemaining
    );

    const patch = {
      telecomCredits,
      remainingCredits: Math.max(0, sourceRemaining),
      reservedCredits: Math.max(0, sourceReserved),
      totalCreditsUsed: Math.max(0, sourceUsed),
      lifetimeCreditsPurchased: Math.max(0, sourcePurchased),
    };

    await Subscription.updateOne({ _id: sub._id }, { $set: patch });
    touched += 1;
  }

  console.log("[migrateSubscriptionTelecomCredits] completed", { touched });
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[migrateSubscriptionTelecomCredits] failed", err);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});

