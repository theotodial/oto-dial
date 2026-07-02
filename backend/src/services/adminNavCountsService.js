import AdminNotification from "../models/AdminNotification.js";
import SupportTicket from "../models/SupportTicket.js";
import User from "../models/User.js";

export const BELL_NOTIFICATION_TYPES = [
  "sale",
  "number_purchase",
  "support",
  "identity_verification"
];

export async function getAdminNavCounts({ bellLimit = 15 } = {}) {
  const limit = Math.min(Math.max(Number(bellLimit) || 15, 1), 50);

  const [
    openSupport,
    inProgressSupport,
    pendingKyc,
    unreadNotifications,
    unreadSignup,
    bellUnread,
    bellNotifications
  ] = await Promise.all([
    SupportTicket.countDocuments({ status: "open" }),
    SupportTicket.countDocuments({ status: "in_progress" }),
    User.countDocuments({ "identityVerification.status": "pending" }),
    AdminNotification.countDocuments({ isRead: false }),
    AdminNotification.countDocuments({ isRead: false, type: "signup" }),
    AdminNotification.countDocuments({
      isRead: false,
      type: { $in: BELL_NOTIFICATION_TYPES }
    }),
    AdminNotification.find({ type: { $in: BELL_NOTIFICATION_TYPES } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
  ]);

  const actionableSupport = openSupport + inProgressSupport;

  return {
    users: unreadSignup,
    support: actionableSupport,
    openSupport,
    inProgressSupport,
    pendingKyc,
    notifications: unreadNotifications,
    bell: {
      unreadCount: bellUnread,
      notifications: bellNotifications
    }
  };
}

export async function markAdminNotificationsReadByType(type) {
  if (!type) return 0;
  const result = await AdminNotification.updateMany(
    { type, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return result.modifiedCount || 0;
}
