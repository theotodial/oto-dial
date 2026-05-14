import PrefetchLink from '../PrefetchLink';
import { useState, useEffect } from 'react';
import API from '../../api';
import PlanFeatureBullet from '../PlanFeatureBullet';
import {
  getPlanFeatureBullets,
  isTrialPlan,
  planMarketingDescription,
} from '../../utils/planDisplay';

/** Homepage should only show the three public marketing plans. */
const ALLOWED_PRICING_PLAN_NAMES = new Set([
  'Basic Plan',
  'Super Plan',
  'Unlimited Call',
]);

const DEFAULT_MARKETING_PLANS = [
  {
    name: "Basic Plan",
    price: "19.99",
    description: "Perfect for individuals and small teams",
    features: [
      "Free Virtual Number",
      "1,500 Telecom Credits",
      "100 SMS",
      "Email Support"
    ],
    cta: "Get Started Instantly",
    popular: true,
    available: true
  },
  {
    name: "Super Plan",
    price: "29.99",
    description: "For growing businesses and power users",
    features: [
      "Free Virtual Number",
      "2,500 Telecom Credits",
      "200 SMS",
      "Email Support"
    ],
    cta: "Get Started Instantly",
    popular: false,
    available: true
  },
  {
    name: 'Unlimited Call',
    price: '39.99',
    description: 'Unlimited outbound calling for power users',
    features: [
      { text: 'Free Virtual Number', included: true },
      { text: 'Unlimited telecom credits', included: true },
      { text: 'SMS not included', included: false },
      { text: 'Email Support', included: true },
    ],
    cta: 'Get Started Instantly',
    popular: false,
    available: true,
  },
];

function NewPricingSection() {
  const [plans, setPlans] = useState(DEFAULT_MARKETING_PLANS);

  const toMarketingPlan = (plan) => ({
    name: plan.name,
    price: Number(plan.price || 0).toFixed(2),
    description: planMarketingDescription(plan),
    features: getPlanFeatureBullets(plan),
    cta: 'Get Started Instantly',
    popular: plan.name === 'Basic Plan',
    available: true,
  });

  useEffect(() => {
    // Fetch plans from API
    const fetchPlans = async () => {
      try {
        const response = await API.get('/api/subscription/plans');
        if (response.data?.success && response.data?.plans) {
          const transformedPlans = response.data.plans
            .filter(
              (plan) =>
                ALLOWED_PRICING_PLAN_NAMES.has(plan.name) && !isTrialPlan(plan)
            )
            .map(toMarketingPlan);
          if (transformedPlans.length === ALLOWED_PRICING_PLAN_NAMES.size) {
            setPlans(transformedPlans);
          } else if (transformedPlans.length > 0) {
            const merged = DEFAULT_MARKETING_PLANS.map((fallbackPlan) => {
              return transformedPlans.find((plan) => plan.name === fallbackPlan.name) || fallbackPlan;
            });
            setPlans(merged);
          }
        }
      } catch (err) {
        console.error('Failed to fetch plans:', err);
        // Keep default plans if API fails
      }
    };

    fetchPlans();
  }, []);

  return (
    <section id="pricing" className="scroll-mt-24 py-20 md:py-24 px-4 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-14 max-w-3xl mx-auto">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mb-3">
            Affordable telecom SaaS pricing
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
            Every paid plan includes a free US virtual number, browser-based calling, and fair telecom credit billing.
            No hidden carrier fees, no surprise add-ons.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative bg-white dark:bg-slate-900 rounded-[1.35rem] ring-1 ring-black/[0.04] dark:ring-white/[0.06] ${
                plan.popular
                  ? 'border-2 border-indigo-600 shadow-2xl shadow-indigo-500/15 md:scale-[1.03]'
                  : 'border border-gray-200 dark:border-slate-800 shadow-lg'
              } p-7 md:p-8 hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg">
                    Most Popular
                  </span>
                </div>
              )}

              {/* Plan name */}
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">{plan.name}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm md:text-base">{plan.description}</p>

              {/* Price */}
              <div className="mb-7 pb-6 border-b border-gray-100 dark:border-slate-800">
                <div className="flex items-baseline">
                  <span className="text-5xl font-bold text-gray-900 dark:text-white tracking-tight">${plan.price}</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-2 text-sm">/month</span>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">Billed monthly · cancel anytime</p>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <PlanFeatureBullet key={featureIndex} feature={feature} variant="homepage" />
                ))}
              </ul>

              {/* CTA Button */}
              <PrefetchLink
                to="/billing"
                className={`block w-full text-center py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                  plan.popular
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {plan.cta}
              </PrefetchLink>
            </div>
          ))}
        </div>

        <p className="text-center text-xs md:text-sm text-gray-500 dark:text-gray-500 mt-10">
          Free US virtual number · Browser-based calling · No VPN · No LLC · No SIM
        </p>
      </div>
    </section>
  );
}

export default NewPricingSection;

