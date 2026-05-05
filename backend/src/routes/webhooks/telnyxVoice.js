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
import { TERMINAL_STATUSES, isTerminalStatus } from "../../utils/callStateMachine.js";
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

const router = express.Router();

const telnyxVoiceDedupIds = globalThis.__otoTelnyxVoiceDedupIds || [];
const telnyxVoiceDedupSet = globalThis.__otoTelnyxVoiceDedupSet || new Set();
if (!globalThis.__otoTelnyxVoiceDedupIds) {
  globalThis.__otoTelnyxVoiceDedupIds = telnyxVoiceDedupIds;
  globalThis.__otoTelnyxVoiceDedupSet = telnyxVoiceDedupSet;
}

function rememberTelnyxVoiceEventId(id) {
  if (id == null || id === "") return false;
  const s = String(id);
  if (telnyxVoiceDedupSet.has(s)) return true;
  telnyxVoiceDedupSet.add(s);
  telnyxVoiceDedupIds.push(s);
  while (telnyxVoiceDedupIds.length > 8000) {
    const old = telnyxVoiceDedupIds.shift();
    telnyxVoiceDedupSet.delete(old);
  }
  return false;
}

const HANDLED_EVENTS = new Set([
  "call.initiated",
  "call.ringing",
  "call.answered",
  "call.bridged",
  "call.hangup",
  "call.machine.detection.ended",
  "call.playback.ended",
]);

const TELNYX_VOICE_API = "https://api.telnyx.com/v2";

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

function isOutboundWebRtcCall(doc) {
  return (
    doc &&
    doc.direction === "outbound" &&
    (doc.source === "webrtc" || doc.source == null || doc.source === "")
  );
}

/**
 * TELNYX VOICE WEBHOOK — inbound; outbound WebRTC is mostly client-driven, except
 * parked outbound (call_parking_enabled): dial PSTN from agent leg then bridge on answer.
 */
