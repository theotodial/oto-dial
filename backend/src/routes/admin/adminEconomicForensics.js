import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import EconomicTimeline from "../../models/EconomicTimeline.js";
import CreditLedger from "../../models/CreditLedger.js";
import BillingEventJournal from "../../models/BillingEventJournal.js";
import ProfitEvent from "../../models/ProfitEvent.js";
import { computeProjectedUserBalance } from "../../services/projectedBalanceService.js";
import { reconcileUserReservations } from "../../services/reservationReconciliationService.js";
import {
  rebuildUserBalanceFromJournal,
  rebuildBalanceFromCreditLedger,
} from "../../services/ledgerReconstructionService.js";
import { recoverActiveCallEconomics } from "../../services/economicRecoveryService.js";
import { billConnectedDurationIntervalsSerialized } from "../../services/economicSerializationService.js";
import { emitAdminSocketEvent } from "../../services/adminLiveEventsService.js";
import { broadcastAuthoritativeCallState } from "../../services/socketConsistencyService.js";

const router = express.Router();

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) {
    return new mongoose.Types.ObjectId(String(id));
  }
  return null;
}

function forensicsAudit(action, details = {}) {
  const row = { action, ...details, t: new Date().toISOString() };
  console.log("[ADMIN ECONOMIC FORENSICS]", row);
  emitAdminSocketEvent("admin:economic_forensics", row);
}

async function stuckCallsForUser(userId) {
  const uid = toObjectId(userId);
  if (!uid) return [];
  return Call.find({
    user: uid,
    $or: [
      {
        direction: "outbound",
        status: { $in: ["answered", "in-progress"] },
        creditReservationHeld: { $gt: 0 },
      },
      {
        direction: "outbound",
        status: { $in: ["completed", "failed", "rejected", "canceled", "busy", "no-answer"] },
        creditReservationHeld: { $gt: 0 },
        creditReservationReleasedAt: null,
      },
    ],
  })
    .select("_id status direction creditReservationHeld creditReservationReleasedAt updatedAt")
    .limit(40)
    .lean();
}

/**
 * GET /api/admin/analytics/economic-forensics/user/:userId
 */
router.get("/user/:userId", requireAdmin, async (req, res) => {
  try {
    const uid = toObjectId(req.params.userId);
    if (!uid) return res.status(400).json({ success: false, error: "invalid_user_id" });

    const [
      projected,
      journalReplay,
      ledgerReplay,
      reservation,
      timelines,
      recentLedger,
      recentJournal,
      profitRows,
    ] = await Promise.all([
      computeProjectedUserBalance(uid),
      rebuildUserBalanceFromJournal(uid),
      rebuildBalanceFromCreditLedger(uid),
      reconcileUserReservations(uid),
      EconomicTimeline.find({ user: uid }).sort({ lastEconomicEventAt: -1 }).limit(50).lean(),
      CreditLedger.find({ user: uid }).sort({ createdAt: -1 }).limit(80).lean(),
      BillingEventJournal.find({ userId: uid }).sort({ timestamp: -1 }).limit(80).lean(),
      ProfitEvent.find({
        userId: uid,
        eventType: {
          $in: [
            "billing_stuck_detected",
            "billing_recovery_attempted",
            "orphan_reservation_detected",
            "economic_forensics_admin_recovery",
            "billing_drift_detected",
            "billing_timeline_corruption",
          ],
        },
      })
        .sort({ timestamp: -1 })
        .limit(40)
        .lean(),
    ]);

    const activeCalls = await Call.find({
      user: uid,
      direction: "outbound",
      status: { $in: ["answered", "in-progress", "ringing", "initiated", "dialing", "queued"] },
    })
      .select("_id status updatedAt callAnsweredAt durationCreditsCharged creditReservationHeld")
      .limit(30)
      .lean();

    const driftAnalysis = {
      journalVsCached:
        journalReplay.ok && journalReplay.eventCount > 0
          ? Number(journalReplay.balance) - Number(projected.cachedBalance ?? 0)
          : null,
      ledgerVsCached:
        ledgerReplay.ok && ledgerReplay.rowCount > 0
          ? Number(ledgerReplay.balance) - Number(projected.cachedBalance ?? 0)
          : null,
      reservationDrift: reservation.drift,
      reservationHealthy: reservation.healthy,
    };

    const stuck = await stuckCallsForUser(uid);

    res.json({
      success: true,
      userId: String(uid),
      projectedBalance: projected,
      ledgerReplay,
      journalReplay,
      reservationReconciliation: reservation,
      timelineExposure: timelines.map((t) => ({
        callId: String(t.callId),
        reservedCredits: t.reservedCredits,
        consumedCredits: t.consumedCredits,
        settledCredits: t.settledCredits,
        releasedCredits: t.releasedCredits,
        state: t.timelineState,
        billedIntervalIndexes: t.billedIntervalIndexes || [],
        finalizedAt: t.finalizedAt,
      })),
      activeCalls,
      driftAnalysis,
      stuckCalls: stuck,
      recentLedger,
      recentJournal,
      recentProfitEvents: profitRows,
    });
  } catch (err) {
    console.error("[adminEconomicForensics] user", err);
    res.status(500).json({ success: false, error: err.message || "forensics_failed" });
  }
});

