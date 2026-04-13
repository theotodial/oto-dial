import { featuresMatchMiddleware } from "../utils/userFeatures.js";

export function requireVoiceEnabled(req, res, next) {
  if (!featuresMatchMiddleware(req.user, "voice")) {
    return res.status(403).json({
      error: "Voice is not enabled for this account",
      code: "VOICE_DISABLED",
    });
  }
  return next();
}

export function requireCampaignEnabled(req, res, next) {
  if (!featuresMatchMiddleware(req.user, "campaign")) {
    return res.status(403).json({
      error: "Campaign is not enabled for this account",
      code: "CAMPAIGN_DISABLED",
    });
  }
  return next();
}
