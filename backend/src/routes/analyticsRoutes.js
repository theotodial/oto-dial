import express from "express";
import Analytics from "../models/Analytics.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import StripeInvoice from "../models/StripeInvoice.js";
import authenticateUser from "../middleware/authenticateUser.js";
import requireAdmin from "../middleware/requireAdmin.js";
import geoip from "geoip-lite";
import {
  getGoogleAnalyticsDashboardData,
  getGoogleAnalyticsConfigStatus
} from "../services/googleAnalyticsService.js";

const router = express.Router();

const REALTIME_WINDOW_PRESETS = {
  "15m": 15,
  "30m": 30,
  "45m": 45,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "12h": 720,
  "24h": 1440,
  "28h": 1680,
  "72h": 4320
};

const SEARCH_DOMAINS = [
  "google.",
  "bing.com",
  "yahoo.",
  "duckduckgo.com",
  "baidu.com",
  "yandex."
];

const SOCIAL_DOMAINS = [
  "facebook.com",
  "m.facebook.com",
  "l.facebook.com",
  "instagram.com",
  "l.instagram.com",
  "threads.net",
  "twitter.com",
  "x.com",
  "t.co",
  "linkedin.com",
  "lnkd.in",
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "pinterest.com",
  "tiktok.com",
  "snapchat.com",
  "t.snapchat.com",
  "telegram.org",
  "t.me",
  "discord.com",
  "discord.gg",
  "whatsapp.com"
];

const EMAIL_DOMAINS = [
  "mail.google.com",
  "outlook.live.com",
  "mail.yahoo.com",
  "proton.me",
  "protonmail.com",
  "icloud.com"
];

const SEARCH_SOURCE_HINTS = ["google", "bing", "yahoo", "duckduckgo", "baidu", "yandex"];
const SOCIAL_SOURCE_HINTS = [
  "snapchat",
  "instagram",
  "facebook",
  "twitter",
  "tiktok",
  "linkedin",
  "youtube",
  "reddit",
  "pinterest",
  "telegram",
  "whatsapp",
  "threads",
  "discord"
];
const EMAIL_SOURCE_HINTS = ["email", "newsletter", "mailchimp", "sendgrid", "brevo", "klaviyo"];
const SOCIAL_PLATFORM_KEYS = new Set([
  "snapchat",
  "instagram",
  "facebook",
  "x",
  "linkedin",
  "youtube",
  "tiktok",
  "reddit",
  "pinterest",
  "telegram",
  "whatsapp",
  "threads",
  "discord"
]);

function parseRealtimeWindowKey(rawValue) {
  const key = String(rawValue || "15m").trim().toLowerCase();
  if (REALTIME_WINDOW_PRESETS[key]) {
    return key;
  }
  return "15m";
}

function getInternalHostSet() {
  const hosts = new Set(["otodial.com", "www.otodial.com", "localhost", "127.0.0.1"]);
  const envUrls = [process.env.FRONTEND_URL, process.env.BACKEND_URL];

  envUrls.forEach((urlValue) => {
    if (!urlValue) return;
    try {
      const parsed = new URL(urlValue);
      if (parsed.hostname) {
        hosts.add(parsed.hostname.toLowerCase());
      }
    } catch {
      // Ignore malformed env URLs.
    }
  });

  return hosts;
}

function safeParseUrl(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed);
  } catch {
    try {
      if (trimmed.startsWith("/") || trimmed.startsWith("?")) {
        return new URL(trimmed, "https://otodial.com");
      }
    } catch {
      // Ignore malformed relative path.
    }
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function normalizeSourceLabel(source) {
  const value = String(source || "").toLowerCase();
  if (!value) return "direct";
  if (value.includes("snapchat")) return "snapchat";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook") || value.includes("fb.com")) return "facebook";
  if (value.includes("threads")) return "threads";
  if (value.includes("x.com") || value.includes("twitter") || value.includes("t.co")) return "x";
  if (value.includes("linkedin") || value.includes("lnkd.in")) return "linkedin";
  if (value.includes("youtube") || value.includes("youtu.be")) return "youtube";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("reddit")) return "reddit";
  if (value.includes("pinterest")) return "pinterest";
  if (value.includes("telegram") || value.includes("t.me")) return "telegram";
  if (value.includes("discord")) return "discord";
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("google")) return "google";
  if (value.includes("bing")) return "bing";
  if (value.includes("yahoo")) return "yahoo";
  if (value.includes("duckduckgo")) return "duckduckgo";
  return value.replace(/^www\./, "");
}

function isSearchSource(value) {
  const source = String(value || "").toLowerCase();
  if (!source) return false;
  return SEARCH_DOMAINS.some((domain) => source.includes(domain)) ||
    SEARCH_SOURCE_HINTS.some((hint) => source.includes(hint));
}

function isSocialSource(value) {
  const source = String(value || "").toLowerCase();
  if (!source) return false;
  if (source === "x") return true;
  return SOCIAL_DOMAINS.some((domain) => source.includes(domain)) ||
    SOCIAL_SOURCE_HINTS.some((hint) => source.includes(hint));
}

function isEmailSource(value) {
  const source = String(value || "").toLowerCase();
  if (!source) return false;
  return EMAIL_DOMAINS.some((domain) => source.includes(domain)) ||
    EMAIL_SOURCE_HINTS.some((hint) => source.includes(hint));
}

function resolveSocialPlatform(value) {
  const normalized = normalizeSourceLabel(value);
  if (SOCIAL_PLATFORM_KEYS.has(normalized)) {
    return normalized;
  }
  return null;
}

function normalizeHandle(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const decoded = decodeURIComponent(raw);
  const handle = decoded
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim()
    .toLowerCase();

  if (!handle || handle.length < 2 || handle.length > 64) {
    return null;
  }

  const reserved = new Set([
    "p",
    "reel",
    "reels",
    "stories",
    "story",
    "explore",
    "watch",
    "video",
    "videos",
    "feed",
    "home",
    "about",
    "discover",
    "search",
    "share",
    "post",
    "posts",
    "login",
    "signup"
  ]);

  if (reserved.has(handle)) {
    return null;
  }

  return handle;
}

