import { lazy } from 'react';

/** Core product surfaces — eager (no extra chunk round-trip on /recents, /dashboard). */
export { default as Recents } from '../pages/Recents.jsx';
export { default as Dashboard } from '../pages/Dashboard.jsx';
export { default as Home } from '../pages/Home.jsx';
export { default as Login } from '../pages/Login.jsx';
export { default as Signup } from '../pages/Signup.jsx';

/** Secondary authenticated — lazy OK */
export const Campaign = lazy(() => import('../pages/Campaign.jsx'));
export const Contacts = lazy(() => import('../pages/Contacts.jsx'));
export const Billing = lazy(() => import('../pages/Billing.jsx'));
export const BuyNumber = lazy(() => import('../pages/BuyNumber.jsx'));
export const SubscriptionDetails = lazy(() => import('../pages/SubscriptionDetails.jsx'));
export const Profile = lazy(() => import('../pages/Profile.jsx'));
export const Support = lazy(() => import('../pages/Support.jsx'));
export const ForgotPassword = lazy(() => import('../pages/ForgotPassword.jsx'));
export const ResetPassword = lazy(() => import('../pages/ResetPassword.jsx'));
export const OAuthConsent = lazy(() => import('../pages/OAuthConsent.jsx'));
export const OAuthSuccess = lazy(() => import('../pages/OAuthSuccess.jsx'));
export const Contact = lazy(() => import('../pages/Contact.jsx'));
export const Privacy = lazy(() => import('../pages/Privacy.jsx'));
export const Terms = lazy(() => import('../pages/Terms.jsx'));

/** Affiliate */
export const AffiliateLanding = lazy(() => import('../pages/AffiliateLanding.jsx'));
export const AffiliateSignup = lazy(() => import('../pages/AffiliateSignup.jsx'));
export const AffiliateLogin = lazy(() => import('../pages/AffiliateLogin.jsx'));
export const AffiliateOAuthSuccess = lazy(() => import('../pages/AffiliateOAuthSuccess.jsx'));
export const AffiliateDashboard = lazy(() => import('../pages/AffiliateDashboard.jsx'));

/** Admin / site tools — lazy */
export const AdminLogin = lazy(() => import('../pages/admin/AdminLogin.jsx'));
// Eager-loaded: heavy chart/map deps must not block on a separate lazy chunk
// (users were stuck on AdminPageFallback / "Loading admin console" indefinitely).
export { default as AdminAnalytics } from '../pages/admin/AdminAnalytics.jsx';
export const AdminAnalyticsDetail = lazy(() => import('../pages/admin/AdminAnalyticsDetail.jsx'));
export const AdminProfitabilityTools = lazy(() => import('../pages/admin/AdminProfitabilityTools.jsx'));
export const AdminBillingReconciliation = lazy(() => import('../pages/admin/AdminBillingReconciliation.jsx'));
export const AdminAffiliates = lazy(() => import('../pages/admin/AdminAffiliates.jsx'));
export const AdminBlog = lazy(() => import('../pages/admin/AdminBlog.jsx'));
export const AdminCalls = lazy(() => import('../pages/admin/AdminCalls.jsx'));
export const AdminDashboardEnterprise = lazy(() => import('../pages/admin/AdminDashboardEnterprise.jsx'));
export const AdminNotifications = lazy(() => import('../pages/admin/AdminNotifications.jsx'));
export const AdminNumbers = lazy(() => import('../pages/admin/AdminNumbers.jsx'));
export const OtoAgents = lazy(() => import('../pages/admin/OtoAgents.jsx'));
export const AdminSms = lazy(() => import('../pages/admin/AdminSms.jsx'));
export const AdminSmsApproval = lazy(() => import('../pages/admin/AdminSmsApproval.jsx'));
export const AdminSupport = lazy(() => import('../pages/admin/AdminSupport.jsx'));
export const AdminSystemHealth = lazy(() => import('../pages/admin/AdminSystemHealth.jsx'));
export const AdminLaunchHealth = lazy(() => import('../pages/admin/AdminLaunchHealth.jsx'));
export const AdminLiveActivity = lazy(() => import('../pages/admin/AdminLiveActivity.jsx'));
export const AdminTelnyx = lazy(() => import('../pages/admin/AdminTelnyx.jsx'));
export const AdminStripe = lazy(() => import('../pages/admin/AdminStripe.jsx'));
export const AdminTeam = lazy(() => import('../pages/admin/AdminTeam.jsx'));
export const AdminUserDetail = lazy(() => import('../pages/admin/AdminUserDetail.jsx'));
export const AdminUsers = lazy(() => import('../pages/admin/AdminUsers.jsx'));
export const SiteBuilder = lazy(() => import('../pages/admin/site/SiteBuilder.jsx'));
export const SiteEnvironment = lazy(() => import('../pages/admin/site/SiteEnvironment.jsx'));
export const SiteSeo = lazy(() => import('../pages/admin/site/SiteSeo.jsx'));

/** Marketing blog */
export const Blog = lazy(() => import('../pages/Blog.jsx'));
export const BlogPost = lazy(() => import('../pages/BlogPost.jsx'));
