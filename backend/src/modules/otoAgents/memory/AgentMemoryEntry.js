import mongoose from "mongoose";

const agentMemoryEntrySchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", required: true, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask", default: null, index: true },
    type: {
      type: String,
      enum: ["brand_voice", "preference", "successful_strategy", "failed_campaign", "output_summary", "knowledge"],
      default: "output_summary",
      index: true,
    },
    content: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    importance: { type: Number, default: 5, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  },
  { timestamps: true }
);

agentMemoryEntrySchema.index({ agent: 1, type: 1, createdAt: -1 });

export default mongoose.model("AgentMemoryEntry", agentMemoryEntrySchema);
