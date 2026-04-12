import { createClient } from "redis";

const DEFAULT_TTL_SECONDS = 60;
const memoryCache = new Map();

let redisClientPromise = null;
let redisUnavailableLogged = false;

function now() {
  return Date.now();
}

function readMemory(key) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeMemory(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  memoryCache.set(key, {
    value,
    expiresAt: now() + Math.max(1, ttlSeconds) * 1000,
  });
}

function deleteMemory(key) {
  memoryCache.delete(key);
}

async function getRedisClient() {
  const redisUrl = String(process.env.REDIS_URL || "").trim();
  if (!redisUrl) return null;

  if (!redisClientPromise) {
    const client = createClient({ url: redisUrl });
    client.on("error", (err) => {
      if (!redisUnavailableLogged) {
        redisUnavailableLogged = true;
        console.warn("[cache] Redis unavailable, using in-memory fallback:", err?.message || err);
      }
    });

    redisClientPromise = client
      .connect()
      .then(() => {
        console.log("[cache] Redis cache connected");
        return client;
      })
      .catch((err) => {
        if (!redisUnavailableLogged) {
          redisUnavailableLogged = true;
          console.warn("[cache] Redis connect failed, using in-memory fallback:", err?.message || err);
        }
        redisClientPromise = null;
        return null;
      });
  }

  return redisClientPromise;
}

export const cacheKeys = {
  userProfile(userId) {
    return `user-profile:${String(userId)}`;
  },
  subscription(userId) {
    return `subscription:${String(userId)}`;
  },
};

export async function getCachedJson(key) {
  const memoryValue = readMemory(key);
  if (memoryValue !== null) {
    return memoryValue;
  }

  const client = await getRedisClient();
  if (!client?.isOpen) {
    return null;
  }

  try {
    const raw = await client.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    writeMemory(key, parsed);
    return parsed;
  } catch (err) {
    console.warn("[cache] Redis read failed:", err?.message || err);
    return null;
  }
}

export async function setCachedJson(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  writeMemory(key, value, ttlSeconds);

  const client = await getRedisClient();
  if (!client?.isOpen) {
    return;
  }

  try {
    await client.set(key, JSON.stringify(value), {
      EX: Math.max(1, ttlSeconds),
    });
  } catch (err) {
    console.warn("[cache] Redis write failed:", err?.message || err);
  }
}

export async function deleteCachedKey(key) {
  deleteMemory(key);

  const client = await getRedisClient();
  if (!client?.isOpen) {
    return;
  }

  try {
    await client.del(key);
  } catch (err) {
    console.warn("[cache] Redis delete failed:", err?.message || err);
  }
}
