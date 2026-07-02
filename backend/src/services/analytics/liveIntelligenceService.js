/**
 * liveIntelligenceService
 *
 * Enterprise live operations center: per-visitor session intelligence,
 * aggregated KPIs, funnel, geo, traffic, device breakdowns, event stream,
 * and throttled websocket delta broadcasting.
 */
import mongoose from "mongoose";
import User from "../../models/User.js";
import Subscription from "../../models/Subscription.js";
import StripeInvoice from "../../models/StripeInvoice.js";
import AnalyticsVisitor from "../../models/analytics/AnalyticsVisitor.js";
import { PRIMARY_ADMIN_EMAIL } from "../../constants/adminAccess.js";
import { ANALYTICS_EVENTS } from "../../constants/analyticsEvents.js";
import { queryWindowSnapshot } from "./windowQueryService.js";
import { DEFAULT_TIMEFRAME, isLiveOverlayWindow } from "./timeframeService.js";
import {
  getSession,
  setSession,
  deleteSession,
  getAllSessions,
  pushEvent,
  getRecentEvents,
  trimSessionCollections,
  hydrateFromRedis
} from "./liveIntelligenceStore.js";

const ADMIN_ROOM = "admins";
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const IDLE_THRESHOLD_MS = 90 * 1000;
const EMIT_THROTTLE_MS = 1500;
const USER_ENRICH_TTL_MS = 60_000;
const REVENUE_TODAY_TTL_MS = 30_000;

let ioInstance = null;
let lastEmitAt = 0;
let emitTimer = null;
let revenueTodayCache = { value: 0, at: 0 };
let pruneTimer = null;

const userEnrichCache = new Map(); // userId -> { data, at }

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|HeadlessChrome|phantomjs|selenium|puppeteer/i;

const PAGE_FLAGS = [
  { key: "inCheckout", test: (p) => /billing|checkout|stripe/.test(p) },
  { key: "onPricing", test: (p) => /pricing|billing|plans/.test(p) },
  { key: "onSignup", test: (p) => /signup|register|sign-up/.test(p) },
  { key: "onDashboard", test: (p) => /dashboard|recents|dialer|campaign|contacts/.test(p) }
];

