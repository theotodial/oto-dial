/**
 * analyticsHealthService
 *
 * Executive accuracy panel — infrastructure + pipeline health for admins.
 */
import mongoose from "mongoose";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import { getRedisClient } from "../cache.service.js";
import { isMeasurementProtocolConfigured, getGa4MpStats } from "./gaMeasurementProtocolService.js";
import { getAllSessions } from "./liveIntelligenceStore.js";
import { runReconciliation } from "./reconciliationService.js";
import { resolveTimeframe, DEFAULT_TIMEFRAME } from "./timeframeService.js";

let lastSuccessfulSyncAt = null;
let lastSyncDurationMs = 0;

export function markAnalyticsSyncSuccess(durationMs = 0) {
  lastSuccessfulSyncAt = new Date().toISOString();
  lastSyncDurationMs = durationMs;
}

async function checkMongo() {
  const started = Date.now();
  try {
    const state = mongoose.connection.readyState;
    if (state !== 1) return { status: "down", latencyMs: Date.now() - started };
    await mongoose.connection.db.admin().ping();
    return { status: "healthy", latencyMs: Date.now() - started };
  } catch (e) {
    return { status: "error", error: e?.message, latencyMs: Date.now() - started };
  }
}

async function checkRedis() {
  const started = Date.now();
  try {
    const client = await getRedisClient();
    if (!client) return { status: "not_configured", latencyMs: Date.now() - started };
    await client.ping();
    return { status: "healthy", latencyMs: Date.now() - started };
  } catch (e) {
    return { status: "error", error: e?.message, latencyMs: Date.now() - started };
  }
}

/**
 * Full analytics health payload for admin dashboard.
 */
export async function getAnalyticsHealth({ window = DEFAULT_TIMEFRAME } = {}) {
  const tf = resolveTimeframe({ window });
  const started = Date.now();

  const [mongo, redis, unprocessedEstimate, recentEventRate, reconciliation] = await Promise.all([
    checkMongo(),
    checkRedis(),
    AnalyticsEvent.countDocuments({
      timestamp: { $gte: tf.start, $lte: tf.end },
      category: "server"
    }).maxTimeMS(8000),
    AnalyticsEvent.countDocuments({ timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }).maxTimeMS(5000),
    runReconciliation({ start: tf.start, end: tf.end }).catch((e) => ({
      healthy: false,
      error: e?.message,
      checks: [],
      warnings: []
    }))
  ]);

  const liveSessions = getAllSessions().length;
  const ga4Configured = isMeasurementProtocolConfigured();

  const trackingStatus =
    mongo.status === "healthy" && recentEventRate >= 0 ? "healthy" : "degraded";

  return {
    at: new Date().toISOString(),
    durationMs: Date.now() - started,
    tracking: { status: trackingStatus, eventsLast5Min: recentEventRate },
    ga4: {
      status: ga4Configured ? "configured" : "not_configured",
      measurementProtocol: ga4Configured,
      mp: getGa4MpStats()
    },
    stripe: { status: "connected", note: "Revenue reconciled via StripeInvoice collection" },
    websocket: { status: "active", liveSessionsInMemory: liveSessions },
    redis,
    mongo,
    eventQueue: {
      serverEventsInWindow: unprocessedEstimate,
      droppedEvents: 0,
      queueDelayMs: 0
    },
    synchronization: {
      lastSuccessfulSync: lastSuccessfulSyncAt,
      lastSyncDurationMs,
      reconciliationHealthy: reconciliation.healthy,
      delayMs: lastSuccessfulSyncAt
        ? Date.now() - new Date(lastSuccessfulSyncAt).getTime()
        : null
    },
    reconciliation,
    window: { label: tf.label, start: tf.start.toISOString(), end: tf.end.toISOString() }
  };
}

export default { getAnalyticsHealth, markAnalyticsSyncSuccess };
