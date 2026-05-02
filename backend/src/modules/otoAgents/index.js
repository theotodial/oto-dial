import express from "express";
import AIAgent from "./agents/AIAgent.js";
import AIAgentTask from "./workflows/AIAgentTask.js";
import AIAgentApproval from "./approvals/AIAgentApproval.js";
import AIAgentAuditLog from "./audit/AIAgentAuditLog.js";
import SocialAccount from "./connectors/SocialAccount.js";
import AIPromptTemplate from "./prompts/AIPromptTemplate.js";
import AIAsset from "./media/AIAsset.js";
import AIAgentReport from "./reporting/AIAgentReport.js";
import ResearchDiscovery from "./research/ResearchDiscovery.js";
import AgentMemoryEntry from "./memory/AgentMemoryEntry.js";
import AIWorkflow from "./workflows/AIWorkflow.js";
import { redactSocialAccount } from "./connectors/credentialVault.js";
import {
  connectSocialAccount,
  createAgent,
  createTaskAndMaybeRun,
  duplicateAgent,
  getOtoAgentsDashboard,
  reviewApproval,
  updateAgentState,
} from "./reporting/otoAgentsService.js";
import { runAgentTask } from "./executors/agentExecutor.js";
import { processOtoAgentQueueOnce } from "./scheduler/taskQueue.js";
import { executeAiPrompt, getAiProviderStatus } from "./executors/aiProvider.js";
import { emitAdminSocketEvent } from "../../services/adminLiveEventsService.js";

const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    const dashboard = await getOtoAgentsDashboard();
    res.json({ success: true, dashboard });
  } catch (error) {
    console.error("[oto-agents] dashboard failed:", error?.message || error);
    res.status(500).json({ success: false, error: "Failed to load OTO Agents dashboard" });
  }
});

router.get("/agents", async (_req, res) => {
  const agents = await AIAgent.find({ status: { $ne: "archived" } }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, agents });
});

router.post("/agents", async (req, res) => {
  try {
    const agent = await createAgent({ adminId: req.userId, payload: req.body || {} });
    emitAdminSocketEvent("oto_agents:agent_created", { agentId: String(agent._id), name: agent.name });
    res.status(201).json({ success: true, agent });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to create agent" });
  }
});

router.put("/agents/:id", async (req, res) => {
  try {
    const allowed = [
      "name",
      "description",
      "category",
      "avatarIcon",
      "colorTheme",
      "autonomyMode",
      "systemPrompt",
      "mission",
      "responsibilities",
      "goals",
      "tone",
      "behavior",
      "executionStyle",
      "writingStyle",
      "postingStyle",
      "capabilities",
      "schedules",
      "connectedPlatforms",
      "assignedPromptTemplates",
    ];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) patch[key] = req.body[key];
    }
    const agent = await AIAgent.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
    if (!agent) return res.status(404).json({ success: false, error: "Agent not found" });
    await AIAgentAuditLog.create({ agent: agent._id, actorType: "admin", actor: req.userId, event: "agent_updated" });
    emitAdminSocketEvent("oto_agents:agent_updated", { agentId: String(agent._id), name: agent.name });
    res.json({ success: true, agent });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to update agent" });
  }
});

router.delete("/agents/:id", async (req, res) => {
  const agent = await AIAgent.findByIdAndUpdate(req.params.id, { $set: { status: "archived" } }, { new: true });
  if (!agent) return res.status(404).json({ success: false, error: "Agent not found" });
  await AIAgentAuditLog.create({ agent: agent._id, actorType: "admin", actor: req.userId, event: "agent_deleted" });
  emitAdminSocketEvent("oto_agents:agent_updated", { agentId: String(agent._id), status: "archived" });
  res.json({ success: true, agent });
});

