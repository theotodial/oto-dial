import express from "express";
import fs from "fs";
import path from "path";

import { PRIMARY_ADMIN_EMAIL } from "../../constants/adminAccess.js";
import SiteBuilder from "../../models/SiteBuilder.js";
import SeoSettings from "../../models/SeoSettings.js";
import EnvLog from "../../models/EnvLog.js";
import NotFoundLog from "../../models/NotFoundLog.js";

const router = express.Router();

const SITE_KEY = "default";

function isPrimaryAdmin(req) {
  const email = String(req.user?.email || "").toLowerCase().trim();
  return email && email === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

function clampArrayOfStrings(values, limit = 500) {
  if (!Array.isArray(values)) return [];
  const out = [];
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (!v) continue;
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

function readEnvFileSafe(envPath) {
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    return raw;
  } catch {
    return "";
  }
}

function parseEnv(raw = "") {
  const lines = String(raw || "").split(/\r?\n/);
  const out = new Map();
  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1);
    if (!key) continue;
    out.set(key, value);
  }
  return out;
}

function isSensitiveEnvKey(key = "") {
  return /secret|token|password|private|key|webhook|stripe|telnyx|jwt/i.test(String(key || ""));
}

const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

function validateEnvKey(key) {
  const normalized = String(key || "").trim();
  if (!normalized) return { ok: false, error: "Env var name is required" };
  if (!ENV_NAME_RE.test(normalized)) {
    return { ok: false, error: "Invalid env var name. Use A-Z, 0-9, underscore, must start with a letter/underscore." };
  }
  if (normalized.length > 120) return { ok: false, error: "Env var name is too long" };
  return { ok: true, value: normalized };
}

function validateEnvValue(value) {
  if (value === null || value === undefined) return { ok: true, value: "" };
  const raw = String(value);
  if (raw.includes("\0")) return { ok: false, error: "Env var value contains invalid characters" };
  if (/[\r\n]/.test(raw)) return { ok: false, error: "Env var value must be a single line" };
  if (raw.length > 5000) return { ok: false, error: "Env var value is too long" };
  return { ok: true, value: raw };
}

function serializeEnvValue(value) {
  const raw = String(value ?? "");
  // Quote values that contain spaces, #, or quotes for safety.
  if (!raw) return "";
  const needsQuotes = /[\s#"']/g.test(raw);
  if (!needsQuotes) return raw;
  const escaped = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function resolveEnvFilePath() {
  return process.env.ENV_FILE_PATH
    ? path.resolve(process.env.ENV_FILE_PATH)
    : path.resolve(process.cwd(), ".env");
}

function atomicWriteFile(targetPath, contents) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmp = path.join(dir, `.${base}.tmp.${Date.now()}`);
  fs.writeFileSync(tmp, contents, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, targetPath);
}

const rateState = new Map();
function rateLimit({ limit, windowMs, keyPrefix }) {
  return (req, res, next) => {
    const ip = String(req.ip || req.connection?.remoteAddress || "unknown");
    const adminId = String(req.user?._id || "unknown");
    const key = `${keyPrefix}:${adminId}:${ip}`;
    const now = Date.now();
    const bucket = rateState.get(key) || { resetAt: now + windowMs, count: 0 };
    if (now > bucket.resetAt) {
      bucket.resetAt = now + windowMs;
      bucket.count = 0;
    }
    bucket.count += 1;
    rateState.set(key, bucket);
    if (bucket.count > limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      return res.status(429).json({ success: false, error: "Rate limit exceeded. Please try again later." });
    }
    return next();
  };
}

/**
 * GET /api/admin/site/builder
 */
router.get("/builder", async (req, res) => {
  try {
    const builder = await SiteBuilder.findOne({ siteKey: SITE_KEY }).lean();
    return res.json({
      success: true,
      builder: builder || { siteKey: SITE_KEY, sections: [], themeSettings: {}, headerConfig: {} }
    });
  } catch (err) {
    console.error("Admin site builder load error:", err);
    return res.status(500).json({ success: false, error: "Failed to load site builder" });
  }
});

/**
 * PUT /api/admin/site/builder
 */
router.put("/builder", async (req, res) => {
  try {
    const payload = req.body || {};
    const next = {
      sections: Array.isArray(payload.sections) ? payload.sections : [],
      themeSettings: payload.themeSettings && typeof payload.themeSettings === "object" ? payload.themeSettings : {},
      headerConfig: payload.headerConfig && typeof payload.headerConfig === "object" ? payload.headerConfig : {}
    };

    const builder = await SiteBuilder.findOneAndUpdate(
      { siteKey: SITE_KEY },
      { $set: { ...next, siteKey: SITE_KEY } },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, builder });
  } catch (err) {
    console.error("Admin site builder save error:", err);
    return res.status(500).json({ success: false, error: "Failed to save site builder" });
  }
});

/**
 * GET /api/admin/site/seo
 */
