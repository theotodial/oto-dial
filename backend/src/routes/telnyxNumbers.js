import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import PhoneNumber from "../models/PhoneNumber.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/numbers/buy
 */
router.post("/buy", async (req, res) => {
  try {
    if (!req.subscription || !req.subscription.active) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    if (req.subscription.numbers.length) {
      return res.status(400).json({ error: "Number already assigned" });
    }

    const telnyx = getTelnyx();
    const user = await User.findById(req.user._id);

    // 1️⃣ Ensure messaging profile
    if (!user.messagingProfileId) {
      const profile = await telnyx.messaging.messagingProfiles.create({
        name: `user-${user._id}`
      });
      user.messagingProfileId = profile.data.id;
      await user.save();
    }

    // 2️⃣ Buy number
    const available = await telnyx.availablePhoneNumbers.list({
      filter: { country_code: "US", features: ["voice", "sms"] },
      page: { size: 1 }
    });

    if (!available.data.length) {
      return res.status(400).json({ error: "No numbers available" });
    }

    const phoneNumber = available.data[0].phone_number;

    await telnyx.numberOrders.create({
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: process.env.TELNYX_CONNECTION_ID
    });

    // 3️⃣ Attach number to user profile
    await telnyx.messaging.messagingProfiles.phoneNumbers.create(
      user.messagingProfileId,
      { phone_number: phoneNumber }
    );

    // 4️⃣ Save
    await PhoneNumber.create({
      userId: user._id,
      phoneNumber,
      status: "active",
      inboundMessagingProfileId: user.messagingProfileId
    });

    res.json({ success: true, phoneNumber });
  } catch (err) {
    console.error("BUY NUMBER ERROR:", err);
    res.status(500).json({ error: "Failed to buy number" });
  }
});

export default router;
