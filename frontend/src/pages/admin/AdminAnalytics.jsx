import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Users, UserPlus, Repeat, MousePointerClick, Eye, Timer,
  TrendingDown, CreditCard, DollarSign, Activity, Smartphone,
  Filter as FunnelIcon, Radio, Zap
} from 'lucide-react';
import API from '../../api';
import { viteApiOriginForSockets } from '../../utils/viteApiBase';
import useAnalyticsLive from '../../hooks/useAnalyticsLive';
import KpiCard from '../../components/analytics/KpiCard';
import ChartCard from '../../components/analytics/ChartCard';
import FilterBar from '../../components/analytics/FilterBar';
import { DashboardSkeleton } from '../../components/analytics/Skeletons';
import {
  formatNumber, formatFull, formatCurrency, formatPercent, formatDuration,
  CHART_COLORS, channelLabel, sourceIcon
} from '../../components/analytics/formatters';
import RealtimeIntelligenceCenter from '../../components/analytics/live/RealtimeIntelligenceCenter';

const WorldMap = lazy(() => import('../../components/analytics/WorldMap'));

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'geography', label: 'Geography' },
  { id: 'devices', label: 'Devices' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'events', label: 'Events' }
];

const shortDate = (d) => {
  if (!d) return '';
  const parts = String(d).split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d;
};

const chartTooltipStyle = {
  contentStyle: {
    background: 'rgba(15,23,42,0.95)',
    border: '1px solid rgba(148,163,184,0.2)',
    borderRadius: 12,
    color: '#e2e8f0',
    fontSize: 12
  },
  labelStyle: { color: '#94a3b8' }
};

