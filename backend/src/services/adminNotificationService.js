import AdminNotification from "../models/AdminNotification.js";

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

  const payload = {
    type,
    title,
    message,
    data,
    sourceModel,
    sourceId: sourceId ? String(sourceId) : null,
    dedupeKey: dedupeKey || null
  };

  if (payload.dedupeKey) {
    const existing = await AdminNotification.findOne({ dedupeKey: payload.dedupeKey });
    if (existing) {
      return existing;
    }
  }

  return AdminNotification.create(payload);
}

export default {
  createAdminNotification
};
