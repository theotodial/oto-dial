import { useRef, useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppStateProvider } from './context/AppStateContext';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { CallProvider } from './context/CallContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/AppShell';
import { ensureOtodialDebug } from './utils/otodialDebug';

function App() {
  const devRenderCountRef = useRef(0);
  if (import.meta.env.DEV) {
    devRenderCountRef.current += 1;
    if (devRenderCountRef.current > 60) {
      console.error(
        '[otodial] App re-render count is very high — possible state loop:',
        devRenderCountRef.current
      );
    }
  }

  useEffect(() => {
    try {
      sessionStorage.removeItem('otodial_chunk_reload_once');
    } catch (_) {
      /* ignore */
    }
    const d = ensureOtodialDebug();
    if (d) {
      d.bootState = 'react_mount';
      d.routerReady = true;
      try {
        d.entryAssetUrls = Array.from(document.querySelectorAll('script[src*="/assets/"],link[href*="/assets/"]'))
          .map((el) => el.src || el.href)
          .filter(Boolean);
      } catch (_) {
        d.entryAssetUrls = [];
      }
    }
    console.log('[REACT MOUNT]');
    console.log('[ROUTER READY]');
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <AppStateProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <CallProvider>
                  <AppShell />
                </CallProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </AppStateProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
