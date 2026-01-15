import { useState, useEffect, useRef } from 'react';
import API from '../api';

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const MuteIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M17 10l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);

const SpeakerIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
  </svg>
);

const DialpadIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);

const ContactsIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const NotesIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const HoldIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  const [calling, setCalling] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [showDialpad, setShowDialpad] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);

  // Recent contacts from call logs
  const recentContacts = (callLogs || []).slice(0, 2).map(call => ({
    name: call?.contactName || call?.to_number || call?.toNumber || 'Unknown',
    number: call?.to_number || call?.toNumber || call?.phoneNumber || '',
    avatar: call.avatar || null,
  }));

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
    // Clean the pasted text - allow digits, +, *, #
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

  // Handle clear
  const handleClear = () => {
    setPhoneNumber('');
    setError('');
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

      // Check subscription
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
    const loadData = async () => {
      try {
        await fetchData(isMountedRef);
      } catch (err) {
        console.error('Error loading dialer data:', err);
      }
    };
    
    loadData();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Call duration timer
  useEffect(() => {
    let interval;
    if (inCall) {
      interval = setInterval(() => {
        setCallDuration(prev => {
          // Safe state update
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [inCall]);


  const handleCall = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    if (!subscriptionActive) {
      setError('Active subscription required to make calls. Please subscribe first.');
      return;
    }

    if (userNumbers.length === 0) {
      setError('You need to purchase a number first');
      return;
    }

    if (!isMountedRef.current) return;

    setCalling(true);
    setError('');
    setSuccess('');

    try {
      // Request microphone permission for browser-based calling
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop the stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop());
        console.log('✅ Microphone permission granted');
      } catch (micError) {
        if (!isMountedRef.current) return;
        setError('Microphone access is required to make calls. Please allow microphone access and try again.');
        setCalling(false);
        return;
      }

      // Validate we have an active number (required for calls)
      const fromNumber = userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || userNumbers?.[0];
      if (!fromNumber) {
        if (!isMountedRef.current) return;
        setError('No active number available');
        setCalling(false);
        return;
      }

      // Use correct API endpoint and payload per backend contract
      // POST /api/dialer/call with { to: destinationNumber }
      const response = await API.post('/api/dialer/call', {
        to: phoneNumber.trim()
      });

      if (!isMountedRef.current) return;

      if (response.error) {
        setError(response.error);
        setCalling(false);
      } else {
        setSuccess(`Call to ${phoneNumber.trim()} initiated successfully!`);
        setInCall(true);
        setCallDuration(0);
        await fetchData(isMountedRef);
        setTimeout(() => {
          if (isMountedRef.current) {
            setSuccess('');
          }
        }, 3000);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError('Failed to initiate call. Please try again.');
      setCalling(false);
    }
  };

  const handleEndCall = () => {
    setInCall(false);
    setCallDuration(0);
    setPhoneNumber('');
    setMuted(false);
    setOnHold(false);
    setSpeakerOn(false);
    setShowDialpad(false);
    if (isMountedRef.current) {
      fetchData(isMountedRef);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading dialer...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-slate-900 overflow-hidden">
        {/* Active Number Display - Always Visible */}
        <div className="px-4 sm:px-6 py-2 sm:py-3 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Number</div>
              {userNumbers.length > 0 ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <PhoneIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                    {userNumbers?.[0]?.number || userNumbers?.[0]?.phoneNumber || userNumbers?.[0] || 'None'}
                  </span>
                </div>
              ) : (
                <span className="text-sm text-red-600 dark:text-red-400 font-medium">No number purchased</span>
              )}
            </div>
            {!subscriptionActive && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded">
                Subscription Required
              </div>
            )}
          </div>
        </div>

        {/* Error/Success Messages */}
        {(error || success) && (
          <div className="px-4 sm:px-6 py-1.5 flex-shrink-0">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-2">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-2">
                <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
              </div>
            )}
          </div>
        )}

        {/* Main Content - Responsive Layout */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Column - Dialer (60% on desktop) */}
          <div className="w-full lg:w-[60%] flex flex-col bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 min-h-0">
            {/* Phone Number Display */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <div className="text-center">
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => {
                    // Allow digits, +, *, #
                    const cleaned = e.target.value.replace(/[^\d+*#]/g, '');
                    setPhoneNumber(cleaned);
                    setError('');
                  }}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter a name or number"
                  className="w-full text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-white min-h-[36px] sm:min-h-[40px] text-center bg-transparent border-none outline-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-400 placeholder:text-base sm:placeholder:text-lg"
                  disabled={calling || userNumbers.length === 0 || !subscriptionActive}
                />
              </div>
            </div>

            {/* Dialpad Grid - Adapts to Available Height */}
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
                            pressTimer = setTimeout(() => {
                              handleLongPress('0');
                            }, 500);
                          }
                        }}
                        onMouseUp={() => {
                          if (pressTimer) clearTimeout(pressTimer);
                        }}
                        onMouseLeave={() => {
                          if (pressTimer) clearTimeout(pressTimer);
                        }}
                        onTouchStart={() => {
                          if (btn.digit === '0') {
                            pressTimer = setTimeout(() => {
                              handleLongPress('0');
                            }, 500);
                          }
                        }}
                        onTouchEnd={() => {
                          if (pressTimer) clearTimeout(pressTimer);
                        }}
                        disabled={calling || userNumbers.length === 0 || !subscriptionActive}
                        className="w-full h-full bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 
                                   rounded-lg sm:rounded-xl border border-gray-200 dark:border-slate-600 transition-all 
                                   active:scale-95 text-gray-900 dark:text-white shadow-sm hover:shadow-md
                                   disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center
                                   group min-h-0"
                        style={{
                          fontSize: 'clamp(1rem, 4vw, 1.5rem)',
                        }}
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
                  disabled={!phoneNumber || calling}
                  className="flex-1 py-2 sm:py-2.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 
                             text-gray-700 dark:text-gray-200 rounded-lg flex items-center justify-center gap-2 
                             font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base"
                >
                  <BackspaceIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={handleCall}
                  disabled={!phoneNumber.trim() || calling || userNumbers.length === 0 || !subscriptionActive}
                  className="flex-[2] py-2 sm:py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg
                             flex items-center justify-center gap-2 font-semibold shadow-md
                             disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                             transition-all active:scale-95 text-sm sm:text-base"
                >
                  {calling ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Calling...</span>
                    </>
                  ) : (
                    <>
                      <PhoneIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span>Call</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Recent Calls (40% on desktop, hidden on mobile) */}
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
                      onClick={() => setPhoneNumber(call.to_number || call.toNumber || '')}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {call.to_number || call.toNumber || 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {call.created_at ? new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
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

        {/* Recent Calls - Mobile View (Below Dialer) - Only show if not in call, collapsible */}
        {!inCall && callLogs.length > 0 && (
          <div className="lg:hidden border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0 max-h-[25vh] flex flex-col">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Calls</h2>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
            {callLogs.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">No call history</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {(callLogs || []).slice(0, 5).map((call) => (
                  <button
                    key={call.id || call._id}
                    onClick={() => setPhoneNumber(call.to_number || call.toNumber || '')}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {call.to_number || call.toNumber || 'Unknown'}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {call.created_at ? new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
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
        )}
      </div>

      {/* Active Call Controls - Sticky on Mobile, Overlay on Desktop */}
      {inCall && (
        <div className="fixed inset-x-0 bottom-0 lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 
                        z-50 bg-gradient-to-b from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black 
                        lg:w-96 lg:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          {/* Call Header */}
          <div className="p-4 sm:p-6 text-center border-b border-white/10">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 
                          flex items-center justify-center text-2xl sm:text-3xl font-semibold text-white">
              {phoneNumber.charAt(0) || 'C'}
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-white mb-1 truncate px-2">{phoneNumber || 'Unknown'}</h3>
            <p className="text-green-400 text-base sm:text-lg font-medium">{formatDuration(callDuration)}</p>
          </div>

          {/* Call Controls */}
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <button
                onClick={() => setMuted(!muted)}
                className={`p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center transition-all ${
                  muted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <MuteIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-xs mt-1.5">Mute</span>
              </button>
              <button
                onClick={() => setSpeakerOn(!speakerOn)}
                className={`p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center transition-all ${
                  speakerOn ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <SpeakerIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-xs mt-1.5">Speaker</span>
              </button>
              <button
                onClick={() => setShowDialpad(!showDialpad)}
                className={`p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center transition-all ${
                  showDialpad ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <DialpadIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="text-xs mt-1.5">Keypad</span>
              </button>
            </div>

            {/* End Call Button */}
            <button
              onClick={handleEndCall}
              className="w-full py-3 sm:py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl 
                         font-semibold flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <PhoneIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>End Call</span>
            </button>
          </div>

          {/* Dialpad Overlay */}
          {showDialpad && (
            <div className="absolute inset-0 bg-slate-900 p-4 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {dialpadButtons.map((btn) => (
                  <button
                    key={btn.digit}
                    onClick={() => handleDialpadClick(btn.digit)}
                    className="aspect-square text-lg font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl 
                               transition-all active:scale-95 flex flex-col items-center justify-center"
                  >
                    <span>{btn.digit}</span>
                    {btn.letters && <span className="text-xs text-gray-400">{btn.letters}</span>}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDialpad(false)}
                className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
              >
                Close Keypad
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Spacer for mobile call controls - ensures dialer doesn't get hidden */}
      {inCall && <div className="h-[280px] lg:hidden flex-shrink-0"></div>}
    </>
  );
}

export default Dialer;
