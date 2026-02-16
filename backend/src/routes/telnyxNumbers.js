import express from "express";
import authenticateUser from "../middleware/authenticateUser.js";
import loadSubscription from "../middleware/loadSubscription.js";
import getTelnyxClient from "../services/telnyxService.js";
import PhoneNumber from "../models/PhoneNumber.js";
import User from "../models/User.js";
import { isCountrySupported, getCountryByCode, getSupportedCountries } from "../utils/countryUtils.js";

const router = express.Router();
const MAX_MONTHLY_NUMBER_COST = Number(process.env.TELNYX_MAX_MONTHLY_NUMBER_COST || 3.0);
const MAX_MESSAGING_RATE = Number(process.env.TELNYX_MAX_MESSAGING_RATE || 0.02);
const MAX_MONTHLY_NUMBER_COST_NON_US = Number(
  process.env.TELNYX_MAX_MONTHLY_NUMBER_COST_NON_US || 50.0
);
const MAX_MESSAGING_RATE_NON_US = Number(
  process.env.TELNYX_MAX_MESSAGING_RATE_NON_US || 1.0
);

function getNumberCostLimits(countryCode = "US") {
  const normalized = String(countryCode || "US").toUpperCase();
  if (normalized === "US") {
    return {
      monthlyLimit: MAX_MONTHLY_NUMBER_COST,
      messagingLimit: MAX_MESSAGING_RATE
    };
  }
  return {
    monthlyLimit: MAX_MONTHLY_NUMBER_COST_NON_US,
    messagingLimit: MAX_MESSAGING_RATE_NON_US
  };
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function resolveSupportedCountryCode(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  const byCode = getCountryByCode(normalized);
  if (byCode?.code) {
    return byCode.code;
  }
  const byName = getSupportedCountries().find(
    (country) => String(country.name || "").toLowerCase() === normalized.toLowerCase()
  );
  return byName?.code || null;
}

function matchesRequestedCountry(numberData, requestedCountryCode) {
  const requested = resolveSupportedCountryCode(requestedCountryCode);
  if (!requested) return true;

  const rawSignals = [
    numberData?.country_code,
    numberData?.country,
    numberData?.region_information?.country_code,
    numberData?.region_information?.country,
    numberData?.region_information?.country_name,
    numberData?.region_information?.country_iso
  ].filter(Boolean);

  const resolvedSignals = rawSignals
    .map((signal) => resolveSupportedCountryCode(signal))
    .filter(Boolean);

  // If Telnyx does not provide explicit country metadata, trust the country filter.
  if (!resolvedSignals.length) return true;
  return resolvedSignals.includes(requested);
}

function dedupeNumbersByPhone(rawNumbers = []) {
  const map = new Map();
  for (const row of rawNumbers || []) {
    const key = row?.phone_number;
    if (!key || map.has(key)) continue;
    map.set(key, row);
  }
  return Array.from(map.values());
}

async function listAvailableNumbersSafe(telnyx, { filter, size = 200 }) {
  try {
    const response = await telnyx.availablePhoneNumbers.list({
      filter,
      page: { size }
    });
    return response?.data || [];
  } catch (err) {
    console.warn("Available number lookup failed:", err.message);
    return [];
  }
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function hasRegulatoryRequirementSignals(numberData = {}) {
  const requirementFields = [
    numberData.requirement_group_id,
    numberData.requirements,
    numberData.regulatory_requirements,
    numberData.regulatory_requirement,
    numberData.requirement_types,
    numberData.regulatory_bundle_requirements,
    numberData.compliance_requirements,
    numberData.number_requirements
  ];

  if (requirementFields.some(hasMeaningfulValue)) {
    return true;
  }

  const nestedRequirementFields = [
    numberData.region_information?.requirements,
    numberData.region_information?.regulatory_requirements,
    numberData.region_information?.regulatory_requirement
  ];

  return nestedRequirementFields.some(hasMeaningfulValue);
}

function isInstantPurchasableNumber(numberData = {}) {
  // Prefer safe filtering: hide numbers with known fulfillment/regulatory flags
  // that commonly fail at checkout for self-serve purchases.
  if (numberData.quickship === false) return false;
  if (numberData.reservable === false) return false;
  if (hasRegulatoryRequirementSignals(numberData)) return false;
  return true;
}

function isAllowedNumberType(numberType, countryCode = "US") {
  if (!numberType) return true;
  const normalizedType = String(numberType).toLowerCase();
  const normalizedCountry = String(countryCode || "US").toUpperCase();

  const commonAllowed = new Set(["local", "geographic"]);
  if (normalizedCountry === "US") {
    return commonAllowed.has(normalizedType);
  }

  // International inventories may classify equivalent local inventory
  // as mobile/national/fixed line.
  const internationalAllowed = new Set([
    ...commonAllowed,
    "mobile",
    "national",
    "fixed_line",
    "fixed line",
    "fixedline"
  ]);
  return internationalAllowed.has(normalizedType);
}

function extractTelnyxErrorMessage(err) {
  if (!err) return "Unknown Telnyx error";
  return (
    err?.raw?.errors?.[0]?.detail ||
    err?.raw?.errors?.[0]?.title ||
    err?.response?.data?.errors?.[0]?.detail ||
    err?.response?.data?.error ||
    err?.message ||
    "Unknown Telnyx error"
  );
}

function resolveOrderedNumberId(orderData, fallbackNumber) {
  const nestedNumber =
    orderData?.phone_numbers?.[0]?.id ||
    orderData?.phone_numbers?.[0]?.phone_number_id ||
    orderData?.phone_numbers?.[0]?.phone_number ||
    orderData?.data?.phone_numbers?.[0]?.id ||
    orderData?.data?.phone_numbers?.[0]?.phone_number_id ||
    orderData?.data?.phone_numbers?.[0]?.phone_number;

  return nestedNumber || orderData?.id || fallbackNumber;
}

function buildOrderPhoneNumberPayload(phoneNumber, options = {}) {
  const payload = { phone_number: phoneNumber };
  if (options.connectionId) {
    payload.connection_id = options.connectionId;
  }
  if (options.messagingProfileId) {
    payload.messaging_profile_id = options.messagingProfileId;
  }
  if (options.requirementGroupId) {
    payload.requirement_group_id = options.requirementGroupId;
  }
  return payload;
}

async function createNumberOrderWithFallback(telnyx, phoneNumber, options = {}) {
  const enrichedPayload = buildOrderPhoneNumberPayload(phoneNumber, options);
  const attempts = [
    { phone_numbers: [enrichedPayload] },
    { phone_numbers: [{ phone_number: phoneNumber }] },
    { phone_numbers: [phoneNumber] }
  ];

  let lastError = null;
  for (const payload of attempts) {
    try {
      return await telnyx.numberOrders.create(payload);
    } catch (err) {
      lastError = err;
      console.warn("Number order attempt failed:", extractTelnyxErrorMessage(err));
    }
  }

  throw lastError || new Error("Failed to create Telnyx number order");
}

async function lookupNumberCandidateForPurchase({
  telnyx,
  countryCode,
  phoneNumber,
  maxPages = 8,
  pageSize = 250
}) {
  const requestedDigits = normalizeDigits(phoneNumber);
  if (!requestedDigits) return null;

  const exactAttempts = [
    { country_code: countryCode, phone_number: phoneNumber },
    { phone_number: phoneNumber }
  ];

  for (const filter of exactAttempts) {
    const exactRows = await listAvailableNumbersSafe(telnyx, { filter, size: 50 });
    const exactMatch = exactRows.find(
      (item) => normalizeDigits(item?.phone_number) === requestedDigits
    );
    if (exactMatch) return exactMatch;
  }

  // Fallback: paginate country inventory and match locally.
  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const response = await telnyx.availablePhoneNumbers.list({
        filter: { country_code: countryCode },
        page: { size: pageSize, number: page }
      });
      const rows = response?.data || [];
      const matched = rows.find(
        (item) => normalizeDigits(item?.phone_number) === requestedDigits
      );
      if (matched) return matched;
      if (!rows.length || rows.length < pageSize) {
        break;
      }
    } catch (err) {
      console.warn("Paged number lookup failed:", extractTelnyxErrorMessage(err));
      break;
    }
  }

  return null;
}