function extractHandleFromText(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const decoded = decodeURIComponent(text);
  const atMatch = decoded.match(/@([a-zA-Z0-9._-]{2,64})/);
  if (atMatch?.[1]) {
    return normalizeHandle(atMatch[1]);
  }

  if (/^[a-zA-Z0-9._-]{2,64}$/.test(decoded)) {
    return normalizeHandle(decoded);
  }

  const token = decoded
    .split(/[,\s|:;/]+/)
    .map((item) => item.trim())
    .find((item) => /^@?[a-zA-Z0-9._-]{2,64}$/.test(item));

  if (token) {
    return normalizeHandle(token);
  }

  return null;
}

function extractHandleFromUrl(parsedUrl, socialPlatform) {
  if (!parsedUrl) {
    return null;
  }

  const segments = parsedUrl.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const findParamHandle = () => {
    const params = parsedUrl.searchParams;
    const keys = ["username", "user", "handle", "creator", "influencer", "profile", "account"];
    for (const key of keys) {
      const value = params.get(key);
      const normalized = normalizeHandle(value);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  };

  if (socialPlatform === "instagram") {
    if (segments[0] === "stories" && segments[1]) {
      return normalizeHandle(segments[1]);
    }
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "tiktok") {
    const tiktokHandle = segments.find((segment) => segment.startsWith("@"));
    if (tiktokHandle) {
      return normalizeHandle(tiktokHandle);
    }
  }

  if (socialPlatform === "x") {
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "threads") {
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "facebook") {
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "snapchat") {
    if (segments[0] === "add" && segments[1]) {
      return normalizeHandle(segments[1]);
    }
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "youtube") {
    if (segments[0] === "@" && segments[1]) {
      return normalizeHandle(segments[1]);
    }
    if (segments[0]?.startsWith("@")) {
      return normalizeHandle(segments[0]);
    }
    if (["channel", "c", "user"].includes(segments[0]) && segments[1]) {
      return normalizeHandle(segments[1]);
    }
  }

  if (socialPlatform === "linkedin") {
    if (["in", "company", "school"].includes(segments[0]) && segments[1]) {
      return normalizeHandle(segments[1]);
    }
  }

  if (socialPlatform === "reddit") {
    if (segments[0] === "user" && segments[1]) {
      return normalizeHandle(segments[1]);
    }
    if (segments[0] === "r" && segments[1]) {
      return normalizeHandle(segments[1]);
    }
  }

  if (socialPlatform === "pinterest") {
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "telegram") {
    if (segments[0]) {
      return normalizeHandle(segments[0]);
    }
  }

  if (socialPlatform === "discord") {
    if (segments[0] === "users" && segments[1]) {
      return normalizeHandle(segments[1]);
    }
    return findParamHandle();
  }

  if (socialPlatform === "whatsapp") {
    return findParamHandle();
  }

  return findParamHandle();
}

function resolveSocialContext({
  sourceCandidate,
  referrerParsed,
  landingParsed,
  pageParsed,
  utmSource,
  utmMedium,
  utmCampaign,
  utmTerm,
  utmContent,
  sourceHint
}) {
  const platformCandidates = [
    sourceCandidate,
    utmSource,
    sourceHint,
    referrerParsed?.hostname || "",
    landingParsed?.hostname || "",
    pageParsed?.hostname || ""
  ];

  const socialPlatform = platformCandidates
    .map((candidate) => resolveSocialPlatform(candidate))
    .find(Boolean) || null;

  const queryCandidateValues = [];
  [referrerParsed, landingParsed, pageParsed].forEach((parsedUrl) => {
    if (!parsedUrl) return;
    const params = parsedUrl.searchParams;
    ["username", "user", "handle", "creator", "influencer", "profile", "account"].forEach((key) => {
      const value = params.get(key);
      if (value) {
        queryCandidateValues.push(value);
      }
    });
  });

  const influencerHandleCandidates = [
    extractHandleFromText(utmContent),
    extractHandleFromText(utmTerm),
    extractHandleFromText(sourceHint),
    extractHandleFromText(utmCampaign),
    extractHandleFromUrl(referrerParsed, socialPlatform),
    extractHandleFromUrl(landingParsed, socialPlatform),
    extractHandleFromUrl(pageParsed, socialPlatform),
    ...queryCandidateValues.map((value) => extractHandleFromText(value))
  ];
  const influencerHandle = influencerHandleCandidates.find(Boolean) || null;

  const mediumValue = String(utmMedium || "").toLowerCase();
  const socialCampaignDetected = Boolean(
    socialPlatform &&
    utmSource &&
    (
      mediumValue.includes("social") ||
      mediumValue.includes("paid") ||
      mediumValue.includes("cpc") ||
      mediumValue.includes("ppc") ||
      isSocialSource(utmSource)
    )
  );

  return {
    socialPlatform,
    influencerHandle,
    socialCampaignDetected,
    socialCampaignSource: socialCampaignDetected ? normalizeSourceLabel(utmSource || socialPlatform) : null,
    socialCampaignName: socialCampaignDetected ? String(utmCampaign || "").trim() || null : null
  };
}

function inferSocialSourceFromUserAgent(userAgent) {
  const value = String(userAgent || "").toLowerCase();
  if (!value) return null;
  if (value.includes("snapchat")) return "snapchat";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("fban") || value.includes("fbav") || value.includes("facebook")) return "facebook";
  if (value.includes("threads")) return "threads";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("linkedinapp") || value.includes("linkedin")) return "linkedin";
  if (value.includes("twitter") || value.includes("x-client")) return "x";
  if (value.includes("reddit")) return "reddit";
  if (value.includes("pinterest")) return "pinterest";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("discord")) return "discord";
  if (value.includes("youtube")) return "youtube";
  return null;
}

function readQueryAttribution(urlLike) {
  const parsed = safeParseUrl(urlLike);
  if (!parsed) {
    return {};
  }

  const params = parsed.searchParams;
  return {
    utmSource: params.get("utm_source") || null,
    utmMedium: params.get("utm_medium") || null,
    utmCampaign: params.get("utm_campaign") || null,
    utmTerm: params.get("utm_term") || null,
    utmContent: params.get("utm_content") || null,
    gclid: params.get("gclid") || null,
    fbclid: params.get("fbclid") || null,
    msclkid: params.get("msclkid") || null,
    ttclid: params.get("ttclid") || null,
    twclid: params.get("twclid") || null,
    scid: params.get("scid") || null,
    sourceHint: params.get("source") || params.get("src") || null
  };
}

