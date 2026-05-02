import mongoose from "mongoose";

const aiAgentApprovalSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", required: true, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask", default: null, index: true },
    actionType: {
      type: String,
      enum: ["publish_post", "send_reply", "update_page", "create_asset", "run_workflow", "external_action"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "edited", "expired"],
      default: "pending",
      index: true,
    },
    preview: { type: mongoose.Schema.Types.Mixed, default: {} },
    riskLevel: { type: String, enum: ["low", "medium", "high"], default: "medium", index: true },
    requestedByAgentAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
    auditTrail: [
      {
        event: { type: String, required: true },
        at: { type: Date, default: Date.now },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
  },
  { timestamps: true }
);

aiAgentApprovalSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("AIAgentApproval", aiAgentApprovalSchema);
