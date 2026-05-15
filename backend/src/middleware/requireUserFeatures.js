import { featuresMatchMiddleware } from "../utils/userFeatures.js";
import {
  isCallsApiRequest,
  logMiddlewareBlock,
  logMiddlewareEnter,
  logMiddlewarePass,
} from "../utils/callsApiMiddlewareAudit.js";

export function requireVoiceEnabled(req, res, next) {
  if (isCallsApiRequest(req)) {
    logMiddlewareEnter("requireVoiceEnabled", req);
  }
  if (req.user?.mode === "campaign") {
    console.warn("[EXEC TRACE BACKEND] requireVoiceEnabled BLOCK", {
      path: req.originalUrl || req.url,
      code: "CALLING_DISABLED_FOR_PLAN",
      userId: req.userId ? String(req.userId) : null,
    });
    const body = {
      error: "CALLING_DISABLED_FOR_PLAN",
      code: "CALLING_DISABLED_FOR_PLAN",
    };
    logMiddlewareBlock("requireVoiceEnabled", req, {
      status: 403,
      reason: "CALLING_DISABLED_FOR_PLAN",
      body,
    });
    return res.status(403).json(body);
  }
  if (req.subscription?.voiceCallsEnabled === false) {
    console.warn("[EXEC TRACE BACKEND] requireVoiceEnabled BLOCK", {
      path: req.originalUrl || req.url,
      code: "VOICE_PLAN_BLOCKED",
      userId: req.userId ? String(req.userId) : null,
    });
    const body = {
      error: "Voice is not included on your current plan",
      code: "VOICE_PLAN_BLOCKED",
    };
    logMiddlewareBlock("requireVoiceEnabled", req, {
      status: 403,
      reason: "VOICE_PLAN_BLOCKED",
      body,
    });
    return res.status(403).json(body);
  }
  if (!featuresMatchMiddleware(req.user, "voice")) {
    console.warn("[EXEC TRACE BACKEND] requireVoiceEnabled BLOCK", {
      path: req.originalUrl || req.url,
      code: "VOICE_DISABLED",
      userId: req.userId ? String(req.userId) : null,
    });
    const body = {
      error: "Voice is not enabled for this account",
      code: "VOICE_DISABLED",
    };
    logMiddlewareBlock("requireVoiceEnabled", req, {
      status: 403,
      reason: "VOICE_DISABLED",
      body,
    });
    return res.status(403).json(body);
  }
  logMiddlewarePass("requireVoiceEnabled", req);
  return next();
}

export function checkPlanAccess(feature) {
  return (req, res, next) => {
    if (!feature) return next();
    const featureKey = String(feature).trim();
    if (!featureKey) return next();
    if (featureKey === "smsCampaignEnabled") {
      if (!featuresMatchMiddleware(req.user, "campaign")) {
        return res.status(403).json({
          error: "FEATURE_NOT_AVAILABLE",
          code: "FEATURE_NOT_AVAILABLE",
        });
      }
      return next();
    }
    if (featureKey === "voiceEnabled") {
      if (req.user?.mode === "campaign") {
        return res.status(403).json({
          error: "CALLING_DISABLED_FOR_PLAN",
          code: "CALLING_DISABLED_FOR_PLAN",
        });
      }
      if (!featuresMatchMiddleware(req.user, "voice")) {
        return res.status(403).json({
          error: "FEATURE_NOT_AVAILABLE",
          code: "FEATURE_NOT_AVAILABLE",
        });
      }
    }
    return next();
  };
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
