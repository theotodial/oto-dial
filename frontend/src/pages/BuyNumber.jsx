import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { getMyNumbers, buyNumber } from '../services/numberService';

const countries = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'MY', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
];

function BuyNumber() {
  const navigate = useNavigate();
  const [selectedCountry, setSelectedCountry] = useState('US');
  const [userNumbers, setUserNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const isMountedRef = useRef(true);

  // Check if user already has a number and subscription status
  useEffect(() => {
    isMountedRef.current = true;
    checkUserStatus();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkUserStatus = async () => {
    if (!isMountedRef.current) return;
    
    setLoading(true);
    setError('');

    try {
      const [numbersRes, subscriptionRes] = await Promise.all([
        getMyNumbers(),
        API.get('/api/subscription').catch(() => ({ error: true }))
      ]);

      if (!isMountedRef.current) return;

      const numbers = Array.isArray(numbersRes) ? numbersRes : [];
      setUserNumbers(numbers);

      // Check subscription
      if (subscriptionRes.error || !subscriptionRes.data) {
        setError('Active subscription required to buy a number');
        setSubscriptionActive(false);
      } else {
        setSubscriptionActive(true);
      }

      // If user already has a number, show message
      if ((numbers || []).length > 0) {
        setError('You already have a phone number. Maximum 1 number allowed.');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Status check error:', err);
      setError('Failed to check account status');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleBuy = async () => {
    if (userNumbers.length > 0) {
      setError('You already have a phone number. Maximum 1 number allowed.');
      return;
    }

    if (!subscriptionActive) {
      setError('Active subscription required to buy a number');
      navigate('/billing');
      return;
    }

    if (!isMountedRef.current) return;
    
    setBuying(true);
    setError('');
    setSuccess('');

    try {
      const response = await buyNumber({
        country: selectedCountry
      });

      if (!isMountedRef.current) return;

      if (response?.error) {
        throw new Error(response.error);
      }

      const purchasedNumber = response?.phoneNumber || response?.phoneNumber?.phoneNumber || response?.number;
      
      setSuccess(`Successfully purchased number: ${purchasedNumber}`);
      setTimeout(() => {
        if (isMountedRef.current) {
          navigate('/my-numbers');
        }
      }, 2000);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to buy number. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setBuying(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If user already has a number, show that instead
  if (userNumbers.length > 0) {
    const userNumber = userNumbers[0];
    return (
      <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Active Phone Number</h2>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">
              {userNumber.number || userNumber.phoneNumber || userNumber}
            </p>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Status: <span className="font-semibold text-green-600 dark:text-green-400">Active</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Maximum 1 number allowed per account. You can manage this number from My Numbers.
            </p>
            <button
              onClick={() => navigate('/my-numbers')}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
            >
              View My Numbers
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Buy Phone Number</h1>
          <p className="text-gray-600 dark:text-gray-400">Select a country to purchase a phone number</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl">
            {success}
          </div>
        )}

        {!subscriptionActive && (
          <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 rounded-xl">
            <p className="font-semibold mb-2">Subscription Required</p>
            <p className="text-sm mb-3">You need an active subscription to buy a phone number.</p>
            <button
              onClick={() => navigate('/billing')}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Subscribe Now
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Select Country
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {countries.map((country) => (
                <button
                  key={country.code}
                  onClick={() => setSelectedCountry(country.code)}
                  disabled={!subscriptionActive}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    selectedCountry === country.code
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                  } ${
                    !subscriptionActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <div className="text-3xl mb-2">{country.flag}</div>
                  <div className={`text-sm font-medium ${
                    selectedCountry === country.code
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {country.name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={handleBuy}
              disabled={!subscriptionActive || buying || userNumbers.length > 0}
              className={`w-full py-4 rounded-xl font-semibold transition-all ${
                !subscriptionActive || buying || userNumbers.length > 0
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {buying ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </span>
              ) : (
                `Purchase Number in ${countries.find(c => c.code === selectedCountry)?.name || 'Selected Country'}`
              )}
            </button>

            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Maximum 1 phone number per account
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyNumber;
