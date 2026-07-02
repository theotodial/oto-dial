/**
 * GA4 debug + status for admin analytics panel.
 */
import { getGa4ConfigSummary } from "./ga4ConfigService.js";
import { runReconciliation } from "./reconciliationService.js";
import { resolveTimeframe, DEFAULT_TIMEFRAME } from "./timeframeService.js";

export function getGa4AdminStatus() {
  const ga4 = getGa4ConfigSummary();

  return {
    at: new Date().toISOString(),
    measurementId: ga4.measurementId,
    enabled: ga4.enabled,
    debug: ga4.debug,
    configured: ga4.configured,
    mpConfigured: ga4.mpConfigured,
    dataApiConfigured: ga4.dataApiConfigured,
    missing: ga4.missing,
    measurementProtocol: ga4.measurementProtocol,
    dataApi: ga4.dataApi,
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
