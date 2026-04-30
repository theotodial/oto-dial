import express from "express";
import SMS from "../models/SMS.js";
import MessageReadState from "../models/MessageReadState.js";
import {
  buildSmsThreadKey,
  isCompositeThreadKey,
  normalizeThreadPhone,
  parseSmsThreadKey,
} from "../utils/smsThreadKey.js";

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

function parseThreadSelection(userId, threadRaw, ownedRaw) {
  const thread = String(threadRaw || "").trim();
  const ownedNumber = normalizeThreadPhone(ownedRaw);
  if (!thread && !ownedNumber) return { valid: true, match: null };

  if (isCompositeThreadKey(thread)) {
    const parsed = parseSmsThreadKey(thread);
    if (!parsed || String(parsed.userId) !== String(userId)) {
      return { valid: false, match: null };
    }
    return {
      valid: true,
      match: {
        threadKey: buildSmsThreadKey({
          userId,
          ownedNumber: parsed.ownedNumber,
          externalNumber: parsed.externalNumber,
        }),
      },
    };
  }

  if (!thread && ownedNumber) {
    return { valid: true, match: { ownedNumber } };
  }

  const candidates = buildPhoneCandidates(thread);
  const normalizedCandidates = candidates.map((c) => normalizeThreadPhone(c)).filter(Boolean);
  const match = {
    $or: [
      { externalNumber: { $in: normalizedCandidates } },
      { from: { $in: candidates } },
      { to: { $in: candidates } },
    ],
  };
  if (ownedNumber) {
    match.$and = [{ ownedNumber }];
  }
  return { valid: true, match };
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
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 30;
    const thread = String(req.query.thread || "").trim();
    const ownedNumber = String(req.query.ownedNumber || "").trim();
    const cursor = String(req.query.cursor || "").trim();
    const query = { user: userId };
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        query.createdAt = { $lt: cursorDate };
      }
    }

    if (thread || ownedNumber) {
      const parsed = parseThreadSelection(userId, thread, ownedNumber);
      if (!parsed.valid) {
        return res.status(403).json({ success: false, error: "THREAD_ACCESS_DENIED" });
      }
      if (parsed.match) {
        Object.assign(query, parsed.match);
      }
    }
    
    // Fetch SMS messages for this user
    const messagesDesc = await SMS.find(query)
      .select(
        "user to from body createdAt direction status campaign smsCostInfo moderationStatus deliveryError ownedNumber externalNumber threadKey"
      )
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const messages = [...messagesDesc].reverse();
    if (messages.some((m) => m.user && String(m.user) !== String(userId))) {
      return res.status(403).json({ success: false, error: "THREAD_ACCESS_DENIED" });
    }
    const nextCursor =
      messagesDesc.length === limit
        ? messagesDesc[messagesDesc.length - 1]?.createdAt?.toISOString?.() || null
        : null;

    res.json({
      success: true,
      nextCursor,
      messages: messages.map((msg) => {
        const mod = msg.moderationStatus;
        let displayStatus = msg.status;
        if (mod === "pending") {
          displayStatus = msg.status === "failed" ? "failed" : "queued";
        } else if (mod === "rejected") {
          displayStatus = "failed";
        }
        return {
          id: msg._id,
          phone_number: msg.externalNumber || (msg.direction === "inbound" ? msg.from : msg.to),
          to: msg.to,
          from: msg.from,
          ownedNumber: msg.ownedNumber || null,
          externalNumber: msg.externalNumber || null,
          threadId:
            msg.threadKey ||
            buildSmsThreadKey({
              userId,
              ownedNumber: msg.direction === "inbound" ? msg.to : msg.from,
              externalNumber: msg.direction === "inbound" ? msg.from : msg.to,
            }),
          message: msg.body,
          text: msg.body,
          created_at: msg.createdAt,
          timestamp: msg.createdAt,
          direction: msg.direction || "outbound",
          status: displayStatus,
          moderationStatus: mod || "none",
          sender: msg.direction === "inbound" ? "other" : "user",
          campaignId: msg.campaign ? String(msg.campaign) : null,
          smsCostInfo: msg.smsCostInfo || null,
          deliveryError: msg.deliveryError || null,
        };
      }),
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
 * GET /api/messages/threads
 * Returns conversation thread summaries for current user.
 */
router.get("/threads", async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 40;
    const rows = await SMS.aggregate([
      { $match: { user: req.user._id } },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          user: 1,
          threadKey: 1,
          ownedNumber: 1,
          externalNumber: 1,
          to: 1,
          from: 1,
          body: 1,
          createdAt: 1,
          direction: 1,
          fallbackOwned: {
            $cond: [{ $eq: ["$direction", "inbound"] }, "$to", "$from"],
          },
          fallbackExternal: {
            $cond: [{ $eq: ["$direction", "inbound"] }, "$from", "$to"],
          },
        },
      },
      {
        $group: {
          _id: {
            $ifNull: [
              "$threadKey",
              {
                $concat: [
                  { $toString: "$user" },
                  ":",
                  { $ifNull: ["$fallbackOwned", ""] },
                  ":",
                  { $ifNull: ["$fallbackExternal", ""] },
                ],
              },
            ],
          },
          ownedNumber: { $first: { $ifNull: ["$ownedNumber", "$fallbackOwned"] } },
          externalNumber: { $first: { $ifNull: ["$externalNumber", "$fallbackExternal"] } },
          lastMessage: { $first: "$body" },
          updatedAt: { $first: "$createdAt" },
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
    ]);
    res.json({
      success: true,
      threads: rows.map((r) => ({
        threadId: r._id,
        phone: r.externalNumber,
        externalNumber: r.externalNumber,
        ownedNumber: r.ownedNumber,
        lastMessage: r.lastMessage || "",
        updatedAt: r.updatedAt || null,
      })),
    });
  } catch (err) {
    console.error("GET /api/messages/threads error:", err);
    res.status(500).json({ success: false, error: "Failed to load threads" });
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
    const raw = String(req.body.threadId || req.body.phoneNumber || req.body.phone || "").trim();
    if (!raw) {
      return res.status(400).json({ success: false, error: "threadId required" });
    }
    const parsed = parseThreadSelection(userId, raw, req.body?.ownedNumber);
    if (!parsed.valid || !parsed.match) {
      return res.status(403).json({ success: false, error: "THREAD_ACCESS_DENIED" });
    }
    const threadId = parsed.match.threadKey || raw;
    await MessageReadState.findOneAndUpdate(
      { user: userId, phoneNumber: threadId },
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

    // Distinct inbound threads (cap for cost); unread = inbound after lastReadAt for that thread.
    const inboundPeers = await SMS.aggregate([
      { $match: { user: req.user._id, direction: "inbound" } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $ifNull: [
              "$threadKey",
              {
                $concat: [
                  { $toString: "$user" },
                  ":",
                  { $ifNull: ["$ownedNumber", "$to"] },
                  ":",
                  { $ifNull: ["$externalNumber", "$from"] },
                ],
              },
            ],
          },
        },
      },
      { $limit: 300 },
    ]);

    const unreadByPhone = {};
    await Promise.all(
      inboundPeers.map(async (row) => {
        const threadId = row._id;
        if (!threadId) return;
        const readState = readStates.find((s) => s.phoneNumber === threadId);
        const lastReadAt = readState?.lastReadAt ? new Date(readState.lastReadAt) : new Date(0);
        const count = await SMS.countDocuments({
          user: userId,
          direction: "inbound",
          threadKey: threadId,
          createdAt: { $gt: lastReadAt },
        });
        if (count > 0) {
          unreadByPhone[threadId] = count;
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
    const parsed = parseThreadSelection(userId, raw, req.query?.ownedNumber);
    if (!parsed.valid || !parsed.match) {
      return res.status(403).json({ success: false, error: "THREAD_ACCESS_DENIED" });
    }
    const result = await SMS.deleteMany({ user: userId, ...parsed.match });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/messages/thread error:", err);
    res.status(500).json({ success: false, error: "Failed to delete conversation" });
  }
});

export default router;

