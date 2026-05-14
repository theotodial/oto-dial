import { Suspense } from 'react';
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
import { CampaignProvider } from '../context/CampaignContext';
import AffiliateProtectedRoute from './AffiliateProtectedRoute';
import AdminProtectedRoute from './AdminProtectedRoute';
import AdminLayout from './AdminLayout';
import SkeletonApp from './SkeletonApp';
import RouteFallback from './loadingFallbacks';
import {
  Home,
  Signup,
  Login,
  ForgotPassword,
  ResetPassword,
  OAuthConsent,
  OAuthSuccess,
  Recents,
  Campaign,
  Dashboard,
  Contacts,
  Billing,
  BuyNumber,
  SubscriptionDetails,
  Profile,
  Support,
  Contact,
  Privacy,
  Terms,
  AffiliateLanding,
  AffiliateSignup,
  AffiliateLogin,
  AffiliateOAuthSuccess,
  AffiliateDashboard,
  AdminLogin,
  AdminAnalytics,
  AdminAnalyticsDetail,
  AdminProfitabilityTools,
  AdminAffiliates,
  AdminBlog,
  AdminCalls,
  AdminDashboardEnterprise,
  AdminNotifications,
  AdminNumbers,
  OtoAgents,
  AdminSms,
  AdminSmsApproval,
  AdminSupport,
  AdminSystemHealth,
  AdminLaunchHealth,
  AdminTeam,
  AdminUserDetail,
  AdminUsers,
  SiteBuilder,
  SiteEnvironment,
  SiteSeo,
  Blog,
  BlogPost,
} from '../routes/lazyPages';

function HomeOrRedirect() {
  const { token, user, hydrated } = useAuth();
  if (!token) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Home />
      </Suspense>
    );
  }
  if (!hydrated) return <SkeletonApp />;
  const f = user?.features || { voiceEnabled: true, campaignEnabled: false };
  const voice = f.voiceEnabled !== false;
  const camp = Boolean(f.campaignEnabled);
  if (user?.mode === 'campaign') return <Navigate to="/campaign" replace />;
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
              <Suspense fallback={<RouteFallback belowNav />}>
                <Login />
              </Suspense>
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <Signup />
              </Suspense>
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <ForgotPassword />
              </Suspense>
            </>
          }
        />
        <Route
          path="/reset-password"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <ResetPassword />
              </Suspense>
            </>
          }
        />
        <Route
          path="/contact"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <Contact />
              </Suspense>
            </>
          }
        />
        <Route
          path="/privacy"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <Privacy />
              </Suspense>
            </>
          }
        />
        <Route
          path="/terms"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <Terms />
              </Suspense>
            </>
          }
        />
        <Route
          path="/affiliate"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <AffiliateLanding />
              </Suspense>
            </>
          }
        />
        <Route
          path="/affiliate/signup"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <AffiliateSignup />
              </Suspense>
            </>
          }
        />
        <Route
          path="/affiliate/login"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <AffiliateLogin />
              </Suspense>
            </>
          }
        />
        <Route
          path="/affiliate/oauth-success"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AffiliateOAuthSuccess />
            </Suspense>
          }
        />
        <Route
          path="/affiliate/dashboard"
          element={
            <AffiliateProtectedRoute>
              <Suspense fallback={<RouteFallback />}>
                <AffiliateDashboard />
              </Suspense>
            </AffiliateProtectedRoute>
          }
        />
        <Route
          path="/blog"
          element={
            <Suspense fallback={<RouteFallback />}>
              <Blog />
            </Suspense>
          }
        />
        <Route
          path="/blog/:slug"
          element={
            <Suspense fallback={<RouteFallback />}>
              <BlogPost />
            </Suspense>
          }
        />
        <Route
          path="/oauth/consent"
          element={
            <Suspense fallback={<RouteFallback />}>
              <OAuthConsent />
            </Suspense>
          }
        />
        <Route
          path="/oauth-success"
          element={
            <>
              <Navbar />
              <Suspense fallback={<RouteFallback belowNav />}>
                <OAuthSuccess />
              </Suspense>
            </>
          }
        />

        <Route
          path="/adminbobby"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AdminLogin />
            </Suspense>
          }
        />
        <Route path="/adminbobby/dashboard" element={<AdminProtectedRoute><AdminLayout><AdminDashboardEnterprise /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/system-health" element={<AdminProtectedRoute><AdminLayout><AdminSystemHealth /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/launch-health" element={<AdminProtectedRoute><AdminLayout><AdminLaunchHealth /></AdminLayout></AdminProtectedRoute>} />
        <Route path="/adminbobby/oto-agents" element={<AdminProtectedRoute><AdminLayout><OtoAgents /></AdminLayout></AdminProtectedRoute>} />
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
        <Route path="/adminbobby/analytics/profitability-tools" element={<AdminProtectedRoute><AdminLayout><AdminProfitabilityTools /></AdminLayout></AdminProtectedRoute>} />
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