/**
 * GET /api/admin/analytics/economic-forensics/call/:callId
 */
router.get("/call/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) return res.status(400).json({ success: false, error: "invalid_call_id" });

    const [call, timeline, ledgerRows, journalRows] = await Promise.all([
      Call.findById(cid).lean(),
      EconomicTimeline.findOne({ callId: cid }).lean(),
      CreditLedger.find({ callId: cid }).sort({ createdAt: 1 }).lean(),
      BillingEventJournal.find({ correlationId: cid }).sort({ timestamp: 1 }).lean(),
    ]);

    if (!call) return res.status(404).json({ success: false, error: "call_not_found" });

    const projected = call.user ? await computeProjectedUserBalance(call.user) : null;

    res.json({
      success: true,
      callId: String(cid),
      call,
      timeline,
      ledgerRows,
      journalRows,
      userProjectedSnapshot: projected,
    });
  } catch (err) {
    console.error("[adminEconomicForensics] call", err);
    res.status(500).json({ success: false, error: err.message || "forensics_failed" });
  }
});

/**
 * POST /api/admin/analytics/economic-forensics/recover-call/:callId
 * body: { action: "interval_reconcile" | "active_recovery" }
 */
router.post("/recover-call/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) return res.status(400).json({ success: false, error: "invalid_call_id" });

    const action = String(req.body?.action || "interval_reconcile").trim();
    if (!["interval_reconcile", "active_recovery"].includes(action)) {
      return res.status(400).json({ success: false, error: "invalid_action" });
    }

    const call = await Call.findById(cid).lean();
    if (!call) return res.status(404).json({ success: false, error: "call_not_found" });

    let result = null;
    if (action === "interval_reconcile") {
      result = await billConnectedDurationIntervalsSerialized(call);
    } else {
      result = await recoverActiveCallEconomics({ mode: "single", callId: cid });
    }

    const adminId = req.user?._id || req.userId;
    const payload = {
      callId: String(cid),
      action,
      adminUserId: String(adminId),
      result,
    };

    forensicsAudit("recover_call", payload);

    await ProfitEvent.create({
      userId: call.user || null,
      eventType: "economic_forensics_admin_recovery",
      severity: "info",
      payload,
      timestamp: new Date(),
    }).catch(() => {});

    void broadcastAuthoritativeCallState({
      callId: cid,
      userId: call.user,
      source: "admin_economic_forensics",
      eventType: action,
    }).catch(() => {});

    res.json({ success: true, action, result });
  } catch (err) {
    console.error("[adminEconomicForensics] recover", err);
    res.status(500).json({ success: false, error: err.message || "recover_failed" });
  }
});

export default router;
