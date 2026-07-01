import mongoose from "mongoose";
import { getStripe } from "../../config/stripe.js";
import StripeInvoice from "../models/StripeInvoice.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import {
  getCanonicalPlanKeyFromPriceId,
  isKnownAddonPriceId,
} from "../config/stripeCatalog.js";
import {
  SMS_CAMPAIGN_1000_STRIPE_PRICE_ID,
  SMS_CAMPAIGN_1700_STRIPE_PRICE_ID,
} from "../constants/smsCampaignPlan.js";
import { syncPaidInvoicesFromStripe } from "./stripeInvoiceSyncService.js";

const INVOICE_PAGE_LIMIT = 100;
const MAX_INVOICE_PAGES = 30;
const MAX_SUB_PAGES = 15;

function centsToUsd(cents) {
  return parseFloat((Number(cents || 0) / 100).toFixed(2));
}

function unixToIso(value) {
  if (!value) return null;
  return new Date(Number(value) * 1000).toISOString();
}

function mapPaymentMethodFromCharge(charge) {
  if (!charge || typeof charge !== "object") return null;
  const card = charge.payment_method_details?.card || charge.card || null;
  const billing = charge.billing_details || {};
  if (!card?.last4 && !billing.name) return null;
  return {
    name: billing.name || null,
    email: billing.email || null,
    brand: card?.brand || null,
    last4: card?.last4 || null,
    expMonth: card?.exp_month || null,
    expYear: card?.exp_year || null,
    funding: card?.funding || null,
    wallet: card?.wallet?.type || null,
  };
}

function planLabelFromPriceId(priceId, planByPriceId) {
  if (!priceId) return null;
  const plan = planByPriceId.get(priceId);
  if (plan) return plan.planName || plan.name;
  if (priceId === SMS_CAMPAIGN_1000_STRIPE_PRICE_ID) return "1000 SMS ($70)";
  if (priceId === SMS_CAMPAIGN_1700_STRIPE_PRICE_ID) return "SMS Campaign 1700 ($90)";
  const key = getCanonicalPlanKeyFromPriceId(priceId);
  if (key === "basic") return "Basic Plan";
  if (key === "super") return "Super Plan";
  if (key === "unlimited") return "Unlimited";
  if (key === "sms_campaign") return "SMS Campaign";
  if (isKnownAddonPriceId(priceId)) return "Add-on";
  return priceId;
}

async function paginateStripeList(listFn, { maxPages, limit = INVOICE_PAGE_LIMIT } = {}) {
  const rows = [];
  let hasMore = true;
  let startingAfter = null;
  let page = 0;

  while (hasMore && page < maxPages) {
    const params = { limit };
    if (startingAfter) params.starting_after = startingAfter;
    const result = await listFn(params);
    const batch = result?.data || [];
    rows.push(...batch);
    hasMore = Boolean(result?.has_more);
    if (batch.length > 0) startingAfter = batch[batch.length - 1].id;
    page += 1;
    if (!batch.length) break;
  }

  rows.truncated = hasMore && page >= maxPages;
  return rows;
}

async function fetchPaidInvoicesFromStripe(stripe) {
  return paginateStripeList(
    (params) =>
      stripe.invoices.list({
        ...params,
        status: "paid",
        expand: [
          "data.payment_intent.latest_charge",
          "data.lines.data.price",
          "data.subscription",
        ],
      }),
    { maxPages: MAX_INVOICE_PAGES }
  );
}

async function fetchAllStripeSubscriptions(stripe) {
  return paginateStripeList(
    (params) =>
      stripe.subscriptions.list({
        ...params,
        status: "all",
        expand: ["data.items.data.price", "data.default_payment_method"],
      }),
    { maxPages: MAX_SUB_PAGES }
  );
}

function extractInvoicePriceId(invoice) {
  const line = invoice?.lines?.data?.[0];
  return line?.price?.id || line?.plan?.id || null;
}

function buildReconciliationFlags({ user, activeMongoSub, stripeSub, priceId, mongoPlanId }) {
  const flags = [];
  if (!user) flags.push("no_user");
  if (user && !user.stripeCustomerId) flags.push("customer_unlinked");
  if (user && !activeMongoSub) flags.push("no_active_subscription");
  if (
    activeMongoSub &&
    stripeSub &&
    activeMongoSub.stripeSubscriptionId &&
    stripeSub.id !== activeMongoSub.stripeSubscriptionId
  ) {
    flags.push("subscription_id_mismatch");
  }
  if (activeMongoSub && priceId && activeMongoSub.stripePriceId && activeMongoSub.stripePriceId !== priceId) {
    flags.push("plan_price_mismatch");
  }
  if (activeMongoSub && mongoPlanId && activeMongoSub.planId && String(activeMongoSub.planId) !== String(mongoPlanId)) {
    flags.push("plan_id_mismatch");
  }
  if (stripeSub && ["canceled", "unpaid", "incomplete_expired"].includes(stripeSub.status)) {
    flags.push("stripe_subscription_inactive");
  }
  return flags;
}

