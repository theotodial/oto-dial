import { loadUserSubscription } from "../services/subscriptionService.js";

export default async function loadSubscription(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      req.subscription = null;
      return next();
    }

    req.subscription = await loadUserSubscription(req.user._id);
    next();
  } catch (err) {
    console.error("loadSubscription error:", err);
    req.subscription = null;
    next();
  }
}


