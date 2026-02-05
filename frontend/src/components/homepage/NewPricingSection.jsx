import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import API from '../../api';

function NewPricingSection() {
  const [plans, setPlans] = useState([
    {
      name: "Basic Plan",
      price: "19.99",
      description: "Perfect for individuals and small teams",
      features: [
        "1 Local Phone Number",
        "1,500 Voice Minutes",
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
        "1 Local Phone Number",
        "2,500 Voice Minutes",
        "200 SMS",
        "Email Support"
      ],
      cta: "Get Started Instantly",
      popular: false,
      available: true
    }
  ]);

  useEffect(() => {
    // Fetch plans from API
    const fetchPlans = async () => {
      try {
        const response = await API.get('/api/subscription/plans');
        if (response.data?.success && response.data?.plans) {
          const transformedPlans = response.data.plans.map(plan => ({
            name: plan.name,
            price: plan.price.toFixed(2),
            description: plan.name === "Basic Plan" 
              ? "Perfect for individuals and small teams"
              : "For growing businesses and power users",
            features: [
              `${plan.limits.numbersTotal} Local Phone Number${plan.limits.numbersTotal > 1 ? 's' : ''}`,
              `${plan.limits.minutesTotal.toLocaleString()} Voice Minutes`,
              `${plan.limits.smsTotal} SMS`,
              "Email Support"
            ],
            cta: "Get Started Instantly",
            popular: plan.name === "Basic Plan",
            available: true
          }));
          setPlans(transformedPlans);
        }
      } catch (err) {
        console.error('Failed to fetch plans:', err);
        // Keep default plans if API fails
      }
    };

    fetchPlans();
  }, []);

  return (
    <section id="pricing" className="py-24 px-4 bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4 tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Choose the perfect plan for your business. No hidden fees, no surprises.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative bg-white dark:bg-slate-800 rounded-2xl ${
                plan.popular
                  ? 'border-2 border-indigo-600 shadow-2xl md:scale-105'
                  : 'border border-gray-200 dark:border-slate-700 shadow-lg'
              } p-8 hover:shadow-2xl transition-all duration-300`}
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
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{plan.description}</p>

              {/* Price */}
              <div className="mb-8">
                <div className="flex items-baseline">
                  <span className="text-5xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
                  <span className="text-gray-600 dark:text-gray-400 ml-2">/month</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, featureIndex) => (
                  <li key={featureIndex} className="flex items-start">
                    <svg
                      className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 mr-3 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Button */}
              <Link
                to="/billing"
                className={`block w-full text-center py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                  plan.popular
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

export default NewPricingSection;