function buildWhitelistedDestinations(countryInfo) {
  return Array.from(new Set([countryInfo?.telnyxCode, "US", "CA"].filter(Boolean)));
}

async function ensureUserMessagingProfile({ telnyx, user, countryInfo, webhookUrl }) {
  const destinations = buildWhitelistedDestinations(countryInfo);
  const updatePayload = {};
  if (webhookUrl) {
    updatePayload.webhook_url = webhookUrl;
    updatePayload.webhook_failover_url = webhookUrl;
    updatePayload.webhook_api_version = "2";
  }
  if (destinations.length) {
    updatePayload.whitelisted_destinations = destinations;
  }

  if (user.messagingProfileId) {
    try {
      if (Object.keys(updatePayload).length > 0) {
        await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, updatePayload);
      }
      return user.messagingProfileId;
    } catch (err) {
      const msg = extractTelnyxErrorMessage(err);
      console.warn(`⚠️ Could not update messaging profile ${user.messagingProfileId}: ${msg}`);
      // If profile still exists but update failed (permissions/validation), keep current ID.
      if (!/not found|does not exist|invalid/i.test(msg)) {
        return user.messagingProfileId;
      }
      user.messagingProfileId = null;
      await user.save();
    }
  }

  const baseCreatePayload = {
    name: `user-${user._id}`
  };
  if (webhookUrl) {
    baseCreatePayload.webhook_url = webhookUrl;
    baseCreatePayload.webhook_failover_url = webhookUrl;
    baseCreatePayload.webhook_api_version = "2";
  }

  const createAttempts = [
    {
      ...baseCreatePayload,
      whitelisted_destinations: destinations
    },
    {
      ...baseCreatePayload,
      whitelisted_destinations: ["US", "CA"]
    },
    baseCreatePayload
  ];

  let lastError = null;
  for (const payload of createAttempts) {
    try {
      const profile = await telnyx.messaging.messagingProfiles.create(payload);
      const profileId = profile?.data?.id || null;
      if (profileId) {
        user.messagingProfileId = profileId;
        await user.save();
      }
      return profileId;
    } catch (err) {
      lastError = err;
      console.warn("Messaging profile create attempt failed:", extractTelnyxErrorMessage(err));
    }
  }

  if (lastError) {
    console.warn("⚠️ Could not create messaging profile:", extractTelnyxErrorMessage(lastError));
  }
  return null;
}

async function attachNumberToMessagingProfile({ telnyx, profileId, phoneNumber }) {
  if (!profileId) {
    return {
      attached: false,
      warning: "Messaging profile not configured. Number purchased but SMS profile attach is pending."
    };
  }

  try {
    await telnyx.messaging.messagingProfiles.phoneNumbers.create(profileId, {
      phone_number: phoneNumber
    });
    return { attached: true, warning: null };
  } catch (err) {
    const msg = extractTelnyxErrorMessage(err);
    if (/already|exists|duplicate|associated/i.test(msg)) {
      return { attached: true, warning: null };
    }
    return { attached: false, warning: msg };
  }
}

function normalizePurchaseFailure(err) {
  const raw = extractTelnyxErrorMessage(err);
  const message = raw || "Failed to purchase number";

  if (/regulatory|requirement|bundle|compliance|document/i.test(message)) {
    return {
      status: 409,
      message:
        "This number needs regulatory verification and cannot be instant-purchased. Please choose another available number."
    };
  }
  if (/number limit reached|active subscription required|phone number required|not eligible|not available/i.test(message)) {
    return { status: 400, message };
  }
  if (/already|reserved|inventory|unavailable|taken/i.test(message)) {
    return { status: 409, message };
  }
  if (/insufficient|balance|funds|payment required/i.test(message)) {
    return { status: 402, message };
  }
  if (/forbidden|permission|unauthorized/i.test(message)) {
    return { status: 403, message };
  }

  return { status: 500, message };
}

