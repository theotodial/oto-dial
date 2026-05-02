import express from "express";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import { recordSmsCost } from "../../services/telnyxCostCalculator.js";
import { processInboundSms } from "../../services/smsInboundProcessor.js";
import { handleTelnyxMessagingLifecycle } from "../../services/telnyxMessagingLifecycleWebhook.js";
import { buildSmsThreadKey, normalizeThreadPhone } from "../../utils/smsThreadKey.js";
import {
  claimWebhookEvent,
  extractWebhookEnvelope,
} from "../../agents/shared/webhookIdempotency.js";

const INBOUND_OPT_OUT_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);

const router = express.Router();

// Normalize phone number for comparison (strip + and spaces)
const normalizePhone = (phone) => {
  if (!phone) return "";
  return phone.replace(/[\s\-\(\)\+]/g, "");
};

const buildOwnedNumberCandidates = (rawTo) => {
  const normalized = normalizeThreadPhone(rawTo);
  if (!normalized) return [];
  const digits = normalized.replace(/\D/g, "");
  return Array.from(new Set([normalized, digits, `+${digits}`]));
};

/**
 * TELNYX SMS WEBHOOK
 * Handles inbound SMS messages
 */
router.post("/", async (req, res) => {
  try {
    const envelope = extractWebhookEnvelope(req.body);
    const claim = await claimWebhookEvent({
      provider: "telnyx:sms",
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      payload: envelope.payload,
    });
    if (claim.duplicate) {
      return res.json({ received: true, duplicate: true });
    }

    const lifecycle = await handleTelnyxMessagingLifecycle(req);
    if (lifecycle.handled) {
      return res.json({ received: true });
    }

    console.log("📱 SMS WEBHOOK RECEIVED");
    console.log("📱 Headers:", JSON.stringify(req.headers, null, 2));
    console.log("📱 Body:", JSON.stringify(req.body, null, 2));
    
    // Handle different webhook payload formats
    const payload = req.body?.data?.payload || req.body?.payload || req.body;
    const eventType = req.body?.data?.event_type || req.body?.event_type;

    // Only process message.received events (delivery lifecycle handled above)
    if (eventType && eventType !== "message.received") {
      console.log("📱 Ignoring non-inbound SMS event:", eventType);
      return res.json({ received: true });
    }

    if (!payload) {
      console.log("📱 No payload in webhook");
      return res.json({ received: true });
    }

    // Extract data from different possible formats
    const toNumber = payload.to?.[0]?.phone_number || payload.to;
    const fromNumber = payload.from?.phone_number || payload.from;
    const messageText = payload.text || payload.body;
    const telnyxId = payload.id;

    if (telnyxId) {
      const duplicateInbound = await SMS.findOne({
        telnyxMessageId: telnyxId,
        direction: "inbound"
      })
        .select("_id")
        .lean();

      if (duplicateInbound) {
        console.log(`📱 Duplicate inbound webhook ignored for Telnyx message ${telnyxId}`);
        return res.json({ received: true, duplicate: true });
      }
    }

    if (!toNumber || !fromNumber || !messageText) {
      console.warn("SMS webhook missing required fields:", { toNumber, fromNumber, messageText: !!messageText });
      return res.json({ received: true });
    }

    console.log(`📱 Processing inbound SMS: ${fromNumber} -> ${toNumber}`);

    const ownedNumber = normalizeThreadPhone(toNumber);
    const externalNumber = normalizeThreadPhone(fromNumber);
    const ownedCandidates = buildOwnedNumberCandidates(toNumber);
    const ownerMatches = await PhoneNumber.find({
      phoneNumber: { $in: ownedCandidates },
      status: "active",
    })
      .select("_id userId phoneNumber")
      .limit(2)
      .lean();

    if (ownerMatches.length !== 1) {
      console.error("[INBOUND SMS] ownership resolution failed", {
        to: toNumber,
        toNormalized: ownedNumber,
        candidates: ownedCandidates,
        matchedRecords: ownerMatches.length,
      });
      return res.json({ received: true, dropped: true });
    }

    const phoneNumber = ownerMatches[0];
    const userId = phoneNumber.userId;

    // Format numbers consistently for storage
    const formatPhone = (n) => n.startsWith("+") ? n : `+${n}`;

    const { sms } = await processInboundSms({
      userId,
      toNumber: formatPhone(toNumber),
      fromNumber: formatPhone(fromNumber),
      ownedNumber,
      externalNumber,
      messageText,
      telnyxId,
      carrier: payload.carrier || null,
    });

    console.log("[INBOUND SMS]", {
      from: externalNumber,
      to: ownedNumber,
      resolvedUser: String(userId),
      threadId: buildSmsThreadKey({
        userId,
        ownedNumber,
        externalNumber,
      }),
    });

    console.log(`✅ Inbound SMS saved: ${fromNumber} -> ${toNumber} (userId: ${userId || 'unknown'}) [id: ${sms._id}]`);

    if (userId) {
      try {
        const { bumpLeadScoreOnInboundReply, maybeAutoReplyInbound } = await import(
          "../../services/smsAutoReplyService.js"
        );
        await bumpLeadScoreOnInboundReply(userId, fromNumber);
        await maybeAutoReplyInbound({
          userId,
          customerFrom: formatPhone(fromNumber),
          messageText,
        });
      } catch (autoErr) {
        console.warn("Inbound SMS automation (lead/auto-reply):", autoErr?.message || autoErr);
      }

      const upper = String(messageText || "").trim().toUpperCase();
      const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean);
      const hit =
        INBOUND_OPT_OUT_KEYWORDS.has(upper) || tokens.some((t) => INBOUND_OPT_OUT_KEYWORDS.has(t));
      if (hit) {
        try {
          const { recordOptOut, markCampaignRecipientsOptedOutForUser } = await import(
            "../../services/optOutService.js"
          );
          await recordOptOut(userId, fromNumber);
          await markCampaignRecipientsOptedOutForUser(userId, fromNumber);
          console.log(`🚫 Opt-out recorded for ${fromNumber} (user ${userId})`);
        } catch (optErr) {
          console.warn("Opt-out handling failed:", optErr?.message || optErr);
        }
      }
    }

    // RECORD COST IN IMMUTABLE LEDGER (TELNYX COST ENGINE)
    // This creates a permanent cost record based on admin-defined pricing
    if (userId) {
      try {
        // Determine destination from phone numbers (default to US)
        const destination = toNumber?.startsWith('+1') || fromNumber?.startsWith('+1') ? 'US' : 'US';
        
        const costResult = await recordSmsCost(sms._id, userId, {
          telnyxMessageId: sms.telnyxMessageId || telnyxId,
          destination: destination,
          direction: 'inbound',
          status: sms.status,
          timestamp: new Date()
        });

        if (costResult.success) {
          console.log(`✅ Recorded SMS cost in ledger: $${costResult.totalCost.toFixed(6)}`);
        } else {
          console.warn(`⚠️ Could not record SMS cost: ${costResult.error}`);
        }
      } catch (costErr) {
        console.error(`❌ Error recording SMS cost:`, costErr);
        // Don't fail webhook - cost recording is non-blocking
      }
    }

    // SYNC REAL COST FROM TELNYX (CRITICAL)
    // This replaces hardcoded cost calculation with real Telnyx billing data
    if (sms.telnyxMessageId) {
      try {
        const { syncSmsCost } = await import("../../services/telnyxCostService.js");
        const syncResult = await syncSmsCost(sms._id.toString(), sms.telnyxMessageId);
        if (syncResult.success) {
          console.log(`✅ Synced real Telnyx cost for SMS ${sms.telnyxMessageId}: $${sms.cost || 0}`);
        } else {
          console.warn(`⚠️ Could not sync Telnyx cost for SMS ${sms.telnyxMessageId}: ${syncResult.error}`);
        }
      } catch (costSyncErr) {
        console.error(`❌ Error syncing SMS cost:`, costSyncErr);
        // Don't fail the webhook - mark as pending for later sync
        sms.costPending = true;
        sms.costSyncError = costSyncErr.message;
        await sms.save();
      }
    } else {
      // No Telnyx message ID yet - mark as pending
      sms.costPending = true;
      await sms.save();
    }

    // Send Web Push to user's devices (when app is closed or tab in background)
    if (userId) {
      try {
        const { sendPushToUser } = await import("../../services/pushService.js");
        const bodyPreview = (messageText || "").slice(0, 80);
        await sendPushToUser(userId, {
          title: "New message",
          body: bodyPreview ? `From ${fromNumber}: ${bodyPreview}` : `Message from ${fromNumber}`,
          data: { url: "/recents", from: fromNumber }
        });
      } catch (pushErr) {
        console.warn("Push notification error:", pushErr?.message);
      }
    }
    
    res.json({ received: true });
  } catch (err) {
    console.error("SMS webhook error:", err);
    res.json({ received: true }); // Never fail webhooks
  }
});

export default router;
