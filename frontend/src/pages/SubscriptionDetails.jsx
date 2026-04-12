import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import API from '../api';

function SubscriptionDetails() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshSubscription } = useSubscription();
  const [subscription, setSubscription] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const isMountedRef = useRef(true);

  const fetchSubscriptionDetails = useCallback(async () => {
    if (!isMountedRef.current) return;

    setLoading(true);
    setError('');

    try {
      const subData = await refreshSubscription();

      if (!isMountedRef.current) return;

      if (!subData) {
        setError('Failed to load subscription details');
        setSubscription(null);
      } else {
        setSubscription(subData);
      }

      const statsRes = await API.get('/api/usage/statistics').catch(() => ({ error: true }));

      if (!isMountedRef.current) return;

      if (!statsRes.error && statsRes.data) {
        setStatistics(statsRes.data);
      } else {
        setStatistics({
          calls: { made: 0, received: 0, rings: 0, total: 0 },
          sms: { sent: 0, received: 0, total: 0 }
        });
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Failed to fetch subscription details:', err);
      setError('Failed to load subscription details');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [refreshSubscription]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchSubscriptionDetails();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchSubscriptionDetails]);

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? No refunds will be issued. Your account will remain active until the end of the current billing cycle.')) {
      return;
    }

    if (!isMountedRef.current) return;
    
    setCancelling(true);
    setError('');

    try {
      const response = await API.post('/api/subscription/cancel');
      
      if (!isMountedRef.current) return;

      if (response.error) {
        setError(response.error);
      } else {
        // Refresh subscription data to show updated status
        await fetchSubscriptionDetails();
        setSuccess('Subscription cancelled successfully. Your account will remain active until the end of the current billing cycle.');
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.response?.data?.error || 'Failed to cancel subscription');
    } finally {
      if (isMountedRef.current) {
        setCancelling(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading subscription details...</p>
        </div>
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-6">
        <div className="text-center max-w-md">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 mb-4 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Subscription Details</h1>
          <p className="text-gray-600 dark:text-gray-400">View your plan information, usage statistics, and manage your subscription</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl">
            {success}
          </div>
        )}

        <div className="space-y-6">
          {/* Plan Information Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Plan Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Plan Name</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {subscription?.planName || 'No Plan'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  subscription?.status === 'active'
                    ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300'
                }`}>
                  {subscription?.status || 'Inactive'}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Expiry Date</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {subscription?.periodEnd
                    ? new Date(subscription.periodEnd).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })
                    : 'N/A'}
                </p>
                {subscription?.periodEnd && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {Math.ceil((new Date(subscription.periodEnd) - new Date()) / (1000 * 60 * 60 * 24))} days remaining
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Billing Cycle</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">Monthly</p>
              </div>
            </div>
          </div>

          {/* Usage Limits Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Usage Limits</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Minutes</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {subscription?.limits?.minutesTotal || subscription?.totalMinutes || 2500}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Remaining Minutes</p>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {subscription?.isUnlimited ? '∞' : parseFloat(subscription?.minutesRemaining || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total SMS</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {subscription?.limits?.smsTotal || subscription?.totalSMS || 200}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Remaining SMS</p>
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {subscription?.isUnlimited ? '∞' : (subscription?.smsRemaining || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Add-on showcase */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl shadow-lg border border-emerald-100 dark:border-emerald-800 p-6">
            <h2 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
              Need more minutes or SMS?
            </h2>
            <p className="text-sm text-emerald-800/90 dark:text-emerald-100/80 mb-3">
              If you’re running close to your plan limits, you can purchase add-ons for extra minutes and
              SMS. Add-ons are applied on top of your current subscription and last for 30 days from
              purchase.
            </p>
            <button
              onClick={() => navigate('/billing')}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium shadow-sm"
            >
              Open Billing to buy add-ons
            </button>
          </div>

          {/* Call Statistics Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Call Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Calls Made</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {statistics?.calls?.made || 0}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Calls Received</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {statistics?.calls?.received || 0}
                </p>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Rings (Unanswered)</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {statistics?.calls?.rings || 0}
                </p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Calls</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {statistics?.calls?.total || 0}
                </p>
              </div>
            </div>
          </div>

          {/* SMS Statistics Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">SMS Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">SMS Sent</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {statistics?.sms?.sent || 0}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">SMS Received</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {statistics?.sms?.received || 0}
                </p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total SMS</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {statistics?.sms?.total || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Actions Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Subscription Actions</h2>
            <div className="space-y-4">
              {(() => {
                const subscriptionStatus = subscription?.status || subscription?.subscription?.status;
                const isActive = subscriptionStatus === 'active';
                const isCancelled = subscriptionStatus === 'cancelled';
                
                if (isActive) {
                  return (
                    <>
                      <button
                        onClick={handleCancelSubscription}
                        disabled={cancelling}
                        className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {cancelling ? 'Cancelling...' : 'Cancel Subscription'}
                      </button>
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                        Note: No refunds will be issued. Your account will remain active until the end of the current billing cycle.
                      </p>
                    </>
                  );
                } else if (isCancelled) {
                  return (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                      <p className="text-sm text-yellow-800 dark:text-yellow-300 text-center">
                        Your subscription has been cancelled. Your account will remain active until the end of the current billing cycle.
                      </p>
                    </div>
                  );
                } else {
                  return (
                    <button
                      onClick={() => navigate('/billing')}
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
                    >
                      Subscribe Now
                    </button>
                  );
                }
              })()}
              <button
                onClick={() => navigate('/billing')}
                className="w-full py-3 px-4 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 text-gray-900 dark:text-white rounded-xl font-medium transition-colors"
              >
                Manage Billing
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionDetails;
