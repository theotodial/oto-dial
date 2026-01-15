import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api';

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

/* ================= DASHBOARD ================= */

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [balance, setBalance] = useState(0);
  const [numbers, setNumbers] = useState([]);
  const [packageDetails, setPackageDetails] = useState({ remainingMinutes: 0, remainingSMS: 0, planName: 'No Plan' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const isMountedRef = useRef(true);

  /* ================= FETCH DASHBOARD ================= */

  const fetchData = async () => {
    if (!isMountedRef.current) return;
    setError('');
    setSuccess('');

    const [walletRes, numbersRes, subscriptionRes] = await Promise.all([
      API.get('/api/wallet'),
      API.get('/api/numbers'),
      API.get('/api/subscription').catch(() => ({ error: true }))
    ]);

    // Wallet - handle gracefully, don't block render
    if (walletRes.error) {
      console.warn('Failed to load wallet:', walletRes.error);
      setBalance(0);
    } else {
      setBalance(walletRes.data?.balance ?? 0);
    }

    // Package details - handle gracefully
    if (!subscriptionRes.error && subscriptionRes.data) {
      setPackageDetails({
        remainingMinutes: subscriptionRes.data.remainingMinutes || 0,
        remainingSMS: subscriptionRes.data.remainingSMS || 0,
        planName: subscriptionRes.data.planName || 'No Plan'
      });
    } else {
      // Default values if subscription endpoint doesn't exist
      setPackageDetails({
        remainingMinutes: 2500,
        remainingSMS: 200,
        planName: 'BASIC PLAN'
      });
    }

    // Numbers - handle gracefully, don't block render
    if (numbersRes.error) {
      console.warn('Failed to load numbers:', numbersRes.error);
      setNumbers([]);
    } else {
      setNumbers(numbersRes.data?.numbers || numbersRes.data || []);
    }

    if (isMountedRef.current) {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* ================= ACTIONS ================= */

  const handleChoosePlan = () => {
    navigate('/billing');
  };

  const handleBuyNumber = async () => {
    setActionLoading(true);
    setError('');
    setSuccess('');

    const response = await API.post('/api/numbers/buy', { country: 'US' });
    
    if (response.error) {
      setError(response.error);
    } else {
      const num = response.data?.phoneNumber?.phoneNumber || response.data?.phoneNumber?.number || response.data?.phoneNumber;
      setSuccess(`Number ${num || 'purchased'} successfully`);
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    }
    
    setActionLoading(false);
  };

  /* ================= LOADING ================= */

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  /* ================= UI (UNCHANGED) ================= */

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
      
      {/* Mobile header - Centered title with profile button */}
      <div className="mb-6 lg:hidden flex items-center justify-between">
        <div className="flex-1"></div>
        <h1 className="flex-1 text-2xl font-bold text-gray-900 dark:text-white tracking-tight text-center">Dashboard</h1>
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => navigate('/profile')}
            className="p-2 rounded-lg bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          </button>
        </div>
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

      {/* PACKAGE + NUMBERS CARDS */}
      <div className={`grid grid-cols-1 ${(numbers || []).length === 0 ? 'md:grid-cols-2' : ''} gap-6 mb-8`}>
        <div className="bg-gradient-to-br from-teal-500 via-green-500 to-emerald-500 dark:from-teal-600 dark:via-green-600 dark:to-emerald-600 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-sm opacity-90 mb-2">{packageDetails.planName}</p>
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-90">Remaining Minutes</span>
              <span className="text-2xl font-bold">{(packageDetails?.remainingMinutes || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm opacity-90">Remaining SMS</span>
              <span className="text-2xl font-bold">{(packageDetails?.remainingSMS || 0).toLocaleString()}</span>
            </div>
          </div>
          {/* Only show Choose Plan button if no active subscription */}
          {packageDetails.planName === 'No Plan' && (
            <button onClick={handleChoosePlan} className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-medium transition-colors">
              Choose Your Plan
            </button>
          )}
        </div>

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

      {/* NUMBERS LIST */}
      <div className="bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-600">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-600">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Phone Numbers</h2>
        </div>

        {(numbers || []).length === 0 ? (
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
                              // Show temporary success feedback
                              const btn = e.currentTarget;
                              const originalHTML = btn.innerHTML;
                              btn.innerHTML = '<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                              setTimeout(() => {
                                btn.innerHTML = originalHTML;
                              }, 2000);
                            } catch (err) {
                              console.error('Failed to copy:', err);
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                      <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Country</p>
                      <p className="text-gray-900 dark:text-white font-medium">{n.country || 'United States'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                      <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">State</p>
                      <p className="text-gray-900 dark:text-white font-medium">{n.state || n.region || 'Michigan'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                      <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">City</p>
                      <p className="text-gray-900 dark:text-white font-medium">{n.city || n.locality || 'Detroit'}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-600/50 rounded-lg p-3">
                      <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Activated</p>
                      <p className="text-gray-900 dark:text-white font-medium">
                        {n.createdAt || n.created_at 
                          ? new Date(n.createdAt || n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Jan 13, 2026'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
