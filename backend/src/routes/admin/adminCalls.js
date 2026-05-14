import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import User from "../../models/User.js";
import PhoneNumber from "../../models/PhoneNumber.js";
import {
  getRecentCallDebugEvents,
  getRecentThrottleEvents,
} from "../../services/adminLiveEventsService.js";
import { ACTIVE_CALL_STATUSES } from "../../utils/callStateMachine.js";
import CallLifecycleEvent from "../../models/CallLifecycleEvent.js";
import ProcessedWebhookEvent from "../../models/ProcessedWebhookEvent.js";

const router = express.Router();

const CALL_HEARTBEAT_STALE_MS = Number(process.env.CALL_HEARTBEAT_STALE_MS || 120000);
const AGENT_CALL_ACTIVE_STALE_MS = Number(
  process.env.AGENT_CALL_ACTIVE_STALE_MS || 6 * 60 * 60 * 1000
);

router.get("/debug/live", requireAdmin, async (_req, res) => {
  try {
    const activeCalls = await Call.find({
      status: { $in: ACTIVE_CALL_STATUSES },
    })
      .select(
        "_id user fromNumber toNumber status callAnsweredAt callStartedAt callBridgedAt failReason telnyxCallControlId telnyxCallSessionId lastEventType lastEventSource lastProcessedEventAt lastHeartbeatAt lastClientSyncAt telnyxLastWebhookAt orphanRootCause"
      )
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
      lastEventType: call.lastEventType || null,
      lastEventSource: call.lastEventSource || null,
      lastProcessedEventAt: call.lastProcessedEventAt || null,
      lastHeartbeatAt: call.lastHeartbeatAt || null,
      lastClientSyncAt: call.lastClientSyncAt || null,
      lastProviderWebhookAt: call.telnyxLastWebhookAt || null,
      orphanRootCause: call.orphanRootCause || null,
    }));

    const recentFailures = await Call.find({
      status: { $in: ["failed", "no-answer", "busy", "rejected", "canceled"] },
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

router.get("/debug/invalid-transitions", requireAdmin, async (req, res) => {
  try {
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const hoursRaw = Number.parseInt(req.query.hours, 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const hours = Number.isFinite(hoursRaw) ? Math.min(Math.max(hoursRaw, 1), 168) : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const rows = await CallLifecycleEvent.find({
      event: "invalid_transition",
      timestamp: { $gte: since },
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    const byTransition = new Map();
    for (const row of rows) {
      const key = `${row.previousState || "null"}->${row.nextState || "null"}`;
      byTransition.set(key, (byTransition.get(key) || 0) + 1);
    }

    res.json({
      success: true,
      since,
      total: rows.length,
      grouped: Array.from(byTransition.entries())
        .map(([transition, count]) => ({ transition, count }))
        .sort((a, b) => b.count - a.count),
      events: rows.map((row) => ({
        id: String(row._id),
        callId: row.callId ? String(row.callId) : null,
        userId: row.userId ? String(row.userId) : null,
        previousState: row.previousState || null,
        nextState: row.nextState || null,
        action: row.action || null,
        details: row.details || {},
        timestamp: row.timestamp || row.createdAt || null,
      })),
    });
  } catch (err) {
    console.error("Admin invalid transition debug error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch invalid transition diagnostics",
    });
  }
});

/**
 * GET /api/admin/calls/runtime-health
 * Aggregate-only diagnostics (no secrets).
 */
router.get("/runtime-health", requireAdmin, async (_req, res) => {
  try {
    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const since5m = new Date(Date.now() - 5 * 60 * 1000);
    const hbCutoff = new Date(Date.now() - CALL_HEARTBEAT_STALE_MS);
    const reconStaleCutoff = new Date(Date.now() - AGENT_CALL_ACTIVE_STALE_MS);

    const [
      activeByStatus,
      activeTotal,
      outboundWebrtcHeartbeatStaleApprox,
      orphanCandidatesStaleReconciliation,
      staleEventIgnoredLastHour,
      reconciliationRepairsLastHour,
      invalidTransitionsLastHour,
      telnyxVoiceDuplicateHintsLastHour,
      activeCallsClientSyncedLast5m,
    ] = await Promise.all([
      Call.aggregate([
        { $match: { status: { $in: ACTIVE_CALL_STATUSES } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Call.countDocuments({ status: { $in: ACTIVE_CALL_STATUSES } }),
      Call.countDocuments({
        direction: "outbound",
        source: "webrtc",
        status: { $in: ACTIVE_CALL_STATUSES },
        lastHeartbeatAt: { $exists: true, $ne: null, $lte: hbCutoff },
      }),
      Call.countDocuments({
        status: { $in: ACTIVE_CALL_STATUSES },
        updatedAt: { $lte: reconStaleCutoff },
      }),
      CallLifecycleEvent.countDocuments({
        event: "stale_event_ignored",
        timestamp: { $gte: since1h },
      }),
      CallLifecycleEvent.countDocuments({
        action: "force_terminal_repair",
        timestamp: { $gte: since1h },
      }),
      CallLifecycleEvent.countDocuments({
        event: "invalid_transition",
        timestamp: { $gte: since1h },
      }),
      ProcessedWebhookEvent.countDocuments({
        provider: "telnyx:voice",
        lastDuplicateAt: { $gte: since1h },
      }),
      Call.countDocuments({
        status: { $in: ACTIVE_CALL_STATUSES },
        lastClientSyncAt: { $gte: since5m },
      }),
    ]);

    res.json({
      success: true,
      at: new Date().toISOString(),
      redisConfigured: Boolean(String(process.env.REDIS_URL || "").trim()),
      activeCallCount: activeTotal,
      activeByStatus,
      outboundWebrtcHeartbeatStaleApprox,
      orphanCandidatesStaleReconciliation,
      staleEventIgnoredLastHour,
      reconciliationRepairsLastHour,
      invalidTransitionsLastHour,
      telnyxVoiceDuplicateHintsLastHour,
      activeCallsClientSyncedLast5m,
      notes: {
        heartbeatStaleApprox:
          "Count of active outbound WebRTC rows with lastHeartbeatAt older than CALL_HEARTBEAT_STALE_MS (may overlap heartbeat monitor).",
        orphanCandidatesStaleReconciliation:
          "Active calls with updatedAt older than AGENT_CALL_ACTIVE_STALE_MS (same shape as global reconciliation scan).",
      },
    });
  } catch (err) {
    console.error("Admin runtime-health error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch runtime health" });
  }
});

/**
 * GET /api/admin/calls/media-health
 * Aggregate + recent in-memory admin debug tail (no secrets).
 */
router.get("/media-health", requireAdmin, async (_req, res) => {
  try {
    const recent = getRecentCallDebugEvents();
    const recentAdminDebugMediaBridgeFailures = recent.filter(
      (e) => e.eventType === "media.bridge_failed"
    ).length;
    const recentAdminDebugBridgeCommands = recent.filter(
      (e) => e.eventType === "call.bridge.command"
    ).length;

    const [
      activeParkedOutboundBridgeClaimedCount,
      activeParkedOutboundAwaitingBridgeClaimCount,
      answeredActiveWithoutBridgedAtCount,
    ] = await Promise.all([
      Call.countDocuments({
        direction: "outbound",
        source: "webrtc",
        webrtcParkBridgeAttempted: true,
        status: { $in: ACTIVE_CALL_STATUSES },
      }),
      Call.countDocuments({
        direction: "outbound",
        source: "webrtc",
        webrtcParkPstnCallControlId: { $exists: true, $nin: [null, ""] },
        webrtcParkBridgeAttempted: { $ne: true },
        status: { $in: ["dialing", "ringing", "answered", "in-progress"] },
      }),
      Call.countDocuments({
        direction: "outbound",
        source: "webrtc",
        status: { $in: ["answered", "in-progress"] },
        callAnsweredAt: { $exists: true, $ne: null },
        callBridgedAt: null,
        webrtcParkPstnCallControlId: { $exists: true, $nin: [null, ""] },
      }),
    ]);

    res.json({
      success: true,
      at: new Date().toISOString(),
      recentAdminDebugEventBufferSize: recent.length,
      recentAdminDebugBridgeCommands,
      recentAdminDebugMediaBridgeFailures,
      activeParkedOutboundBridgeClaimedCount,
      activeParkedOutboundAwaitingBridgeClaimCount,
      answeredActiveWithoutBridgedAtCount,
      peerConnectionsNote:
        "Active WebRTC peer connection counts are client-only; use browser console [WEBRTC FLOW] lines.",
      recentSampleTail: recent.slice(0, 8).map((e) => ({
        at: e.at,
        eventType: e.eventType || e.kind || null,
        callId: e.callId ? String(e.callId) : null,
        state: e.state || null,
      })),
    });
  } catch (err) {
    console.error("Admin media-health error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch media health" });
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
