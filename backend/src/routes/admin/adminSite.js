import express from "express";
import fs from "fs";
import path from "path";

import { PRIMARY_ADMIN_EMAIL } from "../../constants/adminAccess.js";
import SiteBuilder from "../../models/SiteBuilder.js";
import SeoSettings from "../../models/SeoSettings.js";

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
 * GET /api/admin/site/environment
 * Super-admin only (primary admin email)
 */
router.get("/environment", async (req, res) => {
  try {
    if (!isPrimaryAdmin(req)) {
      return res.status(403).json({ success: false, error: "Super-admin access required" });
    }

    const envFilePath = process.env.ENV_FILE_PATH
      ? path.resolve(process.env.ENV_FILE_PATH)
      : path.resolve(process.cwd(), ".env");

    const raw = readEnvFileSafe(envFilePath);
    const map = parseEnv(raw);
    const variables = Array.from(map.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({
        key,
        maskedValue: "****"
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

export default router;

