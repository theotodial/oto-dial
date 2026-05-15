import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { resolvedApiBaseURL } from './api';
import { ensureOtodialDebug } from './utils/otodialDebug';
import { bootMark } from './utils/bootTiming';
import './styles/index.css';

bootMark('js_bundle_executing');

if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  queueMicrotask(() => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  });
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

bootMark('react_bootstrap_start');
console.log('[APP BOOT]', dbg);

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[BOOT CRASH] missing #root');
  dbg.bootState = 'no_root';
} else {
  try {
    dbg.bootState = 'creating_root';
    const root = ReactDOM.createRoot(rootEl);
    bootMark('react_root_created');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    bootMark('react_render_scheduled');
    dbg.bootState = 'render_scheduled';
    console.log('[APP IMPORT OK]');
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
    const b = document.getElementById('otodial-boot-retry');
    if (b) {
      b.onclick = function () {
        try {
          sessionStorage.removeItem('otodial_chunk_reload_once');
        } catch (_) {}
        window.location.reload();
      };
    }
  }
}
