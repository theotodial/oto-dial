import express from "express";
import axios from "axios";
import requireActiveSubscription from "../middleware/requireActiveSubscription.js";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";
import {
  findRecentActiveCallForUser,
  normalizeCallPartyNumber,
  normalizeStrictE164ForDial,
  validateE164,
} from "../utils/callLifecycle.js";
import { tryDeductVoiceUsageForCall } from "../services/voiceCallUsageService.js";
import { recordCallCost } from "../services/telnyxCostCalculator.js";
import { emitAdminLiveCall } from "../services/adminLiveEventsService.js";
import { emitAdminCallDebugEvent } from "../services/adminLiveEventsService.js";
import { evaluateFraudEvent } from "../services/fraudDetectionService.js";
import { enforceTelecomPolicy } from "../services/telecomPolicyService.js";
import { enforceUsageRateLimit } from "../services/usageRateLimitService.js";
import {
  CALL_STATES,
  canTransitionTo,
  isTerminalStatus,
  mapHangupToTerminalStatus,
  normalizeCallStatus,
} from "../utils/callStateMachine.js";
import { normalizeThreadPhone } from "../utils/smsThreadKey.js";
import CallLifecycleEvent from "../models/CallLifecycleEvent.js";
import { applyCallTransition } from "../services/callTransitionService.js";
import { telecomStructuredLog } from "../utils/telecomStructuredLog.js";
import {
  reserveCreditsForOutboundCall,
  chargeProviderAcceptedAttempt,
  chargeCallLifecycleEvent,
  releaseUnusedCallReservation,
} from "../services/callCreditBillingService.js";
import { isRatingV1Enabled, CALL_BILLING_EVENT } from "../services/telecomRatingEngine.js";
import { assertUserHasOutboundDialCredits } from "../services/telecomCreditGuard.js";
import { applyOutboundProfitThrottle, getUserProfitGuardrails } from "../services/profitGuardrailService.js";
import {
  logMiddlewareEnter,
  logMiddlewarePass,
} from "../utils/callsApiMiddlewareAudit.js";

const router = express.Router();

/** Emergency: skip profit throttle, telecom policy, fraud delay — keep auth/subscription/credits/reservation. */
function isCallMinimalMode() {
  const v = String(process.env.CALL_MINIMAL_MODE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function logCallFlow(fields) {
  telecomStructuredLog("[CALL FLOW]", {
    sourcePath: "callRoutes.js:logCallFlow",
    eventType: fields.eventType || "call_flow",
    ...fields,
  });
}

function normalizeThreadDigits(phone) {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/\D/g, "");
}

function canonicalCallStatusView(status) {
  const normalized = normalizeCallStatus(status);
  return normalized || status || "completed";
}

function buildCallThreadCandidates(phone) {
  const raw = String(phone || "").trim();
  const digits = normalizeThreadDigits(raw);
  const set = new Set([raw, digits, digits ? `+${digits}` : null].filter(Boolean));
  if (digits.length === 10) {
    set.add(`+1${digits}`);
    set.add(`1${digits}`);
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    set.add(digits.slice(1));
    set.add(`+${digits}`);
  }
  return Array.from(set);
}

function logTelecomCallTransition({
  callId,
  providerCallId = null,
  userId = null,
  direction = null,
  previousStatus = null,
  nextStatus = null,
  source = null,
  reason = null,
  accepted = true,
}) {
  console.log("[TELECOM CALL TRANSITION]", {
    callId: callId ? String(callId) : null,
    providerCallId: providerCallId || null,
    userId: userId ? String(userId) : null,
    direction: direction || null,
    previousStatus: previousStatus || null,
    nextStatus: nextStatus || null,
    source: source || "call_routes",
    reason: reason || null,
    accepted,
    timestamp: new Date().toISOString(),
  });
}

async function recordCallLifecycleTransition({
  callId,
  userId = null,
  previousState = null,
  nextState = null,
  event = "state_transition",
  action = "applied",
  severity = "info",
  details = {},
}) {
  await CallLifecycleEvent.create({
    callId,
    userId: userId || null,
    severity,
    event,
    previousState,
    nextState,
    action,
    details,
  }).catch(() => {});
}

const skipSubscriptionForCallCreate =
  process.env.CALL_DEBUG_SKIP_SUBSCRIPTION === "true";

function requireActiveSubscriptionUnlessDebug(req, res, next) {
  if (skipSubscriptionForCallCreate) {
    logMiddlewareEnter("requireActiveSubscriptionUnlessDebug", req);
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_SKIP_SUBSCRIPTION=true — skipping requireActiveSubscription for POST /api/calls"
    );
    logMiddlewarePass("requireActiveSubscriptionUnlessDebug", req, {
      skipped: true,
      reason: "CALL_DEBUG_SKIP_SUBSCRIPTION",
    });
    return next();
  }
  return requireActiveSubscription(req, res, next);
}

/** When CALL_AUDIT_FAILED_ATTEMPTS=true, persist rejected outbound attempts for tracing. */
async function persistFailedCallAttempt(req, fields, hangupCause) {
  if (process.env.CALL_AUDIT_FAILED_ATTEMPTS !== "true") return null;
  try {
    const phone =
      fields.phoneNumber && String(fields.phoneNumber).trim() !== ""
        ? String(fields.phoneNumber).trim()
        : "+00000000000";
    const c = await Call.create({
      user: req.userId,
      phoneNumber: phone,
      fromNumber: fields.fromNumber ?? null,
      toNumber: fields.toNumber ?? phone,
      direction: "outbound",
      status: "failed",
      source: "webrtc",
      hangupCause: String(hangupCause || "Blocked before start").slice(0, 500),
      failReason: String(hangupCause || "Blocked before start").slice(0, 500),
    });
    console.log("[CALL AUDIT] persisted rejected attempt", String(c._id), hangupCause);
    return c;
  } catch (e) {
    console.error("[CALL AUDIT] persist rejected attempt failed", e);
    return null;
  }
}

