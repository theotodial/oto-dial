import { useState, useEffect } from 'react';
import API from '../api';
import { supabase } from '../lib/supabase';

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

function Billing() {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const plans = [
    {
      id: 'starter',
      name: "Starter",
      price: "19",
      description: "Perfect for individuals and small teams",
      features: [
        "1 Local Phone Number",
        "5000 Minutes/Month",
        "Email Support"
      ],
      popular: false
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
      popular: true
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

  // Get auth headers helper
  const getAuthHeaders = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      throw new Error('Not authenticated');
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
    };
  };

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      setError('');
      const headers = await getAuthHeaders();
      const response = await API.get('/api/wallet', { headers });
      // Handle standardized API response
      setBalance(response.data.balance !== undefined ? response.data.balance : 0);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.detail ||
                          err.message ||
                          'Failed to fetch wallet balance';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (plan) => {
    if (plan.price === "Custom") {
      // Redirect to contact page for enterprise
      window.location.href = '/contact';
      return;
    }

    setSelectedPlan(plan.id);
    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      const headers = await getAuthHeaders();
      const amount = parseInt(plan.price);
      
      await API.post('/api/wallet/topup', 
        { amount: amount },
        { headers }
      );

      setSuccess(`Successfully subscribed to ${plan.name} plan! $${amount} has been added to your wallet.`);
      await fetchBalance();
      setTimeout(() => {
        setSuccess('');
        setSelectedPlan(null);
      }, 5000);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.detail ||
                          err.message ||
                          'Failed to process payment';
      setError(errorMessage);
      setSelectedPlan(null);
    } finally {
      setProcessing(false);
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

  // Error state for balance fetch failure
  if (error && balance === null) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Unable to Load Billing Information
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {error}
          </p>
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              fetchBalance();
            }}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
          >
            Try Again
          </button>
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
          
          {/* Current Balance */}
          <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full shadow-lg">
            <span className="text-white font-medium mr-2">Current Balance:</span>
            <span className="text-2xl font-bold text-white">
              ${balance !== null ? balance.toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

        {/* Alerts */}
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

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plans.map((plan) => (
            <div
              key={plan.id}
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
                {plan.price === "Custom" ? (
                  <div className="text-4xl font-bold text-gray-900 dark:text-white">{plan.price}</div>
                ) : (
                  <div className="flex items-baseline">
                    <span className="text-5xl font-bold text-gray-900 dark:text-white">${plan.price}</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-2">/month</span>
                  </div>
                )}
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
              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={processing && selectedPlan === plan.id}
                className={`block w-full text-center py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                  plan.popular
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed'
                    : 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {processing && selectedPlan === plan.id ? (
                  <span className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                    Processing...
                  </span>
                ) : plan.price === "Custom" ? (
                  'Contact Sales'
                ) : (
                  'Get Started'
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-slate-700">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Flexible & Transparent Pricing
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              All plans include our core features with no hidden fees. Credits are added to your wallet and can be used for international calls at competitive rates. No contracts, cancel anytime.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center">
                <CheckIcon />
                <span className="ml-2">No Setup Fees</span>
              </div>
              <div className="flex items-center">
                <CheckIcon />
                <span className="ml-2">Cancel Anytime</span>
              </div>
              <div className="flex items-center">
                <CheckIcon />
                <span className="ml-2">24/7 Support</span>
              </div>
              <div className="flex items-center">
                <CheckIcon />
                <span className="ml-2">Money-Back Guarantee</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Billing;

