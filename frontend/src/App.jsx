import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import DashboardLayout from './components/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import IncomingCallNotification from './components/IncomingCallNotification';
import GlobalCallOverlay from './components/GlobalCallOverlay';
import Home from './pages/Home';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import OAuthConsent from './pages/OAuthConsent';
import Recents from './pages/Recents';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Profile from './pages/Profile';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

function App() {
    return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <CallProvider>
          <BrowserRouter>
            {/* Global Incoming Call Notification - shows when call is incoming */}
            <IncomingCallNotification />
            
            {/* Global Call Overlay - shows floating banner when call is minimized */}
            <GlobalCallOverlay />
            
      <Routes>
            {/* Public Routes - Accessible to everyone, redirects if authenticated */}
        <Route
              path="/"
          element={
                <>
                  <Navbar />
                  <Home />
                </>
          }
        />
            
        <Route
              path="/login"
          element={
                <PublicRoute>
                  <Navbar />
                  <Login />
                </PublicRoute>
          }
        />
            
        <Route
              path="/signup"
          element={
                <PublicRoute>
                  <Navbar />
                  <Signup />
                </PublicRoute>
          }
        />
            
        <Route
              path="/forgot-password"
          element={
                <>
                  <Navbar />
                  <ForgotPassword />
                </>
          }
        />
            
            <Route
              path="/contact"
              element={
    <>
      <Navbar />
                  <Contact />
                </>
              }
            />
            
            <Route
              path="/privacy"
              element={
                <>
                  <Navbar />
                  <Privacy />
                </>
              }
            />
            
            <Route
              path="/terms"
              element={
                <>
                  <Navbar />
                  <Terms />
                </>
              }
            />
            
            {/* OAuth consent page - public but special */}
            <Route path="/oauth/consent" element={<OAuthConsent />} />

            {/* Protected Routes - Require authentication */}
          <Route
            path="/recents"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Recents />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
            
          {/* Dialer and Chat: redirect to Recents (all voice/chat operates from Recents) */}
          <Route path="/dialer" element={<Navigate to="/recents" replace />} />
          <Route path="/chat" element={<Navigate to="/recents" replace />} />
            
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Billing />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
            
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Profile />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />

            {/* Catch-all route - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
      </BrowserRouter>
          </CallProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
