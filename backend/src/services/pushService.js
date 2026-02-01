/**
 * Web Push service: send push notifications to user's subscribed devices.
 * Requires VAPID keys in env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) or push is no-op.
 */
import webpush from "web-push";
import PushSubscriptionModel from "../models/PushSubscription.js";

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return vapidConfigured;
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
  if (!configureVapid()) return;
  try {
    const subs = await PushSubscriptionModel.find({ user: userId }).lean();
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

export function getVapidPublicKey() {
  configureVapid();
  return process.env.VAPID_PUBLIC_KEY || null;
}
