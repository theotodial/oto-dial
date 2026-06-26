import express from "express";
import mongoose from "mongoose";
import axios from "axios";
import Call from "../../models/Call.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import { loadUserSubscription } from "../../services/subscriptionService.js";
import { recordCallCost } from "../../services/telnyxCostCalculator.js";
import {
  emitAdminCallDebugEvent,
  emitAdminLiveCall,
} from "../../services/adminLiveEventsService.js";
import { normalizeCallPartyNumber } from "../../utils/callLifecycle.js";
import {
  findCallForTelnyxEvent,
  mergeTelnyxCallIdentifiers,
} from "../../utils/telnyxWebhookCallResolver.js";
import {
  CALL_STATES,
  isTerminalStatus,
  mapHangupToTerminalStatus,
  normalizeCallStatus,
} from "../../utils/callStateMachine.js";
import {
  bridgeParkedWebRtcToPstn,
  dialPstnForParkedWebRtcLeg,
  isParkOutboundEnabled,
  isWebhookParkedOutboundInitiated,
  parseOtdFromTelnyxClientState,
} from "../../services/telnyxParkedOutboundService.js";
import { normalizeThreadPhone } from "../../utils/smsThreadKey.js";
import {
  claimWebhookEvent,
  extractWebhookEnvelope,
} from "../../agents/shared/webhookIdempotency.js";
import { applyCallTransition } from "../../services/callTransitionService.js";
import { telecomStructuredLog } from "../../utils/telecomStructuredLog.js";
import { resolveInboundOwner } from "../../utils/inboundOwnership.js";
import {
  billConnectedDurationIntervals,
  chargeProviderAcceptedAttempt,
  chargeCallLifecycleEvent,
  releaseUnusedCallReservation,
} from "../../services/callCreditBillingService.js";
import { isRatingV1Enabled, CALL_BILLING_EVENT } from "../../services/telecomRatingEngine.js";
import { finalizeTelecomCallAccounting } from "../../services/telecomCallAccountingService.js";
import { recordTelecomEventSequence } from "../../services/telecomSequenceService.js";
import { persistWebhookLatencySample } from "../../services/webhookLatencyService.js";
import { recordWebhookReceived, bumpRedisWebhookClusterCounter } from "../../services/telecomBackpressureService.js";
import {
  recordWebhookBurstSample,
  shouldSuppressNonCriticalWebhookWork,
} from "../../services/webhookBurstProtectionService.js";

const router = express.Router();

const HANDLED_EVENTS = new Set([
  "call.initiated",
  "call.ringing",
  "call.progress",
  "call.answered",
  "call.bridged",
  "call.hangup",
  "call.machine.detection.ended",
  "call.playback.ended",
]);

const TELNYX_VOICE_API = "https://api.telnyx.com/v2";

function trackVoiceWebhookUserSignals(call, callControlId, callSessionId) {
  if (!call?.user) return;
  recordUserTelecomSignal(call.user, { webhookHits: 1 });
  recordWebhookBurstSample({
    provider: "telnyx:voice",
    userId: String(call.user),
    callKey: callControlId || callSessionId || "_",
    duplicate: false,
  });
}

