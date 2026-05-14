import mongoose from "mongoose";

const telecomEventSequenceSchema = new mongoose.Schema(
  {
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      default: null,
      index: true,
    },
    provider: { type: String, required: true, index: true },
    providerEventId: { type: String, default: null, index: true },
    providerTimestamp: { type: Date, default: null, index: true },
    receivedAt: { type: Date, default: Date.now, index: true },
    eventType: { type: String, default: null, index: true },
    source: { type: String, default: null, index: true },
    sequenceNumber: { type: Number, required: true, index: true },
    orderingAccepted: { type: Boolean, default: true },
    orderingReason: { type: String, default: null },
    currentCallStatus: { type: String, default: null },
    nextCallStatus: { type: String, default: null },
    duplicate: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

telecomEventSequenceSchema.index({ provider: 1, providerEventId: 1 });
telecomEventSequenceSchema.index({ callId: 1, sequenceNumber: 1 });

export default mongoose.model("TelecomEventSequence", telecomEventSequenceSchema);
