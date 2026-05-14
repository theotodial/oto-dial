/**
 * Rolling performance telemetry (process + datastore + telecom hints).
 */

import mongoose from "mongoose";
import { performance } from "node:perf_hooks";
import PerformanceHealthSnapshot from "../models/PerformanceHealthSnapshot.js";
import Call from "../models/Call.js";
import { computeTelecomPressure, getPressureSnapshot } from "./telecomBackpressureService.js";
import { ACTIVE_CALL_STATUSES } from "../utils/callStateMachine.js";

const ring = [];
const RING_MAX = 120;
let lastLagMs = null;
let ioRef = null;
let lastInterval = null;

export function registerPerformanceTelemetryIo(io) {
  ioRef = io;
}

function pushRing(entry) {
  ring.push(entry);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
}

function measureEventLoopLag() {
  const start = performance.now();
  setImmediate(() => {
    lastLagMs = Math.max(0, Math.round(performance.now() - start));
  });
}

async function sampleOnce() {
  measureEventLoopLag();
  await new Promise((r) => setTimeout(r, 35));
  const mem = process.memoryUsage();

  const pressure = await computeTelecomPressure();
  const hints = pressure.hints || {};
  const mongoPingMs = hints.mongoPingMs ?? null;
  const redisPingMs = hints.redisPingMs ?? null;
  let activeSockets = null;
  try {
    const nsp = ioRef?.of?.("/user");
    activeSockets =
      (nsp && typeof nsp.sockets?.size === "number" ? nsp.sockets.size : null) ??
      ioRef?.engine?.clientsCount ??
      null;
  } catch {
    activeSockets = null;
  }

  let activeCalls = null;
  try {
    activeCalls = await Call.countDocuments({ status: { $in: ACTIVE_CALL_STATUSES } });
  } catch {
    activeCalls = null;
  }

  const entry = {
    capturedAt: new Date().toISOString(),
    eventLoopLagMs: lastLagMs,
    rssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    heapTotalBytes: mem.heapTotal,
    externalBytes: mem.external,
    mongoPingMs,
    redisPingMs,
    webhookThroughput60s: hints.webhooksPer60s ?? null,
    transitionThroughput60s: hints.transitionsPer60s ?? null,
    activeSockets,
    activeCalls,
    billingWorkerActiveCallsHint: hints.activeCallsHint ?? null,
    pressureScore: pressure.pressureScore,
    pressureLevel: pressure.pressureLevel,
    degradedMode: pressure.degradedMode,
  };
  pushRing(entry);

  try {
    await PerformanceHealthSnapshot.create({
      capturedAt: new Date(),
      eventLoopLagMs: entry.eventLoopLagMs,
      rssBytes: entry.rssBytes,
      heapUsedBytes: entry.heapUsedBytes,
      heapTotalBytes: entry.heapTotalBytes,
      externalBytes: entry.externalBytes,
      mongoPingMs: entry.mongoPingMs,
      redisPingMs: entry.redisPingMs,
      webhookThroughput60s: entry.webhookThroughput60s,
      transitionThroughput60s: entry.transitionThroughput60s,
      activeSockets: entry.activeSockets,
      activeCalls: entry.activeCalls,
      billingWorkerActiveCallsHint: entry.billingWorkerActiveCallsHint,
      pressureScore: entry.pressureScore,
      pressureLevel: entry.pressureLevel,
      degradedMode: entry.degradedMode,
    });
  } catch {
    /* non-fatal */
  }
}

export function startPerformanceTelemetryService() {
  if (lastInterval) return;
  const period = Number(process.env.PERF_TELEMETRY_PERIOD_MS || 15_000);
  void sampleOnce();
  lastInterval = setInterval(() => {
    void sampleOnce();
  }, period);
  if (typeof lastInterval.unref === "function") lastInterval.unref();
}

export function getPerformanceTelemetryRing() {
  return ring.slice();
}

export async function getLatestPerformanceHealthFromDb() {
  return PerformanceHealthSnapshot.findOne({}).sort({ capturedAt: -1 }).lean();
}

export function getPerformanceTelemetryQuickSnapshot() {
  const mem = process.memoryUsage();
  const p = getPressureSnapshot();
  return {
    memory: mem,
    pressure: p,
    ringTail: ring.slice(-12),
  };
}
