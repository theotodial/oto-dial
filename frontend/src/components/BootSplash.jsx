import { useEffect } from 'react';

/**
 * Removes the static HTML boot splash after React mounts and updates diagnostics.
 */
export default function BootSplash() {
  useEffect(() => {
    try {
      sessionStorage.removeItem('otodial_chunk_reload_once');
    } catch (_) {
      /* ignore */
    }

    const splash = document.getElementById('otodial-boot-splash');
    if (splash) splash.remove();

    try {
      const d = window.__OTODIAL_DEBUG__;
      if (d && typeof d === 'object') {
        d.bootState = 'react_mounted';
        d.routerReady = true;
      }
    } catch (_) {
      /* ignore */
    }

    console.log('[APP MOUNT SUCCESS]');
    console.log('[ROUTER READY]');
  }, []);

  return null;
}
