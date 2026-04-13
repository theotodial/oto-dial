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
  const set = new Set(
    [raw, digits, digits ? `+${digits}` : null].filter(Boolean)
  );
  if (digits.length === 10) {
    set.add(`+1${digits}`);
    set.add(`1${digits}`);
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    set.add(digits.slice(1));
    set.add(`+${digits}`);
  }
  return Array.from(set);
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
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 2000) : 20;
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
      .select("to from body createdAt direction status campaign")
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
        sender: msg.direction === 'inbound' ? 'other' : 'user',
        campaignId: msg.campaign ? String(msg.campaign) : null,
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
    const readStates = await MessageReadState.find({ user: userId })
      .select("phoneNumber lastReadAt")
      .lean();

    const unreadByPhone = {};
    await Promise.all(
      readStates.map(async (state) => {
        const candidates = buildPhoneCandidates(state.phoneNumber);
        const count = await SMS.countDocuments({
          user: userId,
          direction: "inbound",
          from: { $in: candidates },
          createdAt: { $gt: state.lastReadAt || new Date(0) },
        });
        if (count > 0) {
          unreadByPhone[state.phoneNumber] = count;
        }
      })
    );

    const latestInboundThreads = await SMS.aggregate([
      { $match: { user: req.user._id, direction: "inbound" } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$from",
          latestAt: { $first: "$createdAt" },
        },
      },
      { $limit: 20 },
    ]);

    await Promise.all(
      latestInboundThreads.map(async (thread) => {
        if (unreadByPhone[thread._id] !== undefined) return;
        const count = await SMS.countDocuments({
          user: userId,
          direction: "inbound",
          from: thread._id,
        });
        if (count > 0) {
          unreadByPhone[thread._id] = count;
        }
      })
    );

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
    const candidates = buildPhoneCandidates(raw);
    const result = await SMS.deleteMany({
      user: userId,
      $or: [
        { to: { $in: candidates } },
        { from: { $in: candidates } },
      ],
    });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/messages/thread error:", err);
    res.status(500).json({ success: false, error: "Failed to delete conversation" });
  }
});

export default router;

