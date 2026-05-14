import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    provider: { type: String, default: "telnyx", index: true },
    providerEventId: { type: String, default: null, index: true },
    callId: { type: mongoose.Schema.Types.ObjectId, ref: "Call", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    eventType: { type: String, default: null },
    providerTimestamp: { type: Date, default: null },
    receiveTimestamp: { type: Date, default: null },
    processStart: { type: Date, default: null },
    processEnd: { type: Date, default: null },
    transitionAppliedAt: { type: Date, default: null },
    socketBroadcastAt: { type: Date, default: null },
    /** Precomputed ms deltas for admin charts */
    deltasMs: {
      type: {
        providerToReceive: { type: Number, default: null },
        receiveToProcessStart: { type: Number, default: null },
        processing: { type: Number, default: null },
        processToTransition: { type: Number, default: null },
        transitionToBroadcast: { type: Number, default: null },
        total: { type: Number, default: null },
      },
      default: {},
    },
  },
  { timestamps: true }
);

schema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

export default mongoose.model("WebhookLatencySample", schema);
