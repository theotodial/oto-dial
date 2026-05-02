import mongoose from "mongoose";

const agentRuntimeStateSchema = new mongoose.Schema(
  {
    agent: { type: String, required: true, unique: true, index: true },
    ownerId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["starting", "running", "healthy", "degraded", "failed", "stopped"],
      default: "starting",
      index: true,
    },
    heartbeatAt: { type: Date, default: null, index: true },
    lastRunAt: { type: Date, default: null },
    nextRunAt: { type: Date, default: null },
    leaseUntil: { type: Date, default: null, index: true },
    lastError: { type: String, default: null },
    restartCount: { type: Number, default: 0 },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

agentRuntimeStateSchema.index({ status: 1, heartbeatAt: -1 });

export default mongoose.model("AgentRuntimeState", agentRuntimeStateSchema);
