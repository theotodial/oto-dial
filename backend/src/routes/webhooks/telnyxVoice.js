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
// Handler at root since we're mounted at /api/webhooks/telnyx/voice
router.post("/", async (req, res) => {
  try {
    console.log("📞 VOICE WEBHOOK RECEIVED");
    console.log("📞 Headers:", JSON.stringify(req.headers, null, 2));
    console.log("📞 Body:", JSON.stringify(req.body, null, 2));
    
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
    if (event === "call.initiated" && callPayload.direction === "incoming") {
      const toNumber = callPayload.to;
      const fromNumber = callPayload.from;

      // Find user who owns this number
      const phoneNumber = await PhoneNumber.findOne({
        phoneNumber: toNumber,
        status: "active"
      });

      if (phoneNumber) {
        const callRecord = await Call.create({
          telnyxCallControlId: callControlId,
          user: phoneNumber.userId,
          phoneNumber: fromNumber,
          fromNumber: fromNumber,
          toNumber: toNumber,
          direction: "inbound",
          status: "ringing"
        });
        console.log(`✅ Inbound call recorded: ${fromNumber} -> ${toNumber} (userId: ${phoneNumber.userId}, callId: ${callRecord._id})`);
        
        // TODO: Here we could emit a WebSocket event or use Server-Sent Events
        // to notify the frontend about the incoming call
        // For now, the frontend will poll or rely on WebRTC client
      } else {
        console.warn(`⚠️ Inbound call to ${toNumber} but no active phone number found in database`);
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
      let cost = 0;

      // Use Telnyx-provided duration if available, otherwise calculate from timestamps
      // Telnyx webhook may provide duration_seconds in the payload
      if (callPayload.duration_seconds !== undefined) {
        durationSeconds = Number(callPayload.duration_seconds) || 0;
      } else if (call.callStartedAt) {
        // Fallback: calculate from timestamps
        durationSeconds = Math.floor((endedAt - call.callStartedAt) / 1000);
      }

      // Only calculate cost if call was answered and has duration
      if (durationSeconds > 0) {
        const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
        const minutes = durationSeconds / 60; // Use exact minutes for cost calculation
        cost = minutes * rate;
      }

      // Determine final status
      const hangupCause = callPayload.hangup_cause || "unknown";
      let finalStatus = "completed";
      
      if (!call.callStartedAt && durationSeconds === 0) {
        // Call was never answered
        finalStatus = call.direction === "inbound" ? "missed" : "failed";
      }

      // Update call record
      call.callEndedAt = endedAt;
      call.durationSeconds = durationSeconds;
      call.billedMinutes = durationSeconds / 60; // Store as decimal minutes for display
      call.cost = cost;
      call.status = finalStatus;
      call.hangupCause = hangupCause;

      await call.save();

      // ===============================
      // UPDATE SUBSCRIPTION USAGE
      // Deduct usage per SECOND (not per minute, not per call)
      // minutesUsed field stores SECONDS internally
      // ===============================
      if (durationSeconds > 0 && call.user) {
        await Subscription.findOneAndUpdate(
          { userId: call.user, status: "active" },
          {
            $inc: {
              "usage.minutesUsed": durationSeconds, // Store seconds in minutesUsed field
            },
          }
        );
        console.log(`📊 Usage deducted: ${durationSeconds} seconds for ${call.direction} call (userId: ${call.user})`);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Telnyx voice webhook error:", err);
    return res.sendStatus(200); // Never fail webhooks
  }
});

export default router;
