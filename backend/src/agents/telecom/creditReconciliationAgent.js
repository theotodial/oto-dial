import { runSystemReconciliation } from "../../services/creditReconciliationService.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import ProfitEvent from "../../models/ProfitEvent.js";

const AGENT = "credit-reconciliation-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_CREDIT_RECONCILIATION_INTERVAL_MS || 15 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_CREDIT_RECONCILIATION_LEASE_MS || 14 * 60 * 1000);
const LOOKBACK_DAYS = Number(process.env.AGENT_CREDIT_RECONCILIATION_LOOKBACK_DAYS || 7);
const USER_BATCH = Math.min(300, Math.max(20, Number(process.env.AGENT_CREDIT_RECONCILIATION_USER_BATCH || 80)));

export const creditReconciliationAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const report = await runSystemReconciliation({
      since,
      userBatch: USER_BATCH,
      deepScan: true,
      perUserLimit: 50,
    });

    if (!report.ok) {
      await emitAgentAlert(AGENT, "warning", "credit_reconciliation_issues", {
        usersScanned: report.usersScanned,
        usersWithIssues: report.usersWithIssues,
        totalCritical: report.totalCritical,
        totalWarning: report.totalWarning,
        duplicateIdempotencyKeys: report.duplicateIdempotencyKeys,
        topUsers: report.userReports.slice(0, 5),
      });

      await ProfitEvent.create({
        eventType: "credit_reconciliation_alert",
        severity: report.totalCritical > 0 ? "critical" : "warning",
        payload: {
          usersScanned: report.usersScanned,
          totalCritical: report.totalCritical,
          totalWarning: report.totalWarning,
          userReports: report.userReports.slice(0, 10),
        },
        timestamp: new Date(),
      }).catch((err) => {
        log("error", "profit_event_write_failed", { message: err?.message || String(err) });
      });
    }

    log("info", "credit_reconciliation_completed", {
      ok: report.ok,
      usersScanned: report.usersScanned,
      healthyUsers: report.healthyUsers,
      usersWithIssues: report.usersWithIssues,
      totalCritical: report.totalCritical,
      totalWarning: report.totalWarning,
    });

    return {
      ok: report.ok,
      usersScanned: report.usersScanned,
      healthyUsers: report.healthyUsers,
      usersWithIssues: report.usersWithIssues,
      totalCritical: report.totalCritical,
      totalWarning: report.totalWarning,
      duplicateIdempotencyKeys: report.duplicateIdempotencyKeys,
    };
  },
};
