import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import VirtualList from './VirtualList';

const STATUS_COLORS = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
};

function StatusDot({ status }) {
  return (
    <span
      className={`inline-flex h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[status] || 'bg-gray-400'} ${status === 'active' ? 'animate-pulse' : ''}`}
      title={status === 'idle' ? 'Idle' : 'Active'}
    />
  );
}

function displayName(row) {
  if (row.userName) return row.userName;
  if (row.userEmail) return row.userEmail.split('@')[0];
  if (row.visitorId) return `Visitor ${String(row.visitorId).slice(-6)}`;
  return 'Anonymous';
}

function displayPlan(row) {
  const plan = row.subscriptionPlan || row.planTier;
  if (!plan) return '—';
  return String(plan).replace(/_/g, ' ');
}

function displayLocation(row) {
  const parts = [row.city, row.region, row.country].filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return row.country || '—';
}

function displayEmail(row) {
  return row.userEmail || '—';
}

function displayIp(row) {
  return row.ipAddress || row.ipMasked || '—';
}

const VisitorRow = memo(function VisitorRow({ row, onSelect }) {
  const name = displayName(row);
  const plan = displayPlan(row);
  const ip = displayIp(row);
  const location = displayLocation(row);
  const email = displayEmail(row);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(row)}
      className="w-full text-left border-b border-gray-100 dark:border-slate-800/80 hover:bg-gray-50/90 dark:hover:bg-slate-800/40 transition-colors group"
    >
      {/* Desktop / tablet table row */}
      <div className="hidden md:grid md:grid-cols-[auto_minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] md:items-center md:gap-3 px-4 py-3">
        <StatusDot status={row.liveStatus} />
        <span className="truncate font-medium text-sm text-gray-900 dark:text-gray-100" title={name}>{name}</span>
        <span className="truncate text-sm text-gray-600 dark:text-gray-300 capitalize" title={plan}>{plan}</span>
        <span className="truncate font-mono text-xs text-gray-500 dark:text-gray-400" title={ip}>{ip}</span>
        <span className="truncate text-sm text-gray-600 dark:text-gray-300" title={location}>{location}</span>
        <span className="truncate text-sm text-gray-600 dark:text-gray-300" title={email}>{email}</span>
        <ChevronRight className="w-4 h-4 shrink-0 text-gray-300 group-hover:text-indigo-500 dark:group-hover:text-indigo-400" />
      </div>

      {/* Mobile compact card row */}
      <div className="md:hidden px-4 py-3 flex items-start gap-3">
        <div className="pt-1.5">
          <StatusDot status={row.liveStatus} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{name}</span>
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 capitalize">
              {plan}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{email}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono truncate max-w-[45%]">{ip}</span>
            <span className="truncate">{location}</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 mt-1 text-gray-300 group-hover:text-indigo-500" />
      </div>
    </button>
  );
});

export default function ActiveVisitorTable({ visitors = [], pagination = null, onSelectVisitor }) {
  const rowHeight = 72;
  const total = pagination?.total ?? visitors.length;
  const loaded = pagination?.loaded ?? visitors.length;
  const showingTruncated = total > loaded;

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-900/60 backdrop-blur overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800">
        <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Active Visitors</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {showingTruncated
            ? `Showing ${loaded.toLocaleString()} of ${total.toLocaleString()} in window`
            : `${total.toLocaleString()} session${total === 1 ? '' : 's'} in window`}
          {' · '}
          tap a visitor for full details
        </p>
      </div>

      <div className="hidden md:grid md:grid-cols-[auto_minmax(0,1.15fr)_minmax(0,0.75fr)_minmax(0,0.95fr)_minmax(0,1fr)_minmax(0,1.15fr)_auto] md:items-center md:gap-3 px-4 py-2.5 bg-gray-50/90 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400">
        <span aria-hidden="true" className="w-2" />
        <span>Name</span>
        <span>Plan</span>
        <span>IP address</span>
        <span>Location</span>
        <span>Email</span>
        <span aria-hidden="true" className="w-4" />
      </div>

      {visitors.length === 0 ? (
        <p className="text-center text-gray-400 dark:text-gray-500 py-16 text-sm">No visitors in the selected window</p>
      ) : (
        <VirtualList
          items={visitors}
          rowHeight={rowHeight}
          height={Math.min(560, Math.max(280, visitors.length * rowHeight))}
          renderRow={(row) => <VisitorRow row={row} onSelect={onSelectVisitor} />}
          getKey={(row) => row.sessionId}
        />
      )}
    </div>
  );
}
