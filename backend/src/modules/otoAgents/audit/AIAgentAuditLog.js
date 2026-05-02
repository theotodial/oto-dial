import mongoose from "mongoose";

const aiAgentAuditLogSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", default: null, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask", default: null, index: true },
    actorType: { type: String, enum: ["admin", "agent", "system"], default: "system", index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    event: { type: String, required: true, index: true },
    severity: { type: String, enum: ["info", "warning", "critical"], default: "info", index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

aiAgentAuditLogSchema.index({ timestamp: -1 });
aiAgentAuditLogSchema.index({ agent: 1, timestamp: -1 });

export default mongoose.model("AIAgentAuditLog", aiAgentAuditLogSchema);
