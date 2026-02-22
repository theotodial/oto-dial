import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';
import { trackSubscription } from '../utils/analytics';

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
  const [plans, setPlans] = useState([]);
  const [addonPlans, setAddonPlans] = useState([]);
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [buyingAddonId, setBuyingAddonId] = useState(null);

  const isMountedRef = useRef(true);
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    isMountedRef.current = true;
    fetchBalance();
    fetchPlans();
    fetchAddonPlans();
    fetchCurrentSubscription();
    
    // Check for successful checkout
    const successParam = searchParams.get('success');
    if (successParam && user?.id) {
      // Wait a bit for subscription to be created, then track
      setTimeout(async () => {
        try {
          const subResponse = await API.get('/api/subscription/current');
          if (subResponse.data?.subscription?._id) {
            await trackSubscription(user.id, subResponse.data.subscription._id);
          }
        } catch (err) {
          console.warn('Could not track subscription:', err);
        }
      }, 2000);
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, [searchParams, user]);

  const fetchPlans = async () => {
    if (!isMountedRef.current) return;
    
    try {
      const response = await API.get('/api/subscription/plans');
      
      if (!isMountedRef.current) return;
      
      if (response.data?.success && response.data?.plans) {
        // Transform plans for display
        const normalizedPlans = response.data.plans.map((plan) => {
          const isUnlimitedPlan =
            Boolean(plan.displayUnlimited) ||
            String(plan.planType || '').toLowerCase() === 'unlimited' ||
            String(plan.name || '').toLowerCase().includes('unlimited');

          return {
          _id: plan._id,
          name: plan.name,
          price: plan.price.toFixed(2),
          description: isUnlimitedPlan
            ? "Built for high-volume teams"
            : plan.name === "Basic Plan" 
              ? "Perfect for individuals and small teams"
              : "For growing businesses and power users",
          features: isUnlimitedPlan
            ? [
                "1 Dedicated Number",
                "Unlimited SMS*",
                "Unlimited Minutes*",
                "Email Support"
              ]
            : [
                `${plan.limits.numbersTotal} Local Phone Number${plan.limits.numbersTotal > 1 ? 's' : ''}`,
                `${plan.limits.minutesTotal.toLocaleString()} Voice Minutes`,
                `${plan.limits.smsTotal} SMS`,
                "Email Support"
              ],
          displayUnlimited: isUnlimitedPlan,
          fairUsageNote: isUnlimitedPlan ? "*Fair usage policy applies." : null,
          popular: plan.name === "Basic Plan",
          available: true
          };
        });
        
        setPlans(normalizedPlans);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
      // Fallback to default plans if API fails
      setPlans([
        {
          _id: 'basic',
          name: "Basic Plan",
          price: "19.99",
          description: "Perfect for individuals and small teams",
          features: [
            "1 Local Phone Number",
            "1,500 Voice Minutes",
            "100 SMS",
            "Email Support"
          ],
          popular: true,
          available: true
        },
        {
          _id: 'super',
          name: "Super Plan",
          price: "29.99",
          description: "For growing businesses and power users",
          features: [
            "1 Local Phone Number",
            "2,500 Voice Minutes",
            "200 SMS",
            "Email Support"
          ],
          popular: false,
          available: true
        },
        {
          _id: 'unlimited',
          name: "Unlimited",
          price: "119.99",
          description: "Built for high-volume teams",
          features: [
            "1 Dedicated Number",
            "Unlimited SMS*",
            "Unlimited Minutes*",
            "Email Support"
          ],
          displayUnlimited: true,
          fairUsageNote: "*Fair usage policy applies.",
          popular: false,
          available: true
        }
      ]);
    }
  };

  const fetchAddonPlans = async () => {
    if (!isMountedRef.current) return;

    try {
      const response = await API.get('/api/subscription/addons');

      if (!isMountedRef.current) return;

      if (response.data?.success && response.data?.addons) {
        const transformed = response.data.addons.map((addon) => ({
          _id: addon._id,
          name: addon.name,
          type: addon.type,
          price: addon.price.toFixed(2),
          quantity: addon.quantity,
        }));
        setAddonPlans(transformed);
      }
    } catch (err) {
      console.error('Failed to fetch add-ons:', err);
      // Non-fatal – just hide add-ons section if it fails
    }
  };

  const fetchCurrentSubscription = async () => {
    if (!isMountedRef.current) return;
    
    try {
      const response = await API.get('/api/subscription');
      
      if (!isMountedRef.current) return;
      
      if (response.data && response.data.planName !== "No Plan") {
        setCurrentSubscription(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch current subscription:', err);
    }
  };

  const fetchBalance = async () => {
    if (!isMountedRef.current) return;
    
    setError('');
    try {
      const response = await API.get('/api/wallet');
      
      if (!isMountedRef.current) return;
      
      setBalance(response?.data?.balance ?? 0);
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
    // Skip if plan is not available
    if (plan.available === false) {
      return;
    }

    if (!isMountedRef.current) return;

    // Use MongoDB planId (_id) instead of plan.id
    const planId = plan._id || plan.id;
    
    if (!planId) {
      setError('Invalid plan selected. Please try again.');
      return;
    }

    setSelectedPlan(planId);
    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      const response = await API.post('/api/stripe/checkout', {
        planId: planId // Send MongoDB planId
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
      const errorMsg = err?.response?.data?.error || err?.message || 'Failed to start checkout. Please try again.';
      setError(errorMsg);
      setProcessing(false);
      setSelectedPlan(null);
    }
  };

  const handleBuyAddon = async (addon) => {
    if (!addon || !addon._id) return;
    if (!currentSubscription) {
      setError('You need an active subscription before purchasing add-ons.');
      return;
    }

    if (!isMountedRef.current) return;

    setBuyingAddonId(addon._id);
    setError('');
    setSuccess('');

    try {
      const response = await API.post('/api/stripe/checkout/addon', {
        addonId: addon._id,
      });

      if (!isMountedRef.current) return;

      if (response.error) {
        setError(response.error);
        setBuyingAddonId(null);
      } else if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        setError('Unable to start add-on checkout.');
        setBuyingAddonId(null);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const errorMsg =
        err?.response?.data?.error ||
        err?.message ||
        'Failed to start add-on checkout. Please try again.';
      setError(errorMsg);
      setBuyingAddonId(null);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading billing...</p>
        </div>
      </div>
    );
  }

  const effectivePlans = plans || [];
  const defaultSelectedId =
    selectedPlan ||
    effectivePlans.find((p) => p.name === "Basic Plan")?._id ||
    effectivePlans[0]?._id ||
    null;
  const activePlan =
    effectivePlans.find((p) => p._id === defaultSelectedId) || effectivePlans[0] || null;

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-16 sm:pt-6">
        {/* Header - Mobile Optimized */}
        <div className="flex flex-col gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              Select your subscription
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Choose the plan that fits your team's calling volume. Your card is charged monthly and
              managed securely by Stripe.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-emerald-600 text-white shadow text-sm sm:text-base">
              <span className="font-medium mr-2">Wallet balance</span>
              <span className="font-semibold">
                ${balance !== null ? balance.toFixed(2) : "0.00"}
              </span>
            </div>
            {currentSubscription && (
              (() => {
                const isUnlimitedCurrent =
                  Boolean(currentSubscription.displayUnlimited) ||
                  String(currentSubscription.planType || '').toLowerCase() === 'unlimited' ||
                  String(currentSubscription.planName || '').toLowerCase().includes('unlimited');
                return (
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Current plan: {currentSubscription.planName}
                </span>
                <span className="block mt-0.5">
                        {isUnlimitedCurrent
                          ? "∞ minutes • ∞ SMS remaining"
                          : `${currentSubscription.minutesRemaining?.toFixed(1) || 0} minutes • ${currentSubscription.smsRemaining || 0} SMS remaining`}
                </span>
              </div>
                );
              })()
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 max-w-3xl mx-auto px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 rounded-xl text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 max-w-3xl mx-auto px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm flex items-center">
            <CheckIcon />
            <span className="ml-2">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)] gap-4 sm:gap-6 items-start">
          {/* Main billing card */}
          <div className="bg-slate-900 text-slate-50 rounded-2xl shadow-xl border border-slate-800 overflow-hidden">
            <div className="px-6 sm:px-8 py-5 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                    ●
                  </span>
                  Select your plan
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Two simple plans. No setup fees, no long-term contracts.
                </p>
              </div>
            </div>

            <div className="px-6 sm:px-8 py-6 space-y-6">
              {/* Plan dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 tracking-wide mb-2">
                  PLAN
                </label>
                <div className="relative">
                  <select
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 text-slate-50 text-sm py-3 pl-3 pr-9 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none"
                    value={defaultSelectedId || ""}
                    onChange={(e) => setSelectedPlan(e.target.value)}
                  >
                    {effectivePlans.map((plan) => (
                      <option key={plan._id} value={plan._id}>
                        {plan.name} — ${plan.price}/month
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                    ▾
                  </span>
                </div>
              </div>

              {/* Selected plan summary */}
              {activePlan && (
                <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-50">{activePlan.name}</p>
                      {activePlan.popular && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 uppercase tracking-wide">
                          Most Popular
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{activePlan.description}</p>
                    <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                      {(activePlan.features || []).map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="inline-flex w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-400 items-center justify-center text-[10px]">
                            ✓
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {activePlan.fairUsageNote && (
                      <p className="mt-3 text-[11px] text-slate-400">
                        {activePlan.fairUsageNote}
                      </p>
                    )}
                  </div>
                  <div className="text-right sm:text-center sm:pr-2">
                    <div className="text-3xl font-bold text-slate-50">
                      ${activePlan.price}
                      <span className="ml-1 text-xs font-normal text-slate-400">/month</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Billed monthly. Cancel anytime.
                    </p>
                  </div>
                </div>
              )}

              {/* Billing preferences */}
              <div className="space-y-3">
                <label className="flex items-start gap-3 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                    checked
                    readOnly
                  />
                  <span>
                    <span className="font-semibold">Save card for automatic renewals</span>
                    <span className="block text-slate-400 mt-0.5">
                      Your card details are stored securely by Stripe so your subscription renews
                      without interruptions.
                    </span>
                  </span>
                </label>

                <p className="text-[11px] text-slate-500">
                  By continuing, you authorize OTO Dial to charge this card every month until you
                  cancel. You can cancel anytime from your billing settings.
                </p>
              </div>

              {/* Primary action */}
              <button
                type="button"
                onClick={() => activePlan && handleSelectPlan(activePlan)}
                disabled={!activePlan || processing}
                className="mt-2 w-full inline-flex justify-center items-center px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm shadow-lg shadow-emerald-500/30 transition-colors"
              >
                {processing ? "Processing…" : "Secure Checkout"}
              </button>

              <p className="mt-3 text-[11px] text-slate-500 text-center">
                Payments are processed securely by Stripe. OTO Dial never stores your full card
                number.
              </p>
            </div>
          </div>

          {/* Right-hand benefits column */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Why teams choose OTO Dial
              </h3>
              <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  <span>
                    <span className="font-medium">Predictable monthly pricing.</span>{" "}
                    No per-minute surprises—know exactly how many minutes and SMS you get.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  <span>
                    <span className="font-medium">No lock-in.</span> Cancel anytime; your access
                    remains active until the end of the billing period.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-1 h-5 w-5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  <span>
                    <span className="font-medium">Bank‑grade security.</span> Card details are
                    encrypted and handled by Stripe only.
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl border border-emerald-100 dark:border-emerald-800 p-5 text-sm text-emerald-900 dark:text-emerald-100">
              <p className="font-semibold mb-1">Need more minutes or SMS?</p>
              <p className="text-xs opacity-80 mb-3">
                When you hit your monthly limits, you can top up with add-ons. Each add-on lasts 30
                days from purchase and is applied on top of your current subscription.
              </p>

              {addonPlans.length > 0 && currentSubscription && (
                <div className="space-y-2">
                  {addonPlans.map((addon) => (
                    <button
                      key={addon._id}
                      type="button"
                      onClick={() => handleBuyAddon(addon)}
                      disabled={buyingAddonId === addon._id}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-900 dark:text-emerald-50 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span>
                        {addon.type === 'minutes'
                          ? `${addon.quantity.toLocaleString()} extra minutes`
                          : `${addon.quantity.toLocaleString()} extra SMS`}
                        <span className="block text-[10px] text-emerald-800/80 dark:text-emerald-100/80">
                          Expires 30 days after purchase
                        </span>
                      </span>
                      <span className="ml-3 whitespace-nowrap">
                        {buyingAddonId === addon._id ? 'Processing…' : `$${addon.price}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {!currentSubscription && (
                <p className="mt-2 text-[11px] opacity-80">
                  Activate a subscription above to unlock add-ons for extra minutes and SMS.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Billing;