function resolveTrafficSourceFromRecord(row, internalHosts) {
  const referrer = String(row?.referrer || "").trim();
  const userAgent = String(row?.userAgent || "").trim();
  const page = String(row?.page || "").trim();
  const landingUrl = String(row?.landingUrl || "").trim();

  const pageAttribution = readQueryAttribution(page);
  const landingAttribution = readQueryAttribution(landingUrl);

  const pageParsed = safeParseUrl(page);
  const landingParsed = safeParseUrl(landingUrl);

  const utmSource = row?.utmSource || landingAttribution.utmSource || pageAttribution.utmSource || null;
  const utmMedium = row?.utmMedium || landingAttribution.utmMedium || pageAttribution.utmMedium || null;
  const utmCampaign = row?.utmCampaign || landingAttribution.utmCampaign || pageAttribution.utmCampaign || null;
  const utmTerm = row?.utmTerm || landingAttribution.utmTerm || pageAttribution.utmTerm || null;
  const utmContent = row?.utmContent || landingAttribution.utmContent || pageAttribution.utmContent || null;
  const sourceHint = row?.sourceHint || landingAttribution.sourceHint || pageAttribution.sourceHint || null;

  const gclid = row?.gclid || landingAttribution.gclid || pageAttribution.gclid || null;
  const fbclid = row?.fbclid || landingAttribution.fbclid || pageAttribution.fbclid || null;
  const msclkid = row?.msclkid || landingAttribution.msclkid || pageAttribution.msclkid || null;
  const ttclid = row?.ttclid || landingAttribution.ttclid || pageAttribution.ttclid || null;
  const twclid = row?.twclid || landingAttribution.twclid || pageAttribution.twclid || null;
  const scid = row?.scid || landingAttribution.scid || pageAttribution.scid || null;

  const clickIdPresent = !!(gclid || fbclid || msclkid || ttclid || twclid || scid);

  const referrerParsed = safeParseUrl(referrer);
  const referrerHost = referrerParsed?.hostname?.toLowerCase().replace(/^www\./, "") || "";
  const mediumValue = String(utmMedium || "").trim().toLowerCase();

  const withSocialContext = (trafficResult, sourceCandidate) => {
    const socialContext = resolveSocialContext({
      sourceCandidate,
      referrerParsed,
      landingParsed,
      pageParsed,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      sourceHint
    });

    return {
      ...trafficResult,
      ...socialContext,
      utmSource: utmSource ? normalizeSourceLabel(utmSource) : null,
      utmMedium: mediumValue || null,
      utmCampaign: utmCampaign ? String(utmCampaign).trim() : null
    };
  };

  if (utmSource || utmMedium || sourceHint) {
    const normalizedSource = normalizeSourceLabel(utmSource || sourceHint || referrerHost || "direct");

    if (
      clickIdPresent ||
      mediumValue.includes("paid") ||
      mediumValue.includes("cpc") ||
      mediumValue.includes("ppc") ||
      mediumValue.includes("ad")
    ) {
      return withSocialContext({
        channel: "paid",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "utm"
      }, normalizedSource);
    }

    if (mediumValue.includes("social") || isSocialSource(normalizedSource)) {
      return withSocialContext({
        channel: "social",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "utm"
      }, normalizedSource);
    }

    if (mediumValue.includes("organic") || isSearchSource(normalizedSource)) {
      return withSocialContext({
        channel: "organic_search",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "utm"
      }, normalizedSource);
    }

    if (mediumValue.includes("email") || isEmailSource(normalizedSource)) {
      return withSocialContext({
        channel: "email",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "utm"
      }, normalizedSource);
    }

    if (mediumValue.includes("referral")) {
      return withSocialContext({
        channel: "referral",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "utm"
      }, normalizedSource);
    }

    if (mediumValue.includes("direct")) {
      return withSocialContext({
        channel: "direct",
        source: "direct",
        icon: "direct",
        referrer,
        attributionMethod: "utm"
      }, normalizedSource);
    }
  }

  if (clickIdPresent) {
    const paidSource = normalizeSourceLabel(referrerHost || sourceHint || "paid_campaign");
    return withSocialContext({
      channel: "paid",
      source: paidSource,
      icon: paidSource,
      referrer,
      attributionMethod: "click_id"
    }, paidSource);
  }

  if (referrerHost) {
    if (internalHosts.has(referrerHost)) {
      return withSocialContext({
        channel: "internal",
        source: referrerHost,
        icon: "internal",
        referrer,
        attributionMethod: "referrer"
      }, referrerHost);
    }

    const normalizedSource = normalizeSourceLabel(referrerHost);

    if (isSearchSource(referrerHost)) {
      return withSocialContext({
        channel: "organic_search",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "referrer"
      }, normalizedSource);
    }

    if (isSocialSource(referrerHost)) {
      return withSocialContext({
        channel: "social",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "referrer"
      }, normalizedSource);
    }

    if (isEmailSource(referrerHost)) {
      return withSocialContext({
        channel: "email",
        source: normalizedSource,
        icon: normalizedSource,
        referrer,
        attributionMethod: "referrer"
      }, normalizedSource);
    }

    return withSocialContext({
      channel: "referral",
      source: normalizedSource,
      icon: normalizedSource,
      referrer,
      attributionMethod: "referrer"
    }, normalizedSource);
  }

  const inferredSocial = inferSocialSourceFromUserAgent(userAgent);
  if (inferredSocial) {
    return withSocialContext({
      channel: "social",
      source: inferredSocial,
      icon: inferredSocial,
      referrer,
      attributionMethod: "user_agent"
    }, inferredSocial);
  }

  return withSocialContext({
    channel: "direct",
    source: "direct",
    icon: "direct",
    referrer,
    attributionMethod: "fallback_direct"
  }, sourceHint || "direct");
}

