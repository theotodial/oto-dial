/**
 * Hot-user load profiling (read-heavy + soft signals). Does not replace profit guardrails.
 */

import mongoose from "mongoose";
import Call from "../models/Call.js";

const userSignal = new Map();

/** @type {Map<string, { at: string; kind: string }[]>} */
const throttleHistory = new Map();
const THROTTLE_HISTORY_CAP = 40;

export function recordUserThrottleEvent(userId, kind) {
  if (!userId || !kind) return;
  const k = String(userId);
  const arr = throttleHistory.get(k) || [];
  arr.push({ at: new Date().toISOString(), kind: String(kind) });
  while (arr.length > THROTTLE_HISTORY_CAP) arr.shift();
  throttleHistory.set(k, arr);
}

export function getUserThrottleHistory(userId, limit = 20) {
  if (!userId) return [];
  const k = String(userId);
  const arr = throttleHistory.get(k) || [];
  return arr.slice(-Math.max(1, Number(limit) || 20));
}

export function recordUserTelecomSignal(userId, patch = {}) {
  if (!userId) return;
  const k = String(userId);
  const prev = userSignal.get(k) || { webhookHits: 0, duplicates: 0, emits: 0, at: Date.now() };
  userSignal.set(k, {
    webhookHits: prev.webhookHits + (patch.webhookHits || 0),
    duplicates: prev.duplicates + (patch.duplicates || 0),
    emits: prev.emits + (patch.emits || 0),
    at: Date.now(),
  });
}

function decayUserSignals() {
  const now = Date.now();
  for (const [k, v] of userSignal) {
    if (now - v.at > 120_000) userSignal.delete(k);
  }
}

export function getHotUserIds(limit = 12) {
  decayUserSignals();
  return [...userSignal.entries()]
    .map(([userId, v]) => ({
      userId,
      score: v.webhookHits + v.duplicates * 2 + v.emits * 0.5,
      ...v,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 */
export async function computeUserLoadProfile(userId) {
  const uid = toObjectId(userId);
  if (!uid) return { ok: false, error: "invalid_user_id" };
  const since = new Date(Date.now() - 3600000);
  const activeStatuses = ["queued", "initiated", "dialing", "ringing", "answered", "in-progress"];
  const [outboundHour, activeConcurrent, rejectedHour, failedHour] = await Promise.all([
    Call.countDocuments({ user: uid, direction: "outbound", createdAt: { $gte: since } }),
    Call.countDocuments({ user: uid, status: { $in: activeStatuses } }),
    Call.countDocuments({
      user: uid,
      direction: "outbound",
      status: { $in: ["rejected"] },
      updatedAt: { $gte: since },
    }),
    Call.countDocuments({
      user: uid,
      direction: "outbound",
      status: { $in: ["failed"] },
      updatedAt: { $gte: since },
    }),
  ]);

  const sig = userSignal.get(String(uid)) || { webhookHits: 0, duplicates: 0, emits: 0 };
  const churn = rejectedHour + failedHour;
  const hotSignals = [];
  if (outboundHour > 40) hotSignals.push("high_outbound_attempt_rate");
  if (activeConcurrent > 2) hotSignals.push("high_concurrent_calls");
  if (churn > 25) hotSignals.push("high_rejected_or_failed_churn");
  if (sig.duplicates > 30) hotSignals.push("high_duplicate_webhook_ratio");

  const { getPressureSnapshot } = await import("./telecomBackpressureService.js");
  const pressure = getPressureSnapshot();
  const { getWebhookBurstStats } = await import("./webhookBurstProtectionService.js");
  const bursts = getWebhookBurstStats();
  const userKey = `u:${String(uid)}`;
  const burstSlice = bursts.topKeys.filter((x) => x.key === userKey);
  const softThrottleBroadcasts =
    hotSignals.length > 0 && ["elevated", "high", "critical"].includes(pressure.pressureLevel);
  const softOutboundCooldownSuggested = outboundHour > 60 && churn > 15;

  return {
    ok: true,
    userId: String(uid),
    outboundAttemptsLastHour: outboundHour,
    activeConcurrent,
    rejectedLastHour: rejectedHour,
    failedLastHour: failedHour,
    inMemorySignals: sig,
    hotSignals,
    softThrottleBroadcasts,
    softOutboundCooldownSuggested,
    pressureLevel: pressure.pressureLevel,
    throttleHistory: getUserThrottleHistory(uid),
    burstSlice,
  };
}
