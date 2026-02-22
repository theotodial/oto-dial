import express from "express";
import Call from "../../models/Call.js";
import Subscription from "../../models/Subscription.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import { recordCallCost } from "../../services/telnyxCostCalculator.js";
import {
  incrementUnlimitedUsageAfterSuccess,
  isUnlimitedSubscription
} from "../../services/unlimitedUsageService.js";

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
    // CALL INITIATED (INBOUND OR OUTBOUND)
    // Track initiation time for billing ring time
    // ===============================
    if (event === "call.initiated") {
      const toNumber = callPayload.to;
      const fromNumber = callPayload.from;
      const isIncoming = callPayload.direction === "incoming";

      // For inbound calls, find user who owns the receiving number
      // For outbound calls, find user who owns the calling number
      const searchNumber = isIncoming ? toNumber : fromNumber;
      
      const phoneNumber = await PhoneNumber.findOne({
        phoneNumber: searchNumber,
        status: "active"
      });

      if (phoneNumber) {
        // Check if call record already exists (for outbound calls created before webhook)
        let callRecord = await Call.findOne({
          telnyxCallControlId: callControlId
        });

        if (!callRecord) {
          callRecord = await Call.create({
            telnyxCallControlId: callControlId,
            user: phoneNumber.userId,
            phoneNumber: isIncoming ? fromNumber : toNumber,
            fromNumber: fromNumber,
            toNumber: toNumber,
            direction: isIncoming ? "inbound" : "outbound",
            status: "ringing",
            callInitiatedAt: new Date() // CRITICAL: Track initiation time for billing ring time
          });
          console.log(`✅ ${isIncoming ? 'Inbound' : 'Outbound'} call initiated: ${fromNumber} -> ${toNumber} (userId: ${phoneNumber.userId}, callId: ${callRecord._id})`);
        } else {
          // Update existing record with initiation time
          callRecord.callInitiatedAt = new Date();
          await callRecord.save();
        }
        
        // Send Web Push notification for incoming call (when app is closed or tab in background)
        if (isIncoming && phoneNumber.userId) {
          try {
            const { sendPushToUser } = await import("../../services/pushService.js");
            await sendPushToUser(phoneNumber.userId, {
              title: "Incoming call",
              body: `Call from ${fromNumber}`,
              data: { url: "/recents", type: "call", from: fromNumber, callId: callRecord._id.toString() }
            });
          } catch (pushErr) {
            console.warn("Push notification error for incoming call:", pushErr?.message);
          }
        }
      } else {
        console.warn(`⚠️ Call ${isIncoming ? 'to' : 'from'} ${searchNumber} but no active phone number found in database`);
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
    // CRITICAL: Deduct usage for ALL calls, including unanswered/ringing
    // Telnyx bills for ring time, so we must deduct usage for ring time too
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
      let billableSeconds = 0;
      let cost = 0;

      // PRIORITY 1: Use Telnyx-provided billable_time or duration_seconds (most accurate)
      // Telnyx webhook provides billable_time in seconds for what they actually bill
      if (callPayload.billable_time !== undefined) {
        billableSeconds = Number(callPayload.billable_time) || 0;
        durationSeconds = billableSeconds;
        console.log(`📞 Telnyx billable_time: ${billableSeconds} seconds`);
      } else if (callPayload.duration_seconds !== undefined) {
        durationSeconds = Number(callPayload.duration_seconds) || 0;
        billableSeconds = durationSeconds;
        console.log(`📞 Telnyx duration_seconds: ${durationSeconds} seconds`);
      } 
      // PRIORITY 2: Calculate from call initiation to hangup (includes ring time)
      else if (call.callInitiatedAt) {
        const totalSeconds = Math.floor((endedAt - call.callInitiatedAt) / 1000);
        durationSeconds = totalSeconds;
        billableSeconds = totalSeconds; // Telnyx bills for ring time
        console.log(`📞 Calculated duration from initiation: ${durationSeconds} seconds (includes ring time)`);
      }
      // PRIORITY 3: Fallback to answered time (if call was answered)
      else if (call.callStartedAt) {
        durationSeconds = Math.floor((endedAt - call.callStartedAt) / 1000);
        billableSeconds = durationSeconds;
        console.log(`📞 Calculated duration from answer: ${durationSeconds} seconds`);
      }
      // PRIORITY 4: Minimum 1 second for any call attempt (safety fallback)
      else {
        durationSeconds = 1;
        billableSeconds = 1;
        console.log(`⚠️ No timestamps found, using minimum 1 second billing`);
      }

      // Calculate cost (for record keeping)
      if (billableSeconds > 0) {
        const rate = Number(process.env.CALL_RATE_PER_MINUTE || 0.0065);
        const minutes = billableSeconds / 60; // Use exact decimal minutes
        cost = minutes * rate;
      }

      // Determine final status
      const hangupCause = callPayload.hangup_cause || "unknown";
      let finalStatus = "completed";
      
      if (!call.callStartedAt) {
        // Call was never answered (ringing only)
        finalStatus = call.direction === "inbound" ? "missed" : "failed";
        console.log(`📞 Call ${finalStatus}: ${billableSeconds} seconds of ring time billed`);
      } else {
        console.log(`📞 Call completed: ${billableSeconds} seconds billed`);
      }

      // Calculate ringing vs answered duration
      const ringingDuration = call.callStartedAt && call.callInitiatedAt
        ? Math.floor((call.callStartedAt - call.callInitiatedAt) / 1000)
        : (call.callInitiatedAt ? Math.floor((endedAt - call.callInitiatedAt) / 1000) : 0);
      
      const answeredDuration = call.callStartedAt
        ? Math.floor((endedAt - call.callStartedAt) / 1000)
        : 0;

      // Calculate cost per second
      const costPerSecond = billableSeconds > 0 ? cost / billableSeconds : 0;

      // Update call record with enhanced cost tracking
      call.callEndedAt = endedAt;
      call.durationSeconds = durationSeconds;
      call.billedMinutes = billableSeconds / 60; // Store as decimal minutes for display
      call.cost = cost;
      call.costPerSecond = costPerSecond;
      call.ringingDuration = ringingDuration;
      call.answeredDuration = answeredDuration;
      call.status = finalStatus;
      call.hangupCause = hangupCause;
      call.telnyxCallId = callPayload.call_leg_id || callPayload.id || null;
      call.billedSeconds = billableSeconds;

      await call.save();

      // RECORD COST IN IMMUTABLE LEDGER (TELNYX COST ENGINE)
      // This creates a permanent cost record based on admin-defined pricing
      if (billableSeconds > 0 && call.user) {
        try {
          // Determine destination from phone numbers
          const destination = call.toNumber?.startsWith('+1') || call.fromNumber?.startsWith('+1') ? 'US' : 'US'; // Default to US, can be enhanced
          
          const costResult = await recordCallCost(call._id, call.user, {
            telnyxCallId: call.telnyxCallId || callPayload.call_leg_id || callPayload.id,
            from: call.fromNumber,
            to: call.toNumber,
            destination: destination,
            direction: call.direction,
            ringingSeconds: ringingDuration,
            answeredSeconds: answeredDuration,
            billedSeconds: billableSeconds,
            callStartTime: call.callInitiatedAt || call.callStartedAt,
            callEndTime: endedAt,
            callStatus: finalStatus
          });

          if (costResult.success) {
            console.log(`✅ Recorded call cost in ledger: $${costResult.totalCost.toFixed(6)} (${billableSeconds}s)`);
          } else {
            console.warn(`⚠️ Could not record call cost: ${costResult.error}`);
          }
        } catch (costErr) {
          console.error(`❌ Error recording call cost:`, costErr);
          // Don't fail webhook - cost recording is non-blocking
        }
      }

      // SYNC REAL COST FROM TELNYX (CRITICAL)
      // This replaces hardcoded cost calculation with real Telnyx billing data
      if (call.telnyxCallId) {
        try {
          const { syncCallCost } = await import("../../services/telnyxCostService.js");
          const syncResult = await syncCallCost(call._id.toString(), call.telnyxCallId);
          if (syncResult.success) {
            console.log(`✅ Synced real Telnyx cost for call ${call.telnyxCallId}: $${call.cost || 0}`);
          } else {
            console.warn(`⚠️ Could not sync Telnyx cost for call ${call.telnyxCallId}: ${syncResult.error}`);
          }
        } catch (costSyncErr) {
          console.error(`❌ Error syncing call cost:`, costSyncErr);
          // Don't fail the webhook - mark as pending for later sync
          call.costPending = true;
          call.costSyncError = costSyncErr.message;
          await call.save();
        }
      } else {
        // No Telnyx call ID yet - mark as pending
        call.costPending = true;
        await call.save();
      }

      // ===============================
      // UPDATE SUBSCRIPTION USAGE
      // CRITICAL: Deduct usage for ALL calls (answered + unanswered/ringing)
      // Telnyx bills for ring time, so we must deduct usage for ring time
      // Deduct usage per SECOND (not per minute, not per call)
      // minutesUsed field stores SECONDS internally
      // ===============================
      if (billableSeconds > 0 && call.user) {
        const usageCountLock = await Call.updateOne(
          {
            _id: call._id,
            usageCountedAt: null
          },
          {
            $set: {
              usageCountedAt: new Date(),
              usageCountedSeconds: billableSeconds
            }
          }
        );

        if (usageCountLock.modifiedCount === 0) {
          console.log(
            `⏭️ Usage already counted for call ${call._id}, skipping duplicate webhook charge`
          );
          return res.sendStatus(200);
        }

        // Get subscription before update to log remaining balance
        const subscription = await Subscription.findOne({
          userId: call.user,
          status: "active"
        });

        if (subscription) {
          if (isUnlimitedSubscription(subscription)) {
            const usageResult = await incrementUnlimitedUsageAfterSuccess({
              subscriptionId: subscription._id,
              userId: call.user,
              channel: "voice_hangup",
              minutesIncrementSeconds: billableSeconds
            });

            if (!usageResult.success && usageResult.limitReached) {
              console.warn(
                `⚠️ Voice usage increment hit Unlimited threshold for user ${call.user}`
              );
            }
          } else {
            const secondsUsedBefore = subscription.usage?.minutesUsed || 0;
            const minutesTotal = (subscription.limits?.minutesTotal || 2500) + (subscription.addons?.minutes || 0);
            const secondsTotal = minutesTotal * 60;
            const secondsRemainingBefore = Math.max(0, secondsTotal - secondsUsedBefore);
            const minutesRemainingBefore = secondsRemainingBefore / 60;

            // Deduct usage
            await Subscription.findOneAndUpdate(
              { userId: call.user, status: "active" },
              {
                $inc: {
                  "usage.minutesUsed": billableSeconds // Store seconds in minutesUsed field
                }
              }
            );

            // Calculate remaining after deduction
            const secondsUsedAfter = secondsUsedBefore + billableSeconds;
            const secondsRemainingAfter = Math.max(0, secondsTotal - secondsUsedAfter);
            const minutesRemainingAfter = secondsRemainingAfter / 60;

            // Enhanced logging for debugging and cost tracking
            console.log(`📊 USAGE DEDUCTED:`);
            console.log(`   Call: ${call.direction} ${call.fromNumber} -> ${call.toNumber}`);
            console.log(`   Duration: ${billableSeconds} seconds (${(billableSeconds / 60).toFixed(3)} minutes)`);
            console.log(`   Status: ${finalStatus}${!call.callStartedAt ? ' (unanswered/ringing)' : ''}`);
            console.log(`   User: ${call.user}`);
            console.log(`   Before: ${secondsUsedBefore}s used, ${minutesRemainingBefore.toFixed(2)} minutes remaining`);
            console.log(`   After: ${secondsUsedAfter}s used, ${minutesRemainingAfter.toFixed(2)} minutes remaining`);
          }
        } else {
          console.warn(`⚠️ No active subscription found for user ${call.user} - usage not deducted`);
        }
      } else if (!call.user) {
        console.warn(`⚠️ Call has no user associated - usage not deducted`);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("Telnyx voice webhook error:", err);
    return res.sendStatus(200); // Never fail webhooks
  }
});

export default router;
