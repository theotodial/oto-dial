/**
 * Rolling webhook latency telemetry (persisted samples + in-memory ring for fast admin reads).
 */

import WebhookLatencySample from "../models/WebhookLatencySample.js";
import { getPressureSnapshot } from "./telecomBackpressureService.js";
import { enqueueWebhookLatencyTelemetry } from "./telemetryBufferService.js";
import { shouldSuppressNonCriticalWebhookWork } from "./webhookBurstProtectionService.js";

const ring = [];
const RING_MAX = 500;

function pushRing(entry) {
  ring.push(entry);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
}

/**
 * @param {object} p
 */
export async function persistWebhookLatencySample(p = {}) {
  const doc = {
    provider: p.provider || "telnyx",
    providerEventId: p.providerEventId != null ? String(p.providerEventId) : null,
    callId: p.callId || null,
    userId: p.userId || null,
    eventType: p.eventType || null,
    providerTimestamp: p.providerTimestamp ? new Date(p.providerTimestamp) : null,
    receiveTimestamp: p.receiveTimestamp ? new Date(p.receiveTimestamp) : null,
    processStart: p.processStart ? new Date(p.processStart) : null,
    processEnd: p.processEnd ? new Date(p.processEnd) : null,
    transitionAppliedAt: p.transitionAppliedAt ? new Date(p.transitionAppliedAt) : null,
    socketBroadcastAt: p.socketBroadcastAt ? new Date(p.socketBroadcastAt) : null,
    deltasMs: computeDeltas(p),
  };
  pushRing({ ...doc, createdAt: new Date() });
  if (shouldSuppressNonCriticalWebhookWork("duplicate_telemetry")) {
    return;
  }
  const level = getPressureSnapshot().pressureLevel;
  const preferBuffer = level === "elevated" || level === "high" || level === "critical";
  try {
    if (preferBuffer) enqueueWebhookLatencyTelemetry(doc);
    else await WebhookLatencySample.create(doc);
  } catch {
    /* non-fatal */
  }
}

function computeDeltas(p) {
  const pt = p.providerTimestamp ? new Date(p.providerTimestamp).getTime() : null;
  const rv = p.receiveTimestamp ? new Date(p.receiveTimestamp).getTime() : null;
  const ps = p.processStart ? new Date(p.processStart).getTime() : null;
  const pe = p.processEnd ? new Date(p.processEnd).getTime() : null;
  const ta = p.transitionAppliedAt ? new Date(p.transitionAppliedAt).getTime() : null;
  const sb = p.socketBroadcastAt ? new Date(p.socketBroadcastAt).getTime() : null;
  const d = {};
  if (pt != null && rv != null) d.providerToReceive = rv - pt;
  if (rv != null && ps != null) d.receiveToProcessStart = ps - rv;
  if (ps != null && pe != null) d.processing = pe - ps;
  if (pe != null && ta != null) d.processToTransition = ta - pe;
  if (ta != null && sb != null) d.transitionToBroadcast = sb - ta;
  if (pt != null && sb != null) d.total = sb - pt;
  return d;
}

export function getWebhookLatencyRingSnapshot(limit = 100) {
  return ring.slice(-Math.min(RING_MAX, Math.max(1, limit)));
}

export async function aggregateWebhookLatencyFromDb(sinceMs = 3600000) {
  const since = new Date(Date.now() - sinceMs);
  const rows = await WebhookLatencySample.find({ createdAt: { $gte: since } })
    .select("deltasMs createdAt provider eventType")
    .sort({ createdAt: -1 })
    .limit(2000)
    .lean()
    .catch(() => []);
  let n = 0;
  let sumTotal = 0;
  for (const r of rows) {
    const t = r.deltasMs?.total;
    if (Number.isFinite(t)) {
      n += 1;
      sumTotal += t;
    }
  }
  return {
    sampleCount: rows.length,
    totalLatencyCount: n,
    avgTotalMs: n ? Math.round(sumTotal / n) : null,
    ring: getWebhookLatencyRingSnapshot(50),
  };
}
