import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { MobileSidebarContext } from '../context/MobileSidebarContext';
import { useAuth } from '../context/AuthContext';

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
  const { token, user } = useAuth();
  const emailBannerPad = Boolean(token && user?.isEmailVerified === false);

  // Pages that should open sidebar instead of going back
  const pagesWithSidebarToggle = [
    '/dashboard',
    '/recents',
    '/voice',
    '/campaign',
    '/support'
  ];

  // Pages that have their own back button, so hide the mobile button completely
  const pagesWithOwnBackButton = [
    '/subscription-details'
  ];

  // Sidebar toggle is merged into the page header (Dashboard / Profile / Billing)
  const pagesWithMergedMobileHeader = ['/dashboard', '/profile', '/billing'];

  const shouldToggleSidebar = pagesWithSidebarToggle.includes(location.pathname);
  const shouldHideMobileButton = pagesWithOwnBackButton.includes(location.pathname);
  const mergedMobileHeader = pagesWithMergedMobileHeader.includes(location.pathname);
  
  // Check if dialer is active by looking for dialer-specific elements
  const [isDialerActive, setIsDialerActive] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  useEffect(() => {
    const checkDialerActive = () => {
      // Check if we're on /recents and dialer content is visible
      if (location.pathname === '/recents') {
        // Look for the dialer section - it has the number pad
        const dialerSection = document.querySelector('.flex-1.flex.flex-col.justify-center.px-3.py-3.bg-gray-50');
        const hasNumberPad = dialerSection && dialerSection.textContent.includes('ABC');
        setIsDialerActive(hasNumberPad || false);
      } else {
        setIsDialerActive(false);
      }
    };

    const checkChatOpen = () => {
      // Check if a chat is open using data attribute set by Recents component
      const chatOpen = document.body.getAttribute('data-chat-open') === 'true';
      setIsChatOpen(chatOpen && location.pathname === '/recents');
    };
    
    checkDialerActive();
    checkChatOpen();
    
    // Check periodically when on recents page
    const interval = setInterval(() => {
      if (location.pathname === '/recents') {
        checkDialerActive();
        checkChatOpen();
      }
    }, 300);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleButtonClick = () => {
    if (isChatOpen) {
      // If chat is open, go back to chats list
      // This will be handled by Recents component via event or we can use history
      window.dispatchEvent(new CustomEvent('closeChat'));
      navigate('/recents');
    } else if (shouldToggleSidebar) {
      // Open/close sidebar on dashboard, voice, support pages
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      // Go back on other pages
      navigate(-1);
    }
  };

  // Recents already shows an in-header back control when a thread is open; hide this
  // overlay so it does not stack on top of that button (same z-index / hit area).
  const hideFloatingOnRecentsInlineChat =
    location.pathname === '/recents' && isChatOpen;

  const showFloatingMobileBtn =
    !shouldHideMobileButton &&
    !isDialerActive &&
    !mergedMobileHeader &&
    !hideFloatingOnRecentsInlineChat;

  const sidebarContextValue = {
    toggleSidebar: () => setMobileMenuOpen((o) => !o),
    closeSidebar: () => setMobileMenuOpen(false),
    isOpen: mobileMenuOpen,
  };

  return (
    <MobileSidebarContext.Provider value={sidebarContextValue}>
      <div className="h-screen w-screen flex overflow-hidden bg-gray-50 dark:bg-slate-900">
        {/* Mobile Back/Sidebar — hidden when page merges menu into its own header */}
        {showFloatingMobileBtn && (
          <button
            onClick={handleButtonClick}
            className={`lg:hidden fixed left-3 z-40 w-10 h-10 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-lg flex items-center justify-center shadow-lg hover:bg-gray-50 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-600 transition-all duration-300 ${
              emailBannerPad ? 'top-[4.25rem]' : 'top-3'
            }`}
            aria-label={isChatOpen ? "Go back to chats" : shouldToggleSidebar ? "Toggle menu" : "Go back"}
          >
            {isChatOpen ? <BackIcon /> : shouldToggleSidebar ? (mobileMenuOpen ? <CloseIcon /> : <MenuIcon />) : <BackIcon />}
          </button>
        )}

        <Sidebar mobileMenuOpen={mobileMenuOpen} setMobileMenuOpen={setMobileMenuOpen} />
        <div
          className={`flex-1 overflow-auto bg-gray-50 dark:bg-slate-800 lg:ml-0 ${
            emailBannerPad ? 'pt-12 sm:pt-14' : 'pt-0'
          }`}
        >
          {children}
        </div>
      </div>
    </MobileSidebarContext.Provider>
  );
}

export default DashboardLayout;
