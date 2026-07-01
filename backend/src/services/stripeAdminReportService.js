import { getStripe } from "../../config/stripe.js";
import StripeInvoice from "../models/StripeInvoice.js";
import StripeEvent from "../models/StripeEvent.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { syncPaidInvoicesFromStripe } from "./stripeInvoiceSyncService.js";

const LIST_LIMIT = 100;
const MAX_PAGES = 3;
const PAYMENTS_MAX_PAGES = 50;

function centsToUsd(cents) {
  return parseFloat((Number(cents || 0) / 100).toFixed(2));
}

function unixToIso(value) {
  if (!value) return null;
  return new Date(Number(value) * 1000).toISOString();
}

function stripeReady() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || "").trim());
}

async function safeMongoCount(model, filter) {
  try {
    if (mongoose.connection.readyState !== 1) return 0;
    return await model.countDocuments(filter);
  } catch {
    return 0;
  }
}

async function paginateStripe(listFn, { limit = LIST_LIMIT, maxPages = MAX_PAGES } = {}) {
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

function mapPaymentMethodDetails(source) {
  const card = source?.payment_method_details?.card || source?.card || null;
  const billing = source?.billing_details || {};
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

function mapCharge(charge) {
  const pm = mapPaymentMethodDetails(charge);
  return {
    id: charge.id,
    paymentIntentId: charge.payment_intent || null,
    customerId: charge.customer || null,
    amount: centsToUsd(charge.amount),
    amountRefunded: centsToUsd(charge.amount_refunded),
    currency: charge.currency || "usd",
    status: charge.status,
    paid: charge.paid,
    refunded: charge.refunded,
    disputed: charge.disputed,
    failureCode: charge.failure_code || null,
    failureMessage: charge.failure_message || null,
    description: charge.description || null,
    receiptUrl: charge.receipt_url || null,
    paymentMethod: pm,
    at: unixToIso(charge.created),
  };
}

function mapPaymentIntent(pi) {
  const latestCharge =
    typeof pi.latest_charge === "object" && pi.latest_charge
      ? pi.latest_charge
      : pi.charges?.data?.[0] || null;
  const pm = latestCharge
    ? mapPaymentMethodDetails(latestCharge)
    : pi.payment_method && typeof pi.payment_method === "object"
      ? mapPaymentMethodDetails({ payment_method_details: { card: pi.payment_method.card }, billing_details: pi.payment_method.billing_details })
      : {};
  return {
    id: pi.id,
    paymentIntentId: pi.id,
    chargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : latestCharge?.id || null,
    customerId: pi.customer || null,
    amount: centsToUsd(pi.amount),
    currency: pi.currency || "usd",
    status: pi.status,
    captureMethod: pi.capture_method || null,
    cancellationReason: pi.cancellation_reason || null,
    lastPaymentError: pi.last_payment_error
      ? {
          code: pi.last_payment_error.code || null,
          message: pi.last_payment_error.message || null,
          declineCode: pi.last_payment_error.decline_code || null,
        }
      : null,
    paymentMethod: pm,
    at: unixToIso(pi.created),
  };
}

async function fetchAllStripePayments(stripe) {
  const [charges, paymentIntents] = await Promise.all([
    paginateStripe(
      (params) =>
        stripe.charges.list({
          ...params,
          expand: ["data.payment_method_details", "data.customer"],
        }),
      { maxPages: PAYMENTS_MAX_PAGES }
    ),
    paginateStripe(
      (params) =>
        stripe.paymentIntents.list({
          ...params,
          expand: ["data.latest_charge", "data.payment_method"],
        }),
      { maxPages: PAYMENTS_MAX_PAGES }
    ),
  ]);

  const truncated = Boolean(charges.truncated || paymentIntents.truncated);
  const mappedCharges = charges.map(mapCharge);
  const chargeByPaymentIntent = new Map();
  for (const charge of mappedCharges) {
    if (charge.paymentIntentId) chargeByPaymentIntent.set(charge.paymentIntentId, charge);
  }

  const payments = mappedCharges
    .filter((c) => c.paid && c.status === "succeeded")
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const failedFromCharges = mappedCharges.filter(
    (c) => c.status === "failed" || c.failureCode || (c.paid === false && c.status !== "succeeded")
  );

  const failedFromIntents = paymentIntents
    .map(mapPaymentIntent)
    .filter(
      (pi) =>
        pi.status === "requires_payment_method" ||
        pi.status === "canceled" ||
        pi.lastPaymentError ||
        (pi.status !== "succeeded" && pi.status !== "processing")
    )
    .filter((pi) => !chargeByPaymentIntent.has(pi.id));

  const failedPayments = [...failedFromCharges, ...failedFromIntents].sort(
    (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
  );

  const succeededIntentIds = new Set(payments.map((p) => p.paymentIntentId).filter(Boolean));
  for (const pi of paymentIntents) {
    if (pi.status !== "succeeded") continue;
    if (succeededIntentIds.has(pi.id)) continue;
    if (chargeByPaymentIntent.has(pi.id)) continue;
    const mapped = mapPaymentIntent(pi);
    payments.push({
      id: mapped.chargeId || mapped.id,
      paymentIntentId: mapped.id,
      customerId: mapped.customerId,
      amount: mapped.amount,
      amountRefunded: 0,
      currency: mapped.currency,
      status: "succeeded",
      paid: true,
      refunded: false,
      disputed: false,
      failureCode: null,
      failureMessage: null,
      description: null,
      receiptUrl: null,
      paymentMethod: mapped.paymentMethod,
      at: mapped.at,
    });
  }

  payments.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    payments,
    failedPayments,
    totalPayments: payments.length,
    totalFailed: failedPayments.length,
    truncated,
  };
}

function mapCustomer(customer) {
  return {
    id: customer.id,
    email: customer.email || null,
    name: customer.name || null,
    phone: customer.phone || null,
    currency: customer.currency || null,
    balance: centsToUsd(customer.balance),
    delinquent: Boolean(customer.delinquent),
    createdAt: unixToIso(customer.created),
    defaultPaymentMethod: customer.invoice_settings?.default_payment_method || null,
    metadata: customer.metadata || {},
  };
}

function mapSubscription(sub) {
  return {
    id: sub.id,
    customerId: sub.customer || null,
    status: sub.status,
    planAmount: centsToUsd(sub.items?.data?.[0]?.price?.unit_amount),
    planInterval: sub.items?.data?.[0]?.price?.recurring?.interval || null,
    planNickname: sub.items?.data?.[0]?.price?.nickname || sub.items?.data?.[0]?.plan?.nickname || null,
    currentPeriodEnd: unixToIso(sub.current_period_end),
    currentPeriodStart: unixToIso(sub.current_period_start),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: unixToIso(sub.canceled_at),
    at: unixToIso(sub.created),
  };
}

function mapRefund(refund) {
  return {
    id: refund.id,
    chargeId: refund.charge || null,
    paymentIntentId: refund.payment_intent || null,
    amount: centsToUsd(refund.amount),
    currency: refund.currency || "usd",
    status: refund.status,
    reason: refund.reason || null,
    at: unixToIso(refund.created),
  };
}

function mapDispute(dispute) {
  return {
    id: dispute.id,
    chargeId: dispute.charge || null,
    paymentIntentId: dispute.payment_intent || null,
    amount: centsToUsd(dispute.amount),
    currency: dispute.currency || "usd",
    status: dispute.status,
    reason: dispute.reason || null,
    evidenceDueBy: unixToIso(dispute.evidence_details?.due_by),
    isChargeRefundable: Boolean(dispute.is_charge_refundable),
    at: unixToIso(dispute.created),
  };
}

function mapInvoice(invoice) {
  return {
    id: invoice.id,
    customerId: invoice.customer || null,
    subscriptionId: invoice.subscription || null,
    number: invoice.number || null,
    status: invoice.status,
    paid: Boolean(invoice.paid),
    amountDue: centsToUsd(invoice.amount_due),
    amountPaid: centsToUsd(invoice.amount_paid),
    currency: invoice.currency || "usd",
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdf: invoice.invoice_pdf || null,
    dueDate: unixToIso(invoice.due_date),
    periodStart: unixToIso(invoice.period_start),
    periodEnd: unixToIso(invoice.period_end),
    at: unixToIso(invoice.created),
  };
}

function mapPayout(payout) {
  return {
    id: payout.id,
    amount: centsToUsd(payout.amount),
    currency: payout.currency || "usd",
    status: payout.status,
    arrivalDate: unixToIso(payout.arrival_date),
    method: payout.method || null,
    type: payout.type || null,
    description: payout.description || null,
    at: unixToIso(payout.created),
  };
}

function mapBalanceTransaction(tx) {
  return {
    id: tx.id,
    amount: centsToUsd(tx.amount),
    net: centsToUsd(tx.net),
    fee: centsToUsd(tx.fee),
    currency: tx.currency || "usd",
    type: tx.type,
    status: tx.status,
    description: tx.description || null,
    sourceId: tx.source || null,
    at: unixToIso(tx.created),
  };
}

async function fetchBalanceSummary(stripe) {
  const balance = await stripe.balance.retrieve();
  const available = (balance.available || []).map((row) => ({
    amount: centsToUsd(row.amount),
    currency: row.currency,
  }));
  const pending = (balance.pending || []).map((row) => ({
    amount: centsToUsd(row.amount),
    currency: row.currency,
  }));
  return { available, pending, livemode: balance.livemode };
}

async function fetchRevenueSeries(stripe, start, end) {
  const created = {
    gte: Math.floor(start.getTime() / 1000),
    lte: Math.floor(end.getTime() / 1000),
  };
  const charges = await paginateStripe(
    (params) => stripe.charges.list({ ...params, created, limit: LIST_LIMIT }),
    { maxPages: 5 }
  );
  const byDay = new Map();
  for (const charge of charges) {
    if (!charge.paid || charge.status !== "succeeded") continue;
    const day = new Date(charge.created * 1000).toISOString().split("T")[0];
    const entry = byDay.get(day) || { date: day, gross: 0, net: 0, count: 0 };
    entry.gross += centsToUsd(charge.amount);
    entry.net += centsToUsd(charge.amount - (charge.amount_refunded || 0));
    entry.count += 1;
    byDay.set(day, entry);
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function enrichCustomersWithUsers(customers) {
  try {
    if (mongoose.connection.readyState !== 1) return customers;
    const ids = customers.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) return customers;
    const users = await User.find({ stripeCustomerId: { $in: ids } })
      .select("_id email name stripeCustomerId")
      .lean();
    const byCustomer = new Map(users.map((u) => [u.stripeCustomerId, u]));
    return customers.map((c) => {
      const user = byCustomer.get(c.id);
      return {
        ...c,
        userId: user?._id ? String(user._id) : null,
        userEmail: user?.email || c.email,
        userName: user?.name || c.name,
      };
    });
  } catch (err) {
    console.warn("Stripe customer user enrichment skipped:", err?.message || err);
    return customers;
  }
}

async function fetchWebhookEvents(start, end) {
  try {
    if (mongoose.connection.readyState !== 1) return [];
    const events = await StripeEvent.find({
      createdAt: { $gte: start, $lte: end },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return events.map((ev) => ({
      id: ev.eventId,
      type: ev.type,
      processed: Boolean(ev.processed),
      processedAt: ev.processedAt || null,
      error: ev.error || null,
      retryCount: Number(ev.retryCount || 0),
      at: ev.createdAt,
    }));
  } catch (err) {
    console.warn("Stripe webhook events fetch skipped:", err?.message || err);
    return [];
  }
}

export async function buildStripeAllPaymentsReport() {
  const stripe = getStripe();
  if (!stripe) {
    return {
      available: false,
      error: "Stripe is not configured (STRIPE_SECRET_KEY missing in backend/.env)",
    };
  }

  const allPaymentsData = await fetchAllStripePayments(stripe);
  return {
    available: true,
    fetchedAt: new Date().toISOString(),
    payments: allPaymentsData.payments,
    failedPayments: allPaymentsData.failedPayments,
    paymentsMeta: {
      total: allPaymentsData.totalPayments,
      truncated: allPaymentsData.truncated,
      scope: "all_time",
    },
    failedPaymentsMeta: {
      total: allPaymentsData.totalFailed,
      truncated: allPaymentsData.truncated,
      scope: "all_time",
    },
  };
}

export async function buildStripeAdminReport({ start, end, syncInvoices = false } = {}) {
  const stripe = getStripe();
  if (!stripe) {
    return {
      available: false,
      error: "Stripe is not configured (STRIPE_SECRET_KEY missing)",
    };
  }

  let syncResult = null;
  if (syncInvoices) {
    syncResult = await syncPaidInvoicesFromStripe({ startDate: start, endDate: end });
  }

  const created = {
    gte: Math.floor(start.getTime() / 1000),
    lte: Math.floor(end.getTime() / 1000),
  };

  const [
    balance,
    charges,
    paymentIntents,
    customers,
    subscriptions,
    refunds,
    disputes,
    invoices,
    payouts,
    balanceTransactions,
    revenueSeries,
    webhookEvents,
    mongoInvoiceCount,
  ] = await Promise.all([
    fetchBalanceSummary(stripe),
    paginateStripe((params) =>
      stripe.charges.list({ ...params, created, expand: ["data.payment_method_details"] })
    ),
    paginateStripe((params) =>
      stripe.paymentIntents.list({ ...params, created, expand: ["data.latest_charge"] })
    ),
    paginateStripe((params) => stripe.customers.list({ ...params, created })),
    paginateStripe((params) => stripe.subscriptions.list({ ...params, created, status: "all" })),
    paginateStripe((params) => stripe.refunds.list({ ...params, created })),
    paginateStripe((params) => stripe.disputes.list({ ...params, created })),
    paginateStripe((params) => stripe.invoices.list({ ...params, created })),
    paginateStripe((params) => stripe.payouts.list({ ...params, limit: LIST_LIMIT })),
    paginateStripe((params) => stripe.balanceTransactions.list({ ...params, created })),
    fetchRevenueSeries(stripe, start, end),
    fetchWebhookEvents(start, end),
    safeMongoCount(StripeInvoice, { issuedAt: { $gte: start, $lte: end } }),
  ]);

  const mappedCharges = charges.map(mapCharge);
  const windowPayments = mappedCharges.filter((c) => c.paid && c.status === "succeeded");
  const mappedFailed = [
    ...mappedCharges.filter((c) => c.status === "failed" || c.failureCode),
    ...paymentIntents
      .filter((pi) => ["requires_payment_method", "canceled"].includes(pi.status) || pi.last_payment_error)
      .map(mapPaymentIntent),
  ];

  const mappedCustomers = await enrichCustomersWithUsers(customers.map(mapCustomer));
  const mappedSubscriptions = subscriptions.map(mapSubscription);
  const mappedRefunds = refunds.map(mapRefund);
  const mappedDisputes = disputes.map(mapDispute);
  const mappedInvoices = invoices.map(mapInvoice);
  const mappedPayouts = payouts.map(mapPayout);
  const inTransitPayouts = mappedPayouts.filter((p) => ["pending", "in_transit"].includes(p.status));
  const upcomingInvoices = mappedInvoices.filter(
    (inv) => !inv.paid && ["open", "draft"].includes(inv.status)
  );
  const upcomingSubscriptions = mappedSubscriptions.filter((sub) =>
    ["active", "trialing", "past_due"].includes(sub.status)
  );

  const grossVolume = windowPayments.reduce((sum, row) => sum + row.amount, 0);
  const refundVolume = mappedRefunds.reduce((sum, row) => sum + row.amount, 0);
  const disputeVolume = mappedDisputes.reduce((sum, row) => sum + row.amount, 0);
  const pendingBalance = balance.pending.reduce((sum, row) => sum + row.amount, 0);
  const availableBalance = balance.available.reduce((sum, row) => sum + row.amount, 0);

  return {
    available: true,
    fetchedAt: new Date().toISOString(),
    sync: syncResult,
    balance,
    summary: {
      grossVolume: parseFloat(grossVolume.toFixed(2)),
      netVolume: parseFloat((grossVolume - refundVolume).toFixed(2)),
      refundVolume: parseFloat(refundVolume.toFixed(2)),
      disputeVolume: parseFloat(disputeVolume.toFixed(2)),
      paymentCount: windowPayments.length,
      failedPaymentCount: mappedFailed.length,
      customerCount: mappedCustomers.length,
      subscriptionCount: mappedSubscriptions.length,
      activeSubscriptions: mappedSubscriptions.filter((s) => s.status === "active").length,
      refundCount: mappedRefunds.length,
      disputeCount: mappedDisputes.filter((d) => !["won", "lost", "charge_refunded"].includes(d.status)).length,
      openDisputeCount: mappedDisputes.filter((d) => ["needs_response", "under_review", "warning_needs_response"].includes(d.status)).length,
      invoiceCount: mappedInvoices.length,
      mongoInvoiceCount,
      pendingBalance: parseFloat(pendingBalance.toFixed(2)),
      availableBalance: parseFloat(availableBalance.toFixed(2)),
      inTransitPayoutTotal: parseFloat(
        inTransitPayouts.reduce((sum, row) => sum + row.amount, 0).toFixed(2)
      ),
      upcomingInvoiceTotal: parseFloat(
        upcomingInvoices.reduce((sum, row) => sum + row.amountDue, 0).toFixed(2)
      ),
    },
    revenueSeries,
    payments: windowPayments,
    paymentsMeta: {
      total: windowPayments.length,
      truncated: Boolean(charges.truncated),
      scope: "window",
      lazyLoadEndpoint: "/api/admin/stripe/payments",
    },
    failedPayments: mappedFailed,
    failedPaymentsMeta: {
      total: mappedFailed.length,
      truncated: Boolean(charges.truncated || paymentIntents.truncated),
      scope: "window",
      lazyLoadEndpoint: "/api/admin/stripe/payments",
    },
    customers: mappedCustomers,
    subscriptions: mappedSubscriptions,
    refunds: mappedRefunds,
    disputes: mappedDisputes,
    invoices: mappedInvoices,
    payouts: mappedPayouts,
    inTransitPayouts,
    upcomingInvoices,
    upcomingSubscriptions,
    balanceTransactions: balanceTransactions.map(mapBalanceTransaction),
    webhookEvents,
  };
}

export async function createStripeRefund({ chargeId, paymentIntentId, amountUsd, reason }) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  const params = {};
  if (chargeId) params.charge = chargeId;
  if (paymentIntentId) params.payment_intent = paymentIntentId;
  if (amountUsd != null) params.amount = Math.round(Number(amountUsd) * 100);
  if (reason) params.reason = reason;

  const refund = await stripe.refunds.create(params);
  return mapRefund(refund);
}

export async function closeStripeDispute(disputeId) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");
  const dispute = await stripe.disputes.close(disputeId);
  return mapDispute(dispute);
}

export async function cancelStripePaymentIntent(paymentIntentId) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");
  const pi = await stripe.paymentIntents.cancel(paymentIntentId);
  return mapPaymentIntent(pi);
}

export async function detachCustomerPaymentMethods(customerId) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
  const detached = [];
  for (const pm of methods.data) {
    await stripe.paymentMethods.detach(pm.id);
    detached.push(pm.id);
  }
  return { customerId, detachedCount: detached.length, detachedIds: detached };
}

export default {
  buildStripeAdminReport,
  buildStripeAllPaymentsReport,
  createStripeRefund,
  closeStripeDispute,
  cancelStripePaymentIntent,
  detachCustomerPaymentMethods,
  stripeReady,
};
