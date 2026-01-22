import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";

const router = express.Router();
const ACTIVE_STATUSES = ["queued", "dialing", "ringing", "in-progress", "answered"];

/**
 * POST /api/dialer/call
 * body: { to }
 */
router.post("/call", async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Destination number required" });
    }

    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    if (req.subscription.minutesRemaining <= 0) {
      return res.status(403).json({ error: "No minutes remaining" });
    }

    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
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

    res.json({
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

export default router;
