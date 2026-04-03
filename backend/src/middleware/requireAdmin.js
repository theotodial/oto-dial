import User from "../models/User.js";
import { evaluateAdminAccessForPath } from "../constants/adminAccess.js";

const requireAdmin = async (req, res, next) => {
  try {
    const user = req.user?._id
      ? req.user
      : await User.findById(req.userId);

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "User is not active" });
    }

    const accessResult = evaluateAdminAccessForPath(user, req.originalUrl);
    if (!accessResult.allowed) {
      return res.status(403).json({
        error: "You do not have access to this admin section",
        requiredRoles: accessResult.requiredRoles,
        adminRoles: accessResult.grantedRoles
      });
    }

    req.user = user;
    req.adminRoles = accessResult.grantedRoles;
    next();
  } catch (err) {
    return res.status(500).json({ error: "Admin check failed" });
  }
};

export default requireAdmin;

  