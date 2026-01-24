import { useEffect, useState } from 'react';
import { useCall } from '../context/CallContext';

// Accept call icon
const AcceptCallIcon = () => (
  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
  </svg>
);

// Reject call icon
const RejectCallIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

// Get initials from phone number
const getInitials = (phoneNumber) => {
  if (!phoneNumber) return '?';
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.slice(-2) || '??';
};

export default function IncomingCallNotification() {
  const callContext = useCall();
  const [isVisible, setIsVisible] = useState(false);

  const hasIncomingCall = callContext?.hasIncomingCall || false;
  const remoteNumber = callContext?.remoteNumber || '';
  const answerCall = callContext?.answerCall || (() => {});
  const rejectCall = callContext?.rejectCall || (() => {});

  useEffect(() => {
    if (hasIncomingCall) {
      setIsVisible(true);
    } else {
      // Small delay before hiding for animation
      const timeout = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [hasIncomingCall]);

  if (!isVisible) return null;

  return (
    <>
      {/* Full screen overlay for mobile */}
      <div 
        className={`fixed inset-0 z-[100] lg:hidden transition-all duration-300 ${
          hasIncomingCall ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Full screen incoming call UI - iPhone style */}
        <div className="h-full w-full bg-gradient-to-b from-slate-800 via-slate-900 to-black flex flex-col">
          {/* Top section with caller info */}
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            {/* Animated rings */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-[-10px] rounded-full bg-emerald-500/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              
              {/* Avatar */}
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-4xl font-bold text-gray-700 border-4 border-white/30 shadow-2xl">
                {getInitials(remoteNumber)}
              </div>
            </div>

            {/* Caller Name/Number */}
            <h2 className="text-3xl font-semibold text-white mb-2 text-center">
              {remoteNumber || 'Unknown Caller'}
            </h2>
            
            {/* Status */}
            <p className="text-lg text-gray-400 mb-2">Incoming Call</p>
            
            {/* OTO DIAL branding */}
            <div className="flex items-center gap-2 mt-4">
              <span className="text-emerald-400 text-sm font-medium">OTO DIAL</span>
            </div>
          </div>

          {/* Bottom section with action buttons */}
          <div className="pb-16 px-8">
            <div className="flex justify-between items-center max-w-sm mx-auto">
              {/* Decline Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={rejectCall}
                  className="w-20 h-20 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40 transition-all active:scale-95"
                >
                  <RejectCallIcon />
                </button>
                <span className="text-white text-sm font-medium">Decline</span>
              </div>

              {/* Accept Button */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={answerCall}
                  className="w-20 h-20 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40 transition-all active:scale-95 animate-pulse"
                >
                  <AcceptCallIcon />
                </button>
                <span className="text-white text-sm font-medium">Accept</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop notification banner */}
      <div 
        className={`hidden lg:block fixed top-4 right-4 z-[100] transition-all duration-300 ${
          hasIncomingCall 
            ? 'opacity-100 translate-y-0' 
            : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden w-80">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 flex items-center gap-2">
            <div className="w-3 h-3 bg-white/80 rounded-full animate-pulse" />
            <span className="text-white text-sm font-medium">Incoming Call</span>
          </div>
          
          {/* Content */}
          <div className="p-4">
            <div className="flex items-center gap-4 mb-4">
              {/* Avatar */}
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-xl font-bold text-gray-700 border-2 border-white/20 flex-shrink-0">
                {getInitials(remoteNumber)}
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold truncate">
                  {remoteNumber || 'Unknown Caller'}
                </h3>
                <p className="text-gray-400 text-sm">OTO DIAL</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={rejectCall}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Decline
              </button>
              <button
                onClick={answerCall}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 00-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
                </svg>
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
