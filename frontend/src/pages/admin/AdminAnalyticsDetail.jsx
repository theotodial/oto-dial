import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import API from '../../api';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
const REALTIME_WINDOW_OPTIONS = [
  { value: '15m', label: 'Last 15m' },
  { value: '30m', label: 'Last 30m' },
  { value: '45m', label: 'Last 45m' },
  { value: '1h', label: 'Last 1h' },
  { value: '2h', label: 'Last 2h' },
  { value: '4h', label: 'Last 4h' },
  { value: '6h', label: 'Last 6h' },
  { value: '8h', label: 'Last 8h' },
  { value: '12h', label: 'Last 12h' },
  { value: '24h', label: 'Last 24h' },
  { value: '28h', label: 'Last 28h' },
  { value: '72h', label: 'Last 72h' }
];

function AdminAnalyticsDetail() {
  const { category } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(location.state?.data || null);
  const [meta, setMeta] = useState(location.state?.meta || null);
  const [realtimeWindow, setRealtimeWindow] = useState(location.state?.realtimeWindow || '15m');
  const [dateRange, setDateRange] = useState(
    location.state?.dateRange || {
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    }
  );

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, realtimeWindow]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);
      params.append('realtimeWindow', realtimeWindow);
      const adminToken = localStorage.getItem('adminToken');

      const response = await API.get(`/api/analytics/admin/dashboard?${params.toString()}`, {
        headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
      });
      
      if (response.error) {
        console.error('Error fetching analytics:', response.error);
        if (response.status === 401) {
          localStorage.removeItem('adminToken');
          navigate('/adminbobby');
          return;
        }
        setData(null);
        setMeta({
          source: 'unavailable',
          googleAnalytics: {
            warnings: [response.error]
          }
        });
        return;
      }

      if (response.data?.success) {
        setData(response.data.data);
        setMeta(response.data.meta || null);
      } else {
        setData(null);
        setMeta(null);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
      setData(null);
      setMeta({
        source: 'unavailable',
        googleAnalytics: {
          warnings: [error.message]
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDateTime = (value) => {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  const overview = data?.overview || {
    totalVisitors: 0,
    uniqueVisitors: 0,
    returningVisitors: 0,
    newVisitors: 0,
    signUps: 0,
    usersWithSubscription: 0,
    avgTimeSpent: 0
  };

  const funnel = data?.funnel || {
    totalVisitors: 0,
    uniqueVisitors: 0,
    signedUp: 0,
    withSubscription: 0,
    conversionRate: 0,
    subscriptionRate: 0
  };

  const countries = data?.countries || [];
  const devices = data?.devices || [];
  const browsers = data?.browsers || [];
  const os = data?.os || [];
  const pages = data?.pages || [];
  const dailyVisitors = data?.dailyVisitors || [];
  const topIPs = data?.topIPs || [];
  const realtime = data?.realtime || {};
  const realtimeSummary = realtime?.summary || {
    windowKey: realtimeWindow,
    totalUsers: 0,
    activeNow: 0,
    signedUpUsers: 0,
    subscribedUsers: 0,
    totalTimeSpent: 0,
    deviceBreakdown: [],
    sourceBreakdown: []
  };
  const realtimeUsers = realtime?.users || [];
  const trafficSources = data?.trafficSources || {
    channels: [],
    topSources: [],
    summary: {
      totalVisits: 0,
      totalUniqueVisitors: 0,
      totalSignUps: 0,
      totalSubscriptions: 0,
      byChannel: {}
    }
  };

  const renderDetailContent = () => {
    switch (category) {
      case 'traffic':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Total Visitors</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overview.totalVisitors.toLocaleString()}</div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-6">
                <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">Unique Visitors</div>
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{overview.uniqueVisitors.toLocaleString()}</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-6">
                <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">Avg. Time Spent</div>
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{formatTime(overview.avgTimeSpent)}</div>
              </div>
            </div>
            {dailyVisitors.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Daily Traffic Trend</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={dailyVisitors}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="visitors" stroke="#6366f1" strokeWidth={3} name="Total Visitors" />
                    <Line type="monotone" dataKey="newVisitors" stroke="#10b981" strokeWidth={2} name="New Visitors" />
                    <Line type="monotone" dataKey="returningVisitors" stroke="#8b5cf6" strokeWidth={2} name="Returning Visitors" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );

      case 'returning':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-6">
                <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">Returning Visitors</div>
                <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{overview.returningVisitors.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {overview.totalVisitors > 0 ? ((overview.returningVisitors / overview.totalVisitors) * 100).toFixed(1) : 0}% of total
                </div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">New Visitors</div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{overview.newVisitors.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  {overview.totalVisitors > 0 ? ((overview.newVisitors / overview.totalVisitors) * 100).toFixed(1) : 0}% of total
                </div>
              </div>
            </div>
            {dailyVisitors.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Returning vs New Visitors Trend</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={dailyVisitors}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="returningVisitors" stroke="#8b5cf6" strokeWidth={3} name="Returning" />
                    <Line type="monotone" dataKey="newVisitors" stroke="#10b981" strokeWidth={3} name="New" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );

      case 'conversions':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-6">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Sign Ups</div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{funnel.signedUp.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">{funnel.conversionRate}% of visitors</div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Subscriptions</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{funnel.withSubscription.toLocaleString()}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">{funnel.subscriptionRate}% of sign-ups</div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Conversion Funnel</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Visitors</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{funnel.totalVisitors.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-4">
                    <div className="bg-indigo-600 h-4 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Unique Visitors</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{funnel.uniqueVisitors.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-4">
                    <div className="bg-purple-600 h-4 rounded-full" style={{ width: `${overview.totalVisitors > 0 ? (funnel.uniqueVisitors / funnel.totalVisitors) * 100 : 0}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Signed Up</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{funnel.signedUp.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-4">
                    <div className="bg-green-600 h-4 rounded-full" style={{ width: `${funnel.conversionRate}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subscribed</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{funnel.withSubscription.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-600 rounded-full h-4">
                    <div className="bg-blue-600 h-4 rounded-full" style={{ width: `${funnel.subscriptionRate}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'geographic':
        return (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Countries</h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={countries.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="country" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="visits" fill="#ef4444" radius={[8, 8, 0, 0]} name="Visits" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Country List</h3>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-slate-700">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Country</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Visits</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Unique Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countries.map((country, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{country.country || 'Unknown'}</td>
                        <td className="py-3 px-4 text-right text-gray-900 dark:text-white">{country.visits.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">{country.uniqueVisitors.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'devices':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {devices.map((device, index) => (
                <div key={index} className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-6">
                  <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1 capitalize">{device.device || 'Unknown'}</div>
                  <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{device.count.toLocaleString()}</div>
                </div>
              ))}
            </div>
            {devices.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Device Distribution</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <PieChart>
                    <Pie
                      data={devices}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ device, percent }) => `${device}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {devices.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {browsers.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Browsers</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={browsers}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="browser" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {os.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Operating Systems</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {os.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
                      <span className="text-gray-700 dark:text-gray-300">{item.os}</span>
                      <span className="font-bold text-gray-900 dark:text-white">{item.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'pages':
        return (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Pages Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Page</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Title</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Visits</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Avg. Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((page, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{page.page}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-sm text-gray-600 dark:text-gray-400">{page.pageTitle || 'No title'}</div>
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">{page.visits.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-600 dark:text-gray-400">{formatTime(page.avgTimeSpent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'visitors':
        return (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Visitor IP Addresses</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">IP Address</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Location</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Visits</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topIPs.map((ip, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="py-3 px-4 font-mono text-sm text-gray-900 dark:text-white">{ip.ipAddress}</td>
                        <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                          {ip.city && ip.country ? `${ip.city}, ${ip.country}` : ip.country || 'Unknown'}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-semibold text-gray-900 dark:text-white">{ip.visits.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-600 dark:text-gray-400">{ip.uniqueSessions.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'realtime':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-6">
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Users in Window</div>
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {(Number(realtimeSummary.totalUsers) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Window: {realtimeSummary.windowKey || realtimeWindow}
                </div>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-6">
                <div className="text-sm text-cyan-600 dark:text-cyan-400 mb-1">Active Now (5m)</div>
                <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                  {(Number(realtimeSummary.activeNow) || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Conversions</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {(Number(realtimeSummary.signedUpUsers) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Signups + subscribers
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-6">
                <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">Subscribers</div>
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {(Number(realtimeSummary.subscribedUsers) || 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Total time spent: {formatTime(Number(realtimeSummary.totalTimeSpent) || 0)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Device Breakdown</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={realtimeSummary.deviceBreakdown || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="device" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Traffic Channel Breakdown</h3>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={realtimeSummary.sourceBreakdown || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="channel" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Realtime Users Detail</h3>
              {realtimeUsers.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No users detected in the selected realtime window.</p>
              ) : (
                <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">User</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Device</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">IP</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Geo</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Time Spent</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Conversion</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Source</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realtimeUsers.map((user, index) => (
                        <tr key={`${user.sessionId || index}-${index}`} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                          <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">
                            <div className="font-medium">{user.userEmail || user.userName || 'Anonymous'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{user.sessionId || 'session'}</div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                            <div>{user.device || 'unknown'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{user.browser || 'unknown'} / {user.os || 'unknown'}</div>
                          </td>
                          <td className="py-3 px-4 text-sm font-mono text-gray-700 dark:text-gray-300">{user.ipAddress || 'unknown'}</td>
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                            {user.city && user.country ? `${user.city}, ${user.country}` : (user.country || 'Unknown')}
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-300">{formatTime(user.timeSpent || 0)}</td>
                          <td className="py-3 px-4 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.conversion === 'subscription'
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                : user.conversion === 'signup'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                  : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
                            }`}>
                              {user.conversion || 'none'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
                            <div className="capitalize">{user.sourceChannel || 'direct'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 break-all">{user.source || 'direct'}</div>
                            {user.referrer && (
                              <div className="text-xs text-gray-400 dark:text-gray-500 break-all mt-1">
                                {user.referrer}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{formatDateTime(user.lastActivity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      case 'sources':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-6">
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">Total Visits</div>
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {(trafficSources.summary?.totalVisits || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-6">
                <div className="text-sm text-cyan-600 dark:text-cyan-400 mb-1">Unique Visitors</div>
                <div className="text-3xl font-bold text-cyan-600 dark:text-cyan-400">
                  {(trafficSources.summary?.totalUniqueVisitors || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Signups</div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {(trafficSources.summary?.totalSignUps || 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-6">
                <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">Subscriptions</div>
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {(trafficSources.summary?.totalSubscriptions || 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Traffic Channels</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={trafficSources.channels || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="channel" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="visits" fill="#10b981" name="Visits" />
                    <Bar dataKey="uniqueVisitors" fill="#06b6d4" name="Unique Visitors" />
                    <Bar dataKey="signUps" fill="#6366f1" name="Signups" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Channel Share</h3>
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={trafficSources.channels || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ channel, percent }) => `${channel}: ${(percent * 100).toFixed(1)}%`}
                      outerRadius={120}
                      dataKey="visits"
                    >
                      {(trafficSources.channels || []).map((entry, index) => (
                        <Cell key={`source-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Sources</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Source</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Channel</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Visits</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Unique</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Signups</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Conv. Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(trafficSources.topSources || []).map((source, index) => (
                      <tr key={`${source.source}-${index}`} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-white break-all">{source.source || 'direct'}</td>
                        <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300 capitalize">{source.channel || 'direct'}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-900 dark:text-white">{(source.visits || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-300">{(source.uniqueVisitors || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-300">{(source.signUps || 0).toLocaleString()}</td>
                        <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-300">{Number(source.conversionRate || 0).toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">Invalid category</p>
          </div>
        );
    }
  };

  const getCategoryTitle = () => {
    const titles = {
      traffic: 'Traffic Overview',
      returning: 'Returning Users',
      conversions: 'Conversions',
      geographic: 'Geographic Data',
      devices: 'Device Analytics',
      pages: 'Page Performance',
      visitors: 'Visitor Details',
      realtime: 'Realtime Active Users',
      sources: 'Traffic Sources'
    };
    return titles[category] || 'Analytics Detail';
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-slate-900 min-h-screen">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/adminbobby/analytics')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{getCategoryTitle()}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Detailed analytics and insights</p>
          </div>
        </div>
        <div className="flex gap-4 flex-wrap justify-end">
          {category === 'realtime' && (
            <select
              value={realtimeWindow}
              onChange={(e) => setRealtimeWindow(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            >
              {REALTIME_WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {meta && (
        <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
          <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
            Data source: {meta.source === 'google_analytics' ? 'Google Analytics (GA4)' : meta.source === 'internal' ? 'Internal Analytics' : 'Unavailable'}
          </p>
          {meta.googleAnalytics?.propertyId && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              GA4 Property ID: {meta.googleAnalytics.propertyId}
            </p>
          )}
          {meta.source === 'google_analytics' && Number.isFinite(data?.overview?.realtimeActiveUsers) && (
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              Realtime active users: {data.overview.realtimeActiveUsers}
            </p>
          )}
          {Array.isArray(meta.googleAnalytics?.warnings) && meta.googleAnalytics.warnings.length > 0 && (
            <ul className="mt-2 text-xs text-indigo-700 dark:text-indigo-300 list-disc pl-5 space-y-1">
              {meta.googleAnalytics.warnings.slice(0, 3).map((warning, idx) => (
                <li key={idx}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {renderDetailContent()}
    </div>
  );
}

export default AdminAnalyticsDetail;
