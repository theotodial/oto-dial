import "../loadEnv.js";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Call from "../src/models/Call.js";
import CreditLedger from "../src/models/CreditLedger.js";
import Subscription from "../src/models/Subscription.js";
import EconomicTimeline from "../src/models/EconomicTimeline.js";
import BillingEventJournal from "../src/models/BillingEventJournal.js";
import User from "../src/models/User.js";

function usage() {
  console.error(
    "Usage: node scripts/traceBillingForCall.mjs <callId|telnyxCallControlId|telnyxCallSessionId|--recent|--user <userId>>"
  );
}

function toObjectId(value) {
  if (!value) return null;
  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

function clean(doc) {
  if (!doc) return null;
  return JSON.parse(
    JSON.stringify(doc, (_key, value) => {
      if (value && typeof value === "object" && value._bsontype === "ObjectId") {
        return String(value);
      }
      return value;
    })
  );
}

async function resolveCall(token) {
  if (token === "--recent") {
    return Call.findOne({ direction: "outbound" }).sort({ createdAt: -1 }).lean();
  }

  const oid = toObjectId(token);
  const or = [
    ...(oid ? [{ _id: oid }] : []),
    { telnyxCallControlId: token },
    { telnyxCallSessionId: token },
    { telnyxLegControlIds: token },
    { webrtcParkPstnCallControlId: token },
  ];
  return Call.findOne({ $or: or }).sort({ createdAt: -1 }).lean();
}

async function listRecentCallsForUser(userId) {
  const uid = toObjectId(userId);
  if (!uid) return [];
  return Call.find({ user: uid, direction: "outbound" })
    .sort({ createdAt: -1, updatedAt: -1 })
    .limit(10)
    .select(
      "_id user direction source status phoneNumber fromNumber toNumber createdAt updatedAt callInitiatedAt callRingingAt callAnsweredAt callStartedAt callEndedAt durationSeconds billedSeconds totalCreditsCharged billingReason creditReservationHeld creditReservationReleasedAt billedCallEvents telnyxCallControlId telnyxCallSessionId telnyxLegControlIds lastEventSource lastEventType"
    )
    .lean();
}

async function main() {
  const token = process.argv[2];
  if (!token) {
    usage();
    process.exitCode = 1;
    return;
  }

  await connectDB();
  if (token === "--user") {
    const userId = process.argv[3];
    const calls = await listRecentCallsForUser(userId);
    console.log(JSON.stringify({ ok: true, userId, calls: clean(calls) }, null, 2));
    return;
  }

  const call = await resolveCall(token);
  if (!call?._id) {
    console.log(JSON.stringify({ ok: false, reason: "call_not_found", token }, null, 2));
    return;
  }

  const callId = call._id;
  const userId = call.user || null;
  const expectedEventKeys = ["routed", "ringing", "answered", "busy", "no_answer", "failed_after_routing"].map(
    (eventName) => `call:${String(callId)}:event:${eventName}`
  );
  const expectedKeys = [
    `reserve:call:${String(callId)}:min-reserve`,
    `release:call:${String(callId)}:min-reserve`,
    `call:${String(callId)}:attempt`,
    ...expectedEventKeys,
  ];

  const [
    ledgerRows,
    timeline,
    journalRows,
    subscription,
    user,
    idempotencyRows,
  ] = await Promise.all([
    CreditLedger.find({ callId }).sort({ createdAt: 1 }).lean(),
    EconomicTimeline.findOne({ callId }).lean(),
    BillingEventJournal.find({
      $or: [{ entityId: callId }, { correlationId: callId }, { eventId: { $in: expectedKeys } }],
    })
      .sort({ timestamp: 1 })
      .lean(),
    userId
      ? Subscription.findOne({ userId }).sort({ createdAt: -1 }).select(
          "_id userId status remainingCredits telecomCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased updatedAt createdAt"
        ).lean()
      : null,
    userId
      ? User.findById(userId).select(
          "_id remainingCredits reservedCredits totalCreditsUsed lifetimeCreditsPurchased updatedAt createdAt"
        ).lean()
      : null,
    CreditLedger.find({ idempotencyKey: { $in: expectedKeys } })
      .select("_id callId user amount type balanceBefore balanceAfter idempotencyKey createdAt metadata")
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const ledgerDebitTotal = ledgerRows.reduce((sum, row) => {
    const amount = Number(row.amount || 0);
    return sum + (amount < 0 ? Math.abs(amount) : 0);
  }, 0);

  const result = {
    ok: true,
    token,
    resolvedCallId: String(callId),
    call: clean(call),
    expectedIdempotencyKeys: expectedKeys,
    creditLedger: clean(ledgerRows),
    creditLedgerDebitTotal: ledgerDebitTotal,
    economicTimeline: clean(timeline),
    billingEventJournal: clean(journalRows),
    idempotencyRows: clean(idempotencyRows),
    subscription: clean(subscription),
    userCache: clean(user),
    reconciliation: {
      callTotalCreditsCharged: Number(call.totalCreditsCharged || 0),
      callBillingReason: call.billingReason || null,
      ledgerDebitTotal,
      subscriptionRemainingCredits: subscription?.remainingCredits ?? null,
      subscriptionReservedCredits: subscription?.reservedCredits ?? null,
      userRemainingCredits: user?.remainingCredits ?? null,
      userReservedCredits: user?.reservedCredits ?? null,
      timelineState: timeline?.timelineState || null,
      timelineConsumedCredits: timeline?.consumedCredits ?? null,
      timelineReservedCredits: timeline?.reservedCredits ?? null,
      timelineFinalizedAt: timeline?.finalizedAt || null,
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error("[traceBillingForCall] failed", err?.stack || err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
