import mongoose from "mongoose";
import { mongoPerformancePlugin } from "../utils/mongoPerformancePlugin.js";

const smsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
      index: true,
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
    },

    /** Populated after successful send; drives SMS credit usage (sum of costDeducted). */
    smsCostInfo: {
      smsParts: { type: Number, default: null },
      encoding: { type: String, default: null },
      characters: { type: Number, default: null },
      costDeducted: { type: Number, default: null },
    },

    /** Client-supplied key for outbound /api/sms/send idempotency (optional). */
    sendIdempotencyKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

smsSchema.index({ user: 1, sendIdempotencyKey: 1 }, { unique: true, sparse: true });
smsSchema.index({ user: 1, createdAt: -1 });
smsSchema.index({ user: 1, direction: 1, createdAt: -1 });
// Thread list: $or on to/from with sort/limit
smsSchema.index({ user: 1, to: 1, createdAt: -1 });
smsSchema.index({ user: 1, from: 1, createdAt: -1 });
smsSchema.plugin(mongoPerformancePlugin, { label: "messages" });

export default mongoose.model("SMS", smsSchema);
