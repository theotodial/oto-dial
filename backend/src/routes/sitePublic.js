import express from "express";
import crypto from "crypto";

import SiteBuilder from "../models/SiteBuilder.js";
import SeoSettings from "../models/SeoSettings.js";
import Blog from "../models/Blog.js";

const router = express.Router();

const SITE_KEY = "default";

function resolveFrontendBaseUrl() {
  const configured = String(process.env.FRONTEND_URL || process.env.APP_URL || "").trim();
  if (!configured) return "";
  return configured.replace(/\/+$/, "");
}

function buildEtag(payload) {
  const json = JSON.stringify(payload || {});
  return crypto.createHash("sha1").update(json).digest("hex");
}

function sendCachedJson(req, res, payload, { cacheSeconds = 60 } = {}) {
  const etag = buildEtag(payload);
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", `public, max-age=${cacheSeconds}, stale-while-revalidate=300`);
  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }
  return res.json(payload);
}

/**
 * GET /api/site/homepage
 * Public homepage structure JSON (rendered client-side by frontend).
 */
router.get("/homepage", async (req, res) => {
  try {
    const builder = await SiteBuilder.findOne({ siteKey: SITE_KEY })
      .select("published sections themeSettings headerConfig updatedAt")
      .lean();

    const payload = {
      success: true,
      homepage: builder
        ? {
            published: builder.published === true,
            sections: Array.isArray(builder.sections) ? builder.sections : [],
            themeSettings: builder.themeSettings || {},
            headerConfig: builder.headerConfig || {},
            updatedAt: builder.updatedAt || null
          }
        : {
            published: false,
            sections: [],
            themeSettings: {},
            headerConfig: {},
            updatedAt: null
          }
    };

    return sendCachedJson(req, res, payload, { cacheSeconds: 30 });
  } catch (err) {
    console.error("Public homepage load error:", err);
    return res.status(500).json({ success: false, error: "Failed to load homepage" });
  }
});

/**
 * GET /api/site/seo
 * Public SEO settings for client-side head injection.
 */
router.get("/seo", async (req, res) => {
  try {
    const seo = await SeoSettings.findOne({ siteKey: SITE_KEY })
      .select("meta keywords hiddenKeywords schema updatedAt")
      .lean();

    const payload = {
      success: true,
      seo: seo
        ? {
            meta: seo.meta || {},
            keywords: Array.isArray(seo.keywords) ? seo.keywords : [],
            hiddenKeywords: Array.isArray(seo.hiddenKeywords) ? seo.hiddenKeywords : [],
            schema: seo.schema || {},
            updatedAt: seo.updatedAt || null
          }
        : {
            meta: {},
            keywords: [],
            hiddenKeywords: [],
            schema: {},
            updatedAt: null
          }
    };

    return sendCachedJson(req, res, payload, { cacheSeconds: 60 });
  } catch (err) {
    console.error("Public SEO load error:", err);
    return res.status(500).json({ success: false, error: "Failed to load SEO settings" });
  }
});

/**
 * GET /api/site/robots.txt
 */
router.get("/robots.txt", async (_req, res) => {
  try {
    const seo = await SeoSettings.findOne({ siteKey: SITE_KEY }).select("robotsTxt").lean();
    const frontendBaseUrl = resolveFrontendBaseUrl();
    const sitemapUrl = frontendBaseUrl ? `${frontendBaseUrl}/sitemap.xml` : "";

    const raw = String(seo?.robotsTxt || "").trim();
    const fallback = [
      "User-agent: *",
      "Allow: /",
      sitemapUrl ? `Sitemap: ${sitemapUrl}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const body = raw || fallback;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(body);
  } catch (err) {
    console.error("Robots generation error:", err);
    return res.status(500).send("User-agent: *\nAllow: /\n");
  }
});

/**
 * GET /api/site/sitemap.xml
 * Lightweight sitemap generator (homepage + blog index + published posts).
 */
router.get("/sitemap.xml", async (_req, res) => {
  try {
    const baseUrl = resolveFrontendBaseUrl();
    if (!baseUrl) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
    }

    const posts = await Blog.find({ status: "published" }).select("slug updatedAt publishedAt").lean();
    const urls = [
      { loc: `${baseUrl}/`, changefreq: "daily", priority: "1.0" },
      { loc: `${baseUrl}/blog`, changefreq: "daily", priority: "0.8" }
    ];
    for (const post of posts || []) {
      if (!post?.slug) continue;
      urls.push({
        loc: `${baseUrl}/blog/${encodeURIComponent(post.slug)}`,
        changefreq: "weekly",
        priority: "0.6",
        lastmod: (post.updatedAt || post.publishedAt || null)
          ? new Date(post.updatedAt || post.publishedAt).toISOString()
          : null
      });
    }

    const urlXml = urls
      .map((u) => {
        const lastmod = u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : "";
        const changefreq = u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : "";
        const priority = u.priority ? `<priority>${u.priority}</priority>` : "";
        return `<url><loc>${u.loc}</loc>${lastmod}${changefreq}${priority}</url>`;
      })
      .join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlXml}</urlset>`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res.status(200).send(xml);
  } catch (err) {
    console.error("Sitemap generation error:", err);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`);
  }
});

export default router;

