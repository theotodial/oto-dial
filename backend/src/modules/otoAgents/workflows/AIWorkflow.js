import mongoose from "mongoose";

const workflowStepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    name: { type: String, required: true },
    action: {
      type: String,
      enum: ["research", "generate_text", "generate_image", "request_approval", "schedule_post", "publish"],
      required: true,
    },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const aiWorkflowSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: "AIAgent", default: null, index: true },
    status: { type: String, enum: ["draft", "active", "paused", "archived"], default: "draft", index: true },
    trigger: {
      type: { type: String, enum: ["manual", "schedule", "event"], default: "manual" },
      cron: { type: String, default: "" },
      eventName: { type: String, default: "" },
    },
    steps: { type: [workflowStepSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

export default mongoose.model("AIWorkflow", aiWorkflowSchema);
