/**
 * attributionService
 *
 * Canonical traffic-source attribution for the analytics pipeline.
 * Resolves a single tracking record (referrer + UTM + click-ids + UA) into
 * a normalized { channel, source, medium, campaign, ... } shape. This is
 * computed once at write time and stored on the session so the dashboard
 * never recomputes attribution over the raw event stream.
 */

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
  "whatsapp.com",
  "producthunt.com",
  "github.com"
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
  "discord",
  "producthunt",
  "product_hunt",
  "github"
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
  "discord",
  "producthunt",
  "github"
]);

export function getInternalHostSet() {
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

export function safeParseUrl(value) {
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

export function normalizeSourceLabel(source) {
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
  if (value.includes("producthunt") || value.includes("product_hunt")) return "producthunt";
  if (value.includes("github")) return "github";
  if (value.includes("google")) return "google";
  if (value.includes("bing")) return "bing";
  if (value.includes("yahoo")) return "yahoo";
  if (value.includes("duckduckgo")) return "duckduckgo";
  return value.replace(/^www\./, "");
}

function isSearchSource(value) {
  const source = String(value || "").toLowerCase();
  if (!source) return false;
  return (
    SEARCH_DOMAINS.some((domain) => source.includes(domain)) ||
    SEARCH_SOURCE_HINTS.some((hint) => source.includes(hint))
  );
}

function isSocialSource(value) {
  const source = String(value || "").toLowerCase();
  if (!source) return false;
  if (source === "x") return true;
  return (
    SOCIAL_DOMAINS.some((domain) => source.includes(domain)) ||
    SOCIAL_SOURCE_HINTS.some((hint) => source.includes(hint))
  );
}

function isEmailSource(value) {
  const source = String(value || "").toLowerCase();
  if (!source) return false;
  return (
    EMAIL_DOMAINS.some((domain) => source.includes(domain)) ||
    EMAIL_SOURCE_HINTS.some((hint) => source.includes(hint))
  );
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

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const handle = decoded
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim()
    .toLowerCase();

  if (!handle || handle.length < 2 || handle.length > 64) {
    return null;
  }

  const reserved = new Set([
    "p", "reel", "reels", "stories", "story", "explore", "watch", "video",
    "videos", "feed", "home", "about", "discover", "search", "share", "post",
    "posts", "login", "signup"
  ]);
  if (reserved.has(handle)) return null;
  return handle;
}

function extractHandleFromText(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    decoded = text;
  }
  const atMatch = decoded.match(/@([a-zA-Z0-9._-]{2,64})/);
  if (atMatch?.[1]) return normalizeHandle(atMatch[1]);
  if (/^[a-zA-Z0-9._-]{2,64}$/.test(decoded)) return normalizeHandle(decoded);

  const token = decoded
    .split(/[,\s|:;/]+/)
    .map((item) => item.trim())
    .find((item) => /^@?[a-zA-Z0-9._-]{2,64}$/.test(item));
  if (token) return normalizeHandle(token);
  return null;
}

function extractHandleFromUrl(parsedUrl, socialPlatform) {
  if (!parsedUrl) return null;

  const segments = parsedUrl.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const findParamHandle = () => {
    const params = parsedUrl.searchParams;
    const keys = ["username", "user", "handle", "creator", "influencer", "profile", "account"];
    for (const key of keys) {
      const normalized = normalizeHandle(params.get(key));
      if (normalized) return normalized;
    }
    return null;
  };

  switch (socialPlatform) {
    case "instagram":
      if (segments[0] === "stories" && segments[1]) return normalizeHandle(segments[1]);
      if (segments[0]) return normalizeHandle(segments[0]);
      break;
    case "tiktok": {
      const tiktokHandle = segments.find((s) => s.startsWith("@"));
      if (tiktokHandle) return normalizeHandle(tiktokHandle);
      break;
    }
    case "x":
    case "threads":
    case "facebook":
    case "pinterest":
    case "telegram":
      if (segments[0]) return normalizeHandle(segments[0]);
      break;
    case "snapchat":
      if (segments[0] === "add" && segments[1]) return normalizeHandle(segments[1]);
      if (segments[0]) return normalizeHandle(segments[0]);
      break;
    case "youtube":
      if (segments[0] === "@" && segments[1]) return normalizeHandle(segments[1]);
      if (segments[0]?.startsWith("@")) return normalizeHandle(segments[0]);
      if (["channel", "c", "user"].includes(segments[0]) && segments[1]) return normalizeHandle(segments[1]);
      break;
    case "linkedin":
      if (["in", "company", "school"].includes(segments[0]) && segments[1]) return normalizeHandle(segments[1]);
      break;
    case "reddit":
      if (segments[0] === "user" && segments[1]) return normalizeHandle(segments[1]);
      if (segments[0] === "r" && segments[1]) return normalizeHandle(segments[1]);
      break;
    case "discord":
      if (segments[0] === "users" && segments[1]) return normalizeHandle(segments[1]);
      return findParamHandle();
    default:
      return findParamHandle();
  }

  return findParamHandle();
}

function resolveSocialContext(input) {
  const {
    sourceCandidate, referrerParsed, landingParsed, pageParsed,
    utmSource, utmMedium, utmCampaign, utmTerm, utmContent, sourceHint
  } = input;

  const platformCandidates = [
    sourceCandidate, utmSource, sourceHint,
    referrerParsed?.hostname || "", landingParsed?.hostname || "", pageParsed?.hostname || ""
  ];
  const socialPlatform = platformCandidates.map((c) => resolveSocialPlatform(c)).find(Boolean) || null;

  const queryCandidateValues = [];
  [referrerParsed, landingParsed, pageParsed].forEach((parsedUrl) => {
    if (!parsedUrl) return;
    ["username", "user", "handle", "creator", "influencer", "profile", "account"].forEach((key) => {
      const value = parsedUrl.searchParams.get(key);
      if (value) queryCandidateValues.push(value);
    });
  });

  const influencerHandle = [
    extractHandleFromText(utmContent),
    extractHandleFromText(utmTerm),
    extractHandleFromText(sourceHint),
    extractHandleFromText(utmCampaign),
    extractHandleFromUrl(referrerParsed, socialPlatform),
    extractHandleFromUrl(landingParsed, socialPlatform),
    extractHandleFromUrl(pageParsed, socialPlatform),
    ...queryCandidateValues.map((value) => extractHandleFromText(value))
  ].find(Boolean) || null;

  return { socialPlatform, influencerHandle };
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
  if (!parsed) return {};
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

/**
 * Resolve a single tracking record into a normalized attribution object.
 * Accepts referrer, userAgent, page, landingUrl plus explicit utm/click fields.
 */
export function resolveTrafficSource(row = {}, internalHosts = getInternalHostSet()) {
  const referrer = String(row?.referrer || "").trim();
  const userAgent = String(row?.userAgent || "").trim();
  const page = String(row?.page || row?.landingPage || "").trim();
  const landingUrl = String(row?.landingUrl || row?.landingPage || "").trim();

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

  const withContext = (result, sourceCandidate) => {
    const social = resolveSocialContext({
      sourceCandidate, referrerParsed, landingParsed, pageParsed,
      utmSource, utmMedium, utmCampaign, utmTerm, utmContent, sourceHint
    });
    return {
      channel: result.channel,
      source: result.source,
      medium: mediumValue || result.medium || null,
      campaign: utmCampaign ? String(utmCampaign).trim() : null,
      term: utmTerm || null,
      content: utmContent || null,
      referrer: referrer || null,
      landingPage: landingUrl || page || null,
      attributionMethod: result.attributionMethod,
      socialPlatform: social.socialPlatform,
      influencerHandle: social.influencerHandle,
      utmSource: utmSource ? normalizeSourceLabel(utmSource) : null,
      utmMedium: mediumValue || null,
      utmCampaign: utmCampaign ? String(utmCampaign).trim() : null,
      gclid, fbclid, msclkid, ttclid, twclid, scid
    };
  };

  if (utmSource || utmMedium || sourceHint) {
    const normalizedSource = normalizeSourceLabel(utmSource || sourceHint || referrerHost || "direct");
    if (clickIdPresent || /paid|cpc|ppc|(^|[^a-z])ad([^a-z]|$)/.test(mediumValue)) {
      return withContext({ channel: "paid", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
    }
    if (mediumValue.includes("social") || isSocialSource(normalizedSource)) {
      return withContext({ channel: "social", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
    }
    if (mediumValue.includes("organic") || isSearchSource(normalizedSource)) {
      return withContext({ channel: "organic_search", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
    }
    if (mediumValue.includes("email") || isEmailSource(normalizedSource)) {
      return withContext({ channel: "email", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
    }
    if (mediumValue.includes("referral")) {
      return withContext({ channel: "referral", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
    }
    if (mediumValue.includes("direct")) {
      return withContext({ channel: "direct", source: "direct", attributionMethod: "utm" }, normalizedSource);
    }
    // utm present but ambiguous medium -> treat as referral by source kind
    if (isSearchSource(normalizedSource)) {
      return withContext({ channel: "organic_search", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
    }
    return withContext({ channel: "referral", source: normalizedSource, attributionMethod: "utm" }, normalizedSource);
  }

  if (clickIdPresent) {
    const paidSource = normalizeSourceLabel(referrerHost || sourceHint || "paid_campaign");
    return withContext({ channel: "paid", source: paidSource, attributionMethod: "click_id" }, paidSource);
  }

  if (referrerHost) {
    if (internalHosts.has(referrerHost)) {
      return withContext({ channel: "internal", source: referrerHost, attributionMethod: "referrer" }, referrerHost);
    }
    const normalizedSource = normalizeSourceLabel(referrerHost);
    if (isSearchSource(referrerHost)) {
      return withContext({ channel: "organic_search", source: normalizedSource, attributionMethod: "referrer" }, normalizedSource);
    }
    if (isSocialSource(referrerHost)) {
      return withContext({ channel: "social", source: normalizedSource, attributionMethod: "referrer" }, normalizedSource);
    }
    if (isEmailSource(referrerHost)) {
      return withContext({ channel: "email", source: normalizedSource, attributionMethod: "referrer" }, normalizedSource);
    }
    return withContext({ channel: "referral", source: normalizedSource, attributionMethod: "referrer" }, normalizedSource);
  }

  const inferredSocial = inferSocialSourceFromUserAgent(userAgent);
  if (inferredSocial) {
    return withContext({ channel: "social", source: inferredSocial, attributionMethod: "user_agent" }, inferredSocial);
  }

  return withContext({ channel: "direct", source: "direct", attributionMethod: "fallback_direct" }, sourceHint || "direct");
}

export default {
  getInternalHostSet,
  safeParseUrl,
  normalizeSourceLabel,
  resolveTrafficSource
};
