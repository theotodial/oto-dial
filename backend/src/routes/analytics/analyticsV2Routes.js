import express from "express";
import authenticateUser from "../../middleware/authenticateUser.js";
import requireAdmin from "../../middleware/requireAdmin.js";
import { createRateLimiter } from "../../middleware/simpleRateLimit.js";
import { ingestBatch } from "../../services/analytics/ingestionService.js";
import { getLiveSnapshot, getIntelligenceSnapshot, getVisitorIntelligence } from "../../services/analytics/analyticsLiveService.js";
import { getDashboard, invalidateDashboardCache } from "../../services/analytics/aggregationService.js";
import { logAnalyticsAction } from "../../services/analytics/auditService.js";
import { getAnalyticsHealth } from "../../services/analytics/analyticsHealthService.js";
import { runReconciliation } from "../../services/analytics/reconciliationService.js";
import { getVisitorLifetimeProfile } from "../../services/analytics/visitorProfileService.js";
import { TIMEFRAME_PRESETS, DEFAULT_TIMEFRAME } from "../../services/analytics/timeframeService.js";
import { getGa4AdminStatus, getGa4ReconciliationReport } from "../../services/analytics/ga4DebugService.js";
import AnalyticsAuditLog from "../../models/analytics/AnalyticsAuditLog.js";
import { RANGE_PRESETS } from "../../services/analytics/rangeService.js";
import { PRIMARY_ADMIN_EMAIL } from "../../constants/adminAccess.js";

const router = express.Router();

// Generous limit: a single page session legitimately fires many beacons.
const collectLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 600,
  message: "Analytics rate limit exceeded."
});

// Tighter limit for admin query endpoints.
const adminLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: "Analytics admin rate limit exceeded."
});

const OVERVIEW_TIMEOUT_MS = 50_000;

function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })
  ]);
}

/** Validate & sanitize incoming query filters. */
function parseQuery(q = {}) {
  const range = RANGE_PRESETS.has(String(q.range)) ? String(q.range) : "30d";
  const compare = ["previous_period", "yoy", "none"].includes(String(q.compare))
    ? String(q.compare)
    : "previous_period";
  const tzOffset = Number.isFinite(Number(q.tzOffset)) ? Number(q.tzOffset) : 0;
  const out = { range, compare, tzOffset };
  if (range === "custom") {
    if (q.startDate) out.startDate = String(q.startDate);
    if (q.endDate) out.endDate = String(q.endDate);
  }
  if (q.noCache === "1" || q.noCache === "true") out.noCache = true;
  return out;
}

/**
 * POST /api/analytics/collect
 * Batched analytics ingestion (pageviews + events). Always responds 202
 * immediately and processes asynchronously so it can never block navigation.
 */
router.post("/collect", collectLimiter, (req, res) => {
  res.status(202).json({ success: true });
  const payload = req.body || {};
  setImmediate(() => {
    ingestBatch(req, payload).catch((e) =>
      console.error("[analytics] collect:", e?.message || e)
    );
  });
});

/**
 * GET /api/analytics/admin/overview
 * Full enterprise dashboard payload with comparison + per-section errors.
 */
router.get("/admin/overview", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const query = parseQuery(req.query);
    const refresh = req.query.refresh === "1" || req.query.refresh === "true";
    if (refresh) {
      await invalidateDashboardCache(query);
      query.noCache = true;
    }

    const data = await withTimeout(
      getDashboard(query),
      OVERVIEW_TIMEOUT_MS,
      "Analytics overview"
    );
    logAnalyticsAction(req, refresh ? "refresh" : "view", {
      range: query.range,
      compare: query.compare
    });

    res.json({ success: true, data, meta: data.meta });
  } catch (error) {
    console.error("[analytics] overview error:", error);
    res.status(500).json({ success: false, error: "Failed to build analytics overview" });
  }
});

/**
 * GET /api/analytics/admin/export?format=csv|json|excel|pdf
 */
router.get("/admin/export", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const query = parseQuery(req.query);
    const format = String(req.query.format || "json").toLowerCase();
    const data = await withTimeout(
      getDashboard({ ...query, noCache: true }),
      OVERVIEW_TIMEOUT_MS,
      "Analytics export"
    );
    const { buildExport } = await import("../../services/analytics/exportService.js");
    const artifact = await buildExport(data, format);

    logAnalyticsAction(req, "export", { format, range: query.range });

    const filename = `otodial-analytics-${query.range}-${Date.now()}.${artifact.extension}`;
    res.setHeader("Content-Type", artifact.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(artifact.body);
  } catch (error) {
    console.error("[analytics] export error:", error);
    res.status(500).json({ success: false, error: "Failed to export analytics" });
  }
});

/**
 * GET /api/analytics/admin/live
 * Polling fallback for live analytics when the socket stream is unavailable.
 */
router.get("/admin/live", authenticateUser, requireAdmin, (req, res) => {
  res.json({ success: true, data: getLiveSnapshot() });
});

function isSuperAdminUser(user) {
  const email = String(user?.email || "").toLowerCase().trim();
  return email === PRIMARY_ADMIN_EMAIL;
}

