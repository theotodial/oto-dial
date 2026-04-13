import { tickScheduledCampaigns, recoverStuckCampaignLocks } from "./campaignSendWorker.js";

let intervalId = null;

export function startCampaignSchedulePoller() {
  if (intervalId) return;

  const tick = async () => {
    try {
      await tickScheduledCampaigns();
      await recoverStuckCampaignLocks();
    } catch (e) {
      console.warn("[campaign-scheduler] tick error:", e?.message || e);
    }
  };

  const ms = Number(process.env.CAMPAIGN_SCHEDULE_POLL_MS || 60_000);
  intervalId = setInterval(tick, ms);
  setTimeout(tick, 5000);
  console.log(`[campaign-scheduler] polling every ${ms}ms`);
}
