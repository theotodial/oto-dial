import mongoose from "mongoose";

/**
 * AnalyticsSession
 *
 * One document per browsing session (rotates after 30 minutes of
 * inactivity, client-side). Attribution (channel/source/medium/campaign)
 * is resolved and stored at write time so the dashboard never has to
 * recompute it over the raw event stream.
 */
const analyticsSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    visitorId: {
      type: String,
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    // Role classification at the time of the session
    visitorType: {
      type: String,
      enum: ["anonymous", "signed_in", "subscriber", "admin"],
      default: "anonymous",
      index: true
    },

    startedAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    endedAt: { type: Date, default: null },

    durationSeconds: { type: Number, default: 0 },
    pageViewCount: { type: Number, default: 0 },
    eventCount: { type: Number, default: 0 },

    entryPage: { type: String, default: null },
    exitPage: { type: String, default: null },

    isReturning: { type: Boolean, default: false, index: true },
    isBounce: { type: Boolean, default: true },

    // Device / client
    device: { type: String, default: "desktop", index: true },
    deviceBrand: { type: String, default: null },
    browser: { type: String, default: null },
    os: { type: String, default: null },
    screenResolution: { type: String, default: null },
    viewport: { type: String, default: null },
    language: { type: String, default: null },
    timezone: { type: String, default: null },
    prefersDarkMode: { type: Boolean, default: null },
    networkType: { type: String, default: null },

    // Geo
    ipAddress: { type: String, default: null, index: true },
    country: { type: String, default: "Unknown", index: true },
    countryCode: { type: String, default: null },
    city: { type: String, default: null },
    region: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },

    // Attribution (resolved at write time)
    channel: { type: String, default: "direct", index: true },
    source: { type: String, default: "direct", index: true },
    medium: { type: String, default: null },
    campaign: { type: String, default: null },
    term: { type: String, default: null },
    content: { type: String, default: null },
    referrer: { type: String, default: null },
    landingPage: { type: String, default: null },
    socialPlatform: { type: String, default: null },
    influencerHandle: { type: String, default: null },
    attributionMethod: { type: String, default: null },

    // Raw click identifiers (kept for paid attribution / debugging)
    utmSource: { type: String, default: null },
    utmMedium: { type: String, default: null },
    utmCampaign: { type: String, default: null },
    gclid: { type: String, default: null },
    fbclid: { type: String, default: null },
    ttclid: { type: String, default: null },
    msclkid: { type: String, default: null },
    twclid: { type: String, default: null },
    scid: { type: String, default: null },

    // Google Analytics correlation
    gaClientId: { type: String, default: null },
    gaSessionId: { type: String, default: null },

    // Conversions within this session
    signedUp: { type: Boolean, default: false, index: true },
    converted: { type: Boolean, default: false },
    hasSubscription: { type: Boolean, default: false, index: true },
    revenue: { type: Number, default: 0 }
  },
  { timestamps: true }
);

analyticsSessionSchema.index({ visitorId: 1, startedAt: -1 });
analyticsSessionSchema.index({ channel: 1, startedAt: -1 });
analyticsSessionSchema.index({ country: 1, startedAt: -1 });
analyticsSessionSchema.index({ device: 1, startedAt: -1 });

export default mongoose.model("AnalyticsSession", analyticsSessionSchema);
