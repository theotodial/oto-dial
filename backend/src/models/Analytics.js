import mongoose from "mongoose";

const analyticsSchema = new mongoose.Schema(
  {
    // Session tracking
    sessionId: {
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

    // Visitor information
    ipAddress: {
      type: String,
      index: true
    },

    userAgent: {
      type: String
    },

    device: {
      type: String, // mobile, desktop, tablet
      index: true
    },

    browser: {
      type: String
    },

    os: {
      type: String
    },

    // Location
    country: {
      type: String,
      index: true
    },

    countryCode: {
      type: String,
      index: true
    },

    city: {
      type: String
    },

    region: {
      type: String
    },

    latitude: {
      type: Number,
      default: null
    },

    longitude: {
      type: Number,
      default: null
    },

    // Page tracking
    page: {
      type: String,
      required: true,
      index: true
    },

    pageTitle: {
      type: String
    },

    referrer: {
      type: String
    },

    landingUrl: {
      type: String
    },

    sourceHint: {
      type: String
    },

    utmSource: {
      type: String,
      index: true
    },

    utmMedium: {
      type: String,
      index: true
    },

    utmCampaign: {
      type: String
    },

    utmTerm: {
      type: String
    },

    utmContent: {
      type: String
    },

    gclid: {
      type: String
    },

    fbclid: {
      type: String
    },

    ttclid: {
      type: String
    },

    msclkid: {
      type: String
    },

    twclid: {
      type: String
    },

    scid: {
      type: String
    },

    // Time tracking
    timeSpent: {
      type: Number, // in seconds
      default: 0
    },

    visitStart: {
      type: Date,
      required: true,
      index: true
    },

    visitEnd: {
      type: Date
    },

    // User behavior
    isReturning: {
      type: Boolean,
      default: false,
      index: true
    },

    isNewVisitor: {
      type: Boolean,
      default: true,
      index: true
    },

    // Conversion tracking
    signedUp: {
      type: Boolean,
      default: false,
      index: true
    },

    hasSubscription: {
      type: Boolean,
      default: false,
      index: true
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null
    },

    // Event tracking
    events: [{
      name: String,
      category: String,
      action: String,
      label: String,
      value: Number,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],

    // Google Analytics correlation
    gaClientId: {
      type: String
    },

    gaSessionId: {
      type: String
    }
  },
  { timestamps: true }
);

// Indexes for performance
analyticsSchema.index({ visitStart: -1 });
analyticsSchema.index({ country: 1, visitStart: -1 });
analyticsSchema.index({ device: 1, visitStart: -1 });
analyticsSchema.index({ userId: 1, visitStart: -1 });
analyticsSchema.index({ sessionId: 1, visitStart: -1 });

export default mongoose.model("Analytics", analyticsSchema);