function logCallCredit(phase, fields = {}) {
  console.log("[CALL CREDIT]", { phase, ...fields, t: new Date().toISOString() });
}

function logCallCreate(phase, fields = {}) {
  console.log("[CALL CREATE]", { phase, ...fields, t: new Date().toISOString() });
}

router.post("/", requireActiveSubscriptionUnlessDebug, async (req, res) => {
  const callCreateT0 = Date.now();
  const execTraceHeader = String(req.get("x-oto-exec-trace") || "").trim() || null;
  try {
    logCallCreate("entry", {
      execTraceHeader,
      userId: req.userId ? String(req.userId) : null,
    });
    console.log("[CALL FLOW] POST /api/calls entry", {
      execTraceHeader,
      userId: req.userId ? String(req.userId) : null,
      at: new Date().toISOString(),
      callMinimalMode: isCallMinimalMode(),
    });
    if (req.user?.mode === "campaign") {
      return res.status(403).json({
        success: false,
        error: "CALLING_DISABLED_FOR_PLAN"
      });
    }
    console.log("[REQ BODY RAW]", req.body);
    console.log("[CALL CREATED REQUEST]", req.body);
    console.log("[CALL FLOW] CREATE CALL REQUEST", {
      body: req.body,
      userId: String(req.userId),
    });
    const sub = req.subscription;
    console.log("[CALL FLOW] USER SUBSCRIPTION (summary)", {
      id: sub?.id ? String(sub.id) : null,
      active: sub?.active,
      minutesRemaining: sub?.minutesRemaining,
      numbersCount: Array.isArray(sub?.numbers) ? sub.numbers.length : 0,
    });

    if (sub && sub.isCallEnabled === false) {
      return res.status(403).json({
        success: false,
        error:
          sub.source === "customPackage"
            ? "Calling disabled by admin"
            : "Calling is not included in your current plan.",
      });
    }

    let phoneNumber = req.body.phoneNumber || req.body.to;
    let fromNumber = req.body.fromNumber ?? null;
    let toNumber = req.body.toNumber ?? phoneNumber;
    const direction = req.body.direction === "inbound" ? "inbound" : "outbound";
    const status =
      req.body.status &&
      ["queued", "initiated", "dialing"].includes(req.body.status)
        ? req.body.status
        : "initiated";

    // Outbound user calls always normalize to source "webrtc" here; POST /api/calls is the only
    // app path that creates Call documents. Multi-call credit exposure runs for every outbound
    // create (below) before Call.create, using projected balance + reservation hold.
    const source =
      req.body.source === "voice_api" && direction === "inbound"
        ? "voice_api"
        : "webrtc";

    if (!phoneNumber) {
      await persistFailedCallAttempt(
        req,
        { phoneNumber: null, fromNumber },
        "phoneNumber required"
      );
      return res.status(400).json({
        success: false,
        error: "phoneNumber required"
      });
    }

    let profitGuardrails = null;
    if (direction === "outbound" && source === "webrtc") {
      if (!isCallMinimalMode()) {
        profitGuardrails = await applyOutboundProfitThrottle({ userId: req.userId });
      } else {
        console.warn("[CALL_MINIMAL_MODE] skipping applyOutboundProfitThrottle");
      }
      const rateLimit = enforceUsageRateLimit({ userId: req.userId, channel: "call" });
      if (!rateLimit.allowed) {
        return res.status(429).json({
          success: false,
          error: "Call rate limit exceeded. Please wait before placing more calls.",
          retryAfterMs: rateLimit.retryAfterMs,
        });
      }

      const destE164 = normalizeStrictE164ForDial(phoneNumber);
      if (!destE164) {
        await persistFailedCallAttempt(
          req,
          { phoneNumber, fromNumber, toNumber },
          "Invalid destination number format (E.164 required)"
        );
        return res.status(400).json({
          success: false,
          error:
            "Invalid destination number. Use E.164 (e.g. +16465550100). For +1 (US/Canada) use exactly 10 digits after +1.",
        });
      }
      phoneNumber = destE164;
      toNumber = destE164;

      if (!isCallMinimalMode()) {
        const policyCheck = await enforceTelecomPolicy({
          userId: req.userId,
          channel: "call",
          destinationNumber: destE164,
        });
        if (!policyCheck.allowed) {
          await persistFailedCallAttempt(
            req,
            { phoneNumber: destE164, fromNumber, toNumber: destE164 },
            policyCheck.error
          );
          return res.status(403).json({
            success: false,
            error: policyCheck.error,
          });
        }

        const fraudCheck = await evaluateFraudEvent({
          userId: req.userId,
          channel: "call",
          destinationNumber: destE164,
        });
        if (!fraudCheck.allowed) {
          await persistFailedCallAttempt(
            req,
            { phoneNumber: destE164, fromNumber, toNumber: destE164 },
            fraudCheck.reason
          );
          return res.status(fraudCheck.statusCode || 403).json({
            success: false,
            error: fraudCheck.reason || "Call blocked.",
            ...(Number.isFinite(fraudCheck.retryAfterMs)
              ? { retryAfterMs: fraudCheck.retryAfterMs }
              : {}),
          });
        }
        if (fraudCheck.throttleDelayMs > 0) {
          await new Promise((r) => setTimeout(r, fraudCheck.throttleDelayMs));
        }
      } else {
        console.warn("[CALL_MINIMAL_MODE] skipping enforceTelecomPolicy + evaluateFraudEvent");
      }

      const callerRaw = fromNumber;
      if (!callerRaw) {
        await persistFailedCallAttempt(
          req,
          { phoneNumber, fromNumber, toNumber },
          "fromNumber required for outbound calls"
        );
        return res.status(400).json({
          success: false,
          error: "fromNumber required for outbound calls",
        });
      }
      const callerNorm = normalizeCallPartyNumber(callerRaw);
      if (!validateE164(callerNorm)) {
        await persistFailedCallAttempt(
          req,
          { phoneNumber, fromNumber, toNumber },
          "Invalid caller number format (E.164 required)"
        );
        return res.status(400).json({
          success: false,
          error: "Invalid caller number format (E.164 required)",
        });
      }

      const owned =
        (await PhoneNumber.findOne({
          userId: req.userId,
          status: "active",
          phoneNumber: callerNorm,
        }).lean()) ||
        (await PhoneNumber.findOne({
          userId: req.userId,
          status: "active",
          phoneNumber: String(callerRaw).trim(),
        }).lean());

      if (!owned) {
        await persistFailedCallAttempt(
          req,
          { phoneNumber, fromNumber, toNumber },
          "Caller number not owned by user"
        );
        return res.status(400).json({
          success: false,
          error: "Caller number not owned by user",
        });
      }
      fromNumber = owned.phoneNumber;
    }

    let calleeOwnedUser = null;
    let toNumberOwnership = "external_or_unknown";
    if (toNumber) {
      const calleeOwned = await PhoneNumber.findOne({
        phoneNumber: normalizeThreadPhone(toNumber),
        status: "active",
      })
        .select("userId")
        .lean();
      calleeOwnedUser = calleeOwned?.userId ? String(calleeOwned.userId) : null;
      if (calleeOwnedUser) {
        toNumberOwnership = "internal_user_owned";
      }
    }
    console.log("[CALL ROUTING]", {
      from: normalizeThreadPhone(fromNumber),
      to: normalizeThreadPhone(toNumber || phoneNumber),
      callerUser: String(req.userId),
      calleeUser: calleeOwnedUser,
      fromOwnedByCaller: true,
      toOwnership: toNumberOwnership,
    });
    if (!isCallMinimalMode()) {
      emitAdminCallDebugEvent({
        eventType: "call.preflight",
        callControlId: null,
        callSessionId: null,
        from: normalizeThreadPhone(fromNumber),
        to: normalizeThreadPhone(toNumber || phoneNumber),
        state: "validated",
        callerUser: String(req.userId),
        calleeUser: calleeOwnedUser,
        fromOwnedByCaller: true,
        toOwnership: toNumberOwnership,
      }).catch(() => {});
    }

    const existing = await findRecentActiveCallForUser(req.userId);
    if (existing) {
      console.warn("[CALL FLOW] BLOCK duplicate POST /api/calls — call already in progress", {
        userId: String(req.userId),
        existingId: String(existing._id),
        existingStatus: existing.status,
      });
      return res.status(409).json({
        success: false,
        error: "Call already in progress",
      });
    }
    if (
      direction === "outbound" &&
      Number.isFinite(Number(profitGuardrails?.maxConcurrentCalls)) &&
      Number(profitGuardrails.maxConcurrentCalls) > 0
    ) {
        const activeCount = await Call.countDocuments({
          user: req.userId,
          status: {
            $in: [
              "queued",
              "initiated",
              "dialing",
              "ringing",
              "early-media",
              "answered",
              "in-progress",
            ],
          },
        });
        if (activeCount >= Number(profitGuardrails.maxConcurrentCalls)) {
          return res.status(429).json({
            success: false,
            error: "Outbound concurrency temporarily reduced by telecom risk controls.",
            code: "OUTBOUND_CONCURRENCY_REDUCED",
          });
        }
    }

    // All outbound directions hit this guard (not only WebRTC-shaped bodies); profit multiplier
    // is null only if the outbound preflight block above did not run — currently unreachable for outbound.
    if (direction === "outbound") {
      const creditGate = await assertUserHasOutboundDialCredits(
        req.userId,
        profitGuardrails?.reservationMultiplier
      );
      logCallCredit("pre_create_gate", {
        userId: String(req.userId),
        ok: creditGate.ok,
        code: creditGate.code || null,
        remainingCredits: creditGate.remainingCredits ?? null,
        availableCredits: creditGate.availableCredits ?? null,
      });
      if (!creditGate.ok) {
        await persistFailedCallAttempt(
          req,
          { phoneNumber, fromNumber, toNumber },
          creditGate.code || "INSUFFICIENT_CREDITS"
        );
        return res.status(403).json({
          success: false,
          error:
            creditGate.code === "INSUFFICIENT_PROJECTED_CREDITS"
              ? "Insufficient credits given active calls and reservations (projected balance)."
              : "Insufficient telecom credits to place outbound call.",
          code: creditGate.code || "INSUFFICIENT_CREDITS",
        });
      }
      console.log("[OUTBOUND CALL]", {
        from: normalizeCallPartyNumber(fromNumber) || fromNumber,
        to: normalizeCallPartyNumber(toNumber || phoneNumber) || toNumber || phoneNumber,
      });
    }

    logCallCreate("persist_before", {
      userId: String(req.userId),
      direction,
      status,
      to: normalizeCallPartyNumber(toNumber || phoneNumber),
    });
    const call = await Call.create({
      user: req.userId,
      phoneNumber,
      fromNumber,
      toNumber: toNumber || phoneNumber,
      direction,
      status,
      source: direction === "outbound" ? "webrtc" : source,
    });
    logCallCreate("persist_after", {
      callId: call?._id ? String(call._id) : null,
      userId: String(req.userId),
      status: call?.status,
    });

    telecomStructuredLog("[CALL FLOW]", {
      sourcePath: "callRoutes.js:POST /",
      phase: "call_document_created",
      callId: call?._id ? String(call._id) : null,
      userId: String(req.userId),
      callControlId: call?.telnyxCallControlId || null,
      currentStatus: call?.status || null,
      targetStatus: null,
      accepted: Boolean(call?._id),
      rejectionReason: call?._id ? null : "create_failed",
      lockAcquired: null,
      eventType: "call_create",
      transitionSource: "create_call_route",
    });

    if (!call?._id) {
      console.error("[CALL FLOW] Call.create returned no _id");
      return res.status(500).json({
        success: false,
        error: "Call not saved in database",
      });
    }

    console.log("[CALL CREATED]", {
      callId: String(call._id),
      userId: String(req.userId),
      direction,
      status: call.status,
      to: normalizeCallPartyNumber(toNumber || phoneNumber),
      routeMs: Date.now() - callCreateT0,
    });
    if (direction === "outbound") {
      const guardrails = await getUserProfitGuardrails(call.user);
      let reserve;
      try {
        reserve = await reserveCreditsForOutboundCall(call, {
          reservationMultiplier: guardrails?.reservationMultiplier,
        });
      } catch (reserveErr) {
        logCallCredit("reserve_exception", {
          callId: String(call._id),
          userId: String(req.userId),
          error: reserveErr?.message || String(reserveErr),
          stack: reserveErr?.stack || null,
        });
        await Call.deleteOne({ _id: call._id }).catch(() => {});
        throw reserveErr;
      }
      logCallCredit("reserve_result", {
        callId: String(call._id),
        userId: String(req.userId),
        ok: reserve?.ok,
        code: reserve?.code || null,
        hold: reserve?.hold ?? null,
      });
      if (!reserve?.ok) {
        await releaseUnusedCallReservation(call).catch(() => {});
        await Call.deleteOne({ _id: call._id }).catch(() => {});
        return res.status(403).json({
          success: false,
          error: "Insufficient telecom credits to reserve outbound attempt.",
          code: reserve?.code || "INSUFFICIENT_CREDITS",
        });
      }
    }

    logCallFlow({
      userId: String(req.userId),
      from: normalizeThreadPhone(fromNumber),
      to: normalizeThreadPhone(toNumber || phoneNumber),
      state: call.status,
      callControlId: call.telnyxCallControlId || null,
      callId: String(call._id),
    });

    emitAdminLiveCall({
      eventType: "started",
      userId: req.userId,
      callId: call._id,
      destination: normalizeCallPartyNumber(toNumber || phoneNumber),
      from: fromNumber,
      direction,
      status: call.status,
      durationSeconds: 0,
    }).catch((error) => {
      console.warn("[ADMIN LIVE] failed to emit call start:", error?.message || error);
    });

    res.json({ success: true, call });
  } catch (err) {
    console.error("[CALL ERROR] POST /api/calls", {
      userId: req.userId ? String(req.userId) : null,
      message: err?.message || String(err),
      stack: err?.stack || null,
    });
    console.error("[CALL CREATE ERROR]", err?.message || err, err?.stack);
    console.error("[CALL FLOW] CREATE CALL ERROR:", err?.message || err, err?.stack);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to create call",
    });
  }
});

