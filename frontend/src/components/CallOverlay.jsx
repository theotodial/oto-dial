import { useMemo } from "react";
import { useCall } from "../context/CallContext";

const PhoneIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

const MuteIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M17 10l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
    />
  </svg>
);

const SpeakerIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
    />
  </svg>
);

const DialpadIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
  </svg>
);

const HoldIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

function CallOverlay() {
  const {
    callState,
    duration,
    isActive,
    isIncoming,
    muted,
    speakerOn,
    onHold,
    showDialpad,
    setShowDialpad,
    toggleMute,
    toggleSpeaker,
    toggleHold,
    answerCall,
    endCall
  } = useCall();

  const dialpadButtons = [
    { digit: "1", letters: "" },
    { digit: "2", letters: "ABC" },
    { digit: "3", letters: "DEF" },
    { digit: "4", letters: "GHI" },
    { digit: "5", letters: "JKL" },
    { digit: "6", letters: "MNO" },
    { digit: "7", letters: "PQRS" },
    { digit: "8", letters: "TUV" },
    { digit: "9", letters: "WXYZ" },
    { digit: "*", letters: "" },
    { digit: "0", letters: "+" },
    { digit: "#", letters: "" }
  ];

  const statusLabel = useMemo(() => {
    if (callState.status === "dialing") return "Calling...";
    if (callState.status === "ringing") {
      return callState.direction === "inbound" ? "Incoming call" : "Ringing...";
    }
    if (callState.status === "in-progress") return "Connected";
    if (callState.status === "completed") return "Call ended";
    if (callState.status === "failed") return "Call failed";
    if (callState.status === "missed") return "Missed call";
    return "Connecting...";
  }, [callState.status, callState.direction]);

  if (!isActive && callState.status === "idle") {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] bg-gradient-to-b from-slate-900 via-slate-900 to-black text-white">
      <div className="flex flex-col h-full relative">
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center text-3xl font-semibold mb-4">
            {(callState.phoneNumber || "U")[0]}
          </div>
          <h2 className="text-2xl font-semibold text-center">{callState.phoneNumber || "Unknown"}</h2>
          <p className="text-base text-emerald-400 mt-2">{statusLabel}</p>
          {callState.status === "in-progress" && (
            <p className="text-lg mt-2 text-emerald-300 font-semibold">{formatDuration(duration)}</p>
          )}
          {callState.error && (
            <p className="mt-2 text-sm text-red-300 text-center">{callState.error}</p>
          )}
        </div>

        {isIncoming ? (
          <div className="px-6 pb-10 flex items-center justify-center gap-6">
            <button
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg"
              aria-label="Reject call"
            >
              <PhoneIcon className="w-6 h-6" />
            </button>
            <button
              onClick={answerCall}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center shadow-lg"
              aria-label="Accept call"
            >
              <PhoneIcon className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <div className="px-6 pb-10">
            <div className="grid grid-cols-3 gap-3 mb-6">
              <button
                onClick={toggleMute}
                className={`py-4 rounded-2xl flex flex-col items-center justify-center transition-all ${
                  muted ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <MuteIcon className="w-6 h-6" />
                <span className="text-xs mt-2">Mute</span>
              </button>
              <button
                onClick={toggleHold}
                className={`py-4 rounded-2xl flex flex-col items-center justify-center transition-all ${
                  onHold ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <HoldIcon className="w-6 h-6" />
                <span className="text-xs mt-2">Hold</span>
              </button>
              <button
                onClick={() => setShowDialpad(!showDialpad)}
                className={`py-4 rounded-2xl flex flex-col items-center justify-center transition-all ${
                  showDialpad ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <DialpadIcon className="w-6 h-6" />
                <span className="text-xs mt-2">Keypad</span>
              </button>
              <button
                onClick={toggleSpeaker}
                className={`py-4 rounded-2xl flex flex-col items-center justify-center transition-all col-span-3 sm:col-span-1 ${
                  speakerOn ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                <SpeakerIcon className="w-6 h-6" />
                <span className="text-xs mt-2">Speaker</span>
              </button>
            </div>

            <button
              onClick={endCall}
              className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center justify-center gap-2"
            >
              <PhoneIcon className="w-6 h-6" />
              End Call
            </button>
          </div>
        )}

        {showDialpad && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm flex flex-col p-6">
            <div className="text-center text-sm text-gray-300 mb-4">Keypad</div>
            <div className="grid grid-cols-3 gap-3 flex-1">
              {dialpadButtons.map((btn) => (
                <button
                  key={btn.digit}
                  type="button"
                  className="aspect-square rounded-2xl bg-white/10 text-white text-xl font-semibold flex flex-col items-center justify-center"
                >
                  <span>{btn.digit}</span>
                  {btn.letters && <span className="text-[10px] text-gray-400 mt-1">{btn.letters}</span>}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowDialpad(false)}
              className="mt-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium"
            >
              Close Keypad
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CallOverlay;
