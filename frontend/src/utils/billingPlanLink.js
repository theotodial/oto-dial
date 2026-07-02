/**
 * Build billing URL with optional pre-selected plan (matched by plan name on Billing page).
 * @param {string | null | undefined} planName
 */
export function billingPlanUrl(planName) {
  if (!planName || !String(planName).trim()) return '/billing';
  return `/billing?plan=${encodeURIComponent(String(planName).trim())}`;
}

/**
 * Resolve a plan from catalog by ?plan= query (name or slug).
 * @param {Array<{ _id: string, name: string }>} catalogPlans
 * @param {string | null | undefined} planQuery
 */
export function findPlanByBillingQuery(catalogPlans, planQuery) {
  if (!planQuery || !Array.isArray(catalogPlans) || catalogPlans.length === 0) return null;
  const needle = String(planQuery).trim().toLowerCase();
  const slug = needle.replace(/\s+/g, '-');
  return (
    catalogPlans.find((plan) => {
      const name = String(plan.name || '').trim().toLowerCase();
      return name === needle || name.replace(/\s+/g, '-') === slug;
    }) || null
  );
}
