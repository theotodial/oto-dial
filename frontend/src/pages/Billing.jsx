import { useState, useEffect, useRef } from 'react';
import API from '../api';

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

function Billing() {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const plans = [
    {
      id: 'starter',
      name: "BASIC PLAN",
      price: "19.99",
      description: "Perfect for individuals and small teams",
      features: [
        "1 Local Phone Number",
        "2500 Upcoming/Incoming Minutes",
        "200 SMS Incoming/Outgoing",
        "Email Support"
      ],
      popular: true,
      available: true
    },
    {
      id: 'professional',
      name: "Professional",
      price: "49",
      description: "For growing businesses",
      features: [
        "2 Local Numbers",
        "10000 Minutes/Month",
        "Advanced Call Routing",
        "Priority Support",
        "Team Collaboration"
      ],
      popular: false,
      available: false,
      status: "upcoming"
    },
    {
      id: 'enterprise',
      name: "Enterprise",
      price: "Custom",
      description: "For large organizations",
      features: [
        "Max 10 Phone Numbers",
        "Unlimited Minutes",
        "Dedicated Account Manager",
        "Custom Integrations",
        "24/7 Priority Support",
        "Advanced Security",
        "SLA Guarantee"
      ],
      popular: false
    }
  ];

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    fetchBalance();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchBalance = async () => {
    if (!isMountedRef.current) return;
    
    setError('');
    try {
      const response = await API.get('/api/wallet');
      
      if (!isMountedRef.current) return;
      
      if (response.error) {
        setBalance(0);
      } else {
        const nextBalance = Number(response.data?.balance ?? 0);
        setBalance(Number.isFinite(nextBalance) ? nextBalance : 0);
      }
    } catch {
      if (!isMountedRef.current) return;
      setBalance(0);
    }
    
    if (isMountedRef.current) {
      setLoading(false);
    }
  };

  /**
   * 🔴 ONLY LOGIC CHANGE IS HERE
   * UI IS 100% UNTOUCHED
   */
  const handleSelectPlan = async (plan) => {
    // Skip if plan is not available (upcoming status)
    if (plan.status === 'upcoming' || plan.available === false) {
      return;
    }

    if (plan.price === "Custom") {
      window.location.href = '/contact';
      return;
    }

    if (!isMountedRef.current) return;

    setSelectedPlan(plan.id);
    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      const response = await API.post('/api/stripe/checkout', {
        planId: plan.id
      });

      if (!isMountedRef.current) return;

      if (response.error) {
        setError(response.error);
        setProcessing(false);
        setSelectedPlan(null);
      } else if (response.data?.url) {
        window.location.href = response.data.url; // Stripe redirect
      } else {
        setError('Unable to start checkout.');
        setProcessing(false);
        setSelectedPlan(null);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError('Failed to start checkout. Please try again.');
      setProcessing(false);
      setSelectedPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading pricing plans...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto p-6 lg:p-8">
        {/* Header with Balance */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
            Select the perfect plan for your calling needs
          </p>

          <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full shadow-lg">
            <span className="text-white font-medium mr-2">Current Balance:</span>
            <span className="text-2xl font-bold text-white">
              ${(Number.isFinite(balance) ? balance : 0).toFixed(2)}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-6 max-w-2xl mx-auto px-4 py-3 bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-400 rounded-xl text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 max-w-2xl mx-auto px-4 py-3 bg-green-100 dark:bg-green-500/20 border border-green-300 dark:border-green-500/50 text-green-700 dark:text-green-400 rounded-xl text-sm flex items-center">
            <CheckIcon />
            <span className="ml-2">{success}</span>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {(plans || []).map((plan) => (
            <div
              key={plan.id}
              className={`relative bg-white dark:bg-slate-800 rounded-2xl ${
                plan.popular
                  ? 'border-2 border-indigo-600 shadow-2xl md:scale-105'
                  : 'border border-gray-200 dark:border-slate-700 shadow-lg'
              } p-8 hover:shadow-2xl transition-all duration-300`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-semibold shadow-lg">
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{plan.name}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{plan.description}</p>

              <div className="mb-8">
                {plan.price === "Custom" ? (
                  <div className="text-4xl font-bold text-gray-900 dark:text-white">{plan.price}</div>
                ) : (
                  <div className="flex items-baseline">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-2">/month</span>
                  </div>
                )}
              </div>

              <ul className="space-y-4 mb-8">
                {(plan?.features || []).map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <CheckIcon />
                    <span className="ml-3 text-gray-700 dark:text-gray-300">{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.status === 'upcoming' || plan.available === false ? (
                <div className="text-center py-3 px-6 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 font-semibold cursor-not-allowed">
                  Coming Soon
                </div>
              ) : (
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={processing && selectedPlan === plan.id}
                  className={`block w-full py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                    plan.popular
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {processing && selectedPlan === plan.id ? 'Processing…' : plan.price === 'Custom' ? 'Contact Sales' : 'Get Started'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Billing;
