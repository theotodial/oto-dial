import { RefreshCw } from 'lucide-react';

export default function RefreshBar({
  onRefresh,
  refreshing = false,
  lastRefreshed,
  meta = null
}) {
  const timeLabel = lastRefreshed
    ? lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200/80 dark:border-slate-700/80 bg-white/60 dark:bg-slate-900/40 backdrop-blur px-4 py-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Last refreshed: <strong className="text-gray-800 dark:text-gray-200">{timeLabel}</strong></span>
        {meta?.queryDurationMs != null && (
          <span>Query: <strong>{meta.queryDurationMs}ms</strong></span>
        )}
        {meta?.cacheHit != null && (
          <span>Cache: <strong>{meta.cacheHit ? 'hit' : 'miss'}</strong></span>
        )}
        {meta?.recordsProcessed && (
          <span>
            Records: <strong>{meta.recordsProcessed.sessions || 0}</strong> sessions
          </span>
        )}
        {refreshing && (
          <span className="flex items-center gap-1 text-indigo-500">
            <RefreshCw className="w-3 h-3 animate-spin" /> Reconciling…
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
