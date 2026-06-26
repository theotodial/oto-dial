import { useMemo, useState } from 'react';
import {
  Eye, LogIn, UserPlus, CreditCard, Phone, MessageSquare,
  AlertCircle, ShoppingBag, Radio, Search, Pause, Play
} from 'lucide-react';

const EVENT_META = {
  pageview: { icon: Eye, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  signup: { icon: UserPlus, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  subscription: { icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  purchase: { icon: ShoppingBag, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  call: { icon: Phone, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  sms: { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  login: { icon: LogIn, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  error: { icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  default: { icon: Radio, color: 'text-cyan-500', bg: 'bg-cyan-500/10' }
};

function metaFor(kind) {
  const k = String(kind || '').toLowerCase();
  if (k.includes('signup')) return EVENT_META.signup;
  if (k.includes('subscription') || k.includes('purchase')) return EVENT_META.purchase;
  if (k.includes('call')) return EVENT_META.call;
  if (k.includes('sms')) return EVENT_META.sms;
  if (k.includes('login')) return EVENT_META.login;
  if (k.includes('error')) return EVENT_META.error;
  if (k === 'pageview') return EVENT_META.pageview;
  return EVENT_META[k] || EVENT_META.default;
}

export default function LiveEventFeed({ events = [] }) {
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let rows = events;
    if (filter) rows = rows.filter((e) => String(e.kind || '').includes(filter));
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e) =>
        [e.kind, e.label, e.visitorId, e.sessionId, e.country, e.page]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return rows;
  }, [events, filter, search]);

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur flex flex-col h-full min-h-[320px]">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Live Event Stream</h3>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border hover:bg-gray-50 dark:hover:bg-slate-800"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg border bg-transparent dark:border-slate-700"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs rounded-lg border px-2 dark:border-slate-700 bg-transparent"
          >
            <option value="">All</option>
            <option value="pageview">Pageviews</option>
            <option value="signup">Signups</option>
            <option value="purchase">Purchases</option>
            <option value="call">Calls</option>
            <option value="sms">SMS</option>
            <option value="error">Errors</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[400px]">
        {(paused ? filtered.slice(0, 30) : filtered).map((e, i) => {
          const meta = metaFor(e.kind);
          const Icon = meta.icon;
          return (
            <div
              key={`${e.at}-${i}`}
              className="flex items-start gap-2 p-2 rounded-xl hover:bg-gray-50/80 dark:hover:bg-slate-800/40 text-xs"
            >
              <span className={`p-1.5 rounded-lg ${meta.bg}`}>
                <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold capitalize">{e.kind}</span>
                  {e.label && <span className="text-gray-500 truncate">{e.label}</span>}
                </div>
                <div className="text-[10px] text-gray-400 flex gap-2 flex-wrap">
                  {e.country && <span>{e.country}</span>}
                  {e.visitorId && <span className="font-mono">…{String(e.visitorId).slice(-6)}</span>}
                </div>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">
                {e.at ? new Date(e.at).toLocaleTimeString() : ''}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8">Waiting for live events…</p>
        )}
      </div>
    </div>
  );
}
