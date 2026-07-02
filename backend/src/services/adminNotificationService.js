import AdminNotification from "../models/AdminNotification.js";
import { emitAdminSocketEvent } from "./adminLiveEventsService.js";
import { BELL_NOTIFICATION_TYPES } from "./adminNavCountsService.js";

const BELL_TYPE_SET = new Set(BELL_NOTIFICATION_TYPES);

function buildAutoDedupeKey() {
  return `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function createAdminNotification({
  type = "system",
  title,
  message,
  data = {},
  sourceModel = null,
  sourceId = null,
  dedupeKey = null
}) {
  if (!title || !message) {
    return null;
  }

  const normalizedDedupeKey = typeof dedupeKey === "string" && dedupeKey.trim()
    ? dedupeKey.trim()
    : null;

  const payload = {
    type,
    title,
    message,
    data,
    sourceModel,
    sourceId: sourceId ? String(sourceId) : null,
    dedupeKey: normalizedDedupeKey || buildAutoDedupeKey()
  };

  if (normalizedDedupeKey) {
    const existing = await AdminNotification.findOne({ dedupeKey: normalizedDedupeKey });
    if (existing) {
      return existing;
    }
  }

  const emitBellSocket = (notification) => {
    if (!notification || !BELL_TYPE_SET.has(notification.type)) return;
    emitAdminSocketEvent("admin:bell_notification", {
      notification: {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data || {},
        isRead: notification.isRead === true,
        createdAt: notification.createdAt,
      },
    });
  };

  try {
    const created = await AdminNotification.create(payload);
    emitBellSocket(created);
    return created;
  } catch (error) {
    if (error?.code === 11000) {
      if (normalizedDedupeKey) {
        return AdminNotification.findOne({ dedupeKey: normalizedDedupeKey });
      }

      // Retry once with a fresh auto key for legacy unique-index edge cases.
      payload.dedupeKey = buildAutoDedupeKey();
      const created = await AdminNotification.create(payload);
      emitBellSocket(created);
      return created;
    }

    throw error;
  }
}

export default {
  createAdminNotification
};
