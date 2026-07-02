import { Suspense, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminPageFallback } from './loadingFallbacks';
import AdminSidebar from './AdminSidebar';
import AdminNotificationBell from './admin/AdminNotificationBell';
import AdminNavBadge from './admin/AdminNavBadge';
import { AdminNavCountsProvider, useAdminNavCounts } from '../context/AdminNavCountsContext';
import { canSeeAdminNavItem, hasAdminRole, readStoredAdminProfile } from '../utils/adminAccess';

const overviewTabs = [
  { path: '/adminbobby/dashboard', label: 'Dashboard', role: 'dashboard' },
  { path: '/adminbobby/analytics', label: 'Analytics', role: 'analytics' },
  { path: '/adminbobby/live-activity', label: 'Live Activity', role: 'dashboard' },
  { path: '/adminbobby/telnyx', label: 'Telnyx', role: 'dashboard' },
  { path: '/adminbobby/stripe', label: 'Stripe', role: 'analytics' },
  { path: '/adminbobby/users', label: 'Users', role: 'users', badgeKey: 'users' },
  { path: '/adminbobby/support', label: 'Support', role: 'support', badgeKey: 'support' },
  { path: '/adminbobby/analytics/profitability-tools', label: 'Profit tools', role: 'analytics' },
];

function isOverviewTabActive(tab, pathname) {
  if (tab.path === '/adminbobby/analytics/profitability-tools') {
    return pathname.startsWith('/adminbobby/analytics/profitability-tools');
  }
  if (tab.path === '/adminbobby/live-activity') {
    return pathname === '/adminbobby/live-activity';
  }
  if (tab.path === '/adminbobby/telnyx') {
    return pathname === '/adminbobby/telnyx';
  }
  if (tab.path === '/adminbobby/stripe') {
    return pathname === '/adminbobby/stripe';
  }
  if (tab.path === '/adminbobby/users') {
    return pathname === '/adminbobby/users' || pathname.startsWith('/adminbobby/users/');
  }
  if (tab.path === '/adminbobby/support') {
    return pathname === '/adminbobby/support' || pathname.startsWith('/adminbobby/support/');
  }
  if (tab.path === '/adminbobby/analytics') {
    return (
      pathname === '/adminbobby/analytics' ||
      (pathname.startsWith('/adminbobby/analytics/') &&
        !pathname.startsWith('/adminbobby/analytics/profitability-tools'))
    );
  }
  return pathname === tab.path || pathname.startsWith(`${tab.path}/`);
}

function AdminUsersAcknowledge() {
  const location = useLocation();
  const { acknowledgeSignupNotifications } = useAdminNavCounts();

  useEffect(() => {
    if (location.pathname === '/adminbobby/users' || location.pathname.startsWith('/adminbobby/users/')) {
      acknowledgeSignupNotifications();
    }
  }, [location.pathname, acknowledgeSignupNotifications]);

  return null;
}

function AdminOverviewTabs() {
  const location = useLocation();
  const { counts } = useAdminNavCounts();
  const adminProfile = readStoredAdminProfile();
  const tabs = overviewTabs.filter((tab) => canSeeAdminNavItem(adminProfile, tab));
  const showBell = hasAdminRole(adminProfile, 'notifications') || hasAdminRole(adminProfile, 'dashboard');

  if (tabs.length < 2 && !showBell) return null;

  return (
    <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-slate-700 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const isActive = isOverviewTabActive(tab, location.pathname);
          const badgeCount = tab.badgeKey ? counts[tab.badgeKey] || 0 : 0;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <span>{tab.label}</span>
              {badgeCount > 0 && (
                <AdminNavBadge
                  count={badgeCount}
                  className={isActive ? 'bg-emerald-400 text-emerald-950' : ''}
                />
              )}
            </Link>
          );
        })}
        {showBell && <AdminNotificationBell />}
      </div>
    </div>
  );
}

const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

function AdminLayoutContent({ children, mobileMenuOpen, setMobileMenuOpen }) {
  return (
    <>
      <AdminUsersAcknowledge />
      <AdminSidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-slate-900 lg:ml-0 pt-0 antialiased">
        <AdminOverviewTabs />
        <Suspense fallback={<AdminPageFallback />}>{children}</Suspense>
      </div>
    </>
  );
}

function AdminLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <AdminNavCountsProvider>
      <div className="h-screen w-screen flex overflow-hidden bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100">
        <button
          id="mobile-sidebar-button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`lg:hidden fixed top-2 z-50 w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all duration-300 ${
            mobileMenuOpen ? 'left-[104px]' : 'left-2'
          }`}
        >
          {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <AdminLayoutContent mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen}>
          {children}
        </AdminLayoutContent>
      </div>
    </AdminNavCountsProvider>
  );
}

export default AdminLayout;
