import mongoose from "mongoose";

/**
 * Telnyx Cost Model
 * Immutable ledger of all Telnyx costs
 * NEVER recalculate past costs - costs are written once at event finalization
 */
const telnyxCostSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    resourceType: {
      type: String,
      enum: ["call", "sms", "number"],
      required: true,
      index: true
    },

    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    // Reference to pricing used
    pricingRefId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TelnyxPricing",
      required: true
    },

    // Billing details
    units: {
      type: Number,
      required: true,
      min: 0
    },

    unitPriceUsd: {
      type: Number,
      required: true,
      min: 0
    },

    totalCostUsd: {
      type: Number,
      required: true,
      min: 0
    },

    // Additional metadata
    destination: {
      type: String,
      default: null
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      default: null
    },

    // For calls: duration breakdown
    ringingSeconds: {
      type: Number,
      default: 0
    },

    answeredSeconds: {
      type: Number,
      default: 0
    },

    billedSeconds: {
      type: Number,
      default: 0
    },

    // Timestamp of the event
    eventTimestamp: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
telnyxCostSchema.index({ userId: 1, resourceType: 1, eventTimestamp: -1 });
telnyxCostSchema.index({ resourceType: 1, eventTimestamp: -1 });
telnyxCostSchema.index({ createdAt: -1 });

export default mongoose.model("TelnyxCost", telnyxCostSchema);
