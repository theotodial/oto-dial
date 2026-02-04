import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';

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

const BackIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

function DashboardLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Pages that should show back button instead of sidebar button
  const pagesWithBackButton = [
    '/buy-number',
    '/profile'
  ];

  // Pages that have their own back button, so hide the mobile button completely
  const pagesWithOwnBackButton = [
    '/subscription-details'
  ];

  const shouldShowBackButton = pagesWithBackButton.includes(location.pathname);
  const shouldHideMobileButton = pagesWithOwnBackButton.includes(location.pathname);

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gray-50 dark:bg-slate-900">
      {/* Mobile Back Button or Hamburger Button */}
      {!shouldHideMobileButton && (
        shouldShowBackButton ? (
          <button
            onClick={handleBack}
            className="lg:hidden fixed top-2 left-2 z-50 w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all duration-300"
          >
            <BackIcon />
          </button>
        ) : (
          <button
            id="mobile-sidebar-button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden fixed top-2 z-50 w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all duration-300 ${
              mobileMenuOpen ? 'left-[104px]' : 'left-2'
            }`}
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        )
      )}

      <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-800 lg:ml-0 pt-0">
        {children}
      </div>
    </div>
  );
}

export default DashboardLayout;
