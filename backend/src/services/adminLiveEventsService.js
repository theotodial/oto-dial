import jwt from "jsonwebtoken";
import User from "../models/User.js";

const ADMIN_ROOM = "admins";
const MAX_EVENTS = 50;
const actorCache = new Map();
const recentEvents = {
  calls: [],
  sms: [],
};

let ioInstance = null;

function pushEvent(kind, payload) {
  const bucket = kind === "sms" ? recentEvents.sms : recentEvents.calls;
  bucket.unshift(payload);
  if (bucket.length > MAX_EVENTS) {
    bucket.length = MAX_EVENTS;
  }
}

async function getActor(userId) {
  const key = String(userId || "");
  if (!key) {
    return {
      userId: null,
      email: "Unknown user",
      name: "Unknown user",
    };
  }

  const cached = actorCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const user = await User.findById(userId)
    .select("_id email name firstName lastName")
    .lean();

  const value = {
    userId: key,
    email: user?.email || "Unknown user",
    name:
      user?.name ||
      `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
      user?.email ||
      "Unknown user",
  };

  actorCache.set(key, {
    value,
    expiresAt: Date.now() + 30_000,
  });

  return value;
}

export function configureAdminLiveEvents(io) {
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .select("_id email role status adminRoles")
        .lean();

      if (!user || user.role !== "admin" || user.status !== "active") {
        return next(new Error("Unauthorized"));
      }

      socket.adminUser = user;
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(ADMIN_ROOM);
    socket.emit("admin:live_snapshot", {
      calls: recentEvents.calls,
      sms: recentEvents.sms,
    });
  });
}

export async function emitAdminLiveCall(event = {}) {
  const actor = await getActor(event.userId);
  const payload = {
    kind: "call",
    eventType: event.eventType || "updated",
    at: new Date().toISOString(),
    actor,
    callId: event.callId ? String(event.callId) : null,
    destination: event.destination || null,
    from: event.from || null,
    direction: event.direction || "outbound",
    status: event.status || null,
    durationSeconds: Number(event.durationSeconds || 0),
  };

  pushEvent("calls", payload);
  ioInstance?.to(ADMIN_ROOM).emit("admin:live_calls", payload);
}

export async function emitAdminLiveSms(event = {}) {
  const actor = await getActor(event.userId);
  const payload = {
    kind: "sms",
    eventType: event.eventType || "sent",
    at: new Date().toISOString(),
    actor,
    messageId: event.messageId ? String(event.messageId) : null,
    destination: event.destination || null,
    from: event.from || null,
    status: event.status || null,
    bodyPreview: String(event.bodyPreview || "").slice(0, 120),
  };

  pushEvent("sms", payload);
  ioInstance?.to(ADMIN_ROOM).emit("admin:live_sms", payload);
}
