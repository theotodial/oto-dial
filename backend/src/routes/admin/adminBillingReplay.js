import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import BillingEventJournal from "../../models/BillingEventJournal.js";
import User from "../../models/User.js";
import {
  rebuildUserBalanceFromJournal,
  rebuildBalanceFromCreditLedger,
  balancesRoughlyEqual,
} from "../../services/ledgerReconstructionService.js";

const router = express.Router();

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

/**
 * GET /api/admin/analytics/billing/replay/:userId
 * Read-only billing reconstruction for debugging drift.
 */
router.get("/replay/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) {
      return res.status(400).json({ success: false, error: "invalid_user_id" });
    }

    const [user, journalReplay, ledgerReplay, lastEvents] = await Promise.all([
      User.findById(uid).select("remainingCredits reservedCredits email").lean(),
      rebuildUserBalanceFromJournal(uid),
      rebuildBalanceFromCreditLedger(uid),
      BillingEventJournal.find({ userId: uid })
        .sort({ timestamp: -1, eventId: -1 })
        .limit(100)
        .lean(),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, error: "user_not_found" });
    }

    const uBal = Number(user.remainingCredits || 0);
    const uRes = Number(user.reservedCredits || 0);
    const jBal = journalReplay.balance;
    const jRes = journalReplay.reserved;
    const lBal = ledgerReplay.balance;

    const journalActive = (journalReplay.eventCount || 0) > 0;
    const hasLedger = (ledgerReplay.rowCount || 0) > 0;
    const mismatch = {
      journalVsUserBalance: journalActive && !balancesRoughlyEqual(jBal, uBal),
      journalVsUserReserved: journalActive && !balancesRoughlyEqual(jRes, uRes),
      ledgerVsUserBalance: hasLedger && !balancesRoughlyEqual(lBal, uBal),
      journalVsLedgerBalance: journalActive && !balancesRoughlyEqual(jBal, lBal),
      ledgerChainBroken: hasLedger && ledgerReplay.chainValid === false,
    };

    const hasMismatch = Object.values(mismatch).some(Boolean);

    res.json({
      success: true,
      userId: String(uid),
      journalReplay: {
        balance: jBal,
        reserved: jRes,
        totalConsumed: journalReplay.totalConsumed,
        eventCount: journalReplay.eventCount,
      },
      ledgerReplay: {
        balance: lBal,
        rowCount: ledgerReplay.rowCount,
        chainValid: ledgerReplay.chainValid,
        reservedHint: ledgerReplay.reservedHint,
      },
      user: {
        remainingCredits: uBal,
        reservedCredits: uRes,
        email: user.email || null,
      },
      mismatch,
      mismatchDiff: hasMismatch
        ? {
            journalMinusUserBalance: jBal - uBal,
            journalMinusUserReserved: jRes - uRes,
            ledgerMinusUserBalance: lBal - uBal,
            journalMinusLedgerBalance: jBal - lBal,
          }
        : null,
      lastEvents,
    });
  } catch (err) {
    console.error("[adminBillingReplay]", err);
    res.status(500).json({ success: false, error: err.message || "replay_failed" });
  }
});

export default router;
