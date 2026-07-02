/**
 * Central GA4 configuration status — Measurement Protocol + Data API + client tracking.
 */
import {
  isMeasurementProtocolConfigured,
  getGa4MpStats,
  getMpConfigDetails
} from "./gaMeasurementProtocolService.js";
import { getGoogleAnalyticsConfigStatus } from "../googleAnalyticsService.js";

export function getGa4MeasurementId() {
  return (
    process.env.GA4_MEASUREMENT_ID ||
    process.env.GA_MEASUREMENT_ID ||
    "G-X3WN8RYCQ5"
  );
}

export function getGa4ConfigSummary() {
  const measurementId = getGa4MeasurementId();
  const mpConfigured = isMeasurementProtocolConfigured();
  const dataApi = getGoogleAnalyticsConfigStatus();
  const dataApiConfigured = dataApi.configured === true;
  const configured = mpConfigured || dataApiConfigured;

  const missing = [];
  const mpDetails = getMpConfigDetails();
  if (!mpConfigured) {
    if (!mpDetails.apiSecretPresent) {
      missing.push("GA4_MP_API_SECRET");
    } else if (mpDetails.apiSecretInvalid) {
      missing.push("GA4_MP_API_SECRET (invalid — use MP API secret, not G- measurement ID)");
    }
  }
  if (!dataApiConfigured && dataApi.reason) {
    missing.push(dataApi.reason);
  }

  return {
    measurementId,
    enabled: String(process.env.GA4_ENABLED || "true").toLowerCase() !== "false",
    debug: String(process.env.GA4_DEBUG || "false").toLowerCase() === "true",
    configured,
    status: configured ? "configured" : "not_configured",
    mpConfigured,
    dataApiConfigured,
    measurementProtocol: {
      ...getGa4MpStats(),
      configured: mpConfigured,
      details: mpDetails
    },
    dataApi,
    clientTrackingAvailable: Boolean(measurementId),
    missing
  };
}

export function logGa4ConfigAtStartup() {
  const summary = getGa4ConfigSummary();
  const mp = summary.mpConfigured ? "yes" : "no";
  const api = summary.dataApiConfigured ? "yes" : "no";

  if (summary.configured) {
    console.log(`✅ GA4 configured (Measurement Protocol: ${mp}, Data API: ${api})`);
    return;
  }

  console.warn(`⚠️ GA4 not configured on this host (Measurement Protocol: ${mp}, Data API: ${api})`);
  if (summary.missing.length) {
    console.warn("   Missing:", summary.missing.join("; "));
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "   Set GA4_MP_API_SECRET and GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON (or BASE64) on Render."
    );
  }
}

export default { getGa4MeasurementId, getGa4ConfigSummary, logGa4ConfigAtStartup };
