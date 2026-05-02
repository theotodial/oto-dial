import mongoose from "mongoose";

const researchDiscoverySchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", required: true, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask", default: null, index: true },
    category: {
      type: String,
      enum: ["seo_keyword", "trend", "competitor", "viral_opportunity", "sentiment", "pricing", "product", "other"],
      default: "other",
      index: true,
    },
    title: { type: String, required: true },
    summary: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    sourceName: { type: String, default: "" },
    opportunityScore: { type: Number, default: null, index: true },
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

researchDiscoverySchema.index({ category: 1, createdAt: -1 });

export default mongoose.model("ResearchDiscovery", researchDiscoverySchema);
