import React from 'react';
import ReactDOM from 'react-dom/client';
import { resolvedApiBaseURL } from './api';
import { ensureOtodialDebug } from './utils/otodialDebug';
import './styles/index.css';

if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => {});
}

const dbg = ensureOtodialDebug();
Object.assign(dbg, {
  buildVersion: typeof __OTODIAL_WEB_VERSION__ !== 'undefined' ? __OTODIAL_WEB_VERSION__ : 'dev',
  mode: import.meta.env.MODE,
  apiUrl: import.meta.env.VITE_API_URL || '',
  apiBaseNormalized: resolvedApiBaseURL || '(same-origin)',
  bootState: 'pre_import',
  routerReady: false,
  authReady: false,
});

console.log('[APP BOOT]', dbg);

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[BOOT CRASH] missing #root');
  dbg.bootState = 'no_root';
} else {
  (async function boot() {
    try {
      dbg.bootState = 'importing_app';
      const { default: App } = await import('./App.jsx');
      console.log('[APP IMPORT OK]');
      dbg.bootState = 'creating_root';
      const root = ReactDOM.createRoot(rootEl);
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
      dbg.bootState = 'render_scheduled';
    } catch (err) {
      console.error('[BOOT CRASH]', err);
      dbg.bootState = 'fatal';
      dbg.lastError = String(err?.message || err);
      rootEl.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;padding:24px">' +
        '<div style="max-width:400px;text-align:center">' +
        '<p style="margin:0 0 12px;font-size:17px;font-weight:600">Unable to start OTODIAL</p>' +
        '<p style="margin:0 0 16px;font-size:13px;color:#94a3b8;word-break:break-word">' +
        String(err?.message || err).slice(0, 280) +
        '</p>' +
        '<button type="button" id="otodial-boot-retry" style="padding:10px 20px;border-radius:8px;border:none;background:#4f46e5;color:#fff;font-size:14px;cursor:pointer">Try again</button>' +
        '</div></div>';
      var b = document.getElementById('otodial-boot-retry');
      if (b) {
        b.onclick = function () {
          try {
            sessionStorage.removeItem('otodial_chunk_reload_once');
          } catch (_) {}
          window.location.reload();
        };
      }
    }
  })();
}
