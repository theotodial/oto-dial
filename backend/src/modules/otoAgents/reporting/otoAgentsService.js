import AIAgent from "../agents/AIAgent.js";
import AIAgentTask from "../workflows/AIAgentTask.js";
import AIAgentApproval from "../approvals/AIAgentApproval.js";
import AIAgentAuditLog from "../audit/AIAgentAuditLog.js";
import SocialAccount from "../connectors/SocialAccount.js";
import AIPromptTemplate from "../prompts/AIPromptTemplate.js";
import AIAsset from "../media/AIAsset.js";
import AIAgentReport from "./AIAgentReport.js";
import ResearchDiscovery from "../research/ResearchDiscovery.js";
import AgentMemoryEntry from "../memory/AgentMemoryEntry.js";
import AIWorkflow from "../workflows/AIWorkflow.js";
import { OTO_AGENT_TYPES, getAgentType } from "../agents/agentCatalog.js";
import { encryptSecret, redactSocialAccount } from "../connectors/credentialVault.js";
import { runAgentTask } from "../executors/agentExecutor.js";
import { getAiProviderStatus } from "../executors/aiProvider.js";

const DEFAULT_PROMPTS = {
  growth_seo:
    "You are OTO Dial's autonomous SEO strategist. Find high-intent telecom SaaS growth opportunities, competitor gaps, and content plans. Never publish without permission.",
  social_media:
    "You are OTO Dial's social AI team. Draft premium SaaS posts, hooks, image prompts, and replies. Avoid spam and never publish without approved permissions.",
  reputation_monitoring:
    "Monitor public sentiment, complaints, outages, and review risk. Summarize issues and suggest measured admin responses.",
  customer_success:
    "Summarize support issues, detect churn risk, identify angry users, and suggest empathetic replies for admin review.",
  revenue_optimization:
    "Analyze telecom usage, carrier costs, margins, risky accounts, plan abuse, churn risk, and upsell opportunities.",
  content_factory:
    "Generate OTO Dial blogs, landing pages, comparison pages, tutorials, newsletters, and ad copy for admin review.",
  competitive_intelligence:
    "Track competitor launches, pricing, outages, ads, reviews, and feature gaps. Produce executive intelligence briefs.",
  product_strategy:
    "Analyze user behavior, feature usage, churn, UX bottlenecks, and broken product flows. Suggest roadmap priorities.",
};

export async function getOtoAgentsDashboard() {
  const [
    agents,
    runningTasks,
    pendingApprovals,
    recentAssets,
    recentLogs,
    socialAccounts,
    promptCount,
    completedTasks,
    failedTasks,
    reportCount,
    researchDiscoveryCount,
    memoryEntryCount,
    discoveries,
    workflows,
    workflowExecutionCount,
  ] = await Promise.all([
    AIAgent.find({ status: { $ne: "archived" } }).sort({ createdAt: -1 }).limit(50).lean(),
    AIAgentTask.find({ status: { $in: ["queued", "researching", "generating", "waiting_approval", "publishing"] } })
      .populate("agent", "name role autonomyMode status")
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean(),
    AIAgentApproval.find({ status: "pending" })
      .populate("agent", "name role")
      .populate("task", "title taskType")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    AIAsset.find({}).populate("agent", "name role").sort({ createdAt: -1 }).limit(12).lean(),
    AIAgentAuditLog.find({}).populate("agent", "name role").sort({ timestamp: -1 }).limit(40).lean(),
    SocialAccount.find({}).sort({ updatedAt: -1 }).limit(20),
    AIPromptTemplate.countDocuments({}),
    AIAgentTask.countDocuments({ status: "completed" }),
    AIAgentTask.countDocuments({ status: "failed" }),
    AIAgentReport.countDocuments({}),
    ResearchDiscovery.countDocuments({}),
    AgentMemoryEntry.countDocuments({}),
    ResearchDiscovery.find({}).populate("agent", "name role").sort({ createdAt: -1 }).limit(12).lean(),
    AIWorkflow.find({ status: { $ne: "archived" } }).populate("agent", "name role").sort({ createdAt: -1 }).limit(20).lean(),
    AIAgentTask.countDocuments({ taskType: "workflow" }),
  ]);

  const metrics = {
    activeAgents: agents.filter((a) => a.status === "active").length,
    pausedAgents: agents.filter((a) => a.status === "paused").length,
    runningTasks: runningTasks.filter((t) => ["researching", "generating", "publishing"].includes(t.status)).length,
    queuedTasks: runningTasks.filter((t) => t.status === "queued").length,
    approvalsPending: pendingApprovals.length,
    generatedAssets: recentAssets.length,
    connectedPlatforms: socialAccounts.filter((a) => a.status === "connected").length,
    promptTemplates: promptCount,
    completedTasks,
    failedTasks,
    reportsGenerated: reportCount,
    researchDiscoveries: researchDiscoveryCount,
    memoryEntries: memoryEntryCount,
    workflows: workflows.length,
    workflowExecutions: workflowExecutionCount,
  };

  return {
    metrics,
    agents,
    runningTasks,
    pendingApprovals,
    recentAssets,
    recentLogs,
    socialAccounts: socialAccounts.map(redactSocialAccount),
    agentTypes: OTO_AGENT_TYPES,
    discoveries,
    workflows,
    provider: getAiProviderStatus(),
  };
}

