/**
 * gaMeasurementProtocolService
 *
 * Enterprise GA4 Measurement Protocol: retries, deduplication, structured events.
 * Server-side is the source of truth for revenue / subscription / number purchase events.
 */
import axios from "axios";
import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import { getRedisClient } from "../cache.service.js";

const GA_ENDPOINT = "https://www.google-analytics.com/mp/collect";
const GA_DEBUG_ENDPOINT = "https://www.google-analytics.com/debug/mp/collect";
const MAX_RETRIES = 5;
const RETRY_BASE_MS = 2000;
const DEDUP_TTL_SEC = 7 * 24 * 3600; // 7 days

const retryQueue = [];
let flushTimer = null;
const localDedup = new Set();

const stats = {
  sent: 0,
  failed: 0,
  retried: 0,
  deduplicated: 0,
  lastEventAt: null,
  lastPurchaseAt: null,
  lastError: null
};

function getConfig() {
  const measurementId =
    process.env.GA4_MEASUREMENT_ID ||
    process.env.GA_MEASUREMENT_ID ||
    "G-X3WN8RYCQ5";
  const apiSecret = process.env.GA4_MP_API_SECRET || process.env.GA_MP_API_SECRET || null;
  const enabled = String(process.env.GA4_ENABLED || "true").toLowerCase() !== "false";
  const debug = String(process.env.GA4_DEBUG || "false").toLowerCase() === "true";
  return {
    measurementId,
    apiSecret,
    configured: Boolean(measurementId && apiSecret),
    enabled,
    debug
  };
}

export function isMeasurementProtocolConfigured() {
  return getConfig().configured && getConfig().enabled;
}

export function getGa4MpStats() {
  return {
    ...stats,
    queueLength: retryQueue.length,
    configured: isMeasurementProtocolConfigured(),
    measurementId: getConfig().measurementId
  };
}

async function dedupKey(transactionId) {
  if (!transactionId) return null;
  const key = `ga4:mp:tx:${transactionId}`;
  if (localDedup.has(key)) return key;
  try {
    const redis = await getRedisClient();
    if (redis) {
      const exists = await redis.get(key);
      if (exists) return key;
      await redis.setEx(key, DEDUP_TTL_SEC, "1");
      return null;
    }
  } catch {
    /* fall through */
  }
  if (localDedup.has(key)) return key;
  localDedup.add(key);
  if (localDedup.size > 10000) {
    const first = localDedup.values().next().value;
    localDedup.delete(first);
  }
  return null;
}

async function resolveClientId({ userId, fallbackKey }) {
  if (userId) {
    try {
      const session = await AnalyticsSession.findOne({
        userId,
        gaClientId: { $ne: null }
      })
        .sort({ lastActivityAt: -1 })
        .select("gaClientId")
        .lean();
      if (session?.gaClientId) return session.gaClientId;
    } catch {
      /* ignore */
    }
  }
  const seed = String(fallbackKey || userId || Date.now());
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `${hash}.${Math.floor(Date.now() / 1000)}`;
}

async function postToGa4(body, { debug = false } = {}) {
  const config = getConfig();
  if (!config.configured || !config.enabled) {
    return { sent: false, reason: "not_configured" };
  }
  const endpoint = debug || config.debug ? GA_DEBUG_ENDPOINT : GA_ENDPOINT;
  const res = await axios.post(endpoint, body, {
    params: { measurement_id: config.measurementId, api_secret: config.apiSecret },
    timeout: 6000,
    headers: { "Content-Type": "application/json" }
  });
  return { sent: true, status: res.status, debug: config.debug ? res.data : undefined };
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushRetryQueue().catch(() => {});
  }, RETRY_BASE_MS);
  flushTimer.unref?.();
}

async function flushRetryQueue() {
  if (retryQueue.length === 0) return;
  const batch = retryQueue.splice(0, 20);
  for (const item of batch) {
    try {
      await postToGa4(item.body);
      stats.sent += 1;
      stats.retried += item.attempts > 0 ? 1 : 0;
    } catch (error) {
      item.attempts += 1;
      stats.failed += 1;
      stats.lastError = error?.message || String(error);
      if (item.attempts < MAX_RETRIES) {
        retryQueue.push(item);
      } else {
        console.warn("[ga4:mp] dropped after retries:", item.eventName, stats.lastError);
      }
    }
  }
  if (retryQueue.length > 0) scheduleFlush();
}

