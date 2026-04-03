import express from "express";
import axios from "axios";
import authenticateUser from "../middleware/authenticateUser.js";
import requireActiveSubscription from "../middleware/requireActiveSubscription.js";
import Call from "../models/Call.js";
import { validateCallCountryLock } from "../middleware/countryLock.js";
import {
  findRecentActiveCallForUser,
  normalizeCallPartyNumber,
} from "../utils/callLifecycle.js";

const router = express.Router();

router.use(authenticateUser);

router.post("/", requireActiveSubscription, async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.body.to;
  const fromNumber = req.body.fromNumber ?? null;
  const toNumber = req.body.toNumber ?? phoneNumber;
  const direction = req.body.direction === "inbound" ? "inbound" : "outbound";
  const status =
    req.body.status && ["queued", "dialing"].includes(req.body.status)
      ? req.body.status
      : "dialing";

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      error: "phoneNumber required"
    });
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
  });

  console.log("[CALL FLOW] CALL CREATED", {
    callId: String(call._id),
    userId: String(req.userId),
    direction,
    status: call.status,
    to: normalizeCallPartyNumber(toNumber || phoneNumber),
  });

  res.json({ success: true, call });
});

router.post("/:id/start", requireActiveSubscription, validateCallCountryLock, async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found"
      });
    }

    const numbers = req.subscription?.numbers || [];
    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const fromNumber = numbers[0].phoneNumber;

    console.log("[CALL FLOW] TELNYX REQUEST SENT (REST dial)", {
      callId: String(call._id),
      to: call.phoneNumber,
    });

    const response = await axios.post(
      "https://api.telnyx.com/v2/calls",
      {
        to: call.phoneNumber,
        from: fromNumber,
        connection_id: process.env.TELNYX_CONNECTION_ID
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`
        }
      }
    );

    call.status = "dialing";
    call.telnyxCallControlId = response.data.data.call_control_id || response.data.data.id;
    await call.save();

    console.log("[CALL FLOW] TELNYX CALL CONTROL ID stored", {
      callId: String(call._id),
      telnyxCallControlId: call.telnyxCallControlId,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("CALL START ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to start call"
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
    
    // Support limit
    const limit = parseInt(req.query.limit) || 100;
    
    const calls = await Call.find(query)
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

/** Single call (for frontend sync with webhook-driven status) */
router.get("/:id", async (req, res) => {
  try {
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId,
    }).lean();

    if (!call) {
      return res.status(404).json({ success: false, error: "Call not found" });
    }

    res.json({
      success: true,
      call: { ...call, id: call._id },
    });
  } catch (err) {
    console.error("GET /api/calls/:id error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch call" });
  }
});

// Update a call record
router.patch("/:id", async (req, res) => {
  try {
    const { status, durationSeconds, callEndedAt, callStartedAt, telnyxCallControlId } =
      req.body;
    
    const call = await Call.findOne({
      _id: req.params.id,
      user: req.userId
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found"
      });
    }

    // Update allowed fields
    if (status) call.status = status;
    if (durationSeconds !== undefined) call.durationSeconds = durationSeconds;
    if (callEndedAt) call.callEndedAt = new Date(callEndedAt);
    if (callStartedAt) call.callStartedAt = new Date(callStartedAt);
    if (telnyxCallControlId !== undefined) {
      call.telnyxCallControlId = telnyxCallControlId || null;
    }

    await call.save();

    console.log("[CALL FLOW] CALL STATE UPDATED (PATCH)", {
      callId: String(call._id),
      status: call.status,
    });

    res.json({ success: true, call });
  } catch (err) {
    console.error("CALL UPDATE ERROR:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update call"
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
      status: "ringing"
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

    // Update call status
    call.status = "answered";
    call.callStartedAt = new Date();
    await call.save();

    console.log(`✅ Answered incoming call ${call._id} via Call Control API`);

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