/**
 * GET /api/numbers/search
 * Search for available numbers with STRICT cost filters
 * Only returns cheapest local numbers (carrier group A or B, no premium features)
 */
router.get(
  "/search",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      // HARD STOP — LIMIT CHECK
      if (req.subscription.numbers.length >= 1) {
        return res.status(400).json({ error: "Number limit reached" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const { areaCode, searchPattern, country } = req.query;
      
      // Validate and get country code (default to US for backward compatibility)
      let countryCode = "US";
      let countryInfo = getCountryByCode("US");
      
      if (country) {
        const requestedCountry = getCountryByCode(country);
        if (!requestedCountry || !isCountrySupported(country)) {
          return res.status(400).json({ 
            error: `Country not supported. Supported countries: ${getSupportedCountries().map(c => c.name).join(", ")}` 
          });
        }
        countryCode = requestedCountry.telnyxCode;
        countryInfo = requestedCountry;
      }
      
      const normalizedCountryCode = String(countryCode).toUpperCase();
      const isUS = normalizedCountryCode === "US";
      const hasUSAreaCode = isUS && areaCode && /^\d{3}$/.test(areaCode);
      const numericSearchPattern = normalizeDigits(searchPattern);
      const { monthlyLimit, messagingLimit } = getNumberCostLimits(countryInfo?.code || "US");

      // Multi-pass strategy:
      // 1) Voice+SMS (strictest)
      // 2) Voice only (common for some international inventories)
      // 3) No feature filter (broad fallback)
      const baseAttemptFilters = [
        { country_code: normalizedCountryCode, features: ["voice", "sms"] },
        { country_code: normalizedCountryCode, features: ["voice"] },
        { country_code: normalizedCountryCode }
      ];

      const pushResults = async (attemptFilter, pageSize = 200) => {
        const rows = await listAvailableNumbersSafe(telnyx, {
          filter: attemptFilter,
          size: pageSize
        });
        return rows;
      };

      let allResults = [];

      if (hasUSAreaCode) {
        for (const attempt of baseAttemptFilters) {
          const rows = await pushResults({ ...attempt, npa: areaCode }, 250);
          if (rows.length) {
            allResults = dedupeNumbersByPhone([...allResults, ...rows]);
          }
        }
      } else if (isUS) {
        // US fallback: popular area-codes first, then broad country search.
        const popularAreaCodes = ["212", "310", "415", "646", "213", "323", "424", "818", "347", "929"];
        for (const npa of popularAreaCodes.slice(0, 6)) {
          for (const attempt of baseAttemptFilters) {
            const rows = await pushResults({ ...attempt, npa }, 40);
            if (rows.length) {
              allResults = dedupeNumbersByPhone([...allResults, ...rows]);
            }
          }
          if (allResults.length >= 120) {
            break;
          }
        }

        if (!allResults.length) {
          for (const attempt of baseAttemptFilters) {
            const rows = await pushResults(attempt, 250);
            if (rows.length) {
              allResults = dedupeNumbersByPhone([...allResults, ...rows]);
            }
          }
        }
      } else {
        // Non-US: always query the selected country directly (no US area-code assumptions).
        for (const attempt of baseAttemptFilters) {
          const rows = await pushResults(attempt, 300);
          if (rows.length) {
            allResults = dedupeNumbersByPhone([...allResults, ...rows]);
          }
        }
      }

      if (!allResults || allResults.length === 0) {
        return res.json({ numbers: [] });
      }

      // RELAXED FILTERING - Allow more numbers but still prioritize cheapest
      // This is the cost control layer but less restrictive
      const filteredNumbers = allResults
        .filter(num => {
          // Must have phone_number
          if (!num.phone_number) {
            return false;
          }

          // Enforce country match with selected country.
          if (!matchesRequestedCountry(num, countryInfo.code)) {
            return false;
          }

          // Hide numbers that are commonly non-instant-buyable
          // (regulatory/manual fulfillment required).
          if (!isInstantPurchasableNumber(num)) {
            return false;
          }

          // No toll-free numbers (check various field names)
          const numberType = num.number_type || num.type || num.region_information?.region_type;
          if (numberType === 'toll-free' || numberType === 'toll_free' || 
              num.toll_free === true || num.is_toll_free === true) {
            return false;
          }

          // Keep number type consistent with country capabilities.
          if (!isAllowedNumberType(numberType, countryInfo.code)) {
            return false;
          }

          // No short codes (must be 10+ digits)
          const cleanNumber = normalizeDigits(num.phone_number);
          // Keep out short-codes while allowing international local numbers.
          if (cleanNumber.length < 7) {
            return false;
          }

          // RELAXED: Only block carrier groups C, D, E, etc. (allow A, B, or unknown)
          const carrierGroup = num.carrier?.group || 
                              num.carrier_group || 
                              num.carrier?.carrier_group ||
                              num.region_information?.carrier_group;
          if (carrierGroup && !['A', 'B', 'a', 'b'].includes(String(carrierGroup).toUpperCase())) {
            // Only block if explicitly C or higher
            const groupUpper = String(carrierGroup).toUpperCase();
            if (['C', 'D', 'E', 'F', 'G', 'H'].includes(groupUpper)) {
              return false;
            }
          }

          // RELAXED: Only block explicit premium features
          const features = num.features || num.capabilities || [];
          if (Array.isArray(features)) {
            // Only block if explicitly premium routing or toll-free
            if (features.some(f => f === 'premium_routing' || f === 'toll_free')) {
              return false;
            }
          }
          if (num.premium === true || num.is_premium === true) {
            return false;
          }

          // Allow up to configured monthly cap.
          const monthlyCost = Number(
            num.monthly_cost ||
              num.monthly_rate ||
              num.cost?.monthly ||
              num.region_information?.monthly_cost ||
              num.pricing?.monthly ||
              0
          );
          if (monthlyCost > monthlyLimit) {
            console.log(`🚫 COST CONTROL: Blocked expensive number ${num.phone_number}: $${monthlyCost.toFixed(2)}/month (limit: $${monthlyLimit.toFixed(2)})`);
            return false;
          }

          // Allow messaging rates up to configured cap.
          const messagingRate = Number(
            num.messaging_rate ||
              num.cost?.messaging ||
              num.pricing?.messaging ||
              num.region_information?.messaging_rate ||
              0
          );
          if (messagingRate > messagingLimit) {
            console.log(`🚫 COST CONTROL: Blocked number with high messaging rate ${num.phone_number}: $${messagingRate.toFixed(4)}/msg (limit: $${messagingLimit.toFixed(4)})`);
            return false;
          }

          // Apply search pattern if provided
          if (numericSearchPattern && !cleanNumber.includes(numericSearchPattern)) {
              return false;
          }

          return true;
        })
        .map(num => ({
          phone_number: num.phone_number,
          monthly_cost: Number(num.monthly_cost || num.monthly_rate || num.cost?.monthly || 0),
          carrier_group: num.carrier?.group || num.carrier_group || 'Unknown',
          number_type: num.number_type || num.type || num.region_information?.region_type || null,
          region_information: num.region_information || null,
          features: num.features || [],
          country: countryInfo.name,
          countryCode: countryInfo.code
        }))
        // Sort by monthly cost (cheapest first)
        .sort((a, b) => a.monthly_cost - b.monthly_cost)
        .slice(0, 50); // Show up to 50 numbers (increased from 20)

      res.json({ 
        success: true,
        numbers: filteredNumbers,
        count: filteredNumbers.length,
        country: countryInfo.name,
        countryCode: countryInfo.code
      });
    } catch (err) {
      console.error("SEARCH NUMBERS ERROR:", err);
      res.status(500).json({ error: "Failed to search numbers", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/purchase
 * Purchase a SPECIFIC number with RE-VALIDATION
 */
router.post(
  "/purchase",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      const phoneNumber = String(req.body?.phoneNumber || "").trim();
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      // RE-VALIDATE NUMBER BEFORE PURCHASE (CRITICAL FOR COST CONTROL)
      // Try to detect country from phone number or use provided country
      let detectedCountryCode = null;
      let countryInfo = null;
      
      // First, try to get country from request body (if provided from frontend)
      if (req.body.countryCode) {
        countryInfo = getCountryByCode(req.body.countryCode);
        if (countryInfo) {
          detectedCountryCode = countryInfo.telnyxCode;
        }
      }
      
      // If not provided, try to detect from number format
      if (!detectedCountryCode) {
        const { detectCountryFromPhoneNumber } = await import("../utils/countryUtils.js");
        const detected = detectCountryFromPhoneNumber(phoneNumber);
        if (detected) {
          countryInfo = getCountryByCode(detected);
          if (countryInfo) {
            detectedCountryCode = countryInfo.telnyxCode;
          }
        }
      }
      
      // Default to US if still not detected (backward compatibility)
      if (!detectedCountryCode) {
        detectedCountryCode = "US";
        countryInfo = getCountryByCode("US");
      }
      
      // Validate country is supported
      if (!countryInfo || !isCountrySupported(countryInfo.code)) {
        return res.status(400).json({ 
          error: `Country ${countryInfo?.name || "Unknown"} is not supported. Supported countries: ${getSupportedCountries().map(c => c.name).join(", ")}` 
        });
      }
      const { monthlyLimit, messagingLimit } = getNumberCostLimits(countryInfo.code);

      let validatedNumber = null;
      let validatedCarrierGroup = null;
      let validatedMonthlyCost = 0;
      let validatedMessagingRate = 0;

      try {
        validatedNumber = await lookupNumberCandidateForPurchase({
          telnyx,
          countryCode: detectedCountryCode,
          phoneNumber,
          maxPages: 10,
          pageSize: 250
        });

        if (!validatedNumber) {
          return res.status(409).json({
            error: "Number is no longer available. Please refresh search and choose another number."
          });
        }

        // If frontend provided selected country, enforce exact country consistency.
        if (req.body.countryCode && !matchesRequestedCountry(validatedNumber, req.body.countryCode)) {
          return res.status(400).json({
            error: "Selected number does not belong to the chosen country. Please refresh search and pick another number."
          });
        }

        if (!isInstantPurchasableNumber(validatedNumber)) {
          return res.status(409).json({
            error: "This number requires manual regulatory setup and cannot be instant-purchased. Please select another number."
          });
        }

        // HARD BLOCK CHECKS - Same logic as search endpoint for consistency
        // Must have phone_number
        if (!validatedNumber.phone_number) {
          return res.status(400).json({ error: "Invalid number data" });
        }

        // No toll-free numbers
        const numberType =
          validatedNumber.number_type ||
          validatedNumber.type ||
          validatedNumber.region_information?.region_type;
        if (numberType === 'toll-free' || numberType === 'toll_free' || 
            validatedNumber.toll_free === true || validatedNumber.is_toll_free === true) {
          return res.status(403).json({ 
            error: "Number not eligible: Toll-free numbers not allowed" 
          });
        }

        // Keep number type consistent with country capabilities.
        if (!isAllowedNumberType(numberType, countryInfo.code)) {
          return res.status(403).json({ 
            error: `Number not eligible: Unsupported number type (${numberType}) for instant purchase` 
          });
        }

        // No short codes
        const cleanNumber = validatedNumber.phone_number.replace(/\D/g, '');
        if (cleanNumber.length < 7) {
          return res.status(403).json({ 
            error: "Number not eligible: Short codes not allowed" 
          });
        }

        // Allow A, B, or unknown. Block explicit C and above.
        validatedCarrierGroup =
          validatedNumber.carrier?.group ||
          validatedNumber.carrier_group ||
          validatedNumber.carrier?.carrier_group ||
          validatedNumber.region_information?.carrier_group ||
          null;
        if (validatedCarrierGroup) {
          const groupUpper = String(validatedCarrierGroup).toUpperCase();
          if (["C", "D", "E", "F", "G", "H"].includes(groupUpper)) {
            return res.status(403).json({ 
              error: `Number not eligible: Carrier group ${validatedCarrierGroup} not allowed` 
            });
          }
        }

        // No explicit premium features
        const features = validatedNumber.features || validatedNumber.capabilities || [];
        if (Array.isArray(features)) {
          if (features.some(f => 
            f === 'premium_routing' || 
            f === 'toll_free'
          )) {
            return res.status(403).json({ 
              error: "Number not eligible: Premium features not allowed" 
            });
          }
        }
        if (validatedNumber.premium === true || validatedNumber.is_premium === true) {
          return res.status(403).json({ 
            error: "Number not eligible: Premium number not allowed" 
          });
        }

        // Check monthly cost - CRITICAL
        validatedMonthlyCost = Number(
          validatedNumber.monthly_cost ||
            validatedNumber.monthly_rate ||
            validatedNumber.cost?.monthly ||
            validatedNumber.region_information?.monthly_cost ||
            validatedNumber.pricing?.monthly ||
            0
        );
        if (validatedMonthlyCost > monthlyLimit) {
          return res.status(403).json({ 
            error: `Number not eligible: Monthly cost ($${validatedMonthlyCost.toFixed(2)}) exceeds $${monthlyLimit.toFixed(2)} limit` 
          });
        }

        // Check messaging rate - CRITICAL
        validatedMessagingRate = Number(
          validatedNumber.messaging_rate ||
            validatedNumber.cost?.messaging ||
            validatedNumber.pricing?.messaging ||
            validatedNumber.region_information?.messaging_rate ||
            0
        );
        if (validatedMessagingRate > messagingLimit) {
          return res.status(403).json({ 
            error: `Number not eligible: Messaging rate ($${validatedMessagingRate.toFixed(4)}) exceeds $${messagingLimit.toFixed(4)} limit` 
          });
        }

      } catch (validationErr) {
        console.error("Number validation error:", validationErr);
        return res.status(400).json({ 
          error: "Failed to validate number eligibility",
          details: validationErr.message 
        });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Idempotency + hard one-number limit check from DB.
      const requestedDigits = normalizeDigits(phoneNumber);
      const existingActiveNumbers = await PhoneNumber.find({
        userId: user._id,
        status: "active"
      }).select("phoneNumber");

      if (existingActiveNumbers.length > 0) {
        const sameNumber = existingActiveNumbers.find(
          (item) => normalizeDigits(item.phoneNumber) === requestedDigits
        );
        if (sameNumber) {
          return res.json({
            success: true,
            phoneNumber: sameNumber.phoneNumber,
            alreadyOwned: true,
            message: "Number is already active on this account."
          });
        }
        return res.status(400).json({ error: "Number limit reached" });
      }

      const webhookUrl = process.env.BACKEND_URL
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;
      const provisioningWarnings = [];

      // PURCHASE NUMBER (ONLY AFTER ALL VALIDATIONS PASSED)
      console.log(`✅ COST CONTROL: Number ${phoneNumber} passed all validations, purchasing...`);
      console.log(`   User: ${user._id}`);
      console.log(`   Carrier Group: ${validatedCarrierGroup || 'Unknown'}`);
      console.log(`   Monthly Cost: $${Number(validatedMonthlyCost || 0).toFixed(2)}`);
      console.log(`   Messaging Rate: $${Number(validatedMessagingRate || 0).toFixed(4)}`);

      const order = await createNumberOrderWithFallback(telnyx, phoneNumber, {
        connectionId: process.env.TELNYX_CONNECTION_ID || null,
        messagingProfileId: user.messagingProfileId || null,
        requirementGroupId:
          validatedNumber?.requirement_group_id ||
          validatedNumber?.requirements_group_id ||
          null
      });

      // Get number cost details and region information from Telnyx
      let finalMonthlyCost = validatedMonthlyCost;
      let oneTimeFees = 0;
      let finalCarrierGroup = validatedCarrierGroup;
      let regionInfo = validatedNumber?.region_information || null;
      let country = countryInfo.name;
      let state = null;
      let city = null;
      
      try {
        const numDetails = await telnyx.phoneNumbers.retrieve(phoneNumber);
        finalMonthlyCost = numDetails.data.monthly_cost || numDetails.data.monthly_rate || validatedMonthlyCost;
        oneTimeFees = numDetails.data.one_time_cost || 0;
        finalCarrierGroup = numDetails.data.carrier?.group || numDetails.data.carrier_group || validatedCarrierGroup;
        
        // Extract region information
        regionInfo = numDetails.data.region_information || validatedNumber?.region_information || null;
        if (regionInfo) {
          // Use detected country info, but allow Telnyx to override if it provides more specific data
          const telnyxCountry = regionInfo.country_name || regionInfo.country;
          const telnyxCountryCode = resolveSupportedCountryCode(telnyxCountry);
          if (telnyxCountryCode) {
            const telnyxCountryInfo = getCountryByCode(telnyxCountryCode);
            country = telnyxCountryInfo?.name || country;
            countryInfo = telnyxCountryInfo || countryInfo;
          }
          state = regionInfo.region_name || regionInfo.state || regionInfo.region || null;
          city = regionInfo.locality || regionInfo.city || null;
        }
      } catch (err) {
        console.warn("Could not fetch number details from Telnyx:", err.message);
        // Fallback to data from search
        if (validatedNumber?.region_information) {
          regionInfo = validatedNumber.region_information;
          const telnyxCountry = regionInfo.country_name || regionInfo.country;
          const telnyxCountryCode = resolveSupportedCountryCode(telnyxCountry);
          if (telnyxCountryCode) {
            const telnyxCountryInfo = getCountryByCode(telnyxCountryCode);
            country = telnyxCountryInfo?.name || country;
            countryInfo = telnyxCountryInfo || countryInfo;
          }
          state = regionInfo.region_name || regionInfo.state || regionInfo.region || null;
          city = regionInfo.locality || regionInfo.city || null;
        }
      }

      const resolvedCountryInfo = getCountryByCode(countryInfo?.code) || getCountryByCode("US");
      const existingNumberRecord = await PhoneNumber.findOne({ phoneNumber }).select("userId status");
      if (
        existingNumberRecord &&
        existingNumberRecord.status === "active" &&
        String(existingNumberRecord.userId) !== String(user._id)
      ) {
        return res.status(409).json({
          error: "Number was just purchased by another account. Please select another number."
        });
      }

      const orderedNumberId = resolveOrderedNumberId(order?.data || order, phoneNumber);

      // Save/rehydrate locally (including previously released records) so order success is never lost.
      const phoneNumberDoc = await PhoneNumber.findOneAndUpdate(
        { phoneNumber },
        {
          $set: {
            userId: user._id,
            telnyxPhoneNumberId: orderedNumberId,
            messagingProfileId: user.messagingProfileId || null,
            status: "active",
            monthlyCost: finalMonthlyCost,
            oneTimeFees: oneTimeFees,
            carrierGroup: finalCarrierGroup,
            country: country || resolvedCountryInfo.name,
            countryCode: resolvedCountryInfo.code,
            countryName: resolvedCountryInfo.name,
            iso2: resolvedCountryInfo.iso2,
            lockedCountry: true,
            state: state,
            city: city,
            regionInformation: regionInfo,
            purchaseDate: new Date()
          },
          $setOnInsert: {
            phoneNumber
          }
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      );
      
      console.log(`✅ Number ${phoneNumber} purchased successfully for user ${user._id}`);

      // SYNC REAL COST FROM TELNYX (CRITICAL)
      // This ensures we have the most accurate cost data from Telnyx
      try {
        const { syncNumberCost } = await import("../services/telnyxCostService.js");
        const syncResult = await syncNumberCost(phoneNumberDoc._id.toString(), phoneNumberDoc.telnyxPhoneNumberId);
        if (syncResult.success) {
          console.log(`✅ Synced real Telnyx cost for number ${phoneNumber}: $${phoneNumberDoc.monthlyCost || 0}/month`);
        } else {
          console.warn(`⚠️ Could not sync Telnyx cost for number ${phoneNumber}: ${syncResult.error}`);
        }
      } catch (costSyncErr) {
        console.error(`❌ Error syncing number cost:`, costSyncErr);
        // Don't fail the purchase - mark as pending for later sync
        phoneNumberDoc.costPending = true;
        phoneNumberDoc.costSyncError = costSyncErr.message;
        await phoneNumberDoc.save();
      }

      // Non-critical provisioning steps should never convert a successful purchase into failure.
      // Keep warnings and return success so users are never charged without seeing their number active.
      let activeMessagingProfileId = user.messagingProfileId || null;
      try {
        activeMessagingProfileId = await ensureUserMessagingProfile({
          telnyx,
          user,
          countryInfo: resolvedCountryInfo,
          webhookUrl
        });

        if (activeMessagingProfileId && phoneNumberDoc.messagingProfileId !== activeMessagingProfileId) {
          phoneNumberDoc.messagingProfileId = activeMessagingProfileId;
          await phoneNumberDoc.save();
        }
      } catch (profileErr) {
        const profileMsg = extractTelnyxErrorMessage(profileErr);
        provisioningWarnings.push(`Messaging profile setup pending: ${profileMsg}`);
      }

      try {
        const attachResult = await attachNumberToMessagingProfile({
          telnyx,
          profileId: activeMessagingProfileId,
          phoneNumber
        });
        if (attachResult.warning) {
          provisioningWarnings.push(`Messaging attach pending: ${attachResult.warning}`);
        }
      } catch (attachErr) {
        provisioningWarnings.push(`Messaging attach pending: ${extractTelnyxErrorMessage(attachErr)}`);
      }

      // CONFIGURE VOICE - Set connection ID for incoming calls
      const connectionId = process.env.TELNYX_CONNECTION_ID;
      if (connectionId) {
        try {
          await telnyx.phoneNumbers.update(phoneNumber, {
            connection_id: connectionId
          });
          console.log(`✅ Voice connection ${connectionId} set for ${phoneNumber}`);
        } catch (voiceErr) {
          const voiceMsg = extractTelnyxErrorMessage(voiceErr);
          console.warn(`⚠️ Could not set voice connection:`, voiceMsg);
          provisioningWarnings.push(`Voice connection setup pending: ${voiceMsg}`);
        }
      }

      res.json({
        success: true,
        phoneNumber,
        warnings: provisioningWarnings.length ? provisioningWarnings : undefined
      });
    } catch (err) {
      console.error("PURCHASE NUMBER ERROR:", err);
      const normalizedFailure = normalizePurchaseFailure(err);
      res.status(normalizedFailure.status).json({ error: normalizedFailure.message });
    }
  }
);

/**
 * POST /api/numbers/buy
 * DEPRECATED: Use /api/numbers/purchase instead
 * Kept for backward compatibility but disabled auto-assignment
 */
router.post(
  "/buy",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      // HARD STOP — NO SUBSCRIPTION
      if (!req.subscription || !req.subscription.active) {
        return res.status(403).json({ error: "Active subscription required" });
      }

      // HARD STOP — LIMIT CHECK
      if (req.subscription.numbers.length >= 1) {
        return res.status(400).json({ error: "Number limit reached" });
      }

      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Ensure messaging profile with webhook URL
      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!user.messagingProfileId) {
        const profileData = {
          name: `user-${user._id}`,
          whitelisted_destinations: ["US", "CA"]
        };

        // Add webhook URL if backend URL is configured
        if (webhookUrl) {
          profileData.webhook_url = webhookUrl;
          profileData.webhook_failover_url = webhookUrl;
          profileData.webhook_api_version = "2";
        }

        const profile = await telnyx.messaging.messagingProfiles.create(profileData);

        user.messagingProfileId = profile.data.id;
        await user.save();
        
        console.log(`✅ Created messaging profile ${profile.data.id} for user ${user._id}`);
        if (webhookUrl) {
          console.log(`✅ Webhook URL set to: ${webhookUrl}`);
        } else {
          console.warn(`⚠️ No BACKEND_URL set - inbound SMS won't work!`);
        }
      } else {
        // Update existing profile with webhook URL if not set
        if (webhookUrl) {
          try {
            await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
              webhook_url: webhookUrl,
              webhook_failover_url: webhookUrl,
              webhook_api_version: "2"
            });
            console.log(`✅ Updated webhook URL for existing profile ${user.messagingProfileId}`);
          } catch (updateErr) {
            console.warn(`⚠️ Could not update messaging profile webhook:`, updateErr.message);
          }
        }
      }

      // AUTO-ASSIGNMENT DISABLED FOR COST CONTROL
      // Users must explicitly select a number via /api/numbers/search and /api/numbers/purchase
      return res.status(400).json({ 
        error: "Auto-assignment disabled. Please use /api/numbers/search to find available numbers and /api/numbers/purchase to buy a specific number."
      });

      // BUY NUMBER (ONLY AFTER ALL CHECKS PASSED)
      const order = await telnyx.numberOrders.create({
        phone_numbers: [{ phone_number: phoneNumber }]
      });

      // SAVE IMMEDIATELY
      await PhoneNumber.create({
        userId: user._id,
        phoneNumber,
        telnyxPhoneNumberId: order.data.id,
        messagingProfileId: user.messagingProfileId,
        status: "active"
      });

      // ATTACH TO MESSAGING PROFILE
      await telnyx.messaging.messagingProfiles.phoneNumbers.create(
        user.messagingProfileId,
        { phone_number: phoneNumber }
      );

      // CONFIGURE VOICE - Set connection ID for incoming calls
      const connectionId = process.env.TELNYX_CONNECTION_ID;
      if (connectionId) {
        try {
          // Update the phone number to use our voice connection
          await telnyx.phoneNumbers.update(phoneNumber, {
            connection_id: connectionId
          });
          console.log(`✅ Voice connection ${connectionId} set for ${phoneNumber}`);
        } catch (voiceErr) {
          console.warn(`⚠️ Could not set voice connection:`, voiceErr.message);
        }
      } else {
        console.warn(`⚠️ TELNYX_CONNECTION_ID not set - incoming calls won't work!`);
      }

      res.json({ success: true, phoneNumber });
    } catch (err) {
      console.error("BUY NUMBER ERROR:", err);
      res.status(500).json({ error: "Failed to buy number" });
    }
  }
);

/**
 * POST /api/numbers/fix-voice
 * Fix voice connection for existing phone numbers
 */
router.post(
  "/fix-voice",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const connectionId = process.env.TELNYX_CONNECTION_ID;
      if (!connectionId) {
        return res.status(500).json({ 
          error: "TELNYX_CONNECTION_ID not configured",
          hint: "Set TELNYX_CONNECTION_ID environment variable"
        });
      }

      // Find user's active phone numbers
      const phoneNumbers = await PhoneNumber.find({ 
        userId: req.user._id, 
        status: "active" 
      });

      if (phoneNumbers.length === 0) {
        return res.status(400).json({ error: "No active phone numbers found" });
      }

      const results = [];
      for (const pn of phoneNumbers) {
        try {
          await telnyx.phoneNumbers.update(pn.phoneNumber, {
            connection_id: connectionId
          });
          results.push({ phoneNumber: pn.phoneNumber, status: "updated" });
          console.log(`✅ Voice connection set for ${pn.phoneNumber}`);
        } catch (err) {
          results.push({ phoneNumber: pn.phoneNumber, status: "failed", error: err.message });
          console.error(`❌ Failed to update ${pn.phoneNumber}:`, err.message);
        }
      }

      res.json({ 
        success: true, 
        message: "Voice connections updated",
        connectionId,
        results
      });
    } catch (err) {
      console.error("FIX VOICE ERROR:", err);
      res.status(500).json({ error: "Failed to fix voice connection", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/fix-messaging
 * Fix messaging profile webhook URL for existing users
 */
router.post(
  "/fix-messaging",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.messagingProfileId) {
        return res.status(400).json({ error: "No messaging profile found. Buy a number first." });
      }

      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      if (!webhookUrl) {
        return res.status(500).json({ 
          error: "BACKEND_URL not configured. Cannot set webhook URL.",
          hint: "Set BACKEND_URL environment variable to your public API URL"
        });
      }

      // Update the messaging profile with webhook URL
      const updated = await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
        webhook_url: webhookUrl,
        webhook_failover_url: webhookUrl,
        webhook_api_version: "2"
      });

      console.log(`✅ Fixed messaging profile ${user.messagingProfileId} for user ${user._id}`);
      console.log(`✅ Webhook URL: ${webhookUrl}`);

      res.json({ 
        success: true, 
        message: "Messaging profile updated",
        messagingProfileId: user.messagingProfileId,
        webhookUrl: webhookUrl
      });
    } catch (err) {
      console.error("FIX MESSAGING ERROR:", err);
      res.status(500).json({ error: "Failed to fix messaging profile", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/check-messaging
 * Check messaging profile status
 */
router.get(
  "/check-messaging",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user || !user.messagingProfileId) {
        return res.json({ 
          success: true,
          hasProfile: false,
          message: "No messaging profile configured"
        });
      }

      // Get the messaging profile details from Telnyx
      const profile = await telnyx.messaging.messagingProfiles.retrieve(user.messagingProfileId);
      
      const phone = await PhoneNumber.findOne({ userId: user._id, status: "active" });

      res.json({ 
        success: true,
        hasProfile: true,
        messagingProfileId: user.messagingProfileId,
        webhookUrl: profile.data.webhook_url || null,
        webhookApiVersion: profile.data.webhook_api_version || null,
        phoneNumber: phone?.phoneNumber || null,
        phoneNumberHasProfile: !!phone?.messagingProfileId,
        expectedWebhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
          : "BACKEND_URL not set"
      });
    } catch (err) {
      console.error("CHECK MESSAGING ERROR:", err);
      res.status(500).json({ error: "Failed to check messaging profile", details: err.message });
    }
  }
);

/**
 * POST /api/numbers/fix-all
 * Fix both voice and messaging for all user's phone numbers
 */
router.post(
  "/fix-all",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const connectionId = process.env.TELNYX_CONNECTION_ID;
      const webhookUrl = process.env.BACKEND_URL 
        ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
        : null;

      const results = {
        voice: { fixed: false, error: null },
        messaging: { fixed: false, error: null },
        numbers: []
      };

      // Fix messaging profile
      if (user.messagingProfileId && webhookUrl) {
        try {
          await telnyx.messaging.messagingProfiles.update(user.messagingProfileId, {
            webhook_url: webhookUrl,
            webhook_failover_url: webhookUrl,
            webhook_api_version: "2"
          });
          results.messaging.fixed = true;
          console.log(`✅ Messaging webhook fixed for user ${user._id}`);
        } catch (err) {
          results.messaging.error = err.message;
        }
      }

      // Fix voice for all numbers
      if (connectionId) {
        const phoneNumbers = await PhoneNumber.find({ 
          userId: req.user._id, 
          status: "active" 
        });

        for (const pn of phoneNumbers) {
          try {
            await telnyx.phoneNumbers.update(pn.phoneNumber, {
              connection_id: connectionId
            });
            results.numbers.push({ phoneNumber: pn.phoneNumber, voiceFixed: true });
            console.log(`✅ Voice fixed for ${pn.phoneNumber}`);
          } catch (err) {
            results.numbers.push({ phoneNumber: pn.phoneNumber, voiceFixed: false, error: err.message });
          }
        }
        results.voice.fixed = results.numbers.some(n => n.voiceFixed);
      }

      res.json({ 
        success: true, 
        message: "Configuration fixed",
        connectionId: connectionId || "NOT SET",
        webhookUrl: webhookUrl || "NOT SET",
        results
      });
    } catch (err) {
      console.error("FIX ALL ERROR:", err);
      res.status(500).json({ error: "Failed to fix configuration", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/check-all
 * Check both voice and messaging configuration
 */
router.get(
  "/check-all",
  authenticateUser,
  loadSubscription,
  async (req, res) => {
    try {
      const telnyx = getTelnyxClient();
      if (!telnyx) {
        return res.status(500).json({ error: "Telnyx not configured" });
      }

      const user = await User.findById(req.user._id);
      const phoneNumbers = await PhoneNumber.find({ 
        userId: req.user._id, 
        status: "active" 
      });

      const config = {
        user: user?._id,
        messagingProfileId: user?.messagingProfileId || null,
        messagingWebhook: null,
        connectionId: process.env.TELNYX_CONNECTION_ID || "NOT SET",
        backendUrl: process.env.BACKEND_URL || "NOT SET",
        expectedWebhookUrl: process.env.BACKEND_URL 
          ? `${process.env.BACKEND_URL}/api/webhooks/telnyx/sms`
          : "BACKEND_URL not set",
        numbers: []
      };

      // Check messaging profile
      if (user?.messagingProfileId) {
        try {
          const profile = await telnyx.messaging.messagingProfiles.retrieve(user.messagingProfileId);
          config.messagingWebhook = profile.data.webhook_url || "NOT SET";
        } catch (e) {
          config.messagingWebhook = "ERROR: " + e.message;
        }
      }

      // Check each phone number's voice configuration
      for (const pn of phoneNumbers) {
        try {
          const numDetails = await telnyx.phoneNumbers.retrieve(pn.phoneNumber);
          config.numbers.push({
            phoneNumber: pn.phoneNumber,
            connectionId: numDetails.data.connection_id || "NOT SET",
            voiceEnabled: !!numDetails.data.connection_id
          });
        } catch (e) {
          config.numbers.push({
            phoneNumber: pn.phoneNumber,
            error: e.message
          });
        }
      }

      res.json({ success: true, config });
    } catch (err) {
      console.error("CHECK ALL ERROR:", err);
      res.status(500).json({ error: "Failed to check configuration", details: err.message });
    }
  }
);

/**
 * GET /api/numbers/supported-countries
 * Get list of supported countries for number purchasing
 */
router.get("/supported-countries", async (req, res) => {
  try {
    const countries = getSupportedCountries().map(c => ({
      code: c.code,
      name: c.name,
      iso2: c.iso2,
      telnyxCode: c.telnyxCode
    }));
    res.json({ success: true, countries });
  } catch (err) {
    console.error("GET SUPPORTED COUNTRIES ERROR:", err);
    res.status(500).json({ error: "Failed to get supported countries", details: err.message });
  }
});

/**
 * GET /api/numbers/webhook-urls
 * Show the expected webhook URLs that should be configured in Telnyx
 */
router.get("/webhook-urls", async (req, res) => {
  const backendUrl = process.env.BACKEND_URL || "YOUR_BACKEND_URL";
  
  res.json({
    success: true,
    info: "Configure these URLs in your Telnyx dashboard",
    webhooks: {
      voiceWebhook: `${backendUrl}/api/webhooks/telnyx/voice`,
      smsWebhook: `${backendUrl}/api/webhooks/telnyx/sms`,
      voiceWebhookDescription: "Set this on your Telnyx Connection (TeXML App or SIP Connection)",
      smsWebhookDescription: "Set this on your Messaging Profile (automatically set when buying numbers)"
    },
    configuration: {
      backendUrl: process.env.BACKEND_URL || "NOT SET",
      connectionId: process.env.TELNYX_CONNECTION_ID || "NOT SET",
      sipUsername: process.env.TELNYX_SIP_USERNAME ? "SET" : "NOT SET",
      telnyxApiKey: process.env.TELNYX_API_KEY ? "SET" : "NOT SET"
    }
  });
});

export default router;
