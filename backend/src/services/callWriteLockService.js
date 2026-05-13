import { randomUUID } from "crypto";
import { getRedisClient } from "./cache.service.js";

const LOCAL_LOCKS = new Map();
const DEFAULT_LOCK_MS = Number(process.env.CALL_WRITE_LOCK_MS || 8000);
const POLL_MS = 30;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logLockEvent(event, details = {}) {
  console.log("[CALL WRITE LOCK]", {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

function tryAcquireLocal(lockKey, ownerId, leaseMs) {
  const now = Date.now();
  const existing = LOCAL_LOCKS.get(lockKey);
  if (existing && existing.expiresAt > now) return false;
  LOCAL_LOCKS.set(lockKey, { ownerId, expiresAt: now + leaseMs });
  return true;
}

function releaseLocal(lockKey, ownerId) {
  const existing = LOCAL_LOCKS.get(lockKey);
  if (!existing) return;
  if (existing.ownerId !== ownerId) return;
  LOCAL_LOCKS.delete(lockKey);
}

async function tryAcquireRedis(lockKey, ownerId, leaseMs) {
  const client = await getRedisClient();
  if (!client?.isOpen) return { acquired: false, available: false };
  const ok = await client.set(lockKey, ownerId, { PX: leaseMs, NX: true });
  return { acquired: ok === "OK", available: true };
}

async function releaseRedis(lockKey, ownerId) {
  const client = await getRedisClient();
  if (!client?.isOpen) return;
  const current = await client.get(lockKey);
  if (current !== ownerId) return;
  await client.del(lockKey);
}

export async function withCallWriteLock(callId, fn, options = {}) {
  const lockId = String(callId || "");
  if (!lockId) {
    return { ok: false, reason: "invalid_call_id" };
  }
  const lockKey = `lock:call:${lockId}`;
  const ownerId = randomUUID();
  const leaseMs = Math.max(500, Number(options.leaseMs || DEFAULT_LOCK_MS));
  const timeoutMs = Math.max(100, Number(options.timeoutMs || leaseMs));
  const started = Date.now();
  let acquired = false;
  let mode = "memory";

  while (!acquired && Date.now() - started < timeoutMs) {
    const redisTry = await tryAcquireRedis(lockKey, ownerId, leaseMs);
    if (redisTry.available) {
      mode = "redis";
      acquired = redisTry.acquired;
    } else {
      mode = "memory";
      acquired = tryAcquireLocal(lockKey, ownerId, leaseMs);
    }
    if (!acquired) {
      await sleep(POLL_MS);
    }
  }

  if (!acquired) {
    logLockEvent("call_write_lock_skipped", {
      callId: lockId,
      lockKey,
      mode,
      reason: "lock_not_acquired",
    });
    return { ok: false, reason: "call_write_lock_skipped" };
  }

  try {
    const value = await fn();
    return { ok: true, value };
  } finally {
    try {
      if (mode === "redis") {
        await releaseRedis(lockKey, ownerId);
      } else {
        releaseLocal(lockKey, ownerId);
      }
    } catch {
      // lock release best-effort
    }
  }
}

export async function callWriteLock(callId, fn, options = {}) {
  return withCallWriteLock(callId, fn, options);
}
