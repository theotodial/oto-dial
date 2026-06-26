import { useCallback, useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import useLiveIntelligence from '../../../hooks/useLiveIntelligence';
import { isSuperAdmin, readStoredAdminProfile } from '../../../utils/adminAccess';
import LiveKpiStrip from './LiveKpiStrip';
import LiveFilters from './LiveFilters';
import ActiveVisitorTable from './ActiveVisitorTable';
import LiveGeoMap from './LiveGeoMap';
import LiveFunnel from './LiveFunnel';
import LiveEventFeed from './LiveEventFeed';
import LiveRevenueFeed from './LiveRevenueFeed';
import LiveTrafficSources from './LiveTrafficSources';
import LiveDeviceAnalytics from './LiveDeviceAnalytics';
import VisitorDetailPanel from './VisitorDetailPanel';
import LiveTimeframeSelector from './LiveTimeframeSelector';
import AnalyticsHealthPanel from './AnalyticsHealthPanel';
import RefreshBar from './RefreshBar';
import Ga4DebugPanel from './Ga4DebugPanel';
import { isGa4Debug } from '../../../config/ga4';

/**
 * Enterprise Live Operations & Intelligence Center — single source of truth
 * for rolling-window realtime analytics (default: last 15 minutes).
 */
export default function RealtimeIntelligenceCenter({
  legacyLive,
  legacyConnected,
  onRefreshHistorical,
  historicalMeta,
  historicalRefreshing,
  lastHistoricalRefresh,
  reconciliation
}) {
  const adminProfile = readStoredAdminProfile();
  const superAdmin = isSuperAdmin(adminProfile);

  const [window, setWindow] = useState('15m');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [revealIp, setRevealIp] = useState(false);
  const [detailVisitor, setDetailVisitor] = useState(null);
  const [lastLiveRefresh, setLastLiveRefresh] = useState(null);
  const [liveRefreshing, setLiveRefreshing] = useState(false);

  const windowParams = useMemo(() => ({
    window,
    startDate: window === 'custom' && customStart ? new Date(customStart).toISOString() : null,
    endDate: window === 'custom' && customEnd ? new Date(customEnd).toISOString() : null
  }), [window, customStart, customEnd]);

  const { intel, connected, connecting, loading, fetchVisitor, refresh } = useLiveIntelligence({
    enabled: true,
    search,
    filters,
    revealIp: revealIp && superAdmin,
    limit: 500,
    ...windowParams
  });

  const connectedState = connected || legacyConnected;
  const liveMeta = useMemo(() => ({
    queryDurationMs: intel?.queryDurationMs,
    cacheHit: false,
    recordsProcessed: { sessions: intel?.kpis?.sessionsInWindow || intel?.visitors?.length || 0 }
  }), [intel]);

  const handleRefresh = useCallback(async () => {
    setLiveRefreshing(true);
    try {
      await refresh();
      setLastLiveRefresh(new Date());
      onRefreshHistorical?.();
    } finally {
      setLiveRefreshing(false);
    }
  }, [refresh, onRefreshHistorical]);

  const onFilterChange = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const openVisitor = useCallback(async (row) => {
    const detail = await fetchVisitor(row.sessionId, revealIp && superAdmin);
    setDetailVisitor(detail || row);
  }, [fetchVisitor, revealIp, superAdmin]);

  const toggleRevealIp = useCallback(async () => {
    const next = !revealIp;
    setRevealIp(next);
    if (detailVisitor?.sessionId) {
      const detail = await fetchVisitor(detailVisitor.sessionId, next && superAdmin);
      if (detail) setDetailVisitor(detail);
    }
  }, [revealIp, detailVisitor, fetchVisitor, superAdmin]);

  const legacyKpis = !intel?.kpis ? legacyLive : null;
  const timeframeLabel = intel?.timeframe?.label || window;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
            Live Operations Center
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Rolling-window realtime · <strong>{timeframeLabel}</strong>
            {intel?.source === 'legacy_analytics' && ' · visit tracking (legacy)'}
            {intel?.source === 'mongodb_window' && ' · session tracking'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveTimeframeSelector
            window={window}
            onChange={setWindow}
            customStart={customStart}
            customEnd={customEnd}
            onCustomChange={({ start, end }) => {
              if (start !== undefined) setCustomStart(start);
              if (end !== undefined) setCustomEnd(end);
            }}
          />
          {superAdmin && (
            <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 cursor-pointer">
              <Shield className="w-4 h-4" />
              <input type="checkbox" checked={revealIp} onChange={(e) => setRevealIp(e.target.checked)} className="rounded" />
              Reveal IP
            </label>
          )}
        </div>
      </div>

      <RefreshBar
        onRefresh={handleRefresh}
        refreshing={liveRefreshing || historicalRefreshing}
        lastRefreshed={lastLiveRefresh || lastHistoricalRefresh}
        meta={{ ...liveMeta, ...historicalMeta }}
      />

      <AnalyticsHealthPanel window={window} />

      {(isGa4Debug() || import.meta.env.DEV) && <Ga4DebugPanel />}

      {reconciliation && !reconciliation.healthy && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>Reconciliation warning:</strong> {reconciliation.warnings?.length || 0} metric mismatch(es) in historical range.
          Cross-check Stripe, Users, and telecom collections before making decisions.
        </div>
      )}

      {loading && !intel ? (
        <div className="grid grid-cols-4 gap-3 animate-pulse">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <LiveKpiStrip
          kpis={intel?.kpis || {
            activeVisitors: legacyKpis?.activeVisitors || 0,
            activeNow: legacyKpis?.activeVisitors || 0,
            liveCalls: legacyKpis?.calls || 0,
            liveSms: legacyKpis?.sms || 0,
            livePurchases: legacyKpis?.purchases || 0,
            liveRevenueWindow: legacyKpis?.revenue || 0
          }}
          connected={connectedState}
          connecting={connecting && !connectedState}
          windowLabel={timeframeLabel}
        />
      )}

      <div className="grid grid-cols-1 gap-4">
        <LiveGeoMap geo={intel?.geo || []} />
        <ActiveVisitorTable
          visitors={intel?.visitors || []}
          pagination={intel?.pagination}
          onSelectVisitor={openVisitor}
        />
      </div>

      <LiveFilters search={search} onSearchChange={setSearch} filters={filters} onFilterChange={onFilterChange} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveFunnel funnel={intel?.funnel || []} />
        <LiveTrafficSources
          sources={intel?.trafficSources || []}
          totalVisitors={intel?.kpis?.activeVisitors || intel?.pagination?.total}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LiveEventFeed events={intel?.eventStream || legacyLive?.recent || []} />
        <LiveRevenueFeed purchases={intel?.purchases || []} />
      </div>

      <LiveDeviceAnalytics devices={intel?.devices || {}} />

      {detailVisitor && (
        <VisitorDetailPanel
          visitor={detailVisitor}
          onClose={() => setDetailVisitor(null)}
          revealIp={revealIp}
          onToggleRevealIp={toggleRevealIp}
          superAdmin={superAdmin}
        />
      )}
    </div>
  );
}
