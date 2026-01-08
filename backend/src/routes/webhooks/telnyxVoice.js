import express from "express";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import User from "../../models/User.js";

const router = express.Router();

/**
 * TELNYX VOICE WEBHOOK
 * Handles answered + hangup events
 * Counts usage ONLY here (single source of truth)
 */
router.post("/voice", async (req, res) => {
  try {
    const payload = req.body?.data;
    if (!payload) {
      return res.sendStatus(200);
    }

    const event = payload.event_type;
    const callControlId = payload.payload?.call_control_id;

    if (!callControlId) {
      return res.sendStatus(200);
    }

    // ===============================
    // CALL ANSWERED
    // ===============================
    if (event === "call.answered") {
      await Call.findOneAndUpdate(
        { telnyxCallControlId: callControlId },
        {
          status: "in-progress",
          callStartedAt: new Date(),
        }
      );
    }

    // ===============================
    // CALL HANGUP
    // ===============================
    if (event === "call.hangup") {
      const call = await Call.findOne({
        telnyxCallControlId: callControlId,
      });

      if (!call || !call.callStartedAt) {
        return res.sendStatus(200);
      }

      const endedAt = new Date();
      const durationSeconds = Math.floor(
        (endedAt - call.callStartedAt) / 1000
      );

      const minutes = Math.max(1, Math.ceil(durationSeconds / 60));
      const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
      const cost = minutes * rate;

      // Update call record
      call.callEndedAt = endedAt;
      call.durationSeconds = durationSeconds;
      call.billedMinutes = minutes;
      call.cost = cost;
      call.status = "completed";
      call.hangupCause = payload.payload?.hangup_cause || "unknown";

      await call.save();

      // ===============================
      // UPDATE SUBSCRIPTION USAGE
      // ===============================
      await Subscription.findOneAndUpdate(
        { userId: call.user, status: "active" },
        {
          $inc: {
            "usage.minutesUsed": minutes,
          },
        }
      );
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Telnyx voice webhook error:", err);
    return res.sendStatus(200); // Never fail webhooks
  }
});

export default router;