function parseIntelligenceQuery(q = {}) {
  const filters = {};
  if (q.loggedIn === "1" || q.loggedIn === "true") filters.loggedIn = true;
  if (q.anonymous === "1" || q.anonymous === "true") filters.anonymous = true;
  if (q.subscribers === "1" || q.subscribers === "true") filters.subscribers = true;
  if (q.returning === "1" || q.returning === "true") filters.returning = true;
  if (q.new === "1" || q.new === "true") filters.new = true;
  if (q.mobile === "1" || q.mobile === "true") filters.mobile = true;
  if (q.desktop === "1" || q.desktop === "true") filters.desktop = true;
  if (q.country) filters.country = String(q.country);
  if (q.source) filters.source = String(q.source);
  if (q.plan) filters.plan = String(q.plan);

  return {
    search: q.search ? String(q.search) : "",
    filters,
    window: TIMEFRAME_PRESETS.has(String(q.window || DEFAULT_TIMEFRAME))
      ? String(q.window || DEFAULT_TIMEFRAME)
      : DEFAULT_TIMEFRAME,
    startDate: q.startDate ? String(q.startDate) : null,
    endDate: q.endDate ? String(q.endDate) : null,
    page: Math.max(1, parseInt(q.page, 10) || 1),
    limit: Math.min(500, Math.max(1, parseInt(q.limit, 10) || 100)),
    revealIp: q.revealIp === "1" || q.revealIp === "true"
  };
}

/**
 * GET /api/analytics/admin/live/intelligence
 * Full live operations center snapshot (KPIs, visitors, funnel, geo, feeds).
 */
router.get("/admin/live/intelligence", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const query = parseIntelligenceQuery(req.query);
    const superAdmin = isSuperAdminUser(req.user);
    const revealIp = query.revealIp && superAdmin;

    const data = await getIntelligenceSnapshot({
      ...query,
      revealIp,
      superAdmin
    });

    res.json({ success: true, data, meta: { superAdmin, ipRevealed: revealIp } });
  } catch (error) {
    console.error("[analytics] live intelligence error:", error);
    res.status(500).json({ success: false, error: "Failed to load live intelligence" });
  }
});

/**
 * GET /api/analytics/admin/live/intelligence/visitor/:sessionId
 * Deep visitor intelligence panel (audit logged).
 */
router.get(
  "/admin/live/intelligence/visitor/:sessionId",
  authenticateUser,
  requireAdmin,
  adminLimiter,
  async (req, res) => {
    try {
      const superAdmin = isSuperAdminUser(req.user);
      const revealIp =
        (req.query.revealIp === "1" || req.query.revealIp === "true") && superAdmin;

      const visitor = await getVisitorIntelligence(req.params.sessionId, {
        revealIp,
        superAdmin
      });

      if (!visitor) {
        return res.status(404).json({ success: false, error: "Session not found or expired" });
      }

      logAnalyticsAction(req, "live_visitor_view", {
        sessionId: req.params.sessionId,
        visitorId: visitor.visitorId,
        ipRevealed: revealIp
      });

      res.json({ success: true, data: visitor, meta: { superAdmin, ipRevealed: revealIp } });
    } catch (error) {
      console.error("[analytics] visitor intelligence error:", error);
      res.status(500).json({ success: false, error: "Failed to load visitor intelligence" });
    }
  }
);

/**
 * GET /api/analytics/admin/health
 * Analytics Health / Executive Accuracy panel.
 */
router.get("/admin/health", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const window = TIMEFRAME_PRESETS.has(String(req.query.window || DEFAULT_TIMEFRAME))
      ? String(req.query.window || DEFAULT_TIMEFRAME)
      : DEFAULT_TIMEFRAME;
    const data = await getAnalyticsHealth({ window });
    res.json({ success: true, data });
  } catch (error) {
    console.error("[analytics] health error:", error);
    res.status(500).json({ success: false, error: "Failed to load analytics health" });
  }
});

/**
 * GET /api/analytics/admin/reconcile
 * On-demand reconciliation report.
 */
router.get("/admin/reconcile", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const query = parseQuery(req.query);
    const { resolveRange } = await import("../../services/analytics/rangeService.js");
    const range = resolveRange(query);
    const dashboard = await getDashboard({ ...query, noCache: true });
    const data = await runReconciliation({
      start: range.start,
      end: range.end,
      overview: dashboard.overview,
      revenue: dashboard.revenue,
      subscriptions: dashboard.subscriptions
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("[analytics] reconcile error:", error);
    res.status(500).json({ success: false, error: "Failed to run reconciliation" });
  }
});

/**
 * GET /api/analytics/admin/visitor/:visitorId/profile
 * Lifetime visitor intelligence profile.
 */
router.get("/admin/visitor/:visitorId/profile", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const profile = await getVisitorLifetimeProfile(req.params.visitorId);
    if (!profile) {
      return res.status(404).json({ success: false, error: "Visitor not found" });
    }
    logAnalyticsAction(req, "view", { type: "visitor_profile", visitorId: req.params.visitorId });
    res.json({ success: true, data: profile });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to load visitor profile" });
  }
});

/**
 * GET /api/analytics/admin/ga4/status
 */
router.get("/admin/ga4/status", authenticateUser, requireAdmin, (req, res) => {
  res.json({ success: true, data: getGa4AdminStatus() });
});

/**
 * GET /api/analytics/admin/ga4/reconcile
 */
router.get("/admin/ga4/reconcile", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const window = TIMEFRAME_PRESETS.has(String(req.query.window || DEFAULT_TIMEFRAME))
      ? String(req.query.window || DEFAULT_TIMEFRAME)
      : DEFAULT_TIMEFRAME;
    const data = await getGa4ReconciliationReport({ window });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to run GA4 reconciliation" });
  }
});

/**
 * GET /api/analytics/admin/audit
 * Recent analytics audit log entries.
 */
router.get("/admin/audit", authenticateUser, requireAdmin, adminLimiter, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const logs = await AnalyticsAuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch audit log" });
  }
});

export default router;
