import mongoose from "mongoose";

const subscriptionActivationFailureSchema = new mongoose.Schema(
  {
    sourceEventId: {
      type: String,
      default: null,
      index: true
    },
    sourceEventType: {
      type: String,
      default: null,
      index: true
    },
    invoiceId: {
      type: String,
      default: null,
      index: true
    },
    checkoutSessionId: {
      type: String,
      default: null,
      index: true
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true
    },
    stripeCustomerId: {
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
    reason: {
      type: String,
      required: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ["open", "resolved"],
      default: "open",
      index: true
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    resolvedBy: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model(
  "SubscriptionActivationFailure",
  subscriptionActivationFailureSchema
);
