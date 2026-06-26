import mongoose from "mongoose";

/**
 * AnalyticsVisitor
 *
 * Stable, long-lived visitor identity. One document per persistent
 * `visitorId` (stored client-side in localStorage). This is what allows
 * accurate New vs Returning differentiation, cross-session journeys, and
 * first-touch / last-touch attribution.
 */
const attributionSubSchema = new mongoose.Schema(
  {
    channel: { type: String, default: null },
    source: { type: String, default: null },
    medium: { type: String, default: null },
    campaign: { type: String, default: null },
    referrer: { type: String, default: null },
    landingPage: { type: String, default: null }
  },
  { _id: false }
);

const analyticsVisitorSchema = new mongoose.Schema(
  {
    visitorId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    firstSeenAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    lastSeenAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    sessionCount: {
      type: Number,
      default: 0
    },

    pageViewCount: {
      type: Number,
      default: 0
    },

    eventCount: {
      type: Number,
      default: 0
    },

    // Linked authenticated identities (a visitor may sign in to >1 account)
    userIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    firstUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    // Attribution
    firstTouch: { type: attributionSubSchema, default: () => ({}) },
    lastTouch: { type: attributionSubSchema, default: () => ({}) },

    // Latest known geo / device (denormalized for fast filtering)
    country: { type: String, default: null },
    countryCode: { type: String, default: null },
    city: { type: String, default: null },
    region: { type: String, default: null },
    device: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },

    // Conversion lifecycle flags
    signedUp: { type: Boolean, default: false },
    signedUpAt: { type: Date, default: null },
    hasSubscription: { type: Boolean, default: false },
    subscribedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

analyticsVisitorSchema.index({ userIds: 1 });

export default mongoose.model("AnalyticsVisitor", analyticsVisitorSchema);
