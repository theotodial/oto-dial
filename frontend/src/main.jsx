import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { resolvedApiBaseURL } from './api';
import { ensureOtodialDebug } from './utils/otodialDebug';
import {
  ensureOtodialRuntime,
  installOtodialRuntimeGuards,
  runtimeStage,
} from './utils/otodialRuntime';
import './styles/index.css';

installOtodialRuntimeGuards();
runtimeStage('js_bundle_executing');

if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  queueMicrotask(() => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
  });
}

const dbg = ensureOtodialDebug();
const rt = ensureOtodialRuntime();
Object.assign(dbg, {
  buildVersion: typeof __OTODIAL_WEB_VERSION__ !== 'undefined' ? __OTODIAL_WEB_VERSION__ : 'dev',
  mode: import.meta.env.MODE,
  apiUrl: import.meta.env.VITE_API_URL || '',
  apiBaseNormalized: resolvedApiBaseURL || '(same-origin)',
  bootState: 'pre_render',
  routerReady: false,
  authReady: false,
});
if (rt) rt.buildId = dbg.buildVersion;

runtimeStage('react_bootstrap_start');

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('[BOOT CRASH] missing #root');
  dbg.bootState = 'no_root';
} else {
  try {
    const root = ReactDOM.createRoot(rootEl);
    runtimeStage('react_root_created');
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    runtimeStage('react_render_scheduled');
    dbg.bootState = 'render_scheduled';
  } catch (err) {
    console.error('[BOOT CRASH]', err);
    dbg.bootState = 'fatal';
    if (rt) rt.bootStages.boot_crash = { message: String(err?.message || err) };
  }
}
