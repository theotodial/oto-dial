import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { clearAffiliateToken, getAffiliateToken } from '../utils/affiliateAuth';

function AffiliateDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [processingUserId, setProcessingUserId] = useState('');
  const [error, setError] = useState('');
  const [affiliate, setAffiliate] = useState(null);
  const [stats, setStats] = useState({
    totalReferredUsers: 0,
    paidUsers: 0,
    pendingUsers: 0
  });
  const [users, setUsers] = useState([]);

  const affiliateToken = useMemo(() => getAffiliateToken(), []);
  const authConfig = useMemo(
    () => ({
      headers: {
        Authorization: `Bearer ${affiliateToken}`
      }
    }),
    [affiliateToken]
  );

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [meResp, usersResp] = await Promise.all([
        API.get('/api/affiliate/me', authConfig),
        API.get('/api/affiliate/users', authConfig)
      ]);

      if (!meResp?.data?.success || !usersResp?.data?.success) {
        throw new Error(
          meResp?.data?.error ||
            usersResp?.data?.error ||
            meResp?.error ||
            usersResp?.error ||
            'Failed to load affiliate dashboard'
        );
      }

      setAffiliate(meResp.data.affiliate);
      setStats(usersResp.data.stats || {});
      setUsers(usersResp.data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
      if ((err.message || '').toLowerCase().includes('unauthorized')) {
        clearAffiliateToken();
        navigate('/affiliate/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [authConfig, navigate]);

  useEffect(() => {
    if (!affiliateToken) {
      navigate('/affiliate/login', { replace: true });
      return;
    }
    loadDashboard();
  }, [affiliateToken, loadDashboard, navigate]);

  const copyLink = async () => {
    if (!affiliate?.referralLink) return;
    await navigator.clipboard.writeText(affiliate.referralLink);
  };

  const startCheckout = async (userId) => {
    setProcessingUserId(userId);
    setError('');
    try {
      const response = await API.post(
        `/api/affiliate/users/${userId}/checkout-unlimited`,
        {},
        authConfig
      );
      if (!response?.data?.success || !response?.data?.url) {
        throw new Error(response?.data?.error || response?.error || 'Failed to create checkout');
      }
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err.message || 'Failed to create checkout');
    } finally {
      setProcessingUserId('');
    }
  };

  const pauseResume = async (userId, action) => {
    setProcessingUserId(userId);
    setError('');
    try {
      const path =
        action === 'pause'
          ? `/api/affiliate/users/${userId}/subscription/pause`
          : `/api/affiliate/users/${userId}/subscription/resume`;
      const response = await API.post(path, {}, authConfig);
      if (!response?.data?.success) {
        throw new Error(response?.data?.error || response?.error || `Failed to ${action}`);
      }
      await loadDashboard();
    } catch (err) {
      setError(err.message || `Failed to ${action} subscription`);
    } finally {
      setProcessingUserId('');
    }
  };

  const handleLogout = () => {
    clearAffiliateToken();
    navigate('/affiliate/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-300">Loading affiliate dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Affiliate Panel
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm mt-1">
              Welcome{affiliate?.name ? `, ${affiliate.name}` : ''} - your code:{' '}
              <span className="font-semibold">{affiliate?.affiliateCode}</span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Logout
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total signups</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {stats.totalReferredUsers || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Paid users</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {stats.paidUsers || 0}
            </p>
          </div>
          <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-gray-200 dark:border-slate-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Pending users</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {stats.pendingUsers || 0}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Your Affiliate Link
          </h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              readOnly
              value={affiliate?.referralLink || ''}
              className="flex-1 p-3 rounded-lg border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-gray-100"
            />
            <button
              onClick={copyLink}
              className="px-4 py-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Copy Link
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Referred Users
          </h2>

          {users.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No signups yet from your affiliate link.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                    <th className="pb-3 pr-4">User</th>
                    <th className="pb-3 pr-4">Signup</th>
                    <th className="pb-3 pr-4">Subscription</th>
                    <th className="pb-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => {
                    const subscriptionStatus = item.subscription?.status || 'none';
                    const isBusy = processingUserId === item.userId;
                    return (
                      <tr
                        key={item.referralId}
                        className="border-b border-gray-100 dark:border-slate-700/60"
                      >
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.name || 'Unnamed User'}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">{item.email}</div>
                        </td>
                        <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                          {new Date(item.signupAt).toLocaleString()}
                        </td>
                        <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                          {subscriptionStatus}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              disabled={!item.userId || isBusy}
                              onClick={() => startCheckout(item.userId)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Checkout
                            </button>
                            {subscriptionStatus === 'active' && (
                              <button
                                disabled={isBusy}
                                onClick={() => pauseResume(item.userId, 'pause')}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                              >
                                Pause
                              </button>
                            )}
                            {subscriptionStatus === 'suspended' && (
                              <button
                                disabled={isBusy}
                                onClick={() => pauseResume(item.userId, 'resume')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Resume
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AffiliateDashboard;
