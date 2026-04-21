import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import DashboardLayout from './DashboardLayout';
import ProtectedRoute from './ProtectedRoute';
import FeatureProtectedRoute from './FeatureProtectedRoute';
import PublicRoute from './PublicRoute';
import GlobalCallOverlay from './GlobalCallOverlay';
import EmailVerificationBanner from './EmailVerificationBanner';
import AnalyticsTracker from './AnalyticsTracker';
import Home from '../pages/Home';
import Signup from '../pages/Signup';
import Login from '../pages/Login';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import OAuthConsent from '../pages/OAuthConsent';
import OAuthSuccess from '../pages/OAuthSuccess';
import Recents from '../pages/Recents';
import Campaign from '../pages/Campaign';
import { CampaignProvider } from '../context/CampaignContext';
import Dashboard from '../pages/Dashboard';
import Contacts from '../pages/Contacts';
import Billing from '../pages/Billing';
import BuyNumber from '../pages/BuyNumber';
import SubscriptionDetails from '../pages/SubscriptionDetails';
import Profile from '../pages/Profile';
import Support from '../pages/Support';
import Contact from '../pages/Contact';
import Privacy from '../pages/Privacy';
import Terms from '../pages/Terms';
import AffiliateProtectedRoute from './AffiliateProtectedRoute';
import AffiliateLanding from '../pages/AffiliateLanding';
import AffiliateSignup from '../pages/AffiliateSignup';
import AffiliateLogin from '../pages/AffiliateLogin';
import AffiliateOAuthSuccess from '../pages/AffiliateOAuthSuccess';
import AffiliateDashboard from '../pages/AffiliateDashboard';
import AdminLogin from '../pages/admin/AdminLogin';
import AdminAnalytics from '../pages/admin/AdminAnalytics';
import AdminAnalyticsDetail from '../pages/admin/AdminAnalyticsDetail';
import AdminAffiliates from '../pages/admin/AdminAffiliates';
import AdminBlog from '../pages/admin/AdminBlog';
import AdminCalls from '../pages/admin/AdminCalls';
import AdminDashboardEnterprise from '../pages/admin/AdminDashboardEnterprise';
import AdminNotifications from '../pages/admin/AdminNotifications';
import AdminNumbers from '../pages/admin/AdminNumbers';
import AdminSms from '../pages/admin/AdminSms';
import AdminSmsApproval from '../pages/admin/AdminSmsApproval';
import AdminSupport from '../pages/admin/AdminSupport';
import AdminTeam from '../pages/admin/AdminTeam';
import AdminUserDetail from '../pages/admin/AdminUserDetail';
import AdminUsers from '../pages/admin/AdminUsers';
import SiteBuilder from '../pages/admin/site/SiteBuilder';
import SiteEnvironment from '../pages/admin/site/SiteEnvironment';
import SiteSeo from '../pages/admin/site/SiteSeo';
import Blog from '../pages/Blog';
import BlogPost from '../pages/BlogPost';
import AdminProtectedRoute from './AdminProtectedRoute';
import AdminLayout from './AdminLayout';
import SkeletonApp from './SkeletonApp';

