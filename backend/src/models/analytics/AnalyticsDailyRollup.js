import mongoose from "mongoose";

/**
 * AnalyticsDailyRollup
 *
 * Pre-aggregated per-UTC-day metrics. Powers fast historical queries and
 * time-series charts without scanning the raw collections. Range-level
 * unique/new/returning visitors are still computed from sessions (since
 * uniques are not additive across days); rollups accelerate everything
 * else and the daily series.
 */
const analyticsDailyRollupSchema = new mongoose.Schema(
  {
    // UTC day key, e.g. "2026-06-26"
    date: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    metrics: {
      visitors: { type: Number, default: 0 }, // sessions count proxy
      uniqueVisitors: { type: Number, default: 0 }, // distinct visitorId that day
      newVisitors: { type: Number, default: 0 },
      returningVisitors: { type: Number, default: 0 },
      sessions: { type: Number, default: 0 },
      pageViews: { type: Number, default: 0 },
      bounces: { type: Number, default: 0 },
      totalDurationSeconds: { type: Number, default: 0 },
      signups: { type: Number, default: 0 },
      subscriptions: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    },

    // Breakdown maps { key: count }
    byChannel: { type: mongoose.Schema.Types.Mixed, default: {} },
    byCountry: { type: mongoose.Schema.Types.Mixed, default: {} },
    byDevice: { type: mongoose.Schema.Types.Mixed, default: {} },
    byBrowser: { type: mongoose.Schema.Types.Mixed, default: {} },
    byOS: { type: mongoose.Schema.Types.Mixed, default: {} },
    byPage: { type: mongoose.Schema.Types.Mixed, default: {} },
    bySource: { type: mongoose.Schema.Types.Mixed, default: {} },
    eventCounts: { type: mongoose.Schema.Types.Mixed, default: {} },

    computedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model("AnalyticsDailyRollup", analyticsDailyRollupSchema);
