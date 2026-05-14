/**
 * Priority telecom task scheduler — never replaces billing/transition paths;
 * defers LOW work first under pressure.
 */

async function readPressure() {
  const { getPressureSnapshot } = await import("./telecomBackpressureService.js");
  return getPressureSnapshot();
}

export const TELECOM_PRIORITY = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

const PRI_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

let queueDepth = 0;
let deferredTasks = 0;
let droppedTasks = 0;

function normalizePriority(p) {
  const s = String(p || "").toUpperCase();
  if (s === "CRITICAL" || s === "HIGH" || s === "MEDIUM" || s === "LOW") return s;
  return "MEDIUM";
}

async function shouldDropOrDefer(priority) {
  const snap = await readPressure();
  const level = snap.pressureLevel;
  if (priority === "LOW" && (level === "high" || level === "critical")) return "drop";
  if (priority === "LOW" && level === "elevated") return "defer";
  if (priority === "MEDIUM" && level === "critical") return "defer";
  return null;
}

export function getTelecomSchedulerStats() {
  return {
    queueDepth,
    deferredTasks,
    droppedTasks,
  };
}

/**
 * @template T
 * @param {string} priority
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<{ ok: boolean, dropped?: boolean, deferred?: boolean, result?: T, error?: string }>}
 */
export async function scheduleTelecomTask(priority, fn) {
  const p = normalizePriority(priority);
  const decision = await shouldDropOrDefer(p);
  if (decision === "drop") {
    droppedTasks += 1;
    return { ok: false, dropped: true };
  }

  const run = async () => {
    queueDepth += 1;
    try {
      const { setSchedulerQueueDepthHint } = await import("./telecomBackpressureService.js");
      setSchedulerQueueDepthHint(queueDepth);
    } catch {
      /* ignore */
    }
    try {
      const result = await fn();
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    } finally {
      queueDepth = Math.max(0, queueDepth - 1);
      try {
        const { setSchedulerQueueDepthHint } = await import("./telecomBackpressureService.js");
        setSchedulerQueueDepthHint(queueDepth);
      } catch {
        /* ignore */
      }
    }
  };

  if (decision === "defer") {
    deferredTasks += 1;
    await new Promise((r) => setTimeout(r, PRI_ORDER[p] === 3 ? 250 : 75));
  }

  if (PRI_ORDER[p] <= 1) {
    return run();
  }
  return new Promise((resolve) => {
    setImmediate(() => {
      void run().then(resolve);
    });
  });
}
