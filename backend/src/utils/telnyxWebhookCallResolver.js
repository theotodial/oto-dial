import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";
import { normalizeCallPartyNumber } from "./callLifecycle.js";

const PENDING_OUTBOUND_MS = 15 * 60 * 1000;

/**
 * Resolve DB Call for a Telnyx webhook.
 * Priority: telnyxCallSessionId → telnyxCallControlId → telnyxLegControlIds → user+number fallback.
 */
export async function findCallForTelnyxEvent({ callControlId, callPayload = {} }) {
  const sessionId = callPayload.call_session_id;
  const or = [];
  if (sessionId) {
    or.push({ telnyxCallSessionId: sessionId });
  }
  if (callControlId) {
    or.push({ telnyxCallControlId: callControlId });
    or.push({ telnyxLegControlIds: callControlId });
    or.push({ webrtcParkPstnCallControlId: callControlId });
  }

  let doc = or.length ? await Call.findOne({ $or: or }) : null;
  if (doc) return doc;

  const dir = callPayload.direction;
  const isIncoming = dir === "incoming" || dir === "inbound";
  const toRaw = callPayload.to;
  const fromRaw = callPayload.from;
  if (isIncoming || !toRaw || !fromRaw) return null;

  const toNorm = normalizeCallPartyNumber(toRaw);
  const fromNorm = normalizeCallPartyNumber(fromRaw);
  const since = new Date(Date.now() - PENDING_OUTBOUND_MS);

  const fromCandidates = [fromNorm, fromRaw].filter(Boolean);
  const owner = await PhoneNumber.findOne({
    ...(fromCandidates.length
      ? { phoneNumber: { $in: fromCandidates } }
      : { phoneNumber: fromRaw }),
    status: "active",
  }).lean();

  if (!owner?.userId) return null;

  return Call.findOne({
    user: owner.userId,
    direction: "outbound",
    status: {
      $in: [
        "queued",
        "initiated",
        "dialing",
        "ringing",
        "in-progress",
        "answered",
      ],
    },
    updatedAt: { $gte: since },
    $or: [
      { toNumber: toNorm },
      { phoneNumber: toNorm },
      { toNumber: toRaw },
      { phoneNumber: toRaw },
    ],
  }).sort({ createdAt: -1 });
}

/**
 * Merge Telnyx identifiers: always set session id when present; add leg control ids;
 * never replace an existing primary telnyxCallControlId.
 */
export async function mergeTelnyxCallIdentifiers(call, { callControlId, callSessionId }) {
  if (!call?._id) return;

  const set = {};
  if (callSessionId) {
    set.telnyxCallSessionId = callSessionId;
  }

  const ops = {};
  if (Object.keys(set).length) ops.$set = set;

  if (callControlId) {
    ops.$addToSet = { telnyxLegControlIds: callControlId };
    if (!call.telnyxCallControlId) {
      if (!ops.$set) ops.$set = {};
      ops.$set.telnyxCallControlId = callControlId;
    }
  }

  if (!ops.$set && !ops.$addToSet) return;

  await Call.updateOne({ _id: call._id }, ops);

  if (ops.$set) Object.assign(call, ops.$set);
  if (callControlId) {
    if (!Array.isArray(call.telnyxLegControlIds)) call.telnyxLegControlIds = [];
    if (!call.telnyxLegControlIds.includes(callControlId)) {
      call.telnyxLegControlIds.push(callControlId);
    }
    if (!call.telnyxCallControlId) call.telnyxCallControlId = callControlId;
  }
}
