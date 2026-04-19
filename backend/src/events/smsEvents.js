import { EventEmitter } from "events";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import { getCanonicalUsage } from "../services/usage/getCanonicalUsage.js";

/** Internal hook for tests or workers (optional). */
export const smsEventBus = new EventEmitter();

let ioRef = null;

export function registerUserSmsNamespace(io) {
  ioRef = io;
  const nsp = io.of("/user");

  nsp.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("_id status").lean();

      if (!user || user.status !== "active") {
        return next(new Error("Unauthorized"));
      }

      socket.userId = String(user._id);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", (socket) => {
    socket.join(`user:${socket.userId}`);
  });
}

function userNamespace() {
  return ioRef?.of("/user");
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {import("mongoose").Types.ObjectId|string|null} messageId
 */
export async function emitSmsUsageUpdated(userId, messageId) {
  if (!userId) return;

  const nsp = userNamespace();
  if (!nsp) return;

  const sub = await Subscription.findOne({ userId }).sort({ createdAt: -1 }).lean();
  const canonical = await getCanonicalUsage(userId, sub);
  if (!canonical) return;

  const payload = {
    userId: String(userId),
    newSmsUsed: canonical.smsUsed,
    newRemainingSms: canonical.smsRemaining,
    messageId: messageId ? String(messageId) : null,
  };

  nsp.to(`user:${String(userId)}`).emit("sms:usage-updated", payload);
  smsEventBus.emit("sms:usage-updated", payload);
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {import("mongoose").Types.ObjectId|string|null} messageId
 * @param {"inbound"|"outbound"} direction
 */
export function emitSmsCreated(userId, messageId, direction) {
  if (!userId || !messageId) return;
  const nsp = userNamespace();
  if (!nsp) return;
  const payload = {
    userId: String(userId),
    messageId: String(messageId),
    direction,
  };
  nsp.to(`user:${String(userId)}`).emit("sms:created", payload);
  smsEventBus.emit("sms:created", payload);
}

/**
 * @param {import("mongoose").Types.ObjectId|string} userId
 * @param {import("mongoose").Types.ObjectId|string|null} messageId
 * @param {"inbound"|"outbound"} direction
 */
export function emitSmsUpdated(userId, messageId, direction) {
  if (!userId || !messageId) return;
  const nsp = userNamespace();
  if (!nsp) return;
  const payload = {
    userId: String(userId),
    messageId: String(messageId),
    direction,
  };
  nsp.to(`user:${String(userId)}`).emit("sms:updated", payload);
  smsEventBus.emit("sms:updated", payload);
}

/**
 * Outbound lifecycle for UI: queued → sent | failed
 * @param {"queued"|"sent"|"failed"} phase
 * @param {{ mongoId?: string, messageId?: string, error?: string }} detail
 */
export function emitSmsOutboundLifecycle(userId, phase, detail = {}) {
  if (!userId) return;
  const nsp = userNamespace();
  if (!nsp) return;
  const event =
    phase === "queued" ? "sms:queued" : phase === "sent" ? "sms:sent" : "sms:failed";
  const payload = {
    userId: String(userId),
    ...detail,
  };
  nsp.to(`user:${String(userId)}`).emit(event, payload);
  smsEventBus.emit(event, payload);
}