router.get("/", async (req, res) => {
  try {
    // Build query with optional filters
    const query = { user: req.userId };
    
    // Support filtering by status
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    // Support filtering by direction
    if (req.query.direction) {
      query.direction = req.query.direction;
    }

    const thread = String(req.query.thread || "").trim();
    if (thread) {
      const candidates = buildCallThreadCandidates(thread);
      query.$or = [
        { phoneNumber: { $in: candidates } },
        { toNumber: { $in: candidates } },
        { fromNumber: { $in: candidates } }
      ];
    }

    const limitRaw = parseInt(req.query.limit, 10);
    const maxLimit = thread ? 200 : 20;
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), maxLimit)
      : thread ? 100 : 20;
    
    const calls = await Call.find(query)
      .select("phoneNumber toNumber fromNumber direction status createdAt durationSeconds")
      .sort("-createdAt")
      .limit(limit)
      .lean();
    
    // Format calls with duration and proper classification
    const formattedCalls = calls.map(call => {
      const durationSeconds = call.durationSeconds || 0;
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = durationSeconds % 60;
      const durationFormatted = durationSeconds > 0 
        ? `${minutes}:${String(seconds).padStart(2, '0')}`
        : null;
      
      // Classify call type
      let callType = 'outgoing';
      const normalizedStatus = normalizeCallStatus(call.status);
      if (call.direction === 'inbound') {
        if (normalizedStatus === CALL_STATES.NO_ANSWER) {
          callType = 'incoming';
        } else if (normalizedStatus === CALL_STATES.COMPLETED || normalizedStatus === CALL_STATES.ANSWERED) {
          callType = 'incoming';
        } else {
          callType = 'incoming';
        }
      } else {
        if (normalizedStatus === CALL_STATES.COMPLETED || normalizedStatus === CALL_STATES.ANSWERED) {
          callType = 'outgoing';
        } else if (
          normalizedStatus === CALL_STATES.FAILED ||
          normalizedStatus === CALL_STATES.BUSY ||
          normalizedStatus === CALL_STATES.REJECTED ||
          normalizedStatus === CALL_STATES.CANCELED ||
          normalizedStatus === CALL_STATES.NO_ANSWER
        ) {
          callType = 'failed';
        } else {
          callType = 'outgoing';
        }
      }
      
      return {
        ...call,
        id: call._id,
        _id: call._id,
        phoneNumber: call.phoneNumber || call.toNumber || call.fromNumber,
        toNumber: call.toNumber || call.phoneNumber,
        fromNumber: call.fromNumber || call.phoneNumber,
        durationFormatted,
        callType,
        // Ensure status is properly set
        status: canonicalCallStatusView(call.status)
      };
    });
    
    res.json({ success: true, calls: formattedCalls });
  } catch (err) {
    console.error('GET /api/calls error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch calls' });
  }
});

