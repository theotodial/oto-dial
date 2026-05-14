/** Shared loading UI for lazy routes — matches OTODIAL indigo / gray palette. */

function SpinnerRing({ className = '' }) {
  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-2xl bg-indigo-500/12 dark:bg-indigo-400/10 animate-pulse" />
      <div className="relative h-11 w-11 rounded-full border-2 border-indigo-100 dark:border-indigo-900 border-t-indigo-600 dark:border-t-indigo-400 animate-spin" />
    </div>
  );
}

/** Full viewport — login, blog, OAuth, marketing home while chunk loads */
export default function RouteFallback({ belowNav = false }) {
  const vertical =
    belowNav
      ? 'min-h-[calc(100vh-4rem)] pt-10 pb-16'
      : 'min-h-screen';

  return (
    <div
      className={`flex flex-col items-center justify-center gap-6 px-6 bg-white dark:bg-slate-900 ${vertical}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <SpinnerRing />
      <div className="text-center space-y-1 max-w-sm">
        <p className="text-sm font-semibold text-gray-900 dark:text-white tracking-tight">
          Loading OTODIAL
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Preparing this screen — usually just a moment.
        </p>
      </div>
    </div>
  );
}

/** Inside DashboardLayout main column — keeps sidebar visible */
export function DashboardPageFallback() {
  return (
    <div
      className="min-h-[50vh] flex flex-col items-center justify-center gap-5 px-6 py-16 bg-gray-50 dark:bg-slate-800"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <SpinnerRing />
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Loading workspace</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Fetching dialer tools &amp; settings…</p>
      </div>
      <div className="w-full max-w-md space-y-2 mt-4">
        <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full w-2/5 rounded-full bg-indigo-500/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/** Inside AdminLayout content column */
export function AdminPageFallback() {
  return (
    <div
      className="min-h-[50vh] flex flex-col items-center justify-center gap-5 px-6 py-16 bg-gray-50 dark:bg-slate-900"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <SpinnerRing />
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Loading admin console</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Pulling analytics &amp; controls…</p>
      </div>
    </div>
  );
}
