const DEFAULT_ADDON_EXPIRY_DAYS = 30;

function toIntegerOrNull(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`Invalid value for ${fieldName}`);
  }

  return parsed;
}

function toDateOrNull(value, fieldName, { strict = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    if (!strict) {
      return null;
    }
    throw new Error(`Invalid date for ${fieldName}`);
  }

  return parsed;
}

function isFutureDate(date, now = new Date()) {
  return date instanceof Date && !Number.isNaN(date.getTime()) && date > now;
}

export function getDefaultAddonExpiry(periodEnd = null, now = new Date()) {
  const normalizedPeriodEnd = toDateOrNull(periodEnd, "periodEnd");
  if (isFutureDate(normalizedPeriodEnd, now)) {
    return normalizedPeriodEnd;
  }

  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + DEFAULT_ADDON_EXPIRY_DAYS);
  return fallback;
}

export function parseLoadedCreditsInput(payload = {}) {
  const now = new Date();

  const loadedSms = toIntegerOrNull(
    payload.loadedSms ?? payload.sms ?? payload.smsAmount,
    "loadedSms"
  );
  const loadedMinutes = toIntegerOrNull(
    payload.loadedMinutes ?? payload.minutes ?? payload.minutesAmount,
    "loadedMinutes"
  );

  const sharedExpiry = toDateOrNull(
    payload.loadedCreditsExpiry ?? payload.expiryDate ?? payload.expiry,
    "loadedCreditsExpiry",
    { strict: true }
  );

  const loadedSmsExpiry =
    toDateOrNull(payload.loadedSmsExpiry ?? payload.smsExpiry, "loadedSmsExpiry", {
      strict: true
    }) ||
    sharedExpiry;
  const loadedMinutesExpiry =
    toDateOrNull(
      payload.loadedMinutesExpiry ?? payload.minutesExpiry,
      "loadedMinutesExpiry",
      { strict: true }
    ) || sharedExpiry;

  if (loadedSmsExpiry && !isFutureDate(loadedSmsExpiry, now)) {
    throw new Error("loadedSmsExpiry must be a future date");
  }
  if (loadedMinutesExpiry && !isFutureDate(loadedMinutesExpiry, now)) {
    throw new Error("loadedMinutesExpiry must be a future date");
  }

  const hasAmountChanges =
    (loadedSms !== null && loadedSms > 0) ||
    (loadedMinutes !== null && loadedMinutes > 0);
  const hasExpiryChanges = Boolean(loadedSmsExpiry || loadedMinutesExpiry);

  return {
    loadedSms: loadedSms ?? 0,
    loadedMinutes: loadedMinutes ?? 0,
    loadedSmsExpiry,
    loadedMinutesExpiry,
    hasAmountChanges,
    hasExpiryChanges,
    hasChanges: hasAmountChanges || hasExpiryChanges
  };
}

export function getActiveAddonAmounts(subscription = {}, now = new Date()) {
  const smsTotal = Math.max(0, Number(subscription.addons?.sms || 0));
  const minutesTotal = Math.max(0, Number(subscription.addons?.minutes || 0));

  const smsExpiry = toDateOrNull(subscription.addonsSmsExpiry, "addonsSmsExpiry");
  const minutesExpiry = toDateOrNull(
    subscription.addonsMinutesExpiry,
    "addonsMinutesExpiry"
  );

  // Missing expiry is treated as active for backward compatibility with older add-ons.
  const smsActive = !smsExpiry || isFutureDate(smsExpiry, now) ? smsTotal : 0;
  const minutesActive =
    !minutesExpiry || isFutureDate(minutesExpiry, now) ? minutesTotal : 0;

  return {
    smsTotal,
    minutesTotal,
    smsActive,
    minutesActive,
    smsExpiry,
    minutesExpiry
  };
}

export function applyLoadedCreditsToSubscription(
  subscription,
  loadedCredits = {}
) {
  if (!subscription) {
    throw new Error("Subscription is required");
  }

  const now = new Date();
  const smsToAdd = Math.max(0, Number(loadedCredits.loadedSms || 0));
  const minutesToAdd = Math.max(0, Number(loadedCredits.loadedMinutes || 0));

  subscription.addons = {
    minutes: Number(subscription.addons?.minutes || 0),
    sms: Number(subscription.addons?.sms || 0)
  };

  if (smsToAdd > 0) {
    subscription.addons.sms += smsToAdd;
  }
  if (minutesToAdd > 0) {
    subscription.addons.minutes += minutesToAdd;
  }

  const smsExpiryFromInput = toDateOrNull(
    loadedCredits.loadedSmsExpiry,
    "loadedSmsExpiry",
    { strict: true }
  );
  const minutesExpiryFromInput = toDateOrNull(
    loadedCredits.loadedMinutesExpiry,
    "loadedMinutesExpiry",
    { strict: true }
  );
  const existingSmsExpiry = toDateOrNull(subscription.addonsSmsExpiry, "addonsSmsExpiry");
  const existingMinutesExpiry = toDateOrNull(
    subscription.addonsMinutesExpiry,
    "addonsMinutesExpiry"
  );

  if (smsExpiryFromInput) {
    subscription.addonsSmsExpiry = smsExpiryFromInput;
  } else if (smsToAdd > 0 && !isFutureDate(existingSmsExpiry, now)) {
    subscription.addonsSmsExpiry = getDefaultAddonExpiry(subscription.periodEnd, now);
  }

  if (minutesExpiryFromInput) {
    subscription.addonsMinutesExpiry = minutesExpiryFromInput;
  } else if (minutesToAdd > 0 && !isFutureDate(existingMinutesExpiry, now)) {
    subscription.addonsMinutesExpiry = getDefaultAddonExpiry(subscription.periodEnd, now);
  }

  return getActiveAddonAmounts(subscription, now);
}