/**
 * Send one or more GA4 events via Measurement Protocol.
 */
export async function sendGa4Events({
  userId = null,
  clientId = null,
  events = [],
  transactionId = null,
  enqueueOnFailure = true
} = {}) {
  const config = getConfig();
  if (!config.configured || !config.enabled) {
    return { sent: false, reason: "not_configured" };
  }
  if (!events.length) return { sent: false, reason: "no_events" };

  if (transactionId) {
    const dup = await dedupKey(transactionId);
    if (dup) {
      stats.deduplicated += 1;
      return { sent: false, reason: "duplicate_transaction", transactionId };
    }
  }

  try {
    const resolvedClientId =
      clientId || (await resolveClientId({ userId, fallbackKey: transactionId || userId }));

    const body = {
      client_id: resolvedClientId,
      ...(userId ? { user_id: String(userId) } : {}),
      events: events.map((e) => ({
        name: e.name,
        params: {
          engagement_time_msec: 100,
          ...e.params
        }
      }))
    };

    const result = await postToGa4(body);
    stats.sent += 1;
    stats.lastEventAt = new Date().toISOString();
    if (events.some((e) => e.name === "purchase" || e.name === "subscribe")) {
      stats.lastPurchaseAt = stats.lastEventAt;
    }
    return { sent: true, clientId: resolvedClientId, ...result };
  } catch (error) {
    stats.failed += 1;
    stats.lastError = error?.message || String(error);
    if (enqueueOnFailure) {
      const resolvedClientId =
        clientId || (await resolveClientId({ userId, fallbackKey: transactionId || userId }));
      retryQueue.push({
        body: {
          client_id: resolvedClientId,
          ...(userId ? { user_id: String(userId) } : {}),
          events: events.map((e) => ({ name: e.name, params: e.params || {} }))
        },
        eventName: events[0]?.name,
        attempts: 0,
        at: Date.now()
      });
      scheduleFlush();
    }
    console.warn("[ga4:mp] send failed:", stats.lastError);
    return { sent: false, reason: "request_failed", error: stats.lastError };
  }
}

export async function sendPurchaseEvent(opts = {}) {
  const {
    userId,
    transactionId,
    value = 0,
    currency = "usd",
    planId,
    planName,
    clientId,
    coupon,
    tax,
    paymentMethod,
    credits
  } = opts;

  return sendGa4Events({
    userId,
    clientId,
    transactionId,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: String(transactionId),
          value: Number(value || 0) || 0,
          currency: String(currency || "usd").toUpperCase(),
          coupon: coupon || undefined,
          tax: tax != null ? Number(tax) : undefined,
          payment_type: paymentMethod || undefined,
          telecom_credits: credits != null ? Number(credits) : undefined,
          items: planId
            ? [
                {
                  item_id: String(planId),
                  item_name: planName || String(planId),
                  price: Number(value || 0) || 0,
                  quantity: 1
                }
              ]
            : []
        }
      }
    ]
  });
}

export async function sendSubscriptionEvent(opts = {}) {
  const { userId, transactionId, value, currency, planId, planName, eventName = "subscribe" } = opts;
  return sendGa4Events({
    userId,
    transactionId,
    events: [
      {
        name: eventName,
        params: {
          transaction_id: transactionId ? String(transactionId) : undefined,
          value: Number(value || 0) || 0,
          currency: String(currency || "usd").toUpperCase(),
          item_id: planId ? String(planId) : undefined,
          item_name: planName || undefined
        }
      }
    ]
  });
}

export async function sendCustomEvent({ userId, clientId, name, params = {}, transactionId = null } = {}) {
  return sendGa4Events({
    userId,
    clientId,
    transactionId,
    events: [{ name, params }]
  });
}

export function startGa4MpWorker() {
  if (flushTimer) return;
  setInterval(() => flushRetryQueue().catch(() => {}), 30_000).unref?.();
}

export default {
  sendGa4Events,
  sendPurchaseEvent,
  sendSubscriptionEvent,
  sendCustomEvent,
  isMeasurementProtocolConfigured,
  getGa4MpStats,
  startGa4MpWorker
};
