import express from "express";
import axios from "axios";
import authenticateUser from "../middleware/authenticateUser.js";
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
import { TERMINAL_STATUSES } from "../utils/callStateMachine.js";

const router = express.Router();

router.use(authenticateUser);

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

    const call = await Call.create({
      user: req.userId,
      phoneNumber,
      fromNumber,
      toNumber: toNumber || phoneNumber,
      direction,
      status,
      source: direction === "outbound" ? "webrtc" : source,
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
      query.$or = [
        { phoneNumber: thread },
        { toNumber: thread },
        { fromNumber: thread }
      ];
    }
    
    // Support limit
    const limit = parseInt(req.query.limit) || 100;
    
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
      if (call.direction === 'inbound') {
        if (call.status === 'missed') {
          callType = 'missed';
        } else if (call.status === 'completed' || call.status === 'answered') {
          callType = 'incoming';
        } else {
          callType = 'incoming';
        }
      } else {
        if (call.status === 'completed' || call.status === 'answered') {
          callType = 'outgoing';
        } else if (call.status === 'failed') {
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
        status: call.status || 'completed'
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

    if (status != null && status !== "") {
      if (webrtcOutbound) {
        if (TERMINAL_STATUSES.includes(call.status)) {
          return res.status(400).json({
            success: false,
            error: "Call already ended",
          });
        }
        const allowed = [
          "dialing",
          "ringing",
          "in-progress",
          "completed",
          "failed",
        ];
        if (!allowed.includes(status)) {
          return res.status(400).json({
            success: false,
            error: "Invalid status for WebRTC outbound",
          });
        }

        call.status = status;
        if (hangupCause != null && hangupCause !== "") {
          call.hangupCause = String(hangupCause);
        }
        if (hangupCauseCode != null && hangupCauseCode !== "") {
          call.hangupCauseCode = String(hangupCauseCode);
        }
        if (callStartedAt) {
          call.callStartedAt = new Date(callStartedAt);
        }
        if (status === "ringing" && !call.callInitiatedAt) {
          call.callInitiatedAt = new Date();
        }
        if (status === "in-progress") {
          call.callInitiatedAt = call.callInitiatedAt || new Date();
          if (!call.callStartedAt) {
            call.callStartedAt = new Date();
          }
        }
        if (callEndedAt) {
          call.callEndedAt = new Date(callEndedAt);
        }
        if (durationSeconds !== undefined) {
          call.durationSeconds = Number(durationSeconds) || 0;
        }

        if (status === "completed" || status === "failed") {
          const ended = call.callEndedAt || new Date();
          call.callEndedAt = ended;
          const hadAnswered = Boolean(call.callStartedAt);
          let billable = Number(durationSeconds);
          if (!Number.isFinite(billable) || billable < 0) {
            billable = 0;
          }

          if (hadAnswered && billable <= 0) {
            const answeredAt = call.callStartedAt || call.callInitiatedAt;
            if (answeredAt) {
              billable = Math.max(
                1,
                Math.floor((ended - answeredAt) / 1000)
              );
            }
          }

          const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
          call.billedSeconds = hadAnswered ? billable : 0;
          call.billedMinutes = hadAnswered ? billable / 60 : 0;
          call.cost = hadAnswered ? (billable / 60) * rate : 0;
          call.costPerSecond =
            hadAnswered && billable > 0 ? call.cost / billable : 0;
          if (hadAnswered) {
            call.durationSeconds = call.durationSeconds || billable;
          } else if (durationSeconds !== undefined) {
            call.durationSeconds = Number(durationSeconds) || 0;
          } else {
            call.durationSeconds = 0;
          }

          await call.save();
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
                  status === "completed" && call.callStartedAt
                    ? Math.max(
                        0,
                        Math.floor((ended - call.callStartedAt) / 1000)
                      )
                    : 0,
                billedSeconds: billable,
                callStartTime: call.callInitiatedAt || call.callStartedAt,
                callEndTime: ended,
                callStatus: status,
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
          await call.save();
        }

        console.log("[CALL UPDATED]", {
          callId: String(call._id),
          status: call.status,
          hangupCause: call.hangupCause || null,
          hangupCauseCode: call.hangupCauseCode || null,
        });

        return res.json({ success: true, call });
      }

      if (
        status === "failed" &&
        ["queued", "initiated", "dialing", "ringing"].includes(call.status)
      ) {
        call.status = "failed";
        call.callEndedAt = call.callEndedAt || new Date();
        call.hangupCause = call.hangupCause || "client_abort";
      } else {
        return res.status(400).json({
          success: false,
          error: "Call status is server-controlled",
        });
      }
    }

    if (durationSeconds !== undefined) call.durationSeconds = durationSeconds;
    if (callEndedAt) call.callEndedAt = new Date(callEndedAt);
    if (callStartedAt) call.callStartedAt = new Date(callStartedAt);
    if (telnyxCallControlId !== undefined) {
      call.telnyxCallControlId = telnyxCallControlId || null;
    }

    await call.save();

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

    call.status = "in-progress";
    call.callStartedAt = new Date();
    await call.save();

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