router.post("/agents/:id/:action", async (req, res) => {
  try {
    const agent =
      req.params.action === "duplicate"
        ? await duplicateAgent({ adminId: req.userId, agentId: req.params.id })
        : await updateAgentState({ adminId: req.userId, agentId: req.params.id, action: req.params.action });
    emitAdminSocketEvent("oto_agents:agent_updated", { agentId: String(agent._id), status: agent.status });
    res.json({ success: true, agent });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to update agent" });
  }
});

router.post("/agents/:id/test", async (req, res) => {
  try {
    const agent = await AIAgent.findById(req.params.id).lean();
    if (!agent) return res.status(404).json({ success: false, error: "Agent not found" });
    const result = await executeAiPrompt({
      systemPrompt: agent.systemPrompt || "You are an OTO Agents operator.",
      userPrompt: req.body?.prompt || "Run a short test.",
      model: agent.aiModel?.model,
      temperature: agent.aiModel?.temperature ?? 0.4,
      expectJson: false,
    });
    await AIAgentAuditLog.create({
      agent: agent._id,
      actorType: "admin",
      actor: req.userId,
      event: "agent_playground_test",
      details: { prompt: String(req.body?.prompt || "").slice(0, 500), provider: result.provider, model: result.model },
    });
    res.json({ success: true, result });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Agent test failed" });
  }
});

router.post("/agents/:id/tasks", async (req, res) => {
  try {
    const result = await createTaskAndMaybeRun({ adminId: req.userId, agentId: req.params.id, payload: req.body || {} });
    emitAdminSocketEvent("oto_agents:task_created", { agentId: req.params.id, taskId: String(result.task?._id || "") });
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to create task" });
  }
});

router.get("/tasks", async (_req, res) => {
  const tasks = await AIAgentTask.find({})
    .populate("agent", "name role autonomyMode status")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, tasks });
});

router.post("/tasks/:id/run", async (req, res) => {
  try {
    const task = await AIAgentTask.findById(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: "Task not found" });
    const result = await runAgentTask({ agentId: task.agent, taskId: task._id, actorId: req.userId });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Task execution failed" });
  }
});

router.post("/tasks/:id/retry", async (req, res) => {
  const task = await AIAgentTask.findByIdAndUpdate(
    req.params.id,
    { $set: { status: "queued", progress: 0, failureReason: "", runAfter: new Date() }, $inc: { retryCount: 1 } },
    { new: true }
  );
  if (!task) return res.status(404).json({ success: false, error: "Task not found" });
  await AIAgentAuditLog.create({ agent: task.agent, task: task._id, actorType: "admin", actor: req.userId, event: "task_retry_queued" });
  emitAdminSocketEvent("oto_agents:task_update", { taskId: String(task._id), status: task.status, progress: task.progress });
  res.json({ success: true, task });
});

router.post("/tasks/:id/cancel", async (req, res) => {
  const task = await AIAgentTask.findByIdAndUpdate(
    req.params.id,
    {
      $set: {
        status: "canceled",
        progress: 100,
        completedAt: new Date(),
        failureReason: "Canceled by admin",
      },
      $push: { executionLogs: { event: "task_canceled", details: { actor: req.userId } } },
    },
    { new: true }
  );
  if (!task) return res.status(404).json({ success: false, error: "Task not found" });
  await AIAgentAuditLog.create({ agent: task.agent, task: task._id, actorType: "admin", actor: req.userId, event: "task_canceled" });
  emitAdminSocketEvent("oto_agents:task_update", { taskId: String(task._id), status: task.status, progress: task.progress });
  res.json({ success: true, task });
});

router.post("/queue/process", async (_req, res) => {
  const result = await processOtoAgentQueueOnce();
  res.json({ success: true, result });
});

router.get("/approvals", async (_req, res) => {
  const approvals = await AIAgentApproval.find({})
    .populate("agent", "name role")
    .populate("task", "title taskType")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, approvals });
});

router.post("/approvals/:id/review", async (req, res) => {
  try {
    const approval = await reviewApproval({
      adminId: req.userId,
      approvalId: req.params.id,
      status: req.body?.status,
      reviewNote: req.body?.reviewNote || "",
    });
    emitAdminSocketEvent("oto_agents:approval_reviewed", { approvalId: String(approval._id), status: approval.status });
    res.json({ success: true, approval });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to review approval" });
  }
});

