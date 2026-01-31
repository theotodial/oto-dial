import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";

const router = express.Router();

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

    // Check remaining seconds > 0 before allowing outgoing call
    // minutesRemaining is in minutes (with decimals), convert to seconds
    const minutesRemaining = req.subscription.minutesRemaining || 0;
    const remainingSeconds = minutesRemaining * 60;
    if (remainingSeconds <= 0) {
      return res.status(403).json({ 
        error: "No minutes remaining. Please upgrade your plan or wait for your next billing cycle." 
      });
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

export default router;
