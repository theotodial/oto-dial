import { reconcilePaidSubscriptionInvoices } from "./stripeSubscriptionService.js";

let schedulerTimer = null;
let schedulerRunning = false;

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

async function runReconciliationCycle({
  trigger = "interval",
  windowHours,
  maxInvoices,
  stripeSyncMaxPages,
  autoRepair
}) {
  if (schedulerRunning) {
    return;
  }

  schedulerRunning = true;
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - (windowHours * 60 * 60 * 1000));

  try {
    const result = await reconcilePaidSubscriptionInvoices({
      startDate,
      endDate,
      maxInvoices,
      autoRepair,
      performStripeSync: true,
      stripeSyncMaxPages,
      reason: `scheduler:${trigger}`
    });

    console.log(
      `🛡️ Subscription reconciliation (${trigger}) scanned=${result.scanned}, repaired=${result.repaired}, unresolved=${result.unresolved}, failuresCreated=${result.failuresCreated}`
    );
  } catch (err) {
    console.error("❌ Subscription reconciliation scheduler cycle failed:", err.message);
  } finally {
    schedulerRunning = false;
  }
}

export function startSubscriptionReconciliationScheduler() {
  const enabled = String(process.env.SUBSCRIPTION_RECONCILIATION_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false";

  if (!enabled) {
    console.log("ℹ️ Subscription reconciliation scheduler disabled by env");
    return () => {};
  }

  if (schedulerTimer) {
    return () => {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    };
  }

  const intervalMinutes = parsePositiveInt(
    process.env.SUBSCRIPTION_RECONCILIATION_INTERVAL_MINUTES,
    15,
    720
  );
  const windowHours = parsePositiveInt(
    process.env.SUBSCRIPTION_RECONCILIATION_WINDOW_HOURS,
    72,
    24 * 30
  );
  const maxInvoices = parsePositiveInt(
    process.env.SUBSCRIPTION_RECONCILIATION_MAX_INVOICES,
    300,
    2000
  );
  const stripeSyncMaxPages = parsePositiveInt(
    process.env.SUBSCRIPTION_RECONCILIATION_SYNC_MAX_PAGES,
    6,
    30
  );
  const autoRepair = String(process.env.SUBSCRIPTION_RECONCILIATION_AUTO_REPAIR || "true")
    .trim()
    .toLowerCase() !== "false";

  runReconciliationCycle({
    trigger: "startup",
    windowHours,
    maxInvoices,
    stripeSyncMaxPages,
    autoRepair
  }).catch((err) => {
    console.error("❌ Startup subscription reconciliation failed:", err.message);
  });

  schedulerTimer = setInterval(() => {
    runReconciliationCycle({
      trigger: "interval",
      windowHours,
      maxInvoices,
      stripeSyncMaxPages,
      autoRepair
    }).catch((err) => {
      console.error("❌ Interval subscription reconciliation failed:", err.message);
    });
  }, intervalMinutes * 60 * 1000);

  if (typeof schedulerTimer.unref === "function") {
    schedulerTimer.unref();
  }

  console.log(
    `🛡️ Subscription reconciliation scheduler started (every ${intervalMinutes}m, window ${windowHours}h, autoRepair=${autoRepair})`
  );

  return () => {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  };
}

export default {
  startSubscriptionReconciliationScheduler
};
