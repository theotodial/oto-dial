import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: null,
      index: true
    },

    name: {
      type: String,
      required: true,
      unique: true
    },

    planName: {
      type: String,
      default: null
    },

    price: {
      type: Number,
      required: true
    },

    currency: {
      type: String,
      default: "USD"
    },

    // Stripe integration fields
    stripeProductId: {
      type: String,
      default: null
    },

    stripePriceId: {
      type: String,
      default: null
    },

    limits: {
      minutesTotal: {
        type: Number,
        required: true
      },
      smsTotal: {
        type: Number,
        required: true
      },
      numbersTotal: {
        type: Number,
        required: true
      }
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

    dedicatedNumbers: {
      type: Number,
      default: null
    },

    displayUnlimited: {
      type: Boolean,
      default: false
    },

    // Use active boolean instead of status enum for consistency
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);
