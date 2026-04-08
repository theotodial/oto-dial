import TelnyxCost from "../models/TelnyxCost.js";
import TelnyxPricing from "../models/TelnyxPricing.js";
import {
  getVoicePricing,
  getSmsPricing,
  getNumberPricing,
  calculateCallCost,
  calculateSmsCost,
  calculateNumberDailyCost
} from "../config/telnyxPricingSource.js";

/**
 * Get active pricing from database or fallback to config
 */
async function getPricingFromDB(type, destination, direction, numberType = null) {
  try {
    const query = {
      type,
      destination: destination.toUpperCase(),
      isActive: true,
      $or: [
        { effectiveTo: null },
        { effectiveTo: { $gte: new Date() } }
      ]
    };

    if (direction) {
      query.$or = [
        { direction: direction },
        { direction: "both" }
      ];
    }

    if (numberType) {
      query.numberType = numberType;
    }

    const pricing = await TelnyxPricing.findOne(query)
      .sort({ effectiveFrom: -1 });

    if (pricing) {
      return {
        unitPriceUsd: pricing.unitPriceUsd,
        pricingRefId: pricing._id
      };
    }
  } catch (err) {
    console.error("Error fetching pricing from DB:", err);
  }

  // Fallback to config
  let unitPriceUsd;
  if (type === "voice") {
    unitPriceUsd = getVoicePricing(destination, direction);
  } else if (type === "sms") {
    unitPriceUsd = getSmsPricing(destination, direction);
  } else if (type === "number") {
    unitPriceUsd = getNumberPricing(destination, numberType || "local") / 30; // Daily
  }

  return {
    unitPriceUsd,
    pricingRefId: null // Config-based, no DB reference
  };
}

/**
 * Record call cost in immutable ledger
 */
export async function recordCallCost(callId, userId, callData) {
  try {
    const {
      telnyxCallId,
      from,
      to,
      destination = "US",
      direction = "outbound",
      ringingSeconds = 0,
      answeredSeconds = 0,
      billedSeconds = 0,
      callStartTime,
      callEndTime,
      callStatus
    } = callData;

    // Calculate total duration (including ringing)
    const totalSeconds = billedSeconds || (ringingSeconds + answeredSeconds) || 0;

    if (totalSeconds <= 0) {
      console.warn(`Call ${callId} has no duration, skipping cost record`);
      return { success: false, error: "No duration" };
    }

    // Get pricing
    const pricing = await getPricingFromDB("voice", destination, direction);

    // Calculate cost
    const unitPriceUsd = Number(pricing.unitPriceUsd);
    if (!Number.isFinite(unitPriceUsd) || unitPriceUsd < 0) {
      console.warn(
        `recordCallCost: invalid unitPriceUsd for call ${callId}, skipping ledger row`
      );
      return { success: false, error: "Invalid unit price" };
    }
    const totalCost = totalSeconds * unitPriceUsd;

    const costPayload = {
      userId,
      resourceType: "call",
      resourceId: callId,
      units: totalSeconds,
      unitPriceUsd,
      totalCostUsd: totalCost,
      destination,
      direction,
      ringingSeconds,
      answeredSeconds,
      billedSeconds: totalSeconds,
      eventTimestamp: callStartTime || new Date()
    };
    if (pricing.pricingRefId != null) {
      costPayload.pricingRefId = pricing.pricingRefId;
    }

    const costRecord = await TelnyxCost.create(costPayload);

    return {
      success: true,
      costRecordId: costRecord._id,
      totalCost
    };
  } catch (err) {
    console.error("Error recording call cost:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Record SMS cost in immutable ledger
 */
export async function recordSmsCost(smsId, userId, smsData) {
  try {
    const {
      telnyxMessageId,
      destination = "US",
      direction = "outbound",
      status,
      timestamp
    } = smsData;

    // Get pricing
    const pricing = await getPricingFromDB("sms", destination, direction);

    const unitPriceUsd = Number(pricing.unitPriceUsd);
    if (!Number.isFinite(unitPriceUsd) || unitPriceUsd < 0) {
      return { success: false, error: "Invalid unit price" };
    }
    const totalCost = unitPriceUsd;

    const smsPayload = {
      userId,
      resourceType: "sms",
      resourceId: smsId,
      units: 1,
      unitPriceUsd,
      totalCostUsd: totalCost,
      destination,
      direction,
      eventTimestamp: timestamp || new Date()
    };
    if (pricing.pricingRefId != null) {
      smsPayload.pricingRefId = pricing.pricingRefId;
    }

    const costRecord = await TelnyxCost.create(smsPayload);

    return {
      success: true,
      costRecordId: costRecord._id,
      totalCost
    };
  } catch (err) {
    console.error("Error recording SMS cost:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Record number daily cost accrual
 */
export async function recordNumberDailyCost(numberId, userId, numberData) {
  try {
    const {
      country = "US",
      type = "local",
      date
    } = numberData;

    // Get pricing
    const pricing = await getPricingFromDB("number", country, null, type);

    const dailyCost = Number(pricing.unitPriceUsd);
    if (!Number.isFinite(dailyCost) || dailyCost < 0) {
      return { success: false, error: "Invalid unit price" };
    }

    // Check if cost already recorded for this date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await TelnyxCost.findOne({
      userId,
      resourceType: "number",
      resourceId: numberId,
      eventTimestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    if (existing) {
      return { success: true, costRecordId: existing._id, totalCost: existing.totalCostUsd };
    }

    const numberPayload = {
      userId,
      resourceType: "number",
      resourceId: numberId,
      units: 1, // 1 day
      unitPriceUsd: dailyCost,
      totalCostUsd: dailyCost,
      destination: country,
      eventTimestamp: startOfDay
    };
    if (pricing.pricingRefId != null) {
      numberPayload.pricingRefId = pricing.pricingRefId;
    }

    const costRecord = await TelnyxCost.create(numberPayload);

    return {
      success: true,
      costRecordId: costRecord._id,
      totalCost: dailyCost
    };
  } catch (err) {
    console.error("Error recording number cost:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get total costs for analytics
 */
export async function getTotalCosts(dateFilter = {}) {
  try {
    const costs = await TelnyxCost.aggregate([
      {
        $match: {
          ...dateFilter,
          eventTimestamp: dateFilter.eventTimestamp || { $exists: true }
        }
      },
      {
        $group: {
          _id: "$resourceType",
          totalCost: { $sum: "$totalCostUsd" },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      calls: 0,
      sms: 0,
      numbers: 0,
      total: 0
    };

    costs.forEach(item => {
      result[item._id] = item.totalCost;
      result.total += item.totalCost;
    });

    return result;
  } catch (err) {
    console.error("Error getting total costs:", err);
    return { calls: 0, sms: 0, numbers: 0, total: 0 };
  }
}

export default {
  recordCallCost,
  recordSmsCost,
  recordNumberDailyCost,
  getTotalCosts
};
