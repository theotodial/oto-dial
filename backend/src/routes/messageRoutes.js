import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";

const router = express.Router();

/**
 * GET /api/messages
 * Get all messages for the current user
 * Returns empty array if Message model doesn't exist (graceful degradation)
 */
router.get("/", authenticateUser, async (req, res) => {
  try {
    let Message;
    try {
      Message = (await import("../models/Message.js")).default;
    } catch (importErr) {
      // Message model doesn't exist, return empty array
      console.warn("Message model not found, returning empty array");
      return res.json({
        success: true,
        messages: []
      });
    }

    const userId = req.userId;
    
    // Fetch messages for this user
    const messages = await Message.find({ 
      user: userId 
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      messages: messages.map(msg => ({
        id: msg._id,
        phone_number: msg.phone_number || msg.to,
        message: msg.message || msg.text,
        created_at: msg.createdAt || msg.created_at,
        timestamp: msg.createdAt || msg.created_at,
        direction: msg.direction || 'outbound'
      }))
    });
  } catch (err) {
    console.error("Messages fetch error:", err);
    // Return empty array on error instead of failing
    res.json({
      success: true,
      messages: []
    });
  }
});

export default router;

