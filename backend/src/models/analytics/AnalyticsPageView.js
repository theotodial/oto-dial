import mongoose from "mongoose";

/**
 * AnalyticsPageView
 *
 * One document per page view (NOT per session). This is what makes
 * "pages per session", per-page time-on-page, entry/exit pages and
 * accurate page-view counts possible.
 */
const analyticsPageViewSchema = new mongoose.Schema(
  {
    visitorId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    page: { type: String, required: true, index: true },
    pageTitle: { type: String, default: null },
    referrer: { type: String, default: null },

    timestamp: { type: Date, default: Date.now, index: true },
    timeOnPageSeconds: { type: Number, default: 0 },

    isEntry: { type: Boolean, default: false },
    isExit: { type: Boolean, default: false },

    // Denormalized context for fast grouping/filtering
    country: { type: String, default: null },
    device: { type: String, default: null },
    channel: { type: String, default: null },
    source: { type: String, default: null },

    // Idempotency: client-generated id so StrictMode double-mounts and
    // retried beacons do not double-count.
    eventId: { type: String, default: null }
  },
  { timestamps: true }
);

analyticsPageViewSchema.index({ page: 1, timestamp: -1 });
analyticsPageViewSchema.index({ sessionId: 1, timestamp: 1 });
analyticsPageViewSchema.index(
  { eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: "string" } } }
);

export default mongoose.model("AnalyticsPageView", analyticsPageViewSchema);
