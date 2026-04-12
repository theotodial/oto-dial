import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { useMobileSidebar } from '../context/MobileSidebarContext';
import API from '../api';
import { getLocationFromAreaCode } from '../utils/areaCodeMapping';

// Copy notification component
function CopyNotification({ show, onClose }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-opacity duration-300">
      <div className="bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="font-medium">Copied to clipboard!</span>
      </div>
    </div>
  );
}

/* ================= ICONS (UNCHANGED) ================= */

const WalletIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

/* ================= DASHBOARD ================= */

function Dashboard() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const { subscription, usage, hydrated: subscriptionHydrated, refreshSubscription } = useSubscription();
  const { toggleSidebar, isOpen: sidebarOpen } = useMobileSidebar();

  const [balance, setBalance] = useState(0);
  const [numbers, setNumbers] = useState([]);
  const [packageDetails, setPackageDetails] = useState({
    remainingMinutes: 0,
    remainingSMS: 0,
    planName: 'No Plan',
    displayUnlimited: false
  });
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copyNotification, setCopyNotification] = useState(false);
  const [addonPlans, setAddonPlans] = useState([]);
  const [buyingAddonId, setBuyingAddonId] = useState(null);
  const [activationIssue, setActivationIssue] = useState(null);
  const [addonsDrawerOpen, setAddonsDrawerOpen] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!subscriptionHydrated) return;

    const hasRow =
      subscription &&
      (subscription.id != null ||
        subscription._id != null ||
        subscription.hasSubscription === true);

    if (!hasRow) {
      setPackageDetails({
        remainingMinutes: 0,
        remainingSMS: 0,
        planName: 'No Plan',
        displayUnlimited: false
      });
      return;
    }

    const isUnlimitedPlan =
      Boolean(subscription.isUnlimited || subscription.displayUnlimited);
    setPackageDetails({
      remainingMinutes: isUnlimitedPlan ? '∞' : (usage?.minutesRemaining ?? 0),
      remainingSMS: isUnlimitedPlan ? '∞' : (usage?.smsRemaining ?? 0),
      planName: subscription.planName || 'No Plan',
      displayUnlimited: isUnlimitedPlan
    });
  }, [subscription, usage, subscriptionHydrated]);

  /* ================= FETCH DASHBOARD ================= */

  const fetchData = async () => {
    if (!isMountedRef.current) return;
    setExtrasLoading(true);
    setError('');
    setSuccess('');
    try {

    const [walletRes, numbersRes, addonsRes] = await Promise.all([
      API.get('/api/wallet'),
      API.get('/api/numbers'),
      API.get('/api/subscription/addons').catch(() => ({ error: true }))
    ]);

    // Wallet - handle gracefully, don't block render
    if (walletRes.error) {
      console.warn('Failed to load wallet:', walletRes.error);
      setBalance(0);
    } else {
      setBalance(walletRes.data?.balance ?? 0);
    }

    // Numbers - handle gracefully, don't block render
    if (numbersRes.error) {
      console.warn('Failed to load numbers:', numbersRes.error);
      setNumbers([]);
    } else {
      setNumbers(numbersRes.data?.numbers || numbersRes.data || []);
    }

    // Add-ons - handle gracefully
    if (!addonsRes.error && addonsRes.data?.success && addonsRes.data?.addons) {
      setAddonPlans(addonsRes.data.addons.map(addon => ({
        _id: addon._id,
        name: addon.name,
        type: addon.type,
        price: addon.price.toFixed(2),
        quantity: addon.quantity
      })));
    } else {
      setAddonPlans([]);
    }

    setActivationIssue(null);
    } finally {
      if (isMountedRef.current) setExtrasLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    const verified = new URLSearchParams(window.location.search).get("verified");

    const run = () => {
      (async () => {
        await fetchData();
        if (!isMountedRef.current) return;
        if (verified === "1") {
          setSuccess("Email verified successfully.");
          await refreshUser();
          await refreshSubscription();
        } else if (verified === "0") {
          setError(
            "Email verification failed or the link expired. Try resending verification from the banner on your account."
          );
        }
        if (verified === "1" || verified === "0") {
          navigate("/dashboard", { replace: true });
        }
      })();
    };

    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(run, { timeout: 600 })
        : null;
    const tmo = typeof requestIdleCallback === "undefined" ? setTimeout(run, 0) : null;

    return () => {
      if (idleId !== null && typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(idleId);
      }
      if (tmo) clearTimeout(tmo);
      isMountedRef.current = false;
    };
  }, [navigate, refreshUser, refreshSubscription]);

  /* ================= ACTIONS ================= */

  const handleChoosePlan = () => {
    navigate('/billing');
  };

  const handleBuyNumber = () => {
    navigate('/buy-number');
  };

  const handleBuyAddon = async (addon) => {
    if (!addon || !addon._id) return;
    
    if (packageDetails.planName === 'No Plan') {
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

  return (
    <div className="h-full overflow-auto px-4 py-3 max-w-7xl mx-auto">
      {/* Header section - Desktop */}
      <div className="mb-6 hidden lg:block">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
            <p className="text-base md:text-lg text-gray-500 dark:text-gray-400 mt-2">
              Welcome back! Here is an overview of your account.
            </p>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center space-x-3 px-4 py-2 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors shadow-sm"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {user?.email?.split('@')[0] || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">View Profile</p>
            </div>
          </button>
        </div>
      </div>
      
      {/* Mobile header — menu + title (profile is in sidebar) */}
      <div className="mb-6 lg:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700"
          aria-expanded={sidebarOpen}
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
        <h1 className="flex-1 min-w-0 text-xl font-bold text-gray-900 dark:text-white tracking-tight text-center truncate px-1">
          Dashboard
        </h1>
      </div>

      {actionLoading && (
        <div className="mb-6 px-4 py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl text-sm">
          Processing...
        </div>
      )}

      {success && (
        <div className="mb-6 px-4 py-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* PACKAGE CARD */}
      <div className={`grid grid-cols-1 ${(numbers || []).length === 0 ? 'md:grid-cols-2' : ''} gap-6 mb-8`}>
        <button
          onClick={() => navigate('/subscription-details')}
          className="bg-gradient-to-br from-teal-500 via-green-500 to-emerald-500 dark:from-teal-600 dark:via-green-600 dark:to-emerald-600 rounded-2xl p-6 text-white shadow-lg hover:shadow-xl transition-all cursor-pointer text-left"
        >
          <p className="text-sm opacity-90 mb-2">{packageDetails.planName}</p>
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-90">Remaining Minutes</span>
              <span className="text-2xl font-bold">
                {packageDetails.displayUnlimited
                  ? '∞'
                  : parseFloat(packageDetails?.remainingMinutes || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-90">Remaining SMS</span>
              <span className="text-2xl font-bold">
                {packageDetails.displayUnlimited
                  ? '∞'
                  : (packageDetails?.remainingSMS || 0).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
            <span className="text-xs opacity-75">View Details →</span>
          </div>
          {/* Only show Choose Plan button if no active subscription */}
          {packageDetails.planName === 'No Plan' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleChoosePlan();
              }} 
              className="w-full mt-4 py-3 bg-white/20 hover:bg-white/30 rounded-xl font-medium transition-colors"
            >
              Choose Your Plan
            </button>
          )}
        </button>

        {/* Only show Active Numbers section if user has no numbers yet (max 1 number) */}
        {(numbers || []).length === 0 && (
        <div className="bg-white dark:bg-slate-700 rounded-2xl p-6 shadow-sm">
            <p className="text-sm text-gray-600 dark:text-gray-400">Active Numbers</p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{(numbers || []).length}</p>
            <button onClick={handleBuyNumber} disabled={actionLoading} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {actionLoading ? 'Processing...' : 'Buy Number'}
          </button>
        </div>
        )}
      </div>

      {activationIssue && (
        <div className="mb-8">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5">
            <p className="text-amber-900 dark:text-amber-100 font-semibold mb-1">
              Payment completed but subscription not active? Contact support.
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
              We detected a recent paid invoice{activationIssue?.recentPaidInvoice?.invoiceId ? ` (${activationIssue.recentPaidInvoice.invoiceId})` : ''} but your plan is not active yet.
            </p>
            <button
              onClick={() => navigate('/support?subject=subscription_not_activated')}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              Report Subscription Issue
            </button>
          </div>
        </div>
      )}

      {/* Add-ons — compact trigger + slide-over drawer */}
      {packageDetails.planName !== 'No Plan' && addonPlans.length > 0 && (
        <div className="mb-8">
          {addonsDrawerOpen && (
            <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true" aria-labelledby="addons-drawer-title">
              <button
                type="button"
                className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
                aria-label="Close add-ons"
                onClick={() => setAddonsDrawerOpen(false)}
              />
              <div className="relative w-full max-w-md h-full max-h-[100dvh] sm:max-h-screen bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-slate-700 animate-[slideIn_0.2s_ease-out]">
                <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
                <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-slate-700">
                  <h2 id="addons-drawer-title" className="text-lg font-semibold text-gray-900 dark:text-white pr-2">
                    Add-ons
                  </h2>
                  <button
                    type="button"
                    onClick={() => setAddonsDrawerOpen(false)}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-300"
                    aria-label="Close"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Each add-on is active for 30 days from purchase.
                  </p>
                  {addonPlans.map((addon) => (
                    <button
                      key={addon._id}
                      type="button"
                      onClick={() => handleBuyAddon(addon)}
                      disabled={buyingAddonId === addon._id}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-900 dark:text-emerald-100 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-left"
                    >
                      <span>
                        <span className="font-semibold block">
                          {addon.type === 'minutes'
                            ? `${addon.quantity.toLocaleString()} extra minutes`
                            : `${addon.quantity.toLocaleString()} extra SMS`}
                        </span>
                        <span className="text-xs opacity-80">30 days after purchase</span>
                      </span>
                      <span className="ml-3 whitespace-nowrap font-bold">
                        {buyingAddonId === addon._id ? '…' : `$${addon.price}`}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setAddonsDrawerOpen(false);
                      navigate('/billing');
                    }}
                    className="w-full mt-2 px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 text-sm font-medium transition-colors"
                  >
                    View all plans in Billing →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* NUMBERS LIST */}
      <div className="bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-600">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-600">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Phone Numbers</h2>
        </div>

        {extrasLoading && (numbers || []).length === 0 ? (
          <div className="p-8 space-y-4 animate-pulse" aria-hidden>
            <div className="h-4 bg-gray-200 dark:bg-slate-600 rounded w-2/3" />
            <div className="h-12 bg-gray-100 dark:bg-slate-600/80 rounded-xl" />
            <div className="h-12 bg-gray-100 dark:bg-slate-600/80 rounded-xl" />
          </div>
        ) : (numbers || []).length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">No numbers purchased yet</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-600">
            {(numbers || []).map((n) => (
              <div key={n._id || n.id} className="px-6 py-5 hover:bg-gray-50 dark:hover:bg-slate-600/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Number and Status */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white">
                      <PhoneIcon />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-gray-900 dark:text-white block">{n.number || n.phoneNumber}</span>
                        <button
                          onClick={async (e) => {
                            const numberToCopy = n.number || n.phoneNumber;
                            try {
                              await navigator.clipboard.writeText(numberToCopy);
                              setCopyNotification(true);
                            } catch (err) {
                              console.error('Failed to copy:', err);
                              setError('Failed to copy to clipboard');
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-600 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                          title="Copy to clipboard"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400 mt-1">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5"></span>
                        Active
                      </span>
                    </div>
                  </div>
                  
                  {/* Number Details */}
                  {(() => {
                    const phoneNumber = n.number || n.phoneNumber;
                    const areaCodeLocation = getLocationFromAreaCode(phoneNumber);
                    
                    // Priority: Telnyx data > Area code mapping > Defaults
                    const country = n.country || 
                                   (n.regionInformation?.country_name || n.regionInformation?.country) || 
                                   (areaCodeLocation ? 'United States' : 'United States');
                    
                    const state = n.state || 
                                 (n.regionInformation?.region_name || n.regionInformation?.state || n.regionInformation?.region) ||
                                 (areaCodeLocation?.state || null);
                    
                    const city = n.city || 
                                (n.regionInformation?.locality || n.regionInformation?.city) ||
                                (areaCodeLocation?.city || null);
                    
                    // Priority: purchaseDate (when number was assigned) > createdAt (when record was created)
                    const activatedDate = n.purchaseDate || n.createdAt || n.created_at;
                    
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                          <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Country</p>
                          <p className="text-gray-900 dark:text-white font-medium">{country}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                          <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">State</p>
                          <p className="text-gray-900 dark:text-white font-medium">{state || 'Unknown'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                          <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">City</p>
                          <p className="text-gray-900 dark:text-white font-medium">{city || 'Unknown'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                          <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Activated</p>
                          <p className="text-gray-900 dark:text-white font-medium">
                            {activatedDate
                              ? new Date(activatedDate).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric' 
                                })
                              : 'Unknown'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Billing overview + add-ons shortcut (below numbers) */}
      <div className="mt-6 mb-8">
        <div className="bg-white dark:bg-slate-700 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-600 flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Billing &amp; usage
              </p>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                Manage your subscription
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/billing')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
            >
              Open billing
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-4">
            <p className="flex items-center justify-between">
              <span>Current plan</span>
              <span className="font-semibold">
                {packageDetails.planName || 'No Plan'}
              </span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              View plan limits and change your subscription from the Billing page.
            </p>
          </div>
          {packageDetails.planName !== 'No Plan' && addonPlans.length > 0 && (
            <button
              type="button"
              onClick={() => setAddonsDrawerOpen(true)}
              className="mb-3 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-800 border border-dashed border-gray-300 dark:border-slate-600 text-left hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Need more minutes or SMS?
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  Open add-ons — top up anytime. 30-day add-on window after purchase.
                </p>
              </div>
              <span className="flex-shrink-0 text-indigo-600 dark:text-indigo-400 font-medium text-xs">
                Shop add-ons →
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/billing')}
            className="mt-auto inline-flex items-center justify-center w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            Open Billing
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Copy Notification */}
      <CopyNotification show={copyNotification} onClose={() => setCopyNotification(false)} />
    </div>
  );
}

export default Dashboard;
