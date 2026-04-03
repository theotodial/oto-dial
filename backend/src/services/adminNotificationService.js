import AdminNotification from "../models/AdminNotification.js";

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

  try {
    return await AdminNotification.create(payload);
  } catch (error) {
    if (error?.code === 11000) {
      if (normalizedDedupeKey) {
        return AdminNotification.findOne({ dedupeKey: normalizedDedupeKey });
      }

      // Retry once with a fresh auto key for legacy unique-index edge cases.
      payload.dedupeKey = buildAutoDedupeKey();
      return AdminNotification.create(payload);
    }

    throw error;
  }
}

export default {
  createAdminNotification
};