router.get("/seo", async (req, res) => {
  try {
    const seo = await SeoSettings.findOne({ siteKey: SITE_KEY }).lean();
    return res.json({
      success: true,
      seo:
        seo || {
          siteKey: SITE_KEY,
          meta: {},
          keywords: [],
          hiddenKeywords: [],
          schema: {},
          analyticsCache: {},
          robotsTxt: "",
          redirects: []
        }
    });
  } catch (err) {
    console.error("Admin site seo load error:", err);
    return res.status(500).json({ success: false, error: "Failed to load SEO settings" });
  }
});

/**
 * PUT /api/admin/site/seo
 */
router.put("/seo", async (req, res) => {
  try {
    const payload = req.body || {};
    const next = {
      meta: payload.meta && typeof payload.meta === "object" ? payload.meta : {},
      keywords: clampArrayOfStrings(payload.keywords, 2000),
      hiddenKeywords: clampArrayOfStrings(payload.hiddenKeywords, 2000),
      schema: payload.schema && typeof payload.schema === "object" ? payload.schema : {},
      analyticsCache: payload.analyticsCache && typeof payload.analyticsCache === "object" ? payload.analyticsCache : {},
      robotsTxt: typeof payload.robotsTxt === "string" ? payload.robotsTxt : "",
      redirects: Array.isArray(payload.redirects) ? payload.redirects : []
    };

    const seo = await SeoSettings.findOneAndUpdate(
      { siteKey: SITE_KEY },
      { $set: { ...next, siteKey: SITE_KEY } },
      { upsert: true, new: true }
    ).lean();

    return res.json({ success: true, seo });
  } catch (err) {
    console.error("Admin site seo save error:", err);
    return res.status(500).json({ success: false, error: "Failed to save SEO settings" });
  }
});

/**
 * GET /api/admin/site/seo/404-logs
 * Returns recent API 404 hits (backend-side monitoring).
 */
router.get("/seo/404-logs", async (req, res) => {
  try {
    const limit = Math.min(Math.max(1, Number(req.query?.limit || 100)), 500);
    const logs = await NotFoundLog.find()
      .sort({ lastSeenAt: -1 })
      .limit(limit)
      .select("path method count lastSeenAt lastIp")
      .lean();

    return res.json({ success: true, logs });
  } catch (err) {
    console.error("Admin 404 logs error:", err);
    return res.status(500).json({ success: false, error: "Failed to load 404 logs" });
  }
});

/**
 * GET /api/admin/site/environment
 * Super-admin only (primary admin email)
 */
router.get("/environment", async (req, res) => {
  try {
    if (!isPrimaryAdmin(req)) {
      return res.status(403).json({ success: false, error: "Super-admin access required" });
    }

    const envFilePath = resolveEnvFilePath();

    const raw = readEnvFileSafe(envFilePath);
    const map = parseEnv(raw);
    const variables = Array.from(map.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({
        key,
        maskedValue: "****",
        isSensitive: isSensitiveEnvKey(key),
        hasValue: map.get(key) !== undefined && String(map.get(key)).length > 0
      }));

    return res.json({
      success: true,
      envFilePathBasename: path.basename(envFilePath),
      variables
    });
  } catch (err) {
    console.error("Admin env load error:", err);
    return res.status(500).json({ success: false, error: "Failed to load environment variables" });
  }
});

/**
 * POST /api/admin/site/environment/reveal
 * Super-admin only (primary admin email).
 */
router.post(
  "/environment/reveal",
  rateLimit({ limit: 60, windowMs: 10 * 60 * 1000, keyPrefix: "env-reveal" }),
  async (req, res) => {
    try {
      if (!isPrimaryAdmin(req)) {
        return res.status(403).json({ success: false, error: "Super-admin access required" });
      }
      const { key } = req.body || {};
      const keyCheck = validateEnvKey(key);
      if (!keyCheck.ok) {
        return res.status(400).json({ success: false, error: keyCheck.error });
      }

      const envFilePath = resolveEnvFilePath();
      const raw = readEnvFileSafe(envFilePath);
      const map = parseEnv(raw);
      const value = map.get(keyCheck.value);
      if (value === undefined) {
        return res.status(404).json({ success: false, error: "Variable not found" });
      }
      return res.json({ success: true, key: keyCheck.value, value: String(value) });
    } catch (err) {
      console.error("Env reveal error:", err);
      return res.status(500).json({ success: false, error: "Failed to reveal variable" });
    }
  }
);

/**
 * PUT /api/admin/site/environment
 * Super-admin only. Rewrites .env safely + backup + audit log.
 *
 * Body:
 * - variables: [{ key, value }]
 * - restartBackend: boolean (optional)
 * - confirm: boolean (required)
 */
