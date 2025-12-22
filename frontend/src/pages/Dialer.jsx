import { useState, useEffect } from 'react';
import API from '../api';

const PhoneIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const BackspaceIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
  </svg>
);

function Dialer() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callLogs, setCallLogs] = useState([]);
  const [userNumbers, setUserNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calling, setCalling] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Handle dialpad button clicks
  const handleDialpadClick = (digit) => {
    setPhoneNumber(prev => prev + digit);
    setError('');
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

  const user_id = localStorage.getItem('user_id');

  // Fetch user's numbers and call logs
  const fetchData = async () => {
    if (!user_id) {
      setError('User not logged in');
      setLoading(false);
      return;
    }

    try {
      setError('');
      setSuccess('');
      const [numbersResponse, callsResponse] = await Promise.all([
        API.get(`/api/numbers/${user_id}`),
        API.get(`/api/calls/${user_id}`)
      ]);

      // Handle standardized API responses
      const numbersData = numbersResponse.data;
      const callsData = callsResponse.data;
      
      setUserNumbers(numbersData.numbers || numbersData || []);
      setCallLogs(callsData.calls || callsData || []);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.detail ||
                          err.message ||
                          'Failed to load dialer data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCall = async () => {
    if (!user_id) {
      setError('User not logged in');
      return;
    }

    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    const fromNumber = userNumbers.length > 0 ? userNumbers[0].number : null;
    
    if (!fromNumber) {
      setError('You need to purchase a number first. Go to Dashboard to buy a number.');
      return;
    }

    setCalling(true);
    setError('');
    setSuccess('');

    try {
      await API.post('/api/calls', {
        user_id: parseInt(user_id),
        from_number: fromNumber,
        to_number: phoneNumber.trim()
      });

      setSuccess(`Call to ${phoneNumber.trim()} initiated successfully!`);
      setPhoneNumber('');
      await fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.detail ||
                          err.message ||
                          'Failed to make call';
      setError(errorMessage);
    } finally {
      setCalling(false);
    }
  };

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

  const dialpadButtons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  return (
    <div className="h-full overflow-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dialer</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Make calls to any number worldwide</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dialpad Section */}
        <div className="bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-600 p-6">
          {/* Alerts */}
          {success && (
            <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {success}
            </div>
          )}

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl text-sm flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Phone Number Display */}
          <div className="mb-6">
            <div className="relative">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phoneNumber.trim() && !calling && userNumbers.length > 0) {
                    handleCall();
                  }
                }}
                placeholder="Enter phone number"
                disabled={calling || userNumbers.length === 0}
                className="w-full px-4 py-4 text-2xl font-medium text-center bg-gray-50 dark:bg-slate-600 border-2 border-gray-200 dark:border-slate-500 
                           rounded-xl focus:outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-500
                           disabled:opacity-50 disabled:cursor-not-allowed transition-all text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400"
              />
              {phoneNumber && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {userNumbers.length > 0 ? (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">
                Calling from: <span className="font-medium text-indigo-600 dark:text-indigo-400">{userNumbers[0].number}</span>
              </p>
            ) : (
              <p className="text-center text-sm text-red-500 dark:text-red-400 mt-2">
                You need to purchase a number first
              </p>
            )}
          </div>

          {/* Dialpad Grid */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {dialpadButtons.map((digit) => (
              <button
                key={digit}
                onClick={() => handleDialpadClick(digit)}
                disabled={calling || userNumbers.length === 0}
                className="py-4 text-2xl font-semibold bg-gray-50 dark:bg-slate-600 hover:bg-gray-100 dark:hover:bg-slate-500 
                           rounded-xl transition-all active:scale-95 text-gray-900 dark:text-white
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {digit}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleBackspace}
              disabled={!phoneNumber || calling}
              className="flex-1 py-4 bg-gray-100 dark:bg-slate-600 hover:bg-gray-200 dark:hover:bg-slate-500 text-gray-700 dark:text-gray-200 rounded-xl
                         flex items-center justify-center gap-2 font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <BackspaceIcon />
              Delete
            </button>
            <button
              onClick={handleCall}
              disabled={!phoneNumber.trim() || calling || userNumbers.length === 0}
              className="flex-[2] py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl
                         flex items-center justify-center gap-2 font-medium shadow-lg
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all
                         disabled:shadow-none"
            >
              {calling ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Calling...
                </>
              ) : (
                <>
                  <PhoneIcon />
                  Call
                </>
              )}
            </button>
          </div>
        </div>

        {/* Call History Section */}
        <div className="bg-white dark:bg-slate-700 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-600 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-600">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Call History</h2>
          </div>

          {callLogs.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-slate-600 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-300">
                <PhoneIcon />
              </div>
              <p className="text-gray-500 dark:text-gray-400 mb-2">No call history yet</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">Your calls will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-600 max-h-[500px] overflow-y-auto">
              {callLogs.map((call) => (
                <div key={call.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-600/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                        <PhoneIcon />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{call.to_number}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">From: {call.from_number}</p>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {new Date(call.created_at).toLocaleString()}
                    </span>
                  </div>
                  {call.transcript && (
                    <div className="ml-13 pl-13 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-600 rounded-lg p-3 mt-2">
                      <span className="font-medium text-gray-700 dark:text-gray-200">Transcript: </span>
                      {call.transcript}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dialer;
