import { Link, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { shouldShowIdentityBanner } from '../utils/identityBanner';

function MenuIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

/**
 * Sticky compliance notice for users who have not completed identity verification.
 * Hidden after submission (pending) or approval.
 */
export default function IdentityVerificationBanner({ mobileMenuButton = null }) {
  const { token, user, refreshUser } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!shouldShowIdentityBanner({ token, user, pathname: location.pathname })) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      refreshUser?.();
    }, 30 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [token, user, location.pathname, refreshUser]);

  if (!shouldShowIdentityBanner({ token, user, pathname: location.pathname })) {
    return null;
  }

  const status = user.identityVerificationStatus || 'not_submitted';
  const isRejected = status === 'rejected';

  const menuBtn = mobileMenuButton ? (
    <button
      type="button"
      onClick={mobileMenuButton.onClick}
      className="lg:hidden flex-shrink-0 w-10 h-10 rounded-lg bg-white/90 dark:bg-slate-800/90 text-gray-700 dark:text-gray-300 flex items-center justify-center shadow-sm border border-indigo-200/60 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-700 transition-colors"
      aria-label={mobileMenuButton.ariaLabel}
    >
      {mobileMenuButton.icon === 'close' ? <CloseIcon /> : mobileMenuButton.icon === 'back' ? <BackIcon /> : <MenuIcon />}
    </button>
  ) : null;

  return (
    <div
      className="sticky top-0 z-30 border-b border-indigo-200/80 bg-gradient-to-r from-indigo-50 via-white to-indigo-50 dark:from-indigo-950/90 dark:via-slate-900 dark:to-indigo-950/90 dark:border-indigo-800/60 shadow-sm"
      role="region"
      aria-label="Identity verification"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {menuBtn}
          <div
            className={`flex-shrink-0 w-9 h-9 rounded-lg bg-indigo-600 text-white items-center justify-center shadow-sm ${
              menuBtn ? 'hidden sm:flex' : 'flex'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {isRejected ? 'Identity verification required' : 'Verify your identity to continue smoothly'}
            </p>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
              {isRejected
                ? 'Your previous verification could not be approved. Please submit updated documents to restore full access.'
                : 'OTODIAL requires a one-time identity check for telecom compliance. Complete verification to avoid interruptions to calling, SMS, and billing.'}
            </p>
          </div>
        </div>
        <Link
          to="/identity-verification"
          className="inline-flex items-center justify-center shrink-0 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors sm:ml-0 ml-0"
        >
          Verify identity
        </Link>
      </div>
    </div>
  );
}
