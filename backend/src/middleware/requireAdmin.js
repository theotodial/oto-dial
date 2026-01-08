import User from "../models/User.js";

const requireAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "User is not active" });
    }

    next();
  } catch (err) {
    return res.status(500).json({ error: "Admin check failed" });
  }
};

export default requireAdmin;

  