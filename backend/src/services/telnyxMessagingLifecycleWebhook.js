import SMS from "../models/SMS.js";
import { emitSmsOutboundLifecycle, emitSmsUpdated } from "../events/smsEvents.js";
import { emitAdminLiveSms } from "./adminLiveEventsService.js";

const LIFECYCLE_TYPES = new Set(["message.sent", "message.delivered", "message.failed"]);

/**
 * @param {unknown} payload
 * @returns {{ code: string, reason: string }}
 */
function extractDeliveryFailure(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const errors = p.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const e = errors[0] && typeof errors[0] === "object" ? errors[0] : {};
    const code = String(e.code ?? e.meta?.code ?? "").trim();
    const reason =
      [e.title, e.detail].filter(Boolean).join(" — ").trim() ||
      String(e.code || e.type || "Delivery failed");
    return { code, reason };
  }
  if (p.failure_reason != null && String(p.failure_reason).trim()) {
    return { code: "", reason: String(p.failure_reason).trim() };
  }
  if (p.error && typeof p.error === "object") {
    const code = String(p.error.code ?? "").trim();
    const reason = String(p.error.message ?? p.error.title ?? "Delivery failed").trim();
    return { code, reason };
  }
  return { code: "", reason: "Delivery failed" };
}

/**
 * Telnyx messaging profile webhooks: message.sent, message.delivered, message.failed.
 * @returns {Promise<{ handled: boolean }>}
 */
export async function handleTelnyxMessagingLifecycle(req) {
  const eventType = req.body?.data?.event_type || req.body?.event_type;
  if (!eventType || !LIFECYCLE_TYPES.has(eventType)) {
    return { handled: false };
  }

  const payload = req.body?.data?.payload || req.body?.payload;
  const messageId = payload?.id;
  if (!messageId) {
    console.warn("[TELNYX SMS LIFECYCLE] missing payload.id", { eventType });
    return { handled: true };
  }

  const doc = await SMS.findOne({
    telnyxMessageId: String(messageId),
    direction: "outbound",
  })
    .select("_id user to status telnyxMessageId")
    .lean();

  if (!doc) {
    console.log("[TELNYX SMS LIFECYCLE] no outbound SMS row", { eventType, messageId });
    return { handled: true };
  }

  const userId = doc.user;
  const mongoId = String(doc._id);

  if (eventType === "message.sent") {
    const r = await SMS.updateOne(
      { _id: doc._id, direction: "outbound", status: "queued" },
      { $set: { status: "sent" }, $unset: { deliveryError: "" } }
    );
    if (r.modifiedCount && userId) {
      try {
        emitSmsOutboundLifecycle(userId, "sent", {
          mongoId,
          to: doc.to,
          messageId: String(messageId),
        });
        emitSmsUpdated(userId, doc._id, "outbound");
      } catch {
        /* ignore */
      }
    }
    return { handled: true };
  }

  if (eventType === "message.delivered") {
    const r = await SMS.updateOne(
      { _id: doc._id, direction: "outbound", status: { $in: ["queued", "sent"] } },
      { $set: { status: "delivered" }, $unset: { deliveryError: "" } }
    );
    if (r.modifiedCount && userId) {
      try {
        emitSmsOutboundLifecycle(userId, "delivered", {
          mongoId,
          to: doc.to,
          messageId: String(messageId),
        });
        emitSmsUpdated(userId, doc._id, "outbound");
      } catch {
        /* ignore */
      }
      emitAdminLiveSms({
        eventType: "delivered",
        userId,
        messageId: String(messageId),
        destination: doc.to,
        from: null,
        status: "delivered",
        bodyPreview: null,
      }).catch(() => {});
    }
    return { handled: true };
  }

  if (eventType === "message.failed") {
    const { code, reason } = extractDeliveryFailure(payload);
    const r = await SMS.updateOne(
      { _id: doc._id, direction: "outbound", status: { $in: ["queued", "sent"] } },
      {
        $set: {
          status: "failed",
          deliveryError: { code: code || null, reason: reason || "Delivery failed" },
        },
      }
    );
    if (r.modifiedCount) {
      console.error("[SMS DELIVERY FAILED]", {
        to: doc.to,
        error: { code, reason },
        status: "failed",
        telnyxMessageId: messageId,
      });
      if (userId) {
        try {
          emitSmsOutboundLifecycle(userId, "failed", {
            mongoId,
            to: doc.to,
            error: reason,
            deliveryCode: code || undefined,
          });
          emitSmsUpdated(userId, doc._id, "outbound");
        } catch {
          /* ignore */
        }
      }
      emitAdminLiveSms({
        eventType: "delivery_failed",
        userId,
        messageId: String(messageId),
        destination: doc.to,
        from: null,
        status: "failed",
        bodyPreview: reason,
      }).catch(() => {});
    }
    return { handled: true };
  }

  return { handled: true };
}
