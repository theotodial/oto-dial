import AIAgentTask from "../workflows/AIAgentTask.js";
import AIAgentApproval from "../approvals/AIAgentApproval.js";
import AIAsset from "../media/AIAsset.js";
import AIAgentAuditLog from "../audit/AIAgentAuditLog.js";
import AIAgent from "../agents/AIAgent.js";
import AIAgentReport from "../reporting/AIAgentReport.js";
import ResearchDiscovery from "../research/ResearchDiscovery.js";
import AgentMemoryEntry from "../memory/AgentMemoryEntry.js";
import { collectResearchSources } from "../research/researchEngine.js";
import { generateBrandedImageAsset } from "../media/imageGenerator.js";
import { executeAiPrompt } from "./aiProvider.js";
import { emitAdminSocketEvent } from "../../../services/adminLiveEventsService.js";

function emitTaskUpdate(task, event, details = {}) {
  emitAdminSocketEvent("oto_agents:task_update", {
    taskId: String(task._id),
    agentId: String(task.agent),
    status: task.status,
    progress: task.progress,
    event,
    details,
  });
}

async function transitionTask(task, status, progress, event, details = {}) {
  task.status = status;
  task.progress = progress;
  task.executionLogs.push({ event, details });
  await task.save();
  await AIAgentAuditLog.create({
    agent: task.agent,
    task: task._id,
    actorType: "agent",
    event,
    details: { status, progress, ...details },
  });
  emitTaskUpdate(task, event, details);
}

function buildSystemPrompt(agent, memories = []) {
  const memoryText = memories.map((m) => `- [${m.type}] ${m.content}`).join("\n");
  return [
    agent.systemPrompt || "You are an OTO Agents operator.",
    "",
    "Agent identity:",
    `Name: ${agent.name}`,
    `Role: ${agent.role}`,
    `Mission: ${agent.mission || agent.description || "No mission configured"}`,
    `Tone: ${agent.tone || "premium, direct, enterprise SaaS"}`,
    `Execution style: ${agent.executionStyle || "careful, auditable, approval-aware"}`,
    `Writing style: ${agent.writingStyle || "clear, strategic, concise"}`,
    `Posting style: ${agent.postingStyle || "non-spammy, useful, brand-safe"}`,
    "",
    "Safety rules:",
    "- Do not claim live publishing occurred unless explicitly instructed by the system.",
    "- Do not expose credentials or secrets.",
    "- For Co-Pilot mode, produce drafts and suggested actions only.",
    "- For Autopilot mode, stay within configured permissions.",
    "",
    memoryText ? `Persistent memory:\n${memoryText}` : "Persistent memory: none yet.",
  ].join("\n");
}

function buildUserPrompt(task, research) {
  return [
    `Task title: ${task.title}`,
    `Task type: ${task.taskType}`,
    task.description ? `Description: ${task.description}` : "",
    `Admin input:\n${JSON.stringify(task.input || {}, null, 2)}`,
    research?.sources?.length
      ? `Live research sources:\n${research.sources
          .map((s, i) => `${i + 1}. ${s.title}\n${s.url}\n${s.content}`)
          .join("\n\n")}`
      : research?.note || "",
    "",
    "Return strict JSON with keys:",
    "summary, reasoning, generatedText, hashtags, findings, suggestedActions, reportTitle, assetPrompts, memoryUpdates.",
    "findings and suggestedActions must be arrays. assetPrompts and memoryUpdates must be arrays.",
  ].join("\n");
}

