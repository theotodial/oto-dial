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
    <div className="h-full overflow-auto p-6 max-w-7xl mx-auto">
      <div className="mb-8">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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
          <button onClick={handleChoosePlan} className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-medium transition-colors">
            Choose Your Plan
          </button>
        </div>

        <div className="bg-white dark:bg-slate-700 rounded-2xl p-6 shadow-sm">
          <p className="text-sm">Active Numbers</p>
          <p className="text-4xl font-bold mb-4">{(numbers || []).length}</p>
          <button onClick={handleBuyNumber} className="w-full py-3 bg-green-600 text-white rounded-xl">
            Buy Number
          </button>
        </div>
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
              <div key={n._id || n.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-600/50 transition-colors">
                <span className="text-gray-900 dark:text-white font-medium">{n.number || n.phoneNumber}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
