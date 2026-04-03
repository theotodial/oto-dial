import jwt from "jsonwebtoken";
import Affiliate from "../models/Affiliate.js";

export default async function authenticateAffiliate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.affiliateId) {
      return res.status(401).json({ success: false, error: "Invalid affiliate token" });
    }

    const affiliate = await Affiliate.findById(decoded.affiliateId);
    if (!affiliate) {
      return res.status(401).json({ success: false, error: "Affiliate not found" });
    }

    if (affiliate.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: "Affiliate account is not approved"
      });
    }

    req.affiliate = affiliate;
    req.affiliateId = affiliate._id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
}
