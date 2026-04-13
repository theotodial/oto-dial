import { useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppStateProvider } from './context/AppStateContext';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { CallProvider } from './context/CallContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/AppShell';

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
