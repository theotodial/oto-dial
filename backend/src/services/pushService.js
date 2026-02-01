/**
 * Web Push service: send push notifications to user's subscribed devices.
 * Requires VAPID keys in env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) or push is no-op.
 * Gracefully handles missing web-push package (push notifications are optional).
 */
import PushSubscriptionModel from "../models/PushSubscription.js";

let webpush = null;
let webpushAvailable = false;
let webpushLoadAttempted = false;

// Lazy load web-push package (optional dependency)
async function loadWebPush() {
  if (webpushLoadAttempted) return webpushAvailable;
  webpushLoadAttempted = true;
  
  try {
    const webpushModule = await import("web-push");
    webpush = webpushModule.default;
    webpushAvailable = true;
    return true;
  } catch (err) {
    console.warn("⚠️ web-push package not installed. Push notifications disabled.");
    console.warn("   To enable: npm install web-push");
    webpushAvailable = false;
    return false;
  }
}

let vapidConfigured = false;

async function configureVapid() {
  if (vapidConfigured) return vapidConfigured;
  
  // Try to load web-push if not already attempted
  if (!webpushLoadAttempted) {
    await loadWebPush();
  }
  
  if (!webpushAvailable || !webpush) return false; // web-push package not installed
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (publicKey && privateKey) {
    webpush.setVapidDetails(
      process.env.VAPID_MAILTO || "mailto:support@otodial.com",
      publicKey,
      privateKey
    );
    vapidConfigured = true;
  }
  return vapidConfigured;
}

/**
 * Send push notification to all subscriptions for a user.
 * @param {string} userId - MongoDB user id
 * @param {{ title: string, body?: string, data?: object }} payload
 */
export async function sendPushToUser(userId, payload) {
  if (!userId) return;
  
  // Try to load web-push if not already attempted
  if (!webpushLoadAttempted) {
    await loadWebPush();
  }
  
  if (!webpushAvailable || !webpush) return; // web-push package not installed
  if (!(await configureVapid())) return; // VAPID keys not configured
  try {
    const subs = await PushSubscriptionModel.find({ user: userId }).lean();
    if (!subs || subs.length === 0) return; // No subscriptions
    const payloadStr = JSON.stringify({
      title: payload.title || "New message",
      body: payload.body || "",
      ...payload.data
    });
    await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { auth: sub.keys.auth, p256dh: sub.keys.p256dh }
          },
          payloadStr,
          { TTL: 60 }
        )
      )
    );
  } catch (err) {
    console.warn("Push send error:", err.message);
  }
}

export async function getVapidPublicKey() {
  // Try to load web-push if not already attempted
  if (!webpushLoadAttempted) {
    await loadWebPush();
  }
  await configureVapid();
  return process.env.VAPID_PUBLIC_KEY || null;
}
