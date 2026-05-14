import mongoose from "mongoose";
import BillingEventJournal from "../../models/BillingEventJournal.js";
import ProfitEvent from "../../models/ProfitEvent.js";
import User from "../../models/User.js";
import { emitAgentAlert } from "../shared/agentAlerts.js";
import {
  rebuildUserBalanceFromJournal,
  rebuildBalanceFromCreditLedger,
  balancesRoughlyEqual,
} from "../../services/ledgerReconstructionService.js";

const AGENT = "billing-consistency-agent";
const DEFAULT_INTERVAL_MS = Number(process.env.AGENT_BILLING_CONSISTENCY_INTERVAL_MS || 12 * 60 * 1000);
const LEASE_MS = Number(process.env.AGENT_BILLING_CONSISTENCY_LEASE_MS || 11 * 60 * 1000);
const USER_BATCH = Math.min(250, Math.max(20, Number(process.env.AGENT_BILLING_CONSISTENCY_USER_BATCH || 120)));
const JOURNAL_LOOKBACK_MS = Number(process.env.AGENT_BILLING_CONSISTENCY_JOURNAL_LOOKBACK_MS || 14 * 24 * 60 * 60 * 1000);

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

export const billingConsistencyAgent = {
  name: AGENT,
  intervalMs: DEFAULT_INTERVAL_MS,
  leaseMs: LEASE_MS,

  async run({ log }) {
    const since = new Date(Date.now() - JOURNAL_LOOKBACK_MS);
    const distinctIds = await BillingEventJournal.distinct("userId", {
      timestamp: { $gte: since },
    });
    const userIds = distinctIds
      .map((id) => toObjectId(id))
      .filter(Boolean)
      .slice(0, USER_BATCH);

    let checked = 0;
    let mismatches = 0;

    for (const uid of userIds) {
      checked += 1;
      const [user, journalReplay, ledgerReplay] = await Promise.all([
        User.findById(uid).select("remainingCredits reservedCredits email").lean(),
        rebuildUserBalanceFromJournal(uid),
        rebuildBalanceFromCreditLedger(uid),
      ]);

      if (!user) continue;

      const uBal = Number(user.remainingCredits || 0);
      const uRes = Number(user.reservedCredits || 0);
      const jBal = journalReplay.balance;
      const jRes = journalReplay.reserved;
      const lBal = ledgerReplay.balance;

      const journalActive = (journalReplay.eventCount || 0) > 0;
      const hasLedger = (ledgerReplay.rowCount || 0) > 0;

      const mismatchLedgerUser = hasLedger && !balancesRoughlyEqual(lBal, uBal);
      const mismatchJournalUser =
        journalActive && (!balancesRoughlyEqual(jBal, uBal) || !balancesRoughlyEqual(jRes, uRes));
      const mismatchJournalLedger =
        journalActive && (!balancesRoughlyEqual(jBal, lBal) || !ledgerReplay.chainValid);

      if (mismatchLedgerUser || mismatchJournalUser || mismatchJournalLedger) {
        mismatches += 1;
        const payload = {
          userId: String(uid),
          userRemainingCredits: uBal,
          userReservedCredits: uRes,
          journalBalance: jBal,
          journalReserved: jRes,
          journalEventCount: journalReplay.eventCount,
          ledgerBalance: lBal,
          ledgerChainValid: ledgerReplay.chainValid,
          diff: {
            journalMinusUserBalance: jBal - uBal,
            journalMinusUserReserved: jRes - uRes,
            ledgerMinusUserBalance: lBal - uBal,
            journalMinusLedgerBalance: jBal - lBal,
          },
        };

        await emitAgentAlert(AGENT, "warning", "billing_inconsistency_detected", payload);
        log("warning", "billing_inconsistency_detected", { userId: String(uid) });

        await ProfitEvent.create({
          userId: uid,
          eventType: "billing_drift_detected",
          severity: "warning",
          payload,
          timestamp: new Date(),
        }).catch((err) => {
          log("error", "profit_event_write_failed", { message: err?.message || String(err) });
        });
      }
    }

    return { checked, mismatches, sampledUsers: userIds.length };
  },
};
