import express from "express";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";

const router = express.Router();

/**
 * TELNYX VOICE WEBHOOK
 * Handles call.initiated, call.answered, call.hangup events
 * Counts usage ONLY here (single source of truth)
 */
router.post("/voice", async (req, res) => {
  try {
    console.log("📞 VOICE WEBHOOK:", JSON.stringify(req.body, null, 2));
    
    const payload = req.body?.data;
    if (!payload) {
      return res.sendStatus(200);
    }

    const event = payload.event_type;
    const callControlId = payload.payload?.call_control_id;
    const callPayload = payload.payload || {};

    if (!callControlId) {
      return res.sendStatus(200);
    }

    // ===============================
    // INBOUND CALL INITIATED
    // ===============================
    if (event === "call.initiated") {
      const toNumber = callPayload.to;
      const fromNumber = callPayload.from;
      const direction = callPayload.direction;

      if (direction === "incoming") {
        // Find user who owns this number
        const phoneNumber = await PhoneNumber.findOne({
          phoneNumber: toNumber,
          status: "active"
        });

        if (phoneNumber) {
          await Call.create({
            telnyxCallControlId: callControlId,
            user: phoneNumber.userId,
            phoneNumber: fromNumber,
            fromNumber: fromNumber,
            toNumber: toNumber,
            direction: "inbound",
            status: "ringing"
          });
          console.log(`✅ Inbound call recorded: ${fromNumber} -> ${toNumber}`);
        }
      } else {
        const updated = await Call.findOneAndUpdate(
          { telnyxCallControlId: callControlId },
          {
            status: "ringing",
            fromNumber: fromNumber,
            toNumber: toNumber,
            direction: "outbound"
          }
        );

        if (!updated && fromNumber) {
          const phoneNumber = await PhoneNumber.findOne({
            phoneNumber: fromNumber,
            status: "active"
          });

          if (phoneNumber) {
            await Call.create({
              telnyxCallControlId: callControlId,
              user: phoneNumber.userId,
              phoneNumber: toNumber,
              fromNumber: fromNumber,
              toNumber: toNumber,
              direction: "outbound",
              status: "ringing"
            });
          }
        }
      }
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

      if (!call) {
        return res.sendStatus(200);
      }

      const endedAt = new Date();
      let durationSeconds = 0;
      let minutes = 0;
      let cost = 0;

      // Only calculate duration if call was answered
      if (call.callStartedAt) {
        durationSeconds = Math.floor((endedAt - call.callStartedAt) / 1000);
        minutes = Math.max(1, Math.ceil(durationSeconds / 60));
        const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
        cost = minutes * rate;
      }

      // Determine final status
      const hangupCause = callPayload.hangup_cause || "unknown";
      let finalStatus = "completed";
      
      if (!call.callStartedAt) {
        // Call was never answered
        finalStatus = call.direction === "inbound" ? "missed" : "failed";
      }

      // Update call record
      call.callEndedAt = endedAt;
      call.durationSeconds = durationSeconds;
      call.billedMinutes = minutes;
      call.cost = cost;
      call.status = finalStatus;
      call.hangupCause = hangupCause;

      await call.save();

      // ===============================
      // UPDATE SUBSCRIPTION USAGE
      // ===============================
      if (minutes > 0 && call.user) {
        await Subscription.findOneAndUpdate(
          { userId: call.user, status: "active" },
          {
            $inc: {
              "usage.minutesUsed": minutes,
            },
          }
        );
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Telnyx voice webhook error:", err);
    return res.sendStatus(200); // Never fail webhooks
  }
});

export default router;
