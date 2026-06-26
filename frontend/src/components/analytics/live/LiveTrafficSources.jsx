import { channelLabel, sourceIcon } from '../formatters';

export default function LiveTrafficSources({ sources = [], totalVisitors = 0 }) {
  const total = totalVisitors || sources.reduce((n, s) => n + (s.visitors || 0), 0) || 1;
  const max = sources[0]?.visitors || 1;

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-semibold text-lg">Traffic Sources</h3>
          <p className="text-xs text-gray-500">Full-window acquisition · {total.toLocaleString()} visits</p>
        </div>
      </div>
      <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
        {sources.length === 0 && <p className="text-gray-400 text-sm text-center py-6">No traffic in window</p>}
        {sources.map((s) => {
          const pct = total > 0 ? ((s.visitors / total) * 100).toFixed(1) : '0';
          return (
            <div key={`${s.source}-${s.channel}`} className="flex items-center gap-3 text-sm">
              <span className="text-lg w-6 shrink-0">{sourceIcon(s.source)}</span>
              <div className="w-28 shrink-0">
                <div className="font-medium truncate">{channelLabel(s.source)}</div>
                <div className="text-[10px] text-gray-400 capitalize truncate">{s.channel || 'other'}</div>
              </div>
              <div className="flex-1 h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all"
                  style={{ width: `${(s.visitors / max) * 100}%` }}
                />
              </div>
              <span className="w-12 text-right tabular-nums text-xs font-medium">{s.visitors.toLocaleString()}</span>
              <span className="w-10 text-right tabular-nums text-[10px] text-gray-400">{pct}%</span>
              <span className="w-8 text-right tabular-nums text-xs text-emerald-600">{s.conversions || 0}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-4 text-[10px] uppercase tracking-wide text-gray-400">
        <span>Visits</span>
        <span>%</span>
        <span>Conv.</span>
      </div>
    </div>
  );
}
