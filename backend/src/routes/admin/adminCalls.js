import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import User from "../../models/User.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import {
  getRecentCallDebugEvents,
  getRecentThrottleEvents,
} from "../../services/adminLiveEventsService.js";

const router = express.Router();

router.get("/debug/live", requireAdmin, async (_req, res) => {
  try {
    const activeCalls = await Call.find({
      status: { $in: ["queued", "initiated", "dialing", "ringing", "in-progress", "answered"] },
    })
      .populate("user", "email name")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const recentWebhookEvents = getRecentCallDebugEvents();
    const bridgeStatus = activeCalls.map((call) => ({
      callId: String(call._id),
      userId: String(call.user?._id || call.user || ""),
      userEmail: call.user?.email || null,
      from: call.fromNumber || null,
      to: call.toNumber || null,
      status: call.status,
      answeredAt: call.callAnsweredAt || call.callStartedAt || null,
      bridgedAt: call.callBridgedAt || null,
      failReason: call.failReason || null,
      telnyxCallControlId: call.telnyxCallControlId || null,
      telnyxCallSessionId: call.telnyxCallSessionId || null,
    }));

    const recentFailures = await Call.find({
      status: { $in: ["failed", "missed"] },
    })
      .sort({ updatedAt: -1 })
      .limit(25)
      .select("user fromNumber toNumber status failReason hangupCause hangupCauseCode updatedAt")
      .lean();

    res.json({
      success: true,
      activeCalls: bridgeStatus,
      webhookEvents: recentWebhookEvents,
      throttleEvents: getRecentThrottleEvents(),
      failures: recentFailures.map((f) => ({
        callId: String(f._id),
        userId: String(f.user || ""),
        from: f.fromNumber || null,
        to: f.toNumber || null,
        status: f.status,
        failReason: f.failReason || f.hangupCause || null,
        hangupCauseCode: f.hangupCauseCode || null,
        updatedAt: f.updatedAt || null,
      })),
    });
  } catch (err) {
    console.error("Admin live call debug error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch live call debug data" });
  }
});

router.get("/debug/sip-identities", requireAdmin, async (_req, res) => {
  try {
    const activeNumbers = await PhoneNumber.find({ status: "active" })
      .select("userId phoneNumber telnyxPhoneNumberId")
      .lean();
    const usersById = new Map();
    const users = await User.find({ _id: { $in: activeNumbers.map((n) => n.userId) } })
      .select("_id email")
      .lean();
    for (const u of users) usersById.set(String(u._id), u.email);

    const globalConnectionId = String(process.env.TELNYX_CONNECTION_ID || "").trim() || null;
    const globalSipUsername = String(process.env.TELNYX_SIP_USERNAME || "").trim() || null;

    const ownershipRows = activeNumbers.map((n) => ({
      userId: String(n.userId),
      userEmail: usersById.get(String(n.userId)) || null,
      phoneNumber: n.phoneNumber,
      telnyxPhoneNumberId: n.telnyxPhoneNumberId || null,
      connectionId: globalConnectionId,
      sipUsername: globalSipUsername,
    }));

    res.json({
      success: true,
      summary: {
        uniqueSipIdentityPerAccount: false,
        reason:
          "Current architecture uses global TELNYX_CONNECTION_ID/TELNYX_SIP_USERNAME for all users. Number ownership remains isolated per user.",
      },
      globalCredentials: {
        connectionId: globalConnectionId,
        sipUsername: globalSipUsername,
      },
      rows: ownershipRows,
    });
  } catch (err) {
    console.error("Admin sip identities debug error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch SIP identity report" });
  }
});

/**
 * GET /api/admin/calls
 * Get all calls with filters, pagination, and cost details
 */
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search, 
      userId, 
      direction, 
      status,
      startDate,
      endDate
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};

    if (userId) {
      query.user = userId;
    }

    if (direction) {
      query.direction = direction;
    }

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { phoneNumber: { $regex: search, $options: "i" } },
        { fromNumber: { $regex: search, $options: "i" } },
        { toNumber: { $regex: search, $options: "i" } }
      ];
    }

    const calls = await Call.find(query)
      .populate("user", "email name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Call.countDocuments(query);

    // Calculate totals
    const totalCalls = await Call.countDocuments(query);
    const totalCost = await Call.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$cost" } } }
    ]);
    const totalMinutes = await Call.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: "$billedMinutes" } } }
    ]);

    res.json({
      success: true,
      calls: calls.map(call => ({
        id: call._id,
        callId: call.telnyxCallId || call.telnyxCallControlId,
        userId: call.user?._id,
        userEmail: call.user?.email,
        userName: call.user?.name,
        phoneNumber: call.phoneNumber,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        direction: call.direction,
        status: call.status,
        callInitiatedAt: call.callInitiatedAt,
        callStartedAt: call.callStartedAt,
        callAnsweredAt: call.callAnsweredAt || call.callStartedAt || null,
        callBridgedAt: call.callBridgedAt || null,
        callEndedAt: call.callEndedAt,
        ringingDuration: call.ringingDuration || 0,
        answeredDuration: call.answeredDuration || 0,
        durationSeconds: call.durationSeconds,
        billedMinutes: call.billedMinutes,
        costPerSecond: call.costPerSecond || (call.cost / Math.max(call.durationSeconds, 1)),
        totalCost: call.cost,
        hangupCause: call.hangupCause,
        failReason: call.failReason || null,
        createdAt: call.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      totals: {
        totalCalls,
        totalCost: totalCost[0]?.total || 0,
        totalMinutes: totalMinutes[0]?.total || 0
      }
    });
  } catch (err) {
    console.error("Admin calls error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch calls"
    });
  }
});

/**
 * GET /api/admin/calls/:id
 * Get single call details
 */
router.get("/:id", requireAdmin, async (req, res) => {
  try {
    const call = await Call.findById(req.params.id).populate("user", "email name");

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found"
      });
    }

    res.json({
      success: true,
      call: {
        id: call._id,
        callId: call.telnyxCallId || call.telnyxCallControlId,
        userId: call.user?._id,
        userEmail: call.user?.email,
        userName: call.user?.name,
        phoneNumber: call.phoneNumber,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        direction: call.direction,
        status: call.status,
        callInitiatedAt: call.callInitiatedAt,
        callStartedAt: call.callStartedAt,
        callAnsweredAt: call.callAnsweredAt || call.callStartedAt || null,
        callBridgedAt: call.callBridgedAt || null,
        callEndedAt: call.callEndedAt,
        ringingDuration: call.ringingDuration || 0,
        answeredDuration: call.answeredDuration || 0,
        durationSeconds: call.durationSeconds,
        billedMinutes: call.billedMinutes,
        costPerSecond: call.costPerSecond || (call.cost / Math.max(call.durationSeconds, 1)),
        totalCost: call.cost,
        hangupCause: call.hangupCause,
        failReason: call.failReason || null,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt
      }
    });
  } catch (err) {
    console.error("Admin call detail error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to fetch call details"
    });
  }
});

export default router;