function summarizeTrafficSources(sourceRows, internalHosts) {
  const channelMap = new Map();
  const sourceMap = new Map();
  const socialPlatformMap = new Map();
  const socialCampaignMap = new Map();

  for (const row of sourceRows) {
    const trafficInfo = resolveTrafficSourceFromRecord(row, internalHosts);
    const sessionKey =
      row.sessionId ||
      `${row.ipAddress || "unknown"}:${row.visitStart || row.createdAt || "unknown"}`;
    const channelKey = trafficInfo.channel;
    const sourceKey = [
      trafficInfo.source,
      trafficInfo.channel,
      trafficInfo.socialPlatform || "none",
      trafficInfo.influencerHandle || "none",
      trafficInfo.socialCampaignSource || "none",
      trafficInfo.socialCampaignName || "none"
    ].join("::");

    const channelItem = channelMap.get(channelKey) || {
      channel: channelKey,
      visits: 0,
      uniqueVisitorsSet: new Set(),
      signUps: 0,
      subscriptions: 0,
      icon: trafficInfo.icon || trafficInfo.source
    };
    channelItem.visits += 1;
    channelItem.uniqueVisitorsSet.add(sessionKey);
    channelItem.signUps += row.signedUp ? 1 : 0;
    channelItem.subscriptions += row.hasSubscription ? 1 : 0;
    channelMap.set(channelKey, channelItem);

    const sourceItem = sourceMap.get(sourceKey) || {
      source: trafficInfo.source,
      channel: trafficInfo.channel,
      icon: trafficInfo.icon || trafficInfo.source,
      visits: 0,
      uniqueVisitorsSet: new Set(),
      signUps: 0,
      subscriptions: 0,
      attributionMethod: trafficInfo.attributionMethod || "unknown",
      socialPlatform: trafficInfo.socialPlatform || null,
      influencerHandle: trafficInfo.influencerHandle || null,
      socialCampaignDetected: !!trafficInfo.socialCampaignDetected,
      socialCampaignSource: trafficInfo.socialCampaignSource || null,
      socialCampaignName: trafficInfo.socialCampaignName || null,
      utmSource: trafficInfo.utmSource || null,
      utmMedium: trafficInfo.utmMedium || null,
      utmCampaign: trafficInfo.utmCampaign || null
    };
    sourceItem.visits += 1;
    sourceItem.uniqueVisitorsSet.add(sessionKey);
    sourceItem.signUps += row.signedUp ? 1 : 0;
    sourceItem.subscriptions += row.hasSubscription ? 1 : 0;
    if (!sourceItem.socialPlatform && trafficInfo.socialPlatform) {
      sourceItem.socialPlatform = trafficInfo.socialPlatform;
    }
    if (!sourceItem.influencerHandle && trafficInfo.influencerHandle) {
      sourceItem.influencerHandle = trafficInfo.influencerHandle;
    }
    if (!sourceItem.socialCampaignSource && trafficInfo.socialCampaignSource) {
      sourceItem.socialCampaignSource = trafficInfo.socialCampaignSource;
    }
    if (!sourceItem.socialCampaignName && trafficInfo.socialCampaignName) {
      sourceItem.socialCampaignName = trafficInfo.socialCampaignName;
    }
    if (trafficInfo.socialCampaignDetected) {
      sourceItem.socialCampaignDetected = true;
    }
    sourceMap.set(sourceKey, sourceItem);

    if (trafficInfo.channel === "social") {
      const platformKey = trafficInfo.socialPlatform || trafficInfo.source || "social_unknown";
      const platformItem = socialPlatformMap.get(platformKey) || {
        platform: platformKey,
        icon: trafficInfo.icon || platformKey,
        visits: 0,
        uniqueVisitorsSet: new Set(),
        signUps: 0,
        subscriptions: 0,
        influencerHandlesSet: new Set()
      };
      platformItem.visits += 1;
      platformItem.uniqueVisitorsSet.add(sessionKey);
      platformItem.signUps += row.signedUp ? 1 : 0;
      platformItem.subscriptions += row.hasSubscription ? 1 : 0;
      if (trafficInfo.influencerHandle) {
        platformItem.influencerHandlesSet.add(trafficInfo.influencerHandle);
      }
      socialPlatformMap.set(platformKey, platformItem);
    }

    if (trafficInfo.socialCampaignDetected) {
      const campaignKey = `${trafficInfo.socialCampaignSource || trafficInfo.socialPlatform || trafficInfo.source || "social"}::${trafficInfo.socialCampaignName || "unnamed_campaign"}`;
      const campaignItem = socialCampaignMap.get(campaignKey) || {
        campaignKey,
        source: trafficInfo.socialCampaignSource || trafficInfo.socialPlatform || trafficInfo.source || "social",
        campaignName: trafficInfo.socialCampaignName || "unnamed_campaign",
        platform: trafficInfo.socialPlatform || trafficInfo.source || null,
        visits: 0,
        uniqueVisitorsSet: new Set(),
        signUps: 0,
        subscriptions: 0
      };
      campaignItem.visits += 1;
      campaignItem.uniqueVisitorsSet.add(sessionKey);
      campaignItem.signUps += row.signedUp ? 1 : 0;
      campaignItem.subscriptions += row.hasSubscription ? 1 : 0;
      socialCampaignMap.set(campaignKey, campaignItem);
    }
  }

  const channels = Array.from(channelMap.values())
    .map((item) => ({
      ...item,
      uniqueVisitors: item.uniqueVisitorsSet.size
    }))
    .map((item) => ({
      ...item,
      conversionRate: item.uniqueVisitors > 0
        ? Number(((item.signUps / item.uniqueVisitors) * 100).toFixed(2))
        : 0,
      subscriptionRate: item.signUps > 0
        ? Number(((item.subscriptions / item.signUps) * 100).toFixed(2))
        : 0,
      uniqueVisitorsSet: undefined
    }))
    .sort((a, b) => b.visits - a.visits);

  const topSources = Array.from(sourceMap.values())
    .map((item) => ({
      ...item,
      uniqueVisitors: item.uniqueVisitorsSet.size
    }))
    .map((item) => ({
      ...item,
      conversionRate: item.uniqueVisitors > 0
        ? Number(((item.signUps / item.uniqueVisitors) * 100).toFixed(2))
        : 0,
      uniqueVisitorsSet: undefined
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20);

  const platforms = Array.from(socialPlatformMap.values())
    .map((item) => ({
      platform: item.platform,
      icon: item.icon,
      visits: item.visits,
      uniqueVisitors: item.uniqueVisitorsSet.size,
      signUps: item.signUps,
      subscriptions: item.subscriptions,
      influencerAccounts: item.influencerHandlesSet.size,
      topInfluencers: Array.from(item.influencerHandlesSet).slice(0, 5),
      conversionRate: item.uniqueVisitorsSet.size > 0
        ? Number(((item.signUps / item.uniqueVisitorsSet.size) * 100).toFixed(2))
        : 0
    }))
    .sort((a, b) => b.visits - a.visits);

  const campaigns = Array.from(socialCampaignMap.values())
    .map((item) => ({
      source: item.source,
      campaignName: item.campaignName,
      platform: item.platform,
      visits: item.visits,
      uniqueVisitors: item.uniqueVisitorsSet.size,
      signUps: item.signUps,
      subscriptions: item.subscriptions,
      conversionRate: item.uniqueVisitorsSet.size > 0
        ? Number(((item.signUps / item.uniqueVisitorsSet.size) * 100).toFixed(2))
        : 0
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 20);

  const summary = channels.reduce(
    (acc, item) => {
      acc.totalVisits += item.visits;
      acc.totalUniqueVisitors += item.uniqueVisitors;
      acc.totalSignUps += item.signUps;
      acc.totalSubscriptions += item.subscriptions;
      acc.byChannel[item.channel] = item.visits;
      return acc;
    },
    {
      totalVisits: 0,
      totalUniqueVisitors: 0,
      totalSignUps: 0,
      totalSubscriptions: 0,
      byChannel: {},
      byPlatform: {},
      socialCampaigns: 0
    }
  );

  for (const platform of platforms) {
    summary.byPlatform[platform.platform] = platform.visits;
  }
  summary.socialCampaigns = campaigns.length;

  return {
    channels,
    topSources,
    platforms,
    campaigns,
    summary
  };
}

// Public route - Track page view
router.post("/track", async (req, res) => {
  try {
    const {
      sessionId,
      page,
      pageTitle,
      referrer,
      userAgent,
      gaClientId,
      gaSessionId,
      timeSpent,
      landingUrl,
      sourceHint,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      gclid,
      fbclid,
      ttclid,
      msclkid,
      twclid,
      scid
    } = req.body;

    // Extract IP address (handle various proxy scenarios)
    let ipAddress = req.ip || 
                   req.connection?.remoteAddress || 
                   req.socket?.remoteAddress ||
                   (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : null) ||
                   req.headers['x-real-ip'] ||
                   'unknown';
    
    // Clean up IP address
    if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
      ipAddress = '127.0.0.1'; // Localhost
    }
    
    // Get geo location from IP
    const geo = ipAddress !== 'unknown' ? geoip.lookup(ipAddress) : null;
    const country = geo?.country || 'Unknown';
    const countryCode = geo?.country || 'Unknown';
    const city = geo?.city || 'Unknown';
    const region = geo?.region || 'Unknown';
    const latitude = Array.isArray(geo?.ll) ? Number(geo.ll[0]) : null;
    const longitude = Array.isArray(geo?.ll) ? Number(geo.ll[1]) : null;

    // Detect device
    let device = 'desktop';
    let browser = 'unknown';
    let os = 'unknown';

    if (userAgent) {
      if (/mobile|android|iphone|ipad/i.test(userAgent)) {
        device = 'mobile';
      } else if (/tablet|ipad/i.test(userAgent)) {
        device = 'tablet';
      }

      // Detect browser
      if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) browser = 'Chrome';
      else if (/firefox/i.test(userAgent)) browser = 'Firefox';
      else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
      else if (/edg/i.test(userAgent)) browser = 'Edge';
      else if (/opera|opr/i.test(userAgent)) browser = 'Opera';

      // Detect OS
      if (/windows/i.test(userAgent)) os = 'Windows';
      else if (/mac/i.test(userAgent)) os = 'macOS';
      else if (/linux/i.test(userAgent)) os = 'Linux';
      else if (/android/i.test(userAgent)) os = 'Android';
      else if (/ios|iphone|ipad/i.test(userAgent)) os = 'iOS';
    }

    // Check if returning visitor
    const existingSession = await Analytics.findOne({ sessionId });
    const isReturning = !!existingSession;
    
    // Check if user exists
    const userId = req.body.userId || null;
    let isNewVisitor = true;
    let hasSubscription = false;
    let signedUp = false;
    let subscriptionId = null;

    if (userId) {
      try {
        const user = await User.findById(userId);
        if (user) {
          signedUp = true;
          // Check if user has visited before
          const previousVisit = await Analytics.findOne({ userId, _id: { $ne: existingSession?._id } });
          isNewVisitor = !previousVisit;

          // Check subscription
          try {
            const subscription = await Subscription.findOne({ userId, status: 'active' });
            if (subscription) {
              hasSubscription = true;
              subscriptionId = subscription._id;
            }
          } catch (subError) {
            // Subscription model might not exist or query failed, continue without it
            console.warn('Could not check subscription:', subError.message);
          }
        }
      } catch (userError) {
        // User not found or error, continue as anonymous
        console.warn('Could not find user:', userError.message);
      }
    } else {
      // Check by IP if returning
      const previousVisit = await Analytics.findOne({ 
        ipAddress, 
        visitStart: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      });
      isNewVisitor = !previousVisit;
    }

    // Update or create session
    if (existingSession) {
      existingSession.visitEnd = new Date();
      existingSession.timeSpent = (existingSession.timeSpent || 0) + (timeSpent || 0);
      // Only update page if provided (for time tracking updates, page might not be sent)
      if (page) {
        existingSession.page = page;
      }
      if (pageTitle) {
        existingSession.pageTitle = pageTitle;
      }
      if (referrer) {
        existingSession.referrer = referrer;
      }
      if (landingUrl) {
        existingSession.landingUrl = landingUrl;
      }
      if (sourceHint) {
        existingSession.sourceHint = sourceHint;
      }
      if (utmSource) existingSession.utmSource = utmSource;
      if (utmMedium) existingSession.utmMedium = utmMedium;
      if (utmCampaign) existingSession.utmCampaign = utmCampaign;
      if (utmTerm) existingSession.utmTerm = utmTerm;
      if (utmContent) existingSession.utmContent = utmContent;
      if (gclid) existingSession.gclid = gclid;
      if (fbclid) existingSession.fbclid = fbclid;
      if (ttclid) existingSession.ttclid = ttclid;
      if (msclkid) existingSession.msclkid = msclkid;
      if (twclid) existingSession.twclid = twclid;
      if (scid) existingSession.scid = scid;
      // Update user info if provided
      if (userId) {
        existingSession.userId = userId;
        existingSession.signedUp = signedUp;
        existingSession.hasSubscription = hasSubscription;
        if (subscriptionId) {
          existingSession.subscriptionId = subscriptionId;
        }
      }
      await existingSession.save();
    } else {
      // Only create new session if page is provided (required field)
      if (!page) {
        // If no page provided, this is likely just a time update - skip creating new session
        return res.json({ success: true });
      }
      
      const analytics = new Analytics({
        sessionId,
        userId,
        ipAddress,
        userAgent,
        device,
        browser,
        os,
        country,
        countryCode,
        city,
        region,
        latitude,
        longitude,
        page,
        pageTitle,
        referrer,
        landingUrl,
        sourceHint,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        gclid,
        fbclid,
        ttclid,
        msclkid,
        twclid,
        scid,
        visitStart: new Date(),
        visitEnd: new Date(),
        timeSpent: timeSpent || 0,
        isReturning,
        isNewVisitor,
        signedUp,
        hasSubscription,
        subscriptionId,
        gaClientId,
        gaSessionId
      });
      await analytics.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error tracking analytics:", error);
    res.json({ success: false, error: error.message });
  }
});

// Public route - Track event
router.post("/track/event", async (req, res) => {
  try {
    const {
      sessionId,
      name,
      category,
      action,
      label,
      value
    } = req.body;

    const analytics = await Analytics.findOne({ sessionId });
    if (analytics) {
      analytics.events.push({
        name,
        category,
        action,
        label,
        value,
        timestamp: new Date()
      });
      await analytics.save();
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error tracking event:", error);
    res.json({ success: false });
  }
});

// Admin route - Get analytics dashboard data
router.get("/admin/dashboard", authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, realtimeWindow } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    if (startDate) {
      start.setHours(0, 0, 0, 0);
    }

    if (endDate) {
      // Include the full selected end date instead of midnight only.
      end.setHours(23, 59, 59, 999);
    }

    const realtimeWindowKey = parseRealtimeWindowKey(realtimeWindow);
    const realtimeWindowMinutes = REALTIME_WINDOW_PRESETS[realtimeWindowKey];
    const realtimeWindowStart = new Date(Date.now() - (realtimeWindowMinutes * 60 * 1000));
    const internalHosts = getInternalHostSet();

    const gaConfig = getGoogleAnalyticsConfigStatus();
    let gaResult = null;

    try {
      gaResult = await getGoogleAnalyticsDashboardData({
        startDate: start,
        endDate: end
      });
    } catch (gaError) {
      gaResult = {
        success: false,
        error: gaError.message,
        meta: {
          source: "google_analytics",
          configured: gaConfig.configured,
          propertyId: gaConfig.propertyId || null,
          warnings: [gaError.message]
        }
      };
    }

    // Total visitors
    const totalVisitors = await Analytics.countDocuments({
      visitStart: { $gte: start, $lte: end }
    });

    // Unique visitors (by sessionId)
    const uniqueVisitors = await Analytics.distinct("sessionId", {
      visitStart: { $gte: start, $lte: end }
    }).then(sessions => sessions.length);

    // Returning visitors
    const returningVisitors = await Analytics.countDocuments({
      visitStart: { $gte: start, $lte: end },
      isReturning: true
    });

    // New visitors
    const newVisitors = await Analytics.countDocuments({
      visitStart: { $gte: start, $lte: end },
      isNewVisitor: true
    });

    // Sign-ups are sourced from user records for accuracy.
    const signUps = await User.countDocuments({
      createdAt: { $gte: start, $lte: end },
      role: { $ne: "admin" }
    });

    // Paid subscription conversions are sourced from Stripe invoices for accuracy.
    const paidSubscriptionConversionCount = await StripeInvoice.aggregate([
      {
        $match: {
          status: "paid",
          $or: [
            { purchaseType: "subscription" },
            { purchaseType: "unknown", subscriptionId: { $ne: null } }
          ]
        }
      },
      {
        $addFields: {
          effectiveIssuedAt: { $ifNull: ["$issuedAt", "$createdAt"] }
        }
      },
      {
        $match: {
          effectiveIssuedAt: { $gte: start, $lte: end }
        }
      },
      {
        $addFields: {
          conversionKey: {
            $ifNull: [{ $toString: "$userId" }, "$customerId"]
          }
        }
      },
      {
        $match: {
          conversionKey: { $nin: [null, "", "unknown"] }
        }
      },
      {
        $group: {
          _id: "$conversionKey"
        }
      },
      {
        $count: "total"
      }
    ]);
    const usersWithSubscription = paidSubscriptionConversionCount[0]?.total || 0;

    // Distinct IP visitors for accurate visitor-details card metric.
    const uniqueIpVisitors = await Analytics.distinct("ipAddress", {
      visitStart: { $gte: start, $lte: end },
      ipAddress: { $nin: [null, "", "unknown"] }
    }).then((ips) => ips.length);

    // Countries
    const countriesData = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$country",
          countryCode: { $first: "$countryCode" },
          count: { $sum: 1 },
          uniqueVisitors: { $addToSet: "$sessionId" }
        }
      },
      {
        $project: {
          country: "$_id",
          countryCode: 1,
          visits: "$count",
          uniqueVisitors: { $size: "$uniqueVisitors" }
        }
      },
      { $sort: { visits: -1 } },
      { $limit: 50 }
    ]);

    // Devices
    const devicesData = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$device",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          device: "$_id",
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Browsers
    const browsersData = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end },
          browser: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$browser",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          browser: "$_id",
          count: 1
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // OS
    const osData = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end },
          os: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: "$os",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          os: "$_id",
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Pages
    const pagesData = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$page",
          pageTitle: { $first: "$pageTitle" },
          count: { $sum: 1 },
          avgTimeSpent: { $avg: "$timeSpent" }
        }
      },
      {
        $project: {
          page: "$_id",
          pageTitle: 1,
          visits: "$count",
          avgTimeSpent: { $round: ["$avgTimeSpent", 2] }
        }
      },
      { $sort: { visits: -1 } },
      { $limit: 20 }
    ]);

    // Daily visitors
    const dailyVisitors = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$visitStart" }
          },
          visitors: { $addToSet: "$sessionId" },
          newVisitors: {
            $sum: { $cond: ["$isNewVisitor", 1, 0] }
          },
          returningVisitors: {
            $sum: { $cond: ["$isReturning", 1, 0] }
          },
          signUps: {
            $sum: { $cond: ["$signedUp", 1, 0] }
          }
        }
      },
      {
        $project: {
          date: "$_id",
          visitors: { $size: "$visitors" },
          newVisitors: 1,
          returningVisitors: 1,
          signUps: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Average time spent
    const avgTimeSpent = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end },
          timeSpent: { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: "$timeSpent" }
        }
      }
    ]);

    // Top IPs
    const topIPs = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: "$ipAddress",
          country: { $first: "$country" },
          city: { $first: "$city" },
          visits: { $sum: 1 },
          sessions: { $addToSet: "$sessionId" }
        }
      },
      {
        $project: {
          ipAddress: "$_id",
          country: 1,
          city: 1,
          visits: 1,
          uniqueSessions: { $size: "$sessions" }
        }
      },
      { $sort: { visits: -1 } },
      { $limit: 50 }
    ]);

    const sourceRows = await Analytics.find({
      visitStart: { $gte: start, $lte: end }
    })
      .select(
        "sessionId ipAddress visitStart createdAt referrer userAgent page landingUrl sourceHint utmSource utmMedium utmCampaign utmTerm utmContent gclid fbclid msclkid ttclid twclid scid signedUp hasSubscription"
      )
      .sort({ visitStart: -1 })
      .limit(50000)
      .lean();
    const trafficSources = summarizeTrafficSources(sourceRows, internalHosts);

    const realtimeSessions = await Analytics.find({
      $or: [
        { visitEnd: { $gte: realtimeWindowStart } },
        { visitStart: { $gte: realtimeWindowStart } }
      ]
    })
      .select(
        "sessionId userId ipAddress device browser os country countryCode city region latitude longitude timeSpent signedUp hasSubscription referrer userAgent page pageTitle landingUrl sourceHint utmSource utmMedium utmCampaign utmTerm utmContent gclid fbclid msclkid ttclid twclid scid visitStart visitEnd createdAt"
      )
      .sort({ visitEnd: -1, visitStart: -1 })
      .limit(300)
      .lean();

    const realtimeUserIds = [
      ...new Set(
        realtimeSessions
          .map((row) => (row.userId ? String(row.userId) : null))
          .filter(Boolean)
      )
    ];
    const realtimeUsers = realtimeUserIds.length > 0
      ? await User.find({ _id: { $in: realtimeUserIds } })
          .select("_id email name")
          .lean()
      : [];
    const realtimeUserMap = new Map(
      realtimeUsers.map((row) => [String(row._id), row])
    );

    const realtimeRows = realtimeSessions.map((row) => {
      const user = row.userId ? realtimeUserMap.get(String(row.userId)) : null;
      const sourceInfo = resolveTrafficSourceFromRecord(row, internalHosts);
      const lastActivity = row.visitEnd || row.visitStart || null;
      const fallbackGeo = (!Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))) && row.ipAddress
        ? geoip.lookup(row.ipAddress)
        : null;
      const fallbackLatitude = Array.isArray(fallbackGeo?.ll) ? Number(fallbackGeo.ll[0]) : null;
      const fallbackLongitude = Array.isArray(fallbackGeo?.ll) ? Number(fallbackGeo.ll[1]) : null;
      const conversion = row.hasSubscription
        ? "subscription"
        : row.signedUp
          ? "signup"
          : "none";

      return {
        sessionId: row.sessionId,
        userId: row.userId || null,
        userEmail: user?.email || null,
        userName: user?.name || null,
        ipAddress: row.ipAddress || "unknown",
        device: row.device || "unknown",
        browser: row.browser || "unknown",
        os: row.os || "unknown",
        country: row.country || "Unknown",
        countryCode: row.countryCode || null,
        city: row.city || "Unknown",
        region: row.region || "Unknown",
        latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : fallbackLatitude,
        longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : fallbackLongitude,
        timeSpent: Number(row.timeSpent || 0),
        conversion,
        sourceChannel: sourceInfo.channel,
        source: sourceInfo.source,
        sourceIcon: sourceInfo.icon || sourceInfo.source,
        sourceAttributionMethod: sourceInfo.attributionMethod || "unknown",
        socialPlatform: sourceInfo.socialPlatform || null,
        influencerHandle: sourceInfo.influencerHandle || null,
        socialCampaignDetected: !!sourceInfo.socialCampaignDetected,
        socialCampaignSource: sourceInfo.socialCampaignSource || null,
        socialCampaignName: sourceInfo.socialCampaignName || null,
        sourceUtmSource: sourceInfo.utmSource || null,
        sourceUtmMedium: sourceInfo.utmMedium || null,
        sourceUtmCampaign: sourceInfo.utmCampaign || null,
        referrer: row.referrer || "",
        page: row.page || "",
        pageTitle: row.pageTitle || "",
        visitStart: row.visitStart || null,
        visitEnd: row.visitEnd || null,
        lastActivity,
        isActiveNow: !!lastActivity && (new Date(lastActivity).getTime() >= (Date.now() - (5 * 60 * 1000)))
      };
    });

    const realtimeDeviceBreakdownMap = new Map();
    const realtimeChannelBreakdownMap = new Map();
    const realtimePlatformBreakdownMap = new Map();
    const realtimeCampaignBreakdownMap = new Map();
    for (const row of realtimeRows) {
      const deviceKey = row.device || "unknown";
      realtimeDeviceBreakdownMap.set(
        deviceKey,
        (realtimeDeviceBreakdownMap.get(deviceKey) || 0) + 1
      );

      const channelKey = row.sourceChannel || "unknown";
      realtimeChannelBreakdownMap.set(
        channelKey,
        (realtimeChannelBreakdownMap.get(channelKey) || 0) + 1
      );

      if (row.socialPlatform) {
        realtimePlatformBreakdownMap.set(
          row.socialPlatform,
          (realtimePlatformBreakdownMap.get(row.socialPlatform) || 0) + 1
        );
      }

      if (row.socialCampaignDetected) {
        const campaignKey = `${row.socialCampaignSource || row.socialPlatform || row.source || "social"}::${row.socialCampaignName || "unnamed_campaign"}`;
        realtimeCampaignBreakdownMap.set(
          campaignKey,
          (realtimeCampaignBreakdownMap.get(campaignKey) || 0) + 1
        );
      }
    }

    const realtimeDeviceBreakdown = Array.from(realtimeDeviceBreakdownMap.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count);
    const realtimeChannelBreakdown = Array.from(realtimeChannelBreakdownMap.entries())
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);
    const realtimePlatformBreakdown = Array.from(realtimePlatformBreakdownMap.entries())
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count);
    const realtimeCampaignBreakdown = Array.from(realtimeCampaignBreakdownMap.entries())
      .map(([campaignKey, count]) => {
        const [source, campaignName] = campaignKey.split("::");
        return {
          source,
          campaignName,
          count
        };
      })
      .sort((a, b) => b.count - a.count);
    const realtimeCountryBreakdownMap = new Map();
    for (const row of realtimeRows) {
      const countryKey = row.country && row.country !== "Unknown" ? row.country : null;
      if (!countryKey) continue;
      realtimeCountryBreakdownMap.set(
        countryKey,
        (realtimeCountryBreakdownMap.get(countryKey) || 0) + 1
      );
    }
    const realtimeCountryBreakdown = Array.from(realtimeCountryBreakdownMap.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    const realtimeSummary = {
      windowKey: realtimeWindowKey,
      windowMinutes: realtimeWindowMinutes,
      totalUsers: realtimeRows.length,
      activeNow: realtimeRows.filter((row) => row.isActiveNow).length,
      signedUpUsers: realtimeRows.filter((row) => row.conversion === "signup" || row.conversion === "subscription").length,
      subscribedUsers: realtimeRows.filter((row) => row.conversion === "subscription").length,
      totalTimeSpent: realtimeRows.reduce((acc, row) => acc + Number(row.timeSpent || 0), 0),
      deviceBreakdown: realtimeDeviceBreakdown,
      sourceBreakdown: realtimeChannelBreakdown,
      platformBreakdown: realtimePlatformBreakdown,
      campaignBreakdown: realtimeCampaignBreakdown,
      countryBreakdown: realtimeCountryBreakdown
    };

    // Conversion funnel
    const funnel = {
      totalVisitors: totalVisitors,
      uniqueVisitors: uniqueVisitors,
      signedUp: signUps,
      withSubscription: usersWithSubscription,
      conversionRate: uniqueVisitors > 0 ? Number(((signUps / uniqueVisitors) * 100).toFixed(2)) : 0,
      subscriptionRate: signUps > 0 ? Number(((usersWithSubscription / signUps) * 100).toFixed(2)) : 0
    };

    const internalData = {
      overview: {
        totalVisitors,
        uniqueVisitors,
        returningVisitors,
        newVisitors,
        signUps,
        usersWithSubscription,
        uniqueIpVisitors,
        avgTimeSpent: avgTimeSpent[0]?.avgTime ? Math.round(avgTimeSpent[0].avgTime) : 0
      },
      countries: countriesData,
      devices: devicesData,
      browsers: browsersData,
      os: osData,
      pages: pagesData,
      dailyVisitors,
      topIPs,
      realtime: {
        summary: realtimeSummary,
        users: realtimeRows
      },
      trafficSources,
      funnel
    };

    const gaTotalVisitors = gaResult?.data?.overview?.totalVisitors || 0;
    const internalTotalVisitors = internalData.overview.totalVisitors || 0;

    let selectedData = internalData;
    let source = "internal";
    const warnings = [];

    if (gaResult?.success && gaTotalVisitors > 0) {
      selectedData = gaResult.data;
      source = "google_analytics";
    } else if (internalTotalVisitors > 0) {
      selectedData = internalData;
      source = "internal";
      if (gaResult && !gaResult.success) {
        warnings.push(gaResult.error || "GA4 data unavailable; using internal analytics");
      } else if (gaResult?.success && gaTotalVisitors === 0) {
        warnings.push("GA4 returned 0 visitors for selected range; showing internal analytics");
      }
    } else if (gaResult?.success) {
      selectedData = gaResult.data;
      source = "google_analytics";
    } else if (gaResult && !gaResult.success) {
      warnings.push(gaResult.error || "GA4 data unavailable and internal analytics are empty");
    }

    const normalizedSignUps = signUps;
    const normalizedSubscriptionConversions = usersWithSubscription;
    const normalizedUniqueIpVisitors =
      uniqueIpVisitors > 0
        ? uniqueIpVisitors
        : (internalData.topIPs?.length || selectedData?.overview?.uniqueVisitors || 0);

    const selectedOverview = selectedData?.overview || {};
    const selectedFunnel = selectedData?.funnel || {};

    selectedData = {
      ...selectedData,
      overview: {
        ...selectedOverview,
        signUps: normalizedSignUps,
        usersWithSubscription: normalizedSubscriptionConversions,
        uniqueIpVisitors: normalizedUniqueIpVisitors
      },
      funnel: {
        ...selectedFunnel,
        signedUp: normalizedSignUps,
        withSubscription: normalizedSubscriptionConversions,
        conversionRate: (selectedOverview.uniqueVisitors || 0) > 0
          ? Number(((normalizedSignUps / selectedOverview.uniqueVisitors) * 100).toFixed(2))
          : 0,
        subscriptionRate: normalizedSignUps > 0
          ? Number(((normalizedSubscriptionConversions / normalizedSignUps) * 100).toFixed(2))
          : 0
      },
      // GA does not expose visitor IPs; use internal top IPs when available.
      topIPs:
        Array.isArray(selectedData?.topIPs) && selectedData.topIPs.length > 0
          ? selectedData.topIPs
          : internalData.topIPs,
      realtime: internalData.realtime,
      trafficSources: internalData.trafficSources
    };

    res.json({
      success: true,
      data: selectedData,
      meta: {
        source,
        range: {
          startDate: start.toISOString(),
          endDate: end.toISOString()
        },
        realtimeWindow: {
          key: realtimeWindowKey,
          minutes: realtimeWindowMinutes
        },
        googleAnalytics: {
          configured: gaConfig.configured,
          propertyId: gaConfig.propertyId || null,
          serviceAccountEmail: gaResult?.meta?.serviceAccountEmail || gaConfig.serviceAccountEmail || null,
          warnings: [
            ...(gaResult?.meta?.warnings || []),
            ...warnings
          ]
        },
        internal: {
          totalVisitors: internalTotalVisitors,
          uniqueIpVisitors
        }
      }
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ success: false, error: "Failed to fetch analytics" });
  }
});

// Admin route - Get visitor details
router.get("/admin/visitors", authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, country, device, startDate, endDate } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (country) query.country = country;
    if (device) query.device = device;
    if (startDate || endDate) {
      query.visitStart = {};
      if (startDate) {
        const parsedStart = new Date(startDate);
        parsedStart.setHours(0, 0, 0, 0);
        query.visitStart.$gte = parsedStart;
      }
      if (endDate) {
        const parsedEnd = new Date(endDate);
        parsedEnd.setHours(23, 59, 59, 999);
        query.visitStart.$lte = parsedEnd;
      }
    }

    const visitors = await Analytics.find(query)
      .populate("userId", "email name")
      .sort({ visitStart: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Analytics.countDocuments(query);

    res.json({
      success: true,
      visitors,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching visitors:", error);
    res.status(500).json({ success: false, error: "Failed to fetch visitors" });
  }
});

export default router;
