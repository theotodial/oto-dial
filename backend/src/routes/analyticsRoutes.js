import express from "express";
import Analytics from "../models/Analytics.js";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import authenticateUser from "../middleware/authenticateUser.js";
import requireAdmin from "../middleware/requireAdmin.js";
import geoip from "geoip-lite";
import {
  getGoogleAnalyticsDashboardData,
  getGoogleAnalyticsConfigStatus
} from "../services/googleAnalyticsService.js";

const router = express.Router();

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
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
    const end = endDate ? new Date(endDate) : new Date();

    if (startDate) {
      start.setHours(0, 0, 0, 0);
    }

    if (endDate) {
      // Include the full selected end date instead of midnight only.
      end.setHours(23, 59, 59, 999);
    }
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

    // Users who signed up
    const signUps = await Analytics.countDocuments({
      visitStart: { $gte: start, $lte: end },
      signedUp: true
    });

    // Users with active subscriptions
    const usersWithSubscription = await Analytics.distinct("userId", {
      visitStart: { $gte: start, $lte: end },
      hasSubscription: true
    }).then(users => users.length);

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

    // Conversion funnel
    const funnel = {
      totalVisitors: totalVisitors,
      uniqueVisitors: uniqueVisitors,
      signedUp: signUps,
      withSubscription: usersWithSubscription,
      conversionRate: uniqueVisitors > 0 ? ((signUps / uniqueVisitors) * 100).toFixed(2) : 0,
      subscriptionRate: signUps > 0 ? ((usersWithSubscription / signUps) * 100).toFixed(2) : 0
    };

    const internalData = {
      overview: {
        totalVisitors,
        uniqueVisitors,
        returningVisitors,
        newVisitors,
        signUps,
        usersWithSubscription,
        avgTimeSpent: avgTimeSpent[0]?.avgTime ? Math.round(avgTimeSpent[0].avgTime) : 0
      },
      countries: countriesData,
      devices: devicesData,
      browsers: browsersData,
      os: osData,
      pages: pagesData,
      dailyVisitors,
      topIPs,
      funnel
    };

    const gaTotalVisitors = gaResult?.data?.overview?.totalVisitors || 0;
    const gaRealtimeActiveUsers = Number(gaResult?.data?.overview?.realtimeActiveUsers);
    const hasGaRealtimeUsers = Number.isFinite(gaRealtimeActiveUsers);
    const internalTotalVisitors = internalData.overview.totalVisitors || 0;

    let selectedData = internalData;
    let source = "internal";
    const warnings = [];

    if (gaResult?.success && gaResult?.data) {
      selectedData = gaResult.data;
      source = "google_analytics";

      if (gaTotalVisitors === 0 && internalTotalVisitors > 0) {
        warnings.push(
          "GA4 returned 0 visitors for selected range; verify GA4 filters/date range. Internal analytics has historical data."
        );
      }
    } else if (internalTotalVisitors > 0) {
      selectedData = internalData;
      source = "internal";
      if (gaResult && !gaResult.success) {
        warnings.push(gaResult.error || "GA4 data unavailable; using internal analytics");
      }
    } else if (gaResult && !gaResult.success) {
      warnings.push(gaResult.error || "GA4 data unavailable and internal analytics are empty");
    }

    // Preserve GA realtime users even when internal analytics is selected.
    if (source === "internal" && hasGaRealtimeUsers) {
      selectedData = {
        ...selectedData,
        overview: {
          ...(selectedData?.overview || {}),
          realtimeActiveUsers: gaRealtimeActiveUsers
        }
      };
    }

    res.json({
      success: true,
      data: selectedData,
      meta: {
        source,
        range: {
          startDate: start.toISOString(),
          endDate: end.toISOString()
        },
        googleAnalytics: {
          configured: gaConfig.configured,
          propertyId: gaConfig.propertyId || null,
          serviceAccountEmail: gaResult?.meta?.serviceAccountEmail || gaConfig.serviceAccountEmail || null,
          realtimeActiveUsers: hasGaRealtimeUsers ? gaRealtimeActiveUsers : null,
          warnings: [
            ...(gaResult?.meta?.warnings || []),
            ...warnings
          ]
        },
        internal: {
          totalVisitors: internalTotalVisitors
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
      if (startDate) query.visitStart.$gte = new Date(startDate);
      if (endDate) query.visitStart.$lte = new Date(endDate);
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
