/**
 * Country lock middleware
 * Validates that outbound calls/SMS are within the same country as the user's phone number
 */

import PhoneNumber from "../models/PhoneNumber.js";
import { validateCountryLock } from "../utils/countryUtils.js";

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
      // Get destination number from request
      const destinationNumber = req.body.to || req.body.phoneNumber || req.body.toNumber;
      
      if (!destinationNumber) {
        return res.status(400).json({ 
          error: "Destination number required" 
        });
      }

      // Validate country lock
      const validation = validateCountryLock(
        userPhoneNumber.countryCode,
        destinationNumber
      );

      if (!validation.valid) {
        console.log(`🚫 COUNTRY LOCK: Blocked call from ${userPhoneNumber.countryCode} to ${destinationNumber}: ${validation.error}`);
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
    // Don't block on error - allow the call to proceed (fail open for safety)
    // But log the error for investigation
    next();
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
      
      if (!destinationNumber) {
        return res.status(400).json({ 
          error: "Destination number required" 
        });
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
