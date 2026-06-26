import Call from "../models/Call.js";
import { BILLING_MATRIX_CALL_SOURCE } from "../config/creditConfig.js";
import {
  billConnectedDurationIntervals,
  releaseUnusedCallReservation,
} from "./callCreditBillingService.js";
import { recoverActiveCallEconomics } from "./economicRecoveryService.js";
import { setBillingWorkerTickHint } from "./telecomBackpressureService.js";

const TICK_MS = Number(process.env.CALL_CREDIT_TICK_MS || 6000);
const MAX_ACTIVE_CALLS_PER_TICK = Number(process.env.CALL_CREDIT_MAX_CALLS || 200);

let lastTickCompletedAt = 0;

function workerLog(phase, details = {}) {
  console.log("[BILLING WORKER]", { phase, ...details, t: new Date().toISOString() });
}

export function startCallCreditIntervalWorker() {
  const timer = setInterval(async () => {
    const tickStarted = Date.now();
    if (lastTickCompletedAt > 0) {
      const drift = tickStarted - lastTickCompletedAt - TICK_MS;
      if (drift > TICK_MS * 0.75) {
        workerLog("lag_detected", { driftMs: drift, tickMs: TICK_MS });
      }
    }
    workerLog("worker_tick", { tickMs: TICK_MS });
    let recovered = 0;
    try {
      const rec = await recoverActiveCallEconomics({ mode: "sweep", limit: 25 });
      recovered = rec.processed || 0;
      if (recovered > 0) {
        workerLog("recovered_intervals", { processed: recovered });
      }
    } catch (e) {
      console.warn("[BILLING WORKER] recovery sweep failed", e?.message || e);
    }

    try {
      const activeCalls = await Call.find({
        direction: "outbound",
        status: { $in: ["answered", "in-progress"] },
        source: { $ne: BILLING_MATRIX_CALL_SOURCE },
      })
        .select(
          "_id user status direction callAnsweredAt callStartedAt durationCreditsCharged attemptChargedAt creditReservationHeld updatedAt"
        )
        .sort({ updatedAt: -1 })
        .limit(MAX_ACTIVE_CALLS_PER_TICK);

      workerLog("active_call_scan", { count: activeCalls.length });

      setBillingWorkerTickHint(activeCalls.length, TICK_MS);

      for (const call of activeCalls) {
        await billConnectedDurationIntervals(call);
      }

      const terminalUnreleased = await Call.find({
        direction: "outbound",
        status: { $in: ["completed", "failed", "rejected", "canceled", "busy", "no-answer"] },
        creditReservationHeld: { $gt: 0 },
        creditReservationReleasedAt: null,
      })
        .select(
          "_id user status direction durationCreditsCharged attemptChargedAt creditReservationHeld creditReservationReleasedAt"
        )
        .limit(MAX_ACTIVE_CALLS_PER_TICK);

      for (const call of terminalUnreleased) {
        await releaseUnusedCallReservation(call);
      }
    } catch (err) {
      console.warn("[callCreditIntervalWorker]", err?.message || err);
    } finally {
      lastTickCompletedAt = Date.now();
    }
  }, TICK_MS);

  if (typeof timer.unref === "function") timer.unref();
}
