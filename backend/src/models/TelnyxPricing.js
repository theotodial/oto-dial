import mongoose from "mongoose";

/**
 * Telnyx Pricing Model
 * Stores admin-defined pricing from official Telnyx sources
 */
const telnyxPricingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["voice", "sms", "number"],
      required: true,
      index: true
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound", "both"],
      default: "both"
    },

    destination: {
      type: String,
      required: true,
      index: true
    },

    // For voice: per second, for SMS: per message, for number: monthly
    unit: {
      type: String,
      enum: ["second", "message", "month"],
      required: true
    },

    unitPriceUsd: {
      type: Number,
      required: true,
      min: 0
    },

    // For number pricing
    numberType: {
      type: String,
      enum: ["local", "tollFree", "shortCode"],
      default: null
    },

    sourceUrl: {
      type: String,
      required: true
    },

    effectiveFrom: {
      type: Date,
      default: Date.now,
      index: true
    },

    effectiveTo: {
      type: Date,
      default: null
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    createdByAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true
    },

    notes: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient lookups
telnyxPricingSchema.index({ type: 1, destination: 1, direction: 1, isActive: 1 });
telnyxPricingSchema.index({ type: 1, numberType: 1, isActive: 1 });

export default mongoose.model("TelnyxPricing", telnyxPricingSchema);
