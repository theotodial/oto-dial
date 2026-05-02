import mongoose from "mongoose";

const aiAgentTaskSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    taskType: {
      type: String,
      enum: ["research", "draft", "report", "publish", "analyze", "workflow", "asset"],
      default: "research",
      index: true,
    },
    triggerType: {
      type: String,
      enum: ["manual", "scheduled", "event", "recurring"],
      default: "manual",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "researching",
        "generating",
        "waiting_approval",
        "publishing",
        "completed",
        "failed",
        "canceled",
      ],
      default: "queued",
      index: true,
    },
    input: { type: mongoose.Schema.Types.Mixed, default: {} },
    output: {
      text: { type: String, default: "" },
      reasoning: { type: String, default: "" },
      hashtags: { type: [String], default: [] },
      suggestedActions: { type: [mongoose.Schema.Types.Mixed], default: [] },
      raw: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    progress: { type: Number, default: 0 },
    executionLogs: [
      {
        event: { type: String, required: true },
        at: { type: Date, default: Date.now },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
    approval: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentApproval", default: null },
    report: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgentReport", default: null },
    scheduledFor: { type: Date, default: null, index: true },
    runAfter: { type: Date, default: Date.now, index: true },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 2 },
    failureReason: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

aiAgentTaskSchema.index({ agent: 1, status: 1, createdAt: -1 });

export default mongoose.model("AIAgentTask", aiAgentTaskSchema);
