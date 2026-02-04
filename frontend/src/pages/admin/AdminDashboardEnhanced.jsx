import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import API from '../../api';

function AdminDashboardEnhanced() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [timeSeries, setTimeSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('30d');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [timeFilter]);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      
      const [analyticsRes, timeSeriesRes] = await Promise.all([
        API.get(`/api/admin/analytics?filter=${timeFilter}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        API.get(`/api/admin/analytics/time-series?filter=${timeFilter}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (analyticsRes.error || timeSeriesRes.error) {
        setError(analyticsRes.error || timeSeriesRes.error);
      } else {
        if (analyticsRes.data?.success) setAnalytics(analyticsRes.data);
        if (timeSeriesRes.data?.success) {
          // Backend returns: { financial: [...], calls: [...], sms: [...] }
          setTimeSeries(timeSeriesRes.data);
        }
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
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Users
              </button>
              <button
                onClick={() => navigate('/adminbobby/calls')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Calls
              </button>
              <button
                onClick={() => navigate('/adminbobby/sms')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                SMS
              </button>
              <button
                onClick={() => navigate('/adminbobby/numbers')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Numbers
              </button>
              <button
                onClick={() => navigate('/adminbobby/support')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Support
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

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {analytics && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div 
                onClick={() => navigate('/adminbobby/calls')}
                className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow border-2 border-transparent hover:border-indigo-500"
              >
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Calls</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {(analytics.voice?.totalOutboundCalls || 0) + (analytics.voice?.totalInboundCalls || 0)}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Click to view details →</p>
              </div>
              <div 
                onClick={() => navigate('/adminbobby/sms')}
                className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow border-2 border-transparent hover:border-indigo-500"
              >
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total SMS</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {(analytics.messaging?.totalSmsSent || 0) + (analytics.messaging?.totalSmsReceived || 0)}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Click to view details →</p>
              </div>
              <div 
                onClick={() => navigate('/adminbobby/numbers')}
                className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 cursor-pointer hover:shadow-lg transition-shadow border-2 border-transparent hover:border-indigo-500"
              >
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Phone Numbers</h3>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {analytics.subscriptions?.total || 0}
                </p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Click to view details →</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Total Revenue</h3>
                <p className="text-3xl font-bold text-green-600">${analytics.financial?.totalRevenue?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Telnyx Cost</h3>
                <p className="text-3xl font-bold text-red-600">${analytics.financial?.totalTelnyxCost?.toFixed(2) || '0.00'}</p>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Net Profit</h3>
                <p className={`text-3xl font-bold ${analytics.financial?.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${analytics.financial?.netProfit?.toFixed(2) || '0.00'}
                </p>
              </div>
            </div>

            {/* Charts */}
            {timeSeries && (
              <div className="space-y-8">
                {/* Financial Chart */}
                {timeSeries.financial && Array.isArray(timeSeries.financial) && timeSeries.financial.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Financial Overview</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={timeSeries.financial}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          }}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="revenue" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Revenue" />
                        <Area type="monotone" dataKey="cost" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Telnyx Cost" />
                        <Line type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={2} name="Profit" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Calls Chart */}
                {timeSeries.calls && Array.isArray(timeSeries.calls) && timeSeries.calls.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Calls Over Time</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={timeSeries.calls}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          }}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="outbound" fill="#3b82f6" name="Outbound" />
                        <Bar dataKey="inbound" fill="#10b981" name="Inbound" />
                        <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* SMS Chart */}
                {timeSeries.sms && Array.isArray(timeSeries.sms) && timeSeries.sms.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">SMS Over Time</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={timeSeries.sms}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          }}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2} name="Sent" />
                        <Line type="monotone" dataKey="received" stroke="#10b981" strokeWidth={2} name="Received" />
                        <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} name="Failed" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Call Minutes Chart */}
                {timeSeries.calls && Array.isArray(timeSeries.calls) && timeSeries.calls.length > 0 && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Call Minutes Over Time</h2>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={timeSeries.calls}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => {
                            const date = new Date(value);
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          }}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="minutes" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.6} name="Call Minutes" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboardEnhanced;
