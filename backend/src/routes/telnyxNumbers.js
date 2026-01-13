import express from "express";
import { getTelnyx } from "../../config/telnyx.js";
import PhoneNumber from "../models/PhoneNumber.js";

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
    if (!telnyx) {
      return res.status(503).json({ error: "Telnyx not configured" });
    }

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

    await telnyx.numberOrders.create({
      phone_numbers: [{ phone_number: phoneNumber }],
      connection_id: process.env.TELNYX_CONNECTION_ID
    });

    await PhoneNumber.create({
      userId: req.user._id,
      phoneNumber,
      status: "active"
    });

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