router.get("/timeline", async (_req, res) => {
  const logs = await AIAgentAuditLog.find({})
    .populate("agent", "name role")
    .populate("task", "title taskType")
    .sort({ timestamp: -1 })
    .limit(150)
    .lean();
  res.json({ success: true, logs });
});

router.get("/assets", async (_req, res) => {
  const assets = await AIAsset.find({}).populate("agent", "name role").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, assets });
});

router.get("/reports", async (_req, res) => {
  const reports = await AIAgentReport.find({}).populate("agent", "name role").populate("task", "title taskType").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, reports });
});

router.get("/research", async (_req, res) => {
  const discoveries = await ResearchDiscovery.find({}).populate("agent", "name role").sort({ createdAt: -1 }).limit(150).lean();
  res.json({ success: true, discoveries });
});

router.get("/memory/:agentId", async (req, res) => {
  const memories = await AgentMemoryEntry.find({ agent: req.params.agentId }).sort({ importance: -1, createdAt: -1 }).limit(100).lean();
  res.json({ success: true, memories });
});

router.post("/memory/:agentId", async (req, res) => {
  try {
    const memory = await AgentMemoryEntry.create({
      agent: req.params.agentId,
      type: req.body?.type || "preference",
      content: req.body?.content,
      metadata: req.body?.metadata || {},
      importance: Math.min(10, Math.max(1, Number(req.body?.importance || 5))),
      createdBy: req.userId,
    });
    res.status(201).json({ success: true, memory });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to save memory" });
  }
});

router.get("/prompts", async (_req, res) => {
  const prompts = await AIPromptTemplate.find({}).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, prompts });
});

router.post("/prompts", async (req, res) => {
  try {
    const prompt = await AIPromptTemplate.create({
      name: req.body?.name,
      category: req.body?.category || "custom",
      description: req.body?.description || "",
      template: req.body?.template,
      variables: Array.isArray(req.body?.variables) ? req.body.variables : [],
      behaviorRules: Array.isArray(req.body?.behaviorRules) ? req.body.behaviorRules : [],
      createdBy: req.userId,
    });
    res.status(201).json({ success: true, prompt });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to create prompt" });
  }
});

router.put("/prompts/:id", async (req, res) => {
  const prompt = await AIPromptTemplate.findByIdAndUpdate(req.params.id, { $set: req.body || {} }, { new: true });
  if (!prompt) return res.status(404).json({ success: false, error: "Prompt not found" });
  res.json({ success: true, prompt });
});

router.delete("/prompts/:id", async (req, res) => {
  await AIPromptTemplate.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.post("/prompts/:id/assign", async (req, res) => {
  const agent = await AIAgent.findByIdAndUpdate(
    req.body?.agentId,
    { $addToSet: { assignedPromptTemplates: req.params.id } },
    { new: true }
  );
  if (!agent) return res.status(404).json({ success: false, error: "Agent not found" });
  await AIAgentAuditLog.create({ agent: agent._id, actorType: "admin", actor: req.userId, event: "prompt_assigned", details: { promptId: req.params.id } });
  res.json({ success: true, agent });
});

router.post("/prompts/:id/clone", async (req, res) => {
  const prompt = await AIPromptTemplate.findById(req.params.id).lean();
  if (!prompt) return res.status(404).json({ success: false, error: "Prompt not found" });
  const clone = { ...prompt };
  delete clone._id;
  delete clone.createdAt;
  delete clone.updatedAt;
  clone.name = `${prompt.name} Copy`;
  clone.createdBy = req.userId;
  const created = await AIPromptTemplate.create(clone);
  res.status(201).json({ success: true, prompt: created });
});

router.get("/workflows", async (_req, res) => {
  const workflows = await AIWorkflow.find({ status: { $ne: "archived" } }).populate("agent", "name role").sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, workflows });
});

