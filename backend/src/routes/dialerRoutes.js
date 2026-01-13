import express from "express";
import { getTelnyx } from "../../config/telnyx.js";

const router = express.Router();

/**
 * POST /api/dialer/call
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

    const numbers = req.subscription.numbers || [];
    if (!numbers.length) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    const fromNumber = numbers[0].phoneNumber;

    const call = await telnyx.calls.create({
      to,
      from: fromNumber,
      connection_id: process.env.TELNYX_CONNECTION_ID
    });

    res.json({
      success: true,
      callControlId: call.data.call_control_id
    });
  } catch (err) {
    console.error("DIALER ERROR:", err);
    res.status(500).json({ error: "Call failed" });
  }
});

export default router;
