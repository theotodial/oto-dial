/**
 * Periodic GA4 ↔ internal analytics reconciliation (logs warnings).
 */
import { runReconciliation } from "./reconciliationService.js";
import { getGa4MpStats } from "./gaMeasurementProtocolService.js";
import { resolveTimeframe } from "./timeframeService.js";

const INTERVAL_MS = Number(process.env.GA4_RECONCILE_INTERVAL_MS || 5 * 60 * 1000);

let timer = null;

export function startGa4ReconciliationWorker() {
  if (timer) return;
  if (String(process.env.GA4_RECONCILE_ENABLED || "true").toLowerCase() === "false") {
    return;
  }

  const run = async () => {
    try {
      const tf = resolveTimeframe({ window: "24h" });
      const report = await runReconciliation({ start: tf.start, end: tf.end });
      const mp = getGa4MpStats();
      if (!report.healthy) {
        console.warn(
          "[ga4:reconcile] mismatches in last 24h:",
          report.warnings?.map((w) => w.metric).join(", ")
        );
      }
      if (mp.queueLength > 0) {
        console.warn(`[ga4:mp] retry queue length: ${mp.queueLength}`);
      }
    } catch (e) {
      console.warn("[ga4:reconcile] error:", e?.message || e);
    }
  };

  setTimeout(run, 60_000);
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
}

export default { startGa4ReconciliationWorker };
