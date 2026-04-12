import dns from "dns";
import mongoose from "mongoose";
import { convertMongoSrvToDirectUri } from "./mongoSrvDoh.js";

/**
 * Forcing public DNS breaks on networks that block 8.8.8.8 / 1.1.1.1 (common corporate VPNs).
 * Set MONGO_DNS_USE_PUBLIC=true only if you need it.
 */
if (process.env.MONGO_DNS_USE_PUBLIC === "true") {
  dns.setDefaultResultOrder("ipv4first");
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
  console.log("[MongoDB] Using public DNS (MONGO_DNS_USE_PUBLIC=true)");
}

function isSrvLookupFailure(err) {
  const code = err?.code;
  const msg = String(err?.message || err || "");
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ESERVFAIL" ||
    code === "ETIMEOUT" ||
    msg.includes("querySrv") ||
    msg.includes("_mongodb._tcp")
  );
}

function isMongoSrvUri(uri) {
  return typeof uri === "string" && uri.toLowerCase().startsWith("mongodb+srv://");
}

function redactUri(u) {
  return u ? String(u).replace(/:[^:@]+@/, ":****@") : "";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Atlas / VPN / Windows SRV-fallback paths often need >5s for TLS + replica set discovery. */
function getMongoClientOptions() {
  const connectTimeoutMS = Math.max(
    10_000,
    Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 30_000)
  );
  const serverSelectionTimeoutMS = Math.max(
    10_000,
    Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 30_000)
  );
  return {
    maxPoolSize: 50,
    minPoolSize: 0,
    maxIdleTimeMS: 300_000,
    waitQueueTimeoutMS: 10_000,
    connectTimeoutMS,
    socketTimeoutMS: Math.max(30_000, Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 60_000)),
    serverSelectionTimeoutMS,
    family: 4,
  };
}

const connectDB = async () => {
  const primary =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URL;
  const direct =
    process.env.MONGODB_URI_DIRECT ||
    process.env.MONGO_URI_DIRECT ||
    "";

  if (!primary && !direct) {
    throw new Error("Set MONGODB_URI (or MONGO_URI) in .env");
  }

  const attempts = Math.max(1, Math.min(5, Number(process.env.MONGO_CONNECT_RETRIES || 3)));
  const delayMs = Math.max(500, Number(process.env.MONGO_CONNECT_RETRY_MS || 2000));
  const resolvedAttempts = Math.max(
    1,
    Math.min(5, Number(process.env.MONGO_RESOLVED_URI_RETRIES || 3))
  );
  const dohDisabled = process.env.MONGO_DISABLE_DOH === "true";

  const tryConnect = async (uri, label) => {
    await mongoose.disconnect().catch(() => {});
    console.log(`[MongoDB] Connecting (${label}):`, redactUri(uri));
    await mongoose.connect(uri, getMongoClientOptions());
    console.log("MongoDB Connected");
  };

  const urisToTry = [];
  if (primary) urisToTry.push({ uri: primary, label: "primary (MONGODB_URI)" });
  if (direct && direct !== primary) {
    urisToTry.push({ uri: direct, label: "fallback (MONGODB_URI_DIRECT)" });
  }

  let lastErr = null;

  for (let u = 0; u < urisToTry.length; u++) {
    const { uri, label } = urisToTry[u];
    for (let i = 0; i < attempts; i++) {
      try {
        await tryConnect(uri, label);
        return;
      } catch (err) {
        lastErr = err;
        console.error(
          `[MongoDB] Attempt ${i + 1}/${attempts} failed (${label}):`,
          err?.message || err
        );
        if (i < attempts - 1) {
          await sleep(delayMs);
        }
      }
    }

    const srvFail = lastErr && isSrvLookupFailure(lastErr);
    if (
      srvFail &&
      isMongoSrvUri(uri) &&
      !dohDisabled
    ) {
      try {
        console.warn(
          "[MongoDB] Local SRV lookup failed — resolving Atlas via Windows DNS / DoH (no Node querySrv)..."
        );
        const resolved = await convertMongoSrvToDirectUri(uri);
        if (resolved) {
          for (let r = 0; r < resolvedAttempts; r++) {
            try {
              await tryConnect(resolved, "resolved (mongodb+srv → mongodb://)");
              return;
            } catch (resolvedErr) {
              lastErr = resolvedErr;
              console.error(
                `[MongoDB] Resolved direct URI connect failed (${r + 1}/${resolvedAttempts}):`,
                resolvedErr?.message || resolvedErr
              );
              if (r < resolvedAttempts - 1) {
                await sleep(delayMs);
              }
            }
          }
          console.error(
            "[MongoDB] Resolved mongodb:// URI could not connect after retries. Set MONGODB_URI_DIRECT to Atlas standard connection string, or allow outbound TCP 27017 / fix VPN firewall."
          );
        } else {
          console.error(
            "[MongoDB] Could not resolve SRV to mongodb:// (no host list). Set MONGODB_URI_DIRECT to a standard mongodb:// string from Atlas."
          );
        }
      } catch (dohErr) {
        console.error("[MongoDB] DNS-over-HTTPS resolution failed:", dohErr?.message || dohErr);
        lastErr = dohErr;
      }
    }

    if (srvFail && u === 0 && !direct && dohDisabled) {
      console.error(`
[MongoDB] SRV lookup failed and MONGO_DISABLE_DOH=true. Options:
  • Remove MONGO_DISABLE_DOH or set MONGO_DISABLE_DOH=false (enables HTTPS DNS fallback).
  • Set MONGODB_URI_DIRECT to Atlas "standard connection string" (mongodb://...).
`);
    } else if (srvFail && u === 0 && !direct) {
      console.error(`
[MongoDB] If DoH also failed: check firewall for HTTPS, or set MONGODB_URI_DIRECT (mongodb://...) from Atlas.
`);
    }
    if (u < urisToTry.length - 1) {
      console.warn("[MongoDB] Trying next connection string...");
    }
  }

  throw lastErr || new Error("MongoDB connection failed");
};

export default connectDB;
