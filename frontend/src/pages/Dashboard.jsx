import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { supabase } from '../lib/supabase';
import logo from '../assets/otodial-logo.png';

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

function Dashboard() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(null);
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [userId, setUserId] = useState(null);

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

  // Get user ID from Supabase session
  useEffect(() => {
    const getUserId = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
    };
    getUserId();
  }, []);

  const fetchData = async () => {
    try {
      setError('');
      setSuccess('');
      const headers = await getAuthHeaders();
      
      const [walletResponse, numbersResponse] = await Promise.all([
        API.get('/api/wallet', { headers }),
        API.get('/api/numbers', { headers })
      ]);

      // Handle standardized API response format
      const walletData = walletResponse.data;
      setBalance(walletData.balance !== undefined ? walletData.balance : 0);
      
      // Handle both { numbers: [...] } and raw array formats
      const numbersData = numbersResponse.data;
      setNumbers(numbersData.numbers || numbersData || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
        err.response?.data?.detail || 
                          err.message ||
                          'Failed to load dashboard data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
    fetchData();
    }
  }, [userId]);

  const handleChoosePlan = () => {
    navigate('/billing');
  };

  const handleBuyNumber = async () => {
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const headers = await getAuthHeaders();
      const response = await API.post('/api/numbers/buy', 
        {},
        { headers }
      );

      // Handle standardized response: { success: true, number: {...} }
      const numberData = response.data.number || response.data;
      setSuccess(`Number ${numberData.number || 'purchased'} successfully!`);
      await fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
        err.response?.data?.detail || 
                          err.message ||
                          'Failed to buy number';
      setError(errorMessage);
    } finally {
      setActionLoading(false);
    }
  };

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

  return (
    <div className="h-full overflow-auto p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <img 
            src={logo} 
            alt="OTO DIAL Logo" 
            className="h-8 md:h-10 w-auto object-contain"
            onError={(e) => {
              e.target.style.display = 'none';
              const fallback = e.target.nextElementSibling;
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center hidden">
            <span className="text-white font-bold text-xl">OD</span>
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Dashboard</h1>
        <p className="text-base md:text-lg text-gray-500 dark:text-gray-400 mt-2">Welcome back! Here is an overview of your account.</p>
      </div>

      {actionLoading && (
        <div className="mb-6 px-4 py-3 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-xl text-sm flex items-center">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3"></div>
          Processing...
        </div>
      )}

      {success && (
        <div className="mb-6 px-4 py-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {success}
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <WalletIcon />
            </div>
            <span className="text-xs bg-white/20 px-3 py-1 rounded-full">Wallet</span>
          </div>
          <p className="text-indigo-100 text-sm mb-1">Available Balance</p>
          <p className="text-4xl font-bold mb-4">
            ${balance !== null ? balance.toFixed(2) : '0.00'}
          </p>
          <button
            onClick={handleChoosePlan}
            disabled={actionLoading}
            className="w-full py-3 bg-white/20 hover:bg-white/30 rounded-xl font-medium
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center"
          >
            <PlusIcon />
            <span className="ml-2">Choose Your Plan</span>
          </button>
        </div>

        <div className="bg-white dark:bg-slate-700 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-600">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/50 rounded-xl flex items-center justify-center text-green-600 dark:text-green-400">
              <PhoneIcon />
            </div>
            <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 px-3 py-1 rounded-full">Numbers</span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Active Numbers</p>
          <p className="text-4xl font-bold text-gray-900 dark:text-white mb-4">{numbers.length}</p>
          <button
            onClick={handleBuyNumber}
            disabled={actionLoading}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center"
          >
            <PlusIcon />
            <span className="ml-2">Buy Number</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-600 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-600 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">My Phone Numbers</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{numbers.length} total</span>
        </div>

        {numbers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-slate-600 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-300">
              <PhoneIcon />
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-2">No numbers purchased yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">Click Buy Number to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-600">
            {numbers.map((number) => (
              <div
                key={number.id}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-600/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <PhoneIcon />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{number.number}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {number.country} - Added {new Date(number.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400">
                  Active
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