function HomeOrRedirect() {
  const { token, user, hydrated } = useAuth();
  if (!token) return <Home />;
  if (!hydrated) return <SkeletonApp />;
  const f = user?.features || { voiceEnabled: true, campaignEnabled: false };
  const voice = f.voiceEnabled !== false;
  const camp = Boolean(f.campaignEnabled);
  if (user?.mode === "campaign") return <Navigate to="/campaign" replace />;
  if (voice) return <Navigate to="/recents" replace />;
  if (camp) return <Navigate to="/campaign" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function AppShell() {
  return (
    <>
      <AnalyticsTracker />
      <GlobalCallOverlay />
      <EmailVerificationBanner />
      <Routes>
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
        <Route path="/forgot-password" element={<><Navbar /><ForgotPassword /></>} />
        <Route path="/reset-password" element={<><Navbar /><ResetPassword /></>} />
        <Route path="/contact" element={<><Navbar /><Contact /></>} />
        <Route path="/privacy" element={<><Navbar /><Privacy /></>} />
        <Route path="/terms" element={<><Navbar /><Terms /></>} />
        <Route path="/affiliate" element={<><Navbar /><AffiliateLanding /></>} />
        <Route path="/affiliate/signup" element={<><Navbar /><AffiliateSignup /></>} />
        <Route path="/affiliate/login" element={<><Navbar /><AffiliateLogin /></>} />
        <Route path="/affiliate/oauth-success" element={<AffiliateOAuthSuccess />} />
        <Route
          path="/affiliate/dashboard"
          element={
            <AffiliateProtectedRoute>
              <AffiliateDashboard />
            </AffiliateProtectedRoute>
          }
        />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route path="/oauth-success" element={<><Navbar /><OAuthSuccess /></>} />

        <Route path="/adminbobby" element={<AdminLogin />} />
        <Route path="/adminbobby/dashboard" element={<AdminProtectedRoute><AdminLayout><AdminDashboardEnterprise /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/users" element={<AdminProtectedRoute><AdminLayout><AdminUsers /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/users/:id" element={<AdminProtectedRoute><AdminLayout><AdminUserDetail /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/calls" element={<AdminProtectedRoute><AdminLayout><AdminCalls /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/sms" element={<AdminProtectedRoute><AdminLayout><AdminSms /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/sms-approval" element={<AdminProtectedRoute><AdminLayout><AdminSmsApproval /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/numbers" element={<AdminProtectedRoute><AdminLayout><AdminNumbers /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/support" element={<AdminProtectedRoute><AdminLayout><AdminSupport /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/team" element={<AdminProtectedRoute><AdminLayout><AdminTeam /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/blog" element={<AdminProtectedRoute><AdminLayout><AdminBlog /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/blog/:id" element={<AdminProtectedRoute><AdminLayout><AdminBlog /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/blog/new" element={<AdminProtectedRoute><AdminLayout><AdminBlog /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/analytics" element={<AdminProtectedRoute><AdminLayout><AdminAnalytics /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/analytics/:category" element={<AdminProtectedRoute><AdminLayout><AdminAnalyticsDetail /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/affiliates" element={<AdminProtectedRoute><AdminLayout><AdminAffiliates /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/notifications" element={<AdminProtectedRoute><AdminLayout><AdminNotifications /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/site/builder" element={<AdminProtectedRoute><AdminLayout><SiteBuilder /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/site/seo" element={<AdminProtectedRoute><AdminLayout><SiteSeo /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/site/environment" element={<AdminProtectedRoute><AdminLayout><SiteEnvironment /></AdminLayout></AdminProtectedRoute>} />

        <Route
          path="/recents"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <FeatureProtectedRoute feature="voice">
                  <Recents />
                </FeatureProtectedRoute>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/voice"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <FeatureProtectedRoute feature="voice">
                  <Recents />
                </FeatureProtectedRoute>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaign"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <FeatureProtectedRoute feature="campaign">
                  <CampaignProvider>
                    <Campaign />
                  </CampaignProvider>
                </FeatureProtectedRoute>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout><Dashboard /></DashboardLayout></ProtectedRoute>} />
        <Route path="/dialer" element={<Navigate to="/recents" replace />} />
        <Route path="/chat" element={<Navigate to="/recents" replace />} />
        <Route path="/contacts" element={<ProtectedRoute><DashboardLayout><Contacts /></DashboardLayout></ProtectedRoute>} />
        <Route path="/billing" element={<DashboardLayout><Billing /></DashboardLayout>} />
        <Route path="/pricing" element={<Navigate to="/billing" replace />} />
        <Route path="/buy-number" element={<ProtectedRoute><DashboardLayout><BuyNumber /></DashboardLayout></ProtectedRoute>} />
        <Route path="/subscription-details" element={<ProtectedRoute><DashboardLayout><SubscriptionDetails /></DashboardLayout></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><DashboardLayout><Profile /></DashboardLayout></ProtectedRoute>} />
        <Route path="/support" element={<ProtectedRoute><DashboardLayout><Support /></DashboardLayout></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
