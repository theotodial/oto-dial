import { useState } from 'react';
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

function DashboardLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-gray-50 dark:bg-slate-900">
      {/* Mobile Hamburger Button - Outside sidebar, always visible, positioned next to sidebar when open */}
      <button
        id="mobile-sidebar-button"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className={`lg:hidden fixed top-2 z-50 w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all duration-300 ${
          mobileMenuOpen ? 'left-[104px]' : 'left-2'
        }`}
      >
        {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-800 lg:ml-0 pt-0">
        {children}
      </div>
    </div>
  );
}

export default DashboardLayout;
