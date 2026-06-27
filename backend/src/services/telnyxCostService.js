import getTelnyxClient from "./telnyxService.js";

/**
 * Telnyx Cost Service
 * Fetches REAL costs from Telnyx API - NO estimates, NO hardcoded values
 */

function parseTelnyxMoney(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pickFirstCost(...values) {
  for (const value of values) {
    const parsed = parseTelnyxMoney(value);
    if (parsed != null) return parsed;
  }
  return null;
}

/**
 * Fetch call cost from Telnyx API
 * @param {string} telnyxCallId - Telnyx call ID
 * @returns {Promise<Object>} Cost data including per-second rates and total cost
 */
export async function fetchCallCost(telnyxCallId) {
  try {
    const telnyx = getTelnyxClient();
    if (!telnyx) {
      throw new Error("Telnyx client not initialized");
    }

    // Fetch call details from Telnyx
    // Note: Telnyx API structure may vary - try multiple endpoints
    let call = null;
    try {
      call = await telnyx.calls.retrieve(telnyxCallId);
    } catch (err) {
      // Try alternative endpoint
      try {
        call = await telnyx.callControl.calls.retrieve(telnyxCallId);
      } catch (err2) {
        throw new Error(`Call ${telnyxCallId} not found: ${err.message}`);
      }
    }
    
    if (!call || !call.data) {
      throw new Error(`Call ${telnyxCallId} not found in Telnyx`);
    }

    const callData = call.data;

    // Extract cost information from Telnyx response
    // Telnyx provides cost in the call record
    const costData = {
      telnyxCallId: callData.id,
      billedSeconds: callData.billable_duration || callData.duration_seconds || callData.billable_time || 0,
      ringDurationSeconds: callData.ring_duration || 0,
      answeredDurationSeconds: callData.answered_duration || 0,
      costPerSecond: parseTelnyxMoney(callData.cost_per_second),
      totalCost: pickFirstCost(
        callData.cost,
        callData.total_cost,
        callData.call_cost,
        callData.billed_amount,
        callData.amount
      ),
      carrierFee: parseTelnyxMoney(callData.carrier_fee) || 0,
      direction: callData.direction || callData.call_direction || null,
      calculatedCost: null
    };

    // If cost is not provided, try to fetch from billing/usage API
    if (!costData.totalCost && costData.costPerSecond) {
      costData.calculatedCost = costData.billedSeconds * costData.costPerSecond;
      costData.totalCost = costData.calculatedCost + (costData.carrierFee || 0);
    }

    // If still no cost, try usage records or billing API
    if (!costData.totalCost) {
      try {
        const usageRecords = await telnyx.usageRecords.list({
          filter: {
            call_id: telnyxCallId
          }
        });

        if (usageRecords?.data?.length > 0) {
          let usageTotal = 0;
          for (const usage of usageRecords.data) {
            usageTotal += pickFirstCost(usage.cost, usage.total_cost, usage.amount) || 0;
          }
          if (usageTotal > 0) {
            costData.totalCost = usageTotal;
          }
          costData.costPerSecond =
            parseTelnyxMoney(usageRecords.data[0].cost_per_second) || costData.costPerSecond;
        }
      } catch (usageErr) {
        console.warn(`Could not fetch usage records for call ${telnyxCallId}:`, usageErr.message);
      }
    }

    if (!costData.totalCost) {
      try {
        const detailRecords = await telnyx.detailRecords.list({
          filter: {
            record_type: "call-control",
            call_session_id: callData.call_session_id || undefined,
            call_leg_id: telnyxCallId,
          },
          page: { size: 20 },
        });

        if (detailRecords?.data?.length > 0) {
          let detailTotal = 0;
          for (const record of detailRecords.data) {
            detailTotal +=
              pickFirstCost(
                record.cost,
                record.total_cost,
                record.billed_amount,
                record.amount
              ) || 0;
          }
          if (detailTotal > 0) {
            costData.totalCost = detailTotal;
          }
        }
      } catch (detailErr) {
        console.warn(`Could not fetch detail records for call ${telnyxCallId}:`, detailErr.message);
      }
    }

    // If cost is still missing, mark for later sync but don't fail
    if (!costData.totalCost) {
      console.warn(`⚠️ No cost data available for call ${telnyxCallId} - will retry later`);
    }

    return {
      success: true,
      data: costData
    };
  } catch (error) {
    console.error(`Error fetching call cost for ${telnyxCallId}:`, error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Fetch SMS cost from Telnyx API
 * @param {string} telnyxMessageId - Telnyx message ID
 * @returns {Promise<Object>} Cost data including per-message cost and carrier fees
 */
export async function fetchSmsCost(telnyxMessageId) {
  try {
    const telnyx = getTelnyxClient();
    if (!telnyx) {
      throw new Error("Telnyx client not initialized");
    }

    // Fetch message details from Telnyx
    let message = null;
    try {
      message = await telnyx.messages.retrieve(telnyxMessageId);
    } catch (err) {
      // Try alternative endpoint
      try {
        message = await telnyx.messaging.messages.retrieve(telnyxMessageId);
      } catch (err2) {
        throw new Error(`Message ${telnyxMessageId} not found: ${err.message}`);
      }
    }
    
    if (!message || !message.data) {
      throw new Error(`Message ${telnyxMessageId} not found in Telnyx`);
    }

    const messageData = message.data;

    // Extract cost information
    const costData = {
      telnyxMessageId: messageData.id,
      cost: messageData.cost || messageData.total_cost || null,
      costPerSms: messageData.cost_per_message || null,
      carrier: messageData.carrier || null,
      carrierFee: messageData.carrier_fee || messageData.carrier_fees || 0,
      direction: messageData.direction || messageData.message_direction || null,
      calculatedCost: null
    };

    // If cost is not provided, try usage records
    if (!costData.cost) {
      try {
        const usageRecords = await telnyx.usageRecords.list({
          filter: {
            message_id: telnyxMessageId
          }
        });

        if (usageRecords && usageRecords.data && usageRecords.data.length > 0) {
          const usage = usageRecords.data[0];
          costData.cost = usage.cost || usage.total_cost || null;
          costData.costPerSms = usage.cost_per_message || costData.costPerSms;
          costData.carrierFee = usage.carrier_fee || costData.carrierFee;
        }
      } catch (usageErr) {
        console.warn(`Could not fetch usage records for message ${telnyxMessageId}:`, usageErr.message);
      }
    }

    // If still no cost, use default rates (but mark as estimated)
    if (!costData.cost && costData.costPerSms) {
      costData.calculatedCost = costData.costPerSms + (costData.carrierFee || 0);
      costData.cost = costData.calculatedCost;
    }

    return {
      success: true,
      data: costData
    };
  } catch (error) {
    console.error(`Error fetching SMS cost for ${telnyxMessageId}:`, error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Fetch phone number costs from Telnyx API
 * @param {string} telnyxNumberId - Telnyx phone number ID
 * @returns {Promise<Object>} Cost data including monthly rental and purchase fees
 */
export async function fetchNumberCost(telnyxNumberId) {
  try {
    const telnyx = getTelnyxClient();
    if (!telnyx) {
      throw new Error("Telnyx client not initialized");
    }

    // Fetch phone number details from Telnyx
    // Note: telnyxNumberId might be the phone number itself or the Telnyx ID
    let number = null;
    try {
      // Try retrieving by ID first
      number = await telnyx.phoneNumbers.retrieve(telnyxNumberId);
    } catch (err) {
      // If that fails, try using it as a phone number
      try {
        number = await telnyx.phoneNumbers.retrieve({ phone_number: telnyxNumberId });
      } catch (err2) {
        throw new Error(`Phone number ${telnyxNumberId} not found: ${err.message}`);
      }
    }
    
    if (!number || !number.data) {
      throw new Error(`Phone number ${telnyxNumberId} not found in Telnyx`);
    }

    const numberData = number.data;

    // Extract cost information and region data
    const costData = {
      telnyxNumberId: numberData.id,
      phoneNumber: numberData.phone_number || numberData.number,
      monthlyCost: numberData.monthly_cost || numberData.monthly_rental || null,
      oneTimeFees: numberData.one_time_cost || numberData.purchase_fee || 0,
      carrierGroup: numberData.carrier_group || null,
      carrierFee: numberData.carrier_fee || 0,
      regionInformation: numberData.region_information || null,
      country: numberData.region_information?.country_name || numberData.region_information?.country || "United States",
      state: numberData.region_information?.region_name || numberData.region_information?.state || numberData.region_information?.region || null,
      city: numberData.region_information?.locality || numberData.region_information?.city || null,
      featureFlags: {
        hdCalling: numberData.features?.hd_calling || false,
        premiumRouting: numberData.features?.premium_routing || false,
        tollFree: numberData.number_type === "toll-free",
        shortCode: numberData.number_type === "short-code"
      },
      // Try to get billing history
      totalLifetimeCost: null
    };

    // Try to fetch billing history for this number
    try {
      const billingHistory = await telnyx.billing.phoneNumbers.list({
        filter: {
          phone_number_id: telnyxNumberId
        }
      });

      if (billingHistory && billingHistory.data) {
        let lifetimeCost = 0;
        billingHistory.data.forEach(bill => {
          lifetimeCost += bill.amount || 0;
        });
        costData.totalLifetimeCost = lifetimeCost;
      }
    } catch (billingErr) {
      console.warn(`Could not fetch billing history for number ${telnyxNumberId}:`, billingErr.message);
    }

    return {
      success: true,
      data: costData
    };
  } catch (error) {
    console.error(`Error fetching number cost for ${telnyxNumberId}:`, error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

/**
 * Sync cost for a call if missing
 * @param {string} callId - MongoDB Call document ID
 * @param {string} telnyxCallId - Telnyx call ID
 */
export async function syncCallCost(callId, telnyxCallId) {
  try {
    const Call = (await import("../models/Call.js")).default;
    const call = await Call.findById(callId);
    
    if (!call) {
      throw new Error(`Call ${callId} not found`);
    }

    // Skip only when cost was already synced from the Telnyx API (not webhook estimates).
    if (call.costSyncedAt && call.cost > 0) {
      return { success: true, message: "Cost already synced from Telnyx API" };
    }

    // Fetch from Telnyx
    const costResult = await fetchCallCost(telnyxCallId || call.telnyxCallId);
    
    if (!costResult.success || !costResult.data) {
      // Mark as pending
      call.costPending = true;
      call.costSyncError = costResult.error;
      await call.save();
      return { success: false, error: costResult.error };
    }

    // Update call with real cost data
    const costData = costResult.data;
    const totalCost = pickFirstCost(costData.totalCost, costData.calculatedCost);
    if (totalCost == null) {
      call.costPending = true;
      call.costSyncError = "No cost data from Telnyx API yet";
      await call.save();
      return { success: false, error: "No cost data from Telnyx API yet" };
    }

    call.cost = totalCost;
    call.costPerSecond = costData.costPerSecond;
    call.billedSeconds = costData.billedSeconds;
    call.ringingDuration = costData.ringDurationSeconds;
    call.answeredDuration = costData.answeredDurationSeconds;
    call.carrierFee = costData.carrierFee || 0;
    call.telnyxCallId = telnyxCallId || call.telnyxCallId;
    call.costPending = false;
    call.costSyncedAt = new Date();
    
    await call.save();
    
    return { success: true, cost: call.cost };
  } catch (error) {
    console.error(`Error syncing call cost for ${callId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync cost for an SMS if missing
 * @param {string} smsId - MongoDB SMS document ID
 * @param {string} telnyxMessageId - Telnyx message ID
 */
export async function syncSmsCost(smsId, telnyxMessageId) {
  try {
    const SMS = (await import("../models/SMS.js")).default;
    const sms = await SMS.findById(smsId);
    
    if (!sms) {
      throw new Error(`SMS ${smsId} not found`);
    }

    // Skip only when cost was already synced from the Telnyx API (not outbound estimates).
    if (sms.costSyncedAt && sms.cost > 0) {
      return { success: true, message: "Cost already synced from Telnyx API" };
    }

    // Fetch from Telnyx
    const costResult = await fetchSmsCost(telnyxMessageId || sms.telnyxMessageId);
    
    if (!costResult.success || !costResult.data) {
      // Mark as pending
      sms.costPending = true;
      sms.costSyncError = costResult.error;
      await sms.save();
      return { success: false, error: costResult.error };
    }

    // Update SMS with real cost data
    const costData = costResult.data;
    const totalCost = pickFirstCost(costData.cost, costData.calculatedCost);
    if (totalCost == null) {
      sms.costPending = true;
      sms.costSyncError = "No cost data from Telnyx API yet";
      await sms.save();
      return { success: false, error: "No cost data from Telnyx API yet" };
    }

    sms.cost = totalCost;
    sms.costPerSms = costData.costPerSms;
    sms.carrier = costData.carrier;
    sms.carrierFees = costData.carrierFee || 0;
    sms.telnyxMessageId = telnyxMessageId || sms.telnyxMessageId;
    sms.costPending = false;
    sms.costSyncedAt = new Date();
    
    await sms.save();
    
    return { success: true, cost: sms.cost };
  } catch (error) {
    console.error(`Error syncing SMS cost for ${smsId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync cost for a phone number if missing
 * @param {string} numberId - MongoDB PhoneNumber document ID
 * @param {string} telnyxNumberId - Telnyx phone number ID
 */
export async function syncNumberCost(numberId, telnyxNumberId) {
  try {
    const PhoneNumber = (await import("../models/PhoneNumber.js")).default;
    const number = await PhoneNumber.findById(numberId);
    
    if (!number) {
      throw new Error(`Phone number ${numberId} not found`);
    }

    // Fetch from Telnyx
    const costResult = await fetchNumberCost(telnyxNumberId || number.telnyxPhoneNumberId);
    
    if (!costResult.success || !costResult.data) {
      // Mark as pending
      number.costPending = true;
      number.costSyncError = costResult.error;
      await number.save();
      return { success: false, error: costResult.error };
    }

    // Update number with real cost data and region information
    const costData = costResult.data;
    number.monthlyCost = costData.monthlyCost || 0;
    number.oneTimeFees = costData.oneTimeFees || 0;
    number.carrierGroup = costData.carrierGroup;
    number.extraFees = costData.carrierFee || 0;
    number.telnyxPhoneNumberId = telnyxNumberId || number.telnyxPhoneNumberId;
    
    // Update region information if available
    if (costData.regionInformation) {
      number.regionInformation = costData.regionInformation;
    }
    if (costData.country) {
      number.country = costData.country;
    }
    if (costData.state) {
      number.state = costData.state;
    }
    if (costData.city) {
      number.city = costData.city;
    }
    
    number.costPending = false;
    number.costSyncedAt = new Date();
    
    await number.save();
    
    return { success: true, monthlyCost: number.monthlyCost, oneTimeFees: number.oneTimeFees };
  } catch (error) {
    console.error(`Error syncing number cost for ${numberId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Pull real Telnyx billing for recent calls/SMS that are still missing API sync.
 */
export async function syncPendingTelnyxCostsInRange({
  startDate,
  endDate,
  limit = 20,
} = {}) {
  const Call = (await import("../models/Call.js")).default;
  const SMS = (await import("../models/SMS.js")).default;

  const dateFilter = {
    createdAt: {
      $gte: startDate || new Date(0),
      $lte: endDate || new Date(),
    },
  };

  const [pendingCalls, pendingSms] = await Promise.all([
    Call.find({
      ...dateFilter,
      telnyxCallId: { $nin: [null, ""] },
      costSyncedAt: null,
      $or: [{ billedSeconds: { $gt: 0 } }, { durationSeconds: { $gt: 0 } }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("_id telnyxCallId")
      .lean(),
    SMS.find({
      ...dateFilter,
      telnyxMessageId: { $nin: [null, ""] },
      costSyncedAt: null,
      status: { $ne: "failed" },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("_id telnyxMessageId")
      .lean(),
  ]);

  let synced = 0;
  let failed = 0;

  for (const call of pendingCalls) {
    const result = await syncCallCost(String(call._id), call.telnyxCallId);
    if (result.success && Number(result.cost) > 0) synced += 1;
    else if (!result.success) failed += 1;
  }

  for (const sms of pendingSms) {
    const result = await syncSmsCost(String(sms._id), sms.telnyxMessageId);
    if (result.success && Number(result.cost) > 0) synced += 1;
    else if (!result.success) failed += 1;
  }

  return {
    scanned: pendingCalls.length + pendingSms.length,
    synced,
    failed,
    pendingCalls: pendingCalls.length,
    pendingSms: pendingSms.length,
  };
}
