import Subscription from "../models/Subscription.js";
import CustomPackage from "../models/CustomPackage.js";

let timer = null;

export async function runSystemHealthCheck() {
  const now = new Date();

  try {
    await Subscription.updateMany(
      { "usage.minutesUsed": { $lt: 0 } },
      { $set: { "usage.minutesUsed": 0 } }
    );

    await Subscription.updateMany(
      { "usage.smsUsed": { $lt: 0 } },
      { $set: { "usage.smsUsed": 0 } }
    );

    await Subscription.updateMany(
      {
        periodEnd: { $lt: now },
        status: { $in: ["active", "trialing", "pending_activation", "past_due", "incomplete"] },
      },
      {
        $set: { status: "cancelled" },
      }
    );

    await CustomPackage.updateMany(
      {
        active: true,
        expiresAt: { $ne: null, $lt: now },
      },
      {
        $set: { active: false },
      }
    );
  } catch (error) {
    console.error("[SYSTEM HEALTH] self-heal failed:", error?.message || error);
  }
}

export function startSystemHealthService() {
  if (timer) {
    return;
  }

  runSystemHealthCheck().catch((error) => {
    console.error("[SYSTEM HEALTH] initial run failed:", error?.message || error);
  });

  timer = setInterval(() => {
    runSystemHealthCheck().catch((error) => {
      console.error("[SYSTEM HEALTH] scheduled run failed:", error?.message || error);
    });
  }, 60_000);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  console.log("🩺 System health service started (every 1m)");
}
