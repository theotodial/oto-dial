import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import AddonPlan from "../models/AddonPlan.js";
import StripeEvent from "../models/StripeEvent.js";
import StripeInvoice from "../models/StripeInvoice.js";
import SubscriptionActivationFailure from "../models/SubscriptionActivationFailure.js";
import Analytics from "../models/Analytics.js";
import { getStripe } from "../../config/stripe.js";
import { syncPaidInvoicesFromStripe } from "./stripeInvoiceSyncService.js";
import {
  getCanonicalPlanKeyFromPriceId,
  isKnownAddonPriceId,
  STRIPE_PLAN_PRICE_IDS
} from "../config/stripeCatalog.js";
import { SMS_CAMPAIGN_PLAN_TYPE } from "../constants/smsCampaignPlan.js";
import {
  applyPlanSnapshotToSubscription
} from "./subscriptionPlanSnapshotService.js";
import { getServerDayKey } from "./unlimitedUsageService.js";
import { getLatestSubscription } from "./subscriptionService.js";
import { applyUserEntitlementsForPlan } from "./userPlanEntitlementsService.js";

const MUTABLE_MONGO_STATUSES = ["active", "pending_activation", "past_due", "incomplete"];
const REPAIRABLE_STRIPE_STATUSES = new Set(["active", "trialing", "past_due", "incomplete"]);

function isValidObjectId(value) {
  return typeof value === "string" && mongoose.Types.ObjectId.isValid(value);
}

function toDateFromUnix(seconds, fallbackDate = new Date()) {
  if (!seconds || Number.isNaN(Number(seconds))) {
    return fallbackDate;
  }
  return new Date(Number(seconds) * 1000);
}

function mapStripeStatusToMongoStatus(stripeStatus) {
  if (stripeStatus === "canceled" || stripeStatus === "unpaid") {
    return "cancelled";
  }
  if (stripeStatus === "past_due") {
    return "past_due";
  }
  if (stripeStatus === "incomplete" || stripeStatus === "incomplete_expired") {
    return "incomplete";
  }
  return "active";
}

function getPrimaryPriceIdFromStripeSubscription(stripeSubscription) {
  return stripeSubscription?.items?.data?.[0]?.price?.id || null;
}

function mergeInvoiceMetadata(invoice) {
  const fromInvoice = invoice?.metadata || {};
  const fromSubscriptionDetails = invoice?.parent?.subscription_details?.metadata || {};

  return {
    ...fromSubscriptionDetails,
    ...fromInvoice
  };
}

function extractClientIp(...metadataObjects) {
  for (const metadata of metadataObjects) {
    if (!metadata || typeof metadata !== "object") {
      continue;
    }
    if (metadata.clientIp) {
      return metadata.clientIp;
    }
    if (metadata.ipAddress) {
      return metadata.ipAddress;
    }
  }
  return null;
}

async function recordActivationFailure({
  sourceEventId = null,
  sourceEventType = null,
  invoiceId = null,
  checkoutSessionId = null,
  stripeSubscriptionId = null,
  stripeCustomerId = null,
  userId = null,
  planId = null,
  reason,
  payload = {}
}) {
  try {
    await SubscriptionActivationFailure.create({
      sourceEventId,
      sourceEventType,
      invoiceId,
      checkoutSessionId,
      stripeSubscriptionId,
      stripeCustomerId,
      userId: isValidObjectId(String(userId || "")) ? userId : null,
      planId: isValidObjectId(String(planId || "")) ? planId : null,
      reason,
      payload,
      status: "open"
    });
  } catch (err) {
    console.error("❌ Failed to persist activation failure:", err.message);
  }
}

function getEffectiveInvoiceDate(invoiceDoc) {
  if (invoiceDoc?.issuedAt instanceof Date && !Number.isNaN(invoiceDoc.issuedAt.getTime())) {
    return invoiceDoc.issuedAt;
  }
  if (invoiceDoc?.createdAt instanceof Date && !Number.isNaN(invoiceDoc.createdAt.getTime())) {
    return invoiceDoc.createdAt;
  }
  return null;
}

function isWithinDateWindow(date, startDate, endDate) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return false;
  }
  if (startDate instanceof Date && !Number.isNaN(startDate.getTime()) && date < startDate) {
    return false;
  }
  if (endDate instanceof Date && !Number.isNaN(endDate.getTime()) && date > endDate) {
    return false;
  }
  return true;
}

async function upsertOpenFailureFromInvoice({
  invoiceDoc,
  userId = null,
  stripeCustomerId = null,
  reason,
  payload = {}
}) {
  if (!reason) {
    throw new Error("Reason is required for activation failure upsert");
  }

  const safeUserId = isValidObjectId(String(userId || "")) ? userId : null;
  const safeCustomerId = stripeCustomerId || invoiceDoc?.customerId || null;
  const query = invoiceDoc?.invoiceId
    ? { invoiceId: invoiceDoc.invoiceId, status: "open" }
    : {
        stripeCustomerId: safeCustomerId,
        userId: safeUserId,
        status: "open",
        sourceEventType: "reconciliation.paid_invoice_scan"
      };

  const existing = await SubscriptionActivationFailure.findOne(query);
  if (existing) {
    existing.sourceEventType = "reconciliation.paid_invoice_scan";
    existing.invoiceId = invoiceDoc?.invoiceId || existing.invoiceId;
    existing.stripeSubscriptionId = invoiceDoc?.subscriptionId || existing.stripeSubscriptionId;
    existing.stripeCustomerId = safeCustomerId || existing.stripeCustomerId;
    existing.userId = safeUserId || existing.userId;
    existing.reason = reason;
    existing.payload = payload;
    existing.resolvedAt = null;
    existing.resolvedBy = null;
    existing.status = "open";
    await existing.save();
    return { created: false, failure: existing };
  }

  const created = await SubscriptionActivationFailure.create({
    sourceEventId: null,
    sourceEventType: "reconciliation.paid_invoice_scan",
    invoiceId: invoiceDoc?.invoiceId || null,
    checkoutSessionId: invoiceDoc?.checkoutSessionId || null,
    stripeSubscriptionId: invoiceDoc?.subscriptionId || null,
    stripeCustomerId: safeCustomerId,
    userId: safeUserId,
    planId: isValidObjectId(String(invoiceDoc?.planId || "")) ? invoiceDoc.planId : null,
    reason,
    payload,
    status: "open"
  });

  return { created: true, failure: created };
}