async function speakSafetyMessage(callControlId, message) {
  if (!callControlId || !message) return;
  await axios.post(
    `${TELNYX_VOICE_API}/calls/${encodeURIComponent(callControlId)}/actions/speak`,
    {
      payload: message,
      voice: "female",
      language: "en-US",
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
}

function isInboundInitiatedPayload(payload = {}) {
  const declaredDirection = payload?.direction;
  if (typeof declaredDirection === "string" && declaredDirection.trim() !== "") {
    return declaredDirection.trim().toLowerCase() === "inbound";
  }
  return payload?.to !== payload?.from;
}

async function handleInboundCall(payload = {}, { telnyxEventId = null } = {}) {
  const callControlId = payload?.call_control_id;
  const from = normalizeCallPartyNumber(payload?.from);
  const to = normalizeCallPartyNumber(payload?.to);

  console.log("🚨 INBOUND CALL", {
    from: payload?.from ?? null,
    to: payload?.to ?? null,
    direction: payload?.direction ?? null,
    call_control_id: callControlId ?? null,
  });

  if (!callControlId) {
    console.error("❌ Missing call_control_id for inbound call");
    return;
  }

  // SECURITY-CRITICAL: strict, no-fallback ownership resolution. Any ambiguity
  // (zero or multiple owners) MUST short-circuit BEFORE the call row is bound.
  const ownership = await resolveInboundOwner({
    rawCalledNumber: payload?.to ?? to ?? null,
    callControlId,
    telnyxEventId,
  });
  const ownedNumber = ownership.ok ? ownership.ownedNumber : null;
  const resolvedUserId = ownership.ok ? ownership.resolvedUserId : null;

  telecomStructuredLog("[INBOUND ROUTING]", {
    sourcePath: "telnyxVoice.js:handleInboundCall",
    eventType: "inbound_ownership_resolution",
    callControlId,
    callSessionId: payload?.call_session_id || null,
    telnyxEventId,
    rawCalled: payload?.to ?? null,
    canonicalCalled: ownership.canonical ?? null,
    rawCaller: payload?.from ?? null,
    matchedOwnerUserId: resolvedUserId,
    ownedNumberId: ownedNumber?._id ? String(ownedNumber._id) : null,
    matchCount: ownership.matchCount ?? 0,
    accepted: ownership.ok === true,
    rejectionReason: ownership.ok ? null : ownership.reason || "unknown",
  });

  try {
    if (resolvedUserId) {
      await Call.findOneAndUpdate(
        {
          telnyxCallControlId: callControlId,
          $or: [
            { user: { $exists: false } },
            { user: null },
            { user: resolvedUserId },
          ],
        },
        {
          $setOnInsert: {
            user: resolvedUserId,
            ownedNumberId: ownedNumber?._id || null,
            phoneNumber: from || to || "unknown",
            fromNumber: from || null,
            toNumber: to || null,
            direction: "inbound",
            source: "voice_api",
            status: "ringing",
            telnyxCallControlId: callControlId,
            telnyxCallSessionId: payload?.call_session_id || null,
            callInitiatedAt: new Date(),
          },
          $set: {
            fromNumber: from || null,
            toNumber: to || null,
            phoneNumber: from || to || "unknown",
            direction: "inbound",
            source: "voice_api",
            lastEventSource: "telnyx_voice_webhook",
            lastEventType: "call.initiated",
            lastProcessedEventAt: new Date(),
          },
        },
        { upsert: true, new: true }
      ).catch(async (err) => {
        if (err?.code === 11000) {
          console.warn("[INBOUND] Duplicate provider control id detected (deduped)", {
            callControlId,
          });
          return;
        }
        throw err;
      });
    } else {
      // Unowned / ambiguous inbound: still record a row WITHOUT a `user` so it
      // can be marked FAILED below. Never speculatively bind a tenant to it.
      await Call.findOneAndUpdate(
        { telnyxCallControlId: callControlId },
        {
          $setOnInsert: {
            user: null,
            ownedNumberId: null,
            phoneNumber: from || to || "unknown",
            fromNumber: from || null,
            toNumber: to || null,
            direction: "inbound",
            source: "voice_api",
            status: "ringing",
            telnyxCallControlId: callControlId,
            telnyxCallSessionId: payload?.call_session_id || null,
            callInitiatedAt: new Date(),
          },
          $set: {
            fromNumber: from || null,
            toNumber: to || null,
            phoneNumber: from || to || "unknown",
            direction: "inbound",
            source: "voice_api",
            lastEventSource: "telnyx_voice_webhook",
            lastEventType: "call.initiated",
            lastProcessedEventAt: new Date(),
          },
        },
        { upsert: true, new: true }
      ).catch(async (err) => {
        if (err?.code === 11000) {
          console.warn("[INBOUND] Duplicate provider control id detected (deduped)", {
            callControlId,
          });
          return;
        }
        throw err;
      });
    }
  } catch (error) {
    console.error(
      "❌ CALL RECORD CREATE FAILED:",
      error?.response?.data || error?.message || error
    );
  }

  if (!ownership.ok) {
    console.warn("[TENANT SECURITY] inbound call rejected", {
      reason: ownership.reason,
      to: payload?.to ?? null,
      canonical: ownership.canonical ?? null,
      call_control_id: callControlId,
      matches: ownership.matchCount ?? 0,
    });
    const existing = await Call.findOne({ telnyxCallControlId: callControlId })
      .select("_id status")
      .lean();
    if (existing?._id) {
      await applyCallTransition({
        callId: existing._id,
        eventAt: new Date(),
        source: "telnyx_voice_webhook",
        eventType: "inbound_routing_error",
        targetStatus: CALL_STATES.FAILED,
        guard: { currentStatus: existing.status },
        set: {
          failReason: `routing-error:${ownership.reason || "unknown"}`,
          hangupCause: "routing-error",
          callEndedAt: new Date(),
          orphanRootCause: "concurrency_race",
        },
        reason: "routing-error",
      }).catch(() => {});
    }
    try {
      await hangupTelnyxCallLeg(callControlId, process.env.TELNYX_API_KEY?.trim());
    } catch (error) {
      console.error(
        "❌ HANGUP FOR REJECTED INBOUND FAILED:",
        error?.response?.data || error?.message || error
      );
    }
    try {
      await speakSafetyMessage(callControlId, "Please try again later");
    } catch (error) {
      console.error(
        "❌ FALLBACK SPEAK FAILED:",
        error?.response?.data || error?.message || error
      );
    }
    return;
  }

  try {
    const userSubscription = await loadUserSubscription(ownedNumber.userId);
    if (userSubscription && userSubscription.isCallEnabled === false) {
      console.warn("[INBOUND] User voice disabled, sending fallback message", {
        userId: String(ownedNumber.userId),
        call_control_id: callControlId,
      });
      try {
        await speakSafetyMessage(callControlId, "Please try again later");
      } catch (error) {
        console.error(
          "❌ FALLBACK SPEAK FAILED:",
          error?.response?.data || error?.message || error
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ SUBSCRIPTION CHECK FAILED:",
      error?.response?.data || error?.message || error
    );
  }
}

function logCallEvent(eventType, callPayload, callControlId, callSessionId, state = null) {
  const from = normalizeThreadPhone(callPayload?.from);
  const to = normalizeThreadPhone(callPayload?.to);
  const nextState =
    state ||
    callPayload?.state ||
    callPayload?.call_state ||
    callPayload?.call_leg_state ||
    null;
  console.log("[CALL EVENT]", {
    eventType,
    callControlId,
    callSessionId,
    from,
    to,
    state: nextState,
  });
  emitAdminCallDebugEvent({
    eventType,
    callControlId,
    callSessionId,
    from,
    to,
    state: nextState,
  });
}

async function hangupTelnyxCallLeg(callControlId, apiKey) {
  if (!callControlId || !apiKey) return;
  try {
    await axios.post(
      `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.warn(
      "[VOICE] hangup failed (voice disabled / policy):",
      e?.response?.data || e?.message || e
    );
  }
}

function logTelecomWebhook(fields = {}) {
  telecomStructuredLog("[WEBHOOK FLOW]", {
    sourcePath: "telnyxVoice.js:logTelecomWebhook",
    ...fields,
  });
}

function logMediaDebug(fields = {}) {
  telecomStructuredLog("[MEDIA FLOW]", {
    sourcePath: "telnyxVoice.js:logMediaDebug",
    ...fields,
  });
}

async function transitionCallStatus({
  call,
  toStatus,
  event,
  callControlId,
  callSessionId,
  callPayload,
  extraSet = {},
}) {
  const to = normalizeCallStatus(toStatus);
  if (!call?._id || !to) return { ok: false, reason: "invalid_call_or_status", call };
  const result = await applyCallTransition({
    callId: call._id,
    eventAt: extraSet?.lastProcessedEventAt || call?.telnyxLastWebhookAt || new Date(),
    source: "telnyx_voice_webhook",
    eventType: event,
    targetStatus: to,
    guard: { currentStatus: call.status },
    set: extraSet,
    details: {
      callControlId: callControlId || null,
      callSessionId: callSessionId || null,
    },
  });
  if (!result.ok) {
    logTelecomWebhook({
      event,
      outcome: result.reason || "transition_rejected",
      callId: String(call._id),
      userId: call.user ? String(call.user) : null,
      callControlId,
      currentStatus: call.status,
      eventType: event,
      callSessionId,
      previousStatus: call.status,
      nextStatus: to,
    });
    return { ok: false, reason: result.reason, call };
  }
  const updated = result.call || null;
  logTelecomWebhook({
    event,
    outcome: "transition_applied",
    callId: String(call._id),
    userId: call.user ? String(call.user) : null,
    callControlId,
    currentStatus: call.status,
    eventType: event,
    callSessionId,
    previousStatus: call.status,
    nextStatus: to,
  });
  return { ok: true, call: updated };
}

/**
 * TELNYX VOICE WEBHOOK — inbound; outbound WebRTC is mostly client-driven, except
 * parked outbound (call_parking_enabled): dial PSTN from agent leg then bridge on answer.
 */
router.post("/", async (req, res) => {
  try {
    console.log("🚨 VOICE WEBHOOK HIT");
    if (!shouldSuppressNonCriticalWebhookWork("debug_log")) {
      console.log("🚨 FULL BODY:", JSON.stringify(req.body, null, 2));
      console.log("[VOICE RAW]", JSON.stringify(req.body, null, 2));
    }

    const rawStrOnly = JSON.stringify(req.body ?? {}, null, 2);
    console.log(
      "[WEBHOOK RECEIVED] raw",
      rawStrOnly.length > 64000 ? `${rawStrOnly.slice(0, 64000)}…(truncated)` : rawStrOnly
    );

    const eventType = req.body?.data?.event_type;
    const payload = req.body?.data?.payload;
    console.log("📡 EVENT TYPE:", eventType);

    if (payload) {
      console.log("[VOICE DATA]", {
        event: eventType,
        call_control_id: payload.call_control_id,
        from: payload.from,
        to: payload.to,
        connection_id: payload.connection_id,
        call_leg_id: payload.call_leg_id,
      });
    }

    const envelope = req.body?.data;
    const envelopePayload = envelope?.payload || {};
    console.log("[VOICE WEBHOOK FIELDS]", {
      event_type: envelope?.event_type ?? null,
      call_control_id:
        envelopePayload.call_control_id ?? envelope?.call_control_id ?? null,
      from: envelopePayload.from ?? null,
      to: envelopePayload.to ?? null,
      connection_id: envelopePayload.connection_id ?? null,
    });

    if (!eventType) {
      console.error("❌ Missing eventType");
      return res.sendStatus(200);
    }

    if (eventType === "call.initiated") {
      const isInbound = isInboundInitiatedPayload(payload);
      if (isInbound) {
        await handleInboundCall(payload, {
          telnyxEventId: req.body?.data?.id || null,
        });
        return res.sendStatus(200);
      }
    }

    const event = eventType;
    const callPayload = payload || {};
    const callControlId =
      callPayload.call_control_id || envelope?.call_control_id || null;
    const callSessionId = callPayload.call_session_id || null;
    logCallEvent(event, callPayload, callControlId, callSessionId);

    console.log("[WEBHOOK RECEIVED]", {
      event_type: event,
      call_control_id: callControlId,
      call_session_id: callSessionId,
    });

    const occurredAtMs = Date.parse(envelope?.occurred_at || "") || Date.now();
    const telnyxEventId = envelope?.id != null ? String(envelope.id) : null;
    const claim = await claimWebhookEvent({
      provider: "telnyx:voice",
      eventId: telnyxEventId,
      eventType: event,
      payload: extractWebhookEnvelope(req.body).payload,
    });
    if (claim.duplicate) {
      recordWebhookReceived(true);
      bumpRedisWebhookClusterCounter();
      recordWebhookBurstSample({
        provider: "telnyx:voice",
        userId: null,
        callKey: callControlId || callSessionId || "_",
        duplicate: true,
      });
      telecomStructuredLog("[WEBHOOK FLOW]", {
        sourcePath: "telnyxVoice.js:claimWebhookEvent",
        callId: null,
        userId: null,
        callControlId,
        currentStatus: null,
        eventType: "webhook_duplicate_claim",
        telnyxEventId,
        providerEventType: event,
      });
      return res.sendStatus(200);
    }

    recordWebhookReceived(false);
    bumpRedisWebhookClusterCounter();
    recordWebhookBurstSample({
      provider: "telnyx:voice",
      userId: null,
      callKey: callControlId || callSessionId || "_",
      duplicate: false,
    });

    const receiveAt = new Date();
    void recordTelecomEventSequence({
      callId: null,
      provider: "telnyx",
      providerEventId: telnyxEventId,
      providerTimestamp: new Date(occurredAtMs),
      receivedAt: receiveAt,
      eventType: event,
      source: "telnyx_voice_webhook",
      orderingAccepted: true,
      orderingReason: "webhook_claimed",
      currentCallStatus: null,
      nextCallStatus: null,
      duplicate: false,
      metadata: { callControlId, callSessionId },
    }).catch(() => {});
    void persistWebhookLatencySample({
      provider: "telnyx",
      providerEventId: telnyxEventId,
      eventType: event,
      providerTimestamp: new Date(occurredAtMs),
      receiveTimestamp: receiveAt,
      processStart: new Date(),
    }).catch(() => {});

    if (!callControlId && !callSessionId) {
      console.warn(
        "[WEBHOOK RECEIVED] no call_control_id or call_session_id; ack only"
      );
      return res.sendStatus(200);
    }

    // ===============================
    // call.initiated — INBOUND; outbound parked WebRTC → Dial PSTN (Call Control)
    // ===============================
    if (event === "call.initiated") {
      const toNumber = callPayload.to;
      const fromNumber = callPayload.from;
      const isIncoming = isInboundInitiatedPayload(callPayload);

      if (
        !isIncoming &&
        isParkOutboundEnabled() &&
        callControlId &&
        isWebhookParkedOutboundInitiated(callPayload)
      ) {
        console.log("[CALL LEG]", {
          legType: "outbound_parked_agent_leg",
          callControlId,
          callSessionId,
          from: normalizeThreadPhone(fromNumber),
          to: normalizeThreadPhone(toNumber),
        });
        const otd = parseOtdFromTelnyxClientState(callPayload.client_state);
        const apiKey = process.env.TELNYX_API_KEY?.trim();
        const connId = process.env.TELNYX_CONNECTION_ID?.trim();
        if (
          otd &&
          mongoose.Types.ObjectId.isValid(otd) &&
          apiKey &&
          connId
        ) {
          const claimed = await Call.findOneAndUpdate(
            {
              _id: otd,
              direction: "outbound",
              webrtcParkDialAttempted: { $ne: true },
            },
            { $set: { webrtcParkDialAttempted: true } },
            { new: true }
          );
          if (claimed) {
            const ownerSub = await loadUserSubscription(claimed.user);
            if (ownerSub && ownerSub.isCallEnabled === false) {
              await Call.updateOne(
                { _id: claimed._id },
                { $set: { webrtcParkDialAttempted: false } }
              );
              await hangupTelnyxCallLeg(callControlId, apiKey);
              console.warn(
                "[PARK OUTBOUND] blocked — calling not enabled for user",
                String(claimed.user)
              );
              return res.sendStatus(200);
            }
            try {
              await mergeTelnyxCallIdentifiers(claimed, {
                callControlId,
                callSessionId,
                occurredAtMs,
              });
              const to =
                normalizeCallPartyNumber(callPayload.to) ||
                normalizeCallPartyNumber(claimed.phoneNumber) ||
                normalizeCallPartyNumber(claimed.toNumber);
              const from =
                normalizeCallPartyNumber(callPayload.from) ||
                normalizeCallPartyNumber(claimed.fromNumber);
              if (!to || !from) {
                throw new Error("park outbound dial missing to/from");
              }
              const base = process.env.BACKEND_URL?.replace(/\/$/, "");
              const wh = base ? `${base}/api/webhooks/telnyx/voice` : undefined;
              const dial = await dialPstnForParkedWebRtcLeg({
                agentCallControlId: callControlId,
                to,
                from,
                connectionId: connId,
                apiKey,
                webhookUrl: wh,
              });
              if (!dial.pstnCallControlId) {
                throw new Error("Telnyx dial returned no PSTN call_control_id");
              }
              await Call.updateOne(
                { _id: claimed._id },
                {
                  $set: {
                    webrtcParkPstnCallControlId: dial.pstnCallControlId,
                  },
                }
              );
              console.log("[PARK OUTBOUND] Dialed PSTN from parked WebRTC leg", {
                otd,
                agentCc: callControlId,
                pstnCc: dial.pstnCallControlId,
                telnyxResponse: dial.raw || null,
              });
              emitAdminCallDebugEvent({
                eventType: "call.leg.dialed",
                callControlId,
                callSessionId,
                legType: "outbound_pstn_leg",
                from,
                to,
                state: "dialed",
                response: dial.raw || null,
              });
            } catch (parkErr) {
              await Call.updateOne(
                { _id: otd },
                { $set: { webrtcParkDialAttempted: false } }
              );
              console.error(
                "[PARK OUTBOUND] dial failed:",
                parkErr?.response?.data || parkErr?.message || parkErr
              );
            }
          }
        }
        return res.sendStatus(200);
      }

      if (!isIncoming) {
        console.log(
          "[WEBHOOK SKIP] outbound call.initiated — WebRTC client owns lifecycle"
        );
        return res.sendStatus(200);
      }

      await handleInboundCall(callPayload, { telnyxEventId });
      return res.sendStatus(200);
    }

    // ===============================
    // call.ringing — only dialing → ringing
    // ===============================
    if (event === "call.ringing") {
      let call = await findCallForTelnyxEvent({ callControlId, callPayload });
      if (!call) {
        console.warn("[WEBHOOK RECEIVED] call.ringing — no call row matched", {
          call_control_id: callControlId,
          call_session_id: callSessionId,
        });
        return res.sendStatus(200);
      }
      trackVoiceWebhookUserSignals(call, callControlId, callSessionId);
      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      const fresh = await Call.findById(call._id);
      await transitionCallStatus({
        call: fresh,
        toStatus: CALL_STATES.RINGING,
        event,
        callControlId,
        callSessionId,
        callPayload,
        extraSet: {
          callRingingAt: fresh.callRingingAt || new Date(occurredAtMs),
          callInitiatedAt: fresh.callInitiatedAt || new Date(occurredAtMs),
          lastProcessedEventAt: new Date(occurredAtMs),
        },
      });
      try {
        const afterRing = await Call.findById(call._id).select(
          "_id user direction attemptChargedAt attemptCharged status billedCallEvents"
        );
        if (afterRing?.direction === "outbound") {
          if (isRatingV1Enabled()) {
            // v1 rating: reaching ringing implies the call was routed to the carrier.
            await chargeCallLifecycleEvent(afterRing, CALL_BILLING_EVENT.ROUTED, {
              sourcePath: "telnyxVoice.js:call.ringing",
              eventType: event,
            });
            await chargeCallLifecycleEvent(afterRing, CALL_BILLING_EVENT.RINGING, {
              sourcePath: "telnyxVoice.js:call.ringing",
              eventType: event,
            });
          } else {
            await chargeProviderAcceptedAttempt(afterRing, {
              sourcePath: "telnyxVoice.js:call.ringing",
              eventType: event,
            });
          }
        }
      } catch (ringBillErr) {
        console.warn("[VOICE BILLING] ringing charge step failed:", ringBillErr?.message || ringBillErr);
      }
      return res.sendStatus(200);
    }

    // ===============================
    // call.progress — early media (183 / carrier audio before answer)
    // ===============================
    if (event === "call.progress") {
      let call = await findCallForTelnyxEvent({ callControlId, callPayload });
      if (!call) {
        return res.sendStatus(200);
      }
      trackVoiceWebhookUserSignals(call, callControlId, callSessionId);
      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      const fresh = await Call.findById(call._id);
      const current = normalizeCallStatus(fresh?.status);
      const target =
        current === CALL_STATES.RINGING || current === CALL_STATES.DIALING
          ? CALL_STATES.EARLY_MEDIA
          : current === CALL_STATES.EARLY_MEDIA
            ? CALL_STATES.EARLY_MEDIA
            : CALL_STATES.RINGING;
      await transitionCallStatus({
        call: fresh,
        toStatus: target,
        event,
        callControlId,
        callSessionId,
        callPayload,
        extraSet: {
          callEarlyMediaAt: fresh.callEarlyMediaAt || new Date(occurredAtMs),
          callRingingAt: fresh.callRingingAt || fresh.callInitiatedAt || new Date(occurredAtMs),
          lastProcessedEventAt: new Date(occurredAtMs),
        },
      });
      try {
        if (isRatingV1Enabled() && fresh?.direction === "outbound") {
          // Early media implies the carrier routed the call.
          const afterProg = await Call.findById(call._id).select(
            "_id user direction billedCallEvents"
          );
          await chargeCallLifecycleEvent(afterProg, CALL_BILLING_EVENT.ROUTED, {
            sourcePath: "telnyxVoice.js:call.progress",
            eventType: event,
          });
        }
      } catch (progBillErr) {
        console.warn("[VOICE BILLING] progress routed charge failed:", progBillErr?.message || progBillErr);
      }
      return res.sendStatus(200);
    }

    // ===============================
    // call.answered / call.bridged → in-progress
    // ===============================
    if (event === "call.answered" || event === "call.bridged") {
      const apiKeyAns = process.env.TELNYX_API_KEY?.trim();
      if (
        event === "call.answered" &&
        isParkOutboundEnabled() &&
        apiKeyAns &&
        callControlId
      ) {
        // SECURITY: bridge lookups MUST require an owner (`user`) on the
        // candidate row. A row with `user: null` is a routing-error placeholder
        // (see handleInboundCall) and may not be bridged into any tenant.
        let parkedAns = await Call.findOne({
          webrtcParkPstnCallControlId: callControlId,
          webrtcParkBridgeAttempted: { $ne: true },
          telnyxCallControlId: { $exists: true, $nin: [null, ""] },
          user: { $exists: true, $ne: null },
        });
        if (!parkedAns) {
          // Hotfix: under load, answered can race before pstn control id lookup path catches up.
          parkedAns = await findCallForTelnyxEvent({ callControlId, callPayload });
          if (parkedAns?._id) {
            await mergeTelnyxCallIdentifiers(parkedAns, {
              callControlId,
              callSessionId: callPayload.call_session_id,
              occurredAtMs,
            }).catch(() => {});
            parkedAns = await Call.findById(parkedAns._id);
          }
        }
        if (parkedAns?._id) {
          trackVoiceWebhookUserSignals(parkedAns, callControlId, callSessionId);
        }

        const shouldBridgeParked =
          Boolean(parkedAns?.telnyxCallControlId) &&
          Boolean(parkedAns?.webrtcParkPstnCallControlId) &&
          Boolean(parkedAns?.user) &&
          parkedAns?.webrtcParkBridgeAttempted !== true &&
          (callControlId === parkedAns.webrtcParkPstnCallControlId ||
            callControlId === parkedAns.telnyxCallControlId);

        if (parkedAns?._id && !parkedAns?.user) {
          telecomStructuredLog("[CALL OWNERSHIP]", {
            sourcePath: "telnyxVoice.js:parked_outbound_bridge",
            eventType: "bridge_blocked_unowned_call_row",
            severity: "critical",
            callId: String(parkedAns._id),
            callControlId,
            callSessionId,
            pstnCallControlId: parkedAns.webrtcParkPstnCallControlId || null,
            accepted: false,
            rejectionReason: "call_row_missing_user_owner",
          });
        }

        logMediaDebug({
          phase: "answered_event_received",
          eventType: event,
          callControlId,
          callSessionId,
          callId: parkedAns?._id ? String(parkedAns._id) : null,
          userId: parkedAns?.user ? String(parkedAns.user) : null,
          currentStatus: parkedAns?.status || null,
          bridgeCandidate: shouldBridgeParked,
          mongoStatus: parkedAns?.status || null,
          providerState: "answered",
          bridgeExecuted: false,
          bridgeSuccess: null,
          telnyxCallControlId: parkedAns?.telnyxCallControlId || null,
          pstnCallControlId: parkedAns?.webrtcParkPstnCallControlId || null,
        });

        if (shouldBridgeParked) {
          const claim = await Call.findOneAndUpdate(
            { _id: parkedAns._id, webrtcParkBridgeAttempted: { $ne: true } },
            { $set: { webrtcParkBridgeAttempted: true, callBridgedAt: new Date() } },
            { new: true }
          );
          if (!claim) {
            telecomStructuredLog("[BRIDGE FLOW]", {
              sourcePath: "telnyxVoice.js:parked_outbound_bridge",
              phase: "bridge_skipped_already_attempted",
              eventType: event,
              callControlId,
              callSessionId,
              callId: String(parkedAns._id),
              userId: parkedAns.user ? String(parkedAns.user) : null,
              currentStatus: parkedAns.status || null,
              bridgeExecuted: false,
              bridgeSuccess: false,
              reason: "already_attempted",
              telnyxCallControlId: parkedAns.telnyxCallControlId,
              pstnCallControlId: parkedAns.webrtcParkPstnCallControlId,
            });
            return res.sendStatus(200);
          }
          try {
            const bridgeResponse = await bridgeParkedWebRtcToPstn({
              agentCallControlId: parkedAns.telnyxCallControlId,
              pstnCallControlId: parkedAns.webrtcParkPstnCallControlId,
              apiKey: apiKeyAns,
            });
            console.log("[BRIDGE RESPONSE]", bridgeResponse?.raw || bridgeResponse || null);
            emitAdminCallDebugEvent({
              eventType: "call.bridge.command",
              callControlId: parkedAns.telnyxCallControlId,
              callSessionId: parkedAns.telnyxCallSessionId || null,
              from: normalizeThreadPhone(parkedAns.fromNumber),
              to: normalizeThreadPhone(parkedAns.toNumber),
              state: "bridge_sent",
              response: bridgeResponse?.raw || bridgeResponse || null,
            });
            telecomStructuredLog("[BRIDGE FLOW]", {
              sourcePath: "telnyxVoice.js:parked_outbound_bridge",
              phase: "bridge_executed",
              eventType: event,
              callControlId,
              callSessionId,
              callId: String(parkedAns._id),
              userId: parkedAns.user ? String(parkedAns.user) : null,
              currentStatus: parkedAns.status || null,
              bridgeExecuted: true,
              bridgeSuccess: true,
              providerState: "bridge_sent",
              telnyxCallControlId: parkedAns.telnyxCallControlId,
              pstnCallControlId: parkedAns.webrtcParkPstnCallControlId,
            });
            console.log("[PARK OUTBOUND] Bridged WebRTC leg ↔ PSTN", {
              callId: String(parkedAns._id),
            });
          } catch (brErr) {
            await Call.updateOne(
              { _id: parkedAns._id },
              { $set: { webrtcParkBridgeAttempted: false } }
            ).catch(() => {});
            telecomStructuredLog("[BRIDGE FLOW]", {
              sourcePath: "telnyxVoice.js:parked_outbound_bridge",
              phase: "bridge_failed",
              eventType: event,
              callControlId,
              callSessionId,
              callId: String(parkedAns._id),
              userId: parkedAns.user ? String(parkedAns.user) : null,
              currentStatus: parkedAns.status || null,
              bridgeExecuted: true,
              bridgeSuccess: false,
              reason: brErr?.response?.data || brErr?.message || String(brErr),
              telnyxCallControlId: parkedAns.telnyxCallControlId,
              pstnCallControlId: parkedAns.webrtcParkPstnCallControlId,
            });
            emitAdminCallDebugEvent({
              eventType: "media.bridge_failed",
              callId: String(parkedAns._id),
              callControlId: parkedAns.telnyxCallControlId,
              callSessionId: parkedAns.telnyxCallSessionId || null,
              state: "bridge_failed",
              reason: String(brErr?.message || brErr || "bridge_failed").slice(0, 500),
            });
            console.error(
              "[PARK OUTBOUND] bridge failed:",
              brErr?.response?.data || brErr?.message || brErr
            );
          }
          return res.sendStatus(200);
        }
      }
      if (event === "call.answered") {
        emitAdminCallDebugEvent({
          eventType: "call.bridge.command",
          callControlId,
          callSessionId,
          from: normalizeThreadPhone(callPayload?.from),
          to: normalizeThreadPhone(callPayload?.to),
          state: "not_sent_non_parked_flow",
        });
      }

      let call = await findCallForTelnyxEvent({ callControlId, callPayload });
      if (!call) {
        console.warn(`[WEBHOOK RECEIVED] ${event} — no call row matched`, {
          call_control_id: callControlId,
          call_session_id: callSessionId,
        });
        return res.sendStatus(200);
      }
      trackVoiceWebhookUserSignals(call, callControlId, callSessionId);
      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      let fresh = await Call.findById(call._id);
      if (event === "call.answered") {
        const answeredTs = fresh.callAnsweredAt || new Date();
        const answeredRes = await transitionCallStatus({
          call: fresh,
          toStatus: CALL_STATES.ANSWERED,
          event,
          callControlId,
          callSessionId,
          callPayload,
          extraSet: {
            callAnsweredAt: answeredTs,
            callStartedAt: fresh.callStartedAt || answeredTs,
            lastProcessedEventAt: new Date(occurredAtMs),
          },
        });
        if (answeredRes.ok) {
          fresh = answeredRes.call;
        } else {
          fresh = await Call.findById(call._id);
        }
      }
      await transitionCallStatus({
        call: fresh,
        toStatus: CALL_STATES.ACTIVE,
        event,
        callControlId,
        callSessionId,
        callPayload,
        extraSet: {
          callStartedAt: fresh.callStartedAt || new Date(),
          lastProcessedEventAt: new Date(occurredAtMs),
          ...(event === "call.bridged" && !fresh.callBridgedAt
            ? { callBridgedAt: new Date() }
            : {}),
        },
      });
      try {
        const latest = await Call.findById(call._id).select(
          "_id user status direction callAnsweredAt callStartedAt durationCreditsCharged attemptChargedAt creditReservationHeld billedCallEvents"
        );
        if (isRatingV1Enabled() && latest?.direction === "outbound") {
          // Ensure routed is captured (answered may arrive without a ringing webhook),
          // then charge the answered-connection milestone before connected billing.
          await chargeCallLifecycleEvent(latest, CALL_BILLING_EVENT.ROUTED, {
            sourcePath: "telnyxVoice.js:call.answered",
            eventType: event,
          });
          await chargeCallLifecycleEvent(latest, CALL_BILLING_EVENT.ANSWERED, {
            sourcePath: "telnyxVoice.js:call.answered",
            eventType: event,
          });
        }
        await billConnectedDurationIntervals(latest);
      } catch (billingErr) {
        console.warn("[VOICE BILLING] duration charge step failed:", billingErr?.message || billingErr);
      }
      return res.sendStatus(200);
    }

    // ===============================
    // call.hangup — finalize (+ usage)
    // ===============================
    if (event === "call.hangup") {
      let call = await findCallForTelnyxEvent({ callControlId, callPayload });
      if (!call) {
        console.warn("[WEBHOOK RECEIVED] hangup — no call row matched", {
          call_control_id: callControlId,
        });
        return res.sendStatus(200);
      }

      trackVoiceWebhookUserSignals(call, callControlId, callSessionId);

      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      call = await Call.findById(call._id);

      if (isTerminalStatus(call.status)) {
        console.log("[WEBHOOK RECEIVED] hangup ignored (already terminal)", {
          callId: String(call._id),
          status: call.status,
        });
        return res.sendStatus(200);
      }

      const endedAt = new Date();
      let durationSeconds = 0;
      let billableSeconds = 0;
      let cost = 0;

      const trulyAnswered =
        Boolean(call.callAnsweredAt) ||
        normalizeCallStatus(call.status) === CALL_STATES.ACTIVE ||
        normalizeCallStatus(call.status) === CALL_STATES.ANSWERED;

      if (callPayload.billable_time !== undefined && trulyAnswered) {
        billableSeconds = Number(callPayload.billable_time) || 0;
        durationSeconds = billableSeconds;
        console.log(`[CALL ENDED] Telnyx billable_time: ${billableSeconds}s`);
      } else if (callPayload.duration_seconds !== undefined && trulyAnswered) {
        durationSeconds = Number(callPayload.duration_seconds) || 0;
        billableSeconds = durationSeconds;
        console.log(`[CALL ENDED] Telnyx duration_seconds: ${durationSeconds}s`);
      } else if (trulyAnswered && call.callStartedAt) {
        durationSeconds = Math.max(0, Math.floor((endedAt - call.callStartedAt) / 1000));
        billableSeconds = durationSeconds;
        console.log(`[CALL ENDED] duration from answer: ${durationSeconds}s`);
      } else {
        durationSeconds = 0;
        billableSeconds = 0;
        console.log(
          `[CALL ENDED] zero billable duration (answered=${trulyAnswered}, status=${call.status})`
        );
      }

      if (billableSeconds > 0) {
        const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
        const minutes = billableSeconds / 60;
        cost = minutes * rate;
      }

      const hangupCause = callPayload.hangup_cause || "unknown";
      let finalStatus = mapHangupToTerminalStatus({
        hangupCause,
        hangupCauseCode: callPayload.hangup_cause_code,
        callAnsweredAt: call.callAnsweredAt,
        callStartedAt: null,
      });
      if (!call.callAnsweredAt) {
        console.warn("[CALL ANSWER CHECK] call.hangup received without prior call.answered", {
          callId: String(call._id),
          callControlId,
          callSessionId,
          from: normalizeThreadPhone(call.fromNumber),
          to: normalizeThreadPhone(call.toNumber),
        });
        emitAdminCallDebugEvent({
          eventType: "call.answer.missing_before_hangup",
          callControlId,
          callSessionId,
          from: normalizeThreadPhone(call.fromNumber),
          to: normalizeThreadPhone(call.toNumber),
          state: "missing_answer_webhook",
        });
      }

      console.log(`[CALL ENDED] ${finalStatus}`, {
        callId: String(call._id),
        billableSeconds,
      });

      const ringingDuration =
        call.callStartedAt && call.callInitiatedAt
          ? Math.floor((call.callStartedAt - call.callInitiatedAt) / 1000)
          : call.callInitiatedAt
            ? Math.floor((endedAt - call.callInitiatedAt) / 1000)
            : 0;

      const answeredDuration = call.callStartedAt
        ? Math.floor((endedAt - call.callStartedAt) / 1000)
        : 0;

      const costPerSecond = billableSeconds > 0 ? cost / billableSeconds : 0;

      const beforeTerminal = normalizeCallStatus(call.status);
      const terminalApply = await applyCallTransition({
        callId: call._id,
        eventAt: new Date(occurredAtMs),
        source: "telnyx_voice_webhook",
        eventType: event,
        targetStatus: finalStatus,
        guard: { currentStatus: call.status },
        set: {
          callEndedAt: endedAt,
          durationSeconds,
          billedMinutes: billableSeconds / 60,
          billedSeconds: billableSeconds,
          cost,
          costPerSecond,
          ringingDuration,
          answeredDuration,
          hangupCause,
          failReason: finalStatus === CALL_STATES.FAILED ? hangupCause : null,
          telnyxCallId: callPayload.call_leg_id || callPayload.id || null,
        },
        reason: "terminal_reconciled",
        details: { callControlId, callSessionId },
      });
      if (!terminalApply.ok) {
        logTelecomWebhook({
          event,
          outcome: terminalApply.reason || "terminal_apply_rejected",
          callId: String(call._id),
          callControlId,
          callSessionId,
          previousStatus: beforeTerminal,
          nextStatus: finalStatus,
        });
        return res.sendStatus(200);
      }
      call = terminalApply.call || call;
      logTelecomWebhook({
        event,
        outcome: "terminal_reconciled",
        callId: String(call._id),
        callControlId,
        callSessionId,
        previousStatus: beforeTerminal,
        nextStatus: finalStatus,
      });

      // v1 Telecom Rating: terminal disposition milestone charge (after telecom flow concluded).
      try {
        if (isRatingV1Enabled() && call.direction === "outbound") {
          const wasRouted =
            Boolean(call.callRingingAt) ||
            Boolean(call.callEarlyMediaAt) ||
            Boolean(call.callAnsweredAt) ||
            (Array.isArray(call.billedCallEvents) &&
              (call.billedCallEvents.includes(CALL_BILLING_EVENT.ROUTED) ||
                call.billedCallEvents.includes(CALL_BILLING_EVENT.RINGING)));
          let terminalEvent = null;
          if (finalStatus === CALL_STATES.BUSY) terminalEvent = CALL_BILLING_EVENT.BUSY;
          else if (finalStatus === CALL_STATES.NO_ANSWER) terminalEvent = CALL_BILLING_EVENT.NO_ANSWER;
          else if (finalStatus === CALL_STATES.FAILED && wasRouted) {
            terminalEvent = CALL_BILLING_EVENT.FAILED_AFTER_ROUTING;
          }
          // rejected/canceled/failed-before-routing => carrier_reject_before_routing (0 credits, no charge).
          // completed => already billed via answered + connected intervals.
          if (terminalEvent) {
            // busy/no-answer imply the call was routed; ensure routed is captured first.
            await chargeCallLifecycleEvent(call, CALL_BILLING_EVENT.ROUTED, {
              sourcePath: "telnyxVoice.js:call.hangup",
              eventType: event,
            });
            await chargeCallLifecycleEvent(call, terminalEvent, {
              sourcePath: "telnyxVoice.js:call.hangup",
              eventType: event,
            });
          }
        }
      } catch (terminalBillErr) {
        console.warn(
          "[VOICE BILLING] terminal disposition charge failed:",
          terminalBillErr?.message || terminalBillErr
        );
      }

      emitAdminLiveCall({
        eventType: "ended",
        userId: call.user,
        callId: call._id,
        destination: call.toNumber || call.phoneNumber,
        from: call.fromNumber,
        direction: call.direction,
        status: finalStatus,
        durationSeconds: billableSeconds,
      }).catch((error) => {
        console.warn("[ADMIN LIVE] failed to emit call end:", error?.message || error);
      });

      if (billableSeconds > 0 && call.user) {
        try {
          const destination =
            call.toNumber?.startsWith("+1") || call.fromNumber?.startsWith("+1")
              ? "US"
              : "US";

          const costResult = await recordCallCost(call._id, call.user, {
            telnyxCallId: call.telnyxCallId || callPayload.call_leg_id || callPayload.id,
            from: call.fromNumber,
            to: call.toNumber,
            destination: destination,
            direction: call.direction,
            ringingSeconds: ringingDuration,
            answeredSeconds: answeredDuration,
            billedSeconds: billableSeconds,
            callStartTime: call.callInitiatedAt || call.callStartedAt,
            callEndTime: endedAt,
            callStatus: finalStatus,
          });

          if (costResult.success) {
            console.log(
              `✅ Recorded call cost in ledger: $${costResult.totalCost.toFixed(6)} (${billableSeconds}s)`
            );
          } else {
            console.warn(`⚠️ Could not record call cost: ${costResult.error}`);
          }
        } catch (costErr) {
          console.error(`❌ Error recording call cost:`, costErr);
        }
      }

      if (call.telnyxCallId) {
        try {
          const { syncCallCost } = await import("../../services/telnyxCostService.js");
          const syncResult = await syncCallCost(call._id.toString(), call.telnyxCallId);
          if (syncResult.success) {
            console.log(
              `✅ Synced real Telnyx cost for call ${call.telnyxCallId}: $${call.cost || 0}`
            );
          } else {
            console.warn(
              `⚠️ Could not sync Telnyx cost for call ${call.telnyxCallId}: ${syncResult.error}`
            );
          }
        } catch (costSyncErr) {
          console.error(`❌ Error syncing call cost:`, costSyncErr);
          await applyCallTransition({
            callId: call._id,
            eventAt: new Date(),
            source: "telnyx_voice_webhook",
            eventType: "cost_sync_error",
            guard: { currentStatus: call.status },
            set: {
              costPending: true,
              costSyncError: costSyncErr.message,
            },
            details: { callControlId, callSessionId },
          });
        }
      } else {
        await applyCallTransition({
          callId: call._id,
          eventAt: new Date(),
          source: "telnyx_voice_webhook",
          eventType: "cost_pending",
          guard: { currentStatus: call.status },
          set: {
            costPending: true,
          },
          details: { callControlId, callSessionId },
        });
      }

      try {
        await releaseUnusedCallReservation(call);
      } catch (releaseErr) {
        console.warn("[VOICE BILLING] reservation release failed:", releaseErr?.message || releaseErr);
      }

      try {
        await finalizeTelecomCallAccounting(call._id, {
          sourcePath: "telnyxVoice.js:call.hangup",
          terminationSource: "telnyx_voice_webhook",
          eventType: event,
        });
      } catch (acctErr) {
        console.warn("[VOICE BILLING] telecom accounting finalize failed:", acctErr?.message || acctErr);
      }

      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("[VOICE WEBHOOK ERROR]", err);
    return res.json({
      data: {
        actions: [
          { command: "answer" },
          {
            command: "speak",
            text: "System error",
          },
        ],
      },
    });
  }
});

export default router;