router.put(
  "/environment",
  rateLimit({ limit: 12, windowMs: 10 * 60 * 1000, keyPrefix: "env-write" }),
  async (req, res) => {
    try {
      if (!isPrimaryAdmin(req)) {
        return res.status(403).json({ success: false, error: "Super-admin access required" });
      }
      const { variables, changes: changeOps, restartBackend, confirm } = req.body || {};
      if (confirm !== true) {
        return res.status(400).json({ success: false, error: "Confirmation required" });
      }
      const hasChangeOps = Array.isArray(changeOps) && changeOps.length > 0;
      const hasFullRewrite = Array.isArray(variables) && variables.length > 0;
      if (!hasChangeOps && !hasFullRewrite) {
        return res.status(400).json({
          success: false,
          error: "Provide either changes[] (recommended) or variables[]"
        });
      }
      if (hasChangeOps && changeOps.length > 200) {
        return res.status(400).json({ success: false, error: "Too many changes" });
      }
      if (hasFullRewrite && variables.length > 500) {
        return res.status(400).json({ success: false, error: "Too many variables" });
      }

      const envFilePath = resolveEnvFilePath();
      const raw = readEnvFileSafe(envFilePath);
      const lines = String(raw || "").split(/\r?\n/);
      const currentMap = parseEnv(raw);
      const nextMap = new Map(currentMap);

      if (hasFullRewrite) {
        nextMap.clear();
        for (const row of variables) {
          const keyCheck = validateEnvKey(row?.key);
          if (!keyCheck.ok) {
            return res.status(400).json({ success: false, error: keyCheck.error });
          }
          const valueCheck = validateEnvValue(row?.value);
          if (!valueCheck.ok) {
            return res.status(400).json({ success: false, error: valueCheck.error });
          }
          nextMap.set(keyCheck.value, valueCheck.value);
        }
      }

      if (hasChangeOps) {
        for (const op of changeOps) {
          const action = String(op?.action || "").toLowerCase().trim();
          const keyCheck = validateEnvKey(op?.key);
          if (!keyCheck.ok) {
            return res.status(400).json({ success: false, error: keyCheck.error });
          }
          const key = keyCheck.value;
          if (action === "delete") {
            nextMap.delete(key);
            continue;
          }
          if (action !== "add" && action !== "update" && action !== "set") {
            return res.status(400).json({ success: false, error: `Invalid change action for ${key}` });
          }
          const valueCheck = validateEnvValue(op?.value);
          if (!valueCheck.ok) {
            return res.status(400).json({ success: false, error: valueCheck.error });
          }
          nextMap.set(key, valueCheck.value);
        }
      }

      const diffs = [];
      const currentKeys = new Set(currentMap.keys());
      const nextKeys = new Set(nextMap.keys());

      for (const key of nextKeys) {
        if (!currentKeys.has(key)) {
          diffs.push({ action: "add", key });
        } else if (String(currentMap.get(key) ?? "") !== String(nextMap.get(key) ?? "")) {
          diffs.push({ action: "update", key });
        }
      }
      for (const key of currentKeys) {
        if (!nextKeys.has(key)) {
          diffs.push({ action: "delete", key });
        }
      }

      // Rewrite while preserving comments/blank lines.
      const used = new Set();
      const nextLines = [];
      for (const line of lines) {
        const trimmed = String(line || "").trim();
        if (!trimmed || trimmed.startsWith("#")) {
          nextLines.push(line);
          continue;
        }
        const idx = trimmed.indexOf("=");
        if (idx <= 0) {
          nextLines.push(line);
          continue;
        }
        const key = trimmed.slice(0, idx).trim();
        if (!nextMap.has(key)) {
          // deleted
          continue;
        }
        const serialized = serializeEnvValue(nextMap.get(key));
        nextLines.push(`${key}=${serialized}`);
        used.add(key);
      }
      for (const [key, value] of nextMap.entries()) {
        if (used.has(key)) continue;
        nextLines.push(`${key}=${serializeEnvValue(value)}`);
      }
      const normalizedOut = `${nextLines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;

      // Backup before write (if file exists).
      if (raw) {
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupPath = `${envFilePath}.backup.${stamp}`;
        try {
          fs.copyFileSync(envFilePath, backupPath);
        } catch (backupErr) {
          console.warn("Env backup failed:", backupErr?.message || backupErr);
        }
      }

      atomicWriteFile(envFilePath, normalizedOut);

      try {
        await EnvLog.create({
          adminId: req.user._id,
          ip: String(req.ip || ""),
          userAgent: String(req.get("user-agent") || ""),
          changes: diffs
        });
      } catch (logErr) {
        console.warn("Env audit log write failed:", logErr?.message || logErr);
      }

      const shouldRestart = restartBackend === true;
      res.json({
        success: true,
        changed: diffs.length,
        changes: diffs.map((c) => ({ action: c.action, key: c.key })),
        restarted: shouldRestart
      });

      if (shouldRestart) {
        setTimeout(() => {
          // Allow PM2/systemd to restart the process.
          process.exit(0);
        }, 600);
      }
    } catch (err) {
      console.error("Env update error:", err);
      return res.status(500).json({ success: false, error: "Failed to update environment variables" });
    }
  }
);

export default router;

