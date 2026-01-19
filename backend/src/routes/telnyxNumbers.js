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

      // Ensure messaging profile
      if (!user.messagingProfileId) {
        const profile = await telnyx.messaging.messagingProfiles.create({
          name: `user-${user._id}`,
          whitelisted_destinations: ["US"]
        });

        user.messagingProfileId = profile.data.id;
        await user.save();
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

export default router;
