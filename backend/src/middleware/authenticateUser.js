import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  cacheKeys,
  getCachedJson,
  setCachedJson,
} from "../services/cache.service.js";
import {
  isCallsApiRequest,
  logMiddlewareBlock,
  logMiddlewareEnter,
  logMiddlewarePass,
} from "../utils/callsApiMiddlewareAudit.js";

const USER_CACHE_TTL_SECONDS = 300;
const USER_SELECT =
  "-password -sessions -__v -subscriptionActive -currentSubscriptionLimits -minutesUsed -smsUsed -plan";

async function fetchFreshUserById(userId) {
  const user = await User.findById(userId)
    .select(USER_SELECT)
    .maxTimeMS(200)
    .lean();
  if (user) {
    await setCachedJson(cacheKeys.userProfile(userId), user, USER_CACHE_TTL_SECONDS);
  }
  return user;
}

async function getCachedUserById(userId) {
  const key = cacheKeys.userProfile(userId);
  const cached = await getCachedJson(key);
  if (cached) {
    if (cached.status) {
      return cached;
    }
    console.warn("[auth] Cached user missing status, reloading from DB:", String(userId));
  }

  return fetchFreshUserById(userId);
}

const authenticateUser = async (req, res, next) => {
  if (isCallsApiRequest(req)) {
    logMiddlewareEnter("authenticateUser", req);
  }

  const authHeader = req.headers.authorization;

  // Fail fast if no auth header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const body = { error: "Unauthorized" };
    logMiddlewareBlock("authenticateUser", req, {
      status: 401,
      reason: "missing_or_invalid_authorization_header",
      body,
    });
    return res.status(401).json(body);
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    const user = await getCachedUserById(req.userId);

    if (!user) {
      console.warn("[auth] User not found for token userId:", String(req.userId));
      const body = { error: "User not found" };
      logMiddlewareBlock("authenticateUser", req, {
        status: 401,
        reason: "user_not_found_for_token",
        body,
      });
      return res.status(401).json(body);
    }

    if (user.status !== "active") {
      console.warn("[auth] User blocked by status check:", {
        userId: String(req.userId),
        status: user.status ?? null,
      });
      const body = { error: "User is suspended or banned" };
      logMiddlewareBlock("authenticateUser", req, {
        status: 403,
        reason: `user_status_${String(user.status || "unknown")}`,
        body,
      });
      return res.status(403).json(body);
    }

    console.log("[auth] AUTH USER:", {
      userId: String(req.userId),
      userStatus: user.status,
      email: user.email,
    });
    req.user = user;

    logMiddlewarePass("authenticateUser", req);
    next();
  } catch (err) {
    // Only log actual errors, not expired tokens (common case)
    if (err.name !== 'TokenExpiredError' && err.name !== 'JsonWebTokenError') {
      console.error("Auth middleware error:", err.message);
    }
    const body = { error: "Unauthorized" };
    logMiddlewareBlock("authenticateUser", req, {
      status: 401,
      reason: err?.name === "TokenExpiredError" ? "token_expired" : err?.name === "JsonWebTokenError" ? "token_invalid" : "jwt_verify_failed",
      body,
    });
    return res.status(401).json(body);
  }
};

export default authenticateUser;
