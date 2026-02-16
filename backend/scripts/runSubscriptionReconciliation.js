import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { reconcilePaidSubscriptionInvoices } from "../src/services/stripeSubscriptionService.js";

function parsePositiveInt(value, fallback, maxValue = null) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  if (Number.isFinite(maxValue) && parsed > maxValue) {
    return maxValue;
  }
  return parsed;
}

async function main() {
  const hoursBack = parsePositiveInt(process.argv[2], 24 * 14, 24 * 120);
  const maxInvoices = parsePositiveInt(process.argv[3], 500, 2000);
  const stripeSyncMaxPages = parsePositiveInt(process.argv[4], 12, 30);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (hoursBack * 60 * 60 * 1000));

  console.log(
    `🔎 Running subscription reconciliation (hoursBack=${hoursBack}, maxInvoices=${maxInvoices}, stripeSyncMaxPages=${stripeSyncMaxPages})`
  );

  await connectDB();

  const result = await reconcilePaidSubscriptionInvoices({
    startDate,
    endDate,
    maxInvoices,
    autoRepair: true,
    performStripeSync: true,
    stripeSyncMaxPages,
    reason: "manual_script"
  });

  console.log("✅ Reconciliation result:");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error("❌ Reconciliation script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch (closeErr) {
      // No-op
    }
  });