function mapStripeSubscriptionRow(sub) {
  const item = sub?.items?.data?.[0];
  const price = item?.price;
  return {
    id: sub.id,
    customerId: sub.customer || null,
    status: sub.status,
    priceId: price?.id || null,
    planAmount: centsToUsd(price?.unit_amount),
    planInterval: price?.recurring?.interval || null,
    planNickname: price?.nickname || null,
    currentPeriodEnd: unixToIso(sub.current_period_end),
    currentPeriodStart: unixToIso(sub.current_period_start),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: unixToIso(sub.canceled_at),
    defaultPaymentMethod: sub.default_payment_method && typeof sub.default_payment_method === "object"
      ? mapPaymentMethodFromCharge({
          payment_method_details: { card: sub.default_payment_method.card },
          billing_details: sub.default_payment_method.billing_details,
        })
      : null,
  };
}

function buildRow({
  invoice,
  mongoInvoice,
  user,
  activeMongoSub,
  latestMongoSub,
  stripeSub,
  planByPriceId,
  stripeCustomerEmail,
  stripeCustomerName,
}) {
  const priceId = extractInvoicePriceId(invoice) || mongoInvoice?.rawMetadata?.stripePriceId || null;
  const plan = priceId ? planByPriceId.get(priceId) : null;
  const planLabel = planLabelFromPriceId(priceId, planByPriceId);

  const paymentIntent = invoice?.payment_intent;
  const charge =
    typeof paymentIntent === "object" && paymentIntent?.latest_charge
      ? paymentIntent.latest_charge
      : null;
  let paymentMethod = mapPaymentMethodFromCharge(charge);
  if (!paymentMethod && stripeSub?.defaultPaymentMethod) {
    paymentMethod = stripeSub.defaultPaymentMethod;
  }

  const paidAt =
    unixToIso(invoice?.status_transitions?.paid_at) ||
    (mongoInvoice?.issuedAt ? new Date(mongoInvoice.issuedAt).toISOString() : null) ||
    unixToIso(invoice?.created);

  const subscriptionId =
    typeof invoice?.subscription === "string"
      ? invoice.subscription
      : invoice?.subscription?.id || mongoInvoice?.subscriptionId || null;

  const stripeSubStatus = stripeSub?.status || null;
  const mongoSubStatus = activeMongoSub?.status || latestMongoSub?.status || null;
  const isActive =
    stripeSubStatus === "active" || stripeSubStatus === "trialing" || mongoSubStatus === "active";

  const flags = buildReconciliationFlags({
    user,
    activeMongoSub,
    stripeSub,
    priceId,
    mongoPlanId: plan?._id || mongoInvoice?.planId,
  });

  const upcomingAmount =
    stripeSub && !stripeSub.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(stripeSubStatus)
      ? stripeSub.planAmount
      : null;
  const upcomingDate =
    stripeSub && !stripeSub.cancelAtPeriodEnd && ["active", "trialing", "past_due"].includes(stripeSubStatus)
      ? stripeSub.currentPeriodEnd
      : null;

  return {
    key: invoice?.id || mongoInvoice?.invoiceId,
    invoiceId: invoice?.id || mongoInvoice?.invoiceId,
    invoiceNumber: invoice?.number || null,
    customerId: invoice?.customer || mongoInvoice?.customerId || null,
    subscriptionId,
    amountPaid: invoice
      ? centsToUsd(invoice.amount_paid)
      : parseFloat(Number(mongoInvoice?.amountPaid || 0).toFixed(2)),
    currency: (invoice?.currency || mongoInvoice?.currency || "usd").toLowerCase(),
    paidAt,
    paymentMethod,
    userId: user?._id ? String(user._id) : mongoInvoice?.userId ? String(mongoInvoice.userId) : null,
    userEmail: user?.email || stripeCustomerEmail || paymentMethod?.email || null,
    userName: user?.name || stripeCustomerName || paymentMethod?.name || null,
    stripeCustomerLinked: Boolean(user?.stripeCustomerId),
    otodialPlanName: plan?.planName || plan?.name || activeMongoSub?.planName || planLabel,
    otodialPlanType: plan?.type || activeMongoSub?.planType || getCanonicalPlanKeyFromPriceId(priceId),
    stripePriceId: priceId,
    stripePlanLabel: planLabel,
    invoicePlanId: plan?._id ? String(plan._id) : mongoInvoice?.planId ? String(mongoInvoice.planId) : null,
    mongoSubscriptionId: activeMongoSub?._id ? String(activeMongoSub._id) : latestMongoSub?._id ? String(latestMongoSub._id) : null,
    mongoSubscriptionStatus: mongoSubStatus,
    stripeSubscriptionStatus: stripeSubStatus,
    subscriptionActive: isActive,
    cancelAtPeriodEnd: Boolean(stripeSub?.cancelAtPeriodEnd),
    canceledAt: stripeSub?.canceledAt || (latestMongoSub?.status === "cancelled" ? latestMongoSub?.updatedAt : null),
    periodEnd: stripeSub?.currentPeriodEnd || (activeMongoSub?.periodEnd ? new Date(activeMongoSub.periodEnd).toISOString() : null),
    upcomingPaymentDate: upcomingDate,
    upcomingPaymentAmount: upcomingAmount,
    invoicePdf: invoice?.invoice_pdf || mongoInvoice?.invoicePdf || null,
    hostedInvoiceUrl: invoice?.hosted_invoice_url || mongoInvoice?.hostedInvoiceUrl || null,
    purchaseType: mongoInvoice?.purchaseType || (subscriptionId ? "subscription" : "unknown"),
    reconciliation: {
      healthy: flags.length === 0,
      flags,
      needsAttention: flags.some((f) =>
        ["no_user", "no_active_subscription", "plan_price_mismatch", "stripe_subscription_inactive"].includes(f)
      ),
    },
  };
}