async function resolveOpenInvoiceFailures(invoiceId, resolvedBy = "auto_reconciliation") {
  if (!invoiceId) {
    return 0;
  }

  const result = await SubscriptionActivationFailure.updateMany(
    {
      invoiceId,
      status: "open"
    },
    {
      $set: {
        status: "resolved",
        resolvedAt: new Date(),
        resolvedBy
      }
    }
  );

  return result.modifiedCount || 0;
}

function toPositiveInteger(value, fallback, maxValue = null) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  if (Number.isFinite(maxValue) && parsed > maxValue) {
    return maxValue;
  }
  return parsed;
}

async function resolvePlan({
  planId = null,
  planName = null,
  stripePriceId = null,
  fallbackPlanId = null
}) {
  if (planId && isValidObjectId(planId)) {
    const byId = await Plan.findOne({ _id: planId, active: true });
    if (byId) {
      return byId;
    }
  }

  if (stripePriceId) {
    const byPrice = await Plan.findOne({ stripePriceId, active: true });
    if (byPrice) {
      return byPrice;
    }
  }

  const canonicalPlanKey = getCanonicalPlanKeyFromPriceId(stripePriceId);
  if (canonicalPlanKey === "unlimited") {
    const unlimitedPlan = await Plan.findOne({
      $or: [
        { type: /unlimited/i },
        { name: /unlimited/i },
        { planName: /unlimited/i }
      ],
      active: true
    });
    if (unlimitedPlan) {
      return unlimitedPlan;
    }
  }
  if (canonicalPlanKey === "super") {
    const superPlan = await Plan.findOne({ name: /super/i, active: true });
    if (superPlan) {
      return superPlan;
    }
  }
  if (canonicalPlanKey === "basic") {
    const basicPlan = await Plan.findOne({ name: /basic/i, active: true });
    if (basicPlan) {
      return basicPlan;
    }
  }
  if (canonicalPlanKey === SMS_CAMPAIGN_PLAN_TYPE) {
    const smsCampaign = await Plan.findOne({
      $or: [
        { type: SMS_CAMPAIGN_PLAN_TYPE },
        { stripePriceId: STRIPE_PLAN_PRICE_IDS[SMS_CAMPAIGN_PLAN_TYPE] },
        { smsCampaignPlan: true }
      ],
      active: true
    });
    if (smsCampaign) {
      return smsCampaign;
    }
  }

  if (planName) {
    const byName = await Plan.findOne({
      name: new RegExp(`^${String(planName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      active: true
    });
    if (byName) {
      return byName;
    }
  }

  if (fallbackPlanId && isValidObjectId(String(fallbackPlanId))) {
    const byFallback = await Plan.findOne({ _id: fallbackPlanId, active: true });
    if (byFallback) {
      return byFallback;
    }
  }

  return null;
}

async function updateAnalyticsForActivatedSubscription(userId, subscriptionId) {
  try {
    await Analytics.updateMany(
      { userId },
      {
        $set: {
          hasSubscription: true,
          subscriptionId
        }
      }
    );
  } catch (analyticsError) {
    console.warn("⚠️ Failed to update analytics for subscription:", analyticsError.message);
  }
}

async function syncStripeInvoiceToMongo(invoice, eventType = null) {
  if (!invoice?.id) {
    return null;
  }

  const metadata = mergeInvoiceMetadata(invoice);
  const customerId = invoice.customer || metadata.customerId || null;
  const subscriptionId = invoice.subscription || null;
  const purchaseType = metadata.purchaseType || (metadata.addonId ? "addon" : (subscriptionId ? "subscription" : "unknown"));

  let user = null;
  if (metadata.userId && isValidObjectId(metadata.userId)) {
    user = await User.findById(metadata.userId);
  }
  if (!user && customerId) {
    user = await User.findOne({ stripeCustomerId: customerId });
  }

  const invoiceStatus = invoice.paid
    ? "paid"
    : ["open", "void", "uncollectible", "draft"].includes(invoice.status)
      ? invoice.status
      : "unknown";

  return StripeInvoice.findOneAndUpdate(
    { invoiceId: invoice.id },
    {
      invoiceId: invoice.id,
      customerId: customerId || "unknown",
      subscriptionId,
      checkoutSessionId: metadata.checkoutSessionId || null,
      paymentIntentId: invoice.payment_intent || metadata.paymentIntentId || null,
      userId: user?._id || null,
      planId: isValidObjectId(metadata.planId) ? metadata.planId : null,
      addonId: isValidObjectId(metadata.addonId) ? metadata.addonId : null,
      purchaseType: ["subscription", "addon", "unknown"].includes(purchaseType)
        ? purchaseType
        : "unknown",
      status: invoiceStatus,
      amountPaid: Number((invoice.amount_paid || 0) / 100),
      currency: (invoice.currency || "usd").toLowerCase(),
      invoicePdf: invoice.invoice_pdf || null,
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      clientIp: extractClientIp(metadata),
      eventType: eventType || null,
      rawMetadata: metadata,
      issuedAt: toDateFromUnix(invoice.created, null)
    },
    { upsert: true, new: true }
  );
}

async function createOrUpdatePendingSubscription({
  user,
  plan,
  stripeSubscriptionId = null,
  stripeCustomerId = null,
  checkoutSessionId = null,
  stripePriceId = null,
  periodStart = new Date(),
  periodEnd = null
}) {
  const computedPeriodEnd = periodEnd || (() => {
    const date = new Date(periodStart);
    date.setDate(date.getDate() + 30);
    return date;
  })();

  let subscription = null;

  if (stripeSubscriptionId) {
    subscription = await Subscription.findOne({
      userId: user._id,
      stripeSubscriptionId
    });
  }

  if (!subscription) {
    subscription = await Subscription.findOne({
      userId: user._id,
      status: { $in: ["pending_activation", "active", "past_due", "incomplete"] }
    }).sort({ createdAt: -1 });
  }

  if (!subscription) {
    subscription = new Subscription({
      userId: user._id,
      planId: plan._id,
      stripeSubscriptionId: stripeSubscriptionId || null,
      stripeCustomerId: stripeCustomerId || user.stripeCustomerId || null,
      checkoutSessionId: checkoutSessionId || null,
      stripePriceId: stripePriceId || plan.stripePriceId || null,
      status: "pending_activation",
      periodStart,
      periodEnd: computedPeriodEnd,
      usage: { minutesUsed: 0, smsUsed: 0 },
      addons: { minutes: 0, sms: 0 },
      usageWindowDateKey: getServerDayKey()
    });
  } else {
    subscription.planId = plan._id;
    subscription.stripePriceId = stripePriceId || plan.stripePriceId || subscription.stripePriceId;
    subscription.stripeCustomerId = stripeCustomerId || user.stripeCustomerId || subscription.stripeCustomerId;
    subscription.checkoutSessionId = checkoutSessionId || subscription.checkoutSessionId;
    subscription.status = subscription.status === "active" ? "active" : "pending_activation";
    subscription.periodStart = periodStart || subscription.periodStart;
    subscription.periodEnd = computedPeriodEnd || subscription.periodEnd;
    subscription.usageWindowDateKey = subscription.usageWindowDateKey || getServerDayKey();
  }

  applyPlanSnapshotToSubscription(subscription, plan);

  await subscription.save();
  return subscription;
}

async function activateSubscriptionAtomic({
  user,
  subscription,
  invoiceId = null,
  stripeSubscriptionId = null
}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const plan = await Plan.findById(subscription.planId).session(session);
    const target = await Subscription.findById(subscription._id).session(session);
    if (!target) {
      throw new Error("Subscription no longer exists");
    }

    target.status = "active";
    if (stripeSubscriptionId) {
      target.stripeSubscriptionId = stripeSubscriptionId;
    }
    target.stripeCustomerId = user.stripeCustomerId || target.stripeCustomerId;
    if (invoiceId) {
      target.latestInvoiceId = invoiceId;
    }
    await target.save({ session });

    await Subscription.updateMany(
      {
        userId: user._id,
        _id: { $ne: target._id },
        status: { $in: MUTABLE_MONGO_STATUSES }
      },
      { $set: { status: "cancelled" } },
      { session }
    );

    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          activeSubscriptionId: target._id,
          currentPlanId: target.planId,
          lastSubscriptionSyncAt: new Date(),
          stripeCustomerId: user.stripeCustomerId || target.stripeCustomerId || null,
        },
        $unset: {
          subscriptionActive: "",
          currentSubscriptionLimits: "",
          plan: "",
          minutesUsed: "",
          smsUsed: "",
        },
      },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    await updateAnalyticsForActivatedSubscription(user._id, target._id);

    const planDoc = await Plan.findById(target.planId).lean();
    if (planDoc) {
      await applyUserEntitlementsForPlan(user._id, planDoc);
    }

    return target;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

async function applyAddonFromCheckoutSession(session) {
  const metadata = session.metadata || {};
  const userId = metadata.userId;
  const addonId = metadata.addonId;
  const addonType = metadata.addonType;
  const addonQuantity = parseInt(metadata.addonQuantity || "0", 10);

  if (!isValidObjectId(userId) || !isValidObjectId(addonId) || !addonType || Number.isNaN(addonQuantity)) {
    throw new Error("Invalid add-on checkout metadata");
  }

  const [user, addon, latestLean] = await Promise.all([
    User.findById(userId),
    AddonPlan.findById(addonId),
    getLatestSubscription(userId),
  ]);

  const subscription = latestLean
    ? await Subscription.findById(latestLean._id)
    : null;

  if (!user) {
    throw new Error("Add-on purchase user not found");
  }
  if (!addon || !addon.active) {
    throw new Error("Add-on definition missing or inactive");
  }
  if (!subscription) {
    throw new Error("Subscription missing for add-on credit assignment");
  }

  const now = new Date();

  if (addonType === "minutes") {
    const baseDate =
      subscription.addonsMinutesExpiry && subscription.addonsMinutesExpiry > now
        ? subscription.addonsMinutesExpiry
        : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + 30);

    subscription.addons.minutes = (subscription.addons?.minutes || 0) + addonQuantity;
    subscription.addonsMinutesExpiry = newExpiry;
  } else if (addonType === "sms") {
    const baseDate =
      subscription.addonsSmsExpiry && subscription.addonsSmsExpiry > now
        ? subscription.addonsSmsExpiry
        : now;
    const newExpiry = new Date(baseDate);
    newExpiry.setDate(newExpiry.getDate() + 30);

    subscription.addons.sms = (subscription.addons?.sms || 0) + addonQuantity;
    subscription.addonsSmsExpiry = newExpiry;
  } else {
    throw new Error(`Unknown add-on type: ${addonType}`);
  }

  await subscription.save();

  return {
    userId: user._id,
    subscriptionId: subscription._id
  };
}

async function syncSubscriptionFromStripeObject(stripeSubscription, stripe, sourceEventType = "sync") {
  const customerId = stripeSubscription.customer;
  const subscriptionId = stripeSubscription.id;
  const metadata = stripeSubscription.metadata || {};

  if (metadata?.isAddon === "true" || metadata?.addonId) {
    return { success: true, skipped: true };
  }

  const user = await User.findOne({ stripeCustomerId: customerId });
  if (!user) {
    await recordActivationFailure({
      sourceEventType,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      reason: "User not found for Stripe customer",
      payload: { customerId, subscriptionId }
    });
    return { success: false, error: "User not found" };
  }

  if (!user.stripeCustomerId && customerId) {
    user.stripeCustomerId = customerId;
    await user.save();
  }

  let effectiveMetadata = { ...metadata };
  if (!effectiveMetadata.planId && customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      effectiveMetadata = {
        ...(customer?.metadata || {}),
        ...effectiveMetadata
      };
    } catch (err) {
      console.warn(`⚠️ Could not fetch customer ${customerId} metadata:`, err.message);
    }
  }

  const stripePriceId = getPrimaryPriceIdFromStripeSubscription(stripeSubscription);
  const plan = await resolvePlan({
    planId: effectiveMetadata.planId,
    planName: effectiveMetadata.planName,
    stripePriceId,
    fallbackPlanId: user.currentPlanId
  });

  if (!plan) {
    await recordActivationFailure({
      sourceEventType,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      userId: user._id,
      reason: "Unable to resolve plan for Stripe subscription",
      payload: {
        metadata: effectiveMetadata,
        stripePriceId
      }
    });
    return { success: false, error: "Plan not resolved" };
  }

  const status = mapStripeStatusToMongoStatus(stripeSubscription.status);
  const periodStart = toDateFromUnix(stripeSubscription.current_period_start, new Date());
  const periodEnd = toDateFromUnix(stripeSubscription.current_period_end, (() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  })());

  let subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (!subscription) {
    subscription = await Subscription.findOne({ userId: user._id }).sort({
      createdAt: -1,
    });
  }

  if (!subscription) {
    subscription = new Subscription({
      userId: user._id,
      planId: plan._id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      stripePriceId: stripePriceId || plan.stripePriceId || null,
      status,
      periodStart,
      periodEnd,
      usage: { minutesUsed: 0, smsUsed: 0 },
      addons: { minutes: 0, sms: 0 },
      usageWindowDateKey: getServerDayKey()
    });
  } else {
    subscription.userId = user._id;
    subscription.planId = plan._id;
    subscription.status = status;
    subscription.periodStart = periodStart;
    subscription.periodEnd = periodEnd;
    subscription.stripeSubscriptionId = subscriptionId;
    subscription.stripeCustomerId = customerId;
    subscription.stripePriceId = stripePriceId || plan.stripePriceId || subscription.stripePriceId;
    subscription.usageWindowDateKey = subscription.usageWindowDateKey || getServerDayKey();
  }

  applyPlanSnapshotToSubscription(subscription, plan);

  await subscription.save();

  if (status === "active") {
    await activateSubscriptionAtomic({
      user,
      subscription,
      stripeSubscriptionId: subscriptionId
    });
  } else if (status === "cancelled") {
    if (user.activeSubscriptionId?.toString() === subscription._id.toString()) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          activeSubscriptionId: null,
          currentPlanId: null,
          lastSubscriptionSyncAt: new Date(),
        },
        $unset: {
          subscriptionActive: "",
          currentSubscriptionLimits: "",
          plan: "",
          minutesUsed: "",
          smsUsed: "",
        },
      });
    }
  }

  return {
    success: true,
    userId: user._id,
    subscriptionId: subscription._id
  };
}

async function ensureSubscriptionActivationFromInvoice(invoice, stripe, sourceEventType, sourceEventId = null) {
  const metadata = mergeInvoiceMetadata(invoice);
  const customerId = invoice.customer;
  const stripeSubscriptionId = invoice.subscription;

  if (!customerId) {
    await recordActivationFailure({
      sourceEventId,
      sourceEventType,
      invoiceId: invoice.id,
      reason: "Invoice missing Stripe customer ID",
      payload: { invoiceId: invoice.id }
    });
    return { success: false, error: "Missing customer ID" };
  }

  let user = null;
  if (metadata.userId && isValidObjectId(metadata.userId)) {
    user = await User.findById(metadata.userId);
  }
  if (!user) {
    user = await User.findOne({ stripeCustomerId: customerId });
  }

  if (!user) {
    await recordActivationFailure({
      sourceEventId,
      sourceEventType,
      invoiceId: invoice.id,
      stripeSubscriptionId,
      stripeCustomerId: customerId,
      reason: "User not found for paid invoice",
      payload: { metadata }
    });
    return { success: false, error: "User not found" };
  }

  if (!user.stripeCustomerId) {
    user.stripeCustomerId = customerId;
    await user.save();
  }

  const invoicePurchaseType = metadata.purchaseType || (metadata.addonId ? "addon" : (stripeSubscriptionId ? "subscription" : "unknown"));
  const linePriceIds = Array.isArray(invoice?.lines?.data)
    ? invoice.lines.data.map((line) => line?.price?.id).filter(Boolean)
    : [];
  const looksLikeAddonInvoice = linePriceIds.some((priceId) => isKnownAddonPriceId(priceId));

  if (invoicePurchaseType === "addon" || looksLikeAddonInvoice) {
    return { success: true, skippedActivation: true };
  }

  let subscription = null;
  if (stripeSubscriptionId) {
    subscription = await Subscription.findOne({ stripeSubscriptionId });
  }

  let stripeSubscription = null;
  if (stripeSubscriptionId) {
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (err) {
      console.warn(`⚠️ Failed to retrieve Stripe subscription ${stripeSubscriptionId}:`, err.message);
    }
  }

  if (!subscription && stripeSubscription) {
    const syncResult = await syncSubscriptionFromStripeObject(
      stripeSubscription,
      stripe,
      `${sourceEventType}:invoice-sync`
    );
    if (!syncResult.success) {
      return syncResult;
    }
    subscription = await Subscription.findById(syncResult.subscriptionId);
  }

  if (!subscription) {
    const plan = await resolvePlan({
      planId: metadata.planId,
      planName: metadata.planName,
      stripePriceId: stripeSubscription ? getPrimaryPriceIdFromStripeSubscription(stripeSubscription) : null,
      fallbackPlanId: user.currentPlanId
    });

    if (!plan) {
      await recordActivationFailure({
        sourceEventId,
        sourceEventType,
        invoiceId: invoice.id,
        stripeSubscriptionId,
        stripeCustomerId: customerId,
        userId: user._id,
        reason: "Subscription activation failed because plan could not be resolved",
        payload: { metadata }
      });
      return { success: false, error: "Plan not resolved for activation" };
    }

    subscription = await createOrUpdatePendingSubscription({
      user,
      plan,
      stripeSubscriptionId,
      stripeCustomerId: customerId,
      stripePriceId: stripeSubscription ? getPrimaryPriceIdFromStripeSubscription(stripeSubscription) : plan.stripePriceId,
      periodStart: stripeSubscription
        ? toDateFromUnix(stripeSubscription.current_period_start, new Date())
        : new Date(),
      periodEnd: stripeSubscription
        ? toDateFromUnix(stripeSubscription.current_period_end, null)
        : null
    });
  }

  try {
    const activatedSubscription = await activateSubscriptionAtomic({
      user,
      subscription,
      invoiceId: invoice.id,
      stripeSubscriptionId
    });

    console.log(
      `✅ SUBSCRIPTION ACTIVATED: User ${user.email} (${user._id}) → Subscription ${activatedSubscription._id}`
    );

    return {
      success: true,
      userId: user._id,
      subscriptionId: activatedSubscription._id
    };
  } catch (err) {
    await recordActivationFailure({
      sourceEventId,
      sourceEventType,
      invoiceId: invoice.id,
      stripeSubscriptionId,
      stripeCustomerId: customerId,
      userId: user._id,
      planId: subscription?.planId || null,
      reason: `Payment succeeded but MongoDB activation transaction failed: ${err.message}`,
      payload: { invoiceId: invoice.id }
    });
    return { success: false, error: err.message };
  }
}

/**
 * Process checkout.session.completed event
 */
export async function processCheckoutCompleted(event, stripe) {
  const session = event.data.object;

  if (session.payment_status !== "paid") {
    console.warn(`⚠️ Checkout session ${session.id} not paid, status: ${session.payment_status}`);
    return { success: false, error: "Payment not completed" };
  }

  const metadata = session.metadata || {};
  const userId = metadata.userId;
  const isAddon = metadata.purchaseType === "addon" || !!metadata.addonId;

  if (!userId || !isValidObjectId(userId)) {
    await recordActivationFailure({
      sourceEventId: event.id,
      sourceEventType: event.type,
      checkoutSessionId: session.id,
      stripeSubscriptionId: session.subscription || null,
      stripeCustomerId: session.customer || null,
      reason: "Checkout session missing valid userId metadata",
      payload: { metadata }
    });
    return { success: false, error: "Missing userId in metadata" };
  }

  if (isAddon) {
    try {
      const addonResult = await applyAddonFromCheckoutSession(session);

      if (session.invoice) {
        try {
          const invoice = typeof session.invoice === "string"
            ? await stripe.invoices.retrieve(session.invoice)
            : session.invoice;
          await syncStripeInvoiceToMongo(invoice, event.type);
        } catch (invoiceErr) {
          console.warn(`⚠️ Failed invoice sync for add-on session ${session.id}:`, invoiceErr.message);
        }
      }

      console.log(`✅ Applied add-on purchase for user ${addonResult.userId} from checkout session ${session.id}`);

      return {
        success: true,
        userId: addonResult.userId,
        subscriptionId: addonResult.subscriptionId
      };
    } catch (err) {
      await recordActivationFailure({
        sourceEventId: event.id,
        sourceEventType: event.type,
        checkoutSessionId: session.id,
        stripeSubscriptionId: session.subscription || null,
        stripeCustomerId: session.customer || null,
        userId,
        reason: `Paid add-on checkout failed to apply credits: ${err.message}`,
        payload: { metadata }
      });
      return { success: false, error: err.message };
    }
  }

  const planId = metadata.planId;
  const planName = metadata.planName;

  if (!planId) {
    await recordActivationFailure({
      sourceEventId: event.id,
      sourceEventType: event.type,
      checkoutSessionId: session.id,
      stripeSubscriptionId: session.subscription || null,
      stripeCustomerId: session.customer || null,
      userId,
      reason: "Checkout session missing planId metadata",
      payload: { metadata }
    });
    return { success: false, error: "Missing planId in metadata" };
  }

  const user = await User.findById(userId);
  if (!user) {
    await recordActivationFailure({
      sourceEventId: event.id,
      sourceEventType: event.type,
      checkoutSessionId: session.id,
      stripeSubscriptionId: session.subscription || null,
      stripeCustomerId: session.customer || null,
      userId,
      reason: "Checkout completed but user not found",
      payload: { metadata }
    });
    return { success: false, error: "User not found" };
  }

  const plan = await resolvePlan({
    planId,
    planName
  });

  if (!plan) {
    await recordActivationFailure({
      sourceEventId: event.id,
      sourceEventType: event.type,
      checkoutSessionId: session.id,
      stripeSubscriptionId: session.subscription || null,
      stripeCustomerId: session.customer || null,
      userId,
      reason: "Checkout completed but plan not found or inactive",
      payload: { metadata }
    });
    return { success: false, error: "Plan not found or inactive" };
  }

  if (!user.stripeCustomerId && session.customer) {
    user.stripeCustomerId = session.customer;
    await user.save();
  }

  try {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    const subscription = await createOrUpdatePendingSubscription({
      user,
      plan,
      stripeSubscriptionId: session.subscription || null,
      stripeCustomerId: session.customer || user.stripeCustomerId || null,
      checkoutSessionId: session.id,
      stripePriceId: plan.stripePriceId,
      periodStart: now,
      periodEnd
    });

    if (session.invoice) {
      try {
        const invoice = typeof session.invoice === "string"
          ? await stripe.invoices.retrieve(session.invoice)
          : session.invoice;
        await syncStripeInvoiceToMongo(invoice, event.type);
      } catch (invoiceErr) {
        console.warn(`⚠️ Failed invoice sync for checkout session ${session.id}:`, invoiceErr.message);
      }
    }

    console.log(
      `✅ Subscription ${subscription._id} created (pending_activation) for user ${user.email} with plan ${plan.name}`
    );

    return {
      success: true,
      subscriptionId: subscription._id,
      userId: user._id
    };
  } catch (err) {
    await recordActivationFailure({
      sourceEventId: event.id,
      sourceEventType: event.type,
      checkoutSessionId: session.id,
      stripeSubscriptionId: session.subscription || null,
      stripeCustomerId: session.customer || null,
      userId,
      planId: plan._id,
      reason: `Payment succeeded but failed to create pending subscription: ${err.message}`,
      payload: { metadata }
    });
    return { success: false, error: err.message };
  }
}

/**
 * Process invoice.payment_succeeded and invoice.paid events
 */
export async function processInvoicePaymentSucceeded(event, stripe) {
  const invoice = event.data.object;

  try {
    await syncStripeInvoiceToMongo(invoice, event.type);
  } catch (syncErr) {
    console.error(`❌ Failed to sync invoice ${invoice?.id}:`, syncErr.message);
  }

  const metadata = mergeInvoiceMetadata(invoice);
  const linePriceIds = Array.isArray(invoice?.lines?.data)
    ? invoice.lines.data.map((line) => line?.price?.id).filter(Boolean)
    : [];
  const looksLikeAddonInvoice = linePriceIds.some((priceId) => isKnownAddonPriceId(priceId));

  if (metadata.addonId || metadata.purchaseType === "addon" || looksLikeAddonInvoice) {
    return {
      success: true,
      invoiceId: invoice.id,
      skippedActivation: true
    };
  }

  return ensureSubscriptionActivationFromInvoice(
    invoice,
    stripe,
    event.type,
    event.id
  );
}

/**
 * Process customer.subscription.updated and customer.subscription.created events
 */
export async function processSubscriptionUpdated(event, stripe) {
  const stripeSubscription = event.data.object;
  const priceId = getPrimaryPriceIdFromStripeSubscription(stripeSubscription);

  if (isKnownAddonPriceId(priceId) || stripeSubscription.metadata?.isAddon === "true" || stripeSubscription.metadata?.addonId) {
    console.log(`ℹ️ Skipping add-on Stripe subscription update ${stripeSubscription.id}`);
    return { success: true };
  }

  return syncSubscriptionFromStripeObject(stripeSubscription, stripe, event.type);
}

/**
 * Process customer.subscription.deleted event
 */
export async function processSubscriptionDeleted(event, stripe) {
  const stripeSubscription = event.data.object;
  const priceId = getPrimaryPriceIdFromStripeSubscription(stripeSubscription);

  if (isKnownAddonPriceId(priceId) || stripeSubscription.metadata?.isAddon === "true" || stripeSubscription.metadata?.addonId) {
    console.log(`ℹ️ Skipping add-on Stripe subscription deletion ${stripeSubscription.id}`);
    return { success: true };
  }

  const customerId = stripeSubscription.customer;
  const subscriptionId = stripeSubscription.id;
  const user = await User.findOne({ stripeCustomerId: customerId });

  if (!user) {
    await recordActivationFailure({
      sourceEventType: event.type,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      reason: "Subscription deletion received for unknown user",
      payload: { customerId, subscriptionId }
    });
    return { success: false, error: "User not found" };
  }

  let subscription = await Subscription.findOne({ stripeSubscriptionId: subscriptionId });
  if (!subscription) {
    subscription = await Subscription.findOne({ userId: user._id }).sort({
      createdAt: -1,
    });
  }

  if (subscription) {
    subscription.status = "cancelled";
    await subscription.save();

    if (user.activeSubscriptionId?.toString() === subscription._id.toString()) {
      await User.findByIdAndUpdate(user._id, {
        $set: {
          activeSubscriptionId: null,
          currentPlanId: null,
          lastSubscriptionSyncAt: new Date(),
        },
        $unset: {
          subscriptionActive: "",
          currentSubscriptionLimits: "",
          plan: "",
          minutesUsed: "",
          smsUsed: "",
        },
      });
    }
  }

  return { success: true };
}

/**
 * Admin/User repair helper: re-sync Stripe subscriptions and invoices for user.
 */
export async function repairUserSubscriptionFromStripe({
  userId = null,
  stripeCustomerId = null,
  reason = "manual_repair"
}) {
  const stripe = getStripe();
  if (!stripe) {
    return { success: false, error: "Stripe not configured" };
  }

  const user = userId
    ? await User.findById(userId)
    : await User.findOne({ stripeCustomerId });

  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (!user.stripeCustomerId) {
    return { success: false, error: "User has no Stripe customer ID" };
  }

  const stripeSubscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: "all",
    limit: 50
  });

  if (!stripeSubscriptions.data.length) {
    return { success: false, error: "No Stripe subscriptions found for user" };
  }

  const statusPriority = {
    active: 4,
    trialing: 3,
    past_due: 2,
    incomplete: 1
  };

  const sorted = [...stripeSubscriptions.data].sort(
    (a, b) => (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0)
  );

  let primary = null;
  const syncResults = [];

  for (const stripeSub of sorted) {
    const priceId = getPrimaryPriceIdFromStripeSubscription(stripeSub);
    if (isKnownAddonPriceId(priceId) || stripeSub.metadata?.isAddon === "true" || stripeSub.metadata?.addonId) {
      continue;
    }

    const result = await syncSubscriptionFromStripeObject(
      stripeSub,
      stripe,
      `repair:${reason}`
    );
    syncResults.push({
      stripeSubscriptionId: stripeSub.id,
      status: stripeSub.status,
      success: result.success
    });

    if (!primary && REPAIRABLE_STRIPE_STATUSES.has(stripeSub.status)) {
      primary = stripeSub;
    }
  }

  if (primary) {
    const invoices = await stripe.invoices.list({
      subscription: primary.id,
      customer: user.stripeCustomerId,
      limit: 10
    });

    const paidInvoice = invoices.data.find((invoice) => invoice.paid);
    if (paidInvoice) {
      await syncStripeInvoiceToMongo(paidInvoice, `repair:${reason}:invoice-sync`);
      await ensureSubscriptionActivationFromInvoice(
        paidInvoice,
        stripe,
        `repair:${reason}`,
        null
      );
    }
  }

  user.lastSubscriptionSyncAt = new Date();
  await user.save();

  const activeSubscription = await Subscription.findOne({
    userId: user._id,
    status: "active"
  }).sort({ updatedAt: -1 });

  return {
    success: true,
    userId: user._id,
    stripeCustomerId: user.stripeCustomerId,
    repairedSubscriptionId: activeSubscription?._id || null,
    syncResults
  };
}

/**
 * Lightweight self-healing helper for login/protected requests.
 * Uses lean queries for the fast path.
 */
export async function selfHealSubscriptionForUser(userId, reason = "self_heal") {
  if (!userId) {
    return { success: false, skipped: true, reason: "missing_user_id" };
  }

  const user = await User.findById(userId).lean();
  if (!user || !user.stripeCustomerId) {
    return { success: false, skipped: true, reason: "missing_stripe_customer" };
  }

  const activeSubscription = await Subscription.findOne({
    userId: user._id,
    status: "active"
  })
    .select("_id")
    .lean();

  const userLinkedToActiveSub =
    !!activeSubscription &&
    !!user.activeSubscriptionId &&
    user.activeSubscriptionId.toString() === activeSubscription._id.toString();

  if (userLinkedToActiveSub) {
    return { success: true, skipped: true, reason: "already_consistent" };
  }

  const cooldownMs = 2 * 60 * 1000;
  if (user.lastSubscriptionSyncAt && Date.now() - new Date(user.lastSubscriptionSyncAt).getTime() < cooldownMs) {
    return { success: false, skipped: true, reason: "cooldown" };
  }

  return repairUserSubscriptionFromStripe({
    userId: user._id,
    reason
  });
}

/** Throttle map: avoid queuing duplicate background heals */
const bgHealQueued = new Map();
const BG_HEAL_DEBOUNCE_MS = 45 * 1000;

/**
 * Non-blocking Stripe self-heal for read paths (subscription GET, middleware).
 * Does not delay HTTP responses — critical for dashboard performance.
 */
export function scheduleBackgroundSelfHeal(userId, reason = "background_heal") {
  if (!userId) return;
  const key = String(userId);
  const now = Date.now();
  const nextOk = bgHealQueued.get(key) || 0;
  if (now < nextOk) return;
  bgHealQueued.set(key, now + BG_HEAL_DEBOUNCE_MS);
  setImmediate(() => {
    selfHealSubscriptionForUser(userId, reason).catch((e) =>
      console.warn(`⚠️ Background self-heal (${reason}):`, e?.message || e)
    );
  });
}

/**
 * Reconcile paid Stripe invoices with Mongo subscriptions.
 * This catches missed webhook windows and creates visible activation failures.
 */
export async function reconcilePaidSubscriptionInvoices({
  startDate = null,
  endDate = null,
  maxInvoices = 250,
  autoRepair = true,
  performStripeSync = false,
  stripeSyncMaxPages = 6,
  reason = "reconciliation_scan"
} = {}) {
  const stripe = getStripe();
  const now = new Date();
  const normalizedStartDate = startDate instanceof Date && !Number.isNaN(startDate.getTime())
    ? startDate
    : new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  const normalizedEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime())
    ? endDate
    : now;

  const summary = {
    success: true,
    startDate: normalizedStartDate.toISOString(),
    endDate: normalizedEndDate.toISOString(),
    scanned: 0,
    healthy: 0,
    mismatchesDetected: 0,
    repaired: 0,
    unresolved: 0,
    failuresCreated: 0,
    failuresResolved: 0,
    stripeSync: null,
    unresolvedSamples: []
  };

  if (performStripeSync) {
    try {
      summary.stripeSync = await syncPaidInvoicesFromStripe({
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        maxPages: toPositiveInteger(stripeSyncMaxPages, 6, 30)
      });
    } catch (syncErr) {
      summary.stripeSync = {
        skipped: false,
        error: syncErr.message
      };
    }
  }

  const candidateInvoices = await StripeInvoice.find({
    status: "paid",
    $or: [
      { purchaseType: "subscription" },
      { purchaseType: "unknown", subscriptionId: { $ne: null } }
    ]
  })
    .sort({ issuedAt: -1, createdAt: -1 })
    .limit(toPositiveInteger(maxInvoices, 250, 1000));

  for (const invoiceDoc of candidateInvoices) {
    const effectiveDate = getEffectiveInvoiceDate(invoiceDoc);
    if (!isWithinDateWindow(effectiveDate, normalizedStartDate, normalizedEndDate)) {
      continue;
    }

    summary.scanned += 1;

    const customerId = invoiceDoc.customerId && invoiceDoc.customerId !== "unknown"
      ? invoiceDoc.customerId
      : null;
    let user = null;

    if (invoiceDoc.userId && isValidObjectId(String(invoiceDoc.userId))) {
      user = await User.findById(invoiceDoc.userId);
    }

    if (!user && customerId) {
      user = await User.findOne({ stripeCustomerId: customerId });
    }

    if (!user && stripe && customerId) {
      try {
        const stripeCustomer = await stripe.customers.retrieve(customerId);
        if (stripeCustomer && !stripeCustomer.deleted && stripeCustomer.email) {
          const normalizedEmail = String(stripeCustomer.email).trim().toLowerCase();
          user = await User.findOne({ email: normalizedEmail });

          if (user && !user.stripeCustomerId) {
            user.stripeCustomerId = customerId;
            await user.save();
          }
        }
      } catch (customerErr) {
        console.warn(
          `⚠️ Reconciliation could not retrieve Stripe customer ${customerId}:`,
          customerErr.message
        );
      }
    }

    if (user && (!invoiceDoc.userId || invoiceDoc.userId.toString() !== user._id.toString())) {
      invoiceDoc.userId = user._id;
      await invoiceDoc.save();
    }

    if (!user) {
      const upsert = await upsertOpenFailureFromInvoice({
        invoiceDoc,
        stripeCustomerId: customerId,
        reason: "Paid Stripe invoice exists but no matching OTO Dial user was found",
        payload: {
          customerId,
          invoiceId: invoiceDoc.invoiceId,
          source: reason
        }
      });
      if (upsert.created) {
        summary.failuresCreated += 1;
      }
      summary.unresolved += 1;
      if (summary.unresolvedSamples.length < 10) {
        summary.unresolvedSamples.push({
          invoiceId: invoiceDoc.invoiceId,
          customerId,
          reason: "user_not_found"
        });
      }
      continue;
    }

    if (!user.stripeCustomerId && customerId) {
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const activeSubscription = await Subscription.findOne({
      userId: user._id,
      status: "active"
    }).sort({ updatedAt: -1 });

    if (activeSubscription) {
      summary.healthy += 1;
      summary.failuresResolved += await resolveOpenInvoiceFailures(
        invoiceDoc.invoiceId,
        "auto_reconciliation"
      );
      continue;
    }

    summary.mismatchesDetected += 1;

    const mismatchUpsert = await upsertOpenFailureFromInvoice({
      invoiceDoc,
      userId: user._id,
      stripeCustomerId: customerId,
      reason: "Paid Stripe invoice exists but user has no active MongoDB subscription",
      payload: {
        userId: user._id,
        userEmail: user.email,
        customerId,
        invoiceId: invoiceDoc.invoiceId,
        invoiceSubscriptionId: invoiceDoc.subscriptionId || null,
        source: reason
      }
    });
    if (mismatchUpsert.created) {
      summary.failuresCreated += 1;
    }

    let repairResult = null;
    let repairedSubscriptionId = null;

    if (autoRepair) {
      repairResult = await repairUserSubscriptionFromStripe({
        userId: user._id,
        stripeCustomerId: customerId || user.stripeCustomerId || null,
        reason: `${reason}:${invoiceDoc.invoiceId || "invoice"}`
      });

      repairedSubscriptionId = repairResult?.repairedSubscriptionId || null;
      if (!repairedSubscriptionId) {
        const activeAfterRepair = await Subscription.findOne({
          userId: user._id,
          status: "active"
        }).select("_id");
        repairedSubscriptionId = activeAfterRepair?._id || null;
      }
    }

    if (repairedSubscriptionId) {
      summary.repaired += 1;
      summary.healthy += 1;
      summary.failuresResolved += await resolveOpenInvoiceFailures(
        invoiceDoc.invoiceId,
        "auto_reconciliation"
      );
      continue;
    }

    if (mismatchUpsert?.failure?._id && repairResult) {
      await SubscriptionActivationFailure.findByIdAndUpdate(
        mismatchUpsert.failure._id,
        {
          $set: {
            payload: {
              ...(mismatchUpsert.failure.payload || {}),
              repairAttempt: {
                success: !!repairResult.success,
                error: repairResult.error || null
              }
            }
          }
        }
      );
    }

    summary.unresolved += 1;
    if (summary.unresolvedSamples.length < 10) {
      summary.unresolvedSamples.push({
        invoiceId: invoiceDoc.invoiceId,
        customerId,
        userId: user._id,
        userEmail: user.email,
        reason: repairResult?.error || "no_active_subscription_after_repair"
      });
    }
  }

  return summary;
}

/**
 * Check if event was already processed (idempotency)
 */
export async function isEventProcessed(eventId) {
  const event = await StripeEvent.findOne({ eventId });
  return event && event.processed;
}

/**
 * Mark event as processed
 */
export async function markEventProcessed(eventId, eventType, success, error = null) {
  await StripeEvent.findOneAndUpdate(
    { eventId },
    {
      $set: {
        eventId,
        type: eventType,
        processed: success,
        processedAt: new Date(),
        error
      },
      $inc: { retryCount: 1 }
    },
    { upsert: true }
  );
}

export default {
  processCheckoutCompleted,
  processInvoicePaymentSucceeded,
  processSubscriptionUpdated,
  processSubscriptionDeleted,
  repairUserSubscriptionFromStripe,
  selfHealSubscriptionForUser,
  reconcilePaidSubscriptionInvoices,
  isEventProcessed,
  markEventProcessed
};
