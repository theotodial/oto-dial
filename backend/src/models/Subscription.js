import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true
    },

    // Stripe integration fields
    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true,
      sparse: true
    },

    stripeCustomerId: {
      type: String,
      default: null,
      index: true
    },

    checkoutSessionId: {
      type: String,
      default: null,
      index: true
    },

    latestInvoiceId: {
      type: String,
      default: null,
      index: true
    },

    stripePriceId: {
      type: String,
      default: null
    },

    planKey: {
      type: String,
      default: null,
      index: true
    },

    planType: {
      type: String,
      default: null,
      index: true
    },

    planName: {
      type: String,
      default: null
    },

    displayUnlimited: {
      type: Boolean,
      default: false
    },

    status: {
      type: String,
      enum: ["active", "suspended", "cancelled", "past_due", "incomplete", "pending_activation"],
      default: "pending_activation",
      index: true
    },

    periodStart: {
      type: Date,
      required: true
    },

    periodEnd: {
      type: Date,
      required: true
    },

    usage: {
      minutesUsed: { type: Number, default: 0 },
      smsUsed: { type: Number, default: 0 }
    },

    limits: {
      minutesTotal: { type: Number, required: true },
      smsTotal: { type: Number, required: true },
      numbersTotal: { type: Number, required: true }
    },

    addons: {
      minutes: { type: Number, default: 0 },
      sms: { type: Number, default: 0 }
    },

    // Optional expiry dates for add-ons (e.g. 30 days after purchase)
    addonsMinutesExpiry: {
      type: Date,
      default: null
    },
    addonsSmsExpiry: {
      type: Date,
      default: null
    },

    hardStop: {
      type: Boolean,
      default: true
    },
    
    ratePerMinute: {
      type: Number,
      required: true,
      default: 0.0065
    },

    monthlySmsLimit: {
      type: Number,
      default: null
    },

    monthlyMinutesLimit: {
      type: Number,
      default: null
    },

    dailySmsLimit: {
      type: Number,
      default: null
    },

    dailyMinutesLimit: {
      type: Number,
      default: null
    },

    dailySmsUsed: {
      type: Number,
      default: 0
    },
    
    dailyMinutesUsed: {
      type: Number,
      default: 0
    },

    usageWindowDateKey: {
      type: String,
      default: null
    },
    
    lastUsageReset: {
      type: Date,
      default: Date.now
    }        
  },
  {
    timestamps: true
  }
);

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;