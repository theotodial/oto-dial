import geoip from "geoip-lite";

/**
 * enrichmentService
 *
 * Server-side enrichment for incoming analytics hits: client IP extraction,
 * geo lookup, and user-agent parsing (device type, brand, browser, OS).
 */

export function extractClientIp(req) {
  let ipAddress =
    (req.headers["x-forwarded-for"]
      ? String(req.headers["x-forwarded-for"]).split(",")[0].trim()
      : null) ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    "unknown";

  if (ipAddress === "::1" || ipAddress === "::ffff:127.0.0.1") {
    ipAddress = "127.0.0.1";
  }
  if (typeof ipAddress === "string" && ipAddress.startsWith("::ffff:")) {
    ipAddress = ipAddress.slice("::ffff:".length);
  }
  return ipAddress || "unknown";
}

export function lookupGeo(ipAddress) {
  const empty = {
    country: "Unknown",
    countryCode: null,
    city: null,
    region: null,
    latitude: null,
    longitude: null
  };
  if (!ipAddress || ipAddress === "unknown" || ipAddress === "127.0.0.1") {
    return empty;
  }
  try {
    const geo = geoip.lookup(ipAddress);
    if (!geo) return empty;
    return {
      country: geo.country || "Unknown",
      countryCode: geo.country || null,
      city: geo.city || null,
      region: geo.region || null,
      latitude: Array.isArray(geo.ll) ? Number(geo.ll[0]) : null,
      longitude: Array.isArray(geo.ll) ? Number(geo.ll[1]) : null
    };
  } catch {
    return empty;
  }
}

const BRAND_PATTERNS = [
  [/iphone/i, "Apple"],
  [/ipad/i, "Apple"],
  [/macintosh|mac os/i, "Apple"],
  [/samsung|sm-[a-z0-9]+/i, "Samsung"],
  [/pixel/i, "Google"],
  [/huawei/i, "Huawei"],
  [/xiaomi|redmi|poco/i, "Xiaomi"],
  [/oneplus/i, "OnePlus"],
  [/oppo/i, "Oppo"],
  [/vivo/i, "Vivo"],
  [/nokia/i, "Nokia"],
  [/motorola|moto /i, "Motorola"]
];

export function parseUserAgent(userAgent) {
  const ua = String(userAgent || "");
  let device = "desktop";
  let browser = "unknown";
  let os = "unknown";
  let deviceBrand = null;

  if (ua) {
    if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
      device = "tablet";
    } else if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
      device = "mobile";
    }

    if (/edg/i.test(ua)) browser = "Edge";
    else if (/opr|opera/i.test(ua)) browser = "Opera";
    else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = "Chrome";
    else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
    else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";
    else if (/msie|trident/i.test(ua)) browser = "Internet Explorer";

    if (/windows/i.test(ua)) os = "Windows";
    else if (/android/i.test(ua)) os = "Android";
    else if (/iphone|ipad|ipod|ios/i.test(ua)) os = "iOS";
    else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
    else if (/cros/i.test(ua)) os = "ChromeOS";
    else if (/linux/i.test(ua)) os = "Linux";

    const brandMatch = BRAND_PATTERNS.find(([pattern]) => pattern.test(ua));
    if (brandMatch) deviceBrand = brandMatch[1];
  }

  return { device, browser, os, deviceBrand };
}

export default { extractClientIp, lookupGeo, parseUserAgent };
