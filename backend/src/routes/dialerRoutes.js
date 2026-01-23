import express from "express";
import axios from "axios";
import { getTelnyx } from "../../config/telnyx.js";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";

const router = express.Router();
const ACTIVE_STATUSES = ["queued", "dialing", "ringing", "in-progress", "answered"];
const CALL_STATUSES = new Set([
  "queued",
  "dialing",
  "ringing",
  "in-progress",
  "answered",
  "completed",
  "failed",
  "missed"
]);

/**
 * POST /api/dialer/call
 * body: { to }
 */
router.post("/call", async (req, res) => {
  try {
    const { to, useWebrtc, callControlId } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Destination number required" });
    }

    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    if (req.subscription.minutesRemaining <= 0) {
      return res.status(403).json({ error: "No minutes remaining" });
    }

    // Get user's phone numbers
    let numbers = req.subscription.numbers || [];
    
    // Fallback: query PhoneNumber directly
    if (!numbers.length) {
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId,
        status: "active"
      }).lean();
      numbers = phoneNumbers.map(n => ({ phoneNumber: n.phoneNumber }));
    }

    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const fromNumber = numbers[0].phoneNumber;

    if (useWebrtc) {
      const callRecord = await Call.create({
        user: req.userId,
        phoneNumber: to,
        fromNumber: fromNumber,
        toNumber: to,
        direction: "outbound",
        status: "dialing",
        telnyxCallControlId: callControlId || null
      });

      return res.json({
        success: true,
        callId: callRecord._id,
        callControlId: callRecord.telnyxCallControlId
      });
    }

    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    // Telnyx SDK v4 uses calls.dial() not calls.create()
    const telnyxCall = await telnyx.calls.dial({
      to,
      from: fromNumber,
      connection_id: process.env.TELNYX_CONNECTION_ID
    });

    // Create call record in database
    const callRecord = await Call.create({
      user: req.userId,
      phoneNumber: to,
      fromNumber: fromNumber,
      toNumber: to,
      direction: "outbound",
      status: "dialing",
      telnyxCallControlId: telnyxCall.data.call_control_id
    });

    return res.json({
      success: true,
      callControlId: telnyxCall.data.call_control_id,
      callId: callRecord._id
    });
  } catch (err) {
    console.error("DIALER ERROR:", err);
    res.status(500).json({ error: "Call failed" });
  }
});

/**
 * GET /api/dialer/webrtc/token
 * Returns Telnyx WebRTC token + active from number
 */
router.get("/webrtc/token", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    if (req.subscription.minutesRemaining <= 0) {
      return res.status(403).json({ error: "No minutes remaining" });
    }

    if (!process.env.TELNYX_API_KEY) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    const connectionId =
      process.env.TELNYX_WEBRTC_CONNECTION_ID || process.env.TELNYX_CONNECTION_ID;

    if (!connectionId) {
      return res.status(503).json({ error: "Telnyx WebRTC connection not configured" });
    }

    // Get user's phone numbers
    let numbers = req.subscription.numbers || [];

    if (!numbers.length) {
      const phoneNumbers = await PhoneNumber.find({
        userId: req.userId,
        status: "active"
      }).lean();
      numbers = phoneNumbers.map(n => ({ phoneNumber: n.phoneNumber }));
    }

    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const fromNumber = numbers[0].phoneNumber;

    const tokenUrl =
      process.env.TELNYX_WEBRTC_TOKEN_URL ||
      "https://api.telnyx.com/v2/webrtc/tokens";

    const tokenResponse = await axios.post(
      tokenUrl,
      {
        connection_id: connectionId,
        ttl: 3600,
        client_name: `user-${req.userId}`
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const token =
      tokenResponse.data?.data?.token || tokenResponse.data?.token || null;

    if (!token) {
      return res.status(500).json({ error: "Failed to create WebRTC token" });
    }

    return res.json({ success: true, token, fromNumber, expiresIn: 3600 });
  } catch (err) {
    console.error("WEBRTC TOKEN ERROR:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to create WebRTC token" });
  }
});

/**
 * GET /api/dialer/active
 * Returns most recent active call for user
 */
router.get("/active", async (req, res) => {
  try {
    const activeCall = await Call.findOne({
      user: req.userId,
      status: { $in: ACTIVE_STATUSES }
    }).sort({ createdAt: -1 });

    return res.json({ success: true, call: activeCall || null });
  } catch (err) {
    console.error("DIALER ACTIVE CALL ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch active call" });
  }
});

/**
 * GET /api/dialer/calls/:id
 * Lookup call by database ID or call control ID
 */
router.get("/calls/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const call = await Call.findOne({
      user: req.userId,
      $or: [{ _id: id }, { telnyxCallControlId: id }]
    });

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    return res.json({ success: true, call });
  } catch (err) {
    console.error("DIALER CALL LOOKUP ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch call" });
  }
});

/**
 * POST /api/dialer/call/:callControlId/answer
 * Answers an inbound call
 */
router.post("/call/:callControlId/answer", async (req, res) => {
  try {
    const { callControlId } = req.params;
    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    await telnyx.calls.answer(callControlId);

    await Call.findOneAndUpdate(
      { telnyxCallControlId: callControlId, user: req.userId },
      { status: "in-progress", callStartedAt: new Date() }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("DIALER ANSWER ERROR:", err);
    return res.status(500).json({ error: "Failed to answer call" });
  }
});

/**
 * POST /api/dialer/call/:callControlId/hangup
 * Ends an active call
 */
router.post("/call/:callControlId/hangup", async (req, res) => {
  try {
    const { callControlId } = req.params;
    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    await telnyx.calls.hangup(callControlId);

    const call = await Call.findOne({
      telnyxCallControlId: callControlId,
      user: req.userId
    });

    if (call) {
      call.callEndedAt = new Date();
      call.status = call.callStartedAt ? "completed" : "failed";
      await call.save();
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("DIALER HANGUP ERROR:", err);
    return res.status(500).json({ error: "Failed to hang up call" });
  }
});

/**
 * POST /api/dialer/call/:id/control
 * Attach call control ID to a logged call
 */
router.post("/call/:id/control", async (req, res) => {
  try {
    const { id } = req.params;
    const { callControlId } = req.body;

    if (!callControlId) {
      return res.status(400).json({ error: "callControlId required" });
    }

    const call = await Call.findOneAndUpdate(
      { _id: id, user: req.userId },
      { telnyxCallControlId: callControlId },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    return res.json({ success: true, call });
  } catch (err) {
    console.error("DIALER CALL CONTROL ERROR:", err);
    return res.status(500).json({ error: "Failed to update call control ID" });
  }
});

/**
 * PATCH /api/dialer/call/:id/status
 * Update call status from WebRTC events
 */
router.patch("/call/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, callControlId } = req.body;

    if (!CALL_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const call = await Call.findOne({ _id: id, user: req.userId });
    if (!call) {
      return res.status(404).json({ error: "Call not found" });
    }

    call.status = status;
    if (callControlId && !call.telnyxCallControlId) {
      call.telnyxCallControlId = callControlId;
    }
    if (status === "in-progress" && !call.callStartedAt) {
      call.callStartedAt = new Date();
    }
    if ((status === "completed" || status === "failed" || status === "missed") && !call.callEndedAt) {
      call.callEndedAt = new Date();
    }

    await call.save();
    return res.json({ success: true, call });
  } catch (err) {
    console.error("DIALER STATUS UPDATE ERROR:", err);
    return res.status(500).json({ error: "Failed to update call status" });
  }
});

export default router;
