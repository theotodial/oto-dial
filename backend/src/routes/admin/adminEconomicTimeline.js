import express from "express";
import mongoose from "mongoose";
import requireAdmin from "../../middleware/requireAdmin.js";
import EconomicTimeline from "../../models/EconomicTimeline.js";
import CreditLedger from "../../models/CreditLedger.js";
import BillingEventJournal from "../../models/BillingEventJournal.js";
import { recomputeTimelineHashFromLean } from "../../services/economicSerializationService.js";

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
 * GET /api/admin/analytics/economic-timeline/:callId
 */
router.get("/economic-timeline/:callId", requireAdmin, async (req, res) => {
  try {
    const cid = toObjectId(req.params.callId);
    if (!cid) {
      return res.status(400).json({ success: false, error: "invalid_call_id" });
    }

    const [timeline, ledgerRows, journalRows] = await Promise.all([
      EconomicTimeline.findOne({ callId: cid }).lean(),
      CreditLedger.find({ callId: cid }).sort({ createdAt: 1, _id: 1 }).lean(),
      BillingEventJournal.find({ correlationId: cid }).sort({ timestamp: 1, eventId: 1 }).lean(),
    ]);

    const recomputed = timeline ? recomputeTimelineHashFromLean(timeline) : null;
    const hashStatus = timeline
      ? {
          stored: timeline.consistencyHash,
          recomputed,
          match: Boolean(timeline.consistencyHash && recomputed === timeline.consistencyHash),
        }
      : { stored: null, recomputed: null, match: null };

    res.json({
      success: true,
      callId: String(cid),
      timeline,
      billedIntervalIndexes: timeline?.billedIntervalIndexes || [],
      reservationLifecycle: {
        reservedCredits: timeline?.reservedCredits ?? null,
        settledCredits: timeline?.settledCredits ?? null,
        releasedCredits: timeline?.releasedCredits ?? null,
        consumedCredits: timeline?.consumedCredits ?? null,
      },
      hashStatus,
      ledgerRows,
      journalRows,
    });
  } catch (err) {
    console.error("[adminEconomicTimeline]", err);
    res.status(500).json({ success: false, error: err.message || "forensics_failed" });
  }
});

export default router;
