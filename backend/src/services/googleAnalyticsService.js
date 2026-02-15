import { BetaAnalyticsDataClient } from "@google-analytics/data";

function normalizePrivateKey(value) {
  if (!value) return null;
  return value.replace(/\\n/g, "\n");
}

function resolveGaPropertyId() {
  return (
    process.env.GA4_PROPERTY_ID ||
    process.env.GOOGLE_ANALYTICS_PROPERTY_ID ||
    process.env.GOOGLE_GA4_PROPERTY_ID ||
    null
  );
}

function resolveServiceAccountCredentials() {
  const jsonRaw =
    process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    null;
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      return {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key)
      };
    } catch (err) {
      return null;
    }
  }

  const jsonBase64 = process.env.GOOGLE_ANALYTICS_SERVICE_ACCOUNT_BASE64 || null;
  if (jsonBase64) {
    try {
      const decoded = Buffer.from(jsonBase64, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      return {
        client_email: parsed.client_email,
        private_key: normalizePrivateKey(parsed.private_key)
      };
    } catch (err) {
      return null;
    }
  }

  const clientEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GA_SERVICE_ACCOUNT_EMAIL ||
    null;
  const privateKey =
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GA_PRIVATE_KEY ||
    null;

  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: normalizePrivateKey(privateKey)
    };
  }

  return null;
}

export function getGoogleAnalyticsConfigStatus() {
  const propertyId = resolveGaPropertyId();
  const credentials = resolveServiceAccountCredentials();

  if (!propertyId) {
    return {
      configured: false,
      reason: "Missing GA4 property ID env variable",
      propertyId: null
    };
  }

  if (propertyId.startsWith("G-")) {
    return {
      configured: false,
      reason:
        "GA4 property ID is required (numeric), but Measurement ID (G-...) was provided",
      propertyId
    };
  }

  if (!credentials?.client_email || !credentials?.private_key) {
    return {
      configured: false,
      reason: "Missing Google service account credentials for GA Data API",
      propertyId
    };
  }

  return {
    configured: true,
    reason: null,
    propertyId,
    serviceAccountEmail: credentials.client_email
  };
}

function formatDateForGa(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "today";
  }
  return date.toISOString().split("T")[0];
}

