import User from "../../models/User.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import CreditLedger from "../../models/CreditLedger.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";

const AGENT = "ledger-consistency-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_LEDGER_CONSISTENCY_INTERVAL_MS || 12 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_LEDGER_CONSISTENCY_LEASE_MS || 11 * 60 * 1000);

function hoursAgo(h) {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

export const ledgerConsistencyAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const since = hoursAgo(48);
    const issues = [];

    const negativeUsers = await User.find({ remainingCredits: { $lt: 0 } })
      .select("_id email remainingCredits reservedCredits")
      .limit(40)
      .lean();
    if (negativeUsers.length) {
      issues.push({ kind: "negative_balance", count: negativeUsers.length, sample: negativeUsers.slice(0, 5) });
      await emitAgentAlert(AGENT, "warning", "ledger_inconsistency_detected", {
        kind: "negative_balance",
        count: negativeUsers.length,
        userIds: negativeUsers.map((u) => String(u._id)),
      });
    }

    const dupKeys = await CreditLedger.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: "$idempotencyKey", c: { $sum: 1 } } },
      { $match: { c: { $gt: 1 } } },
      { $limit: 30 },
    ]);
    if (dupKeys.length) {
      issues.push({ kind: "duplicate_idempotency_keys", count: dupKeys.length, sample: dupKeys });
      await emitAgentAlert(AGENT, "error", "ledger_inconsistency_detected", {
        kind: "duplicate_idempotency_keys",
        keys: dupKeys.map((d) => d._id),
      });
    }

    const orphanCharges = await CreditLedger.find({
      type: { $in: ["connected_duration_charge", "outbound_attempt_charge"] },
      $or: [{ callId: null }, { callId: { $exists: false } }],
      createdAt: { $gte: since },
    })
      .select("_id idempotencyKey type createdAt")
      .limit(40)
      .lean();
    if (orphanCharges.length) {
      issues.push({ kind: "orphan_ledger_no_call", count: orphanCharges.length });
      await emitAgentAlert(AGENT, "warning", "billing_anomaly_detected", {
        kind: "orphan_ledger_no_call",
        count: orphanCharges.length,
      });
    }

    const hangingReservations = await Call.find({
      direction: "outbound",
      status: { $in: ["completed", "failed", "rejected", "canceled", "busy", "no-answer"] },
      creditReservationHeld: { $gt: 0 },
      creditReservationReleasedAt: null,
      updatedAt: { $gte: since },
    })
      .select("_id user status creditReservationHeld")
      .limit(40)
      .lean();
    if (hangingReservations.length) {
      issues.push({ kind: "reservation_not_released", count: hangingReservations.length });
      await emitAgentAlert(AGENT, "warning", "billing_anomaly_detected", {
        kind: "reservation_not_released",
        callIds: hangingReservations.map((c) => String(c._id)),
      });
    }

    const recentOutboundSms = await SMS.find({
      direction: "outbound",
      "smsCostInfo.costDeducted": { $gt: 0 },
      createdAt: { $gte: since },
    })
      .select("_id user")
      .sort({ createdAt: -1 })
      .limit(80)
      .lean();

    let smsMissingLedger = 0;
    const smsSample = [];
    for (const row of recentOutboundSms) {
      const hasLedger = await CreditLedger.exists({
        type: "sms_charge",
        smsId: row._id,
      });
      if (!hasLedger) {
        smsMissingLedger += 1;
        if (smsSample.length < 10) smsSample.push(String(row._id));
      }
    }
    if (smsMissingLedger) {
      issues.push({ kind: "sms_cost_without_ledger", count: smsMissingLedger, sampleIds: smsSample });
      await emitAgentAlert(AGENT, "warning", "ledger_inconsistency_detected", {
        kind: "sms_cost_without_ledger",
        count: smsMissingLedger,
        sampleIds: smsSample,
      });
    }

    const activeCalls = await Call.find({
      direction: "outbound",
      status: { $in: ["answered", "in-progress"] },
      callAnsweredAt: { $ne: null },
      createdAt: { $gte: since },
    })
      .select("_id user durationCreditsCharged callAnsweredAt")
      .limit(120)
      .lean();

    let missingIntervalHints = 0;
    for (const c of activeCalls) {
      const answered = c.callAnsweredAt ? new Date(c.callAnsweredAt).getTime() : 0;
      const elapsed = Math.max(0, Math.floor((Date.now() - answered) / 1000));
      const expectedIntervals = Math.ceil(elapsed / 6) || 0;
      const charged = Number(c.durationCreditsCharged || 0);
      if (expectedIntervals > charged + 2) {
        missingIntervalHints += 1;
      }
    }
    if (missingIntervalHints > 5) {
      issues.push({ kind: "possible_missing_interval_billing", count: missingIntervalHints });
      await emitAgentAlert(AGENT, "info", "billing_anomaly_detected", {
        kind: "possible_missing_interval_billing",
        activeCallsSampled: activeCalls.length,
        flagged: missingIntervalHints,
      });
    }

    log("info", "ledger_consistency_cycle_completed", {
      issueKinds: issues.map((i) => i.kind),
      scannedSince: since.toISOString(),
    });

    return {
      issuesFound: issues.length,
      negativeBalanceUsers: negativeUsers.length,
      duplicateKeyGroups: dupKeys.length,
      orphanLedgerRows: orphanCharges.length,
      hangingReservations: hangingReservations.length,
      smsMissingLedger,
      missingIntervalHints,
    };
  },
};
