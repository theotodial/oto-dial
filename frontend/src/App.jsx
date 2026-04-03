import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import DashboardLayout from './components/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import GlobalCallOverlay from './components/GlobalCallOverlay';
import AnalyticsTracker from './components/AnalyticsTracker';
import Home from './pages/Home';

/** Home only for guests; logged-in users go to Voice (Recents) */
function HomeOrRedirect() {
  const { token } = useAuth();
  if (token) return <Navigate to="/recents" replace />;
  return <Home />;
}
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import OAuthConsent from './pages/OAuthConsent';
import OAuthSuccess from './pages/OAuthSuccess';
import Recents from './pages/Recents';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Billing from './pages/Billing';
import BuyNumber from './pages/BuyNumber';
import SubscriptionDetails from './pages/SubscriptionDetails';
import Profile from './pages/Profile';
import Support from './pages/Support';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import AffiliateProtectedRoute from './components/AffiliateProtectedRoute';
import AffiliateLanding from './pages/AffiliateLanding';
import AffiliateSignup from './pages/AffiliateSignup';
import AffiliateLogin from './pages/AffiliateLogin';
import AffiliateOAuthSuccess from './pages/AffiliateOAuthSuccess';
import AffiliateDashboard from './pages/AffiliateDashboard';
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
import AdminBlog from './pages/admin/AdminBlog';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminAnalyticsDetail from './pages/admin/AdminAnalyticsDetail';
import AdminAffiliates from './pages/admin/AdminAffiliates';
import AdminNotifications from './pages/admin/AdminNotifications';
import SiteBuilder from './pages/admin/site/SiteBuilder';
import SiteSeo from './pages/admin/site/SiteSeo';
import SiteEnvironment from './pages/admin/site/SiteEnvironment';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import AdminLayout from './components/AdminLayout';

function App() {
    return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <CallProvider>
          <BrowserRouter>
            {/* Analytics Tracker - tracks page views and user behavior */}
            <AnalyticsTracker />
            
            {/* Single call UI: GlobalCallOverlay only — do not add a second incoming/embed layer */}
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

            <Route
              path="/affiliate"
              element={
                <>
                  <Navbar />
                  <AffiliateLanding />
                </>
              }
            />
            <Route
              path="/affiliate/signup"
              element={
                <>
                  <Navbar />
                  <AffiliateSignup />
                </>
              }
            />
            <Route
              path="/affiliate/login"
              element={
                <>
                  <Navbar />
                  <AffiliateLogin />
                </>
              }
            />
            <Route path="/affiliate/oauth-success" element={<AffiliateOAuthSuccess />} />
            <Route
              path="/affiliate/dashboard"
              element={
                <AffiliateProtectedRoute>
                  <AffiliateDashboard />
                </AffiliateProtectedRoute>
              }
            />
            
            <Route
              path="/blog"
              element={
                <>
                  <Blog />
                </>
              }
            />
            
            <Route
              path="/blog/:slug"
              element={
                <>
                  <BlogPost />
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
                  <AdminLayout>
                    <AdminDashboardEnterprise />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/users" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminUsers />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/users/:id" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminUserDetail />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/calls" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminCalls />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/sms" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminSms />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/numbers" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminNumbers />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/support" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminSupport />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/team" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminTeam />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/blog" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminBlog />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/blog/:id" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminBlog />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/blog/new" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminBlog />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/analytics" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminAnalytics />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route 
              path="/adminbobby/analytics/:category" 
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminAnalyticsDetail />
                  </AdminLayout>
                </AdminProtectedRoute>
              } 
            />
            <Route
              path="/adminbobby/affiliates"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminAffiliates />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/adminbobby/notifications"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <AdminNotifications />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/adminbobby/site/builder"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <SiteBuilder />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/adminbobby/site/seo"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <SiteSeo />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/adminbobby/site/environment"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <SiteEnvironment />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />

            <Route
              path="/adminbobby/site/builder"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <SiteBuilder />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/adminbobby/site/seo"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <SiteSeo />
                  </AdminLayout>
                </AdminProtectedRoute>
              }
            />
            <Route
              path="/adminbobby/site/environment"
              element={
                <AdminProtectedRoute>
                  <AdminLayout>
                    <SiteEnvironment />
                  </AdminLayout>
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
            path="/contacts"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Contacts />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
            
          {/* Billing is public marketing UI; checkout itself enforces auth in Billing page */}
          <Route
            path="/billing"
            element={
              <DashboardLayout>
                <Billing />
              </DashboardLayout>
            }
          />
          {/* Public pricing URL – always routes to billing */}
          <Route path="/pricing" element={<Navigate to="/billing" replace />} />
          
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
            
            <Route
              path="/support"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Support />
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
