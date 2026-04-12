import jwt from "jsonwebtoken";
import User from "../models/User.js";
import {
  cacheKeys,
  getCachedJson,
  setCachedJson,
} from "../services/cache.service.js";

const USER_CACHE_TTL_SECONDS = 300;
const USER_SELECT =
  "-password -sessions -__v";

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
  const authHeader = req.headers.authorization;

  // Fail fast if no auth header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    const user = await getCachedUserById(req.userId);

    if (!user) {
      console.warn("[auth] User not found for token userId:", String(req.userId));
      return res.status(401).json({ error: "User not found" });
    }

    if (user.status !== "active") {
      console.warn("[auth] User blocked by status check:", {
        userId: String(req.userId),
        status: user.status ?? null,
      });
      return res.status(403).json({
        error: "User is suspended or banned"
      });
    }

    console.log("[auth] AUTH USER:", {
      userId: String(req.userId),
      userStatus: user.status,
      email: user.email,
    });
    req.user = user;

    next();
  } catch (err) {
    // Only log actual errors, not expired tokens (common case)
    if (err.name !== 'TokenExpiredError' && err.name !== 'JsonWebTokenError') {
      console.error("Auth middleware error:", err.message);
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export default authenticateUser;
