/**
 * Country lock middleware
 * Validates that outbound calls/SMS are within the same country as the user's phone number
 */

import PhoneNumber from "../models/PhoneNumber.js";
import Call from "../models/Call.js";
import { validateCountryLock } from "../utils/countryUtils.js";

const SMS_SHORT_CODE_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "HELP",
  "START",
  "UNSTOP"
]);

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isLikelyShortCode(value) {
  return /^\d{3,8}$/.test(normalizeDigits(value));
}

/**
 * Middleware to validate country lock for outbound calls
 */
export async function validateCallCountryLock(req, res, next) {
  try {
    // Get user's active phone number
    const userPhoneNumber = await PhoneNumber.findOne({
      userId: req.userId || req.user?._id,
      status: "active"
    });

    if (!userPhoneNumber) {
      return res.status(400).json({ 
        error: "No active phone number found. Please purchase a number first." 
      });
    }

    // Check if country lock is enabled
    if (userPhoneNumber.lockedCountry !== false && userPhoneNumber.countryCode) {
      // Body (dialer/SMS) or Call row when `req.params.id` is a call id
      let destinationNumber =
        req.body.to || req.body.phoneNumber || req.body.toNumber;

      if (!destinationNumber && req.params?.id && req.userId) {
        try {
          const callDoc = await Call.findOne({
            _id: req.params.id,
            user: req.userId,
          })
            .select("phoneNumber")
            .lean();
          destinationNumber = callDoc?.phoneNumber || null;
          if (destinationNumber) {
            console.log("[COUNTRY CHECK] Resolved destination from Call row", {
              callId: String(req.params.id),
              destinationNumber,
            });
          }
        } catch (lookupErr) {
          console.error("[COUNTRY CHECK] Failed to load call for destination:", lookupErr);
        }
      }

      if (!destinationNumber) {
        console.warn("[COUNTRY CHECK] BLOCKED — no destination (body empty and no call row?)", {
          route: req.originalUrl,
          callId: req.params?.id || null,
        });
        return res.status(400).json({
          success: false,
          error: "Destination number required",
        });
      }

      console.log("[COUNTRY CHECK]", {
        fromCountry: userPhoneNumber.countryCode,
        toNumber: destinationNumber,
      });

      const validation = validateCountryLock(
        userPhoneNumber.countryCode,
        destinationNumber
      );

      if (!validation.valid) {
        console.warn(
          `[COUNTRY CHECK] BLOCKED — ${userPhoneNumber.countryCode} → ${destinationNumber}: ${validation.error}`
        );
        return res.status(403).json({
          success: false,
          error: validation.error,
          countryLocked: true,
          sourceCountry: userPhoneNumber.countryCode,
        });
      }

      console.log("[COUNTRY CHECK] PASSED", {
        fromCountry: userPhoneNumber.countryCode,
        toNumber: destinationNumber,
      });

      req.sourceCountryCode = userPhoneNumber.countryCode;
      req.userPhoneNumber = userPhoneNumber;
    }

    next();
  } catch (err) {
    console.error("[COUNTRY CHECK] Middleware error (failing closed):", err);
    return res.status(500).json({
      success: false,
      error: "Country validation could not be completed. Try again or contact support.",
    });
  }
}

/**
 * Middleware to validate country lock for outbound SMS
 */
export async function validateSMSCountryLock(req, res, next) {
  try {
    // Get user's active phone number
    const userPhoneNumber = await PhoneNumber.findOne({
      userId: req.userId || req.user?._id,
      status: "active"
    });

    if (!userPhoneNumber) {
      return res.status(400).json({ 
        error: "No active phone number found. Please purchase a number first." 
      });
    }

    // Check if country lock is enabled
    if (userPhoneNumber.lockedCountry !== false && userPhoneNumber.countryCode) {
      // Get destination number from request
      const destinationNumber = req.body.to;
      const normalizedText = String(req.body?.text || "").trim().toUpperCase();
      
      if (!destinationNumber) {
        return res.status(400).json({ 
          error: "Destination number required" 
        });
      }

      if (
        isLikelyShortCode(destinationNumber) &&
        SMS_SHORT_CODE_KEYWORDS.has(normalizedText)
      ) {
        req.sourceCountryCode = userPhoneNumber.countryCode;
        req.userPhoneNumber = userPhoneNumber;
        return next();
      }

      // Validate country lock
      const validation = validateCountryLock(
        userPhoneNumber.countryCode,
        destinationNumber
      );

      if (!validation.valid) {
        console.log(`🚫 COUNTRY LOCK: Blocked SMS from ${userPhoneNumber.countryCode} to ${destinationNumber}: ${validation.error}`);
        return res.status(403).json({ 
          error: validation.error,
          countryLocked: true,
          sourceCountry: userPhoneNumber.countryCode
        });
      }

      // Store country info in request for logging
      req.sourceCountryCode = userPhoneNumber.countryCode;
      req.userPhoneNumber = userPhoneNumber;
    }

    next();
  } catch (err) {
    console.error("Country lock validation error:", err);
    // Don't block on error - allow the SMS to proceed (fail open for safety)
    // But log the error for investigation
    next();
  }
}
