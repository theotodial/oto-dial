/**
 * visitorProfileService
 *
 * Lifetime visitor intelligence from authoritative collections.
 */
import AnalyticsVisitor from "../../models/analytics/AnalyticsVisitor.js";
import AnalyticsSession from "../../models/analytics/AnalyticsSession.js";
import AnalyticsEvent from "../../models/analytics/AnalyticsEvent.js";
import AnalyticsPageView from "../../models/analytics/AnalyticsPageView.js";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import StripeInvoice from "../../models/StripeInvoice.js";
import Call from "../../models/Call.js";
import SMS from "../../models/SMS.js";
import PhoneNumber from "../../models/PhoneNumber.js";

export async function getVisitorLifetimeProfile(visitorId) {
  if (!visitorId) return null;

  const visitor = await AnalyticsVisitor.findOne({ visitorId }).lean();
  if (!visitor) return null;

  const userIds = (visitor.userIds || []).map(String);
  const primaryUserId = visitor.firstUserId || userIds[0] || null;

  const sessionMatch = { visitorId };
  const [
    sessions,
    sessionStats,
    events,
    pageViews,
    user,
    subscriptions,
    invoices,
    calls,
    sms,
    numbers
  ] = await Promise.all([
    AnalyticsSession.find(sessionMatch).sort({ startedAt: -1 }).limit(50).lean(),
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalPageViews: { $sum: "$pageViewCount" },
          totalDuration: { $sum: "$durationSeconds" },
          countries: { $addToSet: "$country" },
          devices: { $addToSet: "$device" },
          browsers: { $addToSet: "$browser" },
          sources: { $addToSet: "$source" },
          campaigns: { $addToSet: "$campaign" }
        }
      }
    ]).option({ maxTimeMS: 15000 }),
    AnalyticsEvent.find({ visitorId }).sort({ timestamp: -1 }).limit(100).lean(),
    AnalyticsPageView.find({ visitorId }).sort({ timestamp: -1 }).limit(50).lean(),
    primaryUserId ? User.findById(primaryUserId).select("email name remainingCredits createdAt").lean() : null,
    primaryUserId
      ? Subscription.find({ userId: primaryUserId }).sort({ createdAt: -1 }).lean()
      : [],
    primaryUserId
      ? StripeInvoice.find({ userId: primaryUserId, status: "paid" }).sort({ issuedAt: -1 }).limit(50).lean()
      : [],
    primaryUserId ? Call.countDocuments({ user: primaryUserId }).maxTimeMS(10000) : 0,
    primaryUserId ? SMS.countDocuments({ user: primaryUserId, direction: "outbound" }).maxTimeMS(10000) : 0,
    primaryUserId ? PhoneNumber.countDocuments({ userId: primaryUserId }).maxTimeMS(10000) : 0
  ]);

  const stats = sessionStats[0] || {};
  const lifetimeRevenue = invoices.reduce((s, i) => s + Number(i.amountPaid || 0), 0);
  const totalPurchases = invoices.length;
  const avgSession =
    stats.totalSessions > 0 ? Math.round((stats.totalDuration || 0) / stats.totalSessions) : 0;

  const activeSub = subscriptions.find((s) => s.status === "active");
  const cancelledPlans = subscriptions.filter((s) => s.status === "cancelled");

  const engagementScore = Math.min(
    100,
    Math.round(
      (stats.totalSessions || 0) * 5 +
        totalPurchases * 20 +
        (calls || 0) * 2 +
        (sms || 0) +
        (visitor.signedUp ? 15 : 0)
    )
  );

  return {
    visitorId,
    firstVisit: visitor.firstSeenAt,
    latestVisit: visitor.lastSeenAt,
    lifetimeVisits: visitor.sessionCount || stats.totalSessions || 0,
    totalSessions: stats.totalSessions || 0,
    averageSessionDuration: avgSession,
    totalPageViews: stats.totalPageViews || visitor.pageViewCount || 0,
    totalPurchases,
    lifetimeRevenue: Number(lifetimeRevenue.toFixed(2)),
    subscriptionHistory: subscriptions.map((s) => ({
      plan: s.planName || s.planKey,
      status: s.status,
      startedAt: s.createdAt,
      cancelledAt: s.cancelledAt || null
    })),
    currentPlan: activeSub?.planName || activeSub?.planKey || null,
    cancelledPlans: cancelledPlans.map((s) => s.planName || s.planKey),
    renewals: subscriptions.filter((s) => s.renewalCount > 0).length,
    numbersPurchased: numbers,
    callsMade: calls,
    smsSent: sms,
    countriesVisited: (stats.countries || []).filter(Boolean),
    devicesUsed: (stats.devices || []).filter(Boolean),
    browsersUsed: (stats.browsers || []).filter(Boolean),
    trafficSources: (stats.sources || []).filter(Boolean),
    campaignHistory: (stats.campaigns || []).filter(Boolean),
    returningFrequency: stats.totalSessions > 1 ? "returning" : "new",
    engagementScore,
    riskScore: 0,
    user: user
      ? {
          id: String(user._id),
          email: user.email,
          name: user.name,
          remainingCredits: user.remainingCredits,
          createdAt: user.createdAt
        }
      : null,
    recentSessions: sessions.slice(0, 20),
    recentEvents: events.slice(0, 30),
    recentPages: pageViews.slice(0, 20),
    attribution: {
      firstTouch: visitor.firstTouch,
      lastTouch: visitor.lastTouch
    }
  };
}

export default { getVisitorLifetimeProfile };