function AdminAnalytics() {
  const navigate = useNavigate();
  const { live, connected } = useAnalyticsLive();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [filters, setFilters] = useState({
    range: '30d',
    compare: 'previous_period',
    customStart: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    customEnd: new Date().toISOString().slice(0, 10)
  });

  const hasLoadedRef = useRef(false);

  const buildParams = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams();
      params.append('range', filters.range);
      params.append('compare', filters.compare);
      params.append('tzOffset', String(-new Date().getTimezoneOffset()));
      if (filters.range === 'custom') {
        if (filters.customStart) params.append('startDate', `${filters.customStart}T00:00:00.000Z`);
        if (filters.customEnd) params.append('endDate', `${filters.customEnd}T23:59:59.999Z`);
      }
      Object.entries(extra).forEach(([k, v]) => params.append(k, v));
      return params;
    },
    [filters]
  );

  const fetchData = useCallback(
    async ({ refresh = false } = {}) => {
      const token = localStorage.getItem('adminToken');
      if (refresh) setRefreshing(true);
      else if (!hasLoadedRef.current) setLoading(true);

      const params = buildParams(refresh ? { refresh: '1' } : {});
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const loadOverview = () =>
        API.get(`/api/analytics/admin/overview?${params.toString()}`, { headers });

      const loadLegacyDashboard = () => {
        const legacy = new URLSearchParams();
        if (filters.range === 'custom') {
          if (filters.customStart) legacy.append('startDate', filters.customStart);
          if (filters.customEnd) legacy.append('endDate', filters.customEnd);
        } else {
          const end = new Date();
          const start = new Date();
          const days =
            filters.range === '7d' ? 7 :
            filters.range === '14d' ? 14 :
            filters.range === '90d' ? 90 :
            filters.range === 'today' ? 1 : 30;
          start.setDate(start.getDate() - (days - 1));
          legacy.append('startDate', start.toISOString().slice(0, 10));
          legacy.append('endDate', end.toISOString().slice(0, 10));
        }
        legacy.append('realtimeWindow', '15m');
        return API.get(`/api/analytics/admin/dashboard?${legacy.toString()}`, { headers });
      };

      try {
        let res = await loadOverview();

        if (res?.error || res?.data?.success === false || (res?.status && res.status >= 400)) {
          if (res?.status === 401) {
            localStorage.removeItem('adminToken');
            navigate('/adminbobby');
            return;
          }
          res = await loadLegacyDashboard();
        }

        if (res?.error || res?.data?.success === false) {
          throw new Error(res?.error || 'Failed to load analytics');
        }

        const payload = res.data?.data || res.data;
        setData(payload);
        setError('');
        setLastUpdated(new Date());
        hasLoadedRef.current = true;
      } catch (err) {
        setError(err.message || 'Failed to load analytics');
        hasLoadedRef.current = true;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildParams, navigate, filters]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.range, filters.compare, filters.customStart, filters.customEnd]);

  // Background auto-refresh every 60s.
  useEffect(() => {
    const id = setInterval(() => fetchData({ refresh: true }), 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleFilterChange = (patch) => setFilters((prev) => ({ ...prev, ...patch }));

  const handleExport = async (format) => {
    try {
      const token = localStorage.getItem('adminToken');
      const params = buildParams({ format });
      const base = viteApiOriginForSockets(import.meta.env.VITE_API_URL || '') || '';
      const url = `${base}/api/analytics/admin/export?${params.toString()}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `otodial-analytics-${filters.range}.${format === 'excel' ? 'xlsx' : format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message || 'Export failed');
    }
  };

  const drill = (cardId) => navigate(`/adminbobby/analytics/${cardId}`);

  const overview = data?.overview || {};
  const deltas = data?.deltas || {};
  const daily = data?.dailyVisitors || [];
  const meta = data?.meta || {};

  // Live-augmented values for the realtime strip.
  const liveSnap = live || {};

  const spark = useMemo(() => {
    return daily.map((d) => ({
      date: d.date,
      visitors: d.visitors,
      newVisitors: d.newVisitors,
      returningVisitors: d.returningVisitors,
      pageViews: d.pageViews,
      signups: d.signups,
      revenue: d.revenue
    }));
  }, [daily]);

  if (loading) {
    return (
      <div className="p-6 min-h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 min-h-full text-gray-900 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Analytics
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {meta?.range?.label ? `Showing ${meta.range.label}` : 'Executive overview'}
              {meta?.cached ? ' · cached' : ''}
            </p>
          </div>
        </div>

        <FilterBar
          range={filters.range}
          compare={filters.compare}
          customStart={filters.customStart}
          customEnd={filters.customEnd}
          onChange={handleFilterChange}
          onRefresh={() => fetchData({ refresh: true })}
          onExport={handleExport}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
          connected={connected}
        />

        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error} — showing the most recent data available.
          </div>
        )}
      </div>

      {/* Live Operations Center — primary dashboard (always visible) */}
      <div className="mb-10">
        <RealtimeIntelligenceCenter
          legacyLive={live}
          legacyConnected={connected}
          onRefreshHistorical={() => fetchData({ refresh: true })}
          historicalMeta={meta}
          historicalRefreshing={refreshing}
          lastHistoricalRefresh={lastUpdated}
          reconciliation={data?.reconciliation}
        />
      </div>

      {/* Historical reports */}
      <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Historical Reports</h2>
      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          overview={overview}
          deltas={deltas}
          daily={daily}
          spark={spark}
          errors={meta?.errors}
          onDrill={drill}
        />
      )}
      {activeTab === 'traffic' && (
        <TrafficTab trafficSources={data?.trafficSources} errors={meta?.errors} />
      )}
      {activeTab === 'geography' && <GeographyTab countries={data?.countries || []} />}
      {activeTab === 'devices' && (
        <DevicesTab devices={data?.devices} browsers={data?.browsers} os={data?.os} />
      )}
      {activeTab === 'funnel' && <FunnelTab funnel={data?.funnel} />}
      {activeTab === 'revenue' && (
        <RevenueTab revenue={data?.revenue} subscriptions={data?.subscriptions} errors={meta?.errors} />
      )}
      {activeTab === 'events' && <EventsTab topEvents={data?.topEvents || []} pages={data?.pages || []} />}
      </div>
    </div>
  );
}