/** Single call (read-only; outbound WebRTC state is client-driven) */
router.get("/:id", async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!call) {
      return res.status(404).json({ success: false, error: "Call not found" });
    }

    const out = call.toObject ? call.toObject() : call;
    res.json({
      success: true,
      call: { ...out, id: out._id },
    });
  } catch (err) {
    console.error("GET /api/calls/:id error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch call" });
  }
});

// Outbound WebRTC: client SDK drives status. Inbound / legacy: webhooks or narrow client abort.
router.patch("/:id", async (req, res) => {
  try {
    const {
      status,
      durationSeconds,
      callEndedAt,
      callStartedAt,
      telnyxCallControlId,
      telnyxCallSessionId,
      webrtcRtcCallId,
      webrtcLocalCallId,
      hangupCause,
      hangupCauseCode,
      lastHeartbeatAt,
    } = req.body;

    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found",
      });
    }

    const webrtcOutbound =
      call.direction === "outbound" &&
      (call.source === "webrtc" || call.source == null);
    const patchEventAt =
      lastHeartbeatAt ||
      callEndedAt ||
      callStartedAt ||
      new Date().toISOString();

    if (isTerminalStatus(call.status)) {
      await recordCallLifecycleTransition({
        callId: call._id,
        userId: call.user,
        previousState: normalizeCallStatus(call.status),
        nextState: normalizeCallStatus(status || call.status),
        event: "invalid_transition",
        action: "ignored_terminal_call",
        severity: "warning",
        details: { source: "client_patch_api" },
      });
      return res.status(409).json({
        success: false,
        error: "Call is already in a terminal state",
      });
    }

    if (status != null && status !== "") {
      if (webrtcOutbound) {
        const current = normalizeCallStatus(call.status);
        const requested = normalizeCallStatus(status);
        if (!requested) {
          return res.status(400).json({
            success: false,
            error: "Invalid status",
          });
        }
        if (isTerminalStatus(current)) {
          return res.status(400).json({
            success: false,
            error: "Call already ended",
          });
        }
        if (!canTransitionTo(current, requested)) {
          await recordCallLifecycleTransition({
            callId: call._id,
            userId: call.user,
            previousState: current,
            nextState: requested,
            event: "invalid_transition",
            action: "rejected_by_state_machine",
            severity: "warning",
            details: {
              source: "client_patch_webrtc",
              reason: "invalid_transition",
            },
          });
          logTelecomCallTransition({
            callId: call._id,
            providerCallId: call.telnyxCallControlId,
            userId: call.user,
            direction: call.direction,
            previousStatus: current,
            nextStatus: requested,
            source: "client_patch_webrtc",
            reason: "invalid_transition",
            accepted: false,
          });
          return res.status(400).json({
            success: false,
            error: `Invalid transition ${current} -> ${requested}`,
          });
        }

        /** Never treat callStartedAt alone as "answered" — prevents false completed/successful. */
        const hadAnsweredPrior =
          current === CALL_STATES.ACTIVE ||
          current === CALL_STATES.ANSWERED ||
          Boolean(call.callAnsweredAt);

        let effectiveRequested = requested;
        if (
          isTerminalStatus(requested) &&
          requested === CALL_STATES.COMPLETED &&
          !hadAnsweredPrior
        ) {
          effectiveRequested = mapHangupToTerminalStatus({
            hangupCause: hangupCause || call.hangupCause,
            hangupCauseCode: hangupCauseCode ?? call.hangupCauseCode,
            callAnsweredAt: null,
            callStartedAt: null,
          });
          if (!canTransitionTo(current, effectiveRequested)) {
            effectiveRequested = CALL_STATES.FAILED;
          }
          console.warn("[CALL STATUS TRANSITION]", {
            tag: "coerced_completed_without_answer",
            previousStatus: current,
            requested,
            effectiveRequested,
            callId: String(call._id),
            callControlId: call.telnyxCallControlId || null,
            hadAnsweredPrior,
            source: "client_patch_webrtc",
          });
        }

        const set = {};
        if (hangupCause != null && hangupCause !== "") {
          set.hangupCause = String(hangupCause);
          set.failReason =
            effectiveRequested === CALL_STATES.FAILED ? String(hangupCause) : null;
        }
        if (hangupCauseCode != null && hangupCauseCode !== "") {
          set.hangupCauseCode = String(hangupCauseCode);
        }
        if (lastHeartbeatAt) {
          set.lastHeartbeatAt = new Date(lastHeartbeatAt);
          set.lastClientSyncAt = set.lastHeartbeatAt;
        }
        if (callStartedAt) {
          const trustClientStartedAt =
            !isTerminalStatus(effectiveRequested) ||
            hadAnsweredPrior ||
            effectiveRequested === CALL_STATES.ACTIVE ||
            effectiveRequested === CALL_STATES.ANSWERED;
          if (trustClientStartedAt) {
            set.callStartedAt = new Date(callStartedAt);
          }
        }
        if (requested === CALL_STATES.RINGING && !call.callInitiatedAt) {
          set.callInitiatedAt = new Date();
        }
        if (requested === CALL_STATES.RINGING) {
          set.callRingingAt = call.callRingingAt || new Date();
        }
        const chargeOnRinging =
          requested === CALL_STATES.RINGING &&
          !call.attemptChargedAt &&
          call.attemptCharged !== true;
        if (requested === CALL_STATES.EARLY_MEDIA) {
          set.callEarlyMediaAt = call.callEarlyMediaAt || new Date();
          set.callRingingAt = call.callRingingAt || call.callInitiatedAt || new Date();
        }
        if (requested === CALL_STATES.ACTIVE || requested === CALL_STATES.ANSWERED) {
          set.callInitiatedAt = call.callInitiatedAt || new Date();
          if (!call.callStartedAt) {
            set.callStartedAt = new Date();
          }
          if (!call.callAnsweredAt) {
            set.callAnsweredAt = set.callStartedAt || call.callStartedAt || new Date();
          }
        }
        if (callEndedAt) {
          set.callEndedAt = new Date(callEndedAt);
        }
        if (durationSeconds !== undefined) {
          set.durationSeconds = Number(durationSeconds) || 0;
        }
        if (isTerminalStatus(effectiveRequested)) {
          const ended = set.callEndedAt || call.callEndedAt || new Date();
          set.callEndedAt = ended;
          const hadAnswered = hadAnsweredPrior;
          let billable = Number(durationSeconds);
          if (!Number.isFinite(billable) || billable < 0) {
            billable = 0;
          }

          if (hadAnswered && billable <= 0) {
            const answeredAt = set.callStartedAt || call.callStartedAt || set.callInitiatedAt || call.callInitiatedAt;
            if (answeredAt) {
              billable = Math.max(
                1,
                Math.floor((ended - answeredAt) / 1000)
              );
            }
          }

          const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
          set.billedSeconds = hadAnswered ? billable : 0;
          set.billedMinutes = hadAnswered ? billable / 60 : 0;
          set.cost = hadAnswered ? (billable / 60) * rate : 0;
          set.costPerSecond =
            hadAnswered && billable > 0 ? set.cost / billable : 0;
          if (hadAnswered) {
            set.durationSeconds = set.durationSeconds || call.durationSeconds || billable;
          } else if (durationSeconds !== undefined) {
            set.durationSeconds = Number(durationSeconds) || 0;
          } else {
            set.durationSeconds = 0;
          }
          if (effectiveRequested === CALL_STATES.FAILED && !set.failReason && !call.failReason) {
            set.failReason = set.hangupCause || call.hangupCause || "call_connection_failed";
          }

          const transitioned = await applyCallTransition({
            callId: call._id,
            eventAt: patchEventAt,
            source: "client_patch_webrtc",
            eventType: status || "heartbeat",
            targetStatus: effectiveRequested,
            guard: { currentStatus: call.status },
            set,
            reason: "client_patch_webrtc",
          });
          if (!transitioned.ok) {
            return res.status(409).json({
              success: false,
              error: transitioned.reason || "Transition rejected",
            });
          }
          call = transitioned.call || call;
          if (isRatingV1Enabled() && call.direction === "outbound") {
            try {
              const wasRouted =
                Boolean(call.callRingingAt) ||
                Boolean(call.callEarlyMediaAt) ||
                Boolean(call.callAnsweredAt) ||
                hadAnswered ||
                (Array.isArray(call.billedCallEvents) &&
                  (call.billedCallEvents.includes(CALL_BILLING_EVENT.ROUTED) ||
                    call.billedCallEvents.includes(CALL_BILLING_EVENT.RINGING)));
              let terminalEvent = null;
              if (effectiveRequested === CALL_STATES.BUSY) terminalEvent = CALL_BILLING_EVENT.BUSY;
              else if (effectiveRequested === CALL_STATES.NO_ANSWER)
                terminalEvent = CALL_BILLING_EVENT.NO_ANSWER;
              else if (effectiveRequested === CALL_STATES.FAILED && wasRouted)
                terminalEvent = CALL_BILLING_EVENT.FAILED_AFTER_ROUTING;
              if (terminalEvent) {
                await chargeCallLifecycleEvent(call, CALL_BILLING_EVENT.ROUTED, {
                  sourcePath: "callRoutes.js:PATCH",
                  eventType: "client_terminal",
                });
                await chargeCallLifecycleEvent(call, terminalEvent, {
                  sourcePath: "callRoutes.js:PATCH",
                  eventType: "client_terminal",
                });
              }
            } catch (v1TermErr) {
              console.warn(
                "[TELECOM CHARGE] v1 client terminal charge failed:",
                v1TermErr?.message || v1TermErr
              );
            }
          }
          if (hadAnswered && billable > 0) {
            await tryDeductVoiceUsageForCall(call, billable);
          }

          if (hadAnswered && billable > 0 && call.user) {
            try {
              await recordCallCost(call._id, call.user, {
                telnyxCallId: call.telnyxCallId,
                from: call.fromNumber,
                to: call.toNumber,
                destination: "US",
                direction: call.direction,
                ringingSeconds: 0,
                answeredSeconds:
                  effectiveRequested === CALL_STATES.COMPLETED && call.callStartedAt
                    ? Math.max(
                        0,
                        Math.floor((ended - call.callStartedAt) / 1000)
                      )
                    : 0,
                billedSeconds: billable,
                callStartTime: call.callInitiatedAt || call.callStartedAt,
                callEndTime: ended,
                callStatus: effectiveRequested,
              });
            } catch (costErr) {
              console.warn(
                "recordCallCost (webrtc client):",
                costErr?.message || costErr
              );
            }
          }

          console.log("[CALL ENDED]", {
            callId: String(call._id),
            status: effectiveRequested,
            billableSeconds: hadAnswered ? billable : 0,
            answered: hadAnswered,
          });
        } else {
          const transitioned = await applyCallTransition({
            callId: call._id,
            eventAt: patchEventAt,
            source: "client_patch_webrtc",
            eventType: status || "heartbeat",
            targetStatus: requested,
            guard: { currentStatus: call.status },
            set,
            reason: "client_patch_webrtc",
          });
          if (!transitioned.ok) {
            return res.status(409).json({
              success: false,
              error: transitioned.reason || "Transition rejected",
            });
          }
          call = transitioned.call || call;
          if (isRatingV1Enabled()) {
            try {
              const freshV1 = await Call.findById(call._id).select(
                "_id user direction billedCallEvents"
              );
              if (freshV1?.direction === "outbound") {
                if (requested === CALL_STATES.RINGING) {
                  await chargeCallLifecycleEvent(freshV1, CALL_BILLING_EVENT.ROUTED, {
                    sourcePath: "callRoutes.js:PATCH",
                    eventType: "client_ringing",
                  });
                  await chargeCallLifecycleEvent(freshV1, CALL_BILLING_EVENT.RINGING, {
                    sourcePath: "callRoutes.js:PATCH",
                    eventType: "client_ringing",
                  });
                } else if (
                  requested === CALL_STATES.ACTIVE ||
                  requested === CALL_STATES.ANSWERED
                ) {
                  await chargeCallLifecycleEvent(freshV1, CALL_BILLING_EVENT.ROUTED, {
                    sourcePath: "callRoutes.js:PATCH",
                    eventType: "client_answered",
                  });
                  await chargeCallLifecycleEvent(freshV1, CALL_BILLING_EVENT.ANSWERED, {
                    sourcePath: "callRoutes.js:PATCH",
                    eventType: "client_answered",
                  });
                }
              }
            } catch (v1Err) {
              console.warn(
                "[TELECOM CHARGE] v1 client lifecycle charge failed:",
                v1Err?.message || v1Err
              );
            }
          } else if (chargeOnRinging) {
            const freshRing = await Call.findById(call._id);
            await chargeProviderAcceptedAttempt(freshRing, {
              sourcePath: "callRoutes.js:PATCH",
              eventType: "client_ringing",
            }).catch((err) => {
              console.warn(
                "[TELECOM CHARGE] attempt on client ringing failed:",
                err?.message || err
              );
            });
          }
        }

        logTelecomCallTransition({
          callId: call._id,
          providerCallId: call.telnyxCallControlId,
          userId: req.userId,
          direction: call.direction,
          previousStatus: current,
          nextStatus: requested,
          source: "client_patch_webrtc",
          reason: "accepted",
          accepted: true,
        });
        await recordCallLifecycleTransition({
          callId: call._id,
          userId: call.user,
          previousState: current,
          nextState: requested,
          event: "state_transition",
          action: "applied",
          severity: "info",
          details: {
            source: "client_patch_webrtc",
          },
        });

        logCallFlow({
          userId: String(req.userId),
          from: normalizeThreadPhone(call.fromNumber),
          to: normalizeThreadPhone(call.toNumber),
          state: call.status,
          callControlId: call.telnyxCallControlId || null,
          callId: String(call._id),
        });

        console.log("[CALL UPDATED]", {
          callId: String(call._id),
          status: call.status,
          hangupCause: call.hangupCause || null,
          hangupCauseCode: call.hangupCauseCode || null,
        });

        return res.json({ success: true, call });
      }

      const current = normalizeCallStatus(call.status);
      const requested = normalizeCallStatus(status);
      if (
        requested === CALL_STATES.FAILED &&
        [CALL_STATES.QUEUED, CALL_STATES.INITIATED, CALL_STATES.DIALING, CALL_STATES.RINGING].includes(current)
      ) {
        const transitioned = await applyCallTransition({
          callId: call._id,
          eventAt: patchEventAt,
          source: "client_patch_api",
          eventType: status || "client_abort",
          targetStatus: CALL_STATES.FAILED,
          guard: { currentStatus: call.status },
          set: {
            callEndedAt: call.callEndedAt || new Date(),
            hangupCause: call.hangupCause || "client_abort",
            failReason: call.failReason || call.hangupCause || "call_connection_failed",
          },
          reason: "client_abort",
        });
        if (!transitioned.ok) {
          return res.status(409).json({
            success: false,
            error: transitioned.reason || "Transition rejected",
          });
        }
        call = transitioned.call || call;
      } else {
        return res.status(400).json({
          success: false,
          error: "Call status is server-controlled",
        });
      }
    }

    const metadataSet = {};
    if (durationSeconds !== undefined) metadataSet.durationSeconds = durationSeconds;
    if (callEndedAt) metadataSet.callEndedAt = new Date(callEndedAt);
    if (callStartedAt) metadataSet.callStartedAt = new Date(callStartedAt);
    if (telnyxCallControlId !== undefined) {
      metadataSet.telnyxCallControlId = telnyxCallControlId || null;
    }
    if (telnyxCallSessionId !== undefined) {
      metadataSet.telnyxCallSessionId = telnyxCallSessionId || null;
    }
    if (webrtcRtcCallId !== undefined) {
      metadataSet.webrtcRtcCallId = webrtcRtcCallId || null;
    }
    if (webrtcLocalCallId !== undefined) {
      metadataSet.webrtcLocalCallId = webrtcLocalCallId || null;
    }
    if (lastHeartbeatAt) {
      metadataSet.lastHeartbeatAt = new Date(lastHeartbeatAt);
      metadataSet.lastClientSyncAt = metadataSet.lastHeartbeatAt;
    }
    if (Object.keys(metadataSet).length > 0) {
      const metadataApply = await applyCallTransition({
        callId: call._id,
        eventAt: patchEventAt,
        source: "client_patch_api",
        eventType: status || "metadata_update",
        guard: { currentStatus: call.status },
        set: metadataSet,
        reason: "metadata_update",
      });
      if (!metadataApply.ok) {
        return res.status(409).json({
          success: false,
          error: metadataApply.reason || "Metadata update rejected",
        });
      }
      call = metadataApply.call || call;
    }

    console.log("[CALL UPDATED]", { callId: String(call._id) });

    res.json({ success: true, call });
  } catch (err) {
    console.error("CALL UPDATE ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update call",
    });
  }
});

