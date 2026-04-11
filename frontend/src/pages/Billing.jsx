import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import API from '../api';
import { trackSubscription } from '../utils/analytics';

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

function Billing() {
  const navigate = useNavigate();
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
  const [showPaymentIssueCta, setShowPaymentIssueCta] = useState(false);

  const isMountedRef = useRef(true);
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated } = useAuth();
  const { subscription, refreshSubscription } = useSubscription();

  useEffect(() => {
    setCurrentSubscription(subscription);
  }, [subscription]);

  useEffect(() => {
    isMountedRef.current = true;
    let pollTimeoutId = null;
    let cancelled = false;

    fetchBalance();
    fetchPlans();
    fetchAddonPlans();
    
    // Check for successful checkout and poll for backend activation.
    // Stripe webhooks can arrive a few seconds after redirect.
    const successParam = searchParams.get('success');
    if (successParam) {
      const isAddonCheckout = successParam === 'addon';
      const maxAttempts = 15;
      let attempts = 0;

      setSuccess(
        isAddonCheckout
          ? 'Payment confirmed. Applying your add-on now...'
          : 'Payment confirmed. Activating your subscription now...'
      );

      const pollSubscriptionStatus = async () => {
        if (!isMountedRef.current || cancelled) return;
        attempts += 1;

        const subData = await refreshSubscription();
        if (!isMountedRef.current || cancelled) return;

        const hasActivePlan =
          subData && subData.planName !== "No Plan";

        if (hasActivePlan) {
          setCurrentSubscription(subData);
          setSuccess(
            isAddonCheckout
              ? 'Add-on purchase successful. Your account is updated.'
              : 'Subscription activated successfully.'
          );

          if (!isAddonCheckout && user?.id && subData?.subscription?._id) {
            try {
              await trackSubscription(user.id, subData.subscription._id);
            } catch (err) {
              console.warn('Could not track subscription:', err);
            }
          }
          return;
        }

        if (attempts < maxAttempts) {
          pollTimeoutId = setTimeout(pollSubscriptionStatus, 2000);
          return;
        }

        if (!isAddonCheckout) {
          setError('Payment succeeded, but account activation is still processing. Please refresh in a few seconds.');
          setShowPaymentIssueCta(true);
        }
      };

      pollTimeoutId = setTimeout(pollSubscriptionStatus, 1500);
    }
    
    return () => {
      cancelled = true;
      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
      isMountedRef.current = false;
    };
  }, [searchParams, user, isAuthenticated, refreshSubscription]);

  const fetchPlans = async () => {
    if (!isMountedRef.current) return;
    
    try {
      const response = await API.get('/api/subscription/plans');
      if (!isMountedRef.current) return;

      // If API is unavailable or unauthenticated, fall back to local plans
      if (response.error || !response.data?.success || !Array.isArray(response.data?.plans)) {
        throw new Error(response.error || 'Failed to load plans');
      }

      if (response.data?.success && response.data?.plans) {
        // Transform plans for display
        let transformedPlans = response.data.plans.map(plan => {
          const priceString = plan.price.toFixed(2);
          const isUnlimited =
            priceString === "39.99" ||
            /unlimited/i.test(plan.name || "") ||
            /unlimited/i.test(plan?.description || "");

          return {
            _id: plan._id,
            name: plan.name,
            price: priceString,
            description: isUnlimited
              ? "Unlimited outbound calling for power users"
              : plan.name === "Basic Plan"
                ? "Perfect for individuals and small teams"
                : "For growing businesses and power users",
            features: [
              "Free Virtual Number",
              `${plan.limits.minutesTotal.toLocaleString()} Voice Minutes`,
              `${plan.limits.smsTotal} SMS`,
              "Email Support"
            ],
            // Highlight the unlimited plan as the primary choice
            popular: isUnlimited,
            available: true
          };
        });

        // Hide legacy high-priced plans (e.g. $119.99) from the selector
        transformedPlans = transformedPlans.filter((p) => p.price !== "119.99");

        // Sort so the unlimited plan is shown first when present
        transformedPlans.sort((a, b) => {
          if (a.popular && !b.popular) return -1;
          if (!a.popular && b.popular) return 1;
          return parseFloat(a.price) - parseFloat(b.price);
        });

        setPlans(transformedPlans);
      }
    } catch (err) {
      console.error('Failed to fetch plans:', err);
      // Fallback to default plans if API fails or user is not authenticated
      setPlans([
        {
          _id: 'unlimited',
          name: "Unlimited Call Plan",
          price: "39.99",
          description: "Unlimited outbound calling for heavy callers and sales teams",
          features: [
            "Free Virtual Number",
            "Unlimited Voice Minutes*",
            "Fair-use policy for real callers",
            "Priority Support"
          ],
          popular: true,
          available: true
        },
        {
          _id: 'basic',
          name: "Basic Plan",
          price: "19.99",
          description: "Perfect for individuals and small teams",
          features: [
            "Free Virtual Number",
            "1,500 Voice Minutes",
            "100 SMS",
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

      if (response.error || !response.data?.success || !Array.isArray(response.data?.addons)) {
        setAddonPlans([]);
        return;
      }

      const transformed = response.data.addons.map((addon) => ({
        _id: addon._id,
        name: addon.name,
        type: addon.type,
        price: Number(addon.price).toFixed(2),
        quantity: addon.quantity,
      }));
      setAddonPlans(transformed);
    } catch (err) {
      console.error('Failed to fetch add-ons:', err);
      setAddonPlans([]);
    }
  };

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
    // Require authentication before starting checkout.
    // If user is not logged in, send them to login and then back to billing.
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/billing' } } });
      return;
    }
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
    if (!isAuthenticated) {
      navigate('/login', { state: { from: { pathname: '/billing' } } });
      return;
    }
    const hasActive =
      currentSubscription?.planName && currentSubscription.planName !== 'No Plan';
    if (!hasActive) {
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

  const hasActiveSubscription =
    !!currentSubscription?.planName && currentSubscription.planName !== 'No Plan';

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-6 pb-8">
        {/* Mobile header with inlined back button (merged into Billing DOM) */}
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Billing
            </p>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">
              Select your subscription
            </h1>
          </div>
        </div>

        {/* Header - Desktop / larger screens */}
        <div className="hidden lg:flex flex-col gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              Select your subscription
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl">
              Choose the plan that fits your team's calling volume. Your card is charged monthly and
              managed securely by Stripe.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

        {showPaymentIssueCta && !currentSubscription && (
          <div className="mb-4 max-w-3xl mx-auto px-4 py-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
            <p className="text-amber-800 dark:text-amber-200 font-medium mb-2">
              Payment completed but subscription not active?
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
              If you were just charged but don&apos;t see your plan below, we can fix it. Contact
              support and we&apos;ll activate your subscription.
            </p>
            <a
              href="/support?subject=Subscription%20not%20activated"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm"
            >
              Report Subscription Issue
            </a>
          </div>
        )}

        {/* New billing layout */}
        <div className="space-y-8">
          {/* Plan selector (dropdown) */}
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-4 sm:p-6 lg:p-7 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                  Choose your plan
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  All plans include a free virtual number and secure Stripe billing.
                </p>
              </div>
              {activePlan && (
                <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-200 text-xs sm:text-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                  Selected: {activePlan.name}
                </div>
              )}
            </div>

            {/* Dropdown selector + active plan summary */}
            <div className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)] items-start">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-wide mb-2">
                    Plan
                  </label>
                  <div className="relative">
                    <select
                      className="w-full rounded-xl bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-slate-50 text-sm py-3 pl-3 pr-9 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 appearance-none"
                      value={defaultSelectedId || ''}
                      onChange={(e) => setSelectedPlan(e.target.value)}
                    >
                      {effectivePlans.map((plan) => (
                        <option key={plan._id} value={plan._id}>
                          {plan.name} — ${plan.price}/month
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-slate-400">
                      ▾
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => activePlan && handleSelectPlan(activePlan)}
                  disabled={!activePlan || processing}
                  className="w-full inline-flex justify-center items-center px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition-colors"
                >
                  {processing ? 'Processing…' : 'Continue to secure checkout'}
                </button>
              </div>

              {activePlan && (
                <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/60 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {activePlan.name}
                        {activePlan.popular && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-200">
                            Unlimited calling
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                        {activePlan.description}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-gray-900 dark:text-white">
                        ${activePlan.price}
                        <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">
                          /month
                        </span>
                      </div>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                    {(activePlan.features || []).map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="mt-[3px] h-3 w-3 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-[9px]">
                          ✓
                        </span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Summary + add-ons */}
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.2fr)] items-start">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Billing details
              </h3>
              {activePlan ? (
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>Plan</span>
                    <span className="font-medium">{activePlan.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Price</span>
                    <span className="font-medium">${activePlan.price}/month</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      By continuing, you authorize OTO Dial to charge this card every month until you
                      cancel. You can cancel anytime from your billing settings. Card data is handled
                      securely by Stripe.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Choose a plan above to see billing details.
                </p>
              )}
              <button
                type="button"
                onClick={() => activePlan && handleSelectPlan(activePlan)}
                disabled={!activePlan || processing}
                className="mt-5 w-full inline-flex justify-center items-center px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition-colors"
              >
                {processing ? 'Processing…' : 'Continue to secure checkout'}
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  Why teams choose OTO Dial
                </h3>
                <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex gap-3">
                    <span className="mt-1 h-5 w-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                    <span>
                      <span className="font-medium">Predictable monthly pricing.</span> No
                      per-minute surprises—know exactly how many minutes and SMS you get.
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

                {addonPlans.length > 0 && (
                  <div className="space-y-2">
                    {addonPlans.map((addon) => (
                      <button
                        key={addon._id}
                        type="button"
                        onClick={() => handleBuyAddon(addon)}
                        disabled={
                          buyingAddonId === addon._id ||
                          (isAuthenticated && !hasActiveSubscription)
                        }
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

                {addonPlans.length === 0 && (
                  <p className="mt-1 text-[11px] opacity-80">
                    Add-on packs will appear here when available.
                  </p>
                )}

                {addonPlans.length > 0 && !isAuthenticated && (
                  <p className="mt-2 text-[11px] opacity-80">
                    Sign in to purchase add-ons.
                  </p>
                )}

                {addonPlans.length > 0 && isAuthenticated && !hasActiveSubscription && (
                  <p className="mt-2 text-[11px] opacity-80">
                    Activate a subscription above to purchase add-ons for extra minutes and SMS.
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Billing;
