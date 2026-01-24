import { useState, useEffect, useRef } from 'react';
import API from '../api';
import { useCall } from '../context/CallContext';

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const BackspaceIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
  </svg>
);

function Dialer() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callLogs, setCallLogs] = useState([]);
  const [userNumbers, setUserNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [dialCountryCode, setDialCountryCode] = useState('+1');
  const [showDialCountryDropdown, setShowDialCountryDropdown] = useState(false);
  
  // WebRTC call context
  const {
    callState,
    isInCall,
    makeCall,
    error: callError,
    isClientReady,
    isMinimized,
    isInitializing
  } = useCall();

  const dialCountries = [
    { code: '+1', name: 'United States', flag: '🇺🇸' },
    { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
    { code: '+47', name: 'Norway', flag: '🇳🇴' },
    { code: '+46', name: 'Sweden', flag: '🇸🇪' },
    { code: '+45', name: 'Denmark', flag: '🇩🇰' },
    { code: '+49', name: 'Germany', flag: '🇩🇪' },
    { code: '+33', name: 'France', flag: '🇫🇷' },
    { code: '+39', name: 'Italy', flag: '🇮🇹' },
    { code: '+34', name: 'Spain', flag: '🇪🇸' },
    { code: '+61', name: 'Australia', flag: '🇦🇺' },
    { code: '+92', name: 'Pakistan', flag: '🇵🇰' },
    { code: '+91', name: 'India', flag: '🇮🇳' },
  ];

  // Handle dialpad button clicks
  const handleDialpadClick = (digit) => {
    setPhoneNumber(prev => prev + digit);
    setError('');
  };

  // Handle long press on 0 to add +
  const handleLongPress = (digit) => {
    if (digit === '0') {
      setPhoneNumber(prev => prev + '+');
      setError('');
    }
  };

  // Handle paste event
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const cleanedText = pastedText.replace(/[^\d+*#]/g, '');
    setPhoneNumber(prev => prev + cleanedText);
    setError('');
  };

  // Handle keyboard input for + sign
  const handleKeyDown = (e) => {
    if (e.key === '+') {
      e.preventDefault();
      setPhoneNumber(prev => prev + '+');
    }
  };

  // Handle backspace
  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };

  // Fetch user's numbers, call logs, and subscription
  const fetchData = async (isMounted = { current: true }) => {
    try {
      setError('');
      setSuccess('');
      
      const [numbersResponse, callsResponse, subscriptionResponse] = await Promise.all([
        API.get('/api/numbers'),
        API.get('/api/calls'),
        API.get('/api/subscription').catch(() => ({ error: true }))
      ]);

      if (!isMounted.current) return;

      if (numbersResponse.error) {
        console.warn('Failed to load numbers:', numbersResponse.error);
      } else {
        setUserNumbers(numbersResponse.data?.numbers || numbersResponse.data || []);
      }

      if (callsResponse.error) {
        console.warn('Failed to load calls:', callsResponse.error);
      } else {
        setCallLogs(callsResponse.data?.calls || callsResponse.data || []);
      }

      if (!subscriptionResponse.error && subscriptionResponse.data?.planName !== "No Plan") {
        setSubscriptionActive(true);
      } else {
        setSubscriptionActive(false);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error in fetchData:', err);
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    fetchData(isMountedRef);
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle making a call with WebRTC
  const handleCall = async () => {
    console.log('📞 handleCall triggered');
    
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    if (!subscriptionActive) {
      setError('Active subscription required to make calls');
      return;
    }

    if (userNumbers.length === 0) {
      setError('You need to purchase a number first');
      return;
    }

    setError('');
    setSuccess('');

    // Build final destination number with country code if needed
    const destination = phoneNumber.trim().startsWith('+')
      ? phoneNumber.trim()
      : `${dialCountryCode}${phoneNumber.trim()}`;

    // Get caller ID
    const callerId = userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || userNumbers?.[0];

    console.log('📞 Calling:', destination, 'from:', callerId);
    
    const callSuccess = await makeCall(destination, callerId);
    
    if (callSuccess) {
      setPhoneNumber('');
    } else if (callError) {
      setError(callError);
    }
  };

  const dialpadButtons = [
    { digit: '1', letters: '' },
    { digit: '2', letters: 'ABC' },
    { digit: '3', letters: 'DEF' },
    { digit: '4', letters: 'GHI' },
    { digit: '5', letters: 'JKL' },
    { digit: '6', letters: 'MNO' },
    { digit: '7', letters: 'PQRS' },
    { digit: '8', letters: 'TUV' },
    { digit: '9', letters: 'WXYZ' },
    { digit: '*', letters: '' },
    { digit: '0', letters: '+' },
    { digit: '#', letters: '' },
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading dialer...</p>
        </div>
      </div>
    );
  }

  // Refresh call logs when call ends
  useEffect(() => {
    if (!isInCall && callState === 'idle') {
      fetchData(isMountedRef);
    }
  }, [isInCall]);

  // Determine if dialer should be disabled (when in active call)
  const dialerDisabled = isInCall && !isMinimized;

  return (
    <div className={`h-screen flex flex-col bg-gray-50 dark:bg-slate-900 overflow-hidden ${isInCall && isMinimized ? 'pt-12' : ''}`}>
      {/* Active Number Display */}
      <div className="px-4 sm:px-6 py-2 sm:py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Number</div>
            {userNumbers.length > 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <PhoneIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  {userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || userNumbers?.[0] || 'None'}
                </span>
              </div>
            ) : (
              <span className="text-sm text-red-600 dark:text-red-400 font-medium">No number purchased</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isClientReady && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Ready
              </span>
            )}
            {isInitializing && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">Connecting...</span>
            )}
            {!subscriptionActive && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded">
                Subscription Required
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {(error || success || callError) && (
        <div className="px-4 sm:px-6 py-1.5 flex-shrink-0">
          {(error || callError) && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-2">
              <p className="text-sm text-red-700 dark:text-red-300">{error || callError}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-2">
              <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Dialer */}
        <div className="w-full lg:w-[60%] flex flex-col bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 min-h-0">
          {/* Phone Number Display with Country Code */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-center gap-2">
              {/* Country code selector */}
              <button
                type="button"
                onClick={() => setShowDialCountryDropdown(!showDialCountryDropdown)}
                className="relative px-3 py-1.5 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 flex items-center gap-2 text-sm text-gray-900 dark:text-white"
              >
                <span>{dialCountries.find(c => c.code === dialCountryCode)?.flag || '🌎'}</span>
                <span>{dialCountryCode}</span>
              </button>
              {showDialCountryDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowDialCountryDropdown(false)}
                  />
                  <div className="absolute z-40 mt-24 w-44 max-h-64 overflow-y-auto bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl">
                    {dialCountries.map(country => (
                      <button
                        key={country.code + country.name}
                        type="button"
                        onClick={() => {
                          setDialCountryCode(country.code);
                          setShowDialCountryDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700"
                      >
                        <span>{country.flag}</span>
                        <span className="truncate">{country.name}</span>
                        <span className="ml-auto text-gray-400 dark:text-gray-500">{country.code}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                  setPhoneNumber(cleaned);
                  setError('');
                }}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  handleKeyDown(e);
                  if (e.key === 'Enter' && phoneNumber.trim()) {
                    handleCall();
                  }
                }}
                placeholder="Enter phone number"
                className="flex-1 text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-white min-h-[36px] sm:min-h-[40px] text-center bg-transparent border-none outline-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-400 placeholder:text-base sm:placeholder:text-lg"
                disabled={userNumbers.length === 0 || !subscriptionActive}
              />
            </div>
          </div>

          {/* Dialpad Grid */}
          <div className="flex-1 flex items-center justify-center p-2 sm:p-3 lg:p-4 min-h-0 overflow-hidden">
            <div className="w-full h-full max-w-sm flex items-center justify-center p-2">
              <div className="w-full h-full grid grid-cols-3 grid-rows-4 gap-2 sm:gap-3">
                {dialpadButtons.map((btn) => {
                  let pressTimer = null;
                  return (
                    <button
                      key={btn.digit}
                      onClick={() => handleDialpadClick(btn.digit)}
                      onMouseDown={() => {
                        if (btn.digit === '0') {
                          pressTimer = setTimeout(() => handleLongPress('0'), 500);
                        }
                      }}
                      onMouseUp={() => pressTimer && clearTimeout(pressTimer)}
                      onMouseLeave={() => pressTimer && clearTimeout(pressTimer)}
                      onTouchStart={() => {
                        if (btn.digit === '0') {
                          pressTimer = setTimeout(() => handleLongPress('0'), 500);
                        }
                      }}
                      onTouchEnd={() => pressTimer && clearTimeout(pressTimer)}
                      disabled={userNumbers.length === 0 || !subscriptionActive}
                      className="w-full h-full bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 
                                 rounded-lg sm:rounded-xl border border-gray-200 dark:border-slate-600 transition-all 
                                 active:scale-95 text-gray-900 dark:text-white shadow-sm hover:shadow-md
                                 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center
                                 group min-h-0"
                    >
                      <span className="text-lg sm:text-xl lg:text-2xl font-medium leading-none">{btn.digit}</span>
                      {btn.letters && (
                        <span className="text-[8px] sm:text-[9px] lg:text-[10px] font-normal text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                          {btn.letters}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Call Action Buttons */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
            <div className="flex gap-2">
              <button
                onClick={handleBackspace}
                disabled={!phoneNumber}
                className="flex-1 py-2 sm:py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 
                           text-gray-700 dark:text-gray-200 rounded-lg flex items-center justify-center gap-2 
                           font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
              >
                <BackspaceIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Delete</span>
              </button>
              <button
                onClick={handleCall}
                disabled={!phoneNumber.trim() || userNumbers.length === 0 || !subscriptionActive || isInCall}
                className="flex-[2] py-2 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg
                           flex items-center justify-center gap-2 font-semibold shadow-md
                           disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                           transition-all active:scale-95 text-sm sm:text-base"
              >
                <PhoneIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Call</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Recent Calls (hidden on mobile) */}
        <div className="hidden lg:flex lg:w-[40%] flex-col bg-white dark:bg-slate-800 overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Calls</h2>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {callLogs.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                  <PhoneIcon className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">No call history</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {(callLogs || []).slice(0, 20).map((call) => (
                  <button
                    key={call.id || call._id}
                    onClick={() => setPhoneNumber(call.to_number || call.toNumber || call.phoneNumber || '')}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {call.to_number || call.toNumber || call.phoneNumber || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {call.created_at || call.createdAt ? new Date(call.created_at || call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} • {call.status || 'Completed'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Calls - Mobile View */}
      {callLogs.length > 0 && (
        <div className="lg:hidden border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 max-h-[25vh] flex flex-col">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Calls</h2>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {(callLogs || []).slice(0, 5).map((call) => (
                <button
                  key={call.id || call._id}
                  onClick={() => setPhoneNumber(call.to_number || call.toNumber || call.phoneNumber || '')}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                      {call.to_number || call.toNumber || call.phoneNumber || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {call.created_at || call.createdAt ? new Date(call.created_at || call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} • {call.status || 'Completed'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dialer;
