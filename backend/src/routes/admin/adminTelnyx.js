import express from "express";
import requireAdmin from "../../middleware/requireAdmin.js";
import {
  resolveTimeframe,
  TIMEFRAME_PRESETS,
  DEFAULT_TIMEFRAME,
} from "../../services/analytics/timeframeService.js";
import { buildTelnyxAdminReport } from "../../services/telnyxAdminReportService.js";

const router = express.Router();

function resolveWindowParam(window) {
  const key = String(window || DEFAULT_TIMEFRAME).trim();
  return TIMEFRAME_PRESETS.has(key) ? key : DEFAULT_TIMEFRAME;
}

function resolveRequestTimeframe(query = {}) {
  const windowKey = resolveWindowParam(query.window);
  const timeframe = resolveTimeframe({
    window: windowKey,
    startDate: query.startDate || null,
    endDate: query.endDate || null,
  });
  return { windowKey, timeframe };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { timeframe } = resolveRequestTimeframe(req.query);
    const report = await buildTelnyxAdminReport({
      start: timeframe.start,
      end: timeframe.end,
      syncPending: false,
    });

    res.json({
      success: true,
      timeframe: {
        window: timeframe.window,
        label: timeframe.label,
        start: timeframe.start.toISOString(),
        end: timeframe.end.toISOString(),
      },
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Telnyx report error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch Telnyx report" });
  }
});

router.post("/sync", requireAdmin, async (req, res) => {
  try {
    const { timeframe } = resolveRequestTimeframe(req.query);
    const report = await buildTelnyxAdminReport({
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
      report,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin Telnyx sync error:", err);
    res.status(500).json({ success: false, error: "Failed to sync Telnyx report" });
  }
});

export default router;