function maskIp(ip) {
  if (!ip || ip === "unknown") return null;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 3).join(":")}:****`;
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  return `${ip.slice(0, 4)}****`;
}

function normalizePlanTier(planName, planKey) {
  const s = `${planName || ""} ${planKey || ""}`.toLowerCase();
  if (s.includes("enterprise")) return "enterprise";
  if (s.includes("unlimited")) return "unlimited";
  if (s.includes("super")) return "super";
  if (s.includes("basic")) return "basic";
  if (s.includes("sms")) return "sms_campaign";
  return planKey || planName || null;
}

function derivePageFlags(page) {
  const p = String(page || "").toLowerCase();
  const flags = {};
  for (const { key, test } of PAGE_FLAGS) flags[key] = test(p);
  return flags;
}

function isBot(userAgent) {
  return BOT_UA.test(String(userAgent || ""));
}

function nowIso() {
  return new Date().toISOString();
}

function sessionDurationMs(session) {
  const start = session.sessionStartedAt ? new Date(session.sessionStartedAt).getTime() : Date.now();
  return Math.max(0, Date.now() - start);
}

function idleMs(session) {
  const last = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : Date.now();
  return Math.max(0, Date.now() - last);
}

function pushTimeline(session, entry) {
  if (!session.timeline) session.timeline = [];
  session.timeline.unshift({ at: nowIso(), ...entry });
  if (session.timeline.length > 80) session.timeline.length = 80;
}

function pushPageHistory(session, page, pageTitle) {
  if (!page) return;
  if (!session.pageHistory) session.pageHistory = [];
  const prev = session.pageHistory[0];
  if (prev?.page === page) return;
  session.pageHistory.unshift({ page, pageTitle: pageTitle || null, at: nowIso() });
  if (session.pageHistory.length > 40) session.pageHistory.length = 40;
  session.previousPage = prev?.page || session.previousPage || null;
  session.currentPage = page;
}

async function enrichUsers(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  const out = new Map();
  const missing = [];

  for (const id of ids) {
    const cached = userEnrichCache.get(id);
    if (cached && Date.now() - cached.at < USER_ENRICH_TTL_MS) {
      out.set(id, cached.data);
    } else {
      missing.push(id);
    }
  }

  if (missing.length) {
    const oids = missing.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const [users, subs] = await Promise.all([
      User.find({ _id: { $in: oids } })
        .select("email name firstName lastName remainingCredits role")
        .lean(),
      Subscription.find({ userId: { $in: oids }, status: "active" })
        .select("userId planName planKey planType status")
        .lean()
    ]);
    const subByUser = new Map(subs.map((s) => [String(s.userId), s]));
    for (const u of users) {
      const uid = String(u._id);
      const sub = subByUser.get(uid);
      const planTier = normalizePlanTier(sub?.planName, sub?.planKey);
      const data = {
        userName: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
        userEmail: u.email || null,
        remainingCredits: Number(u.remainingCredits || 0),
        role: u.role || "user",
        subscriptionStatus: sub?.status || null,
        subscriptionPlan: sub?.planName || sub?.planKey || null,
        planTier,
        isSubscriber: !!sub,
        isAdmin: u.role === "admin"
      };
      userEnrichCache.set(uid, { data, at: Date.now() });
      out.set(uid, data);
    }
  }
  return out;
}

async function getRevenueToday() {
  if (Date.now() - revenueTodayCache.at < REVENUE_TODAY_TTL_MS) {
    return revenueTodayCache.value;
  }
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const agg = await StripeInvoice.aggregate([
    { $match: { status: "paid" } },
    { $addFields: { ts: { $ifNull: ["$issuedAt", "$createdAt"] } } },
    { $match: { ts: { $gte: start } } },
    { $group: { _id: null, total: { $sum: "$amountPaid" } } }
  ]).option({ maxTimeMS: 8000 });
  const value = Number((agg[0]?.total || 0).toFixed(2));
  revenueTodayCache = { value, at: Date.now() };
  return value;
}

function pruneInactiveSessions() {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  for (const s of getAllSessions()) {
    const last = s.lastActivityAt ? new Date(s.lastActivityAt).getTime() : 0;
    if (last < cutoff) deleteSession(s.sessionId);
  }
}

function getActiveSessions() {
  pruneInactiveSessions();
  return getAllSessions();
}

function sanitizeSessionForClient(session, { revealIp = false, superAdmin = false } = {}) {
  const idle = idleMs(session);
  const duration = sessionDurationMs(session);
  const flags = session.flags || {};
  const liveStatus = idle > IDLE_THRESHOLD_MS ? "idle" : "active";

  const ip = session.ipAddress;
  const showFullIp = revealIp && superAdmin;

  return {
    ...session,
    liveStatus,
    sessionDurationSeconds: Math.round(duration / 1000),
    idleSeconds: Math.round(idle / 1000),
    ipAddress: showFullIp ? ip : maskIp(ip),
    ipMasked: maskIp(ip),
    ipRevealed: showFullIp,
    coordinates:
      session.latitude != null && session.longitude != null
        ? { lat: session.latitude, lng: session.longitude }
        : null
  };
}

function computeKpis(sessions, enriched, liveCounters) {
  const kpis = {
    activeVisitors: sessions.length,
    activeLoggedIn: 0,
    anonymousVisitors: 0,
    returningVisitors: 0,
    newVisitors: 0,
    subscribersOnline: 0,
    paidSubscribersOnline: 0,
    basicUsersOnline: 0,
    superUsersOnline: 0,
    unlimitedUsersOnline: 0,
    enterpriseUsersOnline: 0,
    visitorsInCheckout: 0,
    visitorsOnPricing: 0,
    visitorsOnSignup: 0,
    visitorsOnDashboard: 0,
    liveCalls: liveCounters.calls || 0,
    liveSms: liveCounters.sms || 0,
    livePurchases: liveCounters.purchases || 0,
    liveRevenueToday: liveCounters.revenueToday || 0,
    liveSignups: liveCounters.signups || 0,
    liveSubscriptions: liveCounters.subscriptions || 0,
    liveErrors: liveCounters.errors || 0,
    avgSessionSeconds: 0,
    avgActiveSeconds: 0,
    avgPagesViewed: 0,
    bounceRisk: 0,
    liveConversionRate: 0,
    botsFiltered: 0
  };

  let totalDuration = 0;
  let totalActive = 0;
  let totalPages = 0;
  let bounceCandidates = 0;

  for (const s of sessions) {
    if (s.isBot) {
      kpis.botsFiltered += 1;
      continue;
    }
    const enrich = s.userId ? enriched.get(String(s.userId)) : null;
    if (s.userId || enrich) kpis.activeLoggedIn += 1;
    else kpis.anonymousVisitors += 1;
    if (s.isReturning) kpis.returningVisitors += 1;
    else kpis.newVisitors += 1;

    const tier = enrich?.planTier || s.planTier;
    if (enrich?.isSubscriber || s.isSubscriber) {
      kpis.subscribersOnline += 1;
      kpis.paidSubscribersOnline += 1;
    }
    if (tier === "basic") kpis.basicUsersOnline += 1;
    if (tier === "super") kpis.superUsersOnline += 1;
    if (tier === "unlimited") kpis.unlimitedUsersOnline += 1;
    if (tier === "enterprise") kpis.enterpriseUsersOnline += 1;

    const f = s.flags || derivePageFlags(s.currentPage);
    if (f.inCheckout) kpis.visitorsInCheckout += 1;
    if (f.onPricing) kpis.visitorsOnPricing += 1;
    if (f.onSignup) kpis.visitorsOnSignup += 1;
    if (f.onDashboard) kpis.visitorsOnDashboard += 1;

    const dur = sessionDurationMs(s);
    const idle = idleMs(s);
    totalDuration += dur;
    totalActive += Math.max(0, dur - idle);
    totalPages += s.pagesViewed || 0;
    if ((s.pagesViewed || 0) <= 1 && dur < 15000) bounceCandidates += 1;
  }

  const humanSessions = sessions.filter((s) => !s.isBot);
  const n = humanSessions.length || 1;
  kpis.avgSessionSeconds = Math.round(totalDuration / n / 1000);
  kpis.avgActiveSeconds = Math.round(totalActive / n / 1000);
  kpis.avgPagesViewed = Number((totalPages / n).toFixed(1));
  kpis.bounceRisk =
    humanSessions.length > 0
      ? Number(((bounceCandidates / humanSessions.length) * 100).toFixed(1))
      : 0;
  kpis.liveConversionRate =
    kpis.activeVisitors > 0
      ? Number(((kpis.liveSignups / kpis.activeVisitors) * 100).toFixed(2))
      : 0;

  return kpis;
}

function computeFunnel(sessions) {
  const human = sessions.filter((s) => !s.isBot);
  const count = (pred) => human.filter(pred).length;
  const onPage = (re) => (s) => re.test(String(s.currentPage || ""));

  const visitors = human.length;
  const pricing = count(onPage(/pricing|billing|plans/));
  const signup = count(
    (s) =>
      /signup|register/.test(String(s.currentPage || "")) ||
      (s.timeline || []).some((t) => t.type === "signup")
  );
  const checkout = count((s) => s.flags?.inCheckout || /checkout|billing/.test(String(s.currentPage || "")));
  const subscribed = count((s) => s.isSubscriber || (s.timeline || []).some((t) => t.type === "subscription"));
  const number = count((s) => (s.timeline || []).some((t) => t.type === "number_purchase"));
  const firstCall = count((s) => (s.timeline || []).some((t) => t.type === "call"));
  const returning = count((s) => s.isReturning);

  return [
    { step: "Visitors", count: visitors, rate: 100 },
    { step: "Pricing", count: pricing, rate: visitors ? (pricing / visitors) * 100 : 0 },
    { step: "Signup", count: signup, rate: visitors ? (signup / visitors) * 100 : 0 },
    { step: "Checkout", count: checkout, rate: visitors ? (checkout / visitors) * 100 : 0 },
    { step: "Subscription", count: subscribed, rate: visitors ? (subscribed / visitors) * 100 : 0 },
    { step: "Number Purchase", count: number, rate: visitors ? (number / visitors) * 100 : 0 },
    { step: "First Call", count: firstCall, rate: visitors ? (firstCall / visitors) * 100 : 0 },
    { step: "Returning", count: returning, rate: visitors ? (returning / visitors) * 100 : 0 }
  ].map((s) => ({ ...s, rate: Number(s.rate.toFixed(1)) }));
}

function computeTrafficSources(sessions) {
  const map = new Map();
  for (const s of sessions.filter((x) => !x.isBot)) {
    const key = s.source || s.channel || "unknown";
    const row = map.get(key) || { source: key, channel: s.channel || "unknown", visitors: 0, conversions: 0, revenue: 0 };
    row.visitors += 1;
    if ((s.timeline || []).some((t) => ["signup", "subscription", "purchase"].includes(t.type))) {
      row.conversions += 1;
    }
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.visitors - a.visitors);
}

function computeDeviceBreakdown(sessions) {
  const devices = {};
  const browsers = {};
  const os = {};
  const languages = {};
  let darkMode = 0;
  let total = 0;

  for (const s of sessions.filter((x) => !x.isBot)) {
    total += 1;
    const d = s.device || "unknown";
    devices[d] = (devices[d] || 0) + 1;
    const b = s.browser || "unknown";
    browsers[b] = (browsers[b] || 0) + 1;
    const o = s.os || "unknown";
    os[o] = (os[o] || 0) + 1;
    const lang = s.language || "unknown";
    languages[lang] = (languages[lang] || 0) + 1;
    if (s.prefersDarkMode) darkMode += 1;
  }

  const toArr = (obj, keyName) =>
    Object.entries(obj)
      .map(([k, v]) => ({ [keyName]: k, count: v }))
      .sort((a, b) => b.count - a.count);

  return {
    devices: toArr(devices, "device"),
    browsers: toArr(browsers, "browser"),
    os: toArr(os, "os"),
    languages: toArr(languages, "language"),
    darkModePercent: total ? Number(((darkMode / total) * 100).toFixed(1)) : 0
  };
}

function computeGeoPoints(sessions) {
  const map = new Map();
  for (const s of sessions.filter((x) => !x.isBot)) {
    const key = `${s.country || "Unknown"}|${s.city || ""}`;
    const row =
      map.get(key) ||
      {
        country: s.country || "Unknown",
        city: s.city || null,
        visitors: 0,
        signups: 0,
        purchases: 0,
        lat: s.latitude,
        lng: s.longitude
      };
    row.visitors += 1;
    if ((s.timeline || []).some((t) => t.type === "signup")) row.signups += 1;
    if ((s.timeline || []).some((t) => t.type === "purchase" || t.type === "subscription")) {
      row.purchases += 1;
    }
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.visitors - a.visitors);
}

const liveCounters = {
  pageViews: 0,
  signups: 0,
  subscriptions: 0,
  purchases: 0,
  calls: 0,
  sms: 0,
  revenue: 0,
  errors: 0,
  revenueToday: 0
};

function scheduleEmit() {
  if (!ioInstance) return;
  const now = Date.now();
  const fire = async () => {
    lastEmitAt = Date.now();
    try {
      const snap = await getIntelligenceSnapshot({ window: DEFAULT_TIMEFRAME, limit: 200 });
      ioInstance.to(ADMIN_ROOM).emit("admin:live_intelligence", { type: "snapshot", ...snap });
    } catch {
      ioInstance.to(ADMIN_ROOM).emit("admin:live_intelligence", {
        type: "delta",
        at: nowIso()
      });
    }
    ioInstance.to(ADMIN_ROOM).emit("admin:analytics_live", getLegacySnapshot());
  };

  if (now - lastEmitAt >= EMIT_THROTTLE_MS) {
    fire();
    return;
  }
  if (!emitTimer) {
    emitTimer = setTimeout(() => {
      emitTimer = null;
      fire();
    }, EMIT_THROTTLE_MS - (now - lastEmitAt));
  }
}

export function getLegacySnapshot() {
  const sessions = getActiveSessions().filter((s) => !s.isBot);
  return {
    at: nowIso(),
    activeVisitors: sessions.length,
    pageViews: liveCounters.pageViews,
    signups: liveCounters.signups,
    subscriptions: liveCounters.subscriptions,
    purchases: liveCounters.purchases,
    calls: liveCounters.calls,
    sms: liveCounters.sms,
    revenue: liveCounters.revenue,
    errors: liveCounters.errors,
    recent: getRecentEvents(40)
  };
}

export function configureLiveIntelligence(io) {
  ioInstance = io;
  hydrateFromRedis().catch(() => {});
  if (!pruneTimer) {
    pruneTimer = setInterval(pruneInactiveSessions, 30_000);
    pruneTimer.unref?.();
  }
  io.on("connection", (socket) => {
    if (socket.adminUser) {
      socket.join(ADMIN_ROOM);
    }
    getIntelligenceSnapshot({ window: DEFAULT_TIMEFRAME, limit: 50 }).then((snap) => {
      socket.emit("admin:live_intelligence", { type: "snapshot", ...snap });
      socket.emit("admin:analytics_live", getLegacySnapshot());
    }).catch(() => {});
  });
}

/**
 * Upsert live session from ingestion pipeline.
 */
export async function upsertLiveSession(input = {}) {
  const {
    visitorId,
    sessionId,
    userId = null,
    context = {},
    geo = {},
    attribution = {},
    device,
    browser,
    os,
    deviceBrand,
    ipAddress,
    isReturning = false,
    hits = [],
    visitorMeta = null
  } = input;

  if (!visitorId || !sessionId) return;

  const now = nowIso();
  let session = getSession(sessionId) || {
    visitorId,
    sessionId,
    sessionStartedAt: now,
    firstSeenAt: visitorMeta?.firstSeenAt || now,
    visitCount: visitorMeta?.sessionCount || 1,
    pagesViewed: 0,
    timeline: [],
    pageHistory: [],
    events: [],
    totalPurchases: visitorMeta?.eventCount || 0,
    lifetimeRevenue: 0,
    isReturning,
    isNew: !isReturning,
    isBot: isBot(context.userAgent),
    flags: {}
  };

  session.lastActivityAt = now;
  session.userId = userId || session.userId;
  session.device = device || session.device;
  session.deviceBrand = deviceBrand || session.deviceBrand;
  session.browser = browser || session.browser;
  session.os = os || session.os;
  session.screenResolution = context.screenResolution || session.screenResolution;
  session.viewport = context.viewport || session.viewport;
  session.language = context.language || session.language;
  session.timezone = context.timezone || session.timezone;
  session.prefersDarkMode = context.prefersDarkMode ?? session.prefersDarkMode;
  session.networkType = context.networkType || session.networkType;
  session.country = geo.country || session.country;
  session.city = geo.city || session.city;
  session.region = geo.region || session.region;
  session.latitude = geo.latitude ?? session.latitude;
  session.longitude = geo.longitude ?? session.longitude;
  session.ipAddress = ipAddress || session.ipAddress;
  session.channel = attribution.channel || session.channel;
  session.source = attribution.source || session.source;
  session.medium = attribution.medium || session.medium;
  session.campaign = attribution.campaign || session.campaign;
  session.utmSource = attribution.utmSource || session.utmSource;
  session.utmMedium = attribution.utmMedium || session.utmMedium;
  session.utmCampaign = attribution.utmCampaign || session.utmCampaign;
  session.utmContent = attribution.utmContent || session.utmContent;
  session.utmTerm = attribution.utmTerm || session.utmTerm;
  session.referrer = attribution.referrer || session.referrer;
  session.landingPage = attribution.landingPage || session.landingPage;
  session.gaClientId = context.gaClientId || session.gaClientId;
  session.analyticsVisitorId = visitorId;
  session.isReturning = isReturning;
  session.isNew = !isReturning;

  for (const hit of hits) {
    if (hit.type === "pageview" || !hit.type) {
      const page = hit.page || context.page;
      pushPageHistory(session, page, hit.pageTitle);
      session.currentUrl = page;
      session.pagesViewed = (session.pagesViewed || 0) + 1;
      session.flags = { ...session.flags, ...derivePageFlags(page) };
      liveCounters.pageViews += 1;
      pushTimeline(session, { type: "pageview", label: page, page: page });
      pushEvent({
        kind: "pageview",
        at: now,
        visitorId,
        sessionId,
        page,
        country: session.country
      });
    } else if (hit.name && hit.name !== "__page_time") {
      const evt = {
        kind: hit.name,
        at: now,
        visitorId,
        sessionId,
        userId: userId || null,
        value: hit.value || 0,
        props: hit.props || {},
        country: session.country
      };
      pushEvent(evt);
      session.events.unshift(evt);
      if (session.events.length > 80) session.events.length = 80;

      const tlType = mapEventToTimelineType(hit.name);
      pushTimeline(session, { type: tlType, label: hit.name, value: hit.value || 0 });

      if (hit.name === ANALYTICS_EVENTS.SIGNUP_COMPLETED) {
        liveCounters.signups += 1;
        session.signedUp = true;
      }
      if (
        hit.name === ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED ||
        hit.name === ANALYTICS_EVENTS.PURCHASE
      ) {
        liveCounters.subscriptions += 1;
        liveCounters.purchases += 1;
        liveCounters.revenue += Number(hit.value || 0);
        session.isSubscriber = true;
      }
    }
  }

  if (userId) {
    const enrich = await enrichUsers([userId]);
    const u = enrich.get(String(userId));
    if (u) {
      Object.assign(session, {
        userName: u.userName,
        userEmail: u.userEmail,
        remainingCredits: u.remainingCredits,
        subscriptionStatus: u.subscriptionStatus,
        subscriptionPlan: u.subscriptionPlan,
        planTier: u.planTier,
        isSubscriber: u.isSubscriber,
        isAdmin: u.isAdmin,
        visitorType: u.isAdmin ? "admin" : u.isSubscriber ? "subscriber" : "signed_in"
      });
    }
  } else {
    session.visitorType = "anonymous";
  }

  trimSessionCollections(session);
  setSession(sessionId, session);
  scheduleEmit();
}

function mapEventToTimelineType(name) {
  if (name === ANALYTICS_EVENTS.SIGNUP_COMPLETED) return "signup";
  if (name === ANALYTICS_EVENTS.SUBSCRIPTION_PURCHASED || name === ANALYTICS_EVENTS.PURCHASE) {
    return "subscription";
  }
  if (name === ANALYTICS_EVENTS.NUMBER_PURCHASED) return "number_purchase";
  if (name.includes("call")) return "call";
  if (name === ANALYTICS_EVENTS.SMS_SENT) return "sms";
  if (name === ANALYTICS_EVENTS.BEGIN_CHECKOUT) return "checkout";
  return "event";
}

export function recordLiveCallIntel(payload = {}) {
  liveCounters.calls += 1;
  pushEvent({
    kind: "call",
    at: nowIso(),
    ...payload
  });
  scheduleEmit();
}

export function recordLiveSmsIntel(payload = {}) {
  liveCounters.sms += 1;
  pushEvent({
    kind: "sms",
    at: nowIso(),
    ...payload
  });
  scheduleEmit();
}

export function recordLivePurchaseIntel(payload = {}) {
  liveCounters.purchases += 1;
  liveCounters.revenue += Number(payload.value || 0);
  if (payload.kind === "subscription") liveCounters.subscriptions += 1;
  if (payload.kind === "signup") liveCounters.signups += 1;
  pushEvent({
    kind: payload.kind || "purchase",
    at: nowIso(),
    ...payload
  });
  scheduleEmit();
}

function applyVisitorFilters(sessions, { search, filters } = {}) {
  let rows = sessions.filter((s) => !s.isBot);
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((s) =>
      [
        s.visitorId,
        s.sessionId,
        s.userId,
        s.userEmail,
        s.userName,
        s.ipAddress,
        s.city,
        s.country,
        s.currentPage,
        s.subscriptionPlan,
        s.device,
        s.browser,
        s.campaign,
        s.source
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }

  const f = filters || {};
  if (f.loggedIn) rows = rows.filter((s) => s.userId);
  if (f.anonymous) rows = rows.filter((s) => !s.userId);
  if (f.subscribers) rows = rows.filter((s) => s.isSubscriber);
  if (f.returning) rows = rows.filter((s) => s.isReturning);
  if (f.new) rows = rows.filter((s) => !s.isReturning);
  if (f.mobile) rows = rows.filter((s) => s.device === "mobile");
  if (f.desktop) rows = rows.filter((s) => s.device === "desktop");
  if (f.country) rows = rows.filter((s) => s.country === f.country);
  if (f.source) rows = rows.filter((s) => s.source === f.source);
  if (f.plan) rows = rows.filter((s) => s.planTier === f.plan || s.subscriptionPlan === f.plan);

  rows.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
  return rows;
}

export async function getIntelligenceSnapshot(options = {}) {
  const {
    window = DEFAULT_TIMEFRAME,
    range = null,
    startDate = null,
    endDate = null,
    tzOffset = 0,
    search = "",
    filters = {},
    page = 1,
    limit = 100,
    revealIp = false,
    superAdmin = false
  } = options;

  const started = Date.now();
  const snapshot = await queryWindowSnapshot({
    window,
    range,
    startDate,
    endDate,
    tzOffset,
    search,
    filters,
    page,
    limit
  });

  if (isLiveOverlayWindow(window)) {
    const memorySessions = getActiveSessions().filter((s) => !s.isBot);
    const memIds = new Set(snapshot.visitors.map((v) => v.sessionId));
    for (const s of memorySessions) {
      if (!memIds.has(s.sessionId)) {
        const enriched = s.userId ? await enrichUsers([s.userId]) : new Map();
        const merged = { ...s, ...(enriched.get(String(s.userId)) || {}) };
        snapshot.visitors.unshift(sanitizeSessionForClient(merged, { revealIp, superAdmin }));
      }
    }
  }

  const pageRows = snapshot.visitors.map((s) =>
    sanitizeSessionForClient(s, { revealIp, superAdmin })
  );

  return {
    ...snapshot,
    type: "snapshot",
    visitors: pageRows,
    queryDurationMs: Date.now() - started,
    liveOverlay: isLiveOverlayWindow(window)
  };
}

export async function getVisitorIntelligence(sessionId, options = {}) {
  const session = getSession(sessionId);
  if (!session) return null;
  const enriched = session.userId ? await enrichUsers([session.userId]) : new Map();
  const merged = { ...session, ...(enriched.get(String(session.userId)) || {}) };
  return sanitizeSessionForClient(merged, options);
}

export async function loadVisitorHistory(visitorId) {
  if (!visitorId) return null;
  const visitor = await AnalyticsVisitor.findOne({ visitorId }).lean();
  return visitor;
}

export default {
  configureLiveIntelligence,
  upsertLiveSession,
  recordLiveCallIntel,
  recordLiveSmsIntel,
  recordLivePurchaseIntel,
  getIntelligenceSnapshot,
  getVisitorIntelligence,
  getLegacySnapshot,
  loadVisitorHistory
};
