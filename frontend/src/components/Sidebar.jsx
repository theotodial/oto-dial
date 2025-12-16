import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';

// Icon components
const DashboardIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const DialerIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const ChatIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const BillingIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const ProfileIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const SunIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const MoonIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
  </svg>
);

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { path: '/dialer', label: 'Dialer', icon: DialerIcon },
  { path: '/chat', label: 'Chat', icon: ChatIcon },
  { path: '/billing', label: 'Billing', icon: BillingIcon },
  { path: '/profile', label: 'Profile', icon: ProfileIcon },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('user_id');
    navigate('/login');
  };

  return (
    <div className="w-24 bg-gradient-to-b from-indigo-600 to-purple-700 dark:from-slate-800 dark:to-slate-900 flex flex-col items-center py-6 h-full shadow-xl">
      {/* Logo */}
      <Link to="/dashboard" className="mb-8">
        <div className="w-14 h-14 bg-white/20 hover:bg-white/30 transition-all rounded-xl flex items-center justify-center group">
          <span className="text-white font-bold text-xl group-hover:scale-110 transition-transform">OD</span>
        </div>
      </Link>

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col items-center space-y-3 w-full px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`
                w-16 h-16 rounded-xl flex flex-col items-center justify-center
                transition-all duration-200 group relative
                ${isActive 
                  ? 'bg-white/25 text-white shadow-lg scale-105' 
                  : 'text-white/70 hover:bg-white/15 hover:text-white hover:scale-105'
                }
              `}
              title={item.label}
            >
              <Icon />
              <span className="text-[9px] mt-1 font-semibold uppercase tracking-wide">{item.label}</span>
              
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-white rounded-r-full shadow-lg" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section - Theme Toggle & Logout */}
      <div className="mt-auto flex flex-col items-center space-y-3 px-3 pt-4 border-t border-white/20">
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="w-16 h-14 rounded-xl flex flex-col items-center justify-center
                     text-white/70 hover:bg-white/15 hover:text-white hover:scale-105
                     transition-all duration-200"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <SunIcon /> : <MoonIcon />}
          <span className="text-[9px] mt-1 font-semibold uppercase tracking-wide">{isDarkMode ? 'Light' : 'Dark'}</span>
        </button>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-16 h-14 rounded-xl flex flex-col items-center justify-center
                     text-white/70 hover:bg-red-500/30 hover:text-white hover:scale-105
                     transition-all duration-200"
          title="Logout"
        >
          <LogoutIcon />
          <span className="text-[9px] mt-1 font-semibold uppercase tracking-wide">Logout</span>
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
