import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import loadSubscription from "../middleware/loadSubscription.js";
import getTelnyxClient from "../services/telnyxService.js";
import PhoneNumber from "../models/PhoneNumber.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/numbers/buy
 */
router.post(
  "/buy",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      // HARD STOP — LIMIT CHECK
      if (req.subscription.numbers.length >= 1) {
        return res.status(400).json({ error: "Number limit reached" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ensure messaging profile with webhook URL
      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!user.messagingProfileId) {
        const profileData = {
          name: `user-${user._id}`,
          whitelisted_destinations: ["US", "CA"]
        };

        // Add webhook URL if backend URL is configured
        if (webhookUrl) {
          profileData.webhook_url = webhookUrl;
          profileData.webhook_failover_url = webhookUrl;
          profileData.webhook_api_version = "2";
        }

        const profile = await telnyx.messaging.messagingProfiles.create(profileData);

        user.messagingProfileId = profile.data.id;
        await user.save();
        
        console.log(`✅ Created messaging profile ${profile.data.id} for user ${user._id}`);
        if (webhookUrl) {
          console.log(`✅ Webhook URL set to: ${webhookUrl}`);
        } else {
          console.warn(`⚠️ No BACKEND_URL set - inbound SMS won't work!`);
        }
      } else {
        // Update existing profile with webhook URL if not set
        if (webhookUrl) {
          try {
            await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
              webhook_url: webhookUrl,
              webhook_failover_url: webhookUrl,
              webhook_api_version: "2"
            });
            console.log(`✅ Updated webhook URL for existing profile ${user.messagingProfileId}`);
          } catch (updateErr) {
            console.warn(`⚠️ Could not update messaging profile webhook:`, updateErr.message);
          }
        }
      }

      // Find number
      const available = await telnyx.availablePhoneNumbers.list({
        filter: { country_code: "US", features: ["voice", "sms"] },
        page: { size: 1 }
      });

      if (!available.data || available.data.length === 0) {
        return res.status(400).json({ error: "No numbers available" });
      }

      const phoneNumber = available.data[0].phone_number;

      // BUY NUMBER (ONLY AFTER ALL CHECKS PASSED)
      const order = await telnyx.numberOrders.create({
        phone_numbers: [{ phone_number: phoneNumber }]
      });

      // SAVE IMMEDIATELY
      await PhoneNumber.create({
        userId: user._id,
        phoneNumber,
        telnyxPhoneNumberId: order.data.id,
        messagingProfileId: user.messagingProfileId,
        status: "active"
      });

      // ATTACH TO MESSAGING PROFILE
      await telnyx.messaging.messagingProfiles.phoneNumbers.create(
        user.messagingProfileId,
        { phone_number: phoneNumber }
      );

      res.json({ success: true, phoneNumber });
    } catch (err) {
      console.error("BUY NUMBER ERROR:", err);
      res.status(500).json({ error: "Failed to buy number" });
    }
  }
);

/**
 * POST /api/numbers/fix-messaging
 * Fix messaging profile webhook URL for existing users
 */
router.post(
  "/fix-messaging",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.messagingProfileId) {
        return res.status(400).json({ error: "No messaging profile found. Buy a number first." });
      }

      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!webhookUrl) {
        return res.status(500).json({ 
          error: "BACKEND_URL not configured. Cannot set webhook URL.",
          hint: "Set BACKEND_URL environment variable to your public API URL"
        });
      }

      // Update the messaging profile with webhook URL
      const updated = await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
        webhook_url: webhookUrl,
        webhook_failover_url: webhookUrl,
        webhook_api_version: "2"
      });

      console.log(`✅ Fixed messaging profile ${user.messagingProfileId} for user ${user._id}`);
      console.log(`✅ Webhook URL: ${webhookUrl}`);

      res.json({ 
        success: true, 
        message: "Messaging profile updated",
        messagingProfileId: user.messagingProfileId,
        webhookUrl: webhookUrl
      });
    } catch (err) {
      console.error("FIX MESSAGING ERROR:", err);
      res.status(500).json({ error: "Failed to fix messaging profile", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/check-messaging
 * Check messaging profile status
 */
router.get(
  "/check-messaging",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user || !user.messagingProfileId) {
        return res.json({ 
          success: true,
          hasProfile: false,
          message: "No messaging profile configured"
        });
      }

      // Get the messaging profile details from Telnyx
      const profile = await telnyx.messaging.messagingProfiles.retrieve(user.messagingProfileId);
      
      const phone = await PhoneNumber.findOne({ userId: user._id, status: "active" });

      res.json({ 
        success: true,
        hasProfile: true,
        messagingProfileId: user.messagingProfileId,
        webhookUrl: profile.data.webhook_url || null,
        webhookApiVersion: profile.data.webhook_api_version || null,
        phoneNumber: phone?.phoneNumber || null,
        phoneNumberHasProfile: !!phone?.messagingProfileId,
        expectedWebhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
          : "BACKEND_URL not set"
      });
    } catch (err) {
      console.error("CHECK MESSAGING ERROR:", err);
      res.status(500).json({ error: "Failed to check messaging profile", details: err.message });
    }
  }
);

export default router;
