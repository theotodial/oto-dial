import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import { getTelnyx } from "../../config/telnyx.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/dialer/call
 */
router.post("/call", authenticateUser, async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) {
      return res.status(400).json({ error: "Destination number required" });
    }

    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    const user = await User.findById(req.user.id);

    if (!user.subscriptionActive) {
      return res.status(403).json({ error: "Subscription required" });
    }

    if (!user.telnyxNumber) {
      return res.status(400).json({ error: "No phone number assigned" });
    }

    // 🔥 Place call
    const call = await telnyx.calls.create({
      to,
      from: user.telnyxNumber,
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
