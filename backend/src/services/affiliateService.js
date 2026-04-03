import crypto from "crypto";
import Affiliate from "../models/Affiliate.js";
import AffiliateReferral from "../models/AffiliateReferral.js";
import Plan from "../models/Plan.js";
import {
  AFFILIATE_UNLIMITED_LIMITS,
  AFFILIATE_UNLIMITED_PLAN_NAME,
  AFFILIATE_UNLIMITED_PLAN_TYPE,
  AFFILIATE_UNLIMITED_STRIPE_PRICE_ID
} from "../constants/affiliatePlan.js";

export function generateAffiliateCode(prefix = "AFF") {
  const raw = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}${raw}`;
}

export function resolveFrontendUrl(req) {
  const configuredUrl = (process.env.FRONTEND_URL || process.env.APP_URL || "").trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  const originHeader = req.get("origin");
  if (originHeader && /^https?:\/\//i.test(originHeader)) {
    return originHeader.replace(/\/+$/, "");
  }

  const host = req.get("host");
  if (host) {
    return `${req.protocol}://${host}`;
  }

  return "http://localhost:5173";
}

export function buildOAuthState(payload = {}) {
  try {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  } catch {
    return null;
  }
}

export function parseOAuthState(rawState = "") {
  if (!rawState) {
    return {};
  }

  try {
    const decoded = Buffer.from(String(rawState), "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function ensureAffiliateUnlimitedPlan() {
  let plan = await Plan.findOne({
    $or: [
      { type: AFFILIATE_UNLIMITED_PLAN_TYPE },
      { stripePriceId: AFFILIATE_UNLIMITED_STRIPE_PRICE_ID },
      { name: new RegExp(`^${AFFILIATE_UNLIMITED_PLAN_NAME}$`, "i") }
    ]
  });

  if (!plan) {
    plan = await Plan.create({
      type: AFFILIATE_UNLIMITED_PLAN_TYPE,
      name: AFFILIATE_UNLIMITED_PLAN_NAME,
      planName: AFFILIATE_UNLIMITED_PLAN_NAME,
      price: 119.99,
      currency: "USD",
      stripeProductId: "prod_Tj3I37A5KEUqJG",
      stripePriceId: AFFILIATE_UNLIMITED_STRIPE_PRICE_ID,
      limits: {
        minutesTotal: AFFILIATE_UNLIMITED_LIMITS.monthlyMinutesLimit,
        smsTotal: AFFILIATE_UNLIMITED_LIMITS.monthlySmsLimit,
        numbersTotal: AFFILIATE_UNLIMITED_LIMITS.dedicatedNumbers
      },
      monthlySmsLimit: AFFILIATE_UNLIMITED_LIMITS.monthlySmsLimit,
      monthlyMinutesLimit: AFFILIATE_UNLIMITED_LIMITS.monthlyMinutesLimit,
      dailySmsLimit: AFFILIATE_UNLIMITED_LIMITS.dailySmsLimit,
      dailyMinutesLimit: AFFILIATE_UNLIMITED_LIMITS.dailyMinutesLimit,
      dedicatedNumbers: AFFILIATE_UNLIMITED_LIMITS.dedicatedNumbers,
      displayUnlimited: true,
      active: true
    });
    return plan;
  }

  let dirty = false;

  if (plan.type !== AFFILIATE_UNLIMITED_PLAN_TYPE) {
    plan.type = AFFILIATE_UNLIMITED_PLAN_TYPE;
    dirty = true;
  }
  if (plan.planName !== AFFILIATE_UNLIMITED_PLAN_NAME) {
    plan.planName = AFFILIATE_UNLIMITED_PLAN_NAME;
    dirty = true;
  }
  if (plan.stripePriceId !== AFFILIATE_UNLIMITED_STRIPE_PRICE_ID) {
    plan.stripePriceId = AFFILIATE_UNLIMITED_STRIPE_PRICE_ID;
    dirty = true;
  }
  if (!plan.displayUnlimited) {
    plan.displayUnlimited = true;
    dirty = true;
  }
  if (!plan.monthlySmsLimit) {
    plan.monthlySmsLimit = AFFILIATE_UNLIMITED_LIMITS.monthlySmsLimit;
    dirty = true;
  }
  if (!plan.monthlyMinutesLimit) {
    plan.monthlyMinutesLimit = AFFILIATE_UNLIMITED_LIMITS.monthlyMinutesLimit;
    dirty = true;
  }
  if (!plan.dailySmsLimit) {
    plan.dailySmsLimit = AFFILIATE_UNLIMITED_LIMITS.dailySmsLimit;
    dirty = true;
  }
  if (!plan.dailyMinutesLimit) {
    plan.dailyMinutesLimit = AFFILIATE_UNLIMITED_LIMITS.dailyMinutesLimit;
    dirty = true;
  }

  const desiredLimits = {
    minutesTotal: plan.monthlyMinutesLimit,
    smsTotal: plan.monthlySmsLimit,
    numbersTotal: AFFILIATE_UNLIMITED_LIMITS.dedicatedNumbers
  };
  if (
    Number(plan.limits?.minutesTotal || 0) !== desiredLimits.minutesTotal ||
    Number(plan.limits?.smsTotal || 0) !== desiredLimits.smsTotal ||
    Number(plan.limits?.numbersTotal || 0) !== desiredLimits.numbersTotal
  ) {
    plan.limits = desiredLimits;
    dirty = true;
  }

  if (!plan.active) {
    plan.active = true;
    dirty = true;
  }

  if (dirty) {
    await plan.save();
  }

  return plan;
}

export function buildAffiliateReferralLink(req, affiliateCode) {
  const frontend = resolveFrontendUrl(req);
  return `${frontend}/signup?ref=${encodeURIComponent(affiliateCode)}`;
}

export async function attachAffiliateReferralToUser({
  user,
  affiliateCode,
  source = "register"
}) {
  if (!user || !affiliateCode) {
    return { attached: false, reason: "missing_user_or_code" };
  }

  const normalizedCode = String(affiliateCode).trim().toUpperCase();
  if (!normalizedCode) {
    return { attached: false, reason: "empty_code" };
  }

  const affiliate = await Affiliate.findOne({
    affiliateCode: normalizedCode,
    status: "approved"
  });

  if (!affiliate) {
    return { attached: false, reason: "affiliate_not_found_or_not_approved" };
  }

  // Do not override an existing referral owner.
  if (user.referredByAffiliate && String(user.referredByAffiliate) !== String(affiliate._id)) {
    return { attached: false, reason: "already_referred_by_other_affiliate" };
  }

  user.referredByAffiliate = affiliate._id;
  user.referredByAffiliateCode = normalizedCode;
  user.affiliateReferredAt = user.affiliateReferredAt || new Date();
  await user.save();

  await AffiliateReferral.updateOne(
    { userId: user._id },
    {
      $setOnInsert: {
        affiliateId: affiliate._id,
        userId: user._id,
        userEmail: user.email || null,
        referralCode: normalizedCode,
        source,
        status: "signed_up"
      }
    },
    { upsert: true }
  );

  return {
    attached: true,
    affiliateId: affiliate._id,
    affiliateCode: normalizedCode
  };
}

export async function markAffiliateReferralPaid({
  userId,
  subscriptionId = null
}) {
  if (!userId) {
    return { updated: false };
  }

  const result = await AffiliateReferral.updateOne(
    { userId },
    {
      $set: {
        status: "paid",
        convertedAt: new Date(),
        latestSubscriptionId: subscriptionId || null
      }
    }
  );

  return {
    updated: result.modifiedCount > 0
  };
}

export default {
  attachAffiliateReferralToUser,
  buildAffiliateReferralLink,
  buildOAuthState,
  ensureAffiliateUnlimitedPlan,
  generateAffiliateCode,
  markAffiliateReferralPaid,
  parseOAuthState,
  resolveFrontendUrl
};
