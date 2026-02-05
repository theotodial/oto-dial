import mongoose from "mongoose";

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true
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

    // Use active boolean instead of status enum for consistency
    active: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

export default mongoose.model("Plan", planSchema);
