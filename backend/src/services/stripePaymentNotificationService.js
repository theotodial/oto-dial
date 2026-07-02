import User from "../models/User.js";
import { createAdminNotification } from "./adminNotificationService.js";

function formatMoney(amountCents, currency = "usd") {
  const amount = Number(amountCents || 0) / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: String(currency || "usd").toUpperCase()
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currency || "usd").toUpperCase()}`;
  }
}

function resolveDedupeKey({ paymentIntentId, invoiceId, sessionId, fallbackId }) {
  if (paymentIntentId) return `stripe_sale:pi:${paymentIntentId}`;
  if (invoiceId) return `stripe_sale:inv:${invoiceId}`;
  if (sessionId) return `stripe_sale:cs:${sessionId}`;
  if (fallbackId) return `stripe_sale:${fallbackId}`;
  return null;
}

async function resolveUserEmail(userId) {
  if (!userId) return null;
  try {
    const user = await User.findById(userId).select("email").lean();
    return user?.email || null;
  } catch {
    return null;
  }
}

function describePurchaseType(metadata = {}) {
  if (metadata.purchaseType === "addon" || metadata.addonId) return "Add-on purchase";
  if (metadata.purchaseType === "subscription" || metadata.planName) {
    return metadata.planName ? `Subscription: ${metadata.planName}` : "Subscription payment";
  }
  return "Payment";
}

/**
 * Notify admins of a successful Stripe payment (invoice or checkout session).
 * Dedupes across invoice + checkout webhooks for the same charge.
 */
export async function notifyAdminStripePayment({
  invoice = null,
  session = null,
  userId: userIdHint = null,
  eventId = null
} = {}) {
  const metadata = {
    ...(session?.metadata || {}),
    ...(invoice?.metadata || {}),
    ...(invoice?.lines?.data?.[0]?.metadata || {})
  };

  const userId =
    userIdHint ||
    metadata.userId ||
    invoice?.metadata?.userId ||
    session?.metadata?.userId ||
    null;

  const paymentIntentId =
    (typeof invoice?.payment_intent === "string" ? invoice.payment_intent : invoice?.payment_intent?.id) ||
    (typeof session?.payment_intent === "string" ? session.payment_intent : session?.payment_intent?.id) ||
    null;

  const invoiceId = invoice?.id || null;
  const sessionId = session?.id || null;

  const amountCents =
    invoice?.amount_paid ??
    session?.amount_total ??
    invoice?.amount_due ??
    0;
  const currency = invoice?.currency || session?.currency || "usd";

  const dedupeKey = resolveDedupeKey({
    paymentIntentId,
    invoiceId,
    sessionId,
    fallbackId: eventId
  });

  if (!dedupeKey) return null;

  const userEmail = await resolveUserEmail(userId);
  const amountLabel = formatMoney(amountCents, currency);
  const purchaseLabel = describePurchaseType(metadata);
  const payerLabel = userEmail || (userId ? `user ${userId}` : "customer");

  return createAdminNotification({
    type: "sale",
    title: "Payment received",
    message: `${payerLabel} paid ${amountLabel} (${purchaseLabel})`,
    sourceModel: invoiceId ? "StripeInvoice" : "StripeCheckoutSession",
    sourceId: invoiceId || sessionId || paymentIntentId || eventId,
    dedupeKey,
    data: {
      amountPaid: Number(amountCents || 0) / 100,
      currency,
      userId: userId ? String(userId) : null,
      userEmail,
      purchaseType: metadata.purchaseType || null,
      planId: metadata.planId || null,
      planName: metadata.planName || null,
      addonId: metadata.addonId || null,
      stripeCustomerId: invoice?.customer || session?.customer || null,
      stripeSubscriptionId: invoice?.subscription || session?.subscription || null,
      stripeInvoiceId: invoiceId,
      stripeSessionId: sessionId,
      stripePaymentIntentId: paymentIntentId
    }
  });
}

export default { notifyAdminStripePayment };
