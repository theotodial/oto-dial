import mongoose from "mongoose";

const queueRecoveryEventSchema = new mongoose.Schema(
  {
    queue: { type: String, required: true, index: true },
    jobId: { type: String, default: null, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info", index: true },
    event: { type: String, required: true, index: true },
    action: { type: String, default: "observed" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

queueRecoveryEventSchema.index({ queue: 1, timestamp: -1 });

export default mongoose.model("QueueRecoveryEvent", queueRecoveryEventSchema);
