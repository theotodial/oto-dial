import express from "express";
import SMS from "../models/SMS.js";

const router = express.Router();

/**
 * GET /api/messages
 * Get all messages (SMS) for the current user
 * Note: authenticateUser and loadSubscription are applied in index.js
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    
    // Fetch SMS messages for this user
    const messages = await SMS.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg._id,
        phone_number: msg.direction === 'inbound' ? msg.from : msg.to,
        to: msg.to,
        from: msg.from,
        message: msg.body,
        text: msg.body,
        created_at: msg.createdAt,
        timestamp: msg.createdAt,
        direction: msg.direction || 'outbound',
        status: msg.status,
        sender: msg.direction === 'inbound' ? 'other' : 'user'
      }))
    });
  } catch (err) {
    console.error("Messages fetch error:", err);
    res.json({
      success: true,
      messages: []
    });
  }
});

export default router;

