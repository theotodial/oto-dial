import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppStateProvider } from './context/AppStateContext';
import { AuthProvider } from './context/AuthContext';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { CallProvider } from './context/CallContext';
import ErrorBoundary from './components/ErrorBoundary';
import AppShell from './components/AppShell';

function App() {
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
