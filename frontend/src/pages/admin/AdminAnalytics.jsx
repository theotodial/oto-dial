import { useState, useEffect } from 'react';
import API from '../../api';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append('startDate', dateRange.startDate);
      if (dateRange.endDate) params.append('endDate', dateRange.endDate);

      const response = await API.get(`/api/analytics/admin/dashboard?${params.toString()}`);
      
      if (response.error) {
        console.error('Error fetching analytics:', response.error);
        return;
      }

      if (response.data?.success) {
        setData(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
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

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">No analytics data available</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Data will appear as visitors use the site</p>
        </div>
      </div>
    );
  }

  // Handle empty data gracefully
  const overview = data.overview || {
    totalVisitors: 0,
    uniqueVisitors: 0,
    returningVisitors: 0,
    newVisitors: 0,
    signUps: 0,
    usersWithSubscription: 0,
    avgTimeSpent: 0
  };

  const funnel = data.funnel || {
    totalVisitors: 0,
    uniqueVisitors: 0,
    signedUp: 0,
    withSubscription: 0,
    conversionRate: 0,
    subscriptionRate: 0
  };

  const countries = data.countries || [];
  const devices = data.devices || [];
  const browsers = data.browsers || [];
  const os = data.os || [];
  const pages = data.pages || [];
  const dailyVisitors = data.dailyVisitors || [];
  const topIPs = data.topIPs || [];

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
        <div className="flex gap-4">
          <input
            type="date"
            value={dateRange.startDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
          <input
            type="date"
            value={dateRange.endDate}
            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
            className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Visitors</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.totalVisitors.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Unique Visitors</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{overview.uniqueVisitors.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Returning Visitors</div>
          <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{overview.returningVisitors.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">New Visitors</div>
          <div className="text-3xl font-bold text-green-600 dark:text-green-400">{overview.newVisitors.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Sign Ups</div>
          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{overview.signUps.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active Subscriptions</div>
          <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overview.usersWithSubscription.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg. Time Spent</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{formatTime(overview.avgTimeSpent)}</div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Conversion Rate</div>
          <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{funnel.conversionRate}%</div>
        </div>
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Conversion Funnel</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{funnel.totalVisitors.toLocaleString()}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Visitors</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{funnel.uniqueVisitors.toLocaleString()}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Unique Visitors</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{funnel.signedUp.toLocaleString()}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Signed Up ({funnel.conversionRate}%)</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{funnel.withSubscription.toLocaleString()}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Subscribed ({funnel.subscriptionRate}%)</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Daily Visitors Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Daily Visitors</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyVisitors}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visitors" stroke="#6366f1" name="Visitors" />
              <Line type="monotone" dataKey="newVisitors" stroke="#10b981" name="New" />
              <Line type="monotone" dataKey="returningVisitors" stroke="#8b5cf6" name="Returning" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Devices Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Devices</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={devices}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ device, percent }) => `${device}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Countries Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Countries</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={countries.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="country" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="visits" fill="#6366f1" name="Visits" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Browsers Chart */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Browsers</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={browsers}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="browser" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" name="Visits" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Pages */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 mb-8">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top Pages</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Page</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Title</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Visits</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Avg. Time</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page, index) => (
                <tr key={index} className="border-b border-gray-100 dark:border-slate-700">
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white">{page.page}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{page.pageTitle || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{page.visits.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-400">{formatTime(page.avgTimeSpent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top IPs */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Top IP Addresses</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">IP Address</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Country</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">City</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Visits</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {topIPs.slice(0, 20).map((ip, index) => (
                <tr key={index} className="border-b border-gray-100 dark:border-slate-700">
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-white font-mono">{ip.ipAddress}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{ip.country || '-'}</td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{ip.city || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-white">{ip.visits.toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-right text-gray-600 dark:text-gray-400">{ip.uniqueSessions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AdminAnalytics;
