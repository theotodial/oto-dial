import mongoose from "mongoose";

const aiPromptTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ["seo", "social", "reputation", "customer_success", "revenue", "content", "competitive", "product", "custom"],
      default: "custom",
      index: true,
    },
    description: { type: String, default: "" },
    template: { type: String, required: true },
    variables: { type: [String], default: [] },
    behaviorRules: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

aiPromptTemplateSchema.index({ category: 1, isDefault: 1 });

export default mongoose.model("AIPromptTemplate", aiPromptTemplateSchema);
