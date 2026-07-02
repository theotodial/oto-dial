import { isComingSoonPlan } from './planDisplay';

/** Plans paused for new purchases — still visible in catalog UI. */
export const TEMPORARILY_UNAVAILABLE_PLAN_NAMES = new Set(['Basic Plan']);

/** When true, add-on packs remain visible but cannot be purchased. */
export const ADDONS_TEMPORARILY_UNAVAILABLE = true;

export const UNAVAILABLE_CTA = 'Not available at the moment';

export const UNAVAILABLE_SUPPORT_MESSAGE =
  'This option is not available at the moment. Please contact support if you need help.';

export const SUPPORT_UNAVAILABLE_PATH =
  '/support?subject=Plan%20or%20add-on%20unavailable';

export function isTemporarilyUnavailablePlan(plan) {
  if (!plan) return false;
  if (plan.temporarilyUnavailable === true) return true;
  const name = String(plan.name || plan.planName || '').trim();
  return TEMPORARILY_UNAVAILABLE_PLAN_NAMES.has(name);
}

export function isPlanPurchasable(plan) {
  if (!plan) return false;
  if (plan.available === false) return false;
  if (isComingSoonPlan(plan) || plan.comingSoon) return false;
  if (isTemporarilyUnavailablePlan(plan)) return false;
  return true;
}

export function getPlanAvailability(plan) {
  if (isComingSoonPlan(plan) || plan.comingSoon) {
    return {
      available: false,
      comingSoon: true,
      temporarilyUnavailable: false,
      badge: 'Coming Soon',
      cta: 'Coming Soon',
    };
  }
  if (isTemporarilyUnavailablePlan(plan)) {
    return {
      available: false,
      comingSoon: false,
      temporarilyUnavailable: true,
      badge: 'Unavailable',
      cta: UNAVAILABLE_CTA,
    };
  }
  return {
    available: true,
    comingSoon: false,
    temporarilyUnavailable: false,
    badge: null,
    cta: 'Get Started Instantly',
  };
}

export function areAddonsPurchasable() {
  return !ADDONS_TEMPORARILY_UNAVAILABLE;
}
