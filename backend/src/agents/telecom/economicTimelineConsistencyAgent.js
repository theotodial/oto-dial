import EconomicTimeline from "../../models/EconomicTimeline.js";
import ProfitEvent from "../../models/ProfitEvent.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import { recomputeTimelineHashFromLean } from "../../services/economicSerializationService.js";

const AGENT = "economic-timeline-consistency-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_ECONOMIC_TIMELINE_INTERVAL_MS || 13 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_ECONOMIC_TIMELINE_LEASE_MS || 12 * 60 * 1000);

export const economicTimelineConsistencyAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const docs = await EconomicTimeline.find({
      $or: [{ lastEconomicEventAt: { $gte: since } }, { finalizedAt: { $gte: since } }],
    })
      .limit(250)
      .lean();

    let checked = 0;
    let corrupt = 0;

    for (const d of docs) {
      checked += 1;
      if (!d.consistencyHash) continue;
      const expected = recomputeTimelineHashFromLean(d);
      if (expected && expected !== d.consistencyHash) {
        corrupt += 1;
        const payload = {
          timelineId: d.timelineId,
          callId: String(d.callId),
          userId: String(d.user),
          storedHash: d.consistencyHash,
          recomputedHash: expected,
          economicVersion: d.economicVersion,
          timelineState: d.timelineState,
        };
        await emitAgentAlert(AGENT, "error", "billing_timeline_corruption", payload);
        log("error", "billing_timeline_corruption", { callId: String(d.callId) });
        await ProfitEvent.create({
          userId: d.user,
          eventType: "billing_timeline_corruption",
          severity: "critical",
          payload,
          timestamp: new Date(),
        }).catch((err) => {
          log("error", "profit_event_write_failed", { message: err?.message || String(err) });
        });
      }
    }

    return { checked, corrupt };
  },
};