/**
 * DELETE /api/calls
 * Delete all call history for the current user
 */
router.delete("/", async (req, res) => {
  try {
    const result = await Call.deleteMany({ user: req.userId });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/calls error:", err);
    res.status(500).json({ success: false, error: "Failed to delete call history" });
  }
});

/**
 * POST /api/calls/:id/answer
 * Answer an incoming call using Telnyx Call Control API (for Voice API)
 */
router.post("/:id/answer", requireActiveSubscription, async (req, res) => {
  try {
    if (req.user?.mode === "campaign") {
      return res.status(403).json({
        success: false,
        error: "CALLING_DISABLED_FOR_PLAN"
      });
    }
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId,
      direction: "inbound",
      status: { $in: ["ringing", "dialing"] },
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found or not answerable"
      });
    }

    if (!call.telnyxCallControlId) {
      return res.status(400).json({
        success: false,
        error: "Call control ID not found"
      });
    }
    if (isTerminalStatus(call.status)) {
      await recordCallLifecycleTransition({
        callId: call._id,
        userId: call.user,
        previousState: normalizeCallStatus(call.status),
        nextState: CALL_STATES.ACTIVE,
        event: "invalid_transition",
        action: "ignored_terminal_call",
        severity: "warning",
        details: { source: "answer_api" },
      });
      return res.status(409).json({
        success: false,
        error: "Call is already in a terminal state",
      });
    }

    // Answer the call using Telnyx Call Control API
    const response = await axios.post(
      `https://api.telnyx.com/v2/calls/${call.telnyxCallControlId}/actions/answer`,
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const current = normalizeCallStatus(call.status);
    const requested = CALL_STATES.ACTIVE;
    if (!canTransitionTo(current, requested)) {
      return res.status(409).json({
        success: false,
        error: `Invalid transition ${current} -> ${requested}`,
      });
    }
    const answerApply = await applyCallTransition({
      callId: call._id,
      eventAt: new Date().toISOString(),
      source: "answer_api",
      eventType: "answer_command",
      targetStatus: requested,
      guard: { currentStatus: call.status },
      set: {
        callStartedAt: call.callStartedAt || new Date(),
        callAnsweredAt: call.callAnsweredAt || call.callStartedAt || new Date(),
      },
      reason: "answer_command",
    });
    if (!answerApply.ok) {
      return res.status(409).json({
        success: false,
        error: answerApply.reason || "Answer transition rejected",
      });
    }
    call = answerApply.call || call;

    console.log("[ANSWER RESPONSE]", response?.data || null);
    emitAdminCallDebugEvent({
      eventType: "call.answer.command",
      callControlId: call.telnyxCallControlId,
      callSessionId: call.telnyxCallSessionId || null,
      from: normalizeThreadPhone(call.fromNumber),
      to: normalizeThreadPhone(call.toNumber),
      state: "answer_sent",
      response: response?.data || null,
    });

    logTelecomCallTransition({
      callId: call._id,
      providerCallId: call.telnyxCallControlId,
      userId: call.user,
      direction: call.direction,
      previousStatus: current,
      nextStatus: requested,
      source: "answer_api",
      reason: "answer_command",
      accepted: true,
    });
    await recordCallLifecycleTransition({
      callId: call._id,
      userId: call.user,
      previousState: current,
      nextState: requested,
      event: "state_transition",
      action: "applied",
      severity: "info",
      details: {
        source: "answer_api",
      },
    });
    console.log(`[STATE TRANSITION] → in-progress (answer API) ${call._id}`);

    res.json({ 
      success: true, 
      call,
      telnyxResponse: response.data 
    });
  } catch (err) {
    console.error("ANSWER CALL ERROR:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.errors?.[0]?.detail || "Failed to answer call"
    });
  }
});

/**
 * DELETE /api/calls/:id
 * Delete a single call record
 */
router.delete("/:id", async (req, res) => {
  try {
    const call = await Call.findOneAndDelete({
      _id: req.params.id,
      user: req.userId
    });
    if (!call) {
      return res.status(404).json({ success: false, error: "Call not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/calls/:id error:", err);
    res.status(500).json({ success: false, error: "Failed to delete call" });
  }
});

export default router;
