import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import DashboardLayout from './components/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import IncomingCallNotification from './components/IncomingCallNotification';
import GlobalCallOverlay from './components/GlobalCallOverlay';
import Home from './pages/Home';

/** Home only for guests; logged-in users go to Voice (Recents) */
function HomeOrRedirect() {
  const { token } = useAuth();
  if (token) return <Navigate to="/recents" replace />;
  return (
    <>
      <Navbar />
      <Home />
    </>
  );
}
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import OAuthConsent from './pages/OAuthConsent';
import OAuthSuccess from './pages/OAuthSuccess';
import Recents from './pages/Recents';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import BuyNumber from './pages/BuyNumber';
import SubscriptionDetails from './pages/SubscriptionDetails';
import Profile from './pages/Profile';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminDashboardEnhanced from './pages/admin/AdminDashboardEnhanced';
import AdminDashboardEnterprise from './pages/admin/AdminDashboardEnterprise';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';
import AdminCalls from './pages/admin/AdminCalls';
import AdminSms from './pages/admin/AdminSms';
import AdminNumbers from './pages/admin/AdminNumbers';
import AdminSupport from './pages/admin/AdminSupport';
import AdminTeam from './pages/admin/AdminTeam';
import AdminProtectedRoute from './components/AdminProtectedRoute';

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
        <Route path="/" element={<HomeOrRedirect />} />
            
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
            
            {/* OAuth pages - public but special */}
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route
              path="/oauth-success"
              element={
                <>
                  <Navbar />
                  <OAuthSuccess />
                </>
              }
            />

            {/* Admin Routes - Separate from user routes */}
            <Route path="/adminbobby" element={<AdminLogin />} />
            <Route 
              path="/adminbobby/dashboard" 
              element={
                <AdminProtectedRoute>
                  <AdminDashboardEnterprise />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/users" 
              element={
                <AdminProtectedRoute>
                  <AdminUsers />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/users/:id" 
              element={
                <AdminProtectedRoute>
                  <AdminUserDetail />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/calls" 
              element={
                <AdminProtectedRoute>
                  <AdminCalls />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/sms" 
              element={
                <AdminProtectedRoute>
                  <AdminSms />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/numbers" 
              element={
                <AdminProtectedRoute>
                  <AdminNumbers />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/support" 
              element={
                <AdminProtectedRoute>
                  <AdminSupport />
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/team" 
              element={
                <AdminProtectedRoute>
                  <AdminTeam />
                </AdminProtectedRoute>
              } 
            />

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
            path="/buy-number"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <BuyNumber />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/subscription-details"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <SubscriptionDetails />
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
