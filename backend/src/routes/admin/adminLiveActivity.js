import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import { ACTIVE_CALL_STATUSES } from "../../utils/callStateMachine.js";
import { getRecentLiveActivitySnapshot } from "../../services/adminLiveEventsService.js";
import {
  resolveTimeframe,
  TIMEFRAME_PRESETS,
  DEFAULT_TIMEFRAME,
} from "../../services/analytics/timeframeService.js";
import { buildTelnyxActivityReport } from "../../services/telnyxLiveActivityService.js";

const router = express.Router();

const HISTORY_LIMIT = 200;
const FAILED_CALL_STATUSES = ["failed", "no-answer", "busy", "rejected", "canceled"];
const DELIVERED_SMS_STATUSES = ["delivered", "sent"];
const FAILED_SMS_STATUSES = ["failed", "undelivered"];

function resolveWindowParam(window) {
  const key = String(window || DEFAULT_TIMEFRAME).trim();
  return TIMEFRAME_PRESETS.has(key) ? key : DEFAULT_TIMEFRAME;
}

function mapCallToEvent(call) {
  const user = call.user;
  return {
    kind: "call",
    eventType: "historical",
    at: (call.updatedAt || call.createdAt)?.toISOString?.() || new Date().toISOString(),
    actor: {
      userId: user?._id ? String(user._id) : String(call.user || ""),
      email: user?.email || "Unknown user",
      name: user?.name || user?.email || "Unknown user",
    },
    callId: call._id ? String(call._id) : null,
    destination: call.toNumber || call.phoneNumber || null,
    from: call.fromNumber || null,
    direction: call.direction || "outbound",
    status: call.status || null,
    durationSeconds: Number(call.durationSeconds || 0),
  };
}

function mapSmsToEvent(sms) {
  const user = sms.user;
  const body = sms.body || sms.text || "";
  return {
    kind: "sms",
    eventType: "historical",
    at: (sms.updatedAt || sms.createdAt)?.toISOString?.() || new Date().toISOString(),
    actor: {
      userId: user?._id ? String(user._id) : String(sms.user || ""),
      email: user?.email || "Unknown user",
      name: user?.name || user?.email || "Unknown user",
    },
    messageId: sms.telnyxMessageId || (sms._id ? String(sms._id) : null),
    destination: sms.to || null,
    from: sms.from || null,
    status: sms.status || null,
    bodyPreview: String(body).slice(0, 120),
  };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const windowKey = resolveWindowParam(req.query.window);
    const timeframe = resolveTimeframe({
      window: windowKey,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    });
    const { start, end } = timeframe;
    const dateFilter = { createdAt: { $gte: start, $lte: end } };

    const [
      activeCallsCount,
      callsInWindow,
      completedCalls,
      failedCalls,
      avgDurationAgg,
      smsInWindow,
      deliveredSms,
      failedSms,
      historyCalls,
      historySms,
    ] = await Promise.all([
      Call.countDocuments({ status: { $in: ACTIVE_CALL_STATUSES } }),
      Call.countDocuments(dateFilter),
      Call.countDocuments({ ...dateFilter, status: "completed" }),
      Call.countDocuments({ ...dateFilter, status: { $in: FAILED_CALL_STATUSES } }),
      Call.aggregate([
        {
          $match: {
            ...dateFilter,
            status: "completed",
            durationSeconds: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            avgDuration: { $avg: "$durationSeconds" },
            totalDuration: { $sum: "$durationSeconds" },
          },
        },
      ]),
      SMS.countDocuments(dateFilter),
      SMS.countDocuments({ ...dateFilter, status: { $in: DELIVERED_SMS_STATUSES } }),
      SMS.countDocuments({ ...dateFilter, status: { $in: FAILED_SMS_STATUSES } }),
      Call.find(dateFilter)
        .populate("user", "email name firstName lastName")
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .lean(),
      SMS.find(dateFilter)
        .populate("user", "email name firstName lastName")
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .lean(),
    ]);

    const avgDurationSeconds = Math.round(Number(avgDurationAgg[0]?.avgDuration || 0));
    const totalDurationSeconds = Math.round(Number(avgDurationAgg[0]?.totalDuration || 0));
    const callSuccessRate =
      callsInWindow > 0 ? Math.round((completedCalls / callsInWindow) * 100) : null;
    const smsDeliveryRate =
      smsInWindow > 0 ? Math.round((deliveredSms / smsInWindow) * 100) : null;

    const telnyx = await buildTelnyxActivityReport({ start, end, syncPending: false });

    res.json({
      success: true,
      timeframe: {
        window: timeframe.window,
        label: timeframe.label,
        start: timeframe.start.toISOString(),
        end: timeframe.end.toISOString(),
      },
      snapshot: getRecentLiveActivitySnapshot(),
      history: {
        calls: historyCalls.map(mapCallToEvent),
        sms: historySms.map(mapSmsToEvent),
      },
      stats: {
        activeCallsCount,
        callsInWindow,
        completedCalls,
        failedCalls,
        avgDurationSeconds,
        totalDurationSeconds,
        callSuccessRate,
        smsInWindow,
        deliveredSms,
        failedSms,
        smsDeliveryRate,
      },
      telnyx,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin live activity error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch live activity" });
  }
});

router.post("/sync-telnyx", requireAdmin, async (req, res) => {
  try {
    const windowKey = resolveWindowParam(req.query.window);
    const timeframe = resolveTimeframe({
      window: windowKey,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    });

    const telnyx = await buildTelnyxActivityReport({
      start: timeframe.start,
      end: timeframe.end,
      syncPending: true,
    });

    res.json({
      success: true,
      timeframe: {
        window: timeframe.window,
        label: timeframe.label,
        start: timeframe.start.toISOString(),
        end: timeframe.end.toISOString(),
      },
      telnyx,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Telnyx sync error:", err);
    res.status(500).json({ success: false, error: "Failed to sync Telnyx costs" });
  }
});

export default router;
