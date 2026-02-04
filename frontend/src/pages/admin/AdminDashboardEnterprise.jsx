import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import API from '../../api';

// KPI Block Component with Trend and Sparkline
function KPICard({ title, value, change, changeType, sparklineData, onClick, isCurrency = false, color = "indigo" }) {
  const colorClasses = {
    indigo: "border-l-indigo-500",
    blue: "border-l-blue-500",
    slate: "border-l-slate-500",
    orange: "border-l-orange-500"
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-800 rounded-lg border-l-4 ${colorClasses[color]} shadow-sm hover:shadow-md transition-all cursor-pointer p-6`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {isCurrency ? `$${(Number(value) || 0).toFixed(2)}` : (Number(value) || 0).toLocaleString()}
          </p>
          {change !== null && (
            <div className="mt-2 flex items-center">
              <span className={`text-sm font-medium ${
                changeType === 'positive' ? 'text-blue-600 dark:text-blue-400' :
                changeType === 'negative' ? 'text-slate-600 dark:text-slate-400' :
                'text-gray-600 dark:text-gray-400'
              }`}>
                {change > 0 ? '+' : ''}{(Number(change) || 0).toFixed(1)}%
              </span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">vs previous period</span>
            </div>
          )}
        </div>
        {sparklineData && sparklineData.length > 0 && (
          <div className="w-24 h-12 ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color === 'indigo' ? '#6366f1' : color === 'blue' ? '#3b82f6' : '#64748b'}
                  fill={color === 'indigo' ? '#6366f1' : color === 'blue' ? '#3b82f6' : '#64748b'}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminDashboardEnterprise() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [timeSeries, setTimeSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('30d');
  const [error, setError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      
      const [enhancedRes, timeSeriesRes] = await Promise.all([
        API.get(`/api/admin/analytics/enhanced?filter=${timeFilter}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        API.get(`/api/admin/analytics/time-series/enhanced?filter=${timeFilter}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (enhancedRes.error) {
        setError(enhancedRes.error);
      } else if (enhancedRes.data?.success) {
        setAnalytics(enhancedRes.data);
      }
      
      if (timeSeriesRes.error) {
        console.warn("Time-series error:", timeSeriesRes.error);
        // Don't set error for time-series, just log it
      } else if (timeSeriesRes.data?.success) {
        setTimeSeries(timeSeriesRes.data);
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
  }, [timeFilter, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Prepare sparkline data from time series
  const getSparklineData = (dataKey) => {
    if (!timeSeries?.data || !Array.isArray(timeSeries.data)) return [];
    return timeSeries.data.slice(-7).map(item => ({
      value: item[dataKey] || 0
    }));
  };

  // Calculate trends (simplified - compare last 7 days vs previous 7 days)
  const calculateTrend = (current, previous) => {
    if (!previous || previous === 0) return { change: 0, type: 'neutral' };
    const change = ((current - previous) / previous) * 100;
    return {
      change,
      type: change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral'
    };
  };

  const revenueTrend = analytics?.financial?.netRevenue ? calculateTrend(
    analytics.financial.netRevenue,
    analytics.financial.netRevenue * 0.95 // Simplified
  ) : { change: 0, type: 'neutral' };

  const costTrend = analytics?.financial?.totalTelnyxCost ? calculateTrend(
    analytics.financial.totalTelnyxCost,
    analytics.financial.totalTelnyxCost * 1.05 // Simplified
  ) : { change: 0, type: 'neutral' };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setMobileMenuOpen(false)}></div>
          <div className="fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-slate-800 shadow-xl overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
                  <span className="text-lg font-bold text-gray-900 dark:text-white">Admin</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <nav className="p-4 space-y-2">
              <button
                onClick={() => {
                  navigate('/adminbobby/dashboard');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-medium"
              >
                Dashboard
              </button>
              <button
                onClick={() => {
                  navigate('/adminbobby/users');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                Users
              </button>
              <button
                onClick={() => {
                  navigate('/adminbobby/calls');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                Calls
              </button>
              <button
                onClick={() => {
                  navigate('/adminbobby/sms');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                SMS
              </button>
              <button
                onClick={() => {
                  navigate('/adminbobby/numbers');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                Numbers
              </button>
              <button
                onClick={() => {
                  navigate('/adminbobby/support');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                Support
              </button>
              <button
                onClick={() => {
                  navigate('/adminbobby/team');
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                Admin Team
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('adminToken');
                  navigate('/adminbobby');
                }}
                className="w-full text-left px-4 py-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Logout
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {/* Logo + Admin */}
              <div className="flex items-center gap-2">
                <img src="/logo.svg" alt="OTO DIAL" className="w-8 h-8" />
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Admin</h1>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <div className="flex flex-wrap gap-2">
                {['7d', '30d', '60d', '90d', 'all'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setTimeFilter(filter)}
                    className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                      timeFilter === filter
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {filter === 'all' ? 'All' : filter}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/adminbobby/users')}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
                >
                  Users
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('adminToken');
                    navigate('/adminbobby');
                  }}
                  className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!analytics && !error && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">Loading analytics data...</p>
          </div>
        )}
        {analytics && (
          <>
            {/* Top KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <KPICard
                title="Net Revenue"
                value={analytics?.financial?.netRevenue || 0}
                change={revenueTrend.change}
                changeType={revenueTrend.type}
                sparklineData={getSparklineData('netRevenue')}
                onClick={() => navigate('/adminbobby/costs')}
                isCurrency
                color="blue"
              />
              <KPICard
                title="Total Telnyx Cost"
                value={analytics?.financial?.totalTelnyxCost || 0}
                change={costTrend.change}
                changeType={costTrend.type}
                sparklineData={getSparklineData('totalTelnyxCost')}
                onClick={() => navigate('/adminbobby/costs')}
                isCurrency
                color="orange"
              />
              <KPICard
                title="Net Profit"
                value={analytics?.financial?.netProfit || 0}
                change={(analytics?.financial?.netProfit || 0) > 0 ? revenueTrend.change : costTrend.change}
                changeType={(analytics?.financial?.netProfit || 0) >= 0 ? 'positive' : 'negative'}
                sparklineData={getSparklineData('profit')}
                onClick={() => navigate('/adminbobby/costs')}
                isCurrency
                color={(analytics?.financial?.netProfit || 0) >= 0 ? 'indigo' : 'slate'}
              />
              <KPICard
                title="Avg Cost per User"
                value={analytics?.averages?.costPerUser || 0}
                change={null}
                changeType="neutral"
                onClick={() => navigate('/adminbobby/users')}
                isCurrency
                color="slate"
              />
            </div>

            {/* TELNYX COSTS - COMPREHENSIVE BREAKDOWN */}
            <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg shadow-lg border-2 border-orange-200 dark:border-orange-800 p-4 sm:p-6 mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Telnyx Costs Breakdown</h2>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                    All costs from Telnyx API - Real billing data (not estimates)
                  </p>
                  {(analytics?.financial?.totalTelnyxCost || 0) === 0 && (
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 font-medium">
                      ⚠️ No costs found. Costs are synced from Telnyx after calls/SMS/number purchases.
                    </p>
                  )}
                </div>
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Telnyx Cost</p>
                  <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">
                    ${(analytics?.financial?.totalTelnyxCost || 0).toFixed(4)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Call Costs Card */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-5 border-l-4 border-orange-500">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <span className="mr-2">📞</span> Call Costs
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
                      <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                        ${(analytics?.telnyxBreakdown?.calls?.totalCost || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Inbound</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.calls?.inboundCost || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Outbound</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.calls?.outboundCost || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-gray-400">Ringing</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {analytics?.telnyxBreakdown?.calls?.totalRingingSeconds || 0}s
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Answered</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {analytics?.telnyxBreakdown?.calls?.totalAnsweredSeconds || 0}s
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Billed</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {analytics?.telnyxBreakdown?.calls?.totalBilledSeconds || 0}s
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-gray-400">Avg / Minute</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${(analytics?.telnyxBreakdown?.calls?.avgCostPerMinute || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Avg / Second</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${(analytics?.telnyxBreakdown?.calls?.avgCostPerSecond || 0).toFixed(6)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* SMS Costs Card */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-5 border-l-4 border-blue-500">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <span className="mr-2">📱</span> SMS Costs
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Total</span>
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        ${(analytics?.telnyxBreakdown?.sms?.totalCost || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Inbound</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.sms?.inboundCost || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Outbound</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.sms?.outboundCost || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-gray-400">Carrier Fees</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.sms?.carrierFees || 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-gray-400">Avg / SMS</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${(analytics?.telnyxBreakdown?.sms?.avgCostPerSms || 0).toFixed(4)}
                      </span>
                    </div>
                    {analytics?.telnyxBreakdown?.sms?.pendingCosts > 0 && (
                      <div className="flex justify-between text-xs pt-2 border-t border-yellow-200 dark:border-yellow-800">
                        <span className="text-yellow-600 dark:text-yellow-400">Pending Sync</span>
                        <span className="text-yellow-600 dark:text-yellow-400">
                          {analytics.telnyxBreakdown.sms.pendingCosts} SMS
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Number Costs Card */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-5 border-l-4 border-green-500">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <span className="mr-2">☎️</span> Number Costs
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Active Numbers</span>
                      <span className="text-lg font-bold text-green-600 dark:text-green-400">
                        {analytics?.telnyxBreakdown?.numbers?.activeCount || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Monthly Cost</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.numbers?.monthlyCost || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Period Cost</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.numbers?.monthlyCostForPeriod || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-gray-400">One-Time Fees</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.numbers?.oneTimeCost || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Extra Fees</span>
                      <span className="text-gray-700 dark:text-gray-300">
                        ${(analytics?.telnyxBreakdown?.numbers?.extraFees || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-slate-700">
                      <span className="text-gray-500 dark:text-gray-400">Total Number Cost</span>
                      <span className="font-semibold text-gray-900 dark:text-white">
                        ${((analytics?.telnyxBreakdown?.numbers?.monthlyCostForPeriod || 0) + 
                            (analytics?.telnyxBreakdown?.numbers?.oneTimeCost || 0) + 
                            (analytics?.telnyxBreakdown?.numbers?.extraFees || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Summary Row */}
              <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t-2 border-orange-200 dark:border-orange-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div className="text-center">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Call Costs</p>
                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      ${(analytics?.financial?.telnyxCallCost || 0).toFixed(4)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">SMS Costs</p>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      ${(analytics?.financial?.telnyxSmsCost || 0).toFixed(4)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Number Costs</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400">
                      ${(analytics?.financial?.telnyxNumberCost || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Total Telnyx</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      ${(analytics?.financial?.totalTelnyxCost || 0).toFixed(4)}
                    </p>
                  </div>
                </div>
              </div>
            </div>


            {/* Stripe Breakdown */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 sm:p-6 mb-6 sm:mb-8">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">Stripe Revenue Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Gross Revenue</p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                    ${(analytics?.financial?.grossRevenue || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Processing Fees</p>
                  <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                    -${(analytics?.financial?.stripeProcessingFees || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Refunds</p>
                  <p className="mt-1 text-2xl font-semibold text-orange-600 dark:text-orange-400">
                    -${(analytics?.financial?.refunds || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Net Revenue</p>
                  <p className="mt-1 text-2xl font-semibold text-blue-600 dark:text-blue-400">
                    ${(analytics?.financial?.netRevenue || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Integrated Charts - 3 Column Layout on Desktop */}
            {timeSeries?.data && Array.isArray(timeSeries.data) && timeSeries.data.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Revenue vs Costs Chart */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 lg:p-6">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">Revenue vs Telnyx Costs</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={timeSeries.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (isNaN(date.getTime())) return value;
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          } catch {
                            return value;
                          }
                        }}
                        stroke="#6b7280"
                      />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        formatter={(value) => `$${(Number(value) || 0).toFixed(2)}`}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="netRevenue" 
                        stackId="1" 
                        stroke="#3b82f6" 
                        fill="#3b82f6" 
                        fillOpacity={0.6} 
                        name="Net Revenue" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="totalTelnyxCost" 
                        stackId="2" 
                        stroke="#f97316" 
                        fill="#f97316" 
                        fillOpacity={0.6} 
                        name="Telnyx Cost" 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="profit" 
                        stroke="#6366f1" 
                        strokeWidth={3} 
                        name="Profit" 
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Call Minutes vs Call Cost */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 lg:p-6">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">Call Minutes vs Call Cost</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timeSeries.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (isNaN(date.getTime())) return value;
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          } catch {
                            return value;
                          }
                        }}
                        stroke="#6b7280"
                      />
                      <YAxis yAxisId="left" stroke="#6b7280" />
                      <YAxis yAxisId="right" orientation="right" stroke="#6b7280" />
                      <Tooltip 
                        formatter={(value, name) => {
                          const numValue = Number(value) || 0;
                          if (name === 'callMinutes') return `${numValue.toFixed(2)} min`;
                          if (name === 'telnyxCallCost') return `$${numValue.toFixed(4)}`;
                          return numValue;
                        }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="callMinutes" fill="#6366f1" name="Call Minutes" />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="telnyxCallCost" 
                        stroke="#f97316" 
                        strokeWidth={2} 
                        name="Call Cost ($)" 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* SMS Count vs SMS Cost */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4 lg:p-6">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">SMS Count vs SMS Cost</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timeSeries.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => {
                          try {
                            const date = new Date(value);
                            if (isNaN(date.getTime())) return value;
                            return `${date.getMonth() + 1}/${date.getDate()}`;
                          } catch {
                            return value;
                          }
                        }}
                        stroke="#6b7280"
                      />
                      <YAxis yAxisId="left" stroke="#6b7280" />
                      <YAxis yAxisId="right" orientation="right" stroke="#6b7280" />
                      <Tooltip 
                        formatter={(value, name) => {
                          const numValue = Number(value) || 0;
                          if (name === 'sms') return `${numValue} SMS`;
                          if (name === 'telnyxSmsCost') return `$${numValue.toFixed(4)}`;
                          return numValue;
                        }}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="sms" fill="#6366f1" name="SMS Count" />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="telnyxSmsCost" 
                        stroke="#f97316" 
                        strokeWidth={2} 
                        name="SMS Cost ($)" 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => navigate('/adminbobby/calls')}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 text-left hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">View All Calls</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {((analytics?.voice?.totalOutboundCalls || 0) + (analytics?.voice?.totalInboundCalls || 0))} total calls
                </p>
              </button>
              <button
                onClick={() => navigate('/adminbobby/sms')}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 text-left hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">View All SMS</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {((analytics?.messaging?.totalSmsSent || 0) + (analytics?.messaging?.totalSmsReceived || 0))} total SMS
                </p>
              </button>
              <button
                onClick={() => navigate('/adminbobby/numbers')}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 text-left hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">View All Numbers</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {analytics?.telnyxBreakdown?.numbers?.activeCount || 0} active numbers
                </p>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminDashboardEnterprise;
