import express from "express";
import SMS from "../models/SMS.js";
import MessageReadState from "../models/MessageReadState.js";

const router = express.Router();

/** Normalize phone for matching: digits only */
function normalizePhone(phone) {
  if (!phone || typeof phone !== "string") return "";
  return phone.replace(/\D/g, "");
}

function buildPhoneCandidates(phone) {
  const raw = String(phone || "").trim();
  const digits = normalizePhone(raw);
  return Array.from(
    new Set(
      [raw, digits, digits ? `+${digits}` : null].filter(Boolean)
    )
  );
}

/**
 * GET /api/messages
 * Get all messages (SMS) for the current user
 * Note: authenticateUser and loadSubscription are applied in index.js
 */
router.get("/", async (req, res) => {
  try {
    const userId = req.userId;
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const thread = String(req.query.thread || "").trim();
    const query = { user: userId };

    if (thread) {
      const candidates = buildPhoneCandidates(thread);
      query.$or = [
        { to: { $in: candidates } },
        { from: { $in: candidates } }
      ];
    }
    
    // Fetch SMS messages for this user
    const messages = await SMS.find(query)
      .select("to from body createdAt direction status")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

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

function normalizePhoneForMatch(phone) {
  return normalizePhone(phone);
}

/**
 * GET /api/messages/read-state
 * Get last read timestamp per thread (phone number) for current user
 */
router.get("/read-state", async (req, res) => {
  try {
    const userId = req.userId;
    const states = await MessageReadState.find({ user: userId }).lean();
    const byPhone = {};
    states.forEach((s) => {
      byPhone[s.phoneNumber] = s.lastReadAt;
    });
    res.json({ success: true, readState: byPhone });
  } catch (err) {
    console.error("GET /api/messages/read-state error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch read state" });
  }
});

/**
 * POST /api/messages/read-state
 * Mark a thread as read (body: { phoneNumber })
 */
router.post("/read-state", async (req, res) => {
  try {
    const userId = req.userId;
    const phoneNumber = (req.body.phoneNumber || req.body.phone || "").trim();
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: "phoneNumber required" });
    }
    await MessageReadState.findOneAndUpdate(
      { user: userId, phoneNumber },
      { lastReadAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/messages/read-state error:", err);
    res.status(500).json({ success: false, error: "Failed to mark as read" });
  }
});

/**
 * GET /api/messages/unread-counts
 * Returns unread message count per thread (phone number) for current user
 */
router.get("/unread-counts", async (req, res) => {
  try {
    const userId = req.userId;
    const [messages, readStates] = await Promise.all([
      SMS.find({ user: userId, direction: "inbound" })
        .select("from createdAt direction")
        .lean(),
      MessageReadState.find({ user: userId }).lean()
    ]);
    const lastReadByPhone = {};
    readStates.forEach((s) => {
      const key = normalizePhone(s.phoneNumber) || s.phoneNumber;
      lastReadByPhone[key] = s.lastReadAt ? new Date(s.lastReadAt) : new Date(0);
    });
    const unreadByPhone = {};
    messages.forEach((msg) => {
      if (msg.direction !== "inbound") return;
      const threadPhone = msg.from;
      const threadNorm = normalizePhone(threadPhone);
      const lastRead = lastReadByPhone[threadNorm] || lastReadByPhone[threadPhone] || new Date(0);
      const msgDate = new Date(msg.createdAt || 0);
      if (msgDate > lastRead) {
        unreadByPhone[threadPhone] = (unreadByPhone[threadPhone] || 0) + 1;
      }
    });
    res.json({ success: true, unreadCounts: unreadByPhone });
  } catch (err) {
    console.error("GET /api/messages/unread-counts error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch unread counts" });
  }
});

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

