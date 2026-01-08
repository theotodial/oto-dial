import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authenticateUser = async (req, res, next) => {
  console.log("---- AUTH MIDDLEWARE HIT ----");
  console.log("Authorization header:", req.headers.authorization);

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ TOKEN DECODED:", decoded);

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
    console.log("❌ TOKEN VERIFY FAILED:", err.message);
    return res.status(401).json({ error: "Unauthorized" });
  }
};

export default authenticateUser;