router.post("/workflows", async (req, res) => {
  try {
    const workflow = await AIWorkflow.create({
      name: req.body?.name,
      description: req.body?.description || "",
      agent: req.body?.agent || null,
      status: req.body?.status || "draft",
      trigger: req.body?.trigger || { type: "manual" },
      steps: Array.isArray(req.body?.steps) ? req.body.steps : [],
      createdBy: req.userId,
    });
    res.status(201).json({ success: true, workflow });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to create workflow" });
  }
});

router.post("/workflows/:id/execute", async (req, res) => {
  try {
    const workflow = await AIWorkflow.findById(req.params.id);
    if (!workflow) return res.status(404).json({ success: false, error: "Workflow not found" });
    if (!workflow.agent) return res.status(400).json({ success: false, error: "Workflow has no assigned agent" });
    await AIAgentAuditLog.create({ agent: workflow.agent, actorType: "admin", actor: req.userId, event: "workflow_started", details: { workflowId: workflow._id } });
    emitAdminSocketEvent("oto_agents:workflow_started", { workflowId: String(workflow._id), agentId: String(workflow.agent) });
    const result = await createTaskAndMaybeRun({
      adminId: req.userId,
      agentId: workflow.agent,
      payload: {
        title: `Workflow: ${workflow.name}`,
        description: workflow.description,
        taskType: "workflow",
        triggerType: "manual",
        input: { workflowId: String(workflow._id), steps: workflow.steps },
        runNow: req.body?.runNow !== false,
      },
    });
    emitAdminSocketEvent("oto_agents:workflow_completed", { workflowId: String(workflow._id), taskId: String(result.task?._id || "") });
    res.json({ success: true, workflow, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Workflow execution failed" });
  }
});

router.get("/social-accounts", async (_req, res) => {
  const accounts = await SocialAccount.find({}).sort({ updatedAt: -1 }).limit(100);
  res.json({ success: true, accounts: accounts.map(redactSocialAccount) });
});

router.post("/social-accounts", async (req, res) => {
  try {
    const account = await connectSocialAccount({ adminId: req.userId, payload: req.body || {} });
    res.status(201).json({ success: true, account });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || "Failed to connect social account" });
  }
});

router.put("/social-accounts/:id", async (req, res) => {
  const allowed = ["username", "permissions", "linkedAgents", "status", "metadata"];
  const patch = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) patch[key] = req.body[key];
  const account = await SocialAccount.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
  if (!account) return res.status(404).json({ success: false, error: "Social account not found" });
  res.json({ success: true, account: redactSocialAccount(account) });
});

router.delete("/social-accounts/:id", async (req, res) => {
  await SocialAccount.findByIdAndDelete(req.params.id);
  await AIAgentAuditLog.create({ actorType: "admin", actor: req.userId, event: "social_account_removed", details: { accountId: req.params.id } });
  res.json({ success: true });
});

router.post("/social-accounts/:id/test", async (req, res) => {
  const account = await SocialAccount.findById(req.params.id);
  if (!account) return res.status(404).json({ success: false, error: "Social account not found" });
  const ok = account.status === "connected" && Boolean(account.tokens?.encryptedAccessToken || account.encryptedCredentials?.data);
  await AIAgentAuditLog.create({
    actorType: "admin",
    actor: req.userId,
    event: "social_account_tested",
    severity: ok ? "info" : "warning",
    details: { accountId: req.params.id, platform: account.platform, ok },
  });
  res.json({ success: true, ok, message: ok ? "Stored credentials are present." : "No stored credential/token is available." });
});

router.get("/provider-status", (_req, res) => {
  res.json({
    success: true,
    provider: getAiProviderStatus(),
    scheduler: { queueTickMs: Number(process.env.OTO_AGENTS_QUEUE_TICK_MS || 30000) },
    websocket: { adminEvents: true },
  });
});

export default router;
