import SMS from "../../models/SMS.js";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import { emitUserStateResyncRequired } from "../../events/smsEvents.js";
import { ACTIVE_CALL_STATUSES } from "../../utils/callStateMachine.js";
import { shouldSuppressNonCriticalWebhookWork } from "../../services/webhookBurstProtectionService.js";

const AGENT = "live-state-sync-agent";

export const liveStateSyncAgent = {
  name: AGENT,
  intervalMs: Number(process.env.AGENT_LIVE_SYNC_INTERVAL_MS || 2 * 60 * 1000),
  leaseMs: Number(process.env.AGENT_LIVE_SYNC_LEASE_MS || 90 * 1000),

  async run({ log }) {
    if (shouldSuppressNonCriticalWebhookWork("parity_refresh")) {
      log("info", "live_state_sync_skipped_load", {});
      return { skipped: true, reason: "parity_refresh_suppressed" };
    }
    const cutoff = new Date(Date.now() - Number(process.env.AGENT_LIVE_SYNC_STALE_MS || 10 * 60 * 1000));
    const [recentSmsUsers, activeCallUsers, recentlyUpdatedSubs] = await Promise.all([
      SMS.distinct("user", { updatedAt: { $gte: cutoff } }),
      Call.distinct("user", { status: { $in: ACTIVE_CALL_STATUSES } }),
      Subscription.distinct("userId", { updatedAt: { $gte: cutoff } }),
    ]);

    const users = new Set(
      [...recentSmsUsers, ...activeCallUsers, ...recentlyUpdatedSubs]
        .filter(Boolean)
        .map((id) => String(id))
    );

    for (const userId of users) {
      emitUserStateResyncRequired(userId, { reason: "periodic_live_state_reconcile" });
    }

    log("info", "live_state_sync_complete", { usersNotified: users.size });
    return { usersNotified: users.size };
  },
};