export async function createAgent({ adminId, payload }) {
  const role = payload.role || "custom";
  const type = getAgentType(role);
  const agent = await AIAgent.create({
    name: payload.name || type?.name || "Custom OTO Agent",
    description: payload.description || type?.mission || "",
    category: payload.category || "operations",
    avatarIcon: payload.avatarIcon || "spark",
    colorTheme: payload.colorTheme || "indigo",
    role,
    status: payload.status || "draft",
    autonomyMode: payload.autonomyMode || "manual",
    systemPrompt: payload.systemPrompt || DEFAULT_PROMPTS[role] || "",
    mission: payload.mission || payload.description || type?.mission || "",
    responsibilities: Array.isArray(payload.responsibilities) ? payload.responsibilities : [],
    goals: Array.isArray(payload.goals) ? payload.goals : [],
    tone: payload.tone || "",
    behavior: payload.behavior || "",
    executionStyle: payload.executionStyle || "careful, auditable, approval-aware",
    writingStyle: payload.writingStyle || "",
    postingStyle: payload.postingStyle || "",
    createdBy: adminId,
    capabilities: {
      research: payload.capabilities?.research !== false,
      drafting: payload.capabilities?.drafting !== false,
      imageGeneration: Boolean(payload.capabilities?.imageGeneration),
      publishing: Boolean(payload.capabilities?.publishing),
      approvalsRequired: payload.autonomyMode !== "autopilot" || payload.capabilities?.approvalsRequired !== false,
      maxAutopilotActionsPerDay: Math.max(0, Number(payload.capabilities?.maxAutopilotActionsPerDay || 0)),
    },
    connectedPlatforms: Array.isArray(payload.connectedPlatforms) ? payload.connectedPlatforms : [],
    schedules: Array.isArray(payload.schedules) ? payload.schedules : [],
    assignedPromptTemplates: Array.isArray(payload.assignedPromptTemplates) ? payload.assignedPromptTemplates : [],
  });
  await AIAgentAuditLog.create({ agent: agent._id, actorType: "admin", actor: adminId, event: "agent_created" });
  return agent;
}

export async function updateAgentState({ adminId, agentId, action }) {
  const map = {
    start: "active",
    pause: "paused",
    resume: "active",
    stop: "stopped",
    archive: "archived",
  };
  const next = map[action];
  if (!next) throw new Error("invalid_agent_action");
  const agent = await AIAgent.findByIdAndUpdate(agentId, { $set: { status: next } }, { new: true });
  if (!agent) throw new Error("agent_not_found");
  await AIAgentAuditLog.create({ agent: agent._id, actorType: "admin", actor: adminId, event: `agent_${action}` });
  return agent;
}

