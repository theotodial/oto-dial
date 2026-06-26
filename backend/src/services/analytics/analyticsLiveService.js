/**
 * analyticsLiveService
 *
 * Legacy live counter API — delegates to liveIntelligenceService for the
 * enterprise live operations center while preserving backward compatibility.
 */
import {
  configureLiveIntelligence,
  getLegacySnapshot,
  upsertLiveSession,
  recordLiveCallIntel,
  recordLiveSmsIntel,
  recordLivePurchaseIntel,
  getIntelligenceSnapshot,
  getVisitorIntelligence
} from "./liveIntelligenceService.js";

export function configureAnalyticsLive(io) {
  configureLiveIntelligence(io);
}

export function getLiveSnapshot() {
  return getLegacySnapshot();
}

export function recordLiveHit({ kind, visitorId, value = 0, label = null, country = null } = {}) {
  if (kind === "pageview") {
    // Pageviews are tracked via upsertLiveSession from ingestion.
    return;
  }
  if (kind === "signup") {
    recordLivePurchaseIntel({ kind: "signup", visitorId, country, label });
    return;
  }
  if (kind === "subscription") {
    recordLivePurchaseIntel({ kind: "subscription", visitorId, value, country, label });
    return;
  }
  if (kind === "purchase") {
    recordLivePurchaseIntel({ kind: "purchase", visitorId, value, country, label });
    return;
  }
  if (kind === "error") {
    recordLivePurchaseIntel({ kind: "error", visitorId, label, country });
  }
}

export function recordLiveCall(payload = {}) {
  recordLiveCallIntel(payload);
}

export function recordLiveSms(payload = {}) {
  recordLiveSmsIntel(payload);
}

export {
  upsertLiveSession,
  getIntelligenceSnapshot,
  getVisitorIntelligence,
  recordLiveCallIntel,
  recordLiveSmsIntel
};

export default {
  configureAnalyticsLive,
  getLiveSnapshot,
  recordLiveHit,
  recordLiveCall,
  recordLiveSms,
  upsertLiveSession,
  getIntelligenceSnapshot,
  getVisitorIntelligence
};
