import mongoose from "mongoose";

const AUTONOMY_MODES = ["manual", "copilot", "autopilot"];
const AGENT_STATUSES = ["draft", "active", "paused", "stopped", "archived"];

const aiAgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    description: { type: String, default: "" },
    category: { type: String, default: "operations", index: true },
    avatarIcon: { type: String, default: "spark" },
    colorTheme: { type: String, default: "indigo" },
    role: {
      type: String,
      enum: [
        "growth_seo",
        "social_media",
        "reputation_monitoring",
        "customer_success",
        "revenue_optimization",
        "content_factory",
        "competitive_intelligence",
        "product_strategy",
        "custom",
      ],
      required: true,
      index: true,
    },
    status: { type: String, enum: AGENT_STATUSES, default: "draft", index: true },
    autonomyMode: { type: String, enum: AUTONOMY_MODES, default: "manual", index: true },
    connectedPlatforms: [
      {
        platform: { type: String, required: true },
        accountId: { type: mongoose.Schema.Types.ObjectId, ref: "SocialAccount", default: null },
        permissions: { type: [String], default: [] },
        enabled: { type: Boolean, default: true },
      },
    ],
    systemPrompt: { type: String, default: "" },
    mission: { type: String, default: "" },
    responsibilities: { type: [String], default: [] },
    goals: { type: [String], default: [] },
    tone: { type: String, default: "" },
    behavior: { type: String, default: "" },
    executionStyle: { type: String, default: "careful, auditable, approval-aware" },
    writingStyle: { type: String, default: "" },
    postingStyle: { type: String, default: "" },
    memory: {
      brandTone: { type: String, default: "premium, direct, helpful, B2B SaaS" },
      successfulStrategies: { type: [String], default: [] },
      failedCampaigns: { type: [String], default: [] },
      preferredStyles: { type: [String], default: [] },
      adminPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    activeTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "AIAgentTask" }],
    schedules: [
      {
        name: { type: String, default: "" },
        cron: { type: String, default: "" },
        timezone: { type: String, default: "UTC" },
        enabled: { type: Boolean, default: false },
        nextRunAt: { type: Date, default: null },
      },
    ],
    assignedPromptTemplates: [{ type: mongoose.Schema.Types.ObjectId, ref: "AIPromptTemplate" }],
    aiModel: {
      provider: { type: String, default: "not_configured" },
      model: { type: String, default: "manual-review" },
      temperature: { type: Number, default: 0.4 },
    },
    capabilities: {
      research: { type: Boolean, default: true },
      drafting: { type: Boolean, default: true },
      imageGeneration: { type: Boolean, default: false },
      publishing: { type: Boolean, default: false },
      approvalsRequired: { type: Boolean, default: true },
      maxAutopilotActionsPerDay: { type: Number, default: 0 },
    },
    reports: [
      {
        title: { type: String, default: "" },
        type: { type: String, default: "summary" },
        generatedAt: { type: Date, default: Date.now },
        summary: { type: String, default: "" },
        score: { type: Number, default: null },
      },
    ],
    logs: [
      {
        event: { type: String, required: true },
        severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },
        at: { type: Date, default: Date.now },
        details: { type: mongoose.Schema.Types.Mixed, default: {} },
      },
    ],
    approvals: [{ type: mongoose.Schema.Types.ObjectId, ref: "AIAgentApproval" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    performanceMetrics: {
      tasksCompleted: { type: Number, default: 0 },
      approvalsPending: { type: Number, default: 0 },
      approvalsAccepted: { type: Number, default: 0 },
      approvalsRejected: { type: Number, default: 0 },
      contentGenerated: { type: Number, default: 0 },
      assetsGenerated: { type: Number, default: 0 },
      riskFlags: { type: Number, default: 0 },
      lastRunAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

aiAgentSchema.index({ status: 1, autonomyMode: 1, role: 1 });
aiAgentSchema.index({ createdAt: -1 });

export { AUTONOMY_MODES, AGENT_STATUSES };
export default mongoose.model("AIAgent", aiAgentSchema);
