import { Suspense, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminPageFallback } from './loadingFallbacks';
import AdminSidebar from './AdminSidebar';
import { canSeeAdminNavItem, readStoredAdminProfile } from '../utils/adminAccess';

const overviewTabs = [
  { path: '/adminbobby/dashboard', label: 'Dashboard', role: 'dashboard' },
  { path: '/adminbobby/analytics', label: 'Analytics', role: 'analytics' },
  { path: '/adminbobby/analytics/profitability-tools', label: 'Profit tools', role: 'analytics' },
];

function AdminOverviewTabs() {
  const location = useLocation();
  const adminProfile = readStoredAdminProfile();
  const tabs = overviewTabs.filter((tab) => canSeeAdminNavItem(adminProfile, tab));
  if (tabs.length < 2) return null;

  return (
    <div className="sticky top-0 z-20 border-b border-gray-200 dark:border-slate-700 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive =
            tab.path === '/adminbobby/analytics/profitability-tools'
              ? location.pathname.startsWith('/adminbobby/analytics/profitability-tools')
              : location.pathname === tab.path ||
                (tab.path === '/adminbobby/analytics' &&
                  location.pathname.startsWith('/adminbobby/analytics/') &&
                  !location.pathname.startsWith('/adminbobby/analytics/profitability-tools'));
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-slate-600 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
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

function AdminLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100">
      {/* Mobile Hamburger Button */}
      <button
        id="mobile-sidebar-button"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`lg:hidden fixed top-2 z-50 w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all duration-300 ${
          mobileMenuOpen ? 'left-[104px]' : 'left-2'
        }`}
      >
        {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      <AdminSidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-slate-900 lg:ml-0 pt-0 antialiased">
        <AdminOverviewTabs />
        <Suspense fallback={<AdminPageFallback />}>{children}</Suspense>
      </div>
    </div>
  );
}

export default AdminLayout;
