import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

// Chevron icons for expandable sections
const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const navItems = [
  { path: '/adminbobby/dashboard', label: 'Dashboard' },
  { path: '/adminbobby/users', label: 'Users' },
  { path: '/adminbobby/support', label: 'Support' },
  { path: '/adminbobby/team', label: 'Team' },
  { path: '/adminbobby/blog', label: 'Blog' },
];

const communicationsItems = [
  { path: '/adminbobby/calls', label: 'Calls' },
  { path: '/adminbobby/sms', label: 'SMS' },
  { path: '/adminbobby/numbers', label: 'Numbers' },
];

function AdminSidebar({ mobileMenuOpen = false, setMobileMenuOpen = () => {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const [communicationsOpen, setCommunicationsOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/adminbobby');
  };

  // Check if any communications item is active
  const isCommunicationsActive = communicationsItems.some(item => 
    location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  return (
    <>
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700
        flex flex-col h-full shadow-sm
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="px-4 py-5 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Panel</h2>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto py-4">
          {/* Main Navigation Items */}
          <div className="px-2 space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center px-3 py-2.5 rounded-lg
                    transition-all duration-200 text-sm font-medium
                    ${isActive 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }
                  `}
                >
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Communications Section */}
          <div className="mt-6 px-2">
            <button
              onClick={() => setCommunicationsOpen(!communicationsOpen)}
              className={`
                w-full flex items-center justify-between px-3 py-2.5 rounded-lg
                transition-all duration-200 text-sm font-semibold
                ${isCommunicationsActive 
                  ? 'text-indigo-600 dark:text-indigo-400' 
                  : 'text-gray-700 dark:text-gray-300'
                }
                hover:bg-gray-50 dark:hover:bg-slate-800
              `}
            >
              <span>COMMUNICATIONS</span>
              {communicationsOpen ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>

            {/* Communications Sub-items */}
            {communicationsOpen && (
              <div className="mt-1 ml-8 space-y-1">
                {communicationsItems.map((item) => {
                  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => {
                        setMobileMenuOpen(false);
                      }}
                      className={`
                        flex items-center px-3 py-2 rounded-lg
                        transition-all duration-200 text-sm
                        ${isActive 
                          ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium' 
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800'
                        }
                      `}
                    >
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Bottom section - Theme Toggle & Logout */}
        <div className="px-4 py-4 border-t border-gray-200 dark:border-slate-700 space-y-2">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center px-3 py-2.5 rounded-lg
                     text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800
                     transition-all duration-200 text-sm font-medium"
          >
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center px-3 py-2.5 rounded-lg
                     text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20
                     transition-all duration-200 text-sm font-medium"
          >
            <span>Logout</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default AdminSidebar;
