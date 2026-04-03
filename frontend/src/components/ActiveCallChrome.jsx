import { useCall, CALL_STATES } from '../context/CallContext';
import CallWindow from './CallWindow';

/**
 * Shared active-call UI (expanded CallWindow + minimized banner).
 * @param {boolean} isDesktop — matchMedia xl (1280px), for incoming layout on global surface
 * @param {boolean} dockMode — true: fills a relative parent (Recents dialer column); false: fixed fullscreen
 */
export default function ActiveCallChrome({ isDesktop, dockMode = false }) {
  const {
    callState,
    callDuration,
    remoteNumber,
    formatDuration,
    hangUp,
    isMuted,
    toggleMute,
    isMinimized,
    expandCall,
    minimizeCall,
  } = useCall();

  if (callState === CALL_STATES.IDLE) {
    return null;
  }

  const rootClass = dockMode
    ? 'absolute inset-0 z-[60] flex flex-col min-h-0 bg-gray-50 dark:bg-slate-900'
    : 'fixed inset-0 z-[70] bg-gray-50 dark:bg-slate-900';

  const getStatusText = () => {
    switch (callState) {
      case CALL_STATES.DIALING:
        return 'Dialing...';
      case CALL_STATES.CONNECTING:
        return 'Connecting...';
      case CALL_STATES.RINGING:
        return 'Ringing...';
      case CALL_STATES.ACTIVE:
        return formatDuration(callDuration);
      case CALL_STATES.HELD:
        return 'On Hold';
      default:
        return 'In Call';
    }
  };

  const isActive = callState === CALL_STATES.ACTIVE;

  const framedWindow = (child) => {
    if (dockMode) {
      return (
        <div className="h-full w-full flex flex-col min-h-0 overflow-hidden">{child}</div>
      );
    }
    return (
      <div className="h-full w-full lg:flex lg:items-center lg:justify-center lg:p-6">
        <div className="h-full lg:h-auto lg:w-[400px] lg:max-h-[700px] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl">
          {child}
        </div>
      </div>
    );
  };

  if (callState === CALL_STATES.INCOMING && !isDesktop) {
    return (
      <div className={rootClass}>
        {framedWindow(
          <CallWindow
            contactName={remoteNumber}
            contactAvatar={null}
            onCallEnd={() => {}}
            onMinimize={minimizeCall}
          />
        )}
      </div>
    );
  }

  if (callState === CALL_STATES.INCOMING && isDesktop) {
    return (
      <div className={rootClass}>
        {dockMode ? (
          framedWindow(
            <CallWindow
              contactName={remoteNumber}
              contactAvatar={null}
              onCallEnd={() => {}}
              onMinimize={minimizeCall}
            />
          )
        ) : (
          <div className="h-full w-full lg:flex lg:items-center lg:justify-center lg:p-6">
            <div className="h-full lg:h-auto lg:w-[400px] lg:max-h-[700px] lg:rounded-3xl lg:overflow-hidden lg:shadow-2xl">
              <CallWindow
                contactName={remoteNumber}
                contactAvatar={null}
                onCallEnd={() => {}}
                onMinimize={minimizeCall}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isMinimized) {
    const row = (
      <div className="flex items-center justify-between px-4 py-2.5">
        <button type="button" onClick={expandCall} className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-3 h-3 bg-white rounded-full" />
            {isActive && (
              <div className="absolute inset-0 w-3 h-3 bg-white rounded-full animate-ping opacity-50" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white font-medium text-sm truncate">{remoteNumber || 'Unknown'}</p>
            <p className="text-emerald-100 text-xs">{getStatusText()}</p>
          </div>
          <span className="text-emerald-100 text-xs hidden sm:block">
            {dockMode ? 'Tap to return' : 'Tap to return to call'}
          </span>
        </button>
        <div className="flex items-center gap-2 ml-3">
          {isActive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              className={`p-2 rounded-full transition-all ${
                isMuted ? 'bg-red-500/40 text-white' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMuted ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                )}
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              hangUp();
            }}
            className="p-2 bg-red-500 hover:bg-red-600 rounded-full text-white transition-all"
            title="End call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"
              />
            </svg>
          </button>
        </div>
      </div>
    );

    if (dockMode) {
      return (
        <div className={`${rootClass} justify-end`}>
          <div className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg">{row}</div>
        </div>
      );
    }

    return (
      <div
        className="fixed top-16 left-0 right-0 z-[45] bg-gradient-to-r from-emerald-600 to-emerald-500 shadow-lg"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {row}
      </div>
    );
  }

  return (
    <div className={rootClass}>
      {framedWindow(
        <CallWindow
          contactName={remoteNumber}
          contactAvatar={null}
          onCallEnd={() => {}}
          onMinimize={minimizeCall}
        />
      )}
    </div>
  );
}
