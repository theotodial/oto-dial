/**
 * In-process FIFO queue for outbound SMS with per-user spacing (default 1 msg/sec).
 * Processor is registered from index.js to avoid circular imports with smsOutboundService.
 */

const queue = [];
let processing = false;

/** @type {((job: { smsDocId: string, userId: string, reservationKey: string }) => Promise<void>) | null} */
let processor = null;

const lastSentByUser = new Map();
const MIN_GAP_MS = Math.max(
  100,
  Number.parseInt(String(process.env.SMS_OUTBOUND_MIN_GAP_MS || "1000"), 10) || 1000
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** @param {(job: { smsDocId: string, userId: string, reservationKey: string }) => Promise<void>} fn */
export function registerSmsOutboundProcessor(fn) {
  processor = fn;
}

async function throttleUser(userId) {
  const uid = String(userId);
  const last = lastSentByUser.get(uid) || 0;
  const elapsed = Date.now() - last;
  if (elapsed < MIN_GAP_MS) {
    await sleep(MIN_GAP_MS - elapsed);
  }
  lastSentByUser.set(uid, Date.now());
}

async function runLoop() {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0 && processor) {
      const job = queue.shift();
      if (!job) continue;
      try {
        await throttleUser(job.userId);
        await processor(job);
      } catch (err) {
        console.error("[smsQueue] job error:", err?.message || err);
      }
    }
  } finally {
    processing = false;
    if (queue.length > 0 && processor) {
      void runLoop();
    }
  }
}

/** @param {{ smsDocId: string, userId: string, reservationKey: string }} job */
export function enqueueOutboundSms(job) {
  queue.push(job);
  void runLoop();
}

export function startSmsOutboundQueueWorker() {
  console.log(`[smsQueue] in-process queue ready (min gap ${MIN_GAP_MS}ms / user)`);
}
