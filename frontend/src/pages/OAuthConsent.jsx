import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function OAuthConsent() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appInfo, setAppInfo] = useState({
    name: 'Third-party Application',
    description: 'This application is requesting access to your account.',
    scopes: []
  });

  useEffect(() => {
    // Get OAuth parameters from URL
    const clientId = searchParams.get('client_id');
    const redirectUri = searchParams.get('redirect_uri');
    const state = searchParams.get('state');
    const scope = searchParams.get('scope');

    if (!clientId || !redirectUri) {
      setError('Invalid OAuth request. Missing required parameters.');
      setLoading(false);
      return;
    }

    // Parse scopes
    const scopes = scope ? scope.split(' ') : [];
    setAppInfo(prev => ({
      ...prev,
      scopes: scopes
    }));

    setLoading(false);
  }, [searchParams]);

  const { isAuthenticated } = useAuth();

  const handleAllow = async () => {
    setLoading(true);
    setError('');

    try {
      if (!isAuthenticated) {
        // Redirect to login with return URL
        const returnUrl = encodeURIComponent(window.location.href);
        navigate(`/login?return=${returnUrl}`);
        return;
      }

      // Get OAuth parameters
      const clientId = searchParams.get('client_id');
      const redirectUri = searchParams.get('redirect_uri');
      const state = searchParams.get('state');
      const scope = searchParams.get('scope');

      // In a real implementation, you would:
      // 1. Create an authorization code
      // 2. Store it in your database
      // 3. Redirect with the code

      // For now, redirect back with state (simplified flow)
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('state', state || '');
      redirectUrl.searchParams.set('code', 'temp_auth_code'); // Replace with real code
      
      window.location.href = redirectUrl.toString();
    } catch (err) {
      setError(err.message || 'Failed to authorize application');
      setLoading(false);
    }
  };

  const handleDeny = () => {
    const redirectUri = searchParams.get('redirect_uri');
    const state = searchParams.get('state');

    if (redirectUri) {
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set('error', 'access_denied');
      redirectUrl.searchParams.set('state', state || '');
      window.location.href = redirectUrl.toString();
    } else {
      navigate('/recents');
    }
  };

  if (loading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">OD</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            OTO DIAL
          </h1>
        </div>

        {/* Consent Card */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-200 dark:border-slate-700 p-8">
          {error ? (
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-2">
                  Authorization Error
                </h2>
                <p className="text-center text-red-600 dark:text-red-400">
                  {error}
                </p>
              </div>
              <button
                onClick={() => navigate('/recents')}
                className="w-full py-3 px-4 bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Return to Recents
              </button>
            </>
          ) : (
            <>
              {/* App Info */}
              <div className="mb-6">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-2">
                  Authorization Request
                </h2>
                <p className="text-center text-gray-600 dark:text-gray-400 text-sm">
                  <strong>{appInfo.name}</strong> wants to access your OTO DIAL account
                </p>
              </div>

              {/* Permissions */}
              {appInfo.scopes.length > 0 && (
                <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                    This application will be able to:
                  </p>
                  <ul className="space-y-2">
                    {appInfo.scopes.map((scope, index) => (
                      <li key={index} className="flex items-start text-sm text-gray-700 dark:text-gray-300">
                        <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {scope === 'read' && 'Read your profile information'}
                        {scope === 'write' && 'Modify your account data'}
                        {scope === 'email' && 'Access your email address'}
                        {!['read', 'write', 'email'].includes(scope) && scope}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warning */}
              <div className="mb-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-300">
                  <strong>Note:</strong> Only authorize applications you trust. You can revoke access anytime from your account settings.
                </p>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={handleAllow}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Authorizing...' : 'Allow Access'}
                </button>
                <button
                  onClick={handleDeny}
                  disabled={loading}
                  className="w-full py-3 px-4 bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-white rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Deny
                </button>
              </div>

              {/* Footer */}
              <p className="mt-6 text-xs text-center text-gray-500 dark:text-gray-400">
                By clicking "Allow Access", you authorize this application to access your account according to the permissions listed above.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default OAuthConsent;

