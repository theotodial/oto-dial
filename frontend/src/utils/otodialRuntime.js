/**
 * Production-safe runtime diagnostics (console + window.OTODIAL_RUNTIME).
 * Chunk failures: one silent reload, then a tiny top-right banner (never replaces #root).
 */

const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
let guardsInstalled = false;

function nowMs() {
  return Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  );
}

function routePath() {
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return '';
  }
}

export function ensureOtodialRuntime() {
  if (typeof window === 'undefined') return null;
  if (!window.OTODIAL_RUNTIME || typeof window.OTODIAL_RUNTIME !== 'object') {
    window.OTODIAL_RUNTIME = {
      buildId:
        typeof __OTODIAL_WEB_VERSION__ !== 'undefined' ? __OTODIAL_WEB_VERSION__ : 'dev',
      route: routePath(),
      chunkErrors: [],
      bootStages: {},
      authState: 'unknown',
      bootstrapState: 'idle',
      socketState: 'idle',
      telnyxState: 'idle',
      renderTimeMs: null,
    };
  }
  window.OTODIAL_RUNTIME.route = routePath();
  return window.OTODIAL_RUNTIME;
}

export function runtimeStage(name, detail) {
  const rt = ensureOtodialRuntime();
  if (!rt) return;
  const ms = nowMs();
  rt.bootStages[name] = { ms, ...(detail && typeof detail === 'object' ? detail : {}) };
  console.log(`[BOOT TIMING] ${name} +${ms}ms`, detail || '');
}

export function runtimeSetAuthState(state) {
  const rt = ensureOtodialRuntime();
  if (rt) rt.authState = state;
}

export function runtimeSetBootstrapState(state) {
  const rt = ensureOtodialRuntime();
  if (rt) rt.bootstrapState = state;
}

export function runtimeSetSocketState(state) {
  const rt = ensureOtodialRuntime();
  if (rt) rt.socketState = state;
}

export function runtimeSetTelnyxState(state) {
  const rt = ensureOtodialRuntime();
  if (rt) rt.telnyxState = state;
}

export function runtimeMarkRenderCommitted() {
  const rt = ensureOtodialRuntime();
  if (!rt || rt.renderTimeMs != null) return;
  rt.renderTimeMs = nowMs();
  runtimeStage('render_committed');
}

function isChunkFailure(event, reasonText) {
  const t = event?.target;
  if (t?.tagName === 'SCRIPT' && t.src && /\/assets\/.+\.js(\?|$)/i.test(String(t.src))) {
    return { url: String(t.src), kind: 'script' };
  }
  const low = String(reasonText || event?.message || '').toLowerCase();
  if (
    low.includes('dynamically imported module') ||
    low.includes('loading css chunk') ||
    low.includes('chunkloaderror') ||
    low.includes('chunk load')
  ) {
    return { url: reasonText || event?.message || '', kind: 'import' };
  }
  return null;
}

function recordChunkError(entry) {
  const rt = ensureOtodialRuntime();
  if (!rt) return;
  rt.chunkErrors.push({ ...entry, at: new Date().toISOString(), route: routePath() });
}

function showChunkBanner(message) {
  try {
    if (document.getElementById('otodial-runtime-banner')) return;
    const el = document.createElement('div');
    el.id = 'otodial-runtime-banner';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:2147483647;max-width:min(320px,calc(100vw - 24px));' +
      'padding:10px 14px;border-radius:8px;background:#1e293b;color:#e2e8f0;font:13px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 4px 24px rgba(0,0,0,.35);border:1px solid #334155';
    const span = document.createElement('span');
    span.textContent = message || 'Could not load application files.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Reload';
    btn.style.cssText =
      'margin-left:10px;padding:4px 10px;border-radius:6px;border:none;background:#4f46e5;color:#fff;cursor:pointer;font:inherit';
    btn.onclick = () => {
      try {
        sessionStorage.removeItem('otodial_chunk_reload_once');
      } catch (_) {}
      window.location.reload();
    };
    el.appendChild(span);
    el.appendChild(btn);
    (document.body || document.documentElement).appendChild(el);
  } catch (_) {
    /* ignore */
  }
}

/** One silent reload; then top-right banner (never replaces #root). */
export function installOtodialRuntimeGuards() {
  if (typeof window === 'undefined' || guardsInstalled) return;
  guardsInstalled = true;
  ensureOtodialRuntime();

  function handleChunkFailure(info, rawEvent) {
    recordChunkError({
      url: info.url,
      kind: info.kind,
      message: rawEvent?.message || info.url,
      filename: rawEvent?.filename,
      lineno: rawEvent?.lineno,
      colno: rawEvent?.colno,
    });
    console.error('[CHUNK LOAD ERROR]', info.url, rawEvent?.message || '', {
      route: routePath(),
      stack: rawEvent?.error?.stack,
    });

    try {
      if (!sessionStorage.getItem('otodial_chunk_reload_once')) {
        sessionStorage.setItem('otodial_chunk_reload_once', '1');
        window.location.reload();
        return;
      }
    } catch (_) {
      /* ignore */
    }

    showChunkBanner('Could not load application files.');
  }

  window.addEventListener(
    'error',
    (event) => {
      try {
        const chunk = isChunkFailure(event, event?.message);
        if (chunk) {
          handleChunkFailure(chunk, event);
          return;
        }
        console.error('[RUNTIME ERROR]', {
          message: event?.message,
          filename: event?.filename,
          lineno: event?.lineno,
          colno: event?.colno,
          stack: event?.error?.stack,
          route: routePath(),
        });
      } catch (_) {
        /* ignore */
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const r = event?.reason;
      const text = String(r?.message ?? r ?? '');
      const chunk = isChunkFailure(null, text);
      if (chunk) {
        handleChunkFailure(chunk, { message: text, error: r });
        return;
      }
      console.error('[RUNTIME REJECTION]', {
        message: text,
        stack: r?.stack,
        route: routePath(),
      });
    } catch (_) {
      /* ignore */
    }
  });
}
