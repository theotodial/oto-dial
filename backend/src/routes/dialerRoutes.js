import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";
import { validateCallCountryLock } from "../middleware/countryLock.js";
import { findRecentActiveCallForUser } from "../utils/callLifecycle.js";

const router = express.Router();

/**
 * POST /api/dialer/call
 * body: { to }
 */
router.post("/call", validateCallCountryLock, async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Destination number required" });
    }

    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    // Check remaining seconds > 0 before allowing outgoing call
    // minutesRemaining is in minutes (with decimals), convert to seconds
    const minutesRemaining = req.subscription.minutesRemaining || 0;
    const remainingSeconds = minutesRemaining * 60;
    if (remainingSeconds <= 0) {
      return res.status(403).json({ 
        error: "No minutes remaining. Please upgrade your plan or wait for your next billing cycle." 
      });
    }

    const inFlight = await findRecentActiveCallForUser(req.userId);
    if (inFlight) {
      console.warn("[CALL FLOW] BLOCK /api/dialer/call — call already in progress", {
        userId: String(req.userId),
        existingId: String(inFlight._id),
      });
      return res.status(409).json({ error: "Call already in progress" });
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
    console.log("[CALL FLOW] TELNYX REQUEST SENT (dialer dial)", { to, from: fromNumber });

    const telnyxCall = await telnyx.calls.dial({
      to,
      from: fromNumber,
      connection_id: process.env.TELNYX_CONNECTION_ID
    });

    // Create call record in database
    // CRITICAL: Set callInitiatedAt to track ring time for billing
    const callRecord = await Call.create({
      user: req.userId,
      phoneNumber: to,
      fromNumber: fromNumber,
      toNumber: to,
      direction: "outbound",
      status: "dialing",
      telnyxCallControlId: telnyxCall.data.call_control_id,
      callInitiatedAt: new Date() // Track initiation time for billing ring time
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

export default router;
