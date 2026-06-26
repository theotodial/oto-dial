import mongoose from "mongoose";

/**
 * AnalyticsEvent
 *
 * Standardized, first-class event stream. Every important product event
 * (signup, checkout, purchase, call/SMS lifecycle, etc.) is one document
 * here, enriched with visitor / session / geo / device / attribution
 * context so events can be analyzed across any dimension.
 */
const analyticsEventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    category: { type: String, default: "general", index: true },

    visitorId: { type: String, default: null, index: true },
    sessionId: { type: String, default: null, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    timestamp: { type: Date, default: Date.now, index: true },

    // Monetary value (purchases, credits, etc.)
    value: { type: Number, default: 0 },
    currency: { type: String, default: "usd" },

    // Denormalized context for fast grouping/filtering
    country: { type: String, default: null },
    device: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    channel: { type: String, default: null },
    source: { type: String, default: null },
    page: { type: String, default: null },

    // Arbitrary structured metadata (transactionId, planId, etc.)
    props: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Idempotency
    eventId: { type: String, default: null }
  },
  { timestamps: true }
);

analyticsEventSchema.index({ name: 1, timestamp: -1 });
analyticsEventSchema.index({ category: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index(
  { eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: "string" } } }
);

export default mongoose.model("AnalyticsEvent", analyticsEventSchema);
