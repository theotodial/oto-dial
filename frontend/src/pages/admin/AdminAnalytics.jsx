import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

// Chevron icon for expand/collapse
const ChevronDownIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

function AdminAnalytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
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
      
      console.log('Analytics API Response:', response);
      
      if (response.error) {
        console.error('Error fetching analytics:', response.error);
        // Set empty data structure so cards still show
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
        console.log('Analytics data received:', response.data.data);
        setData(response.data.data);
        setMeta(response.data.meta || null);
      } else {
        console.warn('Unexpected response format:', response.data);
        // Set null so we can still show cards with defaults
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

  const handleCardClick = (cardId) => {
    navigate(`/adminbobby/analytics/${cardId}`, {
      state: { data, dateRange, meta }
    });
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

  // Always show cards, even with no data - helps debug and shows structure
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

  // Card component - navigates to detail page
  const MetricCard = ({ id, title, icon, value, subtitle, color, gradient }) => {
    return (
      <div 
        onClick={() => handleCardClick(id)}
        className={`bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-300 cursor-pointer overflow-hidden ${gradient}`}
      >
        <div className="w-full p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
                {icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                <div className="flex items-baseline space-x-2 mt-1">
                  <span className={`text-3xl font-bold ${color}`}>{value}</span>
                  {subtitle && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">View Details</span>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 dark:bg-slate-900 min-h-screen">
      {/* Debug Banner */}
      {!data && (
        <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">No data from API - Showing cards with default values (0)</p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Check browser console for API response details</p>
            </div>
          </div>
        </div>
      )}

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
      
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Track your audience and performance metrics</p>
        </div>
        <div className="flex gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Overview Card */}
        <MetricCard
          id="traffic"
          title="Traffic Overview"
          icon={
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
          value={overview.totalVisitors.toLocaleString()}
          subtitle="Total Visitors"
          color="text-blue-600 dark:text-blue-400"
          gradient="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
        />

        {/* Returning Users Card */}
        <MetricCard
          id="returning"
          title="Returning Users"
          icon={
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          value={overview.returningVisitors.toLocaleString()}
          subtitle={`${overview.totalVisitors > 0 ? ((overview.returningVisitors / overview.totalVisitors) * 100).toFixed(1) : 0}% of total`}
          color="text-purple-600 dark:text-purple-400"
          gradient="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20"
        />

        {/* Conversions Card */}
        <MetricCard
          id="conversions"
          title="Conversions"
          icon={
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          value={overview.signUps.toLocaleString()}
          subtitle={`${funnel.conversionRate}% conversion rate`}
          color="text-green-600 dark:text-green-400"
          gradient="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20"
        />

        {/* Geographic Data Card */}
        <MetricCard
          id="geographic"
          title="Geographic Data"
          icon={
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          value={countries.length}
          subtitle="Countries"
          color="text-red-600 dark:text-red-400"
          gradient="bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20"
        />

        {/* Device Analytics Card */}
        <MetricCard
          id="devices"
          title="Device Analytics"
          icon={
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
          value={devices.length}
          subtitle="Device Types"
          color="text-indigo-600 dark:text-indigo-400"
          gradient="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20"
        />

        {/* Page Performance Card */}
        <MetricCard
          id="pages"
          title="Page Performance"
          icon={
            <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          value={pages.length}
          subtitle="Tracked Pages"
          color="text-yellow-600 dark:text-yellow-400"
          gradient="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20"
        />

        {/* Visitor Details Card */}
        <MetricCard
          id="visitors"
          title="Visitor Details"
          icon={
            <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          value={topIPs.length}
          subtitle="IP Addresses"
          color="text-cyan-600 dark:text-cyan-400"
          gradient="bg-gradient-to-br from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/20"
        />
      </div>
    </div>
  );
}

export default AdminAnalytics;