router.post("/", async (req, res) => {
  try {
    console.log("🚨 VOICE WEBHOOK HIT");
    console.log("🚨 FULL BODY:", JSON.stringify(req.body, null, 2));
    console.log("[VOICE RAW]", JSON.stringify(req.body, null, 2));

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
      const payload = req.body?.data?.payload || {};
      const call_control_id = payload.call_control_id;

      console.log("🚨 INBOUND CALL RECEIVED", {
        call_control_id,
        from: payload.from,
        to: payload.to,
      });

      if (!call_control_id) {
        console.error("❌ NO CALL CONTROL ID");
        return res.sendStatus(200);
      }

      try {
        const answer = await axios.post(
          `https://api.telnyx.com/v2/calls/${call_control_id}/actions/answer`,
          {},
          { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
        );

        console.log("✅ ANSWER OK", answer.data);

        const speak = await axios.post(
          `https://api.telnyx.com/v2/calls/${call_control_id}/actions/speak`,
          {
            payload: "Please wait while we connect your call",
            voice: "female",
            language: "en-US",
          },
          { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
        );

        console.log("🔊 SPEAK SENT", speak.data);

        setInterval(async () => {
          try {
            await axios.post(
              `https://api.telnyx.com/v2/calls/${call_control_id}/actions/speak`,
              {
                payload: "Please wait",
                voice: "female",
              },
              { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
            );
            console.log("🔁 KEEP ALIVE SENT");
          } catch (e) {
            console.error("KEEP ALIVE FAILED", e.message);
          }
        }, 4000);
      } catch (err) {
        console.error("❌ HARD FAILURE", err.response?.data || err.message);
      }

      return res.sendStatus(200);
    }

    return res.sendStatus(200);

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
      console.log("[WEBHOOK DEDUP] duplicate Telnyx voice event", telnyxEventId, event);
      return res.sendStatus(200);
    }
    if (rememberTelnyxVoiceEventId(telnyxEventId)) {
      console.log("[WEBHOOK DEDUP] duplicate Telnyx voice event", telnyxEventId, event);
      return res.sendStatus(200);
    }

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
      const isIncoming =
        callPayload.direction === "incoming" ||
        callPayload.direction === "inbound";

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

      if (!callPayload.call_control_id) {
        console.error("❌ Missing call_control_id");
        return res.sendStatus(200);
      }

      const call_control_id = String(callPayload.call_control_id);
      const apiKey = process.env.TELNYX_API_KEY?.trim() || "";
      const from = callPayload?.from || null;
      const to = callPayload?.to || null;

      console.log("STEP 1: extracting numbers");
      console.log("FROM:", from, "TO:", to);

      console.log("STEP 2: finding number in DB");
      const phone = await PhoneNumber.findOne({ phoneNumber: to });
      console.log("PHONE FOUND:", !!phone);

      console.log("STEP 3: resolving user");
      const userId = phone?.userId || null;
      console.log("USER ID:", userId);
      if (!phone) {
        console.error("❌ NUMBER NOT FOUND — STILL ANSWERING FOR DEBUG");
      }

      console.log("STEP 4: answering call");
      try {
        await axios.post(
          `${TELNYX_VOICE_API}/calls/${encodeURIComponent(call_control_id)}/actions/answer`,
          {},
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("✅ ANSWER SENT");
      } catch (err) {
        console.error("❌ ANSWER FAILED:", err?.response?.data || err?.message || err);
      }

      console.log("STEP 5: creating call record");
      try {
        await Call.create({
          user: userId || undefined,
          phoneNumber: from || to || "+00000000000",
          fromNumber: from,
          toNumber: to,
          direction: "inbound",
          source: "voice_api",
          status: "initiated",
          telnyxCallControlId: call_control_id,
          telnyxCallSessionId: callPayload?.call_session_id || null,
          callInitiatedAt: new Date(),
        });

        console.log("✅ CALL RECORD CREATED");
      } catch (err) {
        console.error("❌ CALL RECORD FAILED:", err?.message || err);
      }

      try {
        console.log("📞 INBOUND CALL START", {
          call_control_id,
          from: from ?? null,
          to: to ?? null,
          connection_id: callPayload.connection_id ?? null,
          userId: userId ? String(userId) : null,
        });
      } catch (err) {
        console.error("❌ INBOUND FLOW FAILED", err?.response?.data || err?.message || err);
      }

      console.log("✅ WEBHOOK COMPLETE");
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
      if (isOutboundWebRtcCall(call)) {
        console.log("[WEBHOOK SKIP] outbound WebRTC call.ringing (client SDK)", {
          callId: String(call._id),
        });
        return res.sendStatus(200);
      }
      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      const fresh = await Call.findById(call._id);
      if (isTerminalStatus(fresh.status)) {
        console.log("[WEBHOOK RECEIVED] call.ringing ignored (terminal)", {
          callId: String(fresh._id),
        });
        return res.sendStatus(200);
      }
      const upd = await Call.updateOne(
        { _id: fresh._id, status: "dialing" },
        { $set: { status: "ringing" } }
      );
      if (upd.modifiedCount) {
        console.log("[STATE TRANSITION] dialing → ringing", {
          callId: String(fresh._id),
        });
      } else {
        console.log("[WEBHOOK RECEIVED] call.ringing no-op", {
          callId: String(fresh._id),
          status: fresh.status,
        });
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
        const parkedAns = await Call.findOne({
          webrtcParkPstnCallControlId: callControlId,
          webrtcParkBridgeAttempted: { $ne: true },
          telnyxCallControlId: { $exists: true, $nin: [null, ""] },
        });
        if (parkedAns?.telnyxCallControlId) {
          try {
            const bridgeResponse = await bridgeParkedWebRtcToPstn({
              agentCallControlId: parkedAns.telnyxCallControlId,
              pstnCallControlId: callControlId,
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
            await Call.updateOne(
              { _id: parkedAns._id },
              { $set: { webrtcParkBridgeAttempted: true, callBridgedAt: new Date() } }
            );
            console.log("[PARK OUTBOUND] Bridged WebRTC leg ↔ PSTN", {
              callId: String(parkedAns._id),
            });
          } catch (brErr) {
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
      if (isOutboundWebRtcCall(call)) {
        console.log(`[WEBHOOK SKIP] outbound WebRTC ${event} (client SDK)`, {
          callId: String(call._id),
        });
        return res.sendStatus(200);
      }
      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      const fresh = await Call.findById(call._id);
      if (isTerminalStatus(fresh.status)) {
        console.log(`[WEBHOOK RECEIVED] ${event} ignored (terminal)`, {
          callId: String(fresh._id),
        });
        return res.sendStatus(200);
      }

      const set = { status: "in-progress" };
      if (!fresh.callStartedAt) {
        set.callStartedAt = new Date();
      }
      if (!fresh.callAnsweredAt && event === "call.answered") {
        set.callAnsweredAt = new Date();
      }
      if (!fresh.callBridgedAt && event === "call.bridged") {
        set.callBridgedAt = new Date();
      }
      const updated = await Call.findOneAndUpdate(
        {
          _id: fresh._id,
          status: { $in: ["queued", "initiated", "dialing", "ringing", "answered"] },
        },
        { $set: set },
        { new: true }
      );
      if (updated) {
        console.log(`[STATE TRANSITION] → in-progress (${event})`, {
          callId: String(updated._id),
        });
      } else {
        console.log(`[WEBHOOK RECEIVED] ${event} no-op`, {
          callId: String(fresh._id),
          status: fresh.status,
        });
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

      if (isOutboundWebRtcCall(call)) {
        console.log("[WEBHOOK SKIP] outbound WebRTC call.hangup (client SDK + PATCH)", {
          callId: String(call._id),
        });
        return res.sendStatus(200);
      }

      await mergeTelnyxCallIdentifiers(call, {
        callControlId,
        callSessionId: callPayload.call_session_id,
        occurredAtMs,
      });
      call = await Call.findById(call._id);

      if (TERMINAL_STATUSES.includes(call.status)) {
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

      if (callPayload.billable_time !== undefined) {
        billableSeconds = Number(callPayload.billable_time) || 0;
        durationSeconds = billableSeconds;
        console.log(`[CALL ENDED] Telnyx billable_time: ${billableSeconds}s`);
      } else if (callPayload.duration_seconds !== undefined) {
        durationSeconds = Number(callPayload.duration_seconds) || 0;
        billableSeconds = durationSeconds;
        console.log(`[CALL ENDED] Telnyx duration_seconds: ${durationSeconds}s`);
      } else if (call.callInitiatedAt) {
        const totalSeconds = Math.floor((endedAt - call.callInitiatedAt) / 1000);
        durationSeconds = totalSeconds;
        billableSeconds = totalSeconds;
        console.log(`[CALL ENDED] duration from initiation: ${durationSeconds}s`);
      } else if (call.callStartedAt) {
        durationSeconds = Math.floor((endedAt - call.callStartedAt) / 1000);
        billableSeconds = durationSeconds;
        console.log(`[CALL ENDED] duration from answer: ${durationSeconds}s`);
      } else {
        durationSeconds = 1;
        billableSeconds = 1;
        console.log(`[CALL ENDED] no timestamps — minimum 1s billing`);
      }

      if (billableSeconds > 0) {
        const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
        const minutes = billableSeconds / 60;
        cost = minutes * rate;
      }

      const hangupCause = callPayload.hangup_cause || "unknown";
      let finalStatus = "completed";
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

      if (!call.callStartedAt) {
        finalStatus = call.direction === "inbound" ? "missed" : "failed";
        console.log(`[CALL ENDED] ${finalStatus} (never answered)`, {
          callId: String(call._id),
          billableSeconds,
        });
      } else {
        console.log(`[CALL ENDED] completed`, {
          callId: String(call._id),
          billableSeconds,
        });
      }

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

      call.callEndedAt = endedAt;
      call.durationSeconds = durationSeconds;
      call.billedMinutes = billableSeconds / 60;
      call.cost = cost;
      call.costPerSecond = costPerSecond;
      call.ringingDuration = ringingDuration;
      call.answeredDuration = answeredDuration;
      call.status = finalStatus;
      call.hangupCause = hangupCause;
      call.failReason = finalStatus === "failed" ? hangupCause : null;
      call.telnyxCallId = callPayload.call_leg_id || callPayload.id || null;
      call.billedSeconds = billableSeconds;

      await call.save();

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
          call.costPending = true;
          call.costSyncError = costSyncErr.message;
          await call.save();
        }
      } else {
        call.costPending = true;
        await call.save();
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
