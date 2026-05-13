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
  normalizeCallStatus,
} from "../utils/callStateMachine.js";
import { normalizeThreadPhone } from "../utils/smsThreadKey.js";
import CallLifecycleEvent from "../models/CallLifecycleEvent.js";
import { applyCallTransition } from "../services/callTransitionService.js";

const router = express.Router();

function logCallFlow(fields) {
  console.log("[CALL FLOW]", {
    ...fields,
    timestamp: new Date().toISOString(),
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
    console.warn(
      "[CALL DEBUG] CALL_DEBUG_SKIP_SUBSCRIPTION=true — skipping requireActiveSubscription for POST /api/calls"
    );
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

router.post("/", requireActiveSubscriptionUnlessDebug, async (req, res) => {
  try {
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

    if (direction === "outbound" && source === "webrtc") {
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
    });

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

    if (direction === "outbound") {
      console.log("[OUTBOUND CALL]", {
        from: normalizeCallPartyNumber(fromNumber) || fromNumber,
        to: normalizeCallPartyNumber(toNumber || phoneNumber) || toNumber || phoneNumber,
      });
    }

    const call = await Call.create({
      user: req.userId,
      phoneNumber,
      fromNumber,
      toNumber: toNumber || phoneNumber,
      direction,
      status,
      source: direction === "outbound" ? "webrtc" : source,
    });

    console.log("[OUTBOUND DIAL DEBUG]", {
      phase: "call_document_created",
      callId: call?._id ? String(call._id) : null,
      currentStatus: call?.status || null,
      targetStatus: null,
      accepted: Boolean(call?._id),
      rejectionReason: call?._id ? null : "create_failed",
      lockAcquired: null,
      eventTimestamp: new Date().toISOString(),
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
    });

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
          normalizedStatus === CALL_STATES.CANCELED
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

        const set = {};
        if (hangupCause != null && hangupCause !== "") {
          set.hangupCause = String(hangupCause);
          set.failReason = requested === CALL_STATES.FAILED ? String(hangupCause) : null;
        }
        if (hangupCauseCode != null && hangupCauseCode !== "") {
          set.hangupCauseCode = String(hangupCauseCode);
        }
        if (lastHeartbeatAt) {
          set.lastHeartbeatAt = new Date(lastHeartbeatAt);
          set.lastClientSyncAt = set.lastHeartbeatAt;
        }
        if (callStartedAt) {
          set.callStartedAt = new Date(callStartedAt);
        }
        if (requested === CALL_STATES.RINGING && !call.callInitiatedAt) {
          set.callInitiatedAt = new Date();
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
        if (isTerminalStatus(requested)) {
          const ended = set.callEndedAt || call.callEndedAt || new Date();
          set.callEndedAt = ended;
          const hadAnswered = Boolean(set.callStartedAt || call.callStartedAt);
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
          if (requested === CALL_STATES.FAILED && !set.failReason && !call.failReason) {
            set.failReason = set.hangupCause || call.hangupCause || "call_connection_failed";
          }

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
                  requested === CALL_STATES.COMPLETED && call.callStartedAt
                    ? Math.max(
                        0,
                        Math.floor((ended - call.callStartedAt) / 1000)
                      )
                    : 0,
                billedSeconds: billable,
                callStartTime: call.callInitiatedAt || call.callStartedAt,
                callEndTime: ended,
                callStatus: requested,
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
            status: call.status,
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
