import React from 'react';
import ReactDOM from 'react-dom/client';
import { resolvedApiBaseURL } from './api';
import './styles/index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

window.__OTODIAL_DEBUG__ = {
  ...(typeof window.__OTODIAL_DEBUG__ === 'object' && window.__OTODIAL_DEBUG__ !== null
    ? window.__OTODIAL_DEBUG__
    : {}),
  buildVersion: typeof __OTODIAL_WEB_VERSION__ !== 'undefined' ? __OTODIAL_WEB_VERSION__ : 'dev',
  mode: import.meta.env.MODE,
  apiUrl: import.meta.env.VITE_API_URL || '',
  apiBaseNormalized: resolvedApiBaseURL || '(same-origin)',
  bootState: 'pre_import',
  routerReady: false,
  authReady: false,
};

console.log('[APP BOOT]', window.__OTODIAL_DEBUG__);

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[BOOT FAILURE] missing #root');
  window.__OTODIAL_DEBUG__.bootState = 'no_root';
} else {
  (async function boot() {
    try {
      window.__OTODIAL_DEBUG__.bootState = 'importing_app';
      const { default: App } = await import('./App.jsx');
      window.__OTODIAL_DEBUG__.bootState = 'creating_root';
      const root = ReactDOM.createRoot(rootEl);
      console.log('[REACT ROOT CREATED]');
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
      window.__OTODIAL_DEBUG__.bootState = 'render_scheduled';
    } catch (err) {
      console.error('[BOOT FAILURE]', err);
      window.__OTODIAL_DEBUG__.bootState = 'fatal';
      window.__OTODIAL_DEBUG__.lastError = String(err?.message || err);
      const splash = document.getElementById('otodial-boot-splash');
      if (splash) {
        splash.style.display = 'flex';
        splash.innerHTML =
          '<div style="max-width:420px;padding:24px;background:#1e293b;color:#e2e8f0;border-radius:12px;font-family:system-ui,sans-serif;text-align:center">' +
          '<h1 style="font-size:18px;margin:0 0 12px">OTODIAL could not start</h1>' +
          '<p style="font-size:14px;color:#94a3b8;margin:0 0 16px">Try a hard refresh (Ctrl+Shift+R). If this persists, contact support.</p>' +
          '<p style="font-size:12px;color:#64748b;word-break:break-all;">' +
          String(err?.message || err).slice(0, 280) +
          '</p></div>';
      }
    }
  })();
}
