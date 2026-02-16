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
  "instagram.com",
  "twitter.com",
  "x.com",
  "t.co",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "reddit.com",
  "pinterest.com",
  "tiktok.com",
  "snapchat.com",
  "telegram.org",
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
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function classifyTrafficSource(referrer, internalHosts) {
  const rawReferrer = typeof referrer === "string" ? referrer.trim() : "";
  if (!rawReferrer) {
    return {
      channel: "direct",
      source: "direct",
      referrer: ""
    };
  }

  const lowerReferrer = rawReferrer.toLowerCase();
  const parsed = safeParseUrl(rawReferrer);
  const hostname = parsed?.hostname?.toLowerCase() || "";
  const withoutWww = hostname.replace(/^www\./, "");

  if (withoutWww && internalHosts.has(withoutWww)) {
    return {
      channel: "internal",
      source: withoutWww,
      referrer: rawReferrer
    };
  }

  const queryText = parsed?.search?.toLowerCase() || lowerReferrer;
  const hasPaidHints =
    queryText.includes("gclid=") ||
    queryText.includes("fbclid=") ||
    queryText.includes("msclkid=") ||
    queryText.includes("utm_medium=cpc") ||
    queryText.includes("utm_medium=ppc") ||
    queryText.includes("utm_medium=paid") ||
    queryText.includes("utm_medium=ad");

  const utmSource = parsed?.searchParams?.get("utm_source");
  const normalizedSource = (utmSource || withoutWww || "direct").toLowerCase();

  if (hasPaidHints) {
    return {
      channel: "paid",
      source: normalizedSource,
      referrer: rawReferrer
    };
  }

  if (SEARCH_DOMAINS.some((domain) => normalizedSource.includes(domain))) {
    return {
      channel: "organic_search",
      source: normalizedSource,
      referrer: rawReferrer
    };
  }

  if (SOCIAL_DOMAINS.some((domain) => normalizedSource.includes(domain))) {
    return {
      channel: "social",
      source: normalizedSource,
      referrer: rawReferrer
    };
  }

  if (EMAIL_DOMAINS.some((domain) => normalizedSource.includes(domain))) {
    return {
      channel: "email",
      source: normalizedSource,
      referrer: rawReferrer
    };
  }

  return {
    channel: "referral",
    source: normalizedSource,
    referrer: rawReferrer
  };
}

function summarizeTrafficSources(sourceRows, internalHosts) {
  const channelMap = new Map();
  const sourceMap = new Map();

  for (const row of sourceRows) {
    const trafficInfo = classifyTrafficSource(row.referrer, internalHosts);
    const channelKey = trafficInfo.channel;
    const sourceKey = `${trafficInfo.source}::${trafficInfo.channel}`;

    const channelItem = channelMap.get(channelKey) || {
      channel: channelKey,
      visits: 0,
      uniqueVisitors: 0,
      signUps: 0,
      subscriptions: 0
    };
    channelItem.visits += row.visits || 0;
    channelItem.uniqueVisitors += row.uniqueVisitors || 0;
    channelItem.signUps += row.signUps || 0;
    channelItem.subscriptions += row.subscriptions || 0;
    channelMap.set(channelKey, channelItem);

    const sourceItem = sourceMap.get(sourceKey) || {
      source: trafficInfo.source,
      channel: trafficInfo.channel,
      visits: 0,
      uniqueVisitors: 0,
      signUps: 0,
      subscriptions: 0
    };
    sourceItem.visits += row.visits || 0;
    sourceItem.uniqueVisitors += row.uniqueVisitors || 0;
    sourceItem.signUps += row.signUps || 0;
    sourceItem.subscriptions += row.subscriptions || 0;
    sourceMap.set(sourceKey, sourceItem);
  }

  const channels = Array.from(channelMap.values())
    .map((item) => ({
      ...item,
      conversionRate: item.uniqueVisitors > 0
        ? Number(((item.signUps / item.uniqueVisitors) * 100).toFixed(2))
        : 0,
      subscriptionRate: item.signUps > 0
        ? Number(((item.subscriptions / item.signUps) * 100).toFixed(2))
        : 0
    }))
    .sort((a, b) => b.visits - a.visits);

  const topSources = Array.from(sourceMap.values())
    .map((item) => ({
      ...item,
      conversionRate: item.uniqueVisitors > 0
        ? Number(((item.signUps / item.uniqueVisitors) * 100).toFixed(2))
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
      byChannel: {}
    }
  );

  return {
    channels,
    topSources,
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
      timeSpent
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
        page,
        pageTitle,
        referrer,
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

    const sourceRows = await Analytics.aggregate([
      {
        $match: {
          visitStart: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $ifNull: ["$referrer", ""] },
          visits: { $sum: 1 },
          uniqueSessions: { $addToSet: "$sessionId" },
          signUps: { $sum: { $cond: ["$signedUp", 1, 0] } },
          subscriptions: { $sum: { $cond: ["$hasSubscription", 1, 0] } }
        }
      },
      {
        $project: {
          referrer: "$_id",
          visits: 1,
          uniqueVisitors: { $size: "$uniqueSessions" },
          signUps: 1,
          subscriptions: 1
        }
      },
      { $sort: { visits: -1 } },
      { $limit: 500 }
    ]);
    const trafficSources = summarizeTrafficSources(sourceRows, internalHosts);

    const realtimeSessions = await Analytics.find({
      $or: [
        { visitEnd: { $gte: realtimeWindowStart } },
        { visitStart: { $gte: realtimeWindowStart } }
      ]
    })
      .select(
        "sessionId userId ipAddress device browser os country city region timeSpent signedUp hasSubscription referrer page pageTitle visitStart visitEnd"
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
      const sourceInfo = classifyTrafficSource(row.referrer, internalHosts);
      const lastActivity = row.visitEnd || row.visitStart || null;
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
        city: row.city || "Unknown",
        region: row.region || "Unknown",
        timeSpent: Number(row.timeSpent || 0),
        conversion,
        sourceChannel: sourceInfo.channel,
        source: sourceInfo.source,
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
    }

    const realtimeDeviceBreakdown = Array.from(realtimeDeviceBreakdownMap.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count);
    const realtimeChannelBreakdown = Array.from(realtimeChannelBreakdownMap.entries())
      .map(([channel, count]) => ({ channel, count }))
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
      sourceBreakdown: realtimeChannelBreakdown
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
