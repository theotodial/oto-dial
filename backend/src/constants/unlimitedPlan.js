export const UNLIMITED_PLAN_TYPE = "unlimited";
export const UNLIMITED_PLAN_NAME = "Unlimited";
export const UNLIMITED_STRIPE_PRICE_ID = "price_1T2mI6CxZc7GK7QKObsM4ksT";

export const UNLIMITED_INTERNAL_LIMITS = Object.freeze({
  monthlySmsLimit: 400,
  monthlyMinutesLimit: 3600,
  dailySmsLimit: 30,
  dailyMinutesLimit: 180,
  dedicatedNumbers: 1
});

export const SUSPICIOUS_ACTIVITY_ERROR =
  "Suspicious activity detected. Please contact support.";

export function normalizePlanType(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function inferPlanTypeFromEntity(entity = {}) {
  const explicitType = normalizePlanType(
    entity.planType || entity.type || entity.planKey
  );

  if (explicitType) {
    return explicitType;
  }

  const normalizedName = String(entity.planName || entity.name || "")
    .trim()
    .toLowerCase();

  if (normalizedName.includes("unlimited")) {
    return UNLIMITED_PLAN_TYPE;
  }
  if (normalizedName.includes("super")) {
    return "super";
  }
  if (normalizedName.includes("basic")) {
    return "basic";
  }
  if (normalizedName.includes("trial")) {
    return "trial";
  }

  return "custom";
}

