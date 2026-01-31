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

/**
 * DELETE /api/messages
 * Delete all messages (SMS) for the current user
 */
router.delete("/", async (req, res) => {
  try {
    const userId = req.userId;
    const result = await SMS.deleteMany({ user: userId });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/messages error:", err);
    res.status(500).json({ success: false, error: "Failed to delete messages" });
  }
});

/** Normalize phone for matching: digits only (no + or spaces) */
function normalizePhoneForMatch(phone) {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/\D/g, "");
}

/**
 * DELETE /api/messages/thread/:phoneNumber
 * Delete all messages in a thread (conversation with one number)
 * Encoded phone number can include + (use encodeURIComponent on frontend)
 */
router.delete("/thread/:phoneNumber", async (req, res) => {
  try {
    const userId = req.userId;
    const raw = req.params.phoneNumber ? decodeURIComponent(req.params.phoneNumber) : "";
    const normalized = normalizePhoneForMatch(raw);
    if (!normalized) {
      return res.status(400).json({ success: false, error: "Phone number required" });
    }
    const messages = await SMS.find({ user: userId }).lean();
    const idsToDelete = messages
      .filter((m) => {
        const toNorm = normalizePhoneForMatch(m.to);
        const fromNorm = normalizePhoneForMatch(m.from);
        return toNorm === normalized || fromNorm === normalized;
      })
      .map((m) => m._id);
    const result = await SMS.deleteMany({ _id: { $in: idsToDelete } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/messages/thread error:", err);
    res.status(500).json({ success: false, error: "Failed to delete conversation" });
  }
});

export default router;

