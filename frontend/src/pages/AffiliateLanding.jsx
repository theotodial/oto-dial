import { Link } from 'react-router-dom';

function AffiliateLanding() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 pt-24 pb-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-8 md:p-12 shadow-lg">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            OTO DIAL Affiliate Program
          </h1>
          <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">
            Become an affiliate partner, share your referral link, and manage referred users in your dedicated affiliate panel.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <Link
              to="/affiliate/signup"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
            >
              Affiliate Sign Up
            </Link>
            <Link
              to="/affiliate/login"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              Affiliate Login
            </Link>
          </div>

          <div className="mt-8 p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
            New affiliate accounts are reviewed manually. After signup, you will see a pending approval message until admin approval is completed.
          </div>
        </div>
      </div>
    </div>
  );
}

export default AffiliateLanding;
