/**
 * Backfill analytics daily rollups from raw sessions/pageviews/events.
 *
 * Usage:
 *   node scripts/backfillAnalyticsRollups.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { backfillRollups } from "../src/services/analytics/rollupService.js";

async function main() {
  console.log("[backfill] connecting to MongoDB...");
  await connectDB();
  console.log("[backfill] connected. Computing daily rollups...");

  const start = Date.now();
  const result = await backfillRollups({
    onProgress: (day) => console.log(`[backfill] computed ${day}`)
  });

  console.log(
    `[backfill] done. ${result.days} day(s) in ${(
      (Date.now() - start) /
      1000
    ).toFixed(1)}s`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
