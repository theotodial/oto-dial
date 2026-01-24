import { useState } from 'react';
import { useCall, CALL_STATES } from '../context/CallContext';

// Icons
const MuteIcon = ({ muted }) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {muted ? (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    ) : (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    )}
  </svg>
);

const HoldIcon = ({ held }) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const NotesIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ContactsIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const DialpadIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="5" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    <circle cx="19" cy="5" r="1.5" fill="currentColor" />
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    <circle cx="5" cy="19" r="1.5" fill="currentColor" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    <circle cx="19" cy="19" r="1.5" fill="currentColor" />
  </svg>
);

const SpeakerIcon = ({ on }) => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="4" y="6" width="16" height="12" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" strokeWidth={2} />
  </svg>
);

const EndCallIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
);

// Get call status text
const getStatusText = (callState) => {
  switch (callState) {
    case CALL_STATES.CONNECTING:
      return 'Connecting...';
    case CALL_STATES.RINGING:
      return 'Ringing...';
    case CALL_STATES.ACTIVE:
      return null; // Will show duration instead
    case CALL_STATES.HELD:
      return 'On Hold';
    case CALL_STATES.ENDING:
      return 'Call Ended';
    default:
      return 'Calling...';
  }
};

// Get initials from phone number
const getInitials = (phoneNumber) => {
  if (!phoneNumber) return '?';
  // Get last 2 digits of phone number
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.slice(-2) || '??';
};

// Dialpad component
const Dialpad = ({ onDigitPress, onClose }) => {
  const digits = [
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

  return (
    <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm flex flex-col p-4 z-10">
      <div className="grid grid-cols-3 gap-3 flex-1 py-4">
        {digits.map((d) => (
          <button
            key={d.digit}
            onClick={() => onDigitPress(d.digit)}
            className="flex flex-col items-center justify-center bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-xl transition-all"
          >
            <span className="text-2xl font-semibold text-white">{d.digit}</span>
            {d.letters && <span className="text-[10px] text-gray-400">{d.letters}</span>}
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
      >
        Close Keypad
      </button>
    </div>
  );
};

export default function CallWindow({ contactName, contactAvatar, onMinimize, onCallEnd }) {
  const callContext = useCall();
  
  // Safely destructure with defaults
  const callState = callContext?.callState || CALL_STATES.IDLE;
  const callDuration = callContext?.callDuration || 0;
  const isMuted = callContext?.isMuted || false;
  const isOnHold = callContext?.isOnHold || false;
  const isSpeaker = callContext?.isSpeaker || false;
  const remoteNumber = callContext?.remoteNumber || '';
  const hangUp = callContext?.hangUp || (() => {});
  const toggleMute = callContext?.toggleMute || (() => {});
  const toggleHold = callContext?.toggleHold || (() => {});
  const toggleSpeaker = callContext?.toggleSpeaker || (() => {});
  const sendDTMF = callContext?.sendDTMF || (() => {});
  const formatDuration = callContext?.formatDuration || ((s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  });

  const [showDialpad, setShowDialpad] = useState(false);
  const statusText = getStatusText(callState);
  const displayName = contactName || remoteNumber || 'Unknown';

  const handleDialpadDigit = (digit) => {
    sendDTMF(digit);
  };

  // Handle end call with callback
  const handleEndCall = () => {
    hangUp();
    if (onCallEnd) {
      onCallEnd();
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none">
        <svg viewBox="0 0 400 100" className="w-full h-full" preserveAspectRatio="none">
          <path d="M0,100 Q50,60 100,80 T200,70 T300,85 T400,60 L400,100 Z" fill="#16a34a" opacity="0.8" />
          <path d="M0,100 Q80,70 150,85 T300,75 T400,90 L400,100 Z" fill="#22c55e" opacity="0.6" />
        </svg>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10">
        {/* Avatar */}
        <div className="relative mb-4">
          {contactAvatar ? (
            <img 
              src={contactAvatar} 
              alt={displayName}
              className="w-24 h-24 rounded-full object-cover border-4 border-white/20"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-3xl font-bold text-gray-700 border-4 border-white/20">
              {getInitials(remoteNumber)}
            </div>
          )}
          {/* Pulsing ring when ringing */}
          {(callState === CALL_STATES.RINGING || callState === CALL_STATES.CONNECTING) && (
            <div className="absolute inset-0 rounded-full border-4 border-emerald-400 animate-ping opacity-30" />
          )}
        </div>

        {/* Contact Name */}
        <h2 className="text-2xl font-semibold text-white mb-2 text-center">
          {displayName}
        </h2>

        {/* Duration or Status */}
        <div className="text-emerald-400 text-3xl font-medium tracking-wider">
          {statusText || formatDuration(callDuration)}
        </div>
      </div>

      {/* Control Buttons - 2 rows of 3 */}
      <div className="px-6 pb-4 relative z-10">
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
              isMuted 
                ? 'bg-red-500/30 text-red-400' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <MuteIcon muted={isMuted} />
            <span className="text-xs font-medium">Mute</span>
          </button>

          {/* Hold */}
          <button
            onClick={toggleHold}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
              isOnHold 
                ? 'bg-amber-500/30 text-amber-400' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <HoldIcon held={isOnHold} />
            <span className="text-xs font-medium">Hold</span>
          </button>

          {/* Notes */}
          <button
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <NotesIcon />
            <span className="text-xs font-medium">Notes</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          {/* Contacts */}
          <button
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 transition-all"
          >
            <ContactsIcon />
            <span className="text-xs font-medium">Contacts</span>
          </button>

          {/* Dial Pad */}
          <button
            onClick={() => setShowDialpad(!showDialpad)}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
              showDialpad 
                ? 'bg-indigo-500/30 text-indigo-400' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <DialpadIcon />
            <span className="text-xs font-medium">Dial Pad</span>
          </button>

          {/* Speaker */}
          <button
            onClick={toggleSpeaker}
            className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all ${
              isSpeaker 
                ? 'bg-emerald-500/30 text-emerald-400' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <SpeakerIcon on={isSpeaker} />
            <span className="text-xs font-medium">Speaker</span>
          </button>
        </div>
      </div>

      {/* End Call Button */}
      <div className="flex justify-center pb-8 relative z-10">
        <button
          onClick={handleEndCall}
          className="w-16 h-16 bg-rose-500 hover:bg-rose-600 active:bg-rose-700 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/40 transition-all active:scale-95"
        >
          <EndCallIcon />
        </button>
      </div>

      {/* Dialpad Overlay */}
      {showDialpad && (
        <Dialpad 
          onDigitPress={handleDialpadDigit}
          onClose={() => setShowDialpad(false)}
        />
      )}
    </div>
  );
}
