/**
 * liveIntelligenceStore
 *
 * Fast in-process store for active live sessions + event stream.
 * Optional Redis write-through when REDIS_URL is configured (multi-instance /
 * restart resilience). Reads always prefer local memory on this worker.
 */
import { getRedisClient } from "../cache.service.js";

const REDIS_SESSIONS_KEY = "oto:live:v1:sessions";
const REDIS_EVENTS_KEY = "oto:live:v1:events";
const MAX_EVENTS = 500;
const MAX_TIMELINE = 80;
const MAX_PAGE_HISTORY = 40;

/** sessionId -> session document */
const sessions = new Map();
/** recent global events (newest first) */
const events = [];

let redisSyncTimer = null;

export function getMaxTimeline() {
  return MAX_TIMELINE;
}

export function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

export function setSession(sessionId, doc) {
  if (!sessionId || !doc) return;
  sessions.set(sessionId, doc);
  scheduleRedisSync();
}

export function deleteSession(sessionId) {
  sessions.delete(sessionId);
  scheduleRedisSync();
}

export function getAllSessions() {
  return Array.from(sessions.values());
}

export function pushEvent(event) {
  if (!event) return;
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  scheduleRedisSync();
}

export function getRecentEvents(limit = 100) {
  return events.slice(0, Math.min(limit, events.length));
}

export function trimSessionCollections(session) {
  if (!session) return session;
  if (Array.isArray(session.timeline) && session.timeline.length > MAX_TIMELINE) {
    session.timeline.length = MAX_TIMELINE;
  }
  if (Array.isArray(session.pageHistory) && session.pageHistory.length > MAX_PAGE_HISTORY) {
    session.pageHistory.length = MAX_PAGE_HISTORY;
  }
  if (Array.isArray(session.events) && session.events.length > MAX_TIMELINE) {
    session.events.length = MAX_TIMELINE;
  }
  return session;
}

function scheduleRedisSync() {
  if (redisSyncTimer) return;
  redisSyncTimer = setTimeout(() => {
    redisSyncTimer = null;
    syncToRedis().catch(() => {});
  }, 800);
  redisSyncTimer.unref?.();
}

async function syncToRedis() {
  const client = await getRedisClient();
  if (!client) return;

  const payload = {};
  for (const [sid, doc] of sessions.entries()) {
    payload[sid] = JSON.stringify(doc);
  }
  await client.del(REDIS_SESSIONS_KEY);
  if (Object.keys(payload).length) {
    await client.hSet(REDIS_SESSIONS_KEY, payload);
  }
  await client.del(REDIS_EVENTS_KEY);
  if (events.length) {
    const serialized = events.slice(0, MAX_EVENTS).map((e) => JSON.stringify(e));
    await client.rPush(REDIS_EVENTS_KEY, serialized);
  }
}

export async function hydrateFromRedis() {
  const client = await getRedisClient();
  if (!client) return;
  try {
    const raw = await client.hGetAll(REDIS_SESSIONS_KEY);
    for (const [sid, json] of Object.entries(raw || {})) {
      try {
        sessions.set(sid, JSON.parse(json));
      } catch {
        /* skip corrupt */
      }
    }
    const evRaw = await client.lRange(REDIS_EVENTS_KEY, 0, MAX_EVENTS - 1);
    events.length = 0;
    for (const line of evRaw || []) {
      try {
        events.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
}

export default {
  getSession,
  setSession,
  deleteSession,
  getAllSessions,
  pushEvent,
  getRecentEvents,
  trimSessionCollections,
  hydrateFromRedis
};
