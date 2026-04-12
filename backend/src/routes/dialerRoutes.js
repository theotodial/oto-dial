import express from "express";
import axios from "axios";
import Call from "../models/Call.js";
import { validateCallCountryLock } from "../middleware/countryLock.js";
import { hangupTelnyxByCallDoc } from "../utils/telnyxHangup.js";

const router = express.Router();

/**
 * POST /api/dialer/call — removed (WebRTC-only outbound; use POST /api/calls + TelnyxRTC.newCall).
 */
router.post("/call", validateCallCountryLock, async (req, res) => {
  return res.status(410).json({
    success: false,
    error:
      "Server-placed outbound calls are disabled. Use in-app WebRTC from Recents or the dialer.",
  });
});

/**
 * POST /api/dialer/hangup
 * body: { callControlId, callId? }
 *
 * Best-effort hangup for Voice API initiated calls.
 */
router.post("/hangup", async (req, res) => {
  try {
    let callControlId = String(req.body?.callControlId || "").trim();
    const callId = String(req.body?.callId || "").trim();
    const apiKey = process.env.TELNYX_API_KEY?.trim();

    let record = null;
    if (callId) {
      record = await Call.findOne({ _id: callId, user: req.userId });
    }

    if (!callControlId && record?.telnyxCallControlId) {
      callControlId = String(record.telnyxCallControlId);
    }

    if (!apiKey) {
      return res.status(503).json({ success: false, error: "Telnyx not configured" });
    }

    if (record) {
      const hang = await hangupTelnyxByCallDoc(record, apiKey);
      if (!hang.ok) {
        const detail =
          hang.telnyx?.errors?.[0]?.detail ||
          hang.error ||
          "Failed to hang up call";
        console.error("DIALER HANGUP ERROR:", detail);
        return res.status(502).json({
          success: false,
          error: detail,
          telnyx: hang.telnyx,
        });
      }
      return res.json({ success: true });
    }

    if (!callControlId) {
      return res
        .status(400)
        .json({ success: false, error: "callControlId or callId required" });
    }

    await axios.post(
      `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
      {},
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({ success: true });
  } catch (err) {
    const detail =
      err?.response?.data?.errors?.[0]?.detail ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to hang up call";
    console.error("DIALER HANGUP ERROR:", detail);
    return res.status(502).json({
      success: false,
      error: err.message || detail,
      telnyx: err.response?.data,
    });
  }
});

export default router;
