/**
 * Read-only projected telecom credit balance (User.remainingCredits is cached;
 * this layer estimates pending interval debits from active calls + timelines).
 */

import mongoose from "mongoose";
import User from "../models/User.js";
import Call from "../models/Call.js";
import EconomicTimeline from "../models/EconomicTimeline.js";
import { CREDIT_RULES } from "../config/creditConfig.js";
import { maxCompletedBillableIntervalIndex } from "./economicSerializationService.js";

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
}

/**
 * @param {number} maxIdx
 * @param {Iterable<number>} billedIndexes
 * @returns {number[]}
 */
export function listPendingIntervalIndexes(maxIdx, billedIndexes) {
  const billed = new Set([...billedIndexes].map((n) => Math.floor(Number(n))));
  const pending = [];
  for (let i = 1; i <= maxIdx; i += 1) {
    if (!billed.has(i)) pending.push(i);
  }
  return pending;
}

/**
 * Pending interval debits for one active call (read-only).
 */
export function computePendingIntervalExposureForCall(callLean, timelineLean, nowMs = Date.now()) {
  const answeredAt = callLean.callAnsweredAt || callLean.callStartedAt;
  if (!answeredAt) {
    return { pendingIndexes: [], pendingCredits: 0, maxBillableIndex: 0 };
  }
  const elapsed = Math.max(
    0,
    Math.floor((nowMs - new Date(answeredAt).getTime()) / 1000)
  );
  const maxIdx = maxCompletedBillableIntervalIndex(elapsed, CREDIT_RULES.connectedIntervalSeconds);
  const billed = timelineLean?.billedIntervalIndexes || [];
  const legacy = Math.max(0, Math.floor(Number(callLean.durationCreditsCharged || 0)));
  const billedSet = new Set([...billed.map(Number)]);
  for (let j = 1; j <= legacy; j += 1) billedSet.add(j);
  const pendingIndexes = listPendingIntervalIndexes(maxIdx, billedSet);
  const pendingCredits = pendingIndexes.length * CREDIT_RULES.connectedIntervalCharge;
  return { pendingIndexes, pendingCredits, maxBillableIndex: maxIdx };
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 */
export async function computeProjectedUserBalance(userId) {
  const uid = toObjectId(userId);
  const calculatedAt = new Date();
  if (!uid) {
    return {
      cachedBalance: null,
      reservedCredits: null,
      activeCallProjectedConsumption: null,
      pendingEconomicExposure: null,
      projectedAvailableCredits: null,
      activeCalls: [],
      calculatedAt,
      error: "invalid_user_id",
    };
  }

  const user = await User.findById(uid)
    .select("remainingCredits reservedCredits")
    .lean();
  if (!user) {
    return {
      cachedBalance: null,
      reservedCredits: null,
      activeCallProjectedConsumption: null,
      pendingEconomicExposure: null,
      projectedAvailableCredits: null,
      activeCalls: [],
      calculatedAt,
      error: "user_not_found",
    };
  }

  const cachedBalance = Number(user.remainingCredits || 0);
  const reservedCredits = Number(user.reservedCredits || 0);

  const activeCalls = await Call.find({
    user: uid,
    direction: "outbound",
    status: { $in: ["answered", "in-progress"] },
  })
    .select(
      "_id status direction callAnsweredAt callStartedAt durationCreditsCharged attemptChargedAt creditReservationHeld updatedAt"
    )
    .lean();

  const callIds = activeCalls.map((c) => c._id);
  const timelines = callIds.length
    ? await EconomicTimeline.find({ callId: { $in: callIds } })
        .select("callId billedIntervalIndexes reservedCredits finalizedAt")
        .lean()
    : [];
  const tlByCall = new Map(timelines.map((t) => [String(t.callId), t]));

  let activeCallProjectedConsumption = 0;
  const perCall = [];

  for (const c of activeCalls) {
    const tl = tlByCall.get(String(c._id)) || null;
    const { pendingIndexes, pendingCredits, maxBillableIndex } = computePendingIntervalExposureForCall(
      c,
      tl,
      calculatedAt.getTime()
    );
    activeCallProjectedConsumption += pendingCredits;
    perCall.push({
      callId: String(c._id),
      status: c.status,
      maxBillableIndex,
      pendingIntervalIndexes: pendingIndexes,
      pendingIntervalCredits: pendingCredits,
      timelineFinalized: Boolean(tl?.finalizedAt),
    });
  }

  const pendingEconomicExposure = reservedCredits + activeCallProjectedConsumption;
  const projectedAvailableCredits = cachedBalance - reservedCredits - activeCallProjectedConsumption;

  return {
    cachedBalance,
    reservedCredits,
    activeCallProjectedConsumption,
    pendingEconomicExposure,
    projectedAvailableCredits,
    activeCalls: perCall,
    calculatedAt,
  };
}
