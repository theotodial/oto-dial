/**
 * GA4 debug + status for admin analytics panel.
 */
import {
  isMeasurementProtocolConfigured,
  getGa4MpStats
} from "./gaMeasurementProtocolService.js";
import { runReconciliation } from "./reconciliationService.js";
import { resolveTimeframe, DEFAULT_TIMEFRAME } from "./timeframeService.js";

export function getGa4AdminStatus() {
  const config = {
    measurementId:
      process.env.GA4_MEASUREMENT_ID ||
      process.env.GA_MEASUREMENT_ID ||
      "G-X3WN8RYCQ5",
    enabled: String(process.env.GA4_ENABLED || "true").toLowerCase() !== "false",
    debug: String(process.env.GA4_DEBUG || "false").toLowerCase() === "true",
    mpConfigured: isMeasurementProtocolConfigured()
  };

  return {
    at: new Date().toISOString(),
    ...config,
    measurementProtocol: getGa4MpStats(),
    note: "Internal analytics is primary; GA4 is verification layer"
  };
}

export async function getGa4ReconciliationReport({ window = DEFAULT_TIMEFRAME } = {}) {
  const tf = resolveTimeframe({ window });
  const reconciliation = await runReconciliation({ start: tf.start, end: tf.end });
  return {
    window: tf,
    reconciliation,
    ga4: getGa4AdminStatus()
  };
}

export default { getGa4AdminStatus, getGa4ReconciliationReport };