function parseMetricValue(metricValue, fallback = 0) {
  const raw = metricValue?.value;
  if (raw === undefined || raw === null) {
    return fallback;
  }
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function formatGaDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) {
    return yyyymmdd || "";
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

async function runReportSafe(client, request) {
  try {
    const [report] = await client.runReport(request);
    return report || { rows: [] };
  } catch (err) {
    return { rows: [], _error: err.message };
  }
}

export async function getGoogleAnalyticsDashboardData({
  startDate,
  endDate
}) {
  const config = getGoogleAnalyticsConfigStatus();
  if (!config.configured) {
    return {
      success: false,
      error: config.reason,
      data: null,
      meta: {
        source: "google_analytics",
        configured: false,
        reason: config.reason,
        propertyId: config.propertyId
      }
    };
  }

  const credentials = resolveServiceAccountCredentials();
  const client = new BetaAnalyticsDataClient({ credentials });
  const property = `properties/${config.propertyId}`;
  const dateRanges = [
    {
      startDate: formatDateForGa(startDate),
      endDate: formatDateForGa(endDate)
    }
  ];

  const [
    overviewReport,
    dailyReport,
    countriesReport,
    devicesReport,
    browsersReport,
    osReport,
    pagesReport,
    eventsReport,
    realtimeReport
  ] = await Promise.all([
    runReportSafe(client, {
      property,
      dateRanges,
      metrics: [
        { name: "sessions" },
        { name: "totalUsers" },
        { name: "newUsers" },
        { name: "averageSessionDuration" }
      ]
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "newUsers" }
      ],
      orderBys: [{ dimension: { dimensionName: "date" } }]
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "country" }, { name: "countryId" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 50
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }]
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "browser" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "operatingSystem" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 20
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "userEngagementDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 20
    }),
    runReportSafe(client, {
      property,
      dateRanges,
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: {
            values: ["sign_up", "purchase", "subscribe", "subscription", "begin_checkout"]
          }
        }
      }
    }),
    (async () => {
      try {
        const [report] = await client.runRealtimeReport({
          property,
          metrics: [{ name: "activeUsers" }]
        });
        return report || { rows: [] };
      } catch (err) {
        return { rows: [], _error: err.message };
      }
    })()
  ]);

  const overviewRow = overviewReport.rows?.[0] || null;
  const totalVisitors = parseMetricValue(overviewRow?.metricValues?.[0], 0);
  const uniqueVisitors = parseMetricValue(overviewRow?.metricValues?.[1], 0);
  const newVisitors = parseMetricValue(overviewRow?.metricValues?.[2], 0);
  const avgTimeSpent = parseMetricValue(overviewRow?.metricValues?.[3], 0);
  const returningVisitors = Math.max(0, totalVisitors - newVisitors);

  const eventsMap = new Map();
  (eventsReport.rows || []).forEach((row) => {
    const eventName = row.dimensionValues?.[0]?.value || "unknown";
    const eventCount = parseMetricValue(row.metricValues?.[0], 0);
    eventsMap.set(eventName, eventCount);
  });

  const signUps = eventsMap.get("sign_up") || 0;
  const usersWithSubscription =
    (eventsMap.get("purchase") || 0) +
    (eventsMap.get("subscribe") || 0) +
    (eventsMap.get("subscription") || 0);

  const countries = (countriesReport.rows || []).map((row) => ({
    country: row.dimensionValues?.[0]?.value || "Unknown",
    countryCode: row.dimensionValues?.[1]?.value || "Unknown",
    visits: parseMetricValue(row.metricValues?.[0], 0),
    uniqueVisitors: parseMetricValue(row.metricValues?.[1], 0)
  }));

  const devices = (devicesReport.rows || []).map((row) => ({
    device: (row.dimensionValues?.[0]?.value || "unknown").toLowerCase(),
    count: parseMetricValue(row.metricValues?.[0], 0)
  }));

  const browsers = (browsersReport.rows || []).map((row) => ({
    browser: row.dimensionValues?.[0]?.value || "Unknown",
    count: parseMetricValue(row.metricValues?.[0], 0)
  }));

  const os = (osReport.rows || []).map((row) => ({
    os: row.dimensionValues?.[0]?.value || "Unknown",
    count: parseMetricValue(row.metricValues?.[0], 0)
  }));

  const pages = (pagesReport.rows || []).map((row) => {
    const visits = parseMetricValue(row.metricValues?.[0], 0);
    const engagementDuration = parseMetricValue(row.metricValues?.[1], 0);
    return {
      page: row.dimensionValues?.[0]?.value || "/",
      pageTitle: row.dimensionValues?.[1]?.value || "No title",
      visits,
      avgTimeSpent: visits > 0 ? Math.round(engagementDuration / visits) : 0
    };
  });

  const dailyVisitors = (dailyReport.rows || []).map((row) => {
    const sessions = parseMetricValue(row.metricValues?.[0], 0);
    const dailyNewVisitors = parseMetricValue(row.metricValues?.[1], 0);
    return {
      date: formatGaDate(row.dimensionValues?.[0]?.value),
      visitors: sessions,
      newVisitors: dailyNewVisitors,
      returningVisitors: Math.max(0, sessions - dailyNewVisitors),
      signUps: 0
    };
  });

  const funnel = {
    totalVisitors,
    uniqueVisitors,
    signedUp: signUps,
    withSubscription: usersWithSubscription,
    conversionRate: uniqueVisitors > 0 ? Number(((signUps / uniqueVisitors) * 100).toFixed(2)) : 0,
    subscriptionRate: signUps > 0 ? Number(((usersWithSubscription / signUps) * 100).toFixed(2)) : 0
  };

  const realtimeActiveUsers = parseMetricValue(realtimeReport.rows?.[0]?.metricValues?.[0], 0);
  const reportWarnings = [
    overviewReport._error,
    dailyReport._error,
    countriesReport._error,
    devicesReport._error,
    browsersReport._error,
    osReport._error,
    pagesReport._error,
    eventsReport._error,
    realtimeReport._error
  ].filter(Boolean);

  const criticalReportsFailed =
    !!overviewReport._error &&
    !!dailyReport._error &&
    !!countriesReport._error;

  if (criticalReportsFailed) {
    return {
      success: false,
      error: "Failed to read GA4 reports. Check property access and service account permissions.",
      data: null,
      meta: {
        source: "google_analytics",
        configured: true,
        propertyId: config.propertyId,
        serviceAccountEmail: config.serviceAccountEmail,
        warnings: reportWarnings
      }
    };
  }

  return {
    success: true,
    data: {
      overview: {
        totalVisitors,
        uniqueVisitors,
        returningVisitors,
        newVisitors,
        signUps,
        usersWithSubscription,
        avgTimeSpent: Math.round(avgTimeSpent),
        realtimeActiveUsers
      },
      countries,
      devices,
      browsers,
      os,
      pages,
      dailyVisitors,
      topIPs: [],
      funnel
    },
    meta: {
      source: "google_analytics",
      configured: true,
      propertyId: config.propertyId,
      serviceAccountEmail: config.serviceAccountEmail,
      warnings: reportWarnings
    }
  };
}

export default {
  getGoogleAnalyticsDashboardData,
  getGoogleAnalyticsConfigStatus
};