export async function runAgentTask({ agentId, taskId, actorId }) {
  const agent = await AIAgent.findById(agentId);
  const task = await AIAgentTask.findById(taskId);
  if (!agent || !task) {
    throw new Error("agent_or_task_not_found");
  }
  if (agent.status === "paused" || agent.status === "stopped") {
    throw new Error("agent_not_running");
  }

  try {
    task.startedAt = task.startedAt || new Date();
    await transitionTask(task, "researching", 15, "task_research_started");

    const memories = await AgentMemoryEntry.find({ agent: agent._id }).sort({ importance: -1, createdAt: -1 }).limit(12).lean();
    const query = `${task.title} ${task.description || ""} ${agent.role} OTO Dial telecom SaaS`;
    const research = agent.capabilities?.research
      ? await collectResearchSources({ query })
      : { sources: [], liveResearchEnabled: false, note: "Research capability disabled for this agent." };

    await transitionTask(task, "generating", 45, "task_generation_started", {
      liveResearchEnabled: research.liveResearchEnabled,
      sourceCount: research.sources?.length || 0,
    });

    const ai = await executeAiPrompt({
      systemPrompt: buildSystemPrompt(agent, memories),
      userPrompt: buildUserPrompt(task, research),
      model: agent.aiModel?.model,
      temperature: agent.aiModel?.temperature ?? 0.4,
      expectJson: true,
    });

    const parsed = ai.json || {};
    const output = {
      text: parsed.generatedText || ai.text,
      reasoning: parsed.reasoning || parsed.summary || "",
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
      raw: { parsed, provider: ai.provider, model: ai.model, usage: ai.usage },
    };
    task.output = output;

    const discoveries = Array.isArray(parsed.findings) ? parsed.findings : [];
    for (const finding of discoveries.slice(0, 20)) {
      await ResearchDiscovery.create({
        agent: agent._id,
        task: task._id,
        category: task.taskType === "research" ? "trend" : task.taskType === "report" ? "seo_keyword" : "other",
        title: String(finding.title || finding.keyword || finding.name || "AI discovery").slice(0, 160),
        summary: String(finding.summary || finding.detail || finding.description || "").slice(0, 2000),
        sourceUrl: finding.url || finding.sourceUrl || "",
        sourceName: finding.source || "",
        opportunityScore: Number.isFinite(Number(finding.score)) ? Number(finding.score) : null,
        evidence: finding,
        createdBy: actorId || agent.createdBy,
      });
    }

    const report = await AIAgentReport.create({
      agent: agent._id,
      task: task._id,
      type: agent.role === "growth_seo" ? "seo" : agent.role === "social_media" ? "social" : agent.role === "competitive_intelligence" ? "competitor" : "custom",
      title: parsed.reportTitle || `${task.title} report`,
      summary: parsed.summary || output.reasoning || "",
      findings: discoveries,
      suggestedActions: output.suggestedActions,
      sourceCount: research.sources?.length || 0,
      createdBy: actorId || agent.createdBy,
    });
    task.report = report._id;

    const asset = await AIAsset.create({
      agent: agent._id,
      task: task._id,
      type: task.taskType === "asset" ? "ad_creative" : task.taskType === "report" ? "report" : "social_post",
      title: task.title,
      content: output,
      status: "draft",
      createdBy: actorId || agent.createdBy,
    });

    if (agent.capabilities?.imageGeneration && Array.isArray(parsed.assetPrompts) && parsed.assetPrompts[0]) {
      await generateBrandedImageAsset({
        agent,
        task,
        prompt: parsed.assetPrompts[0],
        createdBy: actorId || agent.createdBy,
      });
    }

    for (const memory of (Array.isArray(parsed.memoryUpdates) ? parsed.memoryUpdates : []).slice(0, 10)) {
      await AgentMemoryEntry.create({
        agent: agent._id,
        task: task._id,
        type: memory.type || "output_summary",
        content: String(memory.content || memory.summary || memory).slice(0, 4000),
        metadata: memory,
        importance: Math.min(10, Math.max(1, Number(memory.importance || 5))),
        createdBy: actorId || null,
      });
    }

    const requiresApproval =
      agent.autonomyMode !== "autopilot" ||
      agent.capabilities?.approvalsRequired !== false ||
      !agent.capabilities?.publishing;

    let approval = null;
    if (requiresApproval) {
      approval = await AIAgentApproval.create({
        agent: agent._id,
        task: task._id,
        actionType: task.taskType === "asset" ? "create_asset" : "run_workflow",
        status: "pending",
        preview: output,
        riskLevel: agent.autonomyMode === "autopilot" ? "medium" : "low",
        auditTrail: [{ event: "approval_requested", actor: actorId || null, details: { mode: agent.autonomyMode } }],
      });
      task.approval = approval._id;
      await transitionTask(task, "waiting_approval", 85, "approval_requested", { approvalId: approval._id });
    } else {
      await transitionTask(task, "publishing", 90, "autopilot_publish_stage_entered");
      // External publishing connectors are intentionally permission-gated and not auto-posted in Phase 2.
      await transitionTask(task, "completed", 100, "task_completed_without_external_publish");
    }

    if (requiresApproval) {
      task.progress = 90;
      await task.save();
    }
    await AIAgent.updateOne(
      { _id: agent._id },
      {
        $set: { "performanceMetrics.lastRunAt": new Date() },
        $inc: {
          "performanceMetrics.contentGenerated": 1,
          ...(requiresApproval ? { "performanceMetrics.approvalsPending": 1 } : { "performanceMetrics.tasksCompleted": 1 }),
        },
        $addToSet: { activeTasks: task._id, approvals: approval?._id },
      }
    );

    return { task, approval, asset, report };
  } catch (error) {
    task.status = "failed";
    task.progress = 100;
    task.failureReason = String(error?.message || error || "task_failed").slice(0, 1000);
    task.completedAt = new Date();
    task.executionLogs.push({ event: "task_failed", details: { error: task.failureReason } });
    await task.save();
    await AIAgent.updateOne({ _id: agent._id }, { $inc: { "performanceMetrics.riskFlags": 1 } });
    await AIAgentAuditLog.create({
      agent: agent._id,
      task: task._id,
      actorType: "agent",
      event: "task_failed",
      severity: "critical",
      details: { error: task.failureReason },
    });
    emitTaskUpdate(task, "task_failed", { error: task.failureReason });
    throw error;
  }
}