export async function buildStripePaidUsersReport({ syncFromStripe = false } = {}) {
  const stripe = getStripe();
  if (!stripe) {
    return {
      available: false,
      error: "Stripe is not configured (STRIPE_SECRET_KEY missing in backend/.env)",
    };
  }

  if (mongoose.connection.readyState !== 1) {
    return {
      available: false,
      error: "MongoDB is not connected — paid user reconciliation requires the database.",
    };
  }

  let syncResult = null;
  if (syncFromStripe) {
    syncResult = await syncPaidInvoicesFromStripe({ maxPages: MAX_INVOICE_PAGES });
  }

  const [stripeInvoices, stripeSubscriptions, plans, mongoInvoices] = await Promise.all([
    fetchPaidInvoicesFromStripe(stripe),
    fetchAllStripeSubscriptions(stripe),
    Plan.find({ active: true }).select("_id name planName type price stripePriceId").lean(),
    StripeInvoice.find({
      status: "paid",
      $or: [
        { purchaseType: "subscription" },
        { purchaseType: "unknown", subscriptionId: { $ne: null } },
      ],
    })
      .sort({ issuedAt: -1, createdAt: -1 })
      .limit(MAX_INVOICE_PAGES * INVOICE_PAGE_LIMIT)
      .lean(),
  ]);

  const planByPriceId = new Map(
    plans.filter((p) => p.stripePriceId).map((p) => [p.stripePriceId, p])
  );

  const stripeSubById = new Map(
    stripeSubscriptions.map((sub) => [sub.id, mapStripeSubscriptionRow(sub)])
  );
  const stripeSubByCustomer = new Map();
  for (const sub of stripeSubById.values()) {
    if (!sub.customerId) continue;
    const existing = stripeSubByCustomer.get(sub.customerId) || [];
    existing.push(sub);
    stripeSubByCustomer.set(sub.customerId, existing);
  }

  const subscriptionInvoices = stripeInvoices.filter((inv) => {
    const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
    if (subId) return true;
    const priceId = extractInvoicePriceId(inv);
    return priceId && !isKnownAddonPriceId(priceId);
  });

  const invoiceIdsFromStripe = new Set(subscriptionInvoices.map((inv) => inv.id));
  const mongoOnlyInvoices = mongoInvoices.filter(
    (doc) => doc.invoiceId && !invoiceIdsFromStripe.has(doc.invoiceId) && doc.subscriptionId
  );

  const customerIds = new Set();
  for (const inv of subscriptionInvoices) {
    if (inv.customer) customerIds.add(String(inv.customer));
  }
  for (const doc of mongoOnlyInvoices) {
    if (doc.customerId && doc.customerId !== "unknown") customerIds.add(doc.customerId);
  }

  const users = await User.find({ stripeCustomerId: { $in: [...customerIds] } })
    .select("_id email name stripeCustomerId activeSubscriptionId")
    .lean();
  const userByCustomer = new Map(users.map((u) => [u.stripeCustomerId, u]));

  const userIds = users.map((u) => u._id);
  const allSubscriptions = await Subscription.find({ userId: { $in: userIds } })
    .sort({ updatedAt: -1 })
    .lean();
  const subsByUser = new Map();
  for (const sub of allSubscriptions) {
    const key = String(sub.userId);
    const list = subsByUser.get(key) || [];
    list.push(sub);
    subsByUser.set(key, list);
  }

  const mongoInvoiceById = new Map(mongoInvoices.map((doc) => [doc.invoiceId, doc]));

  const stripeCustomerCache = new Map();
  async function getStripeCustomer(customerId) {
    if (!customerId || stripeCustomerCache.has(customerId)) {
      return stripeCustomerCache.get(customerId) || null;
    }
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const entry = customer && !customer.deleted
        ? { email: customer.email || null, name: customer.name || null }
        : null;
      stripeCustomerCache.set(customerId, entry);
      return entry;
    } catch {
      stripeCustomerCache.set(customerId, null);
      return null;
    }
  }

  const rows = [];
  for (const invoice of subscriptionInvoices) {
    const customerId = String(invoice.customer || "");
    const subscriptionId =
      typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
    const mongoInvoice = mongoInvoiceById.get(invoice.id) || null;

    let user = userByCustomer.get(customerId) || null;
    if (!user && mongoInvoice?.userId) {
      user = users.find((u) => String(u._id) === String(mongoInvoice.userId)) || null;
      if (!user) {
        const byId = await User.findById(mongoInvoice.userId).select("_id email name stripeCustomerId").lean();
        if (byId) {
          user = byId;
          if (byId.stripeCustomerId) userByCustomer.set(byId.stripeCustomerId, byId);
        }
      }
    }

    const userSubs = user ? subsByUser.get(String(user._id)) || [] : [];
    const activeMongoSub = userSubs.find((s) => s.status === "active") || null;
    const latestMongoSub = userSubs[0] || null;
    const stripeSub =
      (subscriptionId && stripeSubById.get(subscriptionId)) ||
      (customerId && (stripeSubByCustomer.get(customerId) || []).find((s) => s.status === "active")) ||
      (customerId && (stripeSubByCustomer.get(customerId) || [])[0]) ||
      null;

    const stripeCustomer = await getStripeCustomer(customerId);

    rows.push(
      buildRow({
        invoice,
        mongoInvoice,
        user,
        activeMongoSub,
        latestMongoSub,
        stripeSub,
        planByPriceId,
        stripeCustomerEmail: stripeCustomer?.email,
        stripeCustomerName: stripeCustomer?.name,
      })
    );
  }

  for (const mongoInvoice of mongoOnlyInvoices) {
    const customerId = mongoInvoice.customerId;
    const user = userByCustomer.get(customerId) || null;
    const userSubs = user ? subsByUser.get(String(user._id)) || [] : [];
    const activeMongoSub = userSubs.find((s) => s.status === "active") || null;
    const latestMongoSub = userSubs[0] || null;
    const stripeSub =
      (mongoInvoice.subscriptionId && stripeSubById.get(mongoInvoice.subscriptionId)) ||
      (customerId && (stripeSubByCustomer.get(customerId) || [])[0]) ||
      null;
    const stripeCustomer = await getStripeCustomer(customerId);

    rows.push(
      buildRow({
        invoice: null,
        mongoInvoice,
        user,
        activeMongoSub,
        latestMongoSub,
        stripeSub,
        planByPriceId,
        stripeCustomerEmail: stripeCustomer?.email,
        stripeCustomerName: stripeCustomer?.name,
      })
    );
  }

  rows.sort((a, b) => new Date(b.paidAt || 0).getTime() - new Date(a.paidAt || 0).getTime());

  const uniqueCustomers = new Set(rows.map((r) => r.customerId).filter(Boolean));
  const needsAttention = rows.filter((r) => r.reconciliation.needsAttention);
  const activeCount = rows.filter((r) => r.subscriptionActive).length;

  return {
    available: true,
    fetchedAt: new Date().toISOString(),
    sync: syncResult,
    truncated: Boolean(stripeInvoices.truncated),
    summary: {
      totalInvoices: rows.length,
      uniqueCustomers: uniqueCustomers.size,
      activeSubscriptions: activeCount,
      needsAttention: needsAttention.length,
      stripeInvoicesFetched: subscriptionInvoices.length,
      mongoInvoicesIncluded: mongoOnlyInvoices.length,
    },
    rows,
    needsAttention,
  };
}

export default { buildStripePaidUsersReport };
