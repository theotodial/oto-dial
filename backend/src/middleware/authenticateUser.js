import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authenticateUser = async (req, res, next) => {
  // OPTIMIZED: Removed excessive logging for performance
  const authHeader = req.headers.authorization;

  // Fail fast if no auth header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Only log errors, not successful auths

    // 1️⃣ Attach userId to request
    req.userId = decoded.userId;

    // 2️⃣ Load user from DB
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        error: "User is suspended or banned"
      });
    }

    // 3️⃣ Attach user object (VERY useful later)
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
