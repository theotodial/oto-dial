/**
 * Batches low-priority telemetry Mongo writes. Never buffers billing, ledger,
 * EconomicTimeline, call transitions, or telecom sequence rows.
 */

import WebhookLatencySample from "../models/WebhookLatencySample.js";
import { getPressureSnapshot } from "./telecomBackpressureService.js";

const FLUSH_MS = Number(process.env.TELEMETRY_BUFFER_FLUSH_MS || 5000);
const MAX_BATCH = Number(process.env.TELEMETRY_BUFFER_MAX_BATCH || 40);
const MAX_QUEUE = Number(process.env.TELEMETRY_BUFFER_MAX_QUEUE || 2000);

/** @type {object[]} */
let webhookLatencyBatch = [];
let droppedLowPrioritySamples = 0;
let flushTimer = null;

function pressureDropFactor() {
  const p = getPressureSnapshot();
  if (p.pressureLevel === "critical") return 4;
  if (p.pressureLevel === "high") return 2;
  if (p.pressureLevel === "elevated") return 1.5;
  return 1;
}

function trimQueueForPressure() {
  const cap = Math.max(50, Math.floor(MAX_QUEUE / pressureDropFactor()));
  while (webhookLatencyBatch.length > cap) {
    webhookLatencyBatch.shift();
    droppedLowPrioritySamples += 1;
  }
}

async function flushWebhookLatencyBatch() {
  const batch = webhookLatencyBatch.splice(0, MAX_BATCH);
  if (!batch.length) return;
  try {
    await WebhookLatencySample.insertMany(batch, { ordered: false });
  } catch {
    /* non-fatal */
  }
}

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushWebhookLatencyBatch();
  }, FLUSH_MS);
  if (typeof flushTimer.unref === "function") flushTimer.unref();
}

/**
 * Queue a WebhookLatencySample-shaped doc for insertMany. Ring buffer in
 * webhookLatencyService still receives immediate samples when wired there.
 */
export function enqueueWebhookLatencyTelemetry(doc) {
  trimQueueForPressure();
  webhookLatencyBatch.push(doc);
  ensureFlushTimer();
  if (webhookLatencyBatch.length >= MAX_BATCH) void flushWebhookLatencyBatch();
}

export function getTelemetryBufferStats() {
  return {
    webhookLatencyQueued: webhookLatencyBatch.length,
    droppedLowPrioritySamples,
    flushMs: FLUSH_MS,
  };
}

export async function flushTelemetryBuffersNow() {
  await flushWebhookLatencyBatch();
}
