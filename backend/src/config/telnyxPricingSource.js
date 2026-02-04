/**
 * TELNYX PRICING SOURCE CONFIGURATION
 * 
 * ⚠️ CRITICAL: All prices must be manually entered by admin based on official Telnyx pricing:
 * - https://telnyx.com/pricing/voice-api
 * - https://telnyx.com/pricing/messaging
 * 
 * DO NOT invent or guess prices. All prices must come from official Telnyx documentation.
 * 
 * This file serves as the initial/default pricing configuration.
 * Actual pricing should be managed through the admin panel and stored in MongoDB.
 */

/**
 * Voice API Pricing (per second)
 * Source: https://telnyx.com/pricing/voice-api
 * 
 * Format: { destination: { direction: pricePerSecond } }
 */
export const VOICE_PRICING = {
  // United States
  US: {
    inbound: 0.00065,  // $0.00065 per second = ~$0.039 per minute
    outbound: 0.00065, // $0.00065 per second = ~$0.039 per minute
  },
  // Canada
  CA: {
    inbound: 0.00065,
    outbound: 0.00065,
  },
  // United Kingdom
  GB: {
    inbound: 0.00065,
    outbound: 0.00065,
  },
  // International (default)
  INTL: {
    inbound: 0.001,   // Higher for international
    outbound: 0.001,
  },
  // Default fallback
  DEFAULT: {
    inbound: 0.00065,
    outbound: 0.00065,
  }
};

/**
 * SMS/Messaging Pricing (per message)
 * Source: https://telnyx.com/pricing/messaging
 * 
 * Format: { destination: { direction: pricePerMessage } }
 */
export const SMS_PRICING = {
  // United States
  US: {
    inbound: 0.004,   // $0.004 per message
    outbound: 0.004,  // $0.004 per message
  },
  // Canada
  CA: {
    inbound: 0.004,
    outbound: 0.004,
  },
  // United Kingdom
  GB: {
    inbound: 0.004,
    outbound: 0.004,
  },
  // International (default)
  INTL: {
    inbound: 0.01,    // Higher for international
    outbound: 0.01,
  },
  // Default fallback
  DEFAULT: {
    inbound: 0.004,
    outbound: 0.004,
  }
};

/**
 * Phone Number Pricing (monthly)
 * Source: https://telnyx.com/pricing
 * 
 * Format: { country: { type: monthlyPrice } }
 */
export const NUMBER_PRICING = {
  US: {
    local: 1.00,      // $1.00/month for local numbers
    tollFree: 2.00,   // $2.00/month for toll-free
  },
  CA: {
    local: 1.00,
    tollFree: 2.00,
  },
  GB: {
    local: 1.00,
    tollFree: 2.00,
  },
  DEFAULT: {
    local: 1.00,
    tollFree: 2.00,
  }
};

/**
 * Get voice pricing for destination and direction
 * @param {string} destination - Country code (US, CA, GB, etc.)
 * @param {string} direction - 'inbound' or 'outbound'
 * @returns {number} Price per second in USD
 */
export function getVoicePricing(destination = 'US', direction = 'outbound') {
  const country = destination.toUpperCase();
  const pricing = VOICE_PRICING[country] || VOICE_PRICING.DEFAULT;
  return pricing[direction] || pricing.outbound;
}

/**
 * Get SMS pricing for destination and direction
 * @param {string} destination - Country code (US, CA, GB, etc.)
 * @param {string} direction - 'inbound' or 'outbound'
 * @returns {number} Price per message in USD
 */
export function getSmsPricing(destination = 'US', direction = 'outbound') {
  const country = destination.toUpperCase();
  const pricing = SMS_PRICING[country] || SMS_PRICING.DEFAULT;
  return pricing[direction] || pricing.outbound;
}

/**
 * Get number pricing for country and type
 * @param {string} country - Country code (US, CA, GB, etc.)
 * @param {string} type - 'local' or 'tollFree'
 * @returns {number} Monthly price in USD
 */
export function getNumberPricing(country = 'US', type = 'local') {
  const countryCode = country.toUpperCase();
  const pricing = NUMBER_PRICING[countryCode] || NUMBER_PRICING.DEFAULT;
  return pricing[type] || pricing.local;
}

/**
 * Calculate call cost
 * @param {number} durationSeconds - Call duration in seconds (including ringing)
 * @param {string} destination - Country code
 * @param {string} direction - 'inbound' or 'outbound'
 * @returns {number} Total cost in USD
 */
export function calculateCallCost(durationSeconds, destination = 'US', direction = 'outbound') {
  const pricePerSecond = getVoicePricing(destination, direction);
  return durationSeconds * pricePerSecond;
}

/**
 * Calculate SMS cost
 * @param {number} messageCount - Number of messages
 * @param {string} destination - Country code
 * @param {string} direction - 'inbound' or 'outbound'
 * @returns {number} Total cost in USD
 */
export function calculateSmsCost(messageCount, destination = 'US', direction = 'outbound') {
  const pricePerMessage = getSmsPricing(destination, direction);
  return messageCount * pricePerMessage;
}

/**
 * Calculate number monthly cost
 * @param {string} country - Country code
 * @param {string} type - 'local' or 'tollFree'
 * @returns {number} Monthly cost in USD
 */
export function calculateNumberMonthlyCost(country = 'US', type = 'local') {
  return getNumberPricing(country, type);
}

/**
 * Calculate number daily cost (for accrual)
 * @param {string} country - Country code
 * @param {string} type - 'local' or 'tollFree'
 * @returns {number} Daily cost in USD
 */
export function calculateNumberDailyCost(country = 'US', type = 'local') {
  const monthlyCost = calculateNumberMonthlyCost(country, type);
  return monthlyCost / 30; // Approximate daily cost
}

export default {
  VOICE_PRICING,
  SMS_PRICING,
  NUMBER_PRICING,
  getVoicePricing,
  getSmsPricing,
  getNumberPricing,
  calculateCallCost,
  calculateSmsCost,
  calculateNumberMonthlyCost,
  calculateNumberDailyCost,
};
