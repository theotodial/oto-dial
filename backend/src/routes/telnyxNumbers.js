import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import authenticateUser from "../middleware/authenticateUser.js";
import User from "../models/User.js";

const router = express.Router();

/**
 * POST /api/numbers/buy
 * (kept for frontend compatibility)
 */
router.post("/buy", authenticateUser, async (req, res) => {
  try {
    const telnyx = getTelnyx();
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

    const user = await User.findById(req.user.id);

    if (!user || !user.subscriptionActive) {
      return res.status(403).json({ error: "Active subscription required" });
    }

    if (user.telnyxNumber) {
      return res.status(400).json({ error: "Number already assigned" });
    }

    // 1️⃣ Search numbers
    const numbers = await telnyx.availablePhoneNumbers.list({
      filter: {
        country_code: "US",
        features: ["voice", "sms"]
      },
      page: { size: 1 }
    });

    if (!numbers.data.length) {
      return res.status(400).json({ error: "No numbers available" });
    }

    const phoneNumber = numbers.data[0].phone_number;

    // 2️⃣ Buy number
    await telnyx.numberOrders.create({
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: process.env.TELNYX_CONNECTION_ID
    });

    // 3️⃣ Save
    user.telnyxNumber = phoneNumber;
    await user.save();

    res.json({
      success: true,
      phoneNumber
    });
  } catch (err) {
    console.error("BUY NUMBER ERROR:", err);
    res.status(500).json({ error: "Failed to buy number" });
  }
});

export default router;
