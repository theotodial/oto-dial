import AIAgentTask from "../workflows/AIAgentTask.js";
import AIAgentAuditLog from "../audit/AIAgentAuditLog.js";
import { runAgentTask } from "../executors/agentExecutor.js";

let timer = null;
let running = false;

export async function processOtoAgentQueueOnce() {
  if (running) return { skipped: true };
  running = true;
  let processed = 0;
  try {
    const now = new Date();
    const tasks = await AIAgentTask.find({
      status: "queued",
      runAfter: { $lte: now },
    })
      .sort({ createdAt: 1 })
      .limit(Number(process.env.OTO_AGENTS_QUEUE_BATCH_SIZE || 5))
      .lean();

    for (const task of tasks) {
      const claimed = await AIAgentTask.findOneAndUpdate(
        { _id: task._id, status: "queued" },
        { $set: { status: "researching", progress: 5, startedAt: new Date() } },
        { new: true }
      );
      if (!claimed) continue;
      processed += 1;
      try {
        await runAgentTask({ agentId: claimed.agent, taskId: claimed._id, actorId: claimed.createdBy });
      } catch (error) {
        const canRetry = Number(claimed.retryCount || 0) < Number(claimed.maxRetries || 0);
        if (canRetry) {
          await AIAgentTask.updateOne(
            { _id: claimed._id },
            {
              $set: {
                status: "queued",
                runAfter: new Date(Date.now() + 60_000 * (Number(claimed.retryCount || 0) + 1)),
              },
              $inc: { retryCount: 1 },
            }
          );
          await AIAgentAuditLog.create({
            agent: claimed.agent,
            task: claimed._id,
            actorType: "system",
            event: "task_retry_scheduled",
            severity: "warning",
            details: { error: error?.message || String(error) },
          });
        }
      }
    }
    return { processed };
  } finally {
    running = false;
  }
}

export function startOtoAgentsTaskQueue() {
  if (timer) return;
  const tickMs = Number(process.env.OTO_AGENTS_QUEUE_TICK_MS || 30_000);
  timer = setInterval(() => {
    processOtoAgentQueueOnce().catch((error) => {
      console.error("[oto-agents] queue tick failed:", error?.message || error);
    });
  }, tickMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[oto-agents] task queue started (${tickMs}ms)`);
}

export function stopOtoAgentsTaskQueue() {
  if (timer) clearInterval(timer);
  timer = null;
}
