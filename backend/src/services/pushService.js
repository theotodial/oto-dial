import webpush from "web-push";
import PushSubscription from "../models/PushSubscription.js";

const hasPushConfig =
  process.env.WEB_PUSH_PUBLIC_KEY &&
  process.env.WEB_PUSH_PRIVATE_KEY &&
  process.env.WEB_PUSH_SUBJECT;

if (hasPushConfig) {
  webpush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT,
    process.env.WEB_PUSH_PUBLIC_KEY,
    process.env.WEB_PUSH_PRIVATE_KEY
  );
} else {
  console.warn("⚠️ WEB_PUSH keys missing — push notifications disabled");
}

export function isPushEnabled() {
  return Boolean(hasPushConfig);
}

export async function sendPushToUser(userId, payload) {
  if (!hasPushConfig) {
    return { success: false, error: "Push not configured" };
  }

  const subscriptions = await PushSubscription.find({ user: userId }).lean();
  if (!subscriptions.length) {
    return { success: false, error: "No subscriptions" };
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys
        },
        JSON.stringify(payload)
      )
    )
  );

  const invalidEndpoints = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const statusCode = result.reason?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        invalidEndpoints.push(subscriptions[index].endpoint);
      }
    }
  });

  if (invalidEndpoints.length) {
    await PushSubscription.deleteMany({
      user: userId,
      endpoint: { $in: invalidEndpoints }
    });
  }

  return { success: true, sent: results.length };
}
