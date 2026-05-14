/**
 * Flags stale / wedged active calls for reconciliation without forcing terminal transitions.
 */

import mongoose from "mongoose";
import Call from "../models/Call.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import { recoverActiveCallEconomics } from "./economicRecoveryService.js";
import { computeCanonicalCallSnapshot } from "./callConvergenceService.js";
import { broadcastAuthoritativeCallState } from "./socketConsistencyService.js";

const STALE_MS = Number(process.env.STALE_ACTIVE_CALL_MS || 45 * 60 * 1000);

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

/**
 * @returns {Promise<{ candidates: object[], reviewed: number }>}
 */
export async function findStaleActiveCallCandidates(limit = 40) {
  const cutoff = new Date(Date.now() - STALE_MS);
  const active = await Call.find({
    direction: "outbound",
    status: { $in: ["answered", "in-progress", "ringing", "dialing"] },
    updatedAt: { $lte: cutoff },
  })
    .select("_id user status updatedAt telnyxCallControlId callAnsweredAt durationCreditsCharged")
    .limit(Math.min(200, Math.max(5, limit)))
    .lean();

  const candidates = [];
  for (const c of active) {
    const tl = await EconomicTimeline.findOne({ callId: c._id }).select("finalizedAt lastEconomicEventAt").lean();
    const staleTimeline =
      tl &&
      !tl.finalizedAt &&
      tl.lastEconomicEventAt &&
      new Date(tl.lastEconomicEventAt).getTime() < cutoff.getTime();
    const noBillingProgress =
      Number(c.durationCreditsCharged || 0) === 0 &&
      c.callAnsweredAt &&
      Date.now() - new Date(c.callAnsweredAt).getTime() > STALE_MS;
    if (staleTimeline || noBillingProgress) {
      candidates.push({
        callId: String(c._id),
        userId: c.user ? String(c.user) : null,
        status: c.status,
        reasons: [
          staleTimeline ? "stale_timeline_activity" : null,
          noBillingProgress ? "no_billing_progress" : null,
        ].filter(Boolean),
      });
    }
  }
  return { candidates, reviewed: active.length };
}

/**
 * Safe review: economic recovery sweep + convergence broadcast (no forced hangup).
 */
export async function reviewStaleActiveCall(callId) {
  const cid = toObjectId(callId);
  if (!cid) return { ok: false, code: "invalid_id" };
  const r = await recoverActiveCallEconomics({ mode: "single", callId: String(cid) });
  const snap = await computeCanonicalCallSnapshot(cid);
  const call = await Call.findById(cid).select("user").lean();
  if (call?.user) {
    await broadcastAuthoritativeCallState({
      callId: cid,
      userId: call.user,
      source: "stale_active_call_recovery",
    }).catch(() => {});
  }
  return { ok: true, recovery: r, snapshotOk: snap.ok };
}