/* ---------------- Tabs ---------------- */

function OverviewTab({ overview, deltas, daily, spark, errors, onDrill }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Unique Visitors" value={formatNumber(overview.uniqueVisitors)}
          delta={deltas.uniqueVisitors} icon={<Users className="w-4 h-4" />} accent="indigo"
          sparkData={spark} sparkKey="visitors" onClick={() => onDrill('visitors')} />
        <KpiCard title="New Visitors" value={formatNumber(overview.newVisitors)}
          delta={deltas.newVisitors} icon={<UserPlus className="w-4 h-4" />} accent="violet"
          sparkData={spark} sparkKey="newVisitors" />
        <KpiCard title="Returning" value={formatNumber(overview.returningVisitors)}
          delta={deltas.returningVisitors} icon={<Repeat className="w-4 h-4" />} accent="cyan"
          sparkData={spark} sparkKey="returningVisitors" />
        <KpiCard title="Sessions" value={formatNumber(overview.sessions)}
          delta={deltas.sessions} icon={<Activity className="w-4 h-4" />} accent="blue" />

        <KpiCard title="Page Views" value={formatNumber(overview.pageViews)}
          delta={deltas.pageViews} icon={<Eye className="w-4 h-4" />} accent="indigo"
          sparkData={spark} sparkKey="pageViews" onClick={() => onDrill('pageviews')} />
        <KpiCard title="Bounce Rate" value={formatPercent(overview.bounceRate)}
          delta={deltas.bounceRate} invertTrend icon={<TrendingDown className="w-4 h-4" />} accent="rose"
          subtitle={`${overview.pagesPerSession || 0} pages / session`} />
        <KpiCard title="Avg. Duration" value={formatDuration(overview.avgSessionDuration)}
          delta={deltas.avgSessionDuration} icon={<Timer className="w-4 h-4" />} accent="amber" />
        <KpiCard title="Sign-ups" value={formatNumber(overview.signUps)}
          delta={deltas.signUps} icon={<MousePointerClick className="w-4 h-4" />} accent="emerald"
          subtitle={`${overview.signupConversionRate || 0}% conversion`}
          sparkData={spark} sparkKey="signups" onClick={() => onDrill('signups')} />

        <KpiCard title="Subscriptions" value={formatNumber(overview.usersWithSubscription)}
          delta={deltas.usersWithSubscription} icon={<CreditCard className="w-4 h-4" />} accent="emerald"
          subtitle={`${overview.subscriptionConversionRate || 0}% of signups`} />
        <KpiCard title="Revenue" value={formatCurrency(overview.revenue)}
          delta={deltas.revenue} icon={<DollarSign className="w-4 h-4" />} accent="emerald"
          sparkData={spark} sparkKey="revenue" />
        <KpiCard title="ARPU" value={formatCurrency(overview.arpu)}
          icon={<DollarSign className="w-4 h-4" />} accent="violet" />
        <KpiCard title="DAU / WAU / MAU"
          value={`${formatNumber(overview.dau)} / ${formatNumber(overview.wau)} / ${formatNumber(overview.mau)}`}
          icon={<Zap className="w-4 h-4" />} accent="blue" />
      </div>

      <ChartCard title="Visitors over time" subtitle="New vs returning" error={errors?.timeseries}>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={daily}>
            <defs>
              <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gRet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip {...chartTooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="newVisitors" name="New" stackId="1" stroke="#6366f1" fill="url(#gNew)" strokeWidth={2} />
            <Area type="monotone" dataKey="returningVisitors" name="Returning" stackId="1" stroke="#06b6d4" fill="url(#gRet)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Page views" error={errors?.timeseries}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip {...chartTooltipStyle} />
              <Bar dataKey="pageViews" name="Page views" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Sign-ups & subscriptions">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip {...chartTooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="signups" name="Sign-ups" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="subscriptions" name="Subscriptions" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function TrafficTab({ trafficSources, errors }) {
  const channels = trafficSources?.channels || [];
  const topSources = trafficSources?.topSources || [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Channels" subtitle="Sessions by acquisition channel" error={errors?.trafficSources}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={channels} dataKey="visits" nameKey="channel" cx="50%" cy="50%"
                outerRadius={110} innerRadius={60} paddingAngle={2}
                label={(e) => channelLabel(e.channel)}>
                {channels.map((entry, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...chartTooltipStyle} formatter={(v, n, p) => [formatFull(v), channelLabel(p?.payload?.channel)]} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Channel conversion" subtitle="Visits vs sign-ups">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={channels} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="channel" tickFormatter={channelLabel} width={90} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip {...chartTooltipStyle} />
              <Legend />
              <Bar dataKey="visits" name="Visits" fill="#6366f1" radius={[0, 4, 4, 0]} />
              <Bar dataKey="signUps" name="Sign-ups" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Top sources" subtitle="Including social influencers & campaigns">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Channel</th>
                <th className="py-2 pr-4 font-medium text-right">Visits</th>
                <th className="py-2 pr-4 font-medium text-right">Unique</th>
                <th className="py-2 pr-4 font-medium text-right">Sign-ups</th>
                <th className="py-2 pr-4 font-medium text-right">Subs</th>
                <th className="py-2 pr-4 font-medium text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((s, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                  <td className="py-2 pr-4">
                    <span className="mr-1">{sourceIcon(s.source)}</span>
                    {s.source}
                    {s.influencers?.length ? (
                      <span className="ml-1 text-xs text-gray-400">@{s.influencers[0]}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{channelLabel(s.channel)}</td>
                  <td className="py-2 pr-4 text-right">{formatFull(s.visits)}</td>
                  <td className="py-2 pr-4 text-right">{formatFull(s.uniqueVisitors)}</td>
                  <td className="py-2 pr-4 text-right">{formatFull(s.signUps)}</td>
                  <td className="py-2 pr-4 text-right">{formatFull(s.subscriptions)}</td>
                  <td className="py-2 pr-4 text-right">{formatPercent(s.conversionRate)}</td>
                </tr>
              ))}
              {topSources.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-gray-400">No traffic in this range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function GeographyTab({ countries }) {
  return (
    <div className="space-y-6">
      <ChartCard title="Visitors by country" subtitle="Geographic distribution">
        <Suspense fallback={<div className="h-[380px] animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />}>
          <WorldMap countries={countries} />
        </Suspense>
      </ChartCard>
      <ChartCard title="Top countries">
        <div className="space-y-2">
          {countries.slice(0, 15).map((c, i) => {
            const max = countries[0]?.visits || 1;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-16 text-sm text-gray-600 dark:text-gray-300">{c.country}</div>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(c.visits / max) * 100}%` }} />
                </div>
                <div className="w-16 text-right text-sm font-medium">{formatFull(c.visits)}</div>
              </div>
            );
          })}
          {countries.length === 0 && <p className="text-center text-gray-400 py-6">No geographic data.</p>}
        </div>
      </ChartCard>
    </div>
  );
}

function DevicesTab({ devices = [], browsers = [], os = [] }) {
  const renderPie = (rows, nameKey) => (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={rows} dataKey="count" nameKey={nameKey} cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={2}
          label={(e) => e[nameKey]}>
          {rows.map((entry, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip {...chartTooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title="Device type" subtitle={<span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3" /> sessions</span>}>
        {renderPie(devices, 'device')}
      </ChartCard>
      <ChartCard title="Browsers">{renderPie(browsers, 'browser')}</ChartCard>
      <ChartCard title="Operating systems">{renderPie(os, 'os')}</ChartCard>
    </div>
  );
}

function FunnelTab({ funnel }) {
  if (!funnel) return <ChartCard title="Funnel"><p className="text-gray-400 py-6 text-center">No funnel data.</p></ChartCard>;
  const steps = [
    { label: 'Visitors', value: funnel.visitors },
    { label: 'Signed up', value: funnel.signedUp },
    { label: 'Email verified', value: funnel.emailVerified },
    { label: 'Subscribed', value: funnel.subscribed },
    { label: 'Number purchased', value: funnel.numberPurchased },
    { label: 'First call', value: funnel.firstCall }
  ];
  const top = steps[0].value || 1;
  return (
    <ChartCard title="Conversion funnel" subtitle="Visitor → Signup → Subscribe → First call">
      <div className="space-y-3">
        {steps.map((s, i) => {
          const pct = top > 0 ? (s.value / top) * 100 : 0;
          const prev = i > 0 ? steps[i - 1].value : null;
          const stepConv = prev ? ((s.value / (prev || 1)) * 100).toFixed(1) : null;
          return (
            <div key={i}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-700 dark:text-gray-200 font-medium flex items-center gap-2">
                  <FunnelIcon className="w-3.5 h-3.5 text-indigo-500" /> {s.label}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {formatFull(s.value)} {stepConv !== null && <span className="text-xs">({stepConv}%)</span>}
                </span>
              </div>
              <div className="h-7 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

function RevenueTab({ revenue, subscriptions, errors }) {
  if (errors?.revenue || !revenue) {
    return <ChartCard title="Revenue" error={errors?.revenue}><p className="text-gray-400 py-6 text-center">No revenue data.</p></ChartCard>;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="Total Revenue" value={formatCurrency(revenue.totalRevenue)} accent="emerald" icon={<DollarSign className="w-4 h-4" />} />
        <KpiCard title="Orders" value={formatFull(revenue.orders)} accent="indigo" />
        <KpiCard title="Avg. Order Value" value={formatCurrency(revenue.averageOrderValue)} accent="violet" />
      </div>
      <ChartCard title="Revenue over time">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={revenue.byDay}>
            <defs>
              <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <Tooltip {...chartTooltipStyle} formatter={(v) => formatCurrency(v)} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="url(#gRev)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Revenue by type">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={revenue.byPlan}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="plan" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip {...chartTooltipStyle} formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {subscriptions && (
          <ChartCard title="Subscriptions">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Active', subscriptions.active, 'emerald'],
                ['New (range)', subscriptions.newInRange, 'indigo'],
                ['Suspended', subscriptions.suspended, 'amber'],
                ['Cancelled', subscriptions.cancelled, 'rose']
              ].map(([label, value], i) => (
                <div key={i} className="rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{formatFull(value)}</div>
                </div>
              ))}
            </div>
          </ChartCard>
        )}
      </div>
    </div>
  );
}

function EventsTab({ topEvents, pages }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Top events" subtitle="Tracked product events">
        <div className="space-y-2">
          {topEvents.slice(0, 20).map((e, i) => {
            const max = topEvents[0]?.count || 1;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-40 truncate text-sm text-gray-600 dark:text-gray-300">{e.name}</div>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${(e.count / max) * 100}%` }} />
                </div>
                <div className="w-16 text-right text-sm font-medium">{formatFull(e.count)}</div>
              </div>
            );
          })}
          {topEvents.length === 0 && <p className="text-center text-gray-400 py-6">No events tracked yet.</p>}
        </div>
      </ChartCard>
      <ChartCard title="Top pages" subtitle="Most viewed pages">
        <div className="space-y-2">
          {pages.slice(0, 20).map((p, i) => {
            const max = pages[0]?.visits || 1;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-40 truncate text-sm text-gray-600 dark:text-gray-300" title={p.page}>{p.page}</div>
                <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(p.visits / max) * 100}%` }} />
                </div>
                <div className="w-16 text-right text-sm font-medium">{formatFull(p.visits)}</div>
              </div>
            );
          })}
          {pages.length === 0 && <p className="text-center text-gray-400 py-6">No page data.</p>}
        </div>
      </ChartCard>
    </div>
  );
}

export default AdminAnalytics;
