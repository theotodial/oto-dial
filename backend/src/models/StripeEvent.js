import mongoose from "mongoose";

/**
 * StripeEvent Model
 * Tracks processed Stripe webhook events for idempotency
 */
const stripeEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    type: {
      type: String,
      required: true,
      index: true
    },

    processed: {
      type: Boolean,
      default: false,
      index: true
    },

    processedAt: {
      type: Date,
      default: null
    },

    error: {
      type: String,
      default: null
    },

    retryCount: {
      type: Number,
      default: 0
    },

    eventData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("StripeEvent", stripeEventSchema);
