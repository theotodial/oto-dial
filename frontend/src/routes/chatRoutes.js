import express from "express";
import Message from "../models/Message.js";
import telnyx from "../lib/telnyx.js";
import NumberModel from "../models/Number.js";

const router = express.Router();

/**
 * GET CHAT HISTORY
 * GET /api/chat/:user_id
 */
router.get("/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const messages = await Message.find({ user_id }).sort({ created_at: 1 });
  res.json({ messages });
});

/**
 * SEND SMS
 * POST /api/chat
 */
router.post("/", async (req, res) => {
  const { user_id, phone_number, message } = req.body;

  const userNumber = await NumberModel.findOne({ user_id });
  if (!userNumber) {
    return res.status(400).json({ error: "No number assigned to user" });
  }

  // Send SMS via Telnyx
  await telnyx.messages.create({
    from: userNumber.number,
    to: phone_number,
    text: message
  });

  const saved = await Message.create({
    user_id,
    phone_number,
    message,
    sender: "user"
  });

  res.json(saved);
});

export default router;
