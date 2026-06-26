/**
 * Phase 5 — Stripe catalog audit (READ-ONLY).
 *
 * Verifies that the Telecom Credit plans map to the correct Stripe prices and that no
 * checkout path can reach a legacy/duplicate/coming-soon plan.
 *
 *   node scripts/migration/auditStripe.mjs
 *
 * Exits non-zero when a critical issue is found (Basic/Super misrouted, purchasable plan
 * missing Stripe config, or duplicate Stripe prices among purchasable plans).
 * Optionally validates prices against the live Stripe API when STRIPE_SECRET_KEY is set.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../../config/db.js";
import Plan from "../../src/models/Plan.js";
import {
  getCanonicalPlanPriceId,
  getCanonicalPlanKeyFromPriceId,
  STRIPE_PLAN_PRICE_IDS,
} from "../../src/config/stripeCatalog.js";

dotenv.config();

function isPurchasable(plan) {
  // Free plans (price 0) and trial plans never go through Stripe checkout, so they are exempt
  // from the "must have a Stripe price" requirement.
  const isFreeOrTrial = plan.type === "trial" || !(Number(plan.price) > 0);
  return Boolean(plan.active) && !plan.adminOnly && !plan.comingSoon && !isFreeOrTrial;
}

async function maybeVerifyWithStripe(priceIds) {
  const key = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) {
    return { checked: false, results: {} };
  }
  let Stripe;
  try {
    Stripe = (await import("stripe")).default;
  } catch {
    console.warn("[auditStripe] 'stripe' package not available — skipping live verification.");
    return { checked: false, results: {} };
  }
  const stripe = new Stripe(key);
  const results = {};
  for (const priceId of priceIds) {
    if (!priceId || String(priceId).startsWith("manual_")) continue;
    try {
      const price = await stripe.prices.retrieve(priceId);
      results[priceId] = {
        active: price.active,
        productId: typeof price.product === "string" ? price.product : price.product?.id,
        unitAmount: price.unit_amount,
        currency: price.currency,
      };
    } catch (err) {
      results[priceId] = { error: err?.message || String(err) };
    }
  }
  return { checked: true, results };
}

async function run() {
  await connectDB();
  console.log("[auditStripe] connected\n");

  const plans = await Plan.find({}).lean();
  const issues = [];
  const warnings = [];
  const report = [];

  // Detect duplicate stripePriceId among purchasable plans.
  const priceUsage = new Map();

  for (const plan of plans) {
    const canonical = getCanonicalPlanPriceId(plan);
    const canonicalKey = getCanonicalPlanKeyFromPriceId(plan.stripePriceId);
    const purchasable = isPurchasable(plan);

    const row = {
      name: plan.name,
      type: plan.type || null,
      price: plan.price,
      active: plan.active,
      adminOnly: Boolean(plan.adminOnly),
      comingSoon: Boolean(plan.comingSoon),
      purchasable,
      stripePriceId: plan.stripePriceId || null,
      canonicalPriceId: canonical || null,
      creditsIncluded: Number(
        plan.limits?.creditsTotal ?? plan.monthlyCreditsLimit ?? plan.limits?.minutesTotal ?? 0
      ),
    };
    report.push(row);

    if (purchasable) {
      if (!plan.stripePriceId) {
        issues.push(`Purchasable plan "${plan.name}" has no stripePriceId.`);
      } else {
        const usage = priceUsage.get(plan.stripePriceId) || [];
        usage.push(plan.name);
        priceUsage.set(plan.stripePriceId, usage);
      }
      if (canonical && plan.stripePriceId && plan.stripePriceId !== canonical) {
        issues.push(
          `Plan "${plan.name}" stripePriceId (${plan.stripePriceId}) != canonical (${canonical}).`
        );
      }
    }

    // Basic/Super must resolve to their dedicated prices.
    const nm = String(plan.name || "").toLowerCase();
    if (purchasable && nm.includes("basic") && plan.stripePriceId !== STRIPE_PLAN_PRICE_IDS.basic) {
      issues.push(
        `Basic plan "${plan.name}" should map to ${STRIPE_PLAN_PRICE_IDS.basic}, found ${plan.stripePriceId}.`
      );
    }
    if (
      purchasable &&
      nm.includes("super") &&
      plan.stripePriceId !== STRIPE_PLAN_PRICE_IDS.super
    ) {
      issues.push(
        `Super plan "${plan.name}" should map to ${STRIPE_PLAN_PRICE_IDS.super}, found ${plan.stripePriceId}.`
      );
    }

    if (purchasable && plan.stripePriceId && !canonicalKey) {
      warnings.push(
        `Plan "${plan.name}" uses stripePriceId ${plan.stripePriceId} that maps to no known canonical plan key (possible legacy price).`
      );
    }
  }

  for (const [priceId, names] of priceUsage.entries()) {
    if (names.length > 1) {
      issues.push(
        `Duplicate Stripe price ${priceId} shared by purchasable plans: ${names.join(", ")}.`
      );
    }
  }

  console.log("[auditStripe] Plan catalog:");
  console.table(report);

  const stripeVerification = await maybeVerifyWithStripe(
    [...new Set(plans.map((p) => p.stripePriceId).filter(Boolean))]
  );
  if (stripeVerification.checked) {
    console.log("\n[auditStripe] Live Stripe price verification:");
    console.table(
      Object.entries(stripeVerification.results).map(([priceId, v]) => ({ priceId, ...v }))
    );
    for (const [priceId, v] of Object.entries(stripeVerification.results)) {
      if (v.error) warnings.push(`Stripe price ${priceId} could not be retrieved: ${v.error}`);
      else if (v.active === false) issues.push(`Stripe price ${priceId} is INACTIVE in Stripe.`);
    }
  } else {
    console.log("\n[auditStripe] (Live Stripe verification skipped — STRIPE_SECRET_KEY not set.)");
  }

  console.log("\n========== AUDIT SUMMARY ==========");
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    warnings.forEach((w) => console.log("  ⚠️  " + w));
  }
  if (issues.length) {
    console.log(`\nCRITICAL ISSUES (${issues.length}):`);
    issues.forEach((i) => console.log("  ❌ " + i));
  } else {
    console.log("\n✅ No critical Stripe catalog issues found.");
  }

  await mongoose.disconnect();
  process.exit(issues.length ? 1 : 0);
}

run().catch(async (err) => {
  console.error("[auditStripe] FAILED", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
