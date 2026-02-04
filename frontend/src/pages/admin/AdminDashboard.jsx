import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';

function AdminDashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('30d');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAnalytics();
  }, [timeFilter]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const response = await API.get(`/api/admin/analytics?filter=${timeFilter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.error) {
        setError(response.error);
      } else if (response.data?.success) {
        setAnalytics(response.data);
      } else {
        setError('Failed to load analytics');
      }
    } catch (err) {
      if (err.response?.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/adminbobby');
      } else {
        setError(err.response?.data?.error || 'Failed to load analytics');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/adminbobby');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error && !analytics) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 max-w-md w-full">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchAnalytics}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">OTO DIAL Admin</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Analytics Dashboard</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/adminbobby/users')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Users
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Time Filter */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex gap-2 mb-6">
          {['7d', '30d', '60d', '90d', 'all'].map((filter) => (
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                timeFilter === filter
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {filter === 'all' ? 'All Time' : `Last ${filter}`}
            </button>
          ))}
        </div>

        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Financial Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Revenue</h3>
              <p className="text-2xl font-bold text-green-600">${analytics.financial?.totalRevenue?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Telnyx Cost</h3>
              <p className="text-2xl font-bold text-red-600">${analytics.financial?.totalTelnyxCost?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Net Profit</h3>
              <p className={`text-2xl font-bold ${analytics.financial?.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${analytics.financial?.netProfit?.toFixed(2) || '0.00'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Profit Margin</h3>
              <p className={`text-2xl font-bold ${analytics.financial?.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {analytics.financial?.profitMargin?.toFixed(2) || '0.00'}%
              </p>
            </div>

            {/* Subscription Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Subscriptions</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.subscriptions?.total || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Active</h3>
              <p className="text-2xl font-bold text-green-600">{analytics.subscriptions?.active || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Suspended</h3>
              <p className="text-2xl font-bold text-yellow-600">{analytics.subscriptions?.suspended || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Cancelled</h3>
              <p className="text-2xl font-bold text-red-600">{analytics.subscriptions?.cancelled || 0}</p>
            </div>

            {/* Voice Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Outbound Calls</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.voice?.totalOutboundCalls || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Inbound Calls</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.voice?.totalInboundCalls || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Minutes</h3>
              <p className="text-2xl font-bold text-indigo-600">{analytics.voice?.totalCallMinutes?.toFixed(2) || '0.00'}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Failed Calls</h3>
              <p className="text-2xl font-bold text-red-600">{analytics.voice?.failedCalls || 0}</p>
            </div>

            {/* Messaging Cards */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">SMS Sent</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.messaging?.totalSmsSent || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">SMS Received</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{analytics.messaging?.totalSmsReceived || 0}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Failed SMS</h3>
              <p className="text-2xl font-bold text-red-600">{analytics.messaging?.failedSms || 0}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
