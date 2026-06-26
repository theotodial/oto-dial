import { formatCurrency } from '../formatters';
import { CheckCircle, Clock } from 'lucide-react';

export default function LiveRevenueFeed({ purchases = [] }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
        <h3 className="font-semibold">Live Revenue Feed</h3>
        <p className="text-xs text-gray-500">Purchases & subscriptions in real time</p>
      </div>
      <div className="max-h-[280px] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
        {purchases.length === 0 && (
          <p className="text-center text-gray-400 py-8 text-sm">No live purchases yet</p>
        )}
        {purchases.map((p, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3 text-sm hover:bg-emerald-500/5">
            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium capitalize">{p.kind || 'purchase'}</div>
              <div className="text-xs text-gray-500 truncate">
                {p.label || p.userId || p.visitorId || '—'}
                {p.country ? ` · ${p.country}` : ''}
              </div>
            </div>
            {p.value > 0 && (
              <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatCurrency(p.value)}
              </span>
            )}
            <span className="text-[10px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {p.at ? new Date(p.at).toLocaleTimeString() : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
