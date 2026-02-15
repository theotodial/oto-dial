import mongoose from "mongoose";

const stripeInvoiceSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    customerId: {
      type: String,
      required: true,
      index: true
    },
    subscriptionId: {
      type: String,
      default: null,
      index: true
    },
    checkoutSessionId: {
      type: String,
      default: null,
      index: true
    },
    paymentIntentId: {
      type: String,
      default: null,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      default: null
    },
    addonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AddonPlan",
      default: null
    },
    purchaseType: {
      type: String,
      enum: ["subscription", "addon", "unknown"],
      default: "unknown",
      index: true
    },
    status: {
      type: String,
      enum: ["paid", "open", "void", "uncollectible", "draft", "unknown"],
      default: "unknown",
      index: true
    },
    amountPaid: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: "usd"
    },
    invoicePdf: {
      type: String,
      default: null
    },
    hostedInvoiceUrl: {
      type: String,
      default: null
    },
    clientIp: {
      type: String,
      default: null
    },
    eventType: {
      type: String,
      default: null
    },
    rawMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    issuedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("StripeInvoice", stripeInvoiceSchema);