export async function createTaskAndMaybeRun({ adminId, agentId, payload }) {
  const agent = await AIAgent.findById(agentId);
  if (!agent) throw new Error("agent_not_found");
  const task = await AIAgentTask.create({
    agent: agent._id,
    title: payload.title || "Manual OTO Agent task",
    description: payload.description || "",
    taskType: payload.taskType || "research",
    triggerType: payload.triggerType || "manual",
    input: payload.input || {},
    scheduledFor: payload.scheduledFor || null,
    runAfter: payload.scheduledFor ? new Date(payload.scheduledFor) : new Date(),
    maxRetries: Math.max(0, Number(payload.maxRetries ?? 2)),
    createdBy: adminId,
  });
  await AIAgentAuditLog.create({ agent: agent._id, task: task._id, actorType: "admin", actor: adminId, event: "task_created" });
  if (payload.runNow === true) {
    return runAgentTask({ agentId: agent._id, taskId: task._id, actorId: adminId });
  }
  return { task };
}

export async function duplicateAgent({ adminId, agentId }) {
  const agent = await AIAgent.findById(agentId).lean();
  if (!agent) throw new Error("agent_not_found");
  const copy = { ...agent };
  delete copy._id;
  delete copy.createdAt;
  delete copy.updatedAt;
  copy.name = `${agent.name} Copy`;
  copy.status = "draft";
  copy.createdBy = adminId;
  copy.activeTasks = [];
  copy.approvals = [];
  copy.performanceMetrics = {};
  const created = await AIAgent.create(copy);
  await AIAgentAuditLog.create({ agent: created._id, actorType: "admin", actor: adminId, event: "agent_duplicated", details: { sourceAgentId: agentId } });
  return created;
}

export async function reviewApproval({ adminId, approvalId, status, reviewNote = "" }) {
  if (!["approved", "rejected", "edited"].includes(status)) throw new Error("invalid_approval_status");
  const approval = await AIAgentApproval.findById(approvalId);
  if (!approval) throw new Error("approval_not_found");
  approval.status = status;
  approval.reviewedBy = adminId;
  approval.reviewedAt = new Date();
  approval.reviewNote = reviewNote;
  approval.auditTrail.push({ event: `approval_${status}`, actor: adminId, details: { reviewNote } });
  await approval.save();
  await AIAgent.updateOne(
    { _id: approval.agent },
    {
      $inc: {
        "performanceMetrics.approvalsPending": -1,
        ...(status === "approved"
          ? { "performanceMetrics.approvalsAccepted": 1, "performanceMetrics.tasksCompleted": 1 }
          : { "performanceMetrics.approvalsRejected": 1 }),
      },
    }
  );
  await AIAgentAuditLog.create({
    agent: approval.agent,
    task: approval.task,
    actorType: "admin",
    actor: adminId,
    event: `approval_${status}`,
    details: { approvalId },
  });
  return approval;
}

export async function connectSocialAccount({ adminId, payload }) {
  const encrypted = encryptSecret(payload.credentials || payload.token || "");
  const account = await SocialAccount.create({
    platform: payload.platform,
    username: payload.username,
    encryptedCredentials: encrypted,
    tokens: {
      encryptedAccessToken: payload.token ? encrypted.data : null,
      scopes: Array.isArray(payload.scopes) ? payload.scopes : [],
    },
    permissions: {
      canRead: payload.permissions?.canRead !== false,
      canDraft: payload.permissions?.canDraft !== false,
      canPublish: Boolean(payload.permissions?.canPublish),
      canReply: Boolean(payload.permissions?.canReply),
      requiresApproval: payload.permissions?.requiresApproval !== false,
    },
    linkedAgents: Array.isArray(payload.linkedAgents) ? payload.linkedAgents : [],
    status: payload.token || payload.credentials ? "connected" : "needs_auth",
    createdBy: adminId,
  });
  await AIAgentAuditLog.create({
    actorType: "admin",
    actor: adminId,
    event: "social_account_connected",
    details: { platform: account.platform, username: account.username },
  });
  return redactSocialAccount(account);
}
