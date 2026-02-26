import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import axios from "axios";
import Call from "../models/Call.js";
import PhoneNumber from "../models/PhoneNumber.js";
import { validateCallCountryLock } from "../middleware/countryLock.js";
import {
  checkUnlimitedUsageBeforeAction,
  createSuspiciousActivityErrorPayload,
  isUnlimitedSubscription
} from "../services/unlimitedUsageService.js";

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

    const unlimitedGate = await checkUnlimitedUsageBeforeAction({
      subscriptionId: req.subscription.id,
      userId: req.userId,
      channel: "dialer_call_start"
    });

    if (!unlimitedGate.allowed) {
      return res.status(403).json(createSuspiciousActivityErrorPayload());
    }

    const unlimitedPlan = isUnlimitedSubscription(
      unlimitedGate.subscription || req.subscription
    );

    // Legacy plans keep remaining-minute based gating.
    const minutesRemaining = req.subscription.minutesRemaining || 0;
    const remainingSeconds = minutesRemaining * 60;
    if (!unlimitedPlan && remainingSeconds <= 0) {
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

/**
 * POST /api/dialer/hangup
 * body: { callControlId, callId? }
 *
 * Best-effort hangup for Voice API initiated calls.
 */
router.post("/hangup", async (req, res) => {
  try {
    const callControlId = String(req.body?.callControlId || "").trim();
    const callId = String(req.body?.callId || "").trim();

    if (!callControlId) {
      return res.status(400).json({ success: false, error: "callControlId required" });
    }

    if (!process.env.TELNYX_API_KEY) {
      return res.status(503).json({ success: false, error: "Telnyx not configured" });
    }

    await axios.post(
      `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
      {},
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Non-blocking best-effort local record update (webhook is source of truth).
    if (callId) {
      try {
        await Call.updateOne(
          { _id: callId, user: req.userId },
          { $set: { status: "failed", callEndedAt: new Date() } }
        );
      } catch (updateErr) {
        console.warn("Dialer hangup: could not update call record:", updateErr?.message || updateErr);
      }
    }

    return res.json({ success: true });
  } catch (err) {
    const detail =
      err?.response?.data?.errors?.[0]?.detail ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to hang up call";
    console.error("DIALER HANGUP ERROR:", detail);
    return res.status(502).json({ success: false, error: detail });
  }
});

export default router;
