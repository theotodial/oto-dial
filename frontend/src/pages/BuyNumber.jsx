import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { getMyNumbers, searchNumbersDetailed, purchaseNumber } from '../services/numberService';
import { SUPPORTED_COUNTRIES, getDefaultCountry } from '../utils/supportedCountries';

function BuyNumber() {
  const navigate = useNavigate();
  const [userNumbers, setUserNumbers] = useState([]);
  const [availableNumbers, setAvailableNumbers] = useState([]);
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(getDefaultCountry().code);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countryNotice, setCountryNotice] = useState('');
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const isMountedRef = useRef(true);
  const selectedCountryMeta = SUPPORTED_COUNTRIES.find((country) => country.code === selectedCountry);
  const isSelectedCountryProvisioningEnabled = selectedCountryMeta?.numberProvisioningEnabled !== false;

  const buildComingSoonMessage = (countryCode = selectedCountry) => {
    const countryMeta = SUPPORTED_COUNTRIES.find((country) => country.code === countryCode);
    const countryName = countryMeta?.name || 'This country';
    return `${countryName} numbers are coming soon. Right now, number purchase is available for United States and Norway.`;
  };

  // Check if user already has a number and subscription status
  useEffect(() => {
    isMountedRef.current = true;
    checkUserStatus();
    
    // Auto-load default numbers on page load (like Google Voice/TextNow)
    if (subscriptionActive && userNumbers.length === 0) {
      loadDefaultNumbers();
    }
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load default numbers when subscription becomes active or country changes
  useEffect(() => {
    if (subscriptionActive && userNumbers.length === 0 && !loading && availableNumbers.length === 0) {
      loadDefaultNumbers();
    }
  }, [subscriptionActive, userNumbers.length, loading, selectedCountry]);

  const loadDefaultNumbers = async () => {
    if (!subscriptionActive || searching) return;

    if (!isSelectedCountryProvisioningEnabled) {
      if (!isMountedRef.current) return;
      setAvailableNumbers([]);
      setSelectedNumber(null);
      setCountryNotice(buildComingSoonMessage(selectedCountry));
      return;
    }
    
    setSearching(true);
    setError('');
    setCountryNotice('');
    
    try {
      // Search without area code to get default numbers for selected country
      const result = await searchNumbersDetailed(null, null, selectedCountry);
      const numbers = result?.numbers || [];
      
      if (!isMountedRef.current) return;
      
      if (numbers.length > 0) {
        setAvailableNumbers(numbers);
      } else {
        setAvailableNumbers([]);
      }

      if (result?.comingSoon || result?.message) {
        setCountryNotice(result.message || buildComingSoonMessage(selectedCountry));
      } else {
        setCountryNotice('');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to load default numbers:', err);
      // Don't show error for default load - just silently fail
    } finally {
      if (isMountedRef.current) {
        setSearching(false);
      }
    }
  };

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

  const handleSearch = async () => {
    if (!subscriptionActive) {
      setError('Active subscription required to search numbers');
      return;
    }

    if (!isSelectedCountryProvisioningEnabled) {
      setError('');
      setAvailableNumbers([]);
      setSelectedNumber(null);
      setCountryNotice(buildComingSoonMessage(selectedCountry));
      return;
    }

    if (!isMountedRef.current) return;
    
    setSearching(true);
    setError('');
    setCountryNotice('');
    setAvailableNumbers([]);
    setSelectedNumber(null);

    try {
      // Extract area code if 3 digits provided
      const areaCode =
        selectedCountry === 'US' && /^\d{3}$/.test(searchQuery) ? searchQuery : null;
      const searchPattern = searchQuery || null;

      const result = await searchNumbersDetailed(areaCode, searchPattern, selectedCountry);
      const numbers = result?.numbers || [];

      if (!isMountedRef.current) return;

      if (numbers.length === 0) {
        setError(''); // Clear error, show info message instead
        setAvailableNumbers([]);
      } else {
        setError(''); // Clear any previous errors
        setAvailableNumbers(numbers);
      }

      if (result?.comingSoon || result?.message) {
        setCountryNotice(result.message || buildComingSoonMessage(selectedCountry));
      } else {
        setCountryNotice('');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to search numbers. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setSearching(false);
      }
    }
  };

  const handlePurchase = async () => {
    if (!isSelectedCountryProvisioningEnabled) {
      setError(buildComingSoonMessage(selectedCountry));
      return;
    }

    if (!selectedNumber) {
      setError('Please select a number first');
      return;
    }

    if (userNumbers.length > 0) {
      setError('You already have a phone number. Maximum 1 number allowed.');
      return;
    }

    if (!subscriptionActive) {
      setError('Active subscription required to buy a number');
      navigate('/dashboard');
      return;
    }

    if (!isMountedRef.current) return;
    
    setBuying(true);
    setError('');
    setSuccess('');

    try {
      const response = await purchaseNumber(selectedNumber.phone_number, selectedCountry);

      if (!isMountedRef.current) return;

      if (response?.error) {
        throw new Error(response.error);
      }

      const purchasedNumber = response?.phoneNumber || selectedNumber.phone_number;
      
      setSuccess(`Successfully purchased number: ${purchasedNumber}`);
      setTimeout(() => {
        if (isMountedRef.current) {
          navigate('/dashboard');
        }
      }, 2000);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to purchase number. Please try again.');
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
          <p className="text-gray-600 dark:text-gray-400">Search and select a local phone number. Only the cheapest eligible numbers are shown.</p>
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

        {!error && countryNotice && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-xl">
            {countryNotice}
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
          {/* Country Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Select Country
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Choose a country to search for available numbers. Numbers are locked to their country - you can only call/SMS within the same country.
            </p>
            <select
              value={selectedCountry}
              onChange={(e) => {
                const nextCountry = e.target.value;
                const nextCountryMeta = SUPPORTED_COUNTRIES.find((country) => country.code === nextCountry);
                setSelectedCountry(nextCountry);
                setAvailableNumbers([]);
                setSelectedNumber(null);
                setSearchQuery('');
                setError('');
                setSuccess('');
                setCountryNotice(
                  nextCountryMeta?.numberProvisioningEnabled === false
                    ? buildComingSoonMessage(nextCountry)
                    : ''
                );
              }}
              disabled={!subscriptionActive || searching}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {SUPPORTED_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name}{country.numberProvisioningEnabled ? '' : ' (Coming soon)'}
                </option>
              ))}
            </select>
          </div>

          {/* Search Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Search Available Numbers
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {!isSelectedCountryProvisioningEnabled
                ? buildComingSoonMessage(selectedCountry)
                : selectedCountry === 'US'
                  ? 'Enter a 3-digit area code (e.g., 212) or search by number pattern. Only cheapest local numbers are shown.'
                  : 'Enter a search pattern or leave blank to see available numbers. Only cheapest local numbers are shown.'}
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={!isSelectedCountryProvisioningEnabled
                  ? 'Coming soon'
                  : selectedCountry === 'US'
                    ? 'Area code (e.g., 212) or number pattern'
                    : 'Number pattern or leave blank'}
                disabled={!subscriptionActive || searching || !isSelectedCountryProvisioningEnabled}
                className="flex-1 px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
              />
              <button
                onClick={handleSearch}
                disabled={!subscriptionActive || searching || !isSelectedCountryProvisioningEnabled}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Available Numbers List */}
          {searching && availableNumbers.length === 0 && !error && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-xl">
              <p className="text-sm">Searching for available numbers...</p>
            </div>
          )}

          {!searching && availableNumbers.length === 0 && !error && !countryNotice && (
            <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 rounded-xl">
              <p className="text-sm font-medium mb-1">No numbers found</p>
              <p className="text-xs">
                {searchQuery 
                  ? "Try a different area code or search pattern. Only affordable local numbers are available."
                  : (selectedCountry === 'US'
                    ? "Enter an area code (e.g., 212) or search pattern to find numbers, or browse available numbers below."
                    : "Enter a search pattern or leave blank to load available numbers in this country.")
                }
              </p>
            </div>
          )}

          {availableNumbers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Available Numbers ({availableNumbers.length})
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {availableNumbers.map((num) => (
                  <button
                    key={num.phone_number}
                    onClick={() => setSelectedNumber(num)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      selectedNumber?.phone_number === num.phone_number
                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30'
                        : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                          {num.phone_number}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {num.country && (
                            <span className="inline-block mr-2">
                              {SUPPORTED_COUNTRIES.find(c => c.code === num.countryCode)?.flag || ''} {num.country}
                            </span>
                          )}
                          Carrier Group: {num.carrier_group} | Monthly: ${num.monthly_cost.toFixed(2)}
                        </div>
                      </div>
                      {selectedNumber?.phone_number === num.phone_number && (
                        <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Purchase Button */}
          <div className="pt-6 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={handlePurchase}
              disabled={!subscriptionActive || buying || !selectedNumber || userNumbers.length > 0 || !isSelectedCountryProvisioningEnabled}
              className={`w-full py-4 rounded-xl font-semibold transition-all ${
                !subscriptionActive || buying || !selectedNumber || userNumbers.length > 0 || !isSelectedCountryProvisioningEnabled
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white shadow-lg hover:shadow-xl'
              }`}
            >
              {buying ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </span>
              ) : selectedNumber ? (
                `Purchase ${selectedNumber.phone_number} ($${selectedNumber.monthly_cost.toFixed(2)}/month)`
              ) : (
                'Select a number to purchase'
              )}
            </button>

            <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Maximum 1 phone number per account. Number purchase is currently available for United States and Norway.
              <br />
              <span className="text-yellow-600 dark:text-yellow-400 font-semibold">
                ⚠️ Country Lock: Numbers can only call/SMS within their own country.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BuyNumber;
