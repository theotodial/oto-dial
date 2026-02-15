import StripeInvoice from "../models/StripeInvoice.js";
import User from "../models/User.js";
import { getStripe } from "../../config/stripe.js";

function isValidObjectId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

function mergeInvoiceMetadata(invoice) {
  const fromInvoice = invoice?.metadata || {};
  const fromSubscriptionDetails = invoice?.parent?.subscription_details?.metadata || {};

  return {
    ...fromSubscriptionDetails,
    ...fromInvoice
  };
}

function toDateFromUnix(seconds, fallback = null) {
  if (!seconds || Number.isNaN(Number(seconds))) {
    return fallback;
  }
  return new Date(Number(seconds) * 1000);
}

async function upsertStripeInvoiceDocument(invoice, sourceEventType = "admin_sync") {
  if (!invoice?.id) {
    return null;
  }

  const metadata = mergeInvoiceMetadata(invoice);
  const customerId = invoice.customer || metadata.customerId || null;
  const subscriptionId = invoice.subscription || null;
  const purchaseType = metadata.purchaseType || (metadata.addonId ? "addon" : (subscriptionId ? "subscription" : "unknown"));

  let user = null;
  if (metadata.userId && isValidObjectId(metadata.userId)) {
    user = await User.findById(metadata.userId).select("_id");
  }
  if (!user && customerId) {
    user = await User.findOne({ stripeCustomerId: customerId }).select("_id");
  }

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
      status: invoice.paid ? "paid" : (invoice.status || "unknown"),
      amountPaid: Number((invoice.amount_paid || 0) / 100),
      currency: (invoice.currency || "usd").toLowerCase(),
      invoicePdf: invoice.invoice_pdf || null,
      hostedInvoiceUrl: invoice.hosted_invoice_url || null,
      clientIp: metadata.clientIp || metadata.ipAddress || null,
      eventType: sourceEventType,
      rawMetadata: metadata,
      issuedAt: toDateFromUnix(invoice.created, null)
    },
    { upsert: true, new: true }
  );
}

export async function syncPaidInvoicesFromStripe({
  startDate,
  endDate,
  maxPages = 6
}) {
  const stripe = getStripe();
  if (!stripe) {
    return { skipped: true, reason: "stripe_not_configured", synced: 0, scanned: 0 };
  }

  const createdFilter = {};
  if (startDate instanceof Date) {
    createdFilter.gte = Math.floor(startDate.getTime() / 1000);
  }
  if (endDate instanceof Date) {
    createdFilter.lte = Math.floor(endDate.getTime() / 1000);
  }

  let pages = 0;
  let hasMore = true;
  let startingAfter = null;
  let synced = 0;
  let scanned = 0;

  while (hasMore && pages < maxPages) {
    const params = {
      limit: 100,
      status: "paid"
    };

    if (Object.keys(createdFilter).length > 0) {
      params.created = createdFilter;
    }
    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const invoicePage = await stripe.invoices.list(params);
    pages += 1;

    for (const invoice of invoicePage.data) {
      scanned += 1;
      await upsertStripeInvoiceDocument(invoice, "admin_sync");
      synced += 1;
    }

    hasMore = invoicePage.has_more;
    if (hasMore && invoicePage.data.length > 0) {
      startingAfter = invoicePage.data[invoicePage.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return {
    skipped: false,
    synced,
    scanned,
    pages
  };
}

export async function getStripeRevenueSummaryFromMongo({ startDate, endDate }) {
  const match = {
    status: "paid"
  };

  const dateBounds = {};
  if (startDate instanceof Date) {
    dateBounds.$gte = startDate;
  }
  if (endDate instanceof Date) {
    dateBounds.$lte = endDate;
  }

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        effectiveIssuedAt: { $ifNull: ["$issuedAt", "$createdAt"] }
      }
    }
  ];

  if (Object.keys(dateBounds).length > 0) {
    pipeline.push({
      $match: {
        effectiveIssuedAt: dateBounds
      }
    });
  }

  pipeline.push({
    $group: {
      _id: null,
      grossRevenue: { $sum: "$amountPaid" },
      invoiceCount: { $sum: 1 },
      subscriptionRevenue: {
        $sum: {
          $cond: [{ $eq: ["$purchaseType", "subscription"] }, "$amountPaid", 0]
        }
      },
      addonRevenue: {
        $sum: {
          $cond: [{ $eq: ["$purchaseType", "addon"] }, "$amountPaid", 0]
        }
      }
    }
  });

  const [row] = await StripeInvoice.aggregate(pipeline);
  return {
    grossRevenue: row?.grossRevenue || 0,
    invoiceCount: row?.invoiceCount || 0,
    subscriptionRevenue: row?.subscriptionRevenue || 0,
    addonRevenue: row?.addonRevenue || 0
  };
}

export async function getStripeRevenueByDayFromMongo({ startDate, endDate }) {
  const dateBounds = {};
  if (startDate instanceof Date) {
    dateBounds.$gte = startDate;
  }
  if (endDate instanceof Date) {
    dateBounds.$lte = endDate;
  }

  const pipeline = [
    { $match: { status: "paid" } },
    {
      $addFields: {
        effectiveIssuedAt: { $ifNull: ["$issuedAt", "$createdAt"] }
      }
    }
  ];

  if (Object.keys(dateBounds).length > 0) {
    pipeline.push({
      $match: {
        effectiveIssuedAt: dateBounds
      }
    });
  }

  pipeline.push(
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$effectiveIssuedAt" }
        },
        revenue: { $sum: "$amountPaid" },
        invoiceCount: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  );

  return StripeInvoice.aggregate(pipeline);
}

export default {
  syncPaidInvoicesFromStripe,
  getStripeRevenueSummaryFromMongo,
  getStripeRevenueByDayFromMongo
};
