import mongoose from "mongoose";

const callLifecycleEventSchema = new mongoose.Schema(
  {
    callId: { type: mongoose.Schema.Types.ObjectId, ref: "Call", default: null, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info", index: true },
    event: { type: String, required: true, index: true },
    previousState: { type: String, default: null },
    nextState: { type: String, default: null },
    action: { type: String, default: "observed" },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

callLifecycleEventSchema.index({ userId: 1, timestamp: -1 });

export default mongoose.model("CallLifecycleEvent", callLifecycleEventSchema);
