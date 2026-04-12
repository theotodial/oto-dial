import express from "express";
import mongoose from "mongoose";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import { recordCallCost } from "../../services/telnyxCostCalculator.js";
import { emitAdminLiveCall } from "../../services/adminLiveEventsService.js";
import { normalizeCallPartyNumber } from "../../utils/callLifecycle.js";
import {
  findCallForTelnyxEvent,
  mergeTelnyxCallIdentifiers,
} from "../../utils/telnyxWebhookCallResolver.js";
import {
  isUnlimitedSubscription,
  incrementUnlimitedUsageAfterSuccess,
} from "../../services/unlimitedUsageService.js";
import { TERMINAL_STATUSES, isTerminalStatus } from "../../utils/callStateMachine.js";
import {
  bridgeParkedWebRtcToPstn,
  dialPstnForParkedWebRtcLeg,
  isParkOutboundEnabled,
  isWebhookParkedOutboundInitiated,
  parseOtdFromTelnyxClientState,
} from "../../services/telnyxParkedOutboundService.js";

const router = express.Router();

const WEBHOOK_PENDING_WINDOW_MS = 120000;

const HANDLED_EVENTS = new Set([
  "call.initiated",
  "call.ringing",
  "call.answered",
  "call.bridged",
  "call.hangup",
]);

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
    const rawStr = JSON.stringify(req.body ?? {}, null, 2);
    console.log(
      "[WEBHOOK RECEIVED] raw",
      rawStr.length > 64000 ? `${rawStr.slice(0, 64000)}…(truncated)` : rawStr
    );

    const payload = req.body?.data;
    if (!payload) {
      return res.sendStatus(200);
    }

    const event = payload.event_type;
    const callPayload = payload.payload || {};
    const callControlId =
      callPayload.call_control_id || payload.call_control_id || null;
    const callSessionId = callPayload.call_session_id || null;

    console.log("[WEBHOOK RECEIVED]", {
      event_type: event,
      call_control_id: callControlId,
      call_session_id: callSessionId,
    });

    if (!HANDLED_EVENTS.has(event)) {
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
            try {
              await mergeTelnyxCallIdentifiers(claimed, {
                callControlId,
                callSessionId,
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

      const searchNumber = toNumber;

      const phoneNumber = await PhoneNumber.findOne({
        phoneNumber: searchNumber,
        status: "active",
      });

      if (!phoneNumber) {
        console.warn(
          `[WEBHOOK RECEIVED] call.initiated — no active phone for to ${searchNumber}`
        );
        return res.sendStatus(200);
      }

      const matchOr = [];
      if (callSessionId) matchOr.push({ telnyxCallSessionId: callSessionId });
      if (callControlId) {
        matchOr.push({ telnyxCallControlId: callControlId });
        matchOr.push({ telnyxLegControlIds: callControlId });
      }

      let callRecord = matchOr.length
        ? await Call.findOne({ $or: matchOr })
        : null;

      if (!callRecord) {
        callRecord = await Call.create({
          user: phoneNumber.userId,
          phoneNumber: fromNumber,
          fromNumber: fromNumber,
          toNumber: toNumber,
          direction: "inbound",
          source: "webrtc",
          status: "dialing",
          callInitiatedAt: new Date(),
        });
        await mergeTelnyxCallIdentifiers(callRecord, {
          callControlId,
          callSessionId,
        });
        callRecord = await Call.findById(callRecord._id);
        console.log("[CALL CREATED] webhook inbound call.initiated", {
          callId: String(callRecord._id),
          userId: String(phoneNumber.userId),
        });
      } else {
        if (isTerminalStatus(callRecord.status)) {
          console.log("[WEBHOOK RECEIVED] call.initiated ignored (terminal)", {
            callId: String(callRecord._id),
          });
          return res.sendStatus(200);
        }
        await mergeTelnyxCallIdentifiers(callRecord, {
          callControlId,
          callSessionId,
        });
        callRecord = await Call.findById(callRecord._id);
        callRecord.callInitiatedAt = callRecord.callInitiatedAt || new Date();
        if (["queued", "initiated"].includes(callRecord.status)) {
          callRecord.status = "dialing";
        }
        await callRecord.save();
      }

      if (phoneNumber.userId && callRecord && !isTerminalStatus(callRecord.status)) {
        try {
          const { sendPushToUser } = await import("../../services/pushService.js");
          await sendPushToUser(phoneNumber.userId, {
            title: "Incoming call",
            body: `Call from ${fromNumber}`,
            data: {
              url: "/recents",
              type: "call",
              from: fromNumber,
              callId: callRecord._id.toString(),
            },
          });
        } catch (pushErr) {
          console.warn("Push notification error for incoming call:", pushErr?.message);
        }
      }

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
            await bridgeParkedWebRtcToPstn({
              agentCallControlId: parkedAns.telnyxCallControlId,
              pstnCallControlId: callControlId,
              apiKey: apiKeyAns,
            });
            await Call.updateOne(
              { _id: parkedAns._id },
              { $set: { webrtcParkBridgeAttempted: true } }
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

      if (billableSeconds > 0 && call.user) {
        const usageCountLock = await Call.updateOne(
          {
            _id: call._id,
            usageCountedAt: null,
          },
          {
            $set: {
              usageCountedAt: new Date(),
              usageCountedSeconds: billableSeconds,
            },
          }
        );

        if (usageCountLock.modifiedCount === 0) {
          console.log(
            `⏭️ Usage already counted for call ${call._id}, skipping duplicate webhook charge`
          );
          return res.sendStatus(200);
        }

        const subscription = await Subscription.findOne({
          userId: call.user,
          status: "active",
        });

        if (subscription) {
          if (isUnlimitedSubscription(subscription)) {
            const usageResult = await incrementUnlimitedUsageAfterSuccess({
              subscriptionId: subscription._id,
              userId: call.user,
              channel: "voice_hangup",
              minutesIncrementSeconds: billableSeconds,
            });

            if (!usageResult.success && usageResult.limitReached) {
              console.warn(
                `⚠️ Voice usage increment hit Unlimited threshold for user ${call.user}`
              );
            }
          } else {
            const secondsUsedBefore = subscription.usage?.minutesUsed || 0;
            const minutesTotal =
              (subscription.limits?.minutesTotal || 2500) +
              (subscription.addons?.minutes || 0);
            const secondsTotal = minutesTotal * 60;
            const secondsRemainingBefore = Math.max(0, secondsTotal - secondsUsedBefore);
            const minutesRemainingBefore = secondsRemainingBefore / 60;

            await Subscription.findOneAndUpdate(
              { userId: call.user, status: "active" },
              {
                $inc: {
                  "usage.minutesUsed": billableSeconds,
                },
              }
            );

            const secondsUsedAfter = secondsUsedBefore + billableSeconds;
            const secondsRemainingAfter = Math.max(0, secondsTotal - secondsUsedAfter);
            const minutesRemainingAfter = secondsRemainingAfter / 60;

            console.log(`📊 USAGE DEDUCTED:`);
            console.log(
              `   Call: ${call.direction} ${call.fromNumber} -> ${call.toNumber}`
            );
            console.log(
              `   Duration: ${billableSeconds} seconds (${(billableSeconds / 60).toFixed(3)} minutes)`
            );
            console.log(
              `   Status: ${finalStatus}${!call.callStartedAt ? " (unanswered/ringing)" : ""}`
            );
            console.log(`   User: ${call.user}`);
            console.log(
              `   Before: ${secondsUsedBefore}s used, ${minutesRemainingBefore.toFixed(2)} minutes remaining`
            );
            console.log(
              `   After: ${secondsUsedAfter}s used, ${minutesRemainingAfter.toFixed(2)} minutes remaining`
            );
          }
        } else {
          console.warn(
            `⚠️ No active subscription found for user ${call.user} - usage not deducted`
          );
        }
      } else if (!call.user) {
        console.warn(`⚠️ Call has no user associated - usage not deducted`);
      }

      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Telnyx voice webhook error:", err);
    return res.sendStatus(200);
  }
});

export default router;
