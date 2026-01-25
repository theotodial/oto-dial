import { useEffect, useRef } from 'react';

/**
 * Hook to keep screen awake during calls (prevents screen lock)
 * Uses Wake Lock API when available, falls back to no-op
 */
export function useWakeLock(active) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    // Only on mobile devices or when Wake Lock API is available
    if (!active) {
      // Release wake lock if call ends
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }

    // Request wake lock if API is available
    if ('wakeLock' in navigator) {
      navigator.wakeLock
        .request('screen')
        .then((wakeLock) => {
          wakeLockRef.current = wakeLock;
          console.log('📱 Screen wake lock acquired');
          
          // Handle wake lock release (e.g., user switches tabs)
          wakeLock.addEventListener('release', () => {
            console.log('📱 Screen wake lock released');
            wakeLockRef.current = null;
            
            // Re-request if call is still active
            if (active) {
              navigator.wakeLock
                .request('screen')
                .then((newLock) => {
                  wakeLockRef.current = newLock;
                })
                .catch(() => {
                  // Silently fail - wake lock might not be available
                });
            }
          });
        })
        .catch((err) => {
          // Wake Lock API might not be available or permission denied
          console.log('📱 Wake lock not available:', err.message);
        });
    }

    // Cleanup on unmount or when call ends
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [active]);
}

export default useWakeLock;
