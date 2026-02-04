import mongoose from "mongoose";

const smsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },

    to: {
      type: String,
      required: true
    },

    from: {
      type: String,
      required: true
    },

    body: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["queued", "sent", "delivered", "failed", "received"],
      default: "queued"
    },

    direction: {
      type: String,
      enum: ["inbound", "outbound"],
      default: "outbound"
    },

    telnyxMessageId: String,

    // Enhanced cost tracking
    cost: {
      type: Number,
      default: 0
    },

    costPerSms: {
      type: Number,
      default: 0
    },

    carrier: {
      type: String,
      default: null
    },

    carrierFees: {
      type: Number,
      default: 0
    },

    // Cost sync tracking
    costPending: {
      type: Boolean,
      default: false
    },

    costSyncError: {
      type: String,
      default: null
    },

    costSyncedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model("SMS", smsSchema);
