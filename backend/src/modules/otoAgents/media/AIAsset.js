import mongoose from "mongoose";

const aiAssetSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", default: null, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask", default: null, index: true },
    type: {
      type: String,
      enum: ["image_prompt", "ad_creative", "banner", "carousel", "blog_draft", "landing_page", "social_post", "report"],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    content: { type: mongoose.Schema.Types.Mixed, default: {} },
    brandProfile: { type: String, default: "OTO Dial premium telecom SaaS" },
    status: {
      type: String,
      enum: ["draft", "awaiting_approval", "approved", "published", "archived"],
      default: "draft",
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

aiAssetSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("AIAsset", aiAssetSchema);
