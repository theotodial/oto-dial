import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/otodial-logo.png';

function userInitials(u) {
  if (!u) return 'U';
  const f = u.firstName?.trim()?.[0];
  const l = u.lastName?.trim()?.[0];
  if (f && l) return `${f}${l}`.toUpperCase();
  if (f) return f.toUpperCase();
  const email = u.email || '';
  return email.charAt(0).toUpperCase() || 'U';
}

// Icon components
const DashboardIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

const RecentsIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SupportIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
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

const CampaignIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.25-1.929 7.25-5.25V18.75M5.436 13.683L3.604 5.416A1 1 0 004 5h2.5M5.436 13.683l6.092 3.348" />
  </svg>
);

function Sidebar({ mobileMenuOpen = false, setMobileMenuOpen = () => {} }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDarkMode, toggleTheme } = useTheme();
  const { logout, user: authUser } = useAuth();
  const display = authUser || {};
  const f = authUser?.features || { voiceEnabled: true, campaignEnabled: false };
  const voiceOn = f.voiceEnabled !== false;
  const campaignOn = Boolean(f.campaignEnabled);
  const homePath = voiceOn ? '/recents' : campaignOn ? '/campaign' : '/dashboard';

  const navItems = [];
  if (voiceOn) {
    navItems.push({ path: '/recents', label: 'Voice', icon: RecentsIcon });
  }
  if (campaignOn && !voiceOn) {
    navItems.push({ path: '/campaign', label: 'Campaign', icon: CampaignIcon });
  }
  navItems.push({ path: '/dashboard', label: 'Dashboard', icon: DashboardIcon });
  if (campaignOn && voiceOn) {
    navItems.push({ path: '/campaign', label: 'Campaign', icon: CampaignIcon });
  }
  navItems.push({ path: '/support', label: 'Support', icon: SupportIcon });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

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
        w-24 bg-gradient-to-b from-indigo-600 to-purple-700 dark:from-slate-800 dark:to-slate-900 
        flex flex-col items-center py-6 h-full shadow-xl
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
      {/* Logo */}
      <Link
        to={homePath}
        className="mb-8 block px-1"
        onClick={() => setMobileMenuOpen(false)}
        aria-label="OTO Dial home"
      >
        <img
          src={logo}
          alt="OTO Dial"
          className="w-14 h-14 object-contain mx-auto hover:opacity-90 transition-opacity"
        />
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
              onClick={() => setMobileMenuOpen(false)}
              className={`
                w-16 h-16 rounded-xl flex flex-col items-center justify-center
                transition-all duration-200 group relative
                flex
                ${isActive 
                  ? 'bg-white/25 text-white shadow-lg scale-105' 
                  : 'text-white/70 hover:bg-white/15 hover:text-white hover:scale-105'
                }
              `}
              title={item.label}
            >
              <Icon />
              <span className="text-[9px] mt-1 font-semibold uppercase tracking-wide">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Profile — compact round avatar */}
      <div className="mt-3 flex flex-col items-center px-3 w-full">
        <Link
          to="/profile"
          onClick={() => setMobileMenuOpen(false)}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full
                     bg-white/20 text-white shadow-sm ring-1 ring-white/35
                     hover:bg-white/30 hover:ring-white/50 hover:scale-105 transition-all duration-200"
          title="Profile"
          aria-label="View profile"
        >
          {display.profilePicture ? (
            <img
              src={display.profilePicture}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          ) : (
            <span className="relative z-10 text-xs font-bold leading-none drop-shadow-sm">
              {userInitials(display)}
            </span>
          )}
        </Link>
        <span className="text-[8px] mt-0.5 font-semibold uppercase tracking-wide text-white/75 text-center max-w-[4.5rem] truncate">
          Profile
        </span>
      </div>

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
    </>
  );
}

export default Sidebar;
