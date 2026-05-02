import mongoose from "mongoose";

const aiAgentReportSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", required: true, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask", default: null, index: true },
    type: {
      type: String,
      enum: ["seo", "social", "competitor", "content", "sentiment", "growth", "revenue", "product", "custom"],
      default: "custom",
      index: true,
    },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    suggestedActions: { type: [mongoose.Schema.Types.Mixed], default: [] },
    sourceCount: { type: Number, default: 0 },
    generatedBy: { type: String, default: "oto_agents_runtime" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

aiAgentReportSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model("AIAgentReport", aiAgentReportSchema);
